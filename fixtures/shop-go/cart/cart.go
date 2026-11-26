// Package cart: a cart of items in integer cents.
package cart

import (
	"fmt"

	"example.com/shop/money"
)

// Item is one line of the cart.
type Item struct {
	SKU        string
	PriceCents int64
	Qty        int64
}

// 10% off (rounded down to a whole cent) when the subtotal is strictly over 50 EUR.
const discountThresholdCents = 50000

// Subtotal sums price times qty.
func Subtotal(items []Item) (int64, error) {
	var subtotal int64
	for _, it := range items {
		if it.PriceCents < 0 {
			return 0, fmt.Errorf("invalid item %s", it.SKU)
		}
		line, err := money.Mul(it.PriceCents, it.Qty)
		if err != nil {
			return 0, err
		}
		subtotal = money.Add(subtotal, line)
	}
	return subtotal, nil
}

// Discount is the discount on a subtotal.
func Discount(subtotal int64) int64 {
	if subtotal > discountThresholdCents {
		return subtotal / 10
	}
	return 0
}

// Total is the subtotal minus the discount.
func Total(items []Item) (int64, error) {
	s, err := Subtotal(items)
	if err != nil {
		return 0, err
	}
	return s - Discount(s), nil
}
