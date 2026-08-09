// Package clockfake is the canonical fake for the domain's Clock
// port: a clock pinned to an instant that advances only when told
// to. Tests wire it wherever a Clock is needed; it is the reference
// implementation of the port's contract.
package clockfake

import "time"

// Clock is a Clock-port fake pinned to an instant.
type Clock struct {
	now time.Time
}

// At returns a fake pinned to now.
func At(now time.Time) *Clock {
	return &Clock{now: now}
}

// Now returns the pinned instant.
func (c *Clock) Now() time.Time {
	return c.now
}

// Advance moves the pinned instant forward by d.
func (c *Clock) Advance(d time.Duration) {
	c.now = c.now.Add(d)
}
