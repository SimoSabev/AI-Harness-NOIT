# Architecture

The shop is a small TypeScript library with no framework: every module is pure functions over plain data, so the
whole of it is tested without a network or a database.

```
api (routes) ──► cart ──► catalog
     │            │
     ▼            ▼
   orders ◄── discounts
     │
     ▼
  payments ──► PaymentGateway (the card processor; a fake in tests)
```

- **catalog**: the product list, allergens and the search the shop's page calls.
- **cart**: a cart never changes in place; `addItem` returns a new cart. At most 50 of one product.
- **discounts**: one rule today (10% over 50 €). New promotions go here.
- **orders**: `placeOrder` freezes the totals; `advance` moves the status only forward
  (placed → paid → baking → out for delivery → delivered, or cancelled before baking).
- **delivery**: two slots a day, the 18:00 cutoff, closed on Sundays.
- **payments**: the only place that talks to the card processor, behind `PaymentGateway`.

## Decisions
- Cents, not floats (rounding bugs in the old shop cost real money).
- No ORM and no server framework in the core; the hosting layer is thin and stays outside this repository.
- Every business rule has a test named after the rule.
