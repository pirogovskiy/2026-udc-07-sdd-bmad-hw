## Purpose

Calculates the final price of an order after applying the customer's
loyalty-tier discount and any valid promo codes, deterministically and
without kopeck drift, per `docs/spec/pricing-discounts.md`.

## ADDED Requirements

### Requirement: Tier discount applies first, from the raw goods subtotal
The system SHALL compute a tier discount from the order's raw
`subtotalKopecks` (before any coupon is considered), using the customer's
`tierPercent`, rounded to the nearest kopeck (half rounds up).

#### Scenario: Gold customer, no coupons
- **WHEN** an order subtotal is 100 000 kopecks and `customerTier` is `gold`
- **THEN** the tier discount is 10 000 kopecks and the goods total after tier
  discount is 90 000 kopecks

### Requirement: Coupons apply sequentially, in the order the customer typed them
After the tier discount, the system SHALL apply each valid, applicable
coupon one at a time, in the order its code appears in `order.coupons`, each
computed against the remaining goods balance left by the previous step.

#### Scenario: Silver tier plus one unrestricted percent coupon
- **WHEN** an order subtotal is 100 000 kopecks, `customerTier` is `silver`
  (5%), and a valid 15%-off coupon with no restrictions is applied
- **THEN** the tier discount is 5 000 kopecks, the coupon discount is 14 250
  kopecks (15% of the 95 000 remaining after tier), and the goods total is
  80 750 kopecks

### Requirement: Expired, unknown, and duplicate coupon codes are silently dropped
The system SHALL NOT throw when `order.coupons` contains a code that is
expired (`expiresAt` at or before now), not present in the supplied catalog,
or a duplicate of an already-applied code. Such codes SHALL be excluded from
`appliedCoupons` and MUST NOT affect the discount total.

#### Scenario: One expired coupon among the inputs
- **WHEN** the only coupon supplied has an `expiresAt` in the past
- **THEN** `appliedCoupons` is empty and the goods total equals the subtotal
  minus only the tier discount

#### Scenario: Coupon code not present in the catalog
- **WHEN** `order.coupons` contains a code with no matching entry in the
  supplied coupon catalog
- **THEN** that code is excluded from `appliedCoupons` and does not affect
  the total, with no exception raised

#### Scenario: Same code entered twice
- **WHEN** `order.coupons` is `["SAVE10", "SAVE10"]` and `SAVE10` is a valid
  10%-off coupon
- **THEN** the discount is applied exactly once, not twice

### Requirement: Only the most beneficial coupon applies per category
When two or more valid, applicable coupons target the same item category,
the system SHALL apply only the one that yields the largest discount for
that category and SHALL exclude the others from `appliedCoupons`. Coupons
without a `category` restriction never conflict with each other or with
category-restricted coupons.

#### Scenario: Two coupons target the same category
- **WHEN** a 20%-off and a 30%-off coupon both target category `fresh`,
  whose matching line items total 40 000 kopecks
- **THEN** only the 30%-off coupon applies (discount 12 000 kopecks); the
  20%-off coupon is excluded from `appliedCoupons`

### Requirement: A category-restricted coupon's discount is based only on that category's lines
The system SHALL compute a category-restricted coupon's discount from the
sum of the order's line items whose `category` matches the coupon's
`category`, using the raw (pre-discount) line amounts, not the whole order
subtotal.

#### Scenario: Percent coupon restricted to one category
- **WHEN** a 10%-off coupon is restricted to category `fresh`, the order has
  `fresh` items totaling 30 000 kopecks and `standard` items totaling 70 000
  kopecks
- **THEN** the coupon discount is 3 000 kopecks (10% of 30 000), not 10 000
  kopecks (10% of the whole order)

### Requirement: Minimum-subtotal eligibility is checked against the raw order subtotal
The system SHALL compare a coupon's `minSubtotalKopecks` against the order's
raw `subtotalKopecks` (before the tier discount or any coupon is applied),
not against any already-discounted balance.

#### Scenario: Tier discount would drop the balance below the coupon's minimum, but eligibility is unaffected
- **WHEN** the raw order subtotal is 100 000 kopecks, a coupon requires
  `minSubtotalKopecks` of 95 000, and the customer's `gold` tier discount
  would reduce the balance to 90 000 kopecks
- **THEN** the coupon still applies, because eligibility is judged against
  the raw 100 000, not the post-tier 90 000

### Requirement: Discounted goods total never goes negative
The system SHALL cap the combined tier and coupon discount so that the
goods total after discounts is never less than 0. A fixed-amount coupon
whose value exceeds the balance it applies to is reduced to exactly that
balance; the excess is not carried over to other coupons or to shipping.
Shipping is never discounted and is added on top of the (possibly zero)
discounted goods total.

#### Scenario: Fixed coupon larger than the order
- **WHEN** the order subtotal is 10 000 kopecks, there is no tier discount,
  and a fixed 15 000-kopeck coupon with no restrictions is applied
- **THEN** the coupon discount is capped at 10 000 kopecks, the goods total
  is 0, and the final total equals shipping only

### Requirement: Every rounded amount rounds half up, at the point it is computed
The system SHALL round each individual discount amount (the tier discount,
and each coupon's discount) to the nearest whole kopeck at the moment it is
computed, before subtracting it from the running balance. A value that is
exactly half a kopeck SHALL round up.

#### Scenario: Discount computation lands on exactly half a kopeck
- **WHEN** a coupon discount is computed as 7.5 kopecks
- **THEN** the applied discount is 8 kopecks

### Requirement: An empty order produces zero discounts, not an error
The system SHALL handle an order with no line items by returning a zero
subtotal, a zero tier discount, and no applied coupons (any coupon with a
positive `minSubtotalKopecks` fails its eligibility check against a 0
subtotal), without raising an exception.

#### Scenario: Order with no items
- **WHEN** `order.items` is empty
- **THEN** the goods total is 0, `appliedCoupons` is empty, and the overall
  total equals shipping for that order (0, since an item-less order counts
  as all-digital under the existing `shippingKopecks` rule)
