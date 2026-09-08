## 1. Scaffolding

- [x] 1.1 Create `app/src/discounts.ts` exporting `PriceBreakdown` and
      `priceOrder(order, catalog)` per the contract in
      `docs/spec/pricing-discounts.md` section 5; verify `npm run typecheck`
      passes with the new (unimplemented-body) signatures in place.
- [x] 1.2 Create `app/src/discounts.test.ts` importing `priceOrder` and the
      fixture helpers already used in `pricing.test.ts`; verify `npm test`
      picks up the new empty test file with zero failures.

## 2. Eligibility resolution (raw-value pass)

- [x] 2.1 Implement coupon lookup against `catalog` plus expiry and
      duplicate-code filtering (spec: "Expired, unknown, and duplicate
      coupon codes are silently dropped"); verify with AC-4, AC-10, AC-11
      tests.
- [x] 2.2 Implement `minSubtotalKopecks` eligibility check against the raw
      `subtotalKopecks` (spec: "Minimum-subtotal eligibility is checked
      against the raw order subtotal"); verify with AC-6.
- [x] 2.3 Implement same-category conflict resolution, keeping only the
      most beneficial coupon per category (spec: "Only the most beneficial
      coupon applies per category"); verify with AC-3.

## 3. Discount application (sequential pass)

- [x] 3.1 Implement the shared `roundHalfUp` helper and use it for every
      computed discount amount (spec: "Every rounded amount rounds half
      up"); verify with AC-8.
- [x] 3.2 Implement tier discount from the raw subtotal (spec: "Tier
      discount applies first"); verify with AC-1.
- [x] 3.3 Implement sequential coupon application over the running balance,
      including category-restricted bases computed from raw category sums
      (spec: "Coupons apply sequentially" and "A category-restricted
      coupon's discount is based only on that category's lines"); verify
      with AC-2 and AC-7.
- [x] 3.4 Implement the non-negative floor per application step (spec:
      "Discounted goods total never goes negative"); verify with AC-5.
- [x] 3.5 Assemble the final `PriceBreakdown` (`goodsTotalKopecks`,
      `shippingKopecks` via the existing `shippingKopecks` from
      `pricing.ts`, `totalKopecks`); verify with AC-9 (empty order).

## 4. Traceability and full-suite verification

- [x] 4.1 Write one test per AC-1..AC-11 in `discounts.test.ts`, named after
      its AC id, and fill `docs/traceability.md` mapping each AC to its
      test and implementation location.
- [x] 4.2 Run the reverse check from `docs/traceability.md` (code with no
      AC, AC with no test, test with no AC) and resolve any gap found.
- [x] 4.3 Run `cd app && npm test` and `npm run typecheck`; verify both are
      green, including the 8 pre-existing `pricing.test.ts` tests.
