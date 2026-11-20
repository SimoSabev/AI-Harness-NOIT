# Bakery shop

The online shop of a small Sofia bakery: customers pick bread, pastry and cakes, choose a delivery slot and pay by
card; the staff see the orders and move them from baking to delivered.

## Layout
| Folder | What is there |
|---|---|
| `src/catalog` | products, allergens, search |
| `src/cart` | the cart and the discount rule |
| `src/orders` | orders, their statuses and the delivery slots |
| `src/payments` | the card gateway interface and a fake for tests |
| `src/api` | the HTTP routes as plain functions |
| `src/shared` | money in cents, dates |
| `tests` | one spec per module |
| `docs` | architecture and the business rules |

## Commands
- `npm install`
- `npm test` — the whole suite (Vitest)
- `npm run typecheck` — TypeScript, no emit

## Rules that must not break
- Money is in integer cents; percentages round half up.
- 10% off orders strictly over 50 €; exactly 50 € gets nothing.
- Delivery is free from 30 €; otherwise 3 €.
- Orders until 18:00 go out the next day; nothing on Sundays.
- A paid order is never charged twice.
