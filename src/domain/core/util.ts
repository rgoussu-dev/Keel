/**
 * Tiny utilities shared by composition adapters. Kept narrow on
 * purpose — anything more specific (case helpers, language
 * resolution) belongs to the adapter that needs it, not to a
 * grab-bag module.
 */

/**
 * Converts a dotted Java/Kotlin package (`com.acme.cli`) to its
 * directory path (`com/acme/cli`). Used by adapters that render
 * package-qualified Java sources into `src/main/java/...`.
 */
export function packageToPath(pkg: string): string {
  return pkg.replace(/\./g, '/');
}

const BASE_PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Validates a `basePackage` answer shared by the JVM bootstrap
 * adapters: a dotted lowercase identifier (e.g. `com.example`).
 * Returns the input on success; throws with `adapterName` as the
 * message prefix otherwise.
 */
export function validateBasePackage(s: string, adapterName: string): string {
  if (!BASE_PACKAGE_RE.test(s)) {
    throw new Error(
      `${adapterName}: invalid basePackage '${s}' — must be a dotted lowercase identifier (e.g. com.example)`,
    );
  }
  return s;
}

/**
 * Validates a `projectName` answer shared by the JVM bootstrap
 * adapters: lowercase + digits + dashes, starting with a letter,
 * at most 63 chars. Returns the input on success; throws with
 * `adapterName` as the message prefix otherwise.
 */
export function validateProjectName(s: string, adapterName: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `${adapterName}: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}

/**
 * The first `projectName` any bootstrap recorded in the manifest —
 * every stack's bootstrap asks it under its own adapter id, so
 * cross-stack adapters (dev-env, observability's monitoring stack)
 * scan the answer map instead of hard-coding bootstrap ids. Falls
 * back to `'service'` when no bootstrap has run.
 */
export function anyProjectName(manifest: {
  readonly answers: Readonly<Record<string, Readonly<Record<string, string>>>>;
}): string {
  for (const answers of Object.values(manifest.answers)) {
    const name = answers?.projectName;
    if (name) return name;
  }
  return 'service';
}
