import type { PromptSchema } from '../engine/types.js';

/**
 * A single framework profile under a language. Maps user choices to the
 * schematics that render the Claude scaffold and (optionally) the
 * walking-skeleton for this stack. Adding a profile here surfaces it in
 * the install picker; no other call site needs editing.
 */
export interface FrameworkProfile {
  id: string;
  label: string;
  /** Schematic that renders Claude assets for this stack (`claude-<id>`). */
  claudeSchematic: string;
  /** Walking-skeleton schematic to invoke on greenfield, or null. */
  walkingSkeleton: string | null;
  /** Whether native packaging is supported — gates the GraalVM env check. */
  supportsNative: boolean;
}

/** A language and the frameworks available under it. */
export interface LanguageProfile {
  id: string;
  label: string;
  frameworks: readonly FrameworkProfile[];
}

/**
 * Built-in stack registry. Order is the order the picker shows. Profiles
 * for additional languages/frameworks plug in here.
 */
export const PROFILES: readonly LanguageProfile[] = [
  {
    id: 'java',
    label: 'Java',
    frameworks: [
      {
        id: 'quarkus',
        label: 'Quarkus 3.33 LTS / Gradle 9.4 / Java 25',
        claudeSchematic: 'claude-quarkus',
        walkingSkeleton: 'walking-skeleton',
        supportsNative: true,
      },
    ],
  },
];

/** Resolved choice from {@link pickStack}. */
export interface StackChoice {
  language: string;
  framework: FrameworkProfile;
  native: boolean;
}

/** Prompt port used by the progressive picker — {@link cliPrompt} in production. */
export type Prompt = <T>(schema: PromptSchema<T>) => Promise<T>;

/**
 * Drives the language → framework → native? prompts. Each step's
 * choices are derived from the previous selection. The native step is
 * only asked when the chosen framework supports it; otherwise `native`
 * is false. Throws if the registry is empty or the user's pick falls
 * outside the offered choices (defensive — the CLI picker only offers
 * valid options, but the prompt port is replaceable).
 *
 * `profiles` defaults to the built-in registry; tests pass a synthetic
 * one to exercise edge cases like a framework with `supportsNative=false`.
 */
export async function pickStack(
  prompt: Prompt,
  profiles: readonly LanguageProfile[] = PROFILES,
): Promise<StackChoice> {
  if (profiles.length === 0) throw new Error('no stack profiles registered');

  const language = await prompt<string>({
    kind: 'select',
    name: 'language',
    message: 'language',
    choices: profiles.map((l) => ({ name: l.label, value: l.id })),
  });
  const lang = profiles.find((l) => l.id === language);
  if (!lang) throw new Error(`unknown language: ${language}`);

  const framework = await prompt<string>({
    kind: 'select',
    name: 'framework',
    message: 'framework',
    choices: lang.frameworks.map((f) => ({ name: f.label, value: f.id })),
  });
  const fw = lang.frameworks.find((f) => f.id === framework);
  if (!fw) throw new Error(`unknown framework: ${framework}`);

  const native = fw.supportsNative
    ? await prompt<boolean>({
        kind: 'confirm',
        name: 'native',
        message: 'enable native packaging? (requires GraalVM CE 25)',
        default: false,
      })
    : false;

  return { language, framework: fw, native };
}
