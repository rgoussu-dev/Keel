// Package uowfake holds the in-memory UnitOfWork — the canonical
// reference implementation of the port's contract: it runs the block
// and counts outcomes, so domain tests assert the transactional
// boundary without a database.
package uowfake

import "context"

// UnitOfWork is the counting fake.
type UnitOfWork struct {
	committed  int
	rolledBack int
}

// New returns a fresh fake.
func New() *UnitOfWork {
	return &UnitOfWork{}
}

// InTransaction implements domain.UnitOfWork.
func (u *UnitOfWork) InTransaction(
	ctx context.Context, work func(ctx context.Context) error,
) error {
	if err := work(ctx); err != nil {
		u.rolledBack++
		return err
	}
	u.committed++
	return nil
}

// Committed reports units of work that ran to completion.
func (u *UnitOfWork) Committed() int {
	return u.committed
}

// RolledBack reports units of work that ended in rollback.
func (u *UnitOfWork) RolledBack() int {
	return u.rolledBack
}
