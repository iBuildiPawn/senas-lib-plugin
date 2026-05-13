# Per-unit Explore subagent prompt

When the LEARN-mode unit pass would burn the main context (typically 8+ units, or fewer-but-large units), dispatch one `Agent(subagent_type: "Explore")` per unit and let each return a filled-in `unit.md`. The main session writes the strings into `.librarian/units/<name>.md` and stitches `INDEX.md`.

Substitute the four placeholders before sending. Send all subagents in parallel — independent unit passes have no dependencies on each other.

```
You are documenting one unit of a repository for a persistent technical knowledge
base. The output is a single markdown document that follows the unit template
exactly. Other engineers will read this on their first day; the bar is that they
can open the right file on the first try.

## Unit context

- Unit name: <UNIT_NAME>
- Unit directory (repo-relative): <UNIT_DIR>           # e.g. services/orders, or "" for flat layouts
- Repo root (absolute): <REPO_ROOT>
- Unit template to fill: <TEMPLATE_PATH>               # e.g. plugins/engineer-toolkit/skills/tech-librarian/assets/templates/unit.md

## What to extract (7-point rubric)

1. **Purpose.** One or two sentences. Not "handles orders" — something like
   "owns the order lifecycle from placement to fulfillment, including state
   transitions and payment coordination."
2. **Tech stack.** Framework, language runtime, key libraries that shape how
   code is written here. Reading the manifest in the unit directory is usually
   enough. Call out anything unusual — a custom fork, an unexpected pin,
   a framework version behind the rest of the repo.
3. **Entry points.** Where execution begins in this unit — routes file(s),
   controller list, CLI commands, main(), handler functions, cron jobs,
   queue consumers. Cite the file that enumerates them.
4. **Data models owned.** The entities this unit writes to authoritatively.
   "X owns Order, OrderItem, OrderStatusHistory. Reads User from Client-Server."
5. **External dependencies.** Split into: other units called (with mechanism),
   third-party APIs (Stripe, Twilio, etc., with purpose), infra (DBs, caches,
   queues this unit needs to run).
6. **Observable side effects.** What happens in the world when code here runs?
   DB writes, queue publishes, outbound HTTP, emails, files. This is what
   someone debugging production will care about.
7. **Where to start reading.** 3-5 files. Usually: the main routes / handler
   registration file, the main service class for this unit's core
   responsibility, the primary model, one representative test, and the
   config file.

## How to search

Read the search-playbook reference first if available
(plugins/engineer-toolkit/skills/tech-librarian/references/search-playbook.md).
Headline rules:

- Glob to find files by name; Grep with type: filters to find content patterns.
  Default Grep output_mode to "files_with_matches" — switch to "content" only
  when the matched lines are the answer.
- Stay scoped to <UNIT_DIR> when set: pass it as the Grep `path:` parameter or
  prefix Glob patterns. Grep's gitignore handling is automatic.
- Don't shell out to grep/rg/find — use the dedicated tools.

## Output requirements

Produce a complete unit.md that copies the structure of <TEMPLATE_PATH>
exactly. Specifically:

- Set `root: <UNIT_DIR>` in the frontmatter when <UNIT_DIR> is non-empty;
  leave it empty for flat-layout units. The staleness hook depends on this
  to resolve citations in monorepos.
- Write all `file:line` citations relative to <UNIT_DIR> when set
  (e.g. `src/handler.ts:42`, not `services/orders/src/handler.ts:42`).
- Citations must be load-bearing — every non-trivial claim ("X owns the
  state machine") gets a real `file:line`. A unit doc without citations
  is a summary; one with citations is a map.
- If you don't know something, say so. "Unclear — payment retry logic
  appears to live here but the policy is not obvious from code" is more
  useful than confident invention.
- Keep prose plain. Shorter sentences win. New engineers read these docs
  under pressure.

## Return format

Return only the unit.md content as a single string — no preamble,
no commentary, no code fences. The dispatching session will write it
verbatim to `.librarian/units/<UNIT_NAME>.md`.
```

## Substitution checklist

- `<UNIT_NAME>` — the unit's display name, used as the markdown filename and h1.
- `<UNIT_DIR>` — repo-relative subdirectory (e.g. `services/orders`), or `""` for repo-root units.
- `<REPO_ROOT>` — absolute path so the subagent's tool calls resolve correctly.
- `<TEMPLATE_PATH>` — path to `assets/templates/unit.md` shipped with this skill (substitute the absolute path or the path relative to the working directory).
