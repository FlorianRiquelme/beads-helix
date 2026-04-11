# beads-helix

A Claude Code plugin that adds a maturity-driven workflow layer on top of [beads](https://github.com/gastownhall/beads).

## Design DNA

1. **Layer, not fork** — depend on beads, never duplicate it
2. **Convention over infrastructure** — ship opinions, not mechanisms
3. **Project-agnostic** — no domain assumptions, DNA comes from the consumer
4. **Dual-format visibility** — every feature serves both Claude and the developer
5. **Drop-in adoption** — install and it works, only DNA strands need per-project config


## Maturity Pipeline

Every issue flows through **idea → refined → ready**. This is enforced by convention, not tooling (yet).

### Rules

- **On create:** Every `bd create` MUST include `-l idea`
- **On close:** Before closing, verify the label is `ready`. If it's not — flag it. Either promote first, or explicitly justify why we're closing something that wasn't "ready."
- **Promote with:** `bd update <id> --add-label <new> --remove-label <old>`

### Stage Definitions

| Stage | What it means | Gate to next |
|-------|--------------|--------------|
| `idea` | Problem identified, solution unclear | Passes the [refined issue checklist](docs/refined-issue-checklist.md) |
| `refined` | Approach defined, scope bounded | Has acceptance criteria, no open design questions, deps resolved |
| `ready` | Can be picked up and built right now | — |

### Learning Mode (active)

We are actively dogfooding this pipeline to discover what works. When anything unexpected or friction-y happens with the maturity workflow:

1. **Flag it** to the user in the moment
2. **Log it** via `bd remember "maturity-friction: <what happened>"` so it survives across sessions
3. These friction points feed into beads-helix-jgj (promotion triggers) and beads-helix-kfq (slash commands)

Examples of things to flag: labels that feel wrong, stages that get skipped, promotions that feel forced, issues that are "ready" but shouldn't be, ceremonies that add no value.

### Knowledge Flow Between Tickets

Research and design tickets produce findings that downstream tickets need. Knowledge must flow forward — don't assume the next session will think to look.

**On closing a ticket that blocks others:**
1. Write a 2-3 line summary of key findings into each blocked ticket's notes via `bd update <id> --notes="..."` — just enough to orient, with a pointer: "See <closed-id> for full research."
2. If the findings change the approach for a blocked ticket, update that ticket's description too.

**On starting a ticket with closed dependencies:**
1. Read all closed dependencies (`bd show <dep-id>`) before beginning work.
2. If a dependency's findings are missing from the current ticket's notes, flag the gap — the close-time push was skipped.

This is a push-at-close + pull-at-start pattern. The push keeps knowledge flowing; the pull catches gaps.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

### Institutional Memory

**On session start:** Before researching or implementing, check for prior discoveries:
```bash
bd memories <keyword>   # Search by topic (e.g., "label", "maturity", "plugin")
```

**During work:** When you discover something non-obvious about bd, beads, or this project's tooling, persist it immediately — don't wait for the user to ask:
```bash
bd remember "concise finding with key commands and context"
```

Good candidates for `bd remember`:
- CLI capabilities confirmed or ruled out (what works, what doesn't)
- Workarounds for gaps in tooling
- Integration patterns between beads and other systems
- Architectural decisions and their rationale
- **Gotchas** — non-obvious behaviors discovered during research or implementation. Persist these immediately via `bd remember` so they survive across sessions.

Do NOT persist: things derivable from code, git history, or `bd help`.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
