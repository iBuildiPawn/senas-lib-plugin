# Contributing

Thanks for your interest in `senas-plugins`. This is a small marketplace, so the process is light.

## Layout

```
.claude-plugin/marketplace.json   # marketplace manifest (registers each plugin)
plugins/<plugin>/                 # one directory per plugin
  .claude-plugin/plugin.json      # plugin manifest (name, version, description)
  skills/<skill>/SKILL.md         # skill content
  hooks/                          # PostToolUse / SessionStart hook scripts
```

## Local development

```
/plugin marketplace add /absolute/path/to/this/clone
/plugin install <plugin>@senas-plugins
/reload-plugins
```

Re-install with `/plugin uninstall` → `/plugin install` to pick up edits — Claude Code caches by the `version` field in `plugin.json`.

## Tests

Hook logic for `engineer-toolkit` is covered by `node:test` files next to the sources. Run them from the plugin's hooks directory:

```
cd plugins/engineer-toolkit/hooks
node --test
```

All tests should pass before you open a PR. The suite hits real `git` repositories in temp dirs, so make sure `git` is on your `PATH`.

## Versioning

When you change a plugin:

1. Bump `version` in `plugins/<plugin>/.claude-plugin/plugin.json` (semver).
2. Bump `metadata.version` in `.claude-plugin/marketplace.json` to match the highest plugin version (the marketplace and the plugin currently ship in lockstep).
3. Mention the change in `README.md` under the relevant plugin section.

## Commit style

Conventional Commits, scoped to the plugin or area being changed:

- `feat(engineer-toolkit): ...`
- `fix(engineer-toolkit): ...`
- `docs: ...`
- `chore(marketplace): ...`

## PRs

Open against `master`. One PR per feature; keep the diff focused. Squash-merge is fine — the commit history on `master` is the changelog.
