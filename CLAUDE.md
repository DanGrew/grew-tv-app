# grew-tv-app — root index

Browse + play web app for the Grew family home video system, served by media-manager (`grew-tv` repo) — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

⛔ **Process rules are not here** — they live in **claude-workflow**:

- `docs/WAYS.md` — worktrees, draft-PR / never-merge, hand-off. An index; read the part you need.
- the grew-tv entry (`claude-config/grew-product-dir grew-tv`) — this product's board, specs and deltas.

## Start here

Root holds only this file and `README.md`; everything else is `docs/`, flat, area in the name.

| name | what it holds | read it when |
|---|---|---|
| `docs/ARCHITECTURE.md` | the serving model, the layer rules, and the grouped `core/`/`ui/screens/` module index | ⭐ **any code change** — start here to find where a thing lives, or to add a module/screen |
| `docs/GATES.md` | index — what has to be green, and where each rule lives | before you push, or a gate went red |
| `docs/DEV.md` | run commands (worktree-safe), git/GitHub specifics, tooling | you're standing up a local run, or about to branch/push |
| `docs/VERIFY.md` | index — the visual-regression coverage registry and golden-story spec (flows live in `verify-flows/`) | you're authoring or extending a `verify-flows/*.cjs` flow |

## True before you open anything

| ⛔ non-negotiable | it is specified in |
|---|---|
| **Cyclomatic complexity is capped at 1** for every function in `ui/**` and `app/**` inline scripts — `core/` is exempt. | `docs/GATES-CHECKS.md` |
| **A detail/browse change ships its companion mirror in the SAME task** (FEAT-017/028 mirror invariant: companion drives, TV mirrors). | `docs/GATES-CHECKS.md` |
| **A `core/` logic change ships a test that would fail if the logic broke** — `core/**` is mutation-gated by Stryker, target 100%, no opt-out exclusions. | `docs/GATES-MUTATION.md` |
| **Never hand the user a `git pull`/`git checkout`/"run from primary" step** — point the run command at the worktree, always. | `docs/DEV.md` |

**Refs:** `README.md`
