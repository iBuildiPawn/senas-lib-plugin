---
name: tech-librarian
description: Build and maintain a persistent technical knowledge base of a repository — services, APIs, data models, infrastructure, dependencies, and how units talk to each other. Invoke when onboarding to an unfamiliar codebase, asking architectural questions like "how does X flow", "what calls Y", "where does Z live", "what does this service do", needing a first-day-as-a-dev briefing on the technical layer, or wanting to refresh existing tech-librarian docs after significant changes. This skill covers technical architecture only — for business workflows, domain glossary, or actors, use a separate domain-focused skill.
---

# Technical Librarian

A librarian's job is not to have read every book — it is to know where every book lives and what's inside it. This skill does the same for a codebase. It builds a persistent knowledge base in `.librarian/` at the repo root, and then consults that knowledge base to answer questions.

Two modes, same skill:

- **Learn mode** — Explore the repo and write / refresh the `.librarian/` docs.
- **Recall mode** — Answer a question about the repo using the `.librarian/` docs, verifying against live code when the answer is load-bearing.

## Which mode to use

Start by checking whether `.librarian/` exists at the repo root and whether it is fresh.

```
If .librarian/ does not exist          → LEARN mode (initial build)
If user says "refresh" / "relearn"     → LEARN mode (refresh)
If .meta.json.stale_units is non-empty → TARGETED REFRESH mode
If .meta.json last_updated_sha is      → LEARN mode (refresh), or offer
  >200 commits behind HEAD               to refresh before answering
If user asks a question about the      → RECALL mode
  repo and .librarian/ is fresh
```

If you are not sure which mode fits, prefer Recall and offer to Learn. A surprise 10-minute scan of their repo is not what the user wants.

---

## Search hygiene

Every mode of this skill is search-heavy, and tool choice meaningfully shapes context cost. Three rules:

- **Use the dedicated `Glob` and `Grep` tools, not Bash.** Bash `grep`/`rg`/`find` prompt for permission per call and dump unstructured output; the dedicated tools are pre-approved and bounded by `head_limit`.
- **Default `Grep` to `output_mode: "files_with_matches"`.** You usually want the file list to act on, not the matched lines. Switch to `"content"` only when the matched text is itself the answer.
- **Prefer `type:` over `glob:` when a built-in language type exists** (e.g. `type: "ts"` over `glob: "**/*.ts"`). It's faster, and ripgrep already respects `.gitignore` — no need for manual `node_modules`/`dist` exclusions.

For concrete recipes per task — manifest discovery, HTTP-client searches by language, queue patterns, RPC, cron — see `references/search-playbook.md`.

---

## LEARN mode

The goal is a knowledge base a new engineer could read in an hour and then ship their first PR the next week. Not exhaustive — useful. Sample strategically; do not try to read every file.

### Step 1 — Establish repo shape

Before going deep, answer the shape questions at high level:

- **Language(s) and framework(s)** — read `package.json`, `composer.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `Cargo.toml`, `*.csproj`, `Gemfile`, etc.
- **Monorepo or single app?** — Are there multiple top-level service/app/package folders, or is this one project? Look for `lerna.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, a `services/` or `packages/` directory, or sibling top-level folders each with their own manifest.
- **Infra shape** — presence of `Dockerfile`, `docker-compose*.yml`, `k8s/`, `terraform/`, `.github/workflows/`, `fly.toml`, `vercel.json`, `serverless.yml`.
- **Data layer** — migrations directory, ORM config, connection strings in config files.
- **Messaging / async** — search for Kafka, RabbitMQ, NATS, Redis pub/sub, SQS, SNS, EventBridge, Pub/Sub, Temporal.
- **Git activity** — `git log --oneline -30` and `git shortlog -sn -30` give a sense of what is active and who is working on it.

Write this into `.librarian/overview.md` and `.librarian/architecture.md` as you go.

### Step 2 — Enumerate the "units"

A **unit** is the smallest thing that has its own purpose and boundary. Pick the right grain for the repo:

- Monorepo of microservices → one unit per service (e.g. `Admin-Server`, `Order-Server`)
- Single Laravel/Django/Rails app → one unit per top-level module or bounded context (e.g. `orders/`, `auth/`, `billing/`)
- Next.js app → one unit per feature area or route group
- Library → one unit per public subpackage

List them in `.librarian/INDEX.md`. For each, create `.librarian/units/<unit-name>.md` using the template in `assets/templates/unit.md`.

**Monorepo note: set `root:` in the unit's frontmatter.** When a unit lives under a subdirectory (e.g. `services/orders/`, `packages/admin/`, `Uclean-Company/`), set the optional `root:` frontmatter field to that subdirectory and write citations relative to it. Example: for `services/orders/`, write `root: services/orders` and cite `src/handler.ts` rather than `services/orders/src/handler.ts`. For units at the repo root (flat layout), leave `root:` empty or omit it. Without this, the staleness hook cannot resolve monorepo citations and will emit "0 of N citations resolved" warnings.

### Step 3 — Technical pass per unit

For each unit, extract enough to answer "what is this, and how do I work on it?":

- **Purpose** — one or two sentences. Read the unit's README if it has one; otherwise infer from its code.
- **Entry points** — routes, CLI commands, main(), handler functions, cron jobs, queue consumers.
- **Data models owned** — primary entities this unit is authoritative for.
- **External dependencies** — other units it calls, third-party APIs, databases.
- **Observable side effects** — DB writes, queue publishes, file writes, external API calls.
- **Where to start reading** — 3-5 files a new contributor should open first.

See `references/learn-technical.md` for the technical extraction playbook.

#### Delegating per-unit passes to Explore subagents

For repos large enough that running this rubric inline would burn the main context — typically 8 or more units, or fewer-but-large units — dispatch one `Agent(subagent_type: "Explore")` per unit instead of reading their files yourself. Each subagent runs in its own context window and returns the filled-in `unit.md` as a string; the main session writes those strings into `.librarian/units/<name>.md` and stitches `INDEX.md` afterward.

Use the prompt template at `assets/templates/explore-subagent-prompt.md` — substitute `<UNIT_NAME>`, `<UNIT_DIR>`, `<REPO_ROOT>`, and `<TEMPLATE_PATH>` for each subagent and dispatch them in parallel (a single message with multiple `Agent` tool calls). Independent unit passes have no dependencies, so the wall-clock cost stays roughly constant as units multiply.

For small repos (a handful of units, or a single bounded context) the dispatch overhead isn't worth it — read the files yourself.

### Step 4 — Cross-unit map

Unit pages describe units in isolation. `.librarian/architecture.md` describes how they talk: a topology diagram (ASCII or Mermaid is fine) plus one table of unit-to-unit interactions with the mechanism (HTTP, Kafka topic, shared DB, filesystem, etc.) and the direction.

File:line citations are not decoration. They are the whole point. A librarian doc without citations is a summary; one with citations is a map.

### Step 5 — Onboarding page

`.librarian/onboarding.md` is a first-day-as-a-dev checklist: how to get the repo running, where to click first, the 5 files every contributor should read, common gotchas from the README or CONTRIBUTING.md. Keep it under one screen.

### Step 6 — Write .meta.json

Record what you scanned so Recall mode can check freshness and a later Learn pass can diff:

```json
{
  "version": 1,
  "last_updated_sha": "<git rev-parse HEAD>",
  "last_updated_at": "<ISO timestamp>",
  "units": ["Admin-Server", "Order-Server", ...],
  "files_scanned": 127,
  "notes": "Brief note on what was covered or skipped"
}
```

### Step 7 — Wire the librarian into the project's CLAUDE.md

The `.librarian/` directory is only useful if future Claude sessions know it exists. Always finish Learn mode by making sure the project's top-level `CLAUDE.md` points at it.

Target file: `CLAUDE.md` at the repo root (the same level as `.librarian/`). Do not create or edit nested variants like `.claude/CLAUDE.md` or per-subdirectory CLAUDE.md files — this is a project-wide pointer.

The block below is bracketed by `<!-- tech-librarian:start -->` and `<!-- tech-librarian:end -->` markers. Those markers are the whole point: they let re-runs replace the block in place instead of appending duplicates, and they let users safely edit outside the block knowing their edits will be preserved.

Procedure:

1. **If `CLAUDE.md` exists and contains `<!-- tech-librarian:start -->`** — replace everything between the two markers (inclusive of the markers) with a fresh block. Preserve the rest of the file untouched.

2. **If `CLAUDE.md` exists but has no marker** — append a blank line and then the marker-wrapped block to the end of the file.

3. **If `CLAUDE.md` does not exist** — create it. Give it a minimal top-level header (`# <repo-name>`, where `<repo-name>` is inferred from the repo directory name or the project's README title), then a blank line, then the marker-wrapped block.

The block to write (copy exactly, then substitute the two placeholders):

```markdown
<!-- tech-librarian:start -->
## Repository knowledge base

This repo maintains a persistent technical knowledge base in `.librarian/` —
a map of the codebase covering services, APIs, data models, infrastructure,
dependencies, and how units talk to each other.

**Use the `tech-librarian` skill whenever:**
- You need to explain how a part of this system works
- The user asks "how does X flow", "what calls Y", "where does Z live"
- The user is onboarding or asking for a high-level overview
- You need to orient yourself in an unfamiliar service/module before editing

Start every investigation by reading `.librarian/INDEX.md` — it links to the
right doc for the question. If you discover the librarian docs are out of date
(code disagrees with what's documented), trust the code, answer from it, and
update the affected `.librarian/*.md` file in passing.

_Last synchronized: `<YYYY-MM-DD>` against commit `<short-sha>`. Managed by the
tech-librarian skill; edit outside the marker block to keep your changes._
<!-- tech-librarian:end -->
```

Use the same date and short SHA you wrote into `.meta.json` for `<YYYY-MM-DD>` and `<short-sha>` — the two files should agree.

In your final message to the user, call out explicitly whether you created a new `CLAUDE.md`, updated an existing block, or appended to a marker-less file. That way nothing about their project config is silently modified.

### What to skip

- Generated files (`node_modules`, `vendor`, `dist`, `build`, lockfiles except to read dep names).
- Migrations older than 2-3 years unless the current schema is unclear without them.
- Tests — read representative ones for behavior, do not catalog them all.
- Dead code. If it looks unused and nothing imports it, note it in onboarding.md ("possibly unused: X") and move on.

### When refreshing, not building from scratch

If `.librarian/` already exists, do not rewrite everything. Read `.meta.json`, diff `git log last_updated_sha..HEAD`, and update only the units and architecture pages that changed. Bump `last_updated_sha` and `last_updated_at`.

---

## TARGETED REFRESH mode

The staleness hooks (`hooks/staleness.mjs`) write `stale_units: [...]` into
`.librarian/.meta.json` when commits or session restarts touch files that the
unit pages cite. Each entry has the shape:

```json
{ "name": "Order-Server", "since_sha": "abc123", "changed_files": ["src/orders/handler.ts"] }
```

When you see a non-empty `stale_units`, you are in targeted-refresh mode. Do
**not** rebuild the whole knowledge base — only the listed units need work.

### Procedure

1. **Read** `.librarian/.meta.json` and pull the `stale_units` array.
2. **For each stale unit:**
   - Open `.librarian/units/<name>.md`.
   - Re-read the unit's source files (use `changed_files` as a starting point;
     also re-read the unit's existing entry-point and key files so the doc stays
     accurate beyond just the changed lines).
   - Rewrite the unit page using the same template as Learn mode
     (`assets/templates/unit.md`). Citations must be current. **Preserve the
     existing `root:` frontmatter value** — it is how the staleness hook
     resolves citations in monorepos.
3. **Update `.architecture.md`** only if a stale unit's external interactions
   changed (new HTTP routes, removed queue topics, etc.). Skip otherwise.
4. **Clear the flag and stamp HEAD:**
   - Set `last_updated_sha` to the current `git rev-parse HEAD`.
   - Set `last_updated_at` to the current ISO timestamp.
   - Set `stale_units` to `[]`.
   - Write `.meta.json` back.
5. **Tell the user** which units you refreshed and which you skipped (with
   reasons). Example: "Refreshed 2 units (Order-Server, Admin-Server). Skipped
   architecture.md because no external interactions changed."

### When to defer

If the stale list contains many units (e.g., >10) or `since_sha` is unknown
(reason `"history rewritten"`), targeted refresh is more expensive than
full Learn-mode refresh. Tell the user this and ask whether to:

- run targeted refresh anyway (preserves any hand-edits to non-stale units), or
- run full Learn-mode refresh.

Default to asking; do not silently switch modes.

---

## RECALL mode

The user asks a question like "how does refund work" or "what calls Odoo" or "which service owns the branch schedule".

### Step 1 — Check freshness

Read `.librarian/.meta.json`. Compare `last_updated_sha` with `git rev-parse HEAD`. If the delta is small (under ~50 commits) proceed. If it is huge, note the staleness to the user and offer to refresh before answering.

### Step 2 — Route the question

Read `.librarian/INDEX.md` first — it should link to every other doc. Based on the question, open the most relevant of: `architecture.md`, a specific `units/<name>.md`, `api-catalog.md`, or `dependencies.md`.

### Step 3 — Answer with citations

Cite the files referenced in the librarian docs. For load-bearing claims ("X still calls Y"), verify before answering — the doc is frozen in time; the code is current. If the doc and the code disagree, trust the code, answer from the code, and update the doc.

**Grep-then-Read when verifying.** If the question is whether a named symbol or string still resolves (function name, route path, queue topic, env var, error code), run a single `Grep` across the cited path set first — it confirms presence or absence in one round-trip. `Read` only the files where the answer demands full context (logic, control flow, surrounding behavior) or where Grep didn't find what the doc claimed. Pulling 20 cited files into context one-by-one to verify a name is still there is wasted budget.

### Step 4 — Update in passing

If you discovered the docs were wrong, fix the affected file and bump `last_updated_sha` / `last_updated_at` in `.meta.json`. A librarian that does not update its own index is a dead one.

---

## Output layout

```
<repo root>/
├── CLAUDE.md             # marker-wrapped block pointing at .librarian/ (see Step 7)
└── .librarian/
    ├── INDEX.md          # navigation — links to everything
    ├── overview.md       # 1 page: what this repo is, stack, shape
    ├── architecture.md   # technical topology + cross-unit map
    ├── api-catalog.md    # externally-exposed APIs (HTTP/CLI/RPC)
    ├── dependencies.md   # 3rd-party libs with role notes
    ├── onboarding.md     # first-day-as-a-dev checklist
    ├── units/
    │   └── <unit-name>.md  # one per service / module / package
    └── .meta.json        # freshness tracking
```

Templates for each file are in `assets/templates/`. Copy and fill rather than inventing a new layout per run — a predictable structure is itself useful.

---

## Style guardrails

- **Cite, do not paraphrase.** Every non-trivial claim ("Order-Server owns the branch assignment logic") gets a `file:line` citation.
- **If you do not know, say so.** Better to write "Unclear — payment retry logic appears to live in Payment-Server but the retry policy is not obvious from code" than to invent a confident lie. Uncertainty flagged explicitly is actionable; invented confidence is worse than silence.
- **Write for the new engineer.** The bar is: could someone with no repo context open this file and know where to go next?
- **Prefer plain words.** Librarian docs are read under pressure. Shorter sentences beat cleverer ones.

---

## References

- `references/learn-technical.md` — technical extraction playbook, per-stack hints, infra patterns
- `references/claude-md-snippet.md` — drop-in snippet for the project's CLAUDE.md that wires this skill into normal workflows
- `assets/templates/` — markdown templates for every output file
