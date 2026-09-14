#!/usr/bin/env bash
# Reference solution proving the case solvable: the same change
# through every ring — contract, core behind the internal wall,
# facade export, transport route, and the assembly's handler array.
set -euo pipefail
ctx=modules/greeting/src

cat > "$ctx/domain/contract/farewell.ts" <<'TS'
import type { Command } from '@acme/platform-kernel';

/** Take leave of someone by name. */
export interface FarewellCommand extends Command<Farewell> {
  readonly kind: 'farewell';
  readonly name: string;
}

/** A farewell produced by the domain. */
export interface Farewell {
  readonly message: string;
}

/** Constructs a {@link FarewellCommand}. Commands are plain data. */
export function farewellCommand(name: string): FarewellCommand {
  return { kind: 'farewell', name };
}

/** Error code carried when a {@link FarewellCommand} has a blank name. */
export const FAREWELL_REJECTED = 'farewell.rejected';
TS

cat > "$ctx/domain/core/internal/farewell-handler.ts" <<'TS'
import {
  DomainError,
  err,
  ok,
  type Command,
  type Handler,
  type Result,
} from '@acme/platform-kernel';
import { FAREWELL_REJECTED, type Farewell, type FarewellCommand } from '../../contract/index.ts';

/** Handles the farewell command. */
export function createFarewellHandler(): Handler<FarewellCommand> {
  return {
    supports(command: Command): command is FarewellCommand {
      return command.kind === 'farewell';
    },
    handle(command: FarewellCommand): Promise<Result<Farewell>> {
      const name = command.name.trim();
      if (name === '') {
        return Promise.resolve(err(new DomainError('name must not be blank', FAREWELL_REJECTED)));
      }
      return Promise.resolve(ok({ message: `Goodbye, ${name}!` }));
    },
  };
}
TS

python3 - <<'PY'
import pathlib

p = pathlib.Path("modules/greeting/src/domain/contract/index.ts")
s = p.read_text()
if "farewell.ts" not in s:
    p.write_text(s.rstrip("\n") + "\nexport * from './farewell.ts';\n")

p = pathlib.Path("modules/greeting/src/index.ts")
s = p.read_text()
p.write_text(
    s.replace(
        "export { createGreetHandler } from './domain/core/internal/greet-handler.ts';",
        "export { createGreetHandler } from './domain/core/internal/greet-handler.ts';\n"
        "export { createFarewellHandler } from './domain/core/internal/farewell-handler.ts';",
    )
)

p = pathlib.Path("application/rest/src/server.ts")
s = p.read_text()
s = s.replace(
    "import { greetCommand, GREET_REJECTED } from '@acme/greeting';",
    "import {\n"
    "  farewellCommand,\n"
    "  greetCommand,\n"
    "  FAREWELL_REJECTED,\n"
    "  GREET_REJECTED,\n"
    "} from '@acme/greeting';",
)
s = s.replace(
    "    if (request.method !== 'GET' || url.pathname !== '/greet') {\n"
    "      problem(response, 404, 'not found', `no resource at ${url.pathname}`);\n"
    "      return;\n"
    "    }\n"
    "    const name = url.searchParams.get('name') ?? 'world';\n"
    "    void mediator\n"
    "      .dispatch(greetCommand(name))",
    "    const routes: Record<string, { command: (name: string) => Command<{ message: string }>; rejected: string; key: string }> = {\n"
    "      '/greet': { command: greetCommand, rejected: GREET_REJECTED, key: 'greeting' },\n"
    "      '/farewell': { command: farewellCommand, rejected: FAREWELL_REJECTED, key: 'farewell' },\n"
    "    };\n"
    "    const route = routes[url.pathname];\n"
    "    if (request.method !== 'GET' || route === undefined) {\n"
    "      problem(response, 404, 'not found', `no resource at ${url.pathname}`);\n"
    "      return;\n"
    "    }\n"
    "    const name = url.searchParams.get('name') ?? 'world';\n"
    "    void mediator\n"
    "      .dispatch(route.command(name))",
)
s = s.replace(
    "          const status = result.error.code === GREET_REJECTED ? 400 : 500;",
    "          const status = result.error.code === route.rejected ? 400 : 500;",
)
s = s.replace(
    "JSON.stringify({ greeting: result.value.message })",
    "JSON.stringify({ [route.key]: result.value.message })",
)
s = s.replace(
    "import type { Mediator } from '@acme/platform-kernel';",
    "import type { Command, Mediator } from '@acme/platform-kernel';",
)
p.write_text(s)

p = pathlib.Path("application/rest/src/main.ts")
s = p.read_text()
s = s.replace(
    "import { createGreetHandler } from '@acme/greeting';",
    "import { createFarewellHandler, createGreetHandler } from '@acme/greeting';",
).replace(
    "createRegistryMediator([createGreetHandler()])",
    "createRegistryMediator([createGreetHandler(), createFarewellHandler()])",
)
p.write_text(s)
PY

npx --yes prettier --write \
  modules/greeting/src/domain/contract/farewell.ts \
  modules/greeting/src/domain/contract/index.ts \
  modules/greeting/src/domain/core/internal/farewell-handler.ts \
  modules/greeting/src/index.ts \
  application/rest/src/server.ts \
  application/rest/src/main.ts >/dev/null
