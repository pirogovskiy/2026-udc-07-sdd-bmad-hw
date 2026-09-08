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

/**
 * D-4: baseKopecks * percentValue / 100, rounded half up. Done with BigInt
 * so the multiply-then-divide never drifts on a floating-point .5
 * boundary — `(1000 * 16.15) / 100` alone can land a hair under 161.5 in
 * IEEE754 and round down to 161 instead of the mathematically correct 162.
 *
 * D-14: percentValue carries at most 2 decimal places (hundredths of a
 * percent, per the Coupon.value contract in types.ts). We parse the string
 * representation rather than scale-then-round the float, to avoid another
 * IEEE754 boundary case: `(1.005) * 100` yields 100.49999..., which rounds
 * to 100 instead of 101. Parsing "1.005" as a string gives us exactly 1005
 * hundredths, which correctly becomes 1.01% when rounded to 2 decimals.
 */
function percentOfKopecks(baseKopecks: number, percentValue: number): number {
  // Parse string to avoid float scaling bugs on boundaries like 1.005 → 100.49999
  const str = String(percentValue); // "16.1549" → "16.1549", avoids IEEE754 rounding
  const parts = str.split(".");
  let hundredthsOfPercent: bigint;
  const integerPart = parts[0] ?? "0";
  if (parts[1]) {
    const decimalPart = parts[1].slice(0, 2).padEnd(2, "0"); // "005" → "00", "15" → "15"
    const rawValue = BigInt(integerPart) * 100n + BigInt(decimalPart); // "1" + "00" = 100; "1" + "01" = 101
    // Now round the third decimal place if it exists: check parts[1][2]
    const thirdDecimal = parts[1][2] ? parseInt(parts[1][2]) : 0;
    hundredthsOfPercent = rawValue + (thirdDecimal >= 5 ? 1n : 0n);
  } else {
    hundredthsOfPercent = BigInt(integerPart) * 100n;
  }
  const denominator = 10_000n; // 100 (percent) * 100 (scale)
  const numerator = BigInt(baseKopecks) * hundredthsOfPercent;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(quotient) + (remainder * 2n >= denominator ? 1 : 0);
}

function categorySubtotalKopecks(order: Order, category: LineItem["category"]): number {
  return order.items
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.unitPriceKopecks * item.quantity, 0);
}

function couponAmountKopecks(coupon: Coupon, base: number): number {
  const raw = coupon.kind === "percent" ? percentOfKopecks(base, coupon.value) : coupon.value;
  return Math.min(raw, base);
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
    percentOfKopecks(rawSubtotal, tierPercent(order)),
    remaining,
  );
  remaining -= tierDiscountKopecks;

  let couponDiscountKopecks = 0;
  const appliedCoupons: string[] = [];
  for (const coupon of eligible) {
    // D-5/D-13: category base is raw and fixed; an unrestricted coupon's
    // base is D-1's running balance, so coupons stack sequentially.
    const base = coupon.category ? categorySubtotalKopecks(order, coupon.category) : remaining;
    if (base === 0) continue; // skip category coupons with no matching items
    const amount = Math.min(couponAmountKopecks(coupon, base), remaining);
    if (amount === 0) continue; // skip coupons with zero computed discount
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
