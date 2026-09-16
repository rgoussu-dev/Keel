# Releases

One file per release, `CHANGELOG.<version>.md`, each carrying its own
compare link. `scripts/cut-changelog.sh <version>` moves the
`[Unreleased]` body of the root [`CHANGELOG.md`](../../CHANGELOG.md)
into a new file here and indexes it there.

A file here is **frozen once its version is tagged**: it records what
that release contained, not what anyone later wished it had.
