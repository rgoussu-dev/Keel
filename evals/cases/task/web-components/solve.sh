#!/usr/bin/env bash
# Reference solution proving the case solvable: the port and read
# model in the DOM-less contract face, the service and store behind
# the core's internal wall, the context keys the element is bound
# through, and the element itself.
set -euo pipefail

cat > domain/domain-api/src/farewell.ts <<'TS'
import type { Unsubscribe } from './greet';

/** Command carrying the name to take leave of. Commands are plain data. */
export interface FarewellCommand {
  readonly name: string;
}

/** A valediction produced by the domain. */
export interface Valediction {
  readonly message: string;
}

/** Driving port for the farewell use case. */
export interface Farewell {
  execute(command: FarewellCommand): void;
}

/** Read model over the latest valediction. */
export interface FarewellReadModel {
  /** The latest valediction, or null before the first command. */
  current(): Valediction | null;
  /** Registers a listener called on every new valediction. */
  subscribe(listener: (valediction: Valediction) => void): Unsubscribe;
}
TS

cat > domain/domain-core/src/internal/valediction-store.ts <<'TS'
import type { FarewellReadModel, Unsubscribe, Valediction } from '@acme/domain-api';

/** The write side of the valediction read model. */
export interface ValedictionStore extends FarewellReadModel {
  /** Records a new valediction and notifies every subscriber. */
  publish(valediction: Valediction): void;
}

/** Creates the in-memory valediction store backing the read model. */
export function createValedictionStore(): ValedictionStore {
  let current: Valediction | null = null;
  const listeners = new Set<(valediction: Valediction) => void>();
  return {
    current: () => current,
    subscribe(listener: (valediction: Valediction) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(valediction: Valediction): void {
      current = valediction;
      for (const listener of listeners) listener(valediction);
    },
  };
}
TS

cat > domain/domain-core/src/internal/farewell-service.ts <<'TS'
import type { Farewell, FarewellCommand } from '@acme/domain-api';
import type { ValedictionStore } from './valediction-store';

/** Factory for the farewell driving port. */
export function createFarewell(valedictions: ValedictionStore): Farewell {
  return {
    execute(command: FarewellCommand): void {
      const name = command.name.trim();
      valedictions.publish({ message: `Goodbye, ${name === '' ? 'world' : name}!` });
    },
  };
}
TS

python3 - <<'PY'
import pathlib

p = pathlib.Path("domain/domain-api/src/index.ts")
s = p.read_text()
if "./farewell" not in s:
    p.write_text(s.replace("export * from './greet';", "export * from './greet';\nexport * from './farewell';"))

p = pathlib.Path("domain/domain-core/src/index.ts")
p.write_text(
    p.read_text().rstrip("\n")
    + "\nexport { createFarewell } from './internal/farewell-service';"
    + "\nexport { createValedictionStore, type ValedictionStore } from './internal/valediction-store';\n"
)

p = pathlib.Path("application/web-app/src/context-keys.ts")
s = p.read_text()
s = s.replace(
    "import type { Greet, GreetingReadModel } from '@acme/domain-api';",
    "import type { Farewell, FarewellReadModel, Greet, GreetingReadModel } from '@acme/domain-api';",
)
s = s.rstrip("\n") + (
    "\n\n/** Delivers the farewell driving port. */\n"
    "export const farewellContext = createContext<Farewell>('acme.farewell');\n\n"
    "/** Delivers the valediction read model. */\n"
    "export const valedictionsContext = createContext<FarewellReadModel>('acme.valedictions');\n"
)
p.write_text(s)

p = pathlib.Path("application/web-app/src/main.ts")
s = p.read_text()
s = s.replace(
    "import { createGreet, createGreetingStore } from '@acme/domain-core';",
    "import {\n"
    "  createFarewell,\n"
    "  createGreet,\n"
    "  createGreetingStore,\n"
    "  createValedictionStore,\n"
    "} from '@acme/domain-core';",
)
s = s.replace(
    "import { greetContext, greetingsContext } from './context-keys';",
    "import {\n"
    "  farewellContext,\n"
    "  greetContext,\n"
    "  greetingsContext,\n"
    "  valedictionsContext,\n"
    "} from './context-keys';",
)
s = s.replace(
    "const greet = createGreet(greetings);",
    "const greet = createGreet(greetings);\n"
    "const valedictions = createValedictionStore();\n"
    "const farewell = createFarewell(valedictions);",
)
s = s.replace(
    "  [greetingsContext, greetings],\n]);",
    "  [greetingsContext, greetings],\n"
    "  [farewellContext, farewell],\n"
    "  [valedictionsContext, valedictions],\n]);",
)
p.write_text(s)

# The element takes the second port and shows the valediction beside
# the greeting: one element, two use cases, both through context.
p = pathlib.Path("application/web-app/src/components/greeting-view.ts")
s = p.read_text()
s = s.replace(
    "import type { Greet, GreetingReadModel, Unsubscribe } from '@acme/domain-api';",
    "import type {\n"
    "  Farewell,\n"
    "  FarewellReadModel,\n"
    "  Greet,\n"
    "  GreetingReadModel,\n"
    "  Unsubscribe,\n"
    "} from '@acme/domain-api';",
)
s = s.replace(
    "import { greetContext, greetingsContext } from '../context-keys';",
    "import {\n"
    "  farewellContext,\n"
    "  greetContext,\n"
    "  greetingsContext,\n"
    "  valedictionsContext,\n"
    "} from '../context-keys';",
)
s = s.replace(
    "        <acme-button type=\"submit\">Greet</acme-button>",
    "        <acme-button type=\"submit\">Greet</acme-button>\n"
    "        <acme-button type=\"button\" data-farewell>Farewell</acme-button>",
)
s = s.replace(
    "    <acme-greeting-card></acme-greeting-card>",
    "    <acme-greeting-card></acme-greeting-card>\n"
    "    <acme-greeting-card data-valediction></acme-greeting-card>",
)
s = s.replace(
    "  #unsubscribe?: Unsubscribe;",
    "  #unsubscribe?: Unsubscribe;\n"
    "  #farewell?: Farewell;\n"
    "  #valedictions?: FarewellReadModel;\n"
    "  #unsubscribeValediction?: Unsubscribe;",
)
s = s.replace(
    "    const greet = this.#greet;",
    "    this.dispatchEvent(\n"
    "      new ContextRequestEvent(farewellContext, (port) => (this.#farewell = port)),\n"
    "    );\n"
    "    this.dispatchEvent(\n"
    "      new ContextRequestEvent(valedictionsContext, (readModel) => (this.#valedictions = readModel)),\n"
    "    );\n"
    "    const greet = this.#greet;",
)
s = s.replace(
    "    if (!greet || !greetings) {",
    "    const farewell = this.#farewell;\n"
    "    const valedictions = this.#valedictions;\n"
    "    if (!greet || !greetings || !farewell || !valedictions) {",
)
s = s.replace(
    "    form.addEventListener('submit', (event) => {",
    "    const valedictionCard = this.querySelector('[data-valediction]');\n"
    "    const farewellButton = this.querySelector('[data-farewell]');\n"
    "    if (!valedictionCard || !farewellButton) {\n"
    "      throw new Error('<acme-greeting>: template is missing nodes');\n"
    "    }\n"
    "    const renderValediction = (message: string): void => {\n"
    "      valedictionCard.setAttribute('message', message);\n"
    "    };\n"
    "    const latest = valedictions.current();\n"
    "    if (latest) renderValediction(latest.message);\n"
    "    this.#unsubscribeValediction = valedictions.subscribe((v) => renderValediction(v.message));\n"
    "    farewellButton.addEventListener('click', () => {\n"
    "      const data = new FormData(form);\n"
    "      farewell.execute({ name: String(data.get('name') ?? '') });\n"
    "    });\n\n"
    "    form.addEventListener('submit', (event) => {",
)
s = s.replace(
    "    this.#unsubscribe?.();\n    this.#unsubscribe = undefined;",
    "    this.#unsubscribe?.();\n    this.#unsubscribe = undefined;\n"
    "    this.#unsubscribeValediction?.();\n    this.#unsubscribeValediction = undefined;",
)
p.write_text(s)
PY

npx --yes prettier --write \
  domain/domain-api/src/farewell.ts \
  domain/domain-api/src/index.ts \
  domain/domain-core/src/index.ts \
  domain/domain-core/src/internal/farewell-service.ts \
  domain/domain-core/src/internal/valediction-store.ts \
  application/web-app/src/context-keys.ts \
  application/web-app/src/main.ts \
  application/web-app/src/components/greeting-view.ts >/dev/null
