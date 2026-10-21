// 10% off (rounded down to a whole cent) when the subtotal is strictly over 50 EUR.
const DISCOUNT_THRESHOLD_CENTS = 50000;

function discountCents(subtotal) {
  if (subtotal > DISCOUNT_THRESHOLD_CENTS) return Math.floor(subtotal / 10);
  return 0;
}

module.exports = { discountCents };
