//! The gateway translating guestbook's `Welcome` port into a call on
//! the greeting context's seam.
//!
//! This is the only file in guestbook that knows greeting exists, and
//! it is a driven adapter — so the dependency points from
//! infrastructure inwards, never between two domains.

use std::sync::Arc;

use greeting_user_side_service::GreetingService;
use guestbook_domain_contract::Welcome;
use platform_kernel::{BoxFuture, boxed};

/// Obtains a welcome by asking greeting for one.
pub struct GreetingWelcome {
    greeting: Arc<dyn GreetingService>,
}

impl GreetingWelcome {
    /// Returns a gateway delegating to `greeting`.
    pub fn new(greeting: Arc<dyn GreetingService>) -> Self {
        Self { greeting }
    }
}

impl Welcome for GreetingWelcome {
    fn welcome_for(&self, visitor: &str) -> BoxFuture<'_, Result<String, String>> {
        let greeting = Arc::clone(&self.greeting);
        let visitor = visitor.to_string();
        boxed! {
            // `greeting` is only reachable through its seam, and the
            // seam hands back its own DTO — so what crosses this
            // boundary is a `Greeting`, never a greeting domain type.
            match greeting.greeting_for(&visitor).await {
                Ok(g) => Ok(g.message),
                Err(err) => Err(err.reason),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use greeting_user_side_service::{Greeting, GreetingUnavailable};

    /// The canonical fake of the seam port: replies with a canned
    /// outcome and records nothing else.
    struct FakeGreeting(Result<Greeting, GreetingUnavailable>);

    impl GreetingService for FakeGreeting {
        fn greeting_for(&self, _n: &str) -> BoxFuture<'_, Result<Greeting, GreetingUnavailable>> {
            let reply = self.0.clone();
            boxed! { reply }
        }
    }

    #[test]
    fn hands_back_the_words_the_peer_composed() {
        let gateway = GreetingWelcome::new(Arc::new(FakeGreeting(Ok(Greeting {
            message: "Hello, Ada!".to_string(),
        }))));

        let got = platform_kernel::block_on(gateway.welcome_for("Ada"));

        assert_eq!(got, Ok("Hello, Ada!".to_string()));
    }

    #[test]
    fn maps_the_peer_rejection_into_this_context_vocabulary() {
        let gateway = GreetingWelcome::new(Arc::new(FakeGreeting(Err(GreetingUnavailable {
            reason: "name must not be empty".to_string(),
        }))));

        let got = platform_kernel::block_on(gateway.welcome_for("  "));

        assert_eq!(got, Err("name must not be empty".to_string()));
    }
}
