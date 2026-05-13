<div align="center">

# senas-plugins

**Engineering plugins for Claude Code — so your AI stops re-learning your codebase every session.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![engineer-toolkit](https://img.shields.io/badge/engineer--toolkit-v0.4.0-1f883d.svg)](plugins/engineer-toolkit)
[![Tests: 91 passing](https://img.shields.io/badge/tests-91%20passing-brightgreen.svg)](plugins/engineer-toolkit/hooks)

</div>

---

## 💡 Why this exists

Every Claude Code session starts cold. The model rediscovers your services, retraces data flows, re-maps dependencies — burning context to relearn the same things it understood yesterday.

`senas-plugins` turns that one-shot exploration into a **persistent, automatically-maintained knowledge base** that lives next to your code. Build it once. Trust it across sessions. When reality drifts, the staleness hooks notice and tell Claude to refresh only the slices that actually changed — not the whole repo.

## 📦 What's inside

### `engineer-toolkit` — v0.4.0

Knowledge-base tooling for understanding and organizing codebases.

- 🧠 **`tech-librarian` skill** — builds and maintains a `.librarian/` knowledge base in your repo: services, APIs, data models, infrastructure, dependencies, cross-unit interactions. Forked from `repo-librarian`, stripped to the technical layer only.
- 🔍 **Search-aware exploration** — ships with a `search-playbook` of concrete `Glob`/`Grep` recipes per task (manifest discovery, HTTP-client / queue / RPC patterns by language, output-mode discipline) and an Explore-subagent template that fans out one agent per unit on large repos, keeping main-thread context lean.
- 🪝 **Staleness hooks** — `PostToolUse` on `Bash` and `SessionStart` watch git state and mark units that have drifted since the last refresh, nudging Claude into the skill's **Targeted Refresh** mode. Hooks no-op silently in repos without `.librarian/` or without git — installing the plugin costs zero on unrelated projects.
- 🎯 **Symbol-level precision** — citations like `src/handler.ts:42` only fire when a diff hunk actually overlaps line 42. Cosmetic edits and unrelated changes in the same file don't trigger false positives. The nudge body lists exactly which lines triggered each hit.
- 👻 **Disappeared-citation detection** — catches cited files that were renamed or deleted since the last refresh, even when a regular `git diff` would miss them. Uses `git ls-tree -r` of the last refresh sha to filter out prose tokens that never existed in the repo, so no false positives from English words shaped like file paths.

## 🚀 Quick start

In a Claude Code prompt:

```
/plugin marketplace add iBuildiPawn/senas-lib-plugin
/plugin install engineer-toolkit@senas-plugins
/reload-plugins
```

The skill becomes invocable as `engineer-toolkit:tech-librarian`. Run it once on a repo to seed `.librarian/`; the hooks take over from there.

## 🔁 How it works

```
┌───────────────────────────────────────────────────────────────┐
│  Day 1   /tech-librarian  →  .librarian/units/*.md            │
│          (persistent knowledge base, committed alongside code)│
├───────────────────────────────────────────────────────────────┤
│  Edits   PostToolUse on Bash detects commits that change      │
│          files cited by units  →  marks stale_units in        │
│          .librarian/.meta.json                                │
├───────────────────────────────────────────────────────────────┤
│  Day 2   SessionStart sees stale_units  →  nudges Claude into │
│          Targeted Refresh on just the drifted slices          │
└───────────────────────────────────────────────────────────────┘
```

Knowledge base lives in your repo. Hooks live in your plugin install. No services, no daemons — just files and `git`.

## 🛠 Local development install

If you're hacking on the plugin source here, install from the working tree instead of GitHub so changes apply without a push round-trip:

```
/plugin marketplace add /absolute/path/to/this/clone
/plugin install engineer-toolkit@senas-plugins
/reload-plugins
```

After editing files, run `/plugin uninstall engineer-toolkit@senas-plugins`, then re-install + `/reload-plugins` to pick up changes — Claude Code caches by `version` from `plugin.json`, so installs of the same version overwrite the cache in place.

## 🤝 Contributing

Bug reports and PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the loop (run the hook tests, bump the plugin + marketplace `version`, open a PR).

## 📄 License

MIT — see [`LICENSE`](LICENSE).
