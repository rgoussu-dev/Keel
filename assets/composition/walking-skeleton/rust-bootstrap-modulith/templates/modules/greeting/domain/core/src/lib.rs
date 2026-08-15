//! The core of the greet aggregate — pure functions over the
//! context's own vocabulary, with no dependency on anything.
//!
//! Nothing outside `greeting-domain-contract` depends on this crate,
//! so nothing outside it can name what is declared here. That is the
//! dependency wall, and it is checked by the compiler rather than by
//! review: adding this crate to an assembly's `[dependencies]` is a
//! visible, reviewable act in a manifest, not an import three
//! hundred files deep.

use std::error::Error;
use std::fmt;

/// GreetError reports why a greeting could not be composed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GreetError {
    /// The command named nobody to address.
    EmptyName,
}

impl fmt::Display for GreetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GreetError::EmptyName => write!(f, "name must not be empty"),
        }
    }
}

impl Error for GreetError {}

/// Composes the canonical greeting for `name`.
pub fn message(name: &str) -> Result<String, GreetError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(GreetError::EmptyName);
    }
    Ok(format!("Hello, {trimmed}!"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composes_a_greeting_for_a_named_addressee() {
        assert_eq!(message("Ada"), Ok("Hello, Ada!".to_string()));
    }

    #[test]
    fn trims_the_addressee_before_composing() {
        assert_eq!(message("  Ada  "), Ok("Hello, Ada!".to_string()));
    }

    #[test]
    fn rejects_a_blank_addressee() {
        assert_eq!(message("   "), Err(GreetError::EmptyName));
    }
}
