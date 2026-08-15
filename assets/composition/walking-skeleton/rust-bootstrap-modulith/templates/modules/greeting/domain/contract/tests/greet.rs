//! DIP-strict domain test: exercises the greet use case through the
//! exported factory and the driving port only. As an integration
//! test it can see nothing but the crate's public face — the same
//! wall the assemblies build against.
//!
//! Note what it cannot reach: `greeting-domain-core` is not a
//! dependency of this test target, so the core's internals are not
//! merely discouraged here, they are unnameable.

use greeting_domain_contract::{GreetCommand, GreetError, Greeter, new_greeter};

#[test]
fn greet_composes_the_greeting() {
    let greeter = new_greeter();

    let got = greeter.greet(GreetCommand {
        name: "World".to_string(),
    });

    assert_eq!(got, Ok("Hello, World!".to_string()));
}

#[test]
fn greet_rejects_a_blank_name() {
    let greeter = new_greeter();

    let got = greeter.greet(GreetCommand {
        name: "   ".to_string(),
    });

    assert_eq!(got, Err(GreetError::EmptyName));
}
