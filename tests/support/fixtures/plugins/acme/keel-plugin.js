/**
 * Fixture plugin — the smallest thing that is a real one.
 *
 * Plain JavaScript, no build step, and **no runtime dependency on
 * keel**: a plugin is a module exporting plain data written against
 * the composition vocabulary. A TypeScript author gets the types from
 * `@rgoussu.dev/keel/plugin`, which is erased at runtime; a
 * JavaScript author, like this one, needs nothing at all.
 *
 * It registers one stack and one vertical, and the vertical declares
 * a real `Conflict` — which is the point of the fixture. The engine
 * reads that rule twice, exactly as it reads a shipped piece's: once
 * to refuse `--build-system=fancy --module-layout=basic`, and once to
 * keep `basic` off the module-layout menu when `fancy` is chosen
 * interactively.
 *
 * It also emits a **deferred action**, because that is the other half
 * of what a plugin can do to a machine and the half a files-only
 * fixture would leave untested: an action runs after `tree.commit()`,
 * reaches an external tool through the `ProcessRunner` port, and is
 * skipped — printed, not run — under `--dry-run`.
 *
 * And it contributes a **skill** — a content-carrying `SkillSpec` the
 * engine stages to `.claude/skills/greet/SKILL.md` with the same
 * rendering, collision refusal and manifest provenance a shipped
 * adapter's skills get, the vertical declaring the name in `skills`.
 */

/** The plugin's name — its message attribution and its template namespace. */
const NAME = 'acme';

/**
 * `plugin:<name>/<path>`, the id namespace the routing template
 * source dispatches on. keel exports `pluginTemplateId` for this;
 * spelled inline here so the fixture stays dependency-free, which is
 * a property worth proving.
 */
const templateId = (assetPath) => `plugin:${NAME}/${assetPath}`;

const PLAIN_BUILD = {
  id: 'plain',
  tag: 'acme.build.plain',
  label: 'plain — the ordinary acme build',
  doc: 'Assembles under either module layout.',
};

const FANCY_BUILD = {
  id: 'fancy',
  tag: 'acme.build.fancy',
  label: 'fancy — the acme build with the extras',
  doc: 'Needs a module boundary to put the extras behind.',
};

const BASIC_LAYOUT = {
  id: 'basic',
  tag: 'layout.basic',
  label: 'basic — flat trisection',
  doc: 'One hexagon for the whole widget.',
};

const MODULITH_LAYOUT = {
  id: 'modulith',
  tag: 'layout.modulith',
  label: 'modulith — one hexagon per bounded context',
  doc: 'Contexts under modules/, shared plumbing under platform/.',
};

/**
 * The marker the plugin's deferred action leaves behind.
 *
 * Written by a *subprocess*, through the `ProcessRunner` port the
 * action is handed, rather than by this module calling `fs` itself —
 * so what the test observes is the port having been wired to a real
 * runner with the project's own cwd, not merely that a callback ran.
 */
const STAMP_FILE = 'acme-stamp.txt';

/** Renders the plugin's own template tree through the shared port. */
const greetingAdapter = {
  id: 'acme-greeting/file',
  vertical: 'acme-greeting',
  covers: ['greeting'],
  predicate: { requires: ['lang.acme'] },
  questions: [
    {
      id: 'who',
      prompt: 'Greet whom?',
      doc: 'The name the generated greeting addresses.',
      default: 'world',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const who = ctx.answer('who');
    return {
      files: await ctx.templates.render(templateId('greeting/templates'), '', { who }),
      // A skill, through the same seam a shipped adapter uses: a
      // content-carrying spec the engine renders and stages — never a
      // path into the plugin's own tree.
      skills: [
        {
          name: 'greet',
          description: 'Read the acme greeting aloud. Use when asked to greet.',
          body: `# Greet\n\nRead GREETING.md and greet ${who}.`,
        },
      ],
      tagsAdd: ['acme.greeting'],
      actions: [
        {
          id: 'acme-greeting/stamp',
          description: `stamp the greeting for ${who}`,
          run({ cwd, processes, logger }) {
            const result = processes.run(
              process.execPath,
              [
                '-e',
                `require('node:fs').writeFileSync(process.argv[1], process.argv[2] + '\\n')`,
                STAMP_FILE,
                who,
              ],
              { cwd },
            );
            if (result.status !== 0) {
              throw new Error(`acme stamp failed (${result.status}): ${result.stderr}`);
            }
            logger.info(`acme: stamped ${STAMP_FILE}`);
            return Promise.resolve();
          },
        },
      ],
    };
  },
};

/** The vertical, and the owner of the rule. */
export const greetingVertical = {
  id: 'acme-greeting',
  description: 'A greeting, in the acme house style.',
  dimensions: ['greeting'],
  adapters: [greetingAdapter],
  promotes: ['acme.greeting'],
  skills: ['greet'],
  conflicts: [
    {
      id: 'acme/fancy-needs-modulith',
      when: ['acme.build.fancy', 'layout.basic'],
      reason:
        "acme's fancy build needs a module boundary — scaffold it with --module-layout=modulith, or use the plain build",
    },
  ],
};

/** The stack, offering both dials so the rule has something to bite. */
export const widgetStack = {
  id: 'acme-widget',
  description: 'Acme widget — a greeting and nothing else.',
  tags: ['lang.acme', 'arch.hexagonal', 'arch.cli'],
  buildSystems: [PLAIN_BUILD, FANCY_BUILD],
  moduleLayouts: [BASIC_LAYOUT, MODULITH_LAYOUT],
  verticals: [greetingVertical],
};

export default {
  name: NAME,
  stacks: [widgetStack],
  verticals: [greetingVertical],
  assets: 'assets',
};
