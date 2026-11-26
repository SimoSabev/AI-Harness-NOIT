from dataclasses import dataclass

from shop.money import add_cents, mul_cents


@dataclass(frozen=True)
class Item:
    sku: str
    price_cents: int
    qty: int


# 10% off (rounded down to a whole cent) when the subtotal is strictly over 50 EUR.
DISCOUNT_THRESHOLD_CENTS = 50000


def subtotal_cents(items: list[Item]) -> int:
    subtotal = 0
    for item in items:
        if item.qty < 0 or item.price_cents < 0:
            raise ValueError(f"invalid item {item.sku}")
        subtotal = add_cents(subtotal, mul_cents(item.price_cents, item.qty))
    return subtotal


def discount_cents(subtotal: int) -> int:
    if subtotal > DISCOUNT_THRESHOLD_CENTS:
        return subtotal // 10
    return 0


def total_cents(items: list[Item]) -> int:
    subtotal = subtotal_cents(items)
    return subtotal - discount_cents(subtotal)
