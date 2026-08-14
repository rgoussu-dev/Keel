// Package clock holds the Clock port: the secondary port for reading
// the current instant.
//
// It sits under internal/platform/ rather than inside a bounded
// context because no context owns it — every context needs a clock,
// and none of them defines what time means. Adapters, real and fake,
// implement it beside this package.
package clock

import "time"

// Clock is the secondary port for reading the current instant.
type Clock interface {
	// Now returns the current instant.
	Now() time.Time
}
