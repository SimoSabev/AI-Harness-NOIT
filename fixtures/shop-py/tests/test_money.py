import pytest

from shop.money import add_cents, format_cents, mul_cents, parse_euros


@pytest.mark.parametrize(("cents", "text"), [(1234, "12.34 EUR"), (0, "0.00 EUR"), (-1234, "-12.34 EUR")])
def test_formats_cents_as_euros(cents, text):
    assert format_cents(cents) == text


def test_parses_euros_string():
    assert parse_euros("12.34") == 1234


def test_parses_integer_euros():
    assert parse_euros("12") == 1200


def test_rejects_invalid_string():
    with pytest.raises(ValueError):
        parse_euros("12,34")


def test_adds_cents():
    assert add_cents(150, 275) == 425


def test_multiplies_cents_by_qty():
    assert mul_cents(250, 3) == 750
