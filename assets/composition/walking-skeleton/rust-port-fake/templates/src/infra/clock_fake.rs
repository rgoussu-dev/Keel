//! The canonical fake for the domain's `Clock` port: a clock pinned
//! to an instant that advances only when told to. Tests wire it
//! wherever a `Clock` is needed; it is the reference implementation
//! of the port's contract.

use std::time::{Duration, SystemTime};

use crate::domain::Clock;

/// A `Clock`-port fake pinned to an instant.
pub struct FakeClock {
    now: SystemTime,
}

impl FakeClock {
    /// Returns a fake pinned to `now`.
    pub fn at(now: SystemTime) -> Self {
        Self { now }
    }

    /// Moves the pinned instant forward by `d`.
    pub fn advance(&mut self, d: Duration) {
        self.now += d;
    }
}

impl Clock for FakeClock {
    fn now(&self) -> SystemTime {
        self.now
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pinned() -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_777_204_800)
    }

    #[test]
    fn now_returns_the_pinned_instant() {
        let clock = FakeClock::at(pinned());

        assert_eq!(clock.now(), pinned());
    }

    #[test]
    fn advance_moves_the_instant_forward() {
        let mut clock = FakeClock::at(pinned());

        clock.advance(Duration::from_secs(90 * 60));

        assert_eq!(clock.now(), pinned() + Duration::from_secs(90 * 60));
    }
}
