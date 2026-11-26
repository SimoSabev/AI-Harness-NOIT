package cart

import "testing"

func TestEmptyCartHasZeroSubtotal(t *testing.T) {
	if s, _ := Subtotal(nil); s != 0 {
		t.Fatalf("got %d", s)
	}
}

func TestSubtotalSumsPriceTimesQty(t *testing.T) {
	if s, _ := Subtotal([]Item{{"a", 250, 2}, {"b", 100, 3}}); s != 800 {
		t.Fatalf("got %d", s)
	}
}

func TestRejectsNegativePrice(t *testing.T) {
	if _, err := Subtotal([]Item{{"a", -100, 1}}); err == nil {
		t.Fatal("accepted")
	}
}

func TestNoDiscountUnder50(t *testing.T) {
	if d := Discount(4999); d != 0 {
		t.Fatalf("got %d", d)
	}
}

func TestNoDiscountAtExactly50(t *testing.T) {
	if d := Discount(5000); d != 0 {
		t.Fatalf("got %d", d)
	}
}

func TestApplies10PercentOver50(t *testing.T) {
	if d := Discount(10000); d != 1000 {
		t.Fatalf("got %d", d)
	}
}

func TestRoundsDiscountDown(t *testing.T) {
	if d := Discount(60005); d != 6000 {
		t.Fatalf("got %d", d)
	}
}

func TestLargeCartTotal(t *testing.T) {
	if s, _ := Total([]Item{{"a", 35000, 2}}); s != 63000 {
		t.Fatalf("got %d", s)
	}
}
