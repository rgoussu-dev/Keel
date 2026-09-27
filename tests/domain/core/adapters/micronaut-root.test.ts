/**
 * Tests for the two lists a Micronaut composition root keeps, read and
 * widened by `micronaut-root.ts` for `keel add module` and persistence
 * alike.
 *
 * Those two arrive in either order, after the peer context or without
 * it, so each helper reads more than one shape: the bootstrap's
 * rendering, the peer context's, and its own re-emit. Source strings
 * in and out, one shape at a time; what the scaffolds make of them
 * through the real mediator is `handlers/persistence-peer-context` and
 * `jvm-context`.
 */

import { describe, expect, it } from 'vitest';
import {
  fenceClose,
  fenceOpen,
  FENCE_OFF,
  FENCE_ON,
} from '../../../../src/domain/core/adapters/jvm-context.js';
import {
  IMPORT_NOTE,
  widenImportPackages,
  widenKotlinMediator,
} from '../../../../src/domain/core/adapters/micronaut-root.js';

const INDENT = '    ';
const GREET = '"com.example.greeting.domain.core.greet"';
const SIGNING = '"com.example.guestbook.domain.core.signing"';
const ORDERING = '"com.example.ordering.domain.core"';

/** `@Import` on `MediatorFactory`, its `packages` member as given. */
const javaRoot = (packages: readonly string[]): string =>
  [
    '@Factory',
    '@Import(',
    ...packages,
    `${INDENT}annotated = "com.example.platform.kernel.DomainHandler")`,
    'public class MediatorFactory {}',
    '',
  ].join('\n');

/** The bootstrap's member: the fenced single string. */
const BOOTSTRAP_IMPORT = javaRoot([
  ...fenceOpen(INDENT, IMPORT_NOTE),
  `${INDENT}packages = ${GREET},`,
  fenceClose(INDENT),
]);

/** The peer context's member: a brace list, the note repeated under the bootstrap's. */
const PEER_IMPORT = javaRoot([
  ...fenceOpen(INDENT, IMPORT_NOTE),
  ...IMPORT_NOTE.map((line) => `${INDENT}// ${line}`),
  `${INDENT}packages = {`,
  `${INDENT}    ${GREET},`,
  `${INDENT}    ${SIGNING}`,
  `${INDENT}},`,
  fenceClose(INDENT),
]);

const count = (source: string, text: string): number => source.split(text).length - 1;

describe('widenImportPackages', () => {
  it('turns the bootstrap’s single string into a fenced list, one entry a line', () => {
    const widened = widenImportPackages(BOOTSTRAP_IMPORT, ORDERING);

    expect(widened).toBe(
      javaRoot([
        ...fenceOpen(INDENT, IMPORT_NOTE),
        `${INDENT}packages = {`,
        `${INDENT}    ${GREET},`,
        `${INDENT}    ${ORDERING}`,
        `${INDENT}},`,
        fenceClose(INDENT),
      ]),
    );
  });

  it('keeps the fence and its note once over the peer context’s doubled note', () => {
    const widened = widenImportPackages(PEER_IMPORT, ORDERING) ?? '';

    expect(widened).toContain(`${INDENT}    ${SIGNING},\n${INDENT}    ${ORDERING}\n${INDENT}},`);
    expect(count(widened, IMPORT_NOTE[0] as string)).toBe(1);
    expect(count(widened, FENCE_OFF)).toBe(1);
    expect(count(widened, FENCE_ON)).toBe(1);
  });

  it('reads its own re-emit, and leaves a package already listed where it is', () => {
    const once = widenImportPackages(PEER_IMPORT, ORDERING) ?? '';

    expect(widenImportPackages(once, ORDERING)).toBe(once);
    expect(widenImportPackages(PEER_IMPORT, SIGNING)).toBe(PEER_IMPORT);
  });

  it('is null on a root with no packages list', () => {
    expect(widenImportPackages('public class MediatorFactory {}\n', ORDERING)).toBeNull();
  });

  it('is null on a list with a comment among its entries, which it would re-emit as code', () => {
    // Split on its commas, `// greeting, the skeleton` becomes an entry
    // of its own, and the comma after the comment is commented out.
    for (const entry of [`${GREET} // greeting, the skeleton`, `/* greeting */ ${GREET}`]) {
      const commented = javaRoot([`${INDENT}packages = {`, `${INDENT}    ${entry}`, `${INDENT}},`]);

      expect(widenImportPackages(commented, ORDERING)).toBeNull();
    }
  });
});

/** A Kotlin `MediatorFactory` around the given `mediator` function. */
const kotlinRoot = (mediator: readonly string[]): string =>
  [
    '@Factory',
    'class MediatorFactory {',
    `${INDENT}@Singleton`,
    ...mediator,
    '',
    `${INDENT}@Singleton`,
    `${INDENT}fun greetingService(mediator: Mediator): GreetingService = GreetingServiceAdapter(mediator)`,
    '}',
    '',
  ].join('\n');

/** The form every widening re-emits, which the next one reads back. */
const canonical = (params: readonly string[], handlers: readonly string[]): string =>
  kotlinRoot([
    `${INDENT}fun mediator(`,
    ...params.map((p) => `        ${p},`),
    `${INDENT}): Mediator =`,
    '        RegistryMediator(',
    '            listOf(',
    ...handlers.map((h) => `                ${h},`),
    '            ),',
    '        )',
  ]);

const BOOTSTRAP_MEDIATOR = kotlinRoot([
  `${INDENT}fun mediator(): Mediator = RegistryMediator(listOf(GreetHandler()))`,
]);

const PEER_MEDIATOR = kotlinRoot([
  `${INDENT}fun mediator(welcome: Welcome): Mediator =`,
  '        RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))',
]);

describe('widenKotlinMediator', () => {
  it('re-emits the bootstrap’s one-liner whole, the parameter and the entry together', () => {
    expect(
      widenKotlinMediator(BOOTSTRAP_MEDIATOR, ['ordering: OrderingHandler'], ['ordering']),
    ).toBe(canonical(['ordering: OrderingHandler'], ['GreetHandler()', 'ordering']));
  });

  it('adds after what the peer context’s two-handler form holds', () => {
    expect(
      widenKotlinMediator(
        PEER_MEDIATOR,
        ['greetingLog: GreetingLog', 'clock: Clock'],
        ['RecordGreetingHandler(greetingLog, clock)'],
      ),
    ).toBe(
      canonical(
        ['welcome: Welcome', 'greetingLog: GreetingLog', 'clock: Clock'],
        ['GreetHandler()', 'SignHandler(welcome)', 'RecordGreetingHandler(greetingLog, clock)'],
      ),
    );
  });

  it('reads its own re-emit, so running again changes nothing', () => {
    const once = widenKotlinMediator(PEER_MEDIATOR, ['ordering: OrderingHandler'], ['ordering']);

    expect(typeof once).toBe('string');
    expect(widenKotlinMediator(once as string, ['ordering: OrderingHandler'], ['ordering'])).toBe(
      once,
    );
  });

  it('adds only what is missing when the parameter or the entry is there already', () => {
    const paramOnly = canonical(['ordering: OrderingHandler'], ['GreetHandler()']);
    const entryOnly = canonical([], ['GreetHandler()', 'ordering']);
    const both = canonical(['ordering: OrderingHandler'], ['GreetHandler()', 'ordering']);

    expect(widenKotlinMediator(paramOnly, ['ordering: OrderingHandler'], ['ordering'])).toBe(both);
    expect(widenKotlinMediator(entryOnly, ['ordering: OrderingHandler'], ['ordering'])).toBe(both);
  });

  it('counts a parameter as there by its name and type, whatever the spacing', () => {
    const spaced = kotlinRoot([
      `${INDENT}fun mediator(clock:Clock): Mediator = RegistryMediator(listOf(GreetHandler()))`,
    ]);

    expect(widenKotlinMediator(spaced, ['clock: Clock'], ['Tick(clock)'])).toBe(
      canonical(['clock:Clock'], ['GreetHandler()', 'Tick(clock)']),
    );
  });

  it('names the parameter rather than add a second of its name under another type', () => {
    // `keel add module clock`, then persistence's `clock: Clock`: two
    // parameters of one name do not compile.
    const clockContext = canonical(['clock: ClockHandler'], ['GreetHandler()', 'clock']);

    expect(
      widenKotlinMediator(
        clockContext,
        ['greetingLog: GreetingLog', 'clock: Clock'],
        ['RecordGreetingHandler(greetingLog, clock)'],
      ),
    ).toEqual({ taken: 'clock' });
    expect(widenKotlinMediator(PEER_MEDIATOR, ['welcome: WelcomeHandler'], ['welcome'])).toEqual({
      taken: 'welcome',
    });
  });

  it('reads what is inside a string as the string’s, not a comment or a comma of the list', () => {
    const echoes = kotlinRoot([
      `${INDENT}fun mediator(): Mediator =`,
      '        RegistryMediator(listOf(GreetHandler(), Echo("https://example.com"), Echo("a, (b")))',
    ]);

    expect(widenKotlinMediator(echoes, ['ordering: OrderingHandler'], ['ordering'])).toBe(
      canonical(
        ['ordering: OrderingHandler'],
        ['GreetHandler()', 'Echo("https://example.com")', 'Echo("a, (b")', 'ordering'],
      ),
    );
  });

  it('is null on a mediator it could not write back as it was', () => {
    const shapes: readonly (readonly string[])[] = [
      // A block body, which the expression it re-emits would strip of
      // its `return`, leaving the braces unmatched.
      [
        `${INDENT}fun mediator(): Mediator {`,
        '        return RegistryMediator(listOf(GreetHandler()))',
        `${INDENT}}`,
      ],
      // Something beside the list in RegistryMediator(…), which it would drop.
      [`${INDENT}fun mediator(): Mediator = RegistryMediator(strict, listOf(GreetHandler()))`],
      [`${INDENT}fun mediator(): Mediator = RegistryMediator(listOf(GreetHandler()), strict)`],
      // A comment among the parameters or the handlers, which it would
      // split on its commas and re-emit as code.
      [
        `${INDENT}fun mediator(welcome: Welcome /* the peer's, its port */): Mediator =`,
        '        RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))',
      ],
      [
        `${INDENT}fun mediator(): Mediator =`,
        '        RegistryMediator(listOf(GreetHandler() // greeting, the skeleton',
        '        ))',
      ],
    ];

    for (const shape of shapes) {
      expect(widenKotlinMediator(kotlinRoot(shape), ['a: A'], ['a'])).toBeNull();
    }
  });

  it('is null on a root with no mediator building a RegistryMediator(listOf(…))', () => {
    expect(widenKotlinMediator('class MediatorFactory\n', ['a: A'], ['a'])).toBeNull();
    expect(
      widenKotlinMediator(
        kotlinRoot([`${INDENT}fun mediator(): Mediator = build()`]),
        ['a: A'],
        ['a'],
      ),
    ).toBeNull();
  });
});
