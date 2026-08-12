//! The in-memory `UnitOfWork` — the canonical reference
//! implementation of the port's contract: it runs the block and
//! counts outcomes, so domain tests assert the transactional
//! boundary without a database.

use std::sync::atomic::{AtomicUsize, Ordering};

use crate::domain::{GreetingLogError, UnitOfWork};

#[derive(Default)]
pub struct FakeUnitOfWork {
    committed: AtomicUsize,
    rolled_back: AtomicUsize,
}

impl FakeUnitOfWork {
    pub fn new() -> Self {
        Self::default()
    }

    /// Units of work that ran to completion.
    pub fn committed(&self) -> usize {
        self.committed.load(Ordering::SeqCst)
    }

    /// Units of work that ended in rollback.
    pub fn rolled_back(&self) -> usize {
        self.rolled_back.load(Ordering::SeqCst)
    }
}

impl UnitOfWork for FakeUnitOfWork {
    fn in_transaction(
        &self,
        work: &mut dyn FnMut() -> Result<(), GreetingLogError>,
    ) -> Result<(), GreetingLogError> {
        match work() {
            Ok(()) => {
                self.committed.fetch_add(1, Ordering::SeqCst);
                Ok(())
            }
            Err(err) => {
                self.rolled_back.fetch_add(1, Ordering::SeqCst);
                Err(err)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_completed_blocks_as_committed() {
        let uow = FakeUnitOfWork::new();
        uow.in_transaction(&mut || Ok(())).expect("commit");
        assert_eq!((uow.committed(), uow.rolled_back()), (1, 0));
    }

    #[test]
    fn counts_failing_blocks_as_rolled_back_and_propagates() {
        let uow = FakeUnitOfWork::new();
        let err = uow.in_transaction(&mut || Err(GreetingLogError::Store("boom".to_string())));
        assert!(err.is_err());
        assert_eq!((uow.committed(), uow.rolled_back()), (0, 1));
    }
}
