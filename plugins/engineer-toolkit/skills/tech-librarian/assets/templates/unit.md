---
# Optional. Base directory for file paths cited below, relative to the repo root.
# Omit or leave empty for flat-layout repos (paths are resolved from the repo root).
# In a monorepo, set this to the unit's subdirectory — e.g. `root: services/orders` —
# and write citations relative to that subdirectory (e.g. `src/handler.ts`, not
# `services/orders/src/handler.ts`). The staleness hook uses this to resolve
# citations; without it, monorepo paths silently fail to resolve.
root:
---

# `<unit-name>`

## Purpose
<One or two sentences. What is this unit authoritative for?>

## Tech stack
- Language / runtime: <e.g. PHP 8.3>
- Framework: <e.g. Laravel 11>
- Notable libraries: <only ones that shape how code is written here>

## Entry points
- <HTTP routes file, or `main`, or CLI command file> — `<path>`
- <Queue consumer / cron list> — `<path>`

## Data models owned
- `<Model>` — `<path/to/Model.ext:line>` — <one-line purpose>
- ...

## External dependencies
- **Other units:** <list, with the mechanism for each call>
- **Third-party APIs:** <list with purpose>
- **Infra:** <DBs, caches, queues this unit needs>

## Observable side effects
- <DB writes: which tables>
- <Queue publishes: which topics>
- <Outbound HTTP: which systems>
- <Emails, files, etc.>

## Where to start reading
1. `<path>` — <why>
2. `<path>` — <why>
3. `<path>` — <why>

## Sharp edges
<Gotchas specific to this unit.>
