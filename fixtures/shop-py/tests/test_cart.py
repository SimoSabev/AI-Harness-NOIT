import pytest

from shop.cart import Item, discount_cents, subtotal_cents, total_cents


class TestCart:
    def test_empty_cart_has_zero_subtotal(self):
        assert subtotal_cents([]) == 0

    def test_subtotal_sums_price_times_qty(self):
        assert subtotal_cents([Item("a", 250, 2), Item("b", 100, 3)]) == 800

    def test_ignores_items_with_qty_0(self):
        assert subtotal_cents([Item("a", 999, 0), Item("b", 100, 1)]) == 100

    def test_rejects_negative_qty(self):
        with pytest.raises(ValueError):
            subtotal_cents([Item("a", 100, -1)])

    def test_rejects_negative_price(self):
        with pytest.raises(ValueError):
            subtotal_cents([Item("a", -100, 1)])

    def test_no_discount_under_50(self):
        assert discount_cents(4999) == 0

    def test_no_discount_at_exactly_50(self):
        assert discount_cents(5000) == 0

    def test_applies_10_percent_over_50(self):
        assert discount_cents(10000) == 1000

    def test_rounds_discount_down_to_whole_cents(self):
        assert discount_cents(60005) == 6000

    def test_total_is_subtotal_minus_discount(self):
        assert total_cents([Item("a", 1000, 3)]) == 3000

    def test_large_cart_total(self):
        assert total_cents([Item("a", 35000, 2)]) == 63000

    def test_discount_is_never_negative(self):
        assert discount_cents(0) >= 0
