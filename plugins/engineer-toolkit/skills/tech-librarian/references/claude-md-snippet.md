# The CLAUDE.md snippet

When Learn mode finishes building `.librarian/`, Step 7 of `SKILL.md` automatically writes a marker-wrapped snippet into the project's `CLAUDE.md`. This file documents what gets written, why, and how to customize it.

## The auto-installed block

Between the markers `<!-- tech-librarian:start -->` and `<!-- tech-librarian:end -->`, the skill inserts (and keeps updated on refresh):

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

## Why markers?

The marker pair makes the managed block self-identifying. Three consequences:

- **Re-runs stay idempotent.** When Learn mode runs a second time (refresh), the skill finds the marker pair, replaces the content between them, and leaves the rest of `CLAUDE.md` untouched.
- **Your edits are preserved.** Anything *outside* the marker block — team conventions, deploy pointers, style rules, whatever else you keep in `CLAUDE.md` — survives forever. The skill only touches what's between the markers.
- **No double-insertion.** A fresh run on a file that already has the markers won't leave two copies of the block.

## Customizing

You have three levers:

1. **Edit outside the markers.** Anything before `<!-- tech-librarian:start -->` or after `<!-- tech-librarian:end -->` is yours. Add more guidance, team-specific rules, whatever.

2. **Delete the markers to opt out of auto-management.** If you remove the marker pair and don't want the skill managing this, the skill's next run will see no marker and append a fresh block to the end of the file. To permanently opt out, either leave the skill disabled or manually strip the block after each run.

3. **Want the block somewhere other than the end?** On a first run into a file without markers the skill appends to the end. You can then move the marker-wrapped block wherever you like — on subsequent runs the skill finds it by marker, not by position.

## If `CLAUDE.md` does not exist

The skill creates it, with a minimal top-level header (`# <repo-name>` inferred from the directory name or README title), then the marker-wrapped block. That's the whole file. Add anything else you want around the block later.

## For projects where you want more

If you want Claude to refresh the librarian docs automatically after material changes, add this *outside* the marker block:

```markdown
After completing any change that affects service boundaries, API contracts,
data models, or cross-service flows, refresh the relevant `.librarian/` files
so the knowledge base stays in sync.
```

That's not part of the auto-managed block, so it survives future runs.
