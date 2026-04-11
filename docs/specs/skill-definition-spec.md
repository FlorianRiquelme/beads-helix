# Skill Definition Spec

Design output for **beads-helix-8g5**: minimal skill definition for helix-aware sessions.

## Core Principle: Checkpoints, Not Wizards

Skills evaluate and report. They don't dictate how the user solves things.

- **Hooks** say "no" (mechanical gates)
- **Skills** say "here's what's missing" (informed checkpoints)
- **CLAUDE.md** says "always remember this" (conventions)

A skill is a **linter for workflow state**, not a step-by-step wizard. It checks what's true, reports gaps, and gets out of the way. The user decides how to fix things — manual edits, conversation, `bd update`, whatever works for them.

## Core Principle: Forward-Looking Context

When starting work on any ticket, Claude must read in **both directions**:

- **Pull from closed deps** (backward): What was learned? What decisions were made?
- **Pull from open dependents** (forward): What tickets depend on THIS one? What do they need as output?

The forward look is critical — it shapes the work. A design ticket isn't just "design X." It's "design X such that tickets Y and Z are properly unblocked." Understanding what downstream expects as an outcome changes what you prioritize, how much detail you produce, and what form the deliverable takes.

This is the **full-picture pull pattern**: backward for context, forward for purpose.

## What Already Exists (Hooks)

| Hook | Event | Behavior |
|------|-------|----------|
| `helix-close-gate.sh` | PreToolUse (bd close) | Blocks close on `idea` issues (hard gate, `--force` escape). Advisory on `refined` issues. |
| `helix-show-advisory.sh` | PostToolUse (bd show) | Suggests promotion when `refined` issue has AC + no open questions. 1x/session/issue. |
| `bd prime` | SessionStart, PreCompact | Injects workflow context. |

These are mechanical and working. Skills must complement, not duplicate.

## Proposed Skills

### `/helix:refine <id>` — Refinement Checkpoint

**What it does:** Evaluates an idea-stage issue against the [refined issue checklist](../refined-issue-checklist.md) and reports what's missing.

**What it does NOT do:** Draft rewrites, walk through steps, or impose a refinement process. The user refines however they want.

**Workflow:**
1. Load issue via `bd show <id> --json`
2. Validate: issue exists, is open, has `idea` label (stop if not)
3. **Full-picture pull:**
   - Read closed dependencies — pull context backward (what was learned)
   - Read open dependents — pull purpose forward (what downstream tickets need from this issue's refinement)
   - Flag if dependency findings weren't incorporated
4. Score each checklist item as pass / fail / partial:
   - Problem statement
   - DNA strand link
   - Done definition
   - Clear title
5. Print a scorecard. Done.

**Example output:**
```
[helix] beads-helix-abc — 2/4 checklist items

  ✓ Problem statement
  ✗ DNA strand — not linked
  ~ Done definition — partial ("it works" isn't verifiable)
  ✓ Clear title

Fix the gaps, then re-run /helix:refine abc to re-check.
When all 4 pass: promote with bd update abc --add-label refined --remove-label idea
```

**When all 4 pass:**
```
[helix] beads-helix-abc — 4/4 checklist items. Ready to promote.

  bd update abc --add-label refined --remove-label idea
  bd update abc --notes="Promoted to refined: <strand>, <confidence>"

Run these commands when you're ready. (Or I can run them — just say go.)
```

**Edge cases:**
- Already refined/ready → "already at `<stage>`", stop
- No DNA strand fits → report as gap, mention "unlinked: reason" convention
- Description too vague to evaluate → say so honestly, don't fabricate a score
- Closed issue → "already closed", stop

**Frontmatter:**
```yaml
---
name: helix:refine
description: >-
  Evaluate an idea-stage issue against the refined-issue-checklist.
  Reports what's missing (problem statement, DNA strand, done definition,
  clear title). Does not impose a refinement process — the user decides
  how to fix gaps. Re-run to re-check.
allowed-tools: Bash Read
argument-hint: "<issue-id>"
---
```

### `/helix:close <id>` — Close Checkpoint

**What it does:** Checks maturity, identifies dependents that need knowledge, and reports what should happen before closing.

**What it does NOT do:** Auto-push knowledge or auto-close. Reports the situation, user decides.

**Workflow:**
1. Load issue + dependents via `bd show` and `bd dep list`
2. **Maturity check:** If `idea` → block ("promote first or use `bd close --force`"). If `refined` → warn ("skipping final gate"). If `ready` → clean.
3. **Dependent scan:** List open issues that this one blocks. For each:
   - Show what the dependent ticket expects as output (read its description to understand what it needs)
   - Flag whether this issue's findings address those expectations
   - Highlight gaps: "dependent X expects Y, but this issue didn't cover it"
4. **Report:** Print maturity status + dependent list + what each dependent needs + suggested actions. Stop.

**Example output:**
```
[helix] Closing beads-helix-abc (ready ✓)

Blocked tickets that may need findings:
  → beads-helix-def (open) — topic overlap: "skill definition"
  → beads-helix-ghi (open) — no obvious overlap

Write notes to dependents with bd update <id> --notes="..."
Then close: bd close abc
```

**When user says "go" or "close it":** Execute `bd close <id>`. The hook fires as safety net.

**Edge cases:**
- No dependents → skip knowledge section, just maturity check + close
- Issue is `idea` → block, don't offer to force (that's `bd close --force` directly)
- Already closed → "already closed", stop
- `bd close` fails → report error, don't retry

**Frontmatter:**
```yaml
---
name: helix:close
description: >-
  Close checkpoint — checks maturity label, identifies blocked tickets
  that may need knowledge pushed, and reports what to do before closing.
  Does not auto-close or auto-push. User drives the process.
allowed-tools: Bash Read
argument-hint: "<issue-id>"
---
```

### `/helix:triage` — Idea Board Review

**What it does:** Shows all idea-stage issues in a compact board and lets the user drive triage decisions.

**What it does NOT do:** Walk through issues one by one. Force decisions. Lecture about backlog hygiene.

**Workflow:**
1. `bd list -l idea --json` — get all open ideas
2. If none → "No ideas to triage. Backlog is clean." Stop.
3. Print compact table:

```
[helix] Triage: 5 ideas

ID          | Title                              | Age  | Checklist | Deps
------------|-------------------------------------|------|-----------|-----
bh-abc      | Support custom DNA strands          | 3d   | 1/4       | 0
bh-def      | Slash command for promotion         | 12d  | 3/4       | 2
bh-ghi      | Auto-detect stale ideas             | 1d   | 0/4       | 0
```

4. **Stop.** User picks what to engage with. They can:
   - `/helix:refine <id>` to check one against the checklist
   - `bd close <id> --force -r "reason"` to kill one
   - `bd update <id> --notes="triaged: deferred — reason"` to defer
   - Ask Claude to help with any specific issue
   - Do nothing — triage is optional

**The board is the deliverable.** No forced per-issue walkthrough.

**Edge cases:**
- >15 ideas → show full table, suggest "consider focusing on oldest 5 first"
- 0 ideas → clean message, stop

**Frontmatter:**
```yaml
---
name: helix:triage
description: >-
  Show all idea-stage issues in a compact board with checklist scores.
  User decides what to engage with — promote, kill, defer, or skip.
  No forced walkthrough. The board is the deliverable.
allowed-tools: Bash Read
argument-hint: ""
---
```

## CLAUDE.md Refactoring

The current CLAUDE.md mixes always-needed facts with on-demand procedures. Refactoring splits them so skills carry the procedures.

### Stays in CLAUDE.md (~45 lines)

| Section | Why always-needed |
|---------|-------------------|
| Project header | Identity context |
| Design DNA (5 strands) | Referenced by refinement, creation, and architectural decisions |
| Maturity Pipeline (compressed) | 3 core rules + stage table — needed on every `bd create`/`bd close` |
| Learning mode (2 lines) | Flag friction + `bd remember` convention |
| Beads integration block | Managed by `bd`, untouchable |
| Institutional memory commands | `bd memories` + `bd remember` — 2 lines |
| Pointer to `/helix:close` | "Run `/helix:close` before ending a session" |

### Moves to skills

| Content | Destination |
|---------|-------------|
| Knowledge flow protocol (push-at-close + pull-at-start) | `/helix:close` |
| Session completion mandatory workflow (7 steps) | `/helix:close` |
| `bd remember` good-candidates list | `/helix:close` |
| Learning mode examples + ticket references | `/helix:triage` |

### Removed/updated

- "(yet)" language → updated to reflect hooks exist
- On-close rule → removed (hook enforces it)

## Target Directory Structure

```
beads-helix/
  skills/
    helix-refine/SKILL.md
    helix-triage/SKILL.md
    helix-close/SKILL.md
  plugin.json                    # Plugin manifest
  .claude/
    settings.json                # Unchanged
    hooks/                       # Unchanged
  docs/
    refined-issue-checklist.md   # Unchanged, referenced by skills
    specs/
      promotion-triggers-spec.md # Unchanged
      skill-definition-spec.md   # This document
  CLAUDE.md                      # Refactored
```

**Namespace:** `helix:refine` (not `beads-helix:refine`). Short prefix, clear extension layer.

## Relationship to beads-helix-kfq

`beads-helix-kfq` says slash commands "should be discovered through dogfooding, not designed upfront." This spec proposes 3 candidates based on research, but they should be validated by friction before building:

- `/helix:refine` is justified if manual refinement against the checklist feels painful
- `/helix:close` is justified if knowledge gets lost between tickets
- `/helix:triage` is justified if idea backlog grows without review

**Recommendation:** Dogfood the maturity pipeline manually for a few sessions. Track friction via `bd remember "maturity-friction: ..."`. Build skills only when the friction pattern repeats. This spec is the design — `kfq` decides when each skill earns its place.

## Anti-Patterns (Hard Rules)

1. **No wizards.** Skills report state, they don't walk users through steps.
2. **No auto-promotion.** Human always promotes. Skills never swap labels without explicit approval.
3. **No verbose output.** Scorecard + commands. No explanations of what the checklist means.
4. **No forced decisions.** Skip/ignore is always valid. No guilt.
5. **No Clippy.** Skills fire only when invoked. No unsolicited suggestions beyond what hooks already do.
6. **No scope fabrication.** If info is missing, say "I can't evaluate this" — don't invent criteria.

## Implementation Notes

- Skills reference `docs/refined-issue-checklist.md` by path — single source of truth
- Skills check `bd` + `.beads/` availability as precondition
- `/helix:close` calls `bd close` at the end — hook fires as safety net (defense in depth)
- No session dedup needed for skills (user-invoked, not automatic)
- Migration: create skills first (additive), then refactor CLAUDE.md, then update README
