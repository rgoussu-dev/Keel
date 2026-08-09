# infrastructure

The secondary adapters — one directory per port, technology named in
the module, and **every port ships its canonical in-memory fake**
alongside the real adapter (binding spec §1/§3):

| Port           | Real adapter                                           | Fake                                              |
| -------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Tree           | `tree/fs-tree.ts` (staged fs)                          | `tree/fake.ts`                                    |
| Prompt         | `prompt/inquirer-prompt.ts`                            | `prompt/fake.ts`                                  |
| ManifestStore  | `manifest/fs-manifest-store.ts`                        | `manifest/fake.ts`                                |
| TemplateSource | `template/ejs-template-source.ts`                      | `template/fake.ts`                                |
| ProcessRunner  | `process/spawn-process-runner.ts`                      | `process/fake.ts`                                 |
| Logger, Clock  | `commons/console-logger.ts`, `commons/system-clock.ts` | `commons/fake-logger.ts`, `commons/fake-clock.ts` |

Everything here depends on `domain/kernel` + `domain/contract` only,
and adapters never import each other — both enforced by
dependency-cruiser. Alternative Tree substrates (a Yjs CRDT, a remote
VFS) would ship as separate packages implementing the same port.
