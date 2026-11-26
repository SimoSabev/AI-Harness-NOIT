"""Integer cents. No floats anywhere."""

import re


def format_cents(c: int) -> str:
    """Formats integer cents as "12.34 EUR" ("-12.34 EUR" for negatives, "0.00 EUR" for zero)."""
    sign = "-" if c < 0 else ""
    a = abs(c)
    return f"{sign}{a // 100}.{a % 100:02d} EUR"


def parse_euros(s: str) -> int:
    """ "12.34" -> 1234, "12" -> 1200. Anything else -> ValueError."""
    if not re.fullmatch(r"-?\d+(\.\d{1,2})?", s):
        raise ValueError(f"not a euro amount: {s}")
    negative = s.startswith("-")
    whole, _, frac = s.lstrip("-").partition(".")
    cents = int(whole) * 100 + int(frac.ljust(2, "0"))
    return -cents if negative else cents


def add_cents(a: int, b: int) -> int:
    return a + b


def mul_cents(c: int, qty: int) -> int:
    """qty must be a whole number >= 0."""
    if not isinstance(qty, int) or qty < 0:
        raise ValueError(f"invalid qty: {qty}")
    return c * qty
