package shortcode

import "testing"

func TestUniqueness(t *testing.T) {
	mp := make(map[string]struct{})

	for range 10000 {
		code, err := Generate(7)
		if err != nil {
			t.Fatalf("Error while generating %v", err)
		}
		if _, exists := mp[code]; exists {
			t.Fatal("Duplicate Code generated")
		}
		mp[code] = struct{}{}
	}
}
