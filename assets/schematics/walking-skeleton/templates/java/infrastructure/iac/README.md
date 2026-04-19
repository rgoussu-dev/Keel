# infrastructure/iac

Every piece of infrastructure lives in this directory (or a sibling repo,
depending on scope). OpenTofu is the default; no infrastructure changes
happen outside of IaC.

## Workflow

1. `tofu init` — initialise backend + providers for the current workspace.
2. `tofu plan -out tfplan` — review the proposed diff.
3. `tofu apply tfplan` — apply, with review / approval.

## Rules

- Secrets never land in state. Use a secret manager and reference it.
- Each environment (dev, staging, prod) has its own state file.
- State is remote, never committed.
- Destroying shared resources requires an explicit `-target` plus human
  confirmation.
