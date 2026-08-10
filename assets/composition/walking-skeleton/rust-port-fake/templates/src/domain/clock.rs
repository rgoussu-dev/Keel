//! The `Clock` secondary port. The domain owns the trait (ports live
//! with their consumer); real and fake adapters implement it under
//! `infra`.

use std::time::SystemTime;

/// Clock is the secondary port for reading the current instant.
pub trait Clock {
    /// Returns the current instant.
    fn now(&self) -> SystemTime;
}
