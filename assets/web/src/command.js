/**
 * The same install, as the command line that would produce it.
 *
 * The page and the CLI are two primary adapters over one mediator, so
 * every state this form can reach is a `keel new` or `keel add`
 * somebody could have typed. Showing that line is the cheapest thing
 * the page can do with the fact: it is what goes in a README, what
 * gets pasted into CI, and how a user who started here learns the
 * command they will use from then on.
 *
 * Derived from exactly the body the page posts — `cwd`, `target`,
 * `answers` — so it cannot describe a different install than the one
 * the Generate button runs. `--yes` is on every line because the
 * page has already answered everything the terminal would prompt for.
 *
 * Pure, and separate from any element, so the translation is testable
 * without a DOM — the same split `tree.js` and `finder.js` live under.
 *
 * @typedef {{ kind: 'command' | 'flag' | 'value', text: string }} Token
 */

/**
 * The command equivalent to an install body, as highlightable tokens.
 *
 * @param {{ cwd: string, target: object | null, answers: Record<string, Record<string, string>> }} body
 * @returns {Token[]} empty when the target names no command yet
 */
export function commandFor({ target, answers }) {
  if (!target) return [];
  const tokens = [{ kind: 'command', text: 'keel' }];
  if (target.kind === 'new-project') {
    if (!target.stack) return [];
    tokens.push({ kind: 'command', text: 'new' });
    flag(tokens, '--stack', target.stack);
    flag(tokens, '--layout', target.layout);
    flag(tokens, '--build-system', target.buildSystem);
    flag(tokens, '--module-layout', target.moduleLayout);
    if (target.withPeerContext === true) tokens.push({ kind: 'flag', text: '--with-peer-context' });
    // A product's extras are each service's, spelled `path:id` — the
    // form `--with` names a service in.
    const extras = [
      ...(Array.isArray(target.extraVerticals) ? target.extraVerticals : []),
      ...Object.entries(target.services ?? {}).flatMap(([path, service]) =>
        (Array.isArray(service?.extraVerticals) ? service.extraVerticals : []).map(
          (id) => `${path}:${id}`,
        ),
      ),
    ];
    if (extras.length > 0) flag(tokens, '--with', extras.join(','));
    // Only the opt-out has a flag: the harness is on unless left out.
    if (target.agentHarness === false) tokens.push({ kind: 'flag', text: '--no-agent-harness' });
  } else if (target.kind === 'add-vertical') {
    // `vertical` is the one-vertical alias the API still takes.
    const verticals = Array.isArray(target.verticals)
      ? target.verticals
      : target.vertical
        ? [target.vertical]
        : [];
    if (verticals.length === 0) return [];
    tokens.push({ kind: 'command', text: 'add' });
    for (const vertical of verticals) tokens.push({ kind: 'value', text: quote(vertical) });
    if (Array.isArray(target.refresh) && target.refresh.length > 0) {
      flag(tokens, '--refresh', target.refresh.join(','));
    }
    if (target.reapply === true) tokens.push({ kind: 'flag', text: '--reapply' });
  } else if (target.kind === 'add-module') {
    if (!target.module) return [];
    tokens.push(
      { kind: 'command', text: 'add' },
      { kind: 'command', text: 'module' },
      { kind: 'value', text: target.module },
    );
    flag(tokens, '--consumes', target.consumes);
  } else {
    return [];
  }

  // Only the answers the user actually moved: `answers` holds what
  // this session changed, and everything else the run defaults.
  for (const [adapter, questions] of Object.entries(answers ?? {})) {
    for (const [question, value] of Object.entries(questions)) {
      tokens.push({ kind: 'flag', text: '--set' });
      tokens.push({ kind: 'value', text: quote(`${adapter}:${question}=${value}`) });
    }
  }

  tokens.push({ kind: 'flag', text: '--yes' });
  return tokens;
}

/** The command as one line, for the clipboard. */
export function commandText(tokens) {
  return tokens.map((token) => token.text).join(' ');
}

/**
 * A sentence keel wrote, split where it names a command-line flag —
 * `--module-layout=modulith` — so the page can set the flag as one
 * unbreakable literal. A browser wraps a line after any hyphen, and a
 * flag broken after its `--` is a flag nobody can read or copy.
 *
 * A value belongs to its flag when joined by `=`; a full stop after it
 * ends the sentence, not the value.
 *
 * @param {string} text
 * @returns {{ text: string, flag: boolean }[]} every character of `text`, in order
 */
export function flagSpans(text) {
  const spans = [];
  let from = 0;
  for (const match of text.matchAll(/--[a-z][a-z0-9-]*(?:=[\w./:-]*[\w/-])?/g)) {
    const at = match.index ?? 0;
    if (at > from) spans.push({ text: text.slice(from, at), flag: false });
    spans.push({ text: match[0], flag: true });
    from = at + match[0].length;
  }
  if (from < text.length) spans.push({ text: text.slice(from), flag: false });
  return spans;
}

function flag(tokens, name, value) {
  if (value === undefined || value === null || value === '') return;
  tokens.push({ kind: 'flag', text: name });
  tokens.push({ kind: 'value', text: quote(String(value)) });
}

/**
 * POSIX single-quoting, applied only where a shell would need it.
 *
 * Quoting everything would be safe and unreadable — `--stack
 * 'quarkus-cli'` is noise — so the plain case stays plain and
 * anything with whitespace or a metacharacter gets the treatment.
 */
function quote(value) {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
