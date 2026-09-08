import { describe, it, expect } from "vitest";
import { priceOrder } from "./discounts.js";
import type { Order, LineItem, Coupon } from "./types.js";

// Amounts are whole kopecks. 25_000 = 250 грн.
const item = (over: Partial<LineItem> = {}): LineItem => ({
  sku: "AA-1",
  name: "Thing",
  unitPriceKopecks: 25_000,
  quantity: 1,
  category: "standard",
  ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  items: [item()],
  country: "UA",
  customerTier: "none",
  coupons: [],
  ...over,
});

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "SAVE10",
  kind: "percent",
  value: 10,
  expiresAt: "2999-01-01T00:00:00.000Z",
  ...over,
});

describe("priceOrder", () => {
  it("AC-1: gold tier discount with no coupons", () => {
    const o = order({ customerTier: "gold", items: [item({ unitPriceKopecks: 100_000 })] });
    const result = priceOrder(o, []);
    expect(result.tierDiscountKopecks).toBe(10_000);
    expect(result.goodsTotalKopecks).toBe(90_000);
    expect(result.appliedCoupons).toEqual([]);
    expect(result.totalKopecks).toBe(94_900);
  });

  it("AC-2: silver tier plus one unrestricted percent coupon apply sequentially", () => {
    const save15 = coupon({ code: "SAVE15", value: 15 });
    const o = order({
      customerTier: "silver",
      items: [item({ unitPriceKopecks: 100_000 })],
      coupons: ["SAVE15"],
    });
    const result = priceOrder(o, [save15]);
    expect(result.tierDiscountKopecks).toBe(5_000);
    expect(result.couponDiscountKopecks).toBe(14_250);
    expect(result.appliedCoupons).toEqual(["SAVE15"]);
    expect(result.goodsTotalKopecks).toBe(80_750);
  });

  it("AC-3: two coupons on the same category — only the most beneficial applies", () => {
    const fresh20 = coupon({ code: "FRESH20", value: 20, category: "fresh" });
    const fresh30 = coupon({ code: "FRESH30", value: 30, category: "fresh" });
    const o = order({
      items: [
        item({ unitPriceKopecks: 40_000, category: "fresh" }),
        item({ unitPriceKopecks: 60_000, category: "standard" }),
      ],
      coupons: ["FRESH20", "FRESH30"],
    });
    const result = priceOrder(o, [fresh20, fresh30]);
    expect(result.appliedCoupons).toEqual(["FRESH30"]);
    expect(result.couponDiscountKopecks).toBe(12_000);
    expect(result.goodsTotalKopecks).toBe(88_000);
  });

  it("AC-4: an expired coupon is silently ignored", () => {
    const expired = coupon({ code: "EXPIRED10", value: 50, expiresAt: "2020-01-01T00:00:00.000Z" });
    const o = order({
      items: [item({ unitPriceKopecks: 50_000 })],
      coupons: ["EXPIRED10"],
    });
    const result = priceOrder(o, [expired]);
    expect(result.appliedCoupons).toEqual([]);
    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.goodsTotalKopecks).toBe(50_000);
  });

  it("AC-5 (граничний): a fixed coupon larger than the order is capped, goods total floors at 0", () => {
    const big = coupon({ code: "BIG150", kind: "fixed", value: 15_000 });
    const o = order({
      items: [item({ unitPriceKopecks: 10_000 })],
      coupons: ["BIG150"],
    });
    const result = priceOrder(o, [big]);
    expect(result.couponDiscountKopecks).toBe(10_000);
    expect(result.goodsTotalKopecks).toBe(0);
    expect(result.totalKopecks).toBe(result.shippingKopecks);
  });

  it("AC-6: minSubtotalKopecks eligibility is checked against the raw subtotal, not the post-tier balance", () => {
    const minCoupon = coupon({ code: "MIN95", value: 10, minSubtotalKopecks: 95_000 });
    const o = order({
      customerTier: "gold",
      items: [item({ unitPriceKopecks: 100_000 })],
      coupons: ["MIN95"],
    });
    const result = priceOrder(o, [minCoupon]);
    expect(result.tierDiscountKopecks).toBe(10_000);
    expect(result.appliedCoupons).toEqual(["MIN95"]);
    expect(result.couponDiscountKopecks).toBe(9_000);
    expect(result.goodsTotalKopecks).toBe(81_000);
  });

  it("AC-7: a category-restricted coupon's base is only that category's raw subtotal", () => {
    const freshCoupon = coupon({ code: "FRESH10", value: 10, category: "fresh" });
    const o = order({
      items: [
        item({ unitPriceKopecks: 30_000, category: "fresh" }),
        item({ unitPriceKopecks: 70_000, category: "standard" }),
      ],
      coupons: ["FRESH10"],
    });
    const result = priceOrder(o, [freshCoupon]);
    expect(result.couponDiscountKopecks).toBe(3_000);
    expect(result.goodsTotalKopecks).toBe(97_000);
  });

  it("AC-8 (граничний, округлення): exactly half a kopeck rounds up", () => {
    const half = coupon({ code: "HALF50", value: 50 });
    const o = order({
      items: [item({ unitPriceKopecks: 15, quantity: 1 })],
      coupons: ["HALF50"],
    });
    const result = priceOrder(o, [half]);
    expect(result.couponDiscountKopecks).toBe(8);
    expect(result.goodsTotalKopecks).toBe(7);
  });

  it("regression: a fractional percent does not drift on a float boundary (1000 × 16.15% = 162, not 161)", () => {
    const fractional = coupon({ code: "FRACTIONAL", value: 16.15 });
    const o = order({
      items: [item({ unitPriceKopecks: 1_000 })],
      coupons: ["FRACTIONAL"],
    });
    const result = priceOrder(o, [fractional]);
    expect(result.couponDiscountKopecks).toBe(162);
  });

  it("AC-9 (граничний, порожнє замовлення): an item-less order yields zero discounts and zero shipping", () => {
    const minCoupon = coupon({ code: "MIN95", value: 10, minSubtotalKopecks: 95_000 });
    const o = order({ items: [], coupons: ["MIN95"] });
    const result = priceOrder(o, [minCoupon]);
    expect(result.subtotalKopecks).toBe(0);
    expect(result.tierDiscountKopecks).toBe(0);
    expect(result.appliedCoupons).toEqual([]);
    expect(result.goodsTotalKopecks).toBe(0);
    expect(result.shippingKopecks).toBe(0);
    expect(result.totalKopecks).toBe(0);
  });

  it("AC-10: a coupon code missing from the catalog is silently ignored", () => {
    const o = order({
      items: [item({ unitPriceKopecks: 20_000 })],
      coupons: ["GHOST"],
    });
    const result = priceOrder(o, []);
    expect(result.appliedCoupons).toEqual([]);
    expect(result.goodsTotalKopecks).toBe(20_000);
  });

  it("AC-10: coupon code matching is exact and case-sensitive (catalog SAVE10, typed save10)", () => {
    const save10 = coupon({ code: "SAVE10", value: 10 });
    const o = order({
      items: [item({ unitPriceKopecks: 20_000 })],
      coupons: ["save10"],
    });
    const result = priceOrder(o, [save10]);
    expect(result.appliedCoupons).toEqual([]);
    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.goodsTotalKopecks).toBe(20_000);
  });

  it("AC-11: the same coupon code entered twice applies only once", () => {
    const save10 = coupon({ code: "SAVE10", value: 10 });
    const o = order({
      items: [item({ unitPriceKopecks: 50_000 })],
      coupons: ["SAVE10", "SAVE10"],
    });
    const result = priceOrder(o, [save10]);
    expect(result.appliedCoupons).toEqual(["SAVE10"]);
    expect(result.couponDiscountKopecks).toBe(5_000);
    expect(result.goodsTotalKopecks).toBe(45_000);
  });

  it("AC-12: a percent value with more than two decimal places rounds to the nearest hundredth before applying", () => {
    const precise = coupon({ code: "PRECISE", value: 16.151 });
    const rounded = coupon({ code: "ROUNDED", value: 16.15 });
    const o = (coupons: string[]) => order({ items: [item({ unitPriceKopecks: 1_000 })], coupons });
    const preciseResult = priceOrder(o(["PRECISE"]), [precise]);
    const roundedResult = priceOrder(o(["ROUNDED"]), [rounded]);
    expect(preciseResult.couponDiscountKopecks).toBe(162);
    expect(preciseResult.couponDiscountKopecks).toBe(roundedResult.couponDiscountKopecks);
  });

  it("boundary: 1.005% (IEEE754 float boundary) rounds to 1.01% giving 51 cents on 5000 cents", () => {
    const boundary = coupon({ code: "BOUNDARY", value: 1.005 });
    const o = order({ items: [item({ unitPriceKopecks: 5_000 })], coupons: ["BOUNDARY"] });
    const result = priceOrder(o, [boundary]);
    expect(result.couponDiscountKopecks).toBe(51); // 1.01% of 5000 = 50.5 → rounds to 51
  });

  it("boundary: 1.015% rounds to 1.02% giving 51 cents on 5000 cents", () => {
    const boundary = coupon({ code: "BOUNDARY", value: 1.015 });
    const o = order({ items: [item({ unitPriceKopecks: 5_000 })], coupons: ["BOUNDARY"] });
    const result = priceOrder(o, [boundary]);
    expect(result.couponDiscountKopecks).toBe(51); // 1.015% rounds to 1.02%, 1.02% of 5000 = 51
  });

  it("boundary: 16.1549% rounds to 16.15% giving 1615 kopecks (162 when base 1000)", () => {
    const precise = coupon({ code: "PRECISE1549", value: 16.1549 });
    const o = order({ items: [item({ unitPriceKopecks: 1_000 })], coupons: ["PRECISE1549"] });
    const result = priceOrder(o, [precise]);
    expect(result.couponDiscountKopecks).toBe(162); // 16.1549% rounds to 16.15%, 16.15% of 1000 = 161.5 → 162
  });
});
