# Header template — derived files

Every file in this repository that is `Verbatim` or `Adapted` from a
third-party source must carry a provenance header at the top. The header
points to the upstream file, pins the commit it was lifted from, names the
original author and license, and (for adapted files) lists the substantive
changes.

The body of this document gives the templates per file type. Replace the
`<placeholders>` with concrete values; do not leave any placeholder in a
committed file.

## Required fields

- **Source URL** — permalink to the upstream file at a specific commit.
  Use the SHA, never `main`.
- **Original author** — copyright holder as named in the upstream LICENSE.
- **Original license** — name + relative link into
  `THIRD_PARTY_LICENSES/`.
- **Upstream commit** — full 40-char SHA. Must match the pinned commit in
  the relevant `*.NOTICE.md` (or be a deliberate one-off, in which case
  add a row to the NOTICE).
- **Type** — `Verbatim` or `Adapted`. (`Inspired` files do not require a
  header but should still get a one-line acknowledgment in their own
  README or a comment near the top.)
- **Modifier copyright** — `<YYYY>` is the year of modification,
  `<holder>` is whoever made the change (default for this repo: as
  named in the root `LICENSE`), `<license>` is the license your
  modification carries (typically the same as the repo).
- **Modifications** — required for `Adapted`; bullet list of substantive
  deltas. Omit for `Verbatim`.

## Markdown (`.md`)

```markdown
<!--
Adapted from citypaul/.dotfiles
  Source:           https://github.com/citypaul/.dotfiles/blob/<sha>/<path>
  Original author:  Paul Hammond
  Original license: MIT — see THIRD_PARTY_LICENSES/citypaul-dotfiles.LICENSE
  Upstream commit:  <40-char SHA>
  Type:             Adapted
Modifications © <YYYY> <holder>, <license>.
Changes from upstream:
  - <bullet>
  - <bullet>
-->
```

For `Verbatim` files, use the same block but drop the `Modifications` /
`Changes from upstream` lines and set `Type: Verbatim`.

### Markdown with YAML frontmatter (Claude Code agents, skills)

When a Markdown file requires YAML frontmatter at line 1 (Claude Code
agent files, `SKILL.md` files), the provenance comment must appear
**after** the closing `---`, not before. Putting any content above the
opening `---` breaks the frontmatter parser and confuses prettier into
treating `---` as a horizontal rule. Layout:

```markdown
---
name: <agent-or-skill-name>
description: >
  <description>
tools: <comma-separated tools>
model: <model>
color: <color>
---

<!--
Adapted from citypaul/.dotfiles
  ... (same fields as above) ...
-->

# <H1 title>
```

Even with this layout, prettier should be told not to format the
directory: add the path to `.prettierignore` (e.g.
`assets/global/agents/`). This is defense-in-depth in case a future
prettier release changes its handling of `---`.

## Shell (`.sh`, `.bash`, `.zsh`)

```sh
# Adapted from citypaul/.dotfiles
#   Source:           https://github.com/citypaul/.dotfiles/blob/<sha>/<path>
#   Original author:  Paul Hammond
#   Original license: MIT — see THIRD_PARTY_LICENSES/citypaul-dotfiles.LICENSE
#   Upstream commit:  <40-char SHA>
#   Type:             Adapted
# Modifications (c) <YYYY> <holder>, <license>.
# Changes from upstream:
#   - <bullet>
#   - <bullet>
```

Place the block immediately after the shebang.

## TypeScript / JavaScript (`.ts`, `.tsx`, `.js`, `.mjs`)

```ts
/**
 * Adapted from citypaul/.dotfiles
 *   Source:           https://github.com/citypaul/.dotfiles/blob/<sha>/<path>
 *   Original author:  Paul Hammond
 *   Original license: MIT — see THIRD_PARTY_LICENSES/citypaul-dotfiles.LICENSE
 *   Upstream commit:  <40-char SHA>
 *   Type:             Adapted
 * Modifications (c) <YYYY> <holder>, <license>.
 * Changes from upstream:
 *   - <bullet>
 *   - <bullet>
 */
```

The block sits at the very top of the file, before any `import` statements.

## PowerShell (`.ps1`)

```powershell
# Adapted from citypaul/.dotfiles
#   Source:           https://github.com/citypaul/.dotfiles/blob/<sha>/<path>
#   Original author:  Paul Hammond
#   Original license: MIT — see THIRD_PARTY_LICENSES/citypaul-dotfiles.LICENSE
#   Upstream commit:  <40-char SHA>
#   Type:             Adapted
# Modifications (c) <YYYY> <holder>, <license>.
# Changes from upstream:
#   - <bullet>
#   - <bullet>
```

## JSON (`.json`)

JSON does not allow comments. When importing a JSON file:

1. Add the row to the relevant `*.NOTICE.md` as usual.
2. Place a sibling `<filename>.NOTICE.md` next to the JSON file with the
   header content as Markdown. The two files travel together.

## Updating an adapted file

When a future change to an adapted file diverges further from upstream,
append a new bullet to the `Changes from upstream` list — do not rewrite
history. The list is the audit trail for what we changed and why.

When refreshing against a new upstream commit, update the `Upstream
commit` line and append a `Changes from upstream` bullet of the form
`Refreshed against upstream <new-sha>; <one-line summary of merged
deltas>`.
