package money

import "testing"

func TestFormat(t *testing.T) {
	cases := map[string]struct {
		in   int64
		want string
	}{
		"positive": {1234, "12.34 EUR"},
		"zero":     {0, "0.00 EUR"},
		"negative": {-1234, "-12.34 EUR"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			if got := Format(c.in); got != c.want {
				t.Fatalf("Format(%d) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestAdd(t *testing.T) {
	if Add(150, 275) != 425 {
		t.Fatal("Add")
	}
}

func TestMul(t *testing.T) {
	if got, err := Mul(250, 3); err != nil || got != 750 {
		t.Fatalf("Mul = %d, %v", got, err)
	}
	if _, err := Mul(250, -1); err == nil {
		t.Fatal("negative qty accepted")
	}
}
