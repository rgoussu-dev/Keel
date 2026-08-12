package domain

import "context"

// UnitOfWork is the transactional boundary as a domain concept — a
// secondary port shaped as a Unit of Work. Use cases wrap the
// state-changing work of one command in InTransaction so every port
// touched inside the block commits or rolls back together. How
// atomicity is achieved (a database transaction, a session) is an
// adapter concern behind this interface — the domain only decides
// where the boundary sits.
type UnitOfWork interface {
	// InTransaction runs work as one atomic unit: committed when it
	// returns nil, rolled back when it returns an error (which then
	// propagates unchanged). Adapters carry the transaction in the
	// derived context they hand to work.
	InTransaction(ctx context.Context, work func(ctx context.Context) error) error
}
