# App mutation testing (TASK-305 / SYS-016)

The `core/` unit suite has good line coverage, but coverage alone never proves a
test would **fail** if the logic broke. Mutation testing does: it introduces a
small defect (a "mutant") into the source — flip a comparison, bump an index,
change a return — and reruns the tests. If the tests still pass, that mutant
**survived**, which means nothing asserts on the thing that broke.

We run [Stryker](https://stryker-mutator.io/) over the app's pure-logic layer and
gate on the mutation score. This mirrors the backend gate
(`media-manager/docs/mutation-testing.md`, TASK-306): same intent, same advisory
+ opt-out design, adapted to the JS/vitest stack.

## What is mutated

The set is `core/**/*.js` — declared as a **glob** in `stryker.conf.json`
(`mutate`), not a hand-maintained file list, so a new `core/` module is mutated
automatically with nothing to keep in sync. That is the whole pure-logic layer:
`core/` is DOM-free by architecture (`no-dom-in-core` arch check), so every line
in it is orthogonal logic a unit test can exercise directly.

`ui/**` and `app/**` are **not** mutated: they are DOM-bound, exercised only
through a live browser (Playwright e2e), and carry no orthogonal pure logic by
design (the cyclomatic=1 rule pushes every branch down into `core/`). Mutating
them would report survivors that no *unit* test could ever kill — noise, not
signal.

### Closing the "logic escaped into the UI" leak

The SYS-016 audit found render-arithmetic still living inline in
`ui/screens/screen-video-player.js` — outside the mutation set. TASK-305 pulled
each expression into a pure `core/player-math.js` helper (`progressPct`,
`clampTime`, `wrapIndex`, `frameDrop`), unit-tested in
`tests/unit/player-math.test.js`, and called from the screen. The DOM write stays
in the screen; only the computed value moved. That arithmetic is now mutation-
gated instead of escaping into the un-mutated UI layer — the same move TASK-309
made backend-side (the inline HTTP Range parser → `core/http_ranges.py`).

## Running it

Stryker and its vitest runner are dev-dependencies, so a plain install is enough:

```bash
npm install          # or npm ci
npm run test:mutation
```

The run mutates every `core/**` file, reruns the unit suite against each mutant,
and prints the surviving mutants plus a per-file score table. Inspect a survivor
by reading the `clear-text` report's diff for that file. **This runs locally, not
in CI** — as of 2026-07-14 (TASK-336) the `.github/workflows/mutation.yml` gate was
removed; a full pass is slow, and a per-merge Actions job burned minutes while its
result landed on `main` where nobody watched. It's now driven on demand by the
cross-repo sweep `claude-workflow/tools/mutation-all` (which runs this same
`npm run test:mutation`). Speed is handled by *when* you run it, never by narrowing
which tests run.

### Which tests run — the whole unit suite, opt-out

Stryker runs the **whole** `tests/unit/**` suite against each mutant — no
curated per-mutant test allowlist. Which tests actually touch a given mutant is
resolved automatically by `coverageAnalysis: "perTest"` (Stryker instruments the
initial run and, per mutant, reruns only the tests whose coverage touched the
mutated line). A new unit test counts automatically; a new `core/` module is
mutated automatically. Nothing to keep in sync — the point that bit the backend
twice.

## The gate — 100%, red until then

The bar is **zero survivors**: `thresholds.break` is 100 in `stryker.conf.json`,
so `stryker run` exits non-zero while any mutant is uncaught. Until the survivor
backlog is cleared the run stays **red** — that nag is deliberate, the standing
reminder that the unit suite isn't yet airtight, and it stops the moment the count
hits zero.

### How you find out it failed — the sweep output

The gate is no longer a CI job, so there's no auto-opened issue any more (TASK-336
removed both the `.github/workflows/mutation.yml` gate and its `mutation-gate` issue
notifier — a per-merge Actions run that burned minutes and reported to `main` where
nobody watching PRs looked). You find survivors by **running the sweep** — the
`claude-workflow/tools/mutation-all` output lists each repo's score, a survivor
excerpt, and a full-log link; a non-zero exit is the red signal. Run it (or
`npm run test:mutation` here) when you touch `core/` and drive survivors to zero
before you push.

To retire a survivor: **strengthen the unit test** so it asserts on the mutated
behaviour (the common case), or — if the mutant is provably **equivalent** (no
observable behaviour change) — narrow it out with an inline `// Stryker disable`
comment carrying a one-line reason. Never a blanket disable, never silence a real
survivor to make the gate pass.

This gate sits on top of the per-file `core/**` coverage floor (TASK-307): a
mutant can only be killed on a line a test executed, so a `core/` file below 100%
coverage (the TASK-315 backlog) contributes guaranteed survivors here. Clearing
those two backlogs converges — full coverage is the floor mutation strength is
built on.

## Current state (first run, 2026-07-06)

Full pass over `core/**` (39 files): **mutation score 76.61%** — 2665 mutants
killed, **629 survived**, 186 uncovered (no test touched the line), 4 timeouts.
The run takes ~50s locally.

The new `core/player-math.js` (the extracted residue) is at **100%**. Survivors
concentrate in the modules the TASK-315 coverage backlog also flags — the two
Queue-View models `video-queue-view.js` (211) and `queue-view.js` (165) dominate,
then `home-rails.js` (37), `companion-ws.js` (25), `ws-protocol.js` (18),
`nav-trail.js` (17), `device-colour.js` (17), `profile-config.js` (16),
`progress.js`/`state.js` (12–15). Several files already clear 100%
(`companion-button-modes`, `playlist-name`, `profile-rows`, `screen-chooser`,
`server-config`, `switch-profile`, `time`, `volume-store`, `companion-manifest`,
plus `player-math`). The `app-api.js` "uncovered" count (111) is the v3 API client
that TASK-315 notes sits at ~46% line coverage — no executed line, no killable
mutant.


Survivors are tracked as a follow-up under SYS-016 (see the app IMPL backlog,
alongside TASK-315's coverage lift). The gate **landed red by design** (TASK-306):
the point is to surface the gaps, not to gold-plate them away before the gate
exists.
