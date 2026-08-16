// Package sign holds the core of the guestbook aggregate. Everything
// under internal/domain/internal is unimportable outside the domain
// subtree — adapters and deployment units reach it only through the
// factories exported by the domain package.
package sign

import (
	"errors"
	"strings"
)

// ErrAnonymousVisitor reports a sign command naming nobody to record.
var ErrAnonymousVisitor = errors.New("visitor must not be empty")

// Visitor normalises the name to record, or reports that there is
// none. It is the whole of what this context decides on its own —
// the words it records come from elsewhere, through a port.
func Visitor(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ErrAnonymousVisitor
	}
	return trimmed, nil
}
