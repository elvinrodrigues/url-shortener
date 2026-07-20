package shortcode

import (
	"crypto/rand"
	"math/big"
)

const Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func Generate(length int) (string, error) {
	code := make([]byte, length)
	for j := range length {
		i, err := rand.Int(rand.Reader, big.NewInt(int64(len(Alphabet))))
		if err != nil {
			return "", err
		}
		code[j] = Alphabet[int(i.Int64())]
	}
	return string(code), nil
}
