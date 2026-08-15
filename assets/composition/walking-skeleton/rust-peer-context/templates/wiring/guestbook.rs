//! Wiring for the guestbook context.
//!
//! Guestbook reaches greeting through one edge and one only: the
//! gateway below is constructed over `greeting-user-side-service`,
//! the peer's seam crate. Nothing in this assembly hands guestbook a
//! greeting *domain* type, and nothing could — this file is where a
//! violation would be written, so this is where the rule is stated.

use std::sync::Arc;

use guestbook_domain_contract::Guestbook;
use guestbook_domain_core::new_guestbook;
use guestbook_infra_greeting_gateway::GreetingWelcome;
use greeting_user_side_service::new_greeting_service;

/// Assembles the guestbook context over the greeting seam.
pub fn wire() -> impl Guestbook {
    let greeting = Arc::new(new_greeting_service());
    new_guestbook(Arc::new(GreetingWelcome::new(greeting)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use guestbook_domain_contract::{GuestbookEntry, SignCommand};

    #[test]
    fn the_wired_guestbook_records_a_welcome_composed_by_the_peer() {
        let got = platform_kernel::block_on(wire().sign(SignCommand {
            visitor: "Ada".to_string(),
        }));

        assert_eq!(
            got,
            Ok(GuestbookEntry {
                visitor: "Ada".to_string(),
                welcome: "Hello, Ada!".to_string(),
            })
        );
    }
}
