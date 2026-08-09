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
