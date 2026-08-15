//! The PostgreSQL driven adapters of the greeting context: the
//! `GreetingLog` repository, the `UnitOfWork`, and the canonical
//! fakes of those same two ports.
//!
//! **Why a crate rather than a module.** Everything here depends on
//! the `postgres` crate, and a Cargo dependency is inherited by every
//! dependent — so folding these adapters into
//! `greeting-domain-contract` would put a database driver on the
//! compile graph of every consumer of the domain, including ones that
//! never touch a row. The crate boundary is what keeps
//! `cargo tree -p greeting-domain-contract` free of it.
//!
//! **Why the fakes are here too.** A fake is an adapter — the
//! reference implementation of the port's contract, wired by tests
//! exactly where the real one is wired by the assembly. Splitting the
//! two apart would put the same port's implementations in two crates
//! for no gain. Tests of the contract crate reach them through a
//! dev-dependency back onto this crate; Cargo permits that cycle
//! precisely because a dev-dependency is not part of the library's
//! own graph, so nothing about the wall above is weakened by it.

pub mod greeting_log_fake;
pub mod postgres;
pub mod uow_fake;
