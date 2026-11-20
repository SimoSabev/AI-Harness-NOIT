/** Money is kept in euro cents (integers) everywhere; never floats. */
export type Cents = number;

export function cents(value: number): Cents {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`not a cent amount: ${value}`);
  return value;
}

/** a percentage of an amount, rounded half up to the cent */
export function percentOf(amount: Cents, percent: number): Cents {
  return Math.floor((amount * percent) / 100 + 0.5);
}

export function sum(amounts: readonly Cents[]): Cents {
  return amounts.reduce((a, b) => a + b, 0);
}

/** "12,50 €" — the shop's display format */
export function formatEur(amount: Cents): string {
  const whole = Math.floor(amount / 100);
  const rest = String(amount % 100).padStart(2, "0");
  return `${whole},${rest} €`;
}
