## Why

Loyalty tiers (`tierPercent`) exist in the codebase but are never applied, and
there is no way to apply promo codes at all. `docs/spec/pricing-discounts.md`
(status: agreed) already resolved every ambiguity from the original business
ticket (`materials/feature-request.md`) — stacking order, rounding, multiple
coupons on one category, minimum-subtotal timing, negative-total floor, etc.
This change turns that agreed specification into a discount engine.

## What Changes

- Add a new pure function `priceOrder(order, catalog)` that composes the
  existing `subtotalKopecks` / `shippingKopecks` / `tierPercent` with a new
  discount calculation, returning a `PriceBreakdown`.
- Apply the tier discount first (from the raw goods subtotal), then apply
  each valid, applicable coupon in the order the customer typed it,
  sequentially reducing the remaining goods balance.
- Resolve conflicting same-category coupons by keeping only the most
  beneficial one; drop expired, unknown, and duplicate coupon codes silently
  (no exceptions).
- Round every individual discount amount (tier, each coupon) to the nearest
  kopeck, half rounding up, at the moment it is computed.
- Floor the discounted goods total at 0; shipping is never discounted.
- No changes to `pricing.ts` or `types.ts` — this only adds a new module that
  consumes their existing, protected signatures.

## Capabilities

### New Capabilities
- `discounts`: loyalty-tier and promo-code discount calculation for an order,
  as specified in `docs/spec/pricing-discounts.md` (AC-1..AC-11).

### Modified Capabilities
(none — `pricing.ts` behaviour and signatures are unchanged)

## Impact

- New file `app/src/discounts.ts` (implementation) and
  `app/src/discounts.test.ts` (tests named after AC ids), added in Task C.
- No impact on `app/src/pricing.ts`, `app/src/types.ts`, or existing tests.
- No new runtime dependencies.
