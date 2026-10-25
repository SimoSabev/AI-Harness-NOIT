/** Formats integer cents as "12.34 EUR" ("-12.34 EUR" for negatives, "0.00 EUR" for zero). */
export function formatCents(c) {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const euros = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${euros}.${cents} EUR`;
}

/** "12.34" → 1234, "12" → 1200. Anything else → RangeError. */
export function parseEuros(s) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`not a euro amount: ${s}`);
  const negative = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function addCents(a, b) {
  return a + b;
}

/** qty must be a whole number ≥ 0. */
export function mulCents(c, qty) {
  if (!Number.isInteger(qty) || qty < 0) throw new RangeError(`invalid qty: ${qty}`);
  return c * qty;
}
