// Package money: integer cents, no floats anywhere.
package money

import "fmt"

// Format formats integer cents as "12.34 EUR" ("-12.34 EUR" for negatives, "0.00 EUR" for zero).
func Format(c int64) string {
	sign := ""
	if c < 0 {
		sign = "-"
		c = -c
	}
	return fmt.Sprintf("%s%d.%02d EUR", sign, c/100, c%100)
}

// Add adds two amounts.
func Add(a, b int64) int64 {
	return a + b
}

// Mul multiplies cents by a whole quantity >= 0.
func Mul(c int64, qty int64) (int64, error) {
	if qty < 0 {
		return 0, fmt.Errorf("invalid qty: %d", qty)
	}
	return c * qty, nil
}
