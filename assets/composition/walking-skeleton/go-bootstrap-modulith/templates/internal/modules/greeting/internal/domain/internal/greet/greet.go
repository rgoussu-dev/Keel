// Package greet holds the core of the greet aggregate. Everything
// under internal/domain/internal is unimportable outside the domain
// subtree — adapters and deployment units reach it only through the
// factories exported by the domain package.
package greet

import (
	"errors"
	"fmt"
	"strings"
)

// ErrEmptyName reports a greeting with nobody to address.
var ErrEmptyName = errors.New("name must not be empty")

// Message composes the canonical greeting for name.
func Message(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", ErrEmptyName
	}
	return fmt.Sprintf("Hello, %s!", trimmed), nil
}
