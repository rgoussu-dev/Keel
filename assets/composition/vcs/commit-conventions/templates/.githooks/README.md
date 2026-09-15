# Git hooks

Tracked hooks, run by git through `core.hooksPath`. They are in the
repository rather than in `.git/hooks/` so that they are a property of
the project and not of one machine.

**Each clone enables them once:**

```sh
git config core.hooksPath .githooks
```

`keel new` and `keel add vcs` run that for you in the directory they
scaffolded; a colleague cloning afterwards runs it themselves.

| Hook         | What it refuses                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `commit-msg` | A subject line that is not a [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/). |

To bypass one deliberately, `git commit --no-verify` — which the
project's own conventions rule out for anything but a genuine
emergency, since a bypassed gate is a gate nobody trusts again.
