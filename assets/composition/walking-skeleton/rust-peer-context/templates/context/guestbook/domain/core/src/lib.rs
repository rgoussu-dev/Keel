//! The core of the guestbook aggregate.

use std::sync::Arc;

use guestbook_domain_contract::{
    Guestbook, GuestbookEntry, SignCommand, SignRejected, Welcome,
};
use platform_kernel::{BoxFuture, boxed};

/// Assembles the sign use case behind its driving port.
pub fn new_guestbook(welcome: Arc<dyn Welcome>) -> impl Guestbook {
    SignHandler { welcome }
}

struct SignHandler {
    welcome: Arc<dyn Welcome>,
}

impl Guestbook for SignHandler {
    fn sign(&self, cmd: SignCommand) -> BoxFuture<'_, Result<GuestbookEntry, SignRejected>> {
        let welcome = Arc::clone(&self.welcome);
        boxed! {
            let visitor = cmd.visitor.trim().to_string();
            if visitor.is_empty() {
                return Err(SignRejected::AnonymousVisitor);
            }
            match welcome.welcome_for(&visitor).await {
                Ok(words) => Ok(GuestbookEntry { visitor, welcome: words }),
                Err(why) => Err(SignRejected::NoWelcome(why)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The canonical fake of the `Welcome` driven port.
    struct FakeWelcome(Result<String, String>);

    impl Welcome for FakeWelcome {
        fn welcome_for(&self, _visitor: &str) -> BoxFuture<'_, Result<String, String>> {
            let reply = self.0.clone();
            boxed! { reply }
        }
    }

    fn signing(welcome: Result<String, String>) -> impl Guestbook {
        new_guestbook(Arc::new(FakeWelcome(welcome)))
    }

    #[test]
    fn records_the_visitor_with_the_welcome_it_obtained() {
        let guestbook = signing(Ok("Hello, Ada!".to_string()));

        let got = platform_kernel::block_on(guestbook.sign(SignCommand {
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

    #[test]
    fn rejects_an_anonymous_visitor_without_asking_for_a_welcome() {
        let guestbook = signing(Err("should not be asked".to_string()));

        let got = platform_kernel::block_on(guestbook.sign(SignCommand {
            visitor: "   ".to_string(),
        }));

        assert_eq!(got, Err(SignRejected::AnonymousVisitor));
    }

    #[test]
    fn reports_an_unobtainable_welcome_in_its_own_vocabulary() {
        let guestbook = signing(Err("greeting unavailable".to_string()));

        let got = platform_kernel::block_on(guestbook.sign(SignCommand {
            visitor: "Ada".to_string(),
        }));

        assert_eq!(
            got,
            Err(SignRejected::NoWelcome("greeting unavailable".to_string()))
        );
    }
}
