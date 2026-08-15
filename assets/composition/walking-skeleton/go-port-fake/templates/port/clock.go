package domain

import "time"

// Clock is the secondary port for reading the current instant. The
// domain owns the interface (ports live with their consumer); real
// and fake adapters implement it under internal/infra/.
type Clock interface {
	// Now returns the current instant.
	Now() time.Time
}
