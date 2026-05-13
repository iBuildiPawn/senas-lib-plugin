# `<repo-name>` — Librarian Index

<One-line pitch: what is this repo and why does it exist?>

**Last updated:** <YYYY-MM-DD> · **Against commit:** `<short-sha>`

## Start here
- [Overview](overview.md) — shape, stack, who runs this
- [Onboarding](onboarding.md) — first-day-as-a-dev checklist
- [Architecture](architecture.md) — topology, cross-unit map, infra
- [API catalog](api-catalog.md) — externally-exposed APIs
- [Dependencies](dependencies.md) — 3rd-party libs with role notes

## Units
<List every file in `units/` with a one-line description. Keep the line short — longer notes belong in the unit's own file.>

- [unit-a](units/unit-a.md) — <purpose in 6-10 words>
- [unit-b](units/unit-b.md) — <purpose in 6-10 words>
- ...

## How to use this index
- Any question? Open the doc that best fits, then follow `file:line` citations into the live code.
- See something wrong? Fix the affected `.librarian/*.md` file and bump `last_updated_sha` in `.meta.json`.
- Major architectural change shipped? Ask Claude to refresh the librarian.
