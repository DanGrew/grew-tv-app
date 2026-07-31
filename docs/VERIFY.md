# grew-verify — visual-regression flows

⛔ **INDEX.** The flow scripts themselves stay in `verify-flows/*.cjs` (code, not docs) —
only the two planning documents moved here.

| doc | what it holds | read it when |
|---|---|---|
| [`VERIFY-COVERAGE.md`](VERIFY-COVERAGE.md) | the `(surface, function/state)` coverage registry and the harness contract | you spot a missing snapshot, or ship a feature on a covered surface |
| [`VERIFY-STORIES.md`](VERIFY-STORIES.md) | the owner-authored golden-story spec — journeys, DATA anchors, determinism rules | ⚠️ **reference/proposal under owner review, not a build commitment** — read before authoring a new flow |

⚠️ **Both are over the 150-line doc target** (`VERIFY-COVERAGE.md` ~118, `VERIFY-STORIES.md`
~415) — flagged, not split. Splitting a live coverage matrix or an owner's still-under-review
story spec is an editorial call this move doesn't make; recorded here for the next pass.

**Refs:** [`../CLAUDE.md`](../CLAUDE.md)
