#!/usr/bin/env bash
# Reference solution proving the case solvable (terminal-bench rule):
# the same change through every ring the task crosses — the
# compiler-hidden core, the contract face, the HTTP adapter, and the
# fake the existing adapter test drives the port through.
# Run with the workspace as cwd.
set -euo pipefail
ctx=internal/modules/greeting

cat >> "$ctx/internal/domain/internal/greet/greet.go" <<'GO'

// Farewell composes the canonical farewell for name.
func Farewell(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", ErrEmptyName
	}
	return fmt.Sprintf("Goodbye, %s!", trimmed), nil
}
GO

cat >> "$ctx/internal/domain/greet.go" <<'GO'

// FarewellCommand asks for a farewell addressed to Name.
type FarewellCommand struct {
	Name string
}

func (greeter) Farewell(cmd FarewellCommand) (string, error) {
	return greet.Farewell(cmd.Name)
}
GO

python3 - <<'PY'
import re, pathlib
p = pathlib.Path("internal/modules/greeting/internal/domain/greet.go")
s = p.read_text()
s = s.replace(
    "\tGreet(cmd GreetCommand) (string, error)\n}",
    "\tGreet(cmd GreetCommand) (string, error)\n"
    "\t// Farewell composes the farewell for the command's addressee.\n"
    "\t// Returns ErrEmptyName when the name is blank.\n"
    "\tFarewell(cmd FarewellCommand) (string, error)\n}",
)
p.write_text(s)

p = pathlib.Path("internal/modules/greeting/userside/resthttp/handler.go")
s = p.read_text()
s = s.replace(
    "// Problem is an RFC 9457 problem document",
    "// FarewellResponse is the transport shape of a successful farewell.\n"
    "type FarewellResponse struct {\n\tFarewell string `json:\"farewell\"`\n}\n\n"
    "// Problem is an RFC 9457 problem document",
)
s = s.replace(
    "\t\twriteJSON(w, http.StatusOK, \"application/json\", GreetingResponse{Greeting: message})\n\t})\n\treturn mux",
    "\t\twriteJSON(w, http.StatusOK, \"application/json\", GreetingResponse{Greeting: message})\n\t})\n"
    "\tmux.HandleFunc(\"GET /farewell\", func(w http.ResponseWriter, r *http.Request) {\n"
    "\t\tname := \"world\"\n"
    "\t\tif r.URL.Query().Has(\"name\") {\n\t\t\tname = r.URL.Query().Get(\"name\")\n\t\t}\n"
    "\t\tmessage, err := greeter.Farewell(domain.FarewellCommand{Name: name})\n"
    "\t\tif err != nil {\n\t\t\twriteProblem(w, err)\n\t\t\treturn\n\t\t}\n"
    "\t\twriteJSON(w, http.StatusOK, \"application/json\", FarewellResponse{Farewell: message})\n\t})\n"
    "\treturn mux",
)
p.write_text(s)

# The existing adapter test drives the port through a hand-rolled
# fake; a port that grew a method leaves the fake behind.
p = pathlib.Path("internal/modules/greeting/userside/resthttp/handler_test.go")
s = p.read_text()
s += (
    "\nfunc (f *fakeGreeter) Farewell(cmd domain.FarewellCommand) (string, error) {\n"
    "\tf.gotFarewell = cmd\n\treturn f.reply, f.err\n}\n"
)
s = s.replace(
    "type fakeGreeter struct {\n\tgot   domain.GreetCommand",
    "type fakeGreeter struct {\n\tgotFarewell domain.FarewellCommand\n\tgot   domain.GreetCommand",
)
p.write_text(s)
PY

gofmt -w "$ctx/internal/domain/greet.go" \
  "$ctx/internal/domain/internal/greet/greet.go" \
  "$ctx/userside/resthttp/handler.go" \
  "$ctx/userside/resthttp/handler_test.go"
