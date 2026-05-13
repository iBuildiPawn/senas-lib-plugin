# senas-plugins

An open-source Claude Code marketplace of engineering plugins.

## Plugins

### engineer-toolkit (v0.4.0)

Engineering tools for understanding and organizing codebases.

**Skills:**
- `tech-librarian` — Build and maintain a persistent technical knowledge base of a repository (services, APIs, data models, infrastructure, dependencies, cross-unit interactions). Forked from `repo-librarian`, stripped to the technical layer only.
- **Search-aware skill (0.4.0):** the skill now ships with a `search-playbook.md` reference of concrete `Glob`/`Grep` recipes per task (manifest discovery, HTTP-client / queue / RPC patterns by language, output-mode discipline) and an `explore-subagent-prompt.md` template that lets LEARN mode dispatch one Explore subagent per unit on large repos — keeping the main context lean.

**Hooks:**
- `PostToolUse` on `Bash` and `SessionStart` — automatically detect when files cited by `.librarian/units/*.md` have changed since the knowledge base was last refreshed. The hooks mark drifted units in `.librarian/.meta.json` (`stale_units` field) and nudge Claude to enter the skill's **Targeted Refresh** mode. Hooks no-op silently in repos without `.librarian/` or without git, so installing the plugin imposes no cost on unrelated repos. *(0.2.0)*
- **Symbol-level precision (0.3.0):** when a unit's citation includes a line number (e.g. `src/handler.ts:42`), the staleness hook now consults `git diff -U0` and only flags the unit when a hunk actually overlaps the cited line. Citations without a line number keep file-level behavior. The nudge body lists which lines triggered each hit. Result: cosmetic edits and changes elsewhere in the file no longer fire false positives.
- **Disappeared-citation detection (0.4.0):** SessionStart now also flags units whose cited files were tracked at the last refresh's commit but have since been deleted or renamed away — even when a regular `git diff` would otherwise miss them. The hook intersects each unit's unresolved citations with `git ls-tree -r` of the last refresh sha (no false positives from prose tokens that never existed in the repo) and surfaces the affected paths in the nudge as `<path> (removed since refresh)`. Shallow clones gracefully skip this flow rather than triggering false relearns.

## Install

In your Claude Code prompt:

```
/plugin marketplace add iBuildiPawn/senas-lib-plugin
/plugin install engineer-toolkit@senas-plugins
/reload-plugins
```

After install, the bundled skill is invocable as `engineer-toolkit:tech-librarian`.

### Local development install

If you're hacking on the plugin source in this repo, install from the working tree instead of GitHub so changes apply without a push round-trip:

```
/plugin marketplace add /absolute/path/to/this/clone
/plugin install engineer-toolkit@senas-plugins
/reload-plugins
```

After editing files, run `/plugin uninstall engineer-toolkit@senas-plugins` then re-install + `/reload-plugins` to pick up changes (Claude Code caches by `version` from `plugin.json`, so installs of the same version overwrite the cache in place).

## Contributing

Bug reports and PRs welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the loop (run the hook tests, bump the plugin + marketplace `version`, open a PR).

## License

MIT — see `LICENSE`.
