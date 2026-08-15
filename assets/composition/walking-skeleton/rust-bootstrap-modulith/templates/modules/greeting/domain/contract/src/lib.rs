//! The **contract face** of the greeting hexagon: the commands and
//! ports adapters are written against, plus the exported factories
//! that assemble the core underneath.
//!
//! The core lives in its own crate, `greeting-domain-core`, and this
//! is the only crate that depends on it. That is the wall: no
//! assembly and no foreign context can name a core type, because
//! neither has an edge to the crate declaring it. Under the `basic`
//! layout the same wall is a private `mod greet;` — the modulith buys
//! it a second time, at the price of one manifest, and gets a smaller
//! rebuild blast radius in return: editing the core recompiles this
//! crate and its dependents, not every file that ever said `use
//! skel::domain`.
//!
//! Note what is *not* here: this crate is not the peer seam. A
//! sibling context depends on `greeting-user-side-service`, never on
//! this crate — see that crate's docs for why the split matters.

pub use greeting_domain_core::GreetError;

/// GreetCommand asks for a greeting addressed to `name`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GreetCommand {
    /// Who to address.
    pub name: String,
}

/// Greeter is the driving port for the greet use case. Primary
/// adapters depend on this trait, never on the implementation;
/// cross-cutting concerns stack as decorators around it at the
/// assembly point.
///
/// Synchronous, unlike the ports that cross a context boundary: greet
/// is pure computation inside one hexagon, and making it async would
/// buy a runtime dependency and nothing else.
pub trait Greeter {
    /// Composes the greeting for the command's addressee. Returns
    /// `GreetError::EmptyName` when the name is blank.
    fn greet(&self, cmd: GreetCommand) -> Result<String, GreetError>;
}

/// Assembles the greet use case and returns it behind its driving
/// port. Each assembly wires it by hand — constructor injection, no
/// framework.
pub fn new_greeter() -> impl Greeter + Send + Sync + 'static {
    DomainGreeter
}

struct DomainGreeter;

impl Greeter for DomainGreeter {
    fn greet(&self, cmd: GreetCommand) -> Result<String, GreetError> {
        greeting_domain_core::message(&cmd.name)
    }
}
