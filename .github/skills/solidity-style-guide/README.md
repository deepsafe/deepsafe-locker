# Solidity style guide skill

This folder packages the upstream rules as a project-local VS Code skill. VS Code discovers it from:

```text
.github/skills/solidity-style-guide/SKILL.md
```

Ask Copilot to review Solidity style, apply the style guide, or audit Solidity code to invoke it.

The same bundle is also compatible with Claude Code. For Claude-specific installation, use one of these locations.

## Option A — project-scoped

Drop this folder into `.claude/skills/` inside your Solidity project:

```bash
mkdir -p .claude/skills
cp -r /path/to/solidity-style-guide/skill .claude/skills/solidity-style-guide
```

Claude Code will auto-discover `SKILL.md` on next session start.

## Option B — global

```bash
mkdir -p ~/.claude/skills
cp -r /path/to/solidity-style-guide/skill ~/.claude/skills/solidity-style-guide
```

## Using the skill

Inside Claude Code:

```
/solidity-style-guide:review           # audit without editing
/solidity-style-guide:review --fix     # apply minimal formatting/naming diffs
/solidity-style-guide:apply-config     # copy solhint/prettier/editorconfig
```

Or just ask: _"review my Solidity against the style guide"_ — Claude Code will auto-trigger the skill on `.sol` files.

## What's inside

- `SKILL.md` — Claude Code skill manifest + full rule list
- `plugin.json` — metadata for plugin managers (Zed, OMC, etc.)
- `references/quick-reference.md` — one-page cheat sheet