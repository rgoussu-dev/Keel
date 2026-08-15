//! The contract face of the guestbook hexagon.

use std::fmt;

use platform_kernel::BoxFuture;

/// SignCommand asks for `visitor` to be recorded in the guestbook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignCommand {
    pub visitor: String,
}

/// An entry recorded in the guestbook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuestbookEntry {
    pub visitor: String,
    pub welcome: String,
}

/// Why an entry could not be recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SignRejected {
    /// The command named nobody to record.
    AnonymousVisitor,
    /// No welcome could be obtained for the visitor.
    NoWelcome(String),
}

impl fmt::Display for SignRejected {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignRejected::AnonymousVisitor => write!(f, "visitor must not be empty"),
            SignRejected::NoWelcome(why) => write!(f, "no welcome for the visitor: {why}"),
        }
    }
}

impl std::error::Error for SignRejected {}

/// Welcome is the driven port through which guestbook obtains the
/// words it records. It is declared in *guestbook's* vocabulary: the
/// context asks for a welcome, and does not know or care that some
/// other context composes greetings.
///
/// It returns a [`BoxFuture`] rather than being an `async fn`,
/// because an adapter is wired behind `Arc<dyn Welcome>` at the
/// assembly point and `async fn` in a trait is not dyn-compatible.
pub trait Welcome: Send + Sync {
    fn welcome_for(&self, visitor: &str) -> BoxFuture<'_, Result<String, String>>;
}

/// Signs the guestbook: the driving port of this context.
pub trait Guestbook {
    fn sign(&self, cmd: SignCommand) -> BoxFuture<'_, Result<GuestbookEntry, SignRejected>>;
}
