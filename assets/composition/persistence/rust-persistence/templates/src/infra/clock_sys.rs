//! The real `Clock` adapter: the platform clock.

use std::time::SystemTime;

use crate::domain::Clock;

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}
