// Discount engine, built from docs/spec/pricing-discounts.md. Plugs in
// alongside pricing.ts — reuses its (protected) subtotal/shipping/tier
// functions rather than re-deriving them.

import type { Order, Coupon, LineItem } from "./types.js";
import { subtotalKopecks, shippingKopecks, tierPercent } from "./pricing.js";

export interface PriceBreakdown {
  /** Raw sum of goods, before any discount. */
  subtotalKopecks: number;
  /** Loyalty-tier discount, in kopecks. */
  tierDiscountKopecks: number;
  /** Sum of every applied coupon's discount, in kopecks. */
  couponDiscountKopecks: number;
  /** Coupon codes that actually applied, in application order. */
  appliedCoupons: string[];
  /** subtotalKopecks - tierDiscountKopecks - couponDiscountKopecks, floored at 0. */
  goodsTotalKopecks: number;
  /** Unchanged from pricing.ts — shipping is never discounted. */
  shippingKopecks: number;
  /** goodsTotalKopecks + shippingKopecks. */
  totalKopecks: number;
}

/** D-4: half a kopeck rounds up. Only ever called with non-negative amounts. */
function roundHalfUp(amount: number): number {
  return Math.floor(amount + 0.5);
}

function categorySubtotalKopecks(order: Order, category: LineItem["category"]): number {
  return order.items
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.unitPriceKopecks * item.quantity, 0);
}

function couponAmountKopecks(coupon: Coupon, base: number): number {
  const raw = coupon.kind === "percent" ? (base * coupon.value) / 100 : coupon.value;
  return Math.min(roundHalfUp(raw), base);
}

/** D-6/D-8/D-9/D-10: keep codes that exist, aren't expired, and are typed once. */
function resolveEligibleCoupons(order: Order, catalog: Coupon[], rawSubtotal: number): Coupon[] {
  const now = new Date();
  const seen = new Set<string>();
  const eligible: Coupon[] = [];
  for (const code of order.coupons) {
    if (seen.has(code)) continue;
    seen.add(code);
    const coupon = catalog.find((c) => c.code === code);
    if (!coupon) continue;
    if (new Date(coupon.expiresAt).getTime() <= now.getTime()) continue;
    if (coupon.minSubtotalKopecks !== undefined && rawSubtotal < coupon.minSubtotalKopecks) continue;
    eligible.push(coupon);
  }
  return eligible;
}

/** D-3: at most one coupon per contested category — the most beneficial one. */
function resolveCategoryConflicts(order: Order, eligible: Coupon[]): Coupon[] {
  const byCategory = new Map<string, Coupon[]>();
  for (const coupon of eligible) {
    if (!coupon.category) continue;
    const group = byCategory.get(coupon.category) ?? [];
    group.push(coupon);
    byCategory.set(coupon.category, group);
  }

  const losers = new Set<string>();
  for (const [category, group] of byCategory) {
    if (group.length < 2) continue;
    const base = categorySubtotalKopecks(order, category as LineItem["category"]);
    const best = group.reduce((a, b) =>
      couponAmountKopecks(b, base) > couponAmountKopecks(a, base) ? b : a,
    );
    for (const candidate of group) {
      if (candidate !== best) losers.add(candidate.code);
    }
  }

  return eligible.filter((coupon) => !losers.has(coupon.code));
}

export function priceOrder(order: Order, catalog: Coupon[]): PriceBreakdown {
  const rawSubtotal = subtotalKopecks(order);
  const eligible = resolveCategoryConflicts(order, resolveEligibleCoupons(order, catalog, rawSubtotal));

  let remaining = rawSubtotal;

  const tierDiscountKopecks = Math.min(
    roundHalfUp((rawSubtotal * tierPercent(order)) / 100),
    remaining,
  );
  remaining -= tierDiscountKopecks;

  let couponDiscountKopecks = 0;
  const appliedCoupons: string[] = [];
  for (const coupon of eligible) {
    // D-5/D-13: category base is raw and fixed; an unrestricted coupon's
    // base is D-1's running balance, so coupons stack sequentially.
    const base = coupon.category ? categorySubtotalKopecks(order, coupon.category) : remaining;
    const amount = Math.min(couponAmountKopecks(coupon, base), remaining);
    remaining -= amount;
    couponDiscountKopecks += amount;
    appliedCoupons.push(coupon.code);
  }

  const shipping = shippingKopecks(order);
  return {
    subtotalKopecks: rawSubtotal,
    tierDiscountKopecks,
    couponDiscountKopecks,
    appliedCoupons,
    goodsTotalKopecks: remaining,
    shippingKopecks: shipping,
    totalKopecks: remaining + shipping,
  };
}
