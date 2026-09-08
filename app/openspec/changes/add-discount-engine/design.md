## Context

`app/src/pricing.ts` already provides `subtotalKopecks`, `shippingKopecks`,
and `tierPercent` as pure functions over `Order`/`LineItem` (`app/src/types.ts`).
Those signatures are protected and unchanged by this design. See
`proposal.md` - Why for motivation and `specs/discounts/spec.md` for the
full behavioral contract (AC-1..AC-11 in `docs/spec/pricing-discounts.md`).

## Goals / Non-Goals

**Goals:**
- A single pure function, `priceOrder(order, catalog)`, with no hidden
  state, that produces a `PriceBreakdown` deterministically from its inputs.
- An internal pipeline structure that makes the spec's decision order
  (D-1/D-13: raw bases for eligibility, sequential balance for subtraction)
  mechanically obvious in the code, not just documented.

**Non-Goals:**
- Persisting or rate-limiting coupon usage (out of scope per proposal.md).
- Any change to `pricing.ts` internals or exports.

## Decisions

- **Pipeline shape:** `priceOrder` first resolves the *set* of coupon codes
  that are eligible (not expired, present in `catalog`, deduplicated, and
  category-conflict-resolved to at most one per category) using only raw,
  pre-discount values (`subtotalKopecks`, per-category raw sums). Only after
  that set is fixed does it run a second pass that folds tier discount then
  each eligible coupon, in typed order, over a running `remaining` balance.
  Alternative considered: resolve eligibility and apply in a single pass —
  rejected because it would tangle "is this coupon allowed" (a pure
  function of the raw order) with "how much does it currently save" (a
  function of application order), which is exactly the ambiguity D-13 in
  the spec exists to prevent.
- **Rounding helper:** a single `roundHalfUp(kopecks: number): number`
  helper (`Math.floor(x + 0.5)` for non-negative inputs) is used everywhere
  a discount amount is produced, so there is exactly one place the D-4
  rounding rule lives.
- **Category conflict resolution:** group eligible category-restricted
  coupons by `category`, compute each candidate's discount against that
  category's raw sum, keep only the max per group. Coupons without a
  `category` are never grouped (they cannot conflict).
- **Floor at zero:** each application step clamps
  `remaining = Math.max(0, remaining - roundHalfUp(amount))`, which
  mechanically satisfies both "capped at the balance" (D-11) and "never
  negative" (D-7) without a separate final clamp.

## Risks / Trade-offs

- [Two-pass structure adds a small amount of code vs. a single loop] →
  Accepted: the spec's own ambiguity list (D-13) makes correctness on this
  point more valuable than brevity; tests in Task C pin the behavior.
- [`roundHalfUp` only needs to handle non-negative kopeck amounts here —
  a general half-up rounder for negative inputs is not implemented] →
  Acceptable: no path in this spec ever rounds a negative amount.
