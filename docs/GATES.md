# grew-tv-app — the gates

⛔ **INDEX.** What has to be green, and where each rule lives. CI is the real gate — a
local pass is a convenience, not the answer.

| doc | what it holds | read it when |
|---|---|---|
| [`GATES-CHECKS.md`](GATES-CHECKS.md) | style guidelines, the cyclomatic=1 pattern, the pre-flight landmine list, and how to run every check by hand | ⭐ **before you edit** any `ui/**` or `app/**` file, or before you push |
| [`GATES-TESTS.md`](GATES-TESTS.md) | unit/e2e commands, the flake hunt, contract-conformance + stub-shape gates, and the confirmed residual-flake causes | you're writing or debugging a test, or a suite is flaky |
| [`GATES-MUTATION.md`](GATES-MUTATION.md) | the Stryker mutation gate over `core/**` — what's mutated, how to run it, how to retire a survivor | you touched `core/` logic |

**Refs:** [`../CLAUDE.md`](../CLAUDE.md)
