//! The `UnitOfWork` secondary port — the transactional boundary as a
//! domain concept. Use cases wrap the state-changing work of one
//! command in `in_transaction` so every port touched inside the
//! block commits or rolls back together; how atomicity is achieved
//! is an adapter concern under `infra`.

use crate::domain::GreetingLogError;

pub trait UnitOfWork {
    /// Runs `work` as one atomic unit: committed when it returns
    /// `Ok`, rolled back when it returns `Err` (which then
    /// propagates unchanged).
    fn in_transaction(
        &self,
        work: &mut dyn FnMut() -> Result<(), GreetingLogError>,
    ) -> Result<(), GreetingLogError>;
}
