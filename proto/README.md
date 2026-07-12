# ⚠️ PROTOTYPE — grew-tv → atlas handover door (throwaway)

These two pages are a **throwaway validation spike** (2026-07-12) proving the
grew-tv → atlas handover — one tap crossing both the TV and the phone into the
atlas, reusing grew-tv's existing WS intent plane (`launchExternal` intent), with
**zero backend changes**:

- `atlas-door.html` — TV-side door: registers as a device, crosses to the atlas on
  a `launchExternal` intent (or a direct Select)
- `atlas-door-companion.html` — phone-side door: sends `launchExternal` (crossing
  the TV) and walks itself to the atlas remote

**REMOVE this whole `proto/` dir after `FEAT-049` (the generic external-destination
door) is implemented.** It stands in for the real config-driven tile on the grew-tv
home screen; the real feature replaces it. Gates were not run (spike quality).

Design capture: `claude-workflow/homeschooling/workflow/specs/raw/atlas-on-tv-integration.md`.
