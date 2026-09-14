//! The injected specification, DIP-strict like its greet sibling: the
//! farewell use case through the exported factory and the driving
//! port only. `greeting-domain-core` is not a dependency of this test
//! target, so where the message is composed is unnameable here — as
//! it should be.

use greeting_domain_contract::{Farewell, FarewellCommand, FarewellError, new_farewell};

#[test]
fn farewell_composes_the_message() {
    let farewell = new_farewell();

    let got = farewell.farewell(FarewellCommand {
        name: "World".to_string(),
    });

    assert_eq!(got, Ok("Goodbye, World!".to_string()));
}

#[test]
fn farewell_trims_the_addressee() {
    let farewell = new_farewell();

    let got = farewell.farewell(FarewellCommand {
        name: "  Ada  ".to_string(),
    });

    assert_eq!(got, Ok("Goodbye, Ada!".to_string()));
}

#[test]
fn farewell_rejects_a_blank_name() {
    let farewell = new_farewell();

    let got = farewell.farewell(FarewellCommand {
        name: "   ".to_string(),
    });

    assert_eq!(got, Err(FarewellError::EmptyName));
}
