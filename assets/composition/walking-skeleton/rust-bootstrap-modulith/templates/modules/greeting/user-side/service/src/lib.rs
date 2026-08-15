//! The **peer seam** of the greeting context: the one crate another
//! bounded context is allowed to depend on.
//!
//! # The rule this crate exists to hold
//!
//! **Every type in this crate's public API must be declared by this
//! crate.** Not by `greeting-domain-contract`, not by
//! `greeting-domain-core` — here. [`Greeting`] and
//! [`GreetingUnavailable`] below are that: DTOs owned by the seam,
//! translated from the domain on the way out.
//!
//! The reason is what a Cargo dependency *is*. A consumer that
//! depends on this crate can name everything this crate exports, so
//! if a signature here returned `greeting_domain_contract::GreetCommand`,
//! every gateway in the workspace would hold a value of the peer's
//! domain type. Splitting the seam out of `domain/contract` is what
//! stops that being the default; keeping its public API to its own
//! DTOs is what stops it happening anyway.
//!
//! # What the compiler does and does not enforce
//!
//! It enforces less than it looks. The crate graph stops a consumer
//! **naming** a crate it has no edge to — a gateway without a
//! `greeting-domain-contract` dependency cannot write that path, and
//! gets `E0432: unresolved import`. It does **not** stop a domain
//! type *flowing* across this seam: a consumer can bind whatever a
//! public function returns and read its fields, because inference
//! supplies the type it could never write. Verified against rustc
//! 1.94.1 — no error, no warning.
//!
//! So the rule above is a **convention**, not a guarantee, and this
//! doc comment is deliberately at the point where it would be
//! violated rather than in a style guide nobody opens. Unlike the JVM
//! (where build scope holds it) or Go (where unnameability does),
//! Rust's peer seam is enforced by review — `cargo tree -p
//! <consumer>` names the one crate to look at.
//!
//! The upgrade path is two lines the day `public-dependency`
//! stabilises, and needs no restructuring:
//!
//! ```toml
//! greeting-domain-contract = { path = "…", public = false }
//! ```
//! ```ignore
//! #![deny(exported_private_dependencies)]
//! ```
//!
//! Both are nightly-only today (`-Z public-dependency`), which is why
//! this crate does not carry them: enabling them would pin the whole
//! scaffolded project to nightly to enforce one rule on one crate.

use std::fmt;

use greeting_domain_contract::{GreetCommand, Greeter, new_greeter};
use platform_kernel::{BoxFuture, boxed};

/// A greeting, composed and addressed — this seam's own DTO.
///
/// Deliberately not a re-export of anything in the domain. It carries
/// what a peer needs and nothing else, so widening the domain does
/// not silently widen what peers can see.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Greeting {
    /// The composed words.
    pub message: String,
}

/// Why no greeting could be produced — again this seam's own type,
/// not the domain's error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GreetingUnavailable {
    /// Human-readable explanation, already flattened out of the
    /// domain's error vocabulary.
    pub reason: String,
}

impl fmt::Display for GreetingUnavailable {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "greeting unavailable: {}", self.reason)
    }
}

impl std::error::Error for GreetingUnavailable {}

/// What a peer context may ask of greeting.
///
/// Async — and therefore [`BoxFuture`] rather than `async fn` — for
/// two reasons. It is wired behind `Arc<dyn GreetingService>` at
/// assembly points, which `async fn` in a trait cannot support; and a
/// cross-context call is exactly the thing that becomes a network hop
/// the day the context is carved out into its own service. Declaring
/// it async now means that carve-out is a wiring change rather than a
/// signature change through every caller.
pub trait GreetingService: Send + Sync {
    /// Composes a greeting for `name`.
    fn greeting_for(&self, name: &str) -> BoxFuture<'_, Result<Greeting, GreetingUnavailable>>;
}

/// Assembles the seam over the context's own contract face.
pub fn new_greeting_service() -> impl GreetingService + 'static {
    ContractBackedService {
        greeter: new_greeter(),
    }
}

struct ContractBackedService<G: Greeter + Send + Sync> {
    greeter: G,
}

impl<G: Greeter + Send + Sync> GreetingService for ContractBackedService<G> {
    fn greeting_for(&self, name: &str) -> BoxFuture<'_, Result<Greeting, GreetingUnavailable>> {
        // Translation happens here, on the way out, and it is the
        // whole job: a domain value in, a seam DTO out.
        let outcome = self.greeter.greet(GreetCommand {
            name: name.to_string(),
        });
        boxed! {
            match outcome {
                Ok(message) => Ok(Greeting { message }),
                Err(err) => Err(GreetingUnavailable { reason: err.to_string() }),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[test]
    fn produces_a_greeting_dto_for_a_named_visitor() {
        let service = new_greeting_service();

        let got = platform_kernel::block_on(service.greeting_for("Ada"));

        assert_eq!(
            got,
            Ok(Greeting {
                message: "Hello, Ada!".to_string()
            })
        );
    }

    #[test]
    fn reports_the_domain_rejection_as_its_own_error() {
        let service = new_greeting_service();

        let got = platform_kernel::block_on(service.greeting_for("  "));

        assert!(got.unwrap_err().reason.contains("name must not be empty"));
    }

    #[test]
    fn the_seam_port_is_dyn_compatible() {
        // Peers hold this behind `Arc<dyn …>`; `async fn` in the
        // trait would make this line stop compiling.
        let port: Arc<dyn GreetingService> = Arc::new(new_greeting_service());

        let got = platform_kernel::block_on(port.greeting_for("Ada"));

        assert_eq!(
            got,
            Ok(Greeting {
                message: "Hello, Ada!".to_string()
            })
        );
    }
}
