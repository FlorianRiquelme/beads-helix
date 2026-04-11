# beads-helix

A Claude Code plugin that adds a maturity-driven workflow layer on top of [beads](https://github.com/gastownhall/beads). Beads handles issue tracking infrastructure — helix adds the workflow philosophy that turns raw ideas into shipped features.

## The Problem

AI-assisted development generates a lot of signal: brainstorm sessions produce ideas, mid-implementation discoveries reveal missing features, debugging exposes edge cases worth addressing. But this signal is scattered across markdown files, conversation history, and developer memory. Each new session starts cold. The compound effect of working with AI is lost.

## What Helix Does

Helix introduces a **maturity pipeline** — a structured lifecycle that every piece of work flows through before it gets built:

```
idea  -->  refined  -->  ready  -->  in_progress  -->  done
 |            |            |              |              |
 |            |            |              |              |
cheap      justified    specified      claimed       shipped
capture    with DNA     with done      and being     and
           + user       definition     worked on     verified
           problem
```

### The DNA Principle

Every issue (once refined) must trace back to two things:

1. **A design DNA strand** — which strategic goal of the project does this serve?
2. **A user problem** — what real pain does this solve, and why?

If you can't articulate both, the issue isn't ready to be refined. It stays as an idea until it earns its place.

DNA strands are defined per-project in CLAUDE.md. They're the non-negotiable strategic direction. Issues that can't trace to a strand are either off-strategy or reveal a missing strand.

## How It Works

### Maturity Labels

Helix uses beads labels to track maturity, keeping priority free for urgency:

| Label | Meaning | Minimum Quality |
|-------|---------|-----------------|
| `idea` | Raw signal. Capture first, think later. | One line is enough. |
| `refined` | Justified. DNA strand and user problem articulated. | DNA + user problem filled in. |
| `ready` | Fully specified. Could be TDD'd right now. | Acceptance criteria defined. |
| *(no label)* | In execution. Beads native status handles `in_progress` and `closed`. | Resolution summary on close. |

Priority (P0-P4) and maturity are independent axes. A P0 idea is "urgent but not yet understood." A P3 ready issue is "low priority but fully specified."

### Issue Template

Ideas are cheap — one line, no ceremony:
```bash
bd create "what if environments could hibernate" -l idea
```

Refined issues and above require structure:
```
Title: [clear, specific]
DNA: [which strategic goal this serves]
User problem: [what pain this solves and why]
Done: [what acceptance looks like]
```

### Session Behavior

**Start:** Claude reads beads state (`bd prime`, `bd ready --json`) and orients — what's in progress, what's unblocked, are there ideas relevant to today's work?

**During:** Claude cross-references existing issues when brainstorming or implementing. Captures discoveries inline with `bd create -l idea`. Links discoveries to their source with `--deps discovered-from:<id>`.

**End:** Claude reviews whether any ideas emerged that weren't captured. Suggests triage if ideas are piling up unrefined.

### Brainstorm-to-Backlog Pipeline

1. Brainstorm session produces interesting ideas
2. End of session: top ideas become `bd create -l idea`
3. Next quiet session: pull unrefined ideas, stress-test against DNA, promote or kill
4. Refined items become candidates for planning and TDD

## Architecture

Helix is a Claude Code plugin, not a fork of beads. It depends on beads being installed and adds conventions on top.

```
beads-helix/
  claude-plugin/              # Claude Code plugin structure
    skills/
      helix/
        SKILL.md              # Skill definition and session protocol
        resources/            # Detailed workflow docs loaded on demand
    commands/                 # Slash commands (/helix:refine, /helix:triage, etc.)
    agents/                   # Agent definitions for specialized workflows
  templates/                  # Custom beads templates (idea, feature, bug, etc.)
  dashboard/                  # Local kanban dashboard
    index.html                # Single-file dashboard reading from bd list --json
  README.md                   # This file
```

### Dependencies

- [beads](https://github.com/gastownhall/beads) (`bd` CLI) — must be installed and initialized in the target repo
- Claude Code — the plugin host

### Installation

```bash
# In your Claude Code plugins directory or via marketplace
claude plugin add beads-helix

# In any project repo
bd init                       # Initialize beads (if not already)
# Helix conventions are automatically available via the plugin
```

## Local Kanban Dashboard

A lightweight local dashboard that reads from beads and displays the maturity pipeline visually.

Columns: **Ideas | Refined | Ready | In Progress | Done**

Left side is fuzzy. Right side is concrete. The middle is where the thinking happens.

Design goals:
- Runs locally, no external dependencies
- Glanceable — 5 seconds to know project state
- Grouped by DNA strand, filterable by priority and type
- Auto-refreshes from `bd list --json`

## Project DNA Configuration

Each project defines its DNA strands in CLAUDE.md (or a dedicated config). Example for a developer tools project:

```markdown
## Design DNA

1. **CLI-first interface** — developers touch the CLI, not the backend
2. **Zero-config defaults** — works out of the box, configure only when needed
3. **Composable primitives** — small tools that combine, not monolithic features
```

Issues reference these by name:
```
DNA: CLI-first interface
User problem: Developers can't see environment status without opening a browser
```

## Status

Early development. Feature-env is the first showcase project.

## License

MIT
