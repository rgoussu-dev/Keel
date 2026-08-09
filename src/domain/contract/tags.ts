/**
 * A capability tag — a flat string with hierarchical-dot naming
 * (`lang.java`, `framework.quarkus`, `runtime.jvm.graalvm-native`).
 *
 * Tags are facts about the project, captured in the manifest at
 * install time and grown by adapters that promote new capabilities
 * via `Contribution.tagsAdd`.
 *
 * No structured schema is enforced; readability comes from naming
 * discipline. See the keel design doc for the canonical namespaces
 * (`lang.*`, `runtime.*`, `pkg.*`, `framework.*`, `arch.*`,
 * `deploy.*`, `orchestrator.*`, `cloud.*`, `iac.*`, `ci.*`,
 * `vertical.*`).
 *
 * Lives in its own leaf module so both the composition contract and
 * the manifest can name it without a cycle.
 */
export type Tag = string;
