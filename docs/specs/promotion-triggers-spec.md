# Promotion Triggers Between Maturity Stages — Requirements Spec

**Issue:** beads-helix-jgj
**Date:** 2026-04-11
**Status:** Draft

## Problem Statement

Issues in beads-helix flow through three maturity labels (idea, refined, ready), but nothing prevents skipping stages or closing immature work. Developers forget to promote labels because no prompt exists at the natural decision points. This spec defines four Claude Code hook-based triggers that surface promotion opportunities without blocking the developer's flow.

## Functional Requirements

**FR-01 Manual Promotion (idea to refined)**
The system MUST NOT automate or gate the idea-to-refined transition. Promotion happens exclusively via `bd update <id> --add-label refined --remove-label idea`. No hook fires for this transition.

**FR-02 Advisory on Show (refined to ready)**
When a user runs `bd show <id>` on an issue labeled `refined`, the hook MUST check for acceptance criteria and unresolved questions. If the issue appears promotable, the hook MUST print a one-line advisory to stderr suggesting promotion to `ready`. The hook MUST NOT print this advisory more than once per session per issue (see FR-06).

**FR-03 Advisory on Close Without Ready**
When a user runs `bd close <id>` on an issue labeled `refined`, the hook MUST print a one-line advisory to stderr stating the current label and suggesting promotion before close. The close MUST NOT be blocked.

**FR-04 Enforced Gate on Close While Idea**
When a user runs `bd close <id>` on an issue labeled `idea`, the hook MUST block the close and print an error to stderr explaining that the issue skipped the entire pipeline. The user MUST be able to override this by passing `--force`.

**FR-05 Force Escape Hatch**
The `--force` flag on `bd close` MUST bypass the FR-04 gate. When `--force` is used to close an `idea`-labeled issue, the hook MUST log a friction event via `bd remember "maturity-friction: closed idea-stage issue <id> with --force"`.

**FR-06 Session Tracking**
The hook MUST track which issues have already received an FR-02 advisory in the current session. Tracking MUST use an environment variable or temp file scoped to the process tree. A "session" is defined as a single Claude Code session (one invocation of the agent).

**FR-07 Quiet Suppression**
The `--quiet` flag MUST suppress all advisory output (FR-02, FR-03). It MUST NOT suppress the enforced gate (FR-04). Quiet mode MUST also be activatable via environment variable `HELIX_QUIET=1`.

**FR-08 Suggestion Logging**
Every advisory displayed (FR-02, FR-03) MUST be logged via `bd remember` with prefix `promotion-suggestion:` including the issue ID, current label, and suggested action. This feeds learning mode analysis.

## Non-Functional Requirements

**NFR-01 Hook Latency**
Each hook invocation MUST add no more than 500ms to the underlying `bd` command's execution time. Label checks MUST use `bd show <id> --json` (single call, no chaining).

**NFR-02 Output Format**
All hook output MUST go to stderr, never stdout. Advisories MUST be single-line, prefixed with `[helix]`. Example: `[helix] This issue is still 'refined' — promote to 'ready' before closing? (suppress: --quiet)`

**NFR-03 Compatibility**
Hooks MUST NOT modify, wrap, or interfere with existing `bd` command output on stdout. All existing `bd` commands MUST continue to function identically when hooks are not triggered.

**NFR-04 No Beads Changes**
All behavior MUST be implemented as Claude Code hooks. No changes to the beads CLI or `.beads/` data format are permitted.

## Out of Scope

- **Auto-promotion**: No trigger automatically changes labels. All promotions require explicit developer action.
- **`bd list` integration**: No advisories on list commands (observation moment, not decision moment).
- **Multi-user conflict resolution**: No label locking or concurrent promotion handling.
- **Custom stage names**: The pipeline is fixed at idea/refined/ready. Configurable stages are a separate feature.
- **Retrospective analytics**: Aggregating `bd remember` logs into reports is deferred to a future issue.
