//! The contract face of the hexagon: the commands and ports adapters
//! are written against, plus the exported factories that assemble the
//! compiler-hidden core underneath. Core submodules are declared
//! private (`mod greet;`), so deployment units and adapters can reach
//! them only through this face.

mod greet;

pub use greet::GreetError;

/// GreetCommand asks for a greeting addressed to `name`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GreetCommand {
    pub name: String,
}

/// Greeter is the driving port for the greet use case. Primary
/// adapters depend on this trait, never on the implementation;
/// cross-cutting concerns stack as decorators around it at the
/// assembly point.
pub trait Greeter {
    /// Composes the greeting for the command's addressee. Returns
    /// `GreetError::EmptyName` when the name is blank.
    fn greet(&self, cmd: GreetCommand) -> Result<String, GreetError>;
}

/// Assembles the greet use case and returns it behind its driving
/// port. Each `src/bin/` main wires it by hand — constructor
/// injection, no framework.
pub fn new_greeter() -> impl Greeter + Send + Sync + 'static {
    DomainGreeter
}

struct DomainGreeter;

impl Greeter for DomainGreeter {
    fn greet(&self, cmd: GreetCommand) -> Result<String, GreetError> {
        greet::message(&cmd.name)
    }
}
