# Tests — commands, flake, and the drift gates

```bash
npm run test:unit   # vitest — unit tests for core/ (run locally)
npm test            # playwright e2e — CI only; pre-push skips it
```

Mutation testing over `core/**` (Stryker) is its own gate — [`GATES-MUTATION.md`](GATES-MUTATION.md).

**Flake hunt — `npm run test:flake` (LOCAL, on demand, TASK-329).** Not a CI job:
same trigger model as the mutation sweep (owner's call — a whole-suite ×3 run on every
PR push isn't worth the Actions minutes). `scripts/flake-hunt.js` runs the **whole**
suite (Playwright's own `tests/*.test.js` discovery — no curated subset, no quarantine
allowlist to rot) `--repeat-each=3 --retries=0`, then prints a digest naming each test
that wasn't deterministically green. It asks a stricter question than `npm test`: not
"does it pass?" but "is it *deterministically* green under parallel load?"

```bash
npm run test:flake                      # whole suite x3, workers = cores (~4 min)
npm run test:flake -- --repeat 5        # hunt harder
npm run test:flake -- --workers 16      # hunt harder (more contention)
npm run test:flake -- tests/foo.test.js # scope it while chasing one suite
```

**It only finds what it can starve.** The flake is a *load* phenomenon, so the hunt is
only as good as the contention it creates — that's why it defaults to one worker per
core (2× Playwright's default) rather than mirroring a plain test run. Calibration from
TASK-329: at the stock default the suite went 1569/1569 green while CI's 2-core runners
named a real flake (BUG-055) on the same commit; at `--workers 16` the same box
reproduced it 3-for-3. **But the dial cuts both ways** — crank it far past your core
count and a `toBeVisible` can miss purely from resource starvation, which is not a real
settle-signal gap. Corroborate a finding (re-run it, or scope to that suite) before
chasing it, and prefer the default when you want a trustworthy signal.

Findings are **settle-signal gaps, not app bugs** — fix per the "residual flake" note
below: never `--retries`, never a longer timeout, never a skip. Not fixing it now?
Raise a follow-up so it isn't lost (that's how BUG-055 was raised).

**Backend contract conformance (SYS-017 / TASK-311).** `tests/unit/contract-conformance.test.js`
feeds the backend's OWN frozen response fixtures (TASK-310:
`grew-tv media-manager/tests/contract/*.json`) through the app's `core/` readers
(`home-rails`, `progress`, `tile-model`, `detail-view`, `series-detail`,
`player-math`) and goes RED when a backend field the app reads is renamed/removed —
the guard against silent stub↔backend drift. The fixtures live in the **private**
`DanGrew/grew-tv`, so they are **not** committed here: CI's `contract-conformance`
job sparse-checks-them-out into the gitignored `tests/.contract/` (needs a repo
secret **`GREW_TV_CONTRACT_TOKEN`** — a read token for grew-tv; the default
`GITHUB_TOKEN` can't clone a private repo). When `tests/.contract/` is **absent**
(any local `npm run test:unit` without the checkout) the suite **skips** — CI is the
gate. Populate it locally to run it: `npm run contract:pull`.

**Stub↔contract shape conformance (SYS-017 / TASK-326).** `tests/unit/stub-contract-shape.test.js`
closes the *other* half of the drift gap: TASK-311 checks `contract → readers`, but
the e2e stub (`tests/fixtures/api.js installApi`) could still emit a wrong field name
and nothing went red. This test compares the **key-set/nesting** (not values —
content differs by design) of the objects `installApi` emits per route
(browse/continue-watching/video/album/playlist), via the pure `*Response()` builders
the route handlers delegate to, against the same-route `tests/.contract/` fixture;
any renamed/added/dropped field on either side → RED. Legitimate shape gaps are
excused **per-key with a one-line reason** (`expectShape`'s `stubOnly`/`contractOnly`
maps) — never a blanket ignore; a stale exclusion also fails. Same gitignored
`tests/.contract/` + skip-when-absent as TASK-311, run in the **same CI
`contract-conformance` job** (no second private checkout). When you add a field the
app reads to `installApi`, mirror it on the backend contract (or excuse it with a
reason) or this goes red.

**Verify touched suites, not the whole world — CI is the gate.** When checking
a change locally, run the **touched + directly-relevant** e2e suites only
(`npx playwright test tests/<file>.test.js`). Do NOT re-run the full e2e suite
for confidence: it is slow and the repo carries a **pre-existing repo-wide
`toBeVisible` focus/nav flake** that fails ~75 unrelated tests under parallel
load but passes them in isolation. So **green-in-isolation + red-under-parallel
≠ a regression** — classify a suspicious failure with `--workers=1` (and/or
`--retries=2`, which tags flaky-vs-failed) before treating it as real, and
reason about whether your diff can even reach the failing suite. Re-running the
full suite repeatedly to "make sure" wastes time and tokens for no signal.

**The residual flake is a test-side settle-signal gap, not an app bug (BUG-019,
diagnosed 2026-06-28).** TASK-126 already killed the dominant cause (the live-WS
person-lock collision — the `installApi` default `person_active` stub). What
remained were tests that assert before the screen actually settles. Three confirmed
mechanisms — the first two fixed in `player-reset` / `playlist-bulk-add`, the third
swept repo-wide by TASK-329:
- **Auto-hide timer disarms a control mid-test.** The video player hides
  `#controls` 3s after the last input (`screen-video-player.js showControls`);
  when they hide, a focused button blurs. The video Reset tests armed `#btn-reset`
  then asserted `Reset?` — under load the 3s elapsed first, blur fired, the button
  disarmed back to `Reset`. **Fix: press a d-pad key (`ArrowDown`) right before
  arming** to re-kick the timer — exactly what the audio Reset tests already do.
- **Interacting before init wires the handlers.** A nav helper that awaits only
  `toHaveURL` lets the test click a header button (`#btn-add-all`) before the
  page's async load → `buildDetailList` has attached its click listener; the click
  is a silent no-op and the sheet never opens. **Fix: await a render signal that
  proves init finished** (e.g. `.detail-row` first row visible), like the
  `openAlbum` helper does — never `toHaveURL`-then-interact.
- **An async re-render replaces the node you resolved (TASK-329, the big one).**
  The profile picker paints TWICE: `initProfilePage` renders the placeholder
  persons (`child` / `grownup`) synchronously, then `loadConfig()` lands and
  `applyConfig` wipes `#profile-cards` and rebuilds every card. So `#btn-kids`
  **does not exist at first paint at all** — it only appears once config.json
  resolves. Nearly every suite opened with a bare
  `page.locator('#btn-kids').click()`, which had no settle signal and instead
  leaned on Playwright's actionability retry loop to span the fetch + rebuild;
  under parallel load that 10s budget ran out and the click "timed out on
  `#btn-kids`" — the recurring `goToVideoScreen` flake. **Fix: `pickPerson(page,
  id)` from `tests/fixtures/nav.js`, never a raw card click.** It awaits the
  picker's own settle marker (`#profile-cards[data-config="settled"]`, stamped by
  `screen-profile-page.js` once the fetched config is applied *or* failed). Same
  shape bit the `ended`-driven up-next overlay: `ended` is a **fire-once** event, so
  dispatching it before `/api/next` resolved meant no overlay was ever built and
  extra `toBeVisible` timeout headroom could never rescue it — `goToEpisode` gates on
  `#video-upnext` (the video page's last async signal) first.

Rule for new suites: **await the real post-nav settle signal (a rendered row /
the element you're about to use), never just the URL; keep auto-hiding player
controls alive with a key press before interacting; and if a screen re-renders
when its config/data lands, wait for the settle marker — a node from the first
paint may be a corpse.** Don't paper over any of it with `--retries`; the
`npm run test:flake` hunt above runs with retries off precisely so you can't.

**Running e2e from a secondary worktree — use your own port.** The Playwright
`webServer` is a `python3 -m http.server 3456` with `reuseExistingServer` on
(non-CI). If another worktree/session already has a server on `:3456`, your run
**reuses it** — and that server serves the *other* worktree's files, so your
tests (and any screenshots) silently exercise the wrong branch's code, often
still "passing". Two worktrees running e2e at once both hit the one `:3456`
tree. When a concurrent session may be testing, run e2e/screenshots from one
worktree at a time, or stand up your own `python3 -m http.server <port>` in your
worktree root and `page.goto('http://localhost:<port>/…')` with absolute URLs.

**Refs:** [`GATES.md`](GATES.md) · [`GATES-CHECKS.md`](GATES-CHECKS.md) · [`GATES-MUTATION.md`](GATES-MUTATION.md)
