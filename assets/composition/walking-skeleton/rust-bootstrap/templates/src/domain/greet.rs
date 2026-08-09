//! The core of the greet aggregate. This module is private to
//! `domain` — adapters and deployment units cannot name it; they
//! reach the core only through the contract face's factories and
//! re-exports.

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
