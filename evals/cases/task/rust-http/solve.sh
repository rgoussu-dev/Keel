#!/usr/bin/env bash
# Reference solution proving the case solvable: the composition in
# the core crate, the command/port/factory in the contract face, and
# the route on the HTTP adapter.
set -euo pipefail

cat >> modules/greeting/domain/core/src/lib.rs <<'RS'

/// FarewellError reports why a farewell could not be composed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FarewellError {
    /// The command named nobody to take leave of.
    EmptyName,
}

impl fmt::Display for FarewellError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FarewellError::EmptyName => write!(f, "name must not be empty"),
        }
    }
}

impl Error for FarewellError {}

/// Composes the canonical farewell for `name`.
pub fn valediction(name: &str) -> Result<String, FarewellError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(FarewellError::EmptyName);
    }
    Ok(format!("Goodbye, {trimmed}!"))
}
RS

cat >> modules/greeting/domain/contract/src/lib.rs <<'RS'

pub use greeting_domain_core::FarewellError;

/// FarewellCommand asks for a farewell addressed to `name`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FarewellCommand {
    /// Who to take leave of.
    pub name: String,
}

/// Farewell is the driving port for the farewell use case.
pub trait Farewell {
    /// Composes the farewell for the command's addressee. Returns
    /// `FarewellError::EmptyName` when the name is blank.
    fn farewell(&self, cmd: FarewellCommand) -> Result<String, FarewellError>;
}

/// Assembles the farewell use case and returns it behind its driving port.
pub fn new_farewell() -> impl Farewell + Send + Sync + 'static {
    DomainFarewell
}

struct DomainFarewell;

impl Farewell for DomainFarewell {
    fn farewell(&self, cmd: FarewellCommand) -> Result<String, FarewellError> {
        greeting_domain_core::valediction(&cmd.name)
    }
}
RS

python3 - <<'PY'
import pathlib

p = pathlib.Path("application/http/src/handler.rs")
s = p.read_text()
s = s.replace(
    "use greeting_domain_contract::{GreetCommand, GreetError, Greeter};",
    "use greeting_domain_contract::{\n"
    "    Farewell, FarewellCommand, FarewellError, GreetCommand, GreetError, Greeter,\n"
    "};",
)
s = s.replace(
    "pub type SharedGreeter = Arc<dyn Greeter + Send + Sync>;",
    "pub type SharedGreeter = Arc<dyn Greeter + Send + Sync>;\n\n"
    "/// The farewell driving port as shared, thread-safe state.\n"
    "pub type SharedFarewell = Arc<dyn Farewell + Send + Sync>;\n\n"
    "/// Both driving ports, as axum's single state value.\n"
    "#[derive(Clone)]\n"
    "pub struct Ports {\n"
    "    /// The greet use case.\n"
    "    pub greeter: SharedGreeter,\n"
    "    /// The farewell use case.\n"
    "    pub farewell: SharedFarewell,\n"
    "}",
)
s = s.replace(
    "pub struct GreetingResponse {\n    pub greeting: String,\n}",
    "pub struct GreetingResponse {\n    pub greeting: String,\n}\n\n"
    "/// FarewellResponse is the transport shape of a successful farewell.\n"
    "#[derive(Serialize)]\n"
    "pub struct FarewellResponse {\n"
    "    /// The composed farewell.\n"
    "    pub farewell: String,\n"
    "}",
)
s = s.replace(
    "pub fn router(greeter: SharedGreeter) -> Router {\n"
    "    Router::new()\n"
    "        .route(\"/greet\", get(greet))\n"
    "        .with_state(greeter)\n"
    "}",
    "pub fn router(ports: Ports) -> Router {\n"
    "    Router::new()\n"
    "        .route(\"/greet\", get(greet))\n"
    "        .route(\"/farewell\", get(farewell))\n"
    "        .with_state(ports)\n"
    "}",
)
s = s.replace(
    "async fn greet(\n    State(greeter): State<SharedGreeter>,\n    Query(params): Query<GreetParams>,\n) -> Response {",
    "async fn greet(State(ports): State<Ports>, Query(params): Query<GreetParams>) -> Response {\n"
    "    let greeter = ports.greeter;",
)
s = s.replace(
    "fn problem(err: GreetError) -> Response {",
    "async fn farewell(State(ports): State<Ports>, Query(params): Query<GreetParams>) -> Response {\n"
    "    let name = params.name.unwrap_or_else(|| \"world\".to_string());\n"
    "    match ports.farewell.farewell(FarewellCommand { name }) {\n"
    "        Ok(farewell) => Json(FarewellResponse { farewell }).into_response(),\n"
    "        Err(FarewellError::EmptyName) => problem(GreetError::EmptyName),\n"
    "    }\n"
    "}\n\n"
    "fn problem(err: GreetError) -> Response {",
)
# The adapter's own tests build the router from a bare greeter.
s = s.replace(
    "let app = router(fake.clone());",
    "let app = router(Ports {\n"
    "            greeter: fake.clone(),\n"
    "            farewell: Arc::new(new_farewell()),\n"
    "        });",
)
s = s.replace(
    "let app = router(fake);",
    "let app = router(Ports {\n"
    "            greeter: fake,\n"
    "            farewell: Arc::new(new_farewell()),\n"
    "        });",
)
s = s.replace("    use super::*;", "    use super::*;\n    use greeting_domain_contract::new_farewell;")
p.write_text(s)

p = pathlib.Path("application/http/src/main.rs")
s = p.read_text()
s = s.replace(
    "use greeting_domain_contract::new_greeter;",
    "use greeting_domain_contract::{new_farewell, new_greeter};",
)
s = s.replace(
    "    let greeter: handler::SharedGreeter = Arc::new(new_greeter());",
    "    let greeter: handler::SharedGreeter = Arc::new(new_greeter());\n"
    "    let farewell: handler::SharedFarewell = Arc::new(new_farewell());",
)
s = s.replace(
    "    let app = handler::router(greeter)",
    "    let app = handler::router(handler::Ports { greeter, farewell })",
)
p.write_text(s)
PY

cargo fmt
