Evaluate whether issue $ARGUMENTS is ready for promotion from `idea` to `refined`.

Checkpoint, not wizard. Evaluate and report. Never rewrite the ticket, never execute promotion, never turn this into a step-by-step refinement workflow.

## Steps

1. If `$ARGUMENTS` is empty, ask for an issue ID and stop.
2. Run `bd show $ARGUMENTS` to fetch the issue.
3. If the issue cannot be loaded, is closed, or is already beyond `idea` (has `refined` or `ready` label), report that status and stop.
4. Judge the issue **as written**. The act of restructuring the description is the refinement test — do not invent missing structure.

## Criteria

Score each as `PASS`, `FAIL`, or `UNCLEAR` with one-line reasoning:

| # | Criterion | What to check |
|---|-----------|---------------|
| 1 | **Problem statement** | Description states what is broken or missing from the user's perspective. FAIL if it mostly describes a solution or vague intention. |
| 2 | **DNA strand link** | Description explicitly names a design DNA strand it serves (Layer not fork · Convention over infrastructure · Project-agnostic · Dual-format visibility · Drop-in adoption) — or explicitly says "unlinked: reason". UNCLEAR if only implied. |
| 3 | **Done definition** | Completion criteria are specific and verifiable. FAIL vague phrases like "it works", "clean it up", or non-testable outcomes. |
| 4 | **Clear title** | Title is scannable in `bd list` and understandable without extra context. FAIL if generic, overloaded, or requires a paragraph to explain. |

## Output

Print a compact scorecard:

```
[helix] <id> — refinement checkpoint

Problem statement: PASS|FAIL|UNCLEAR — <reason>
DNA strand link:   PASS|FAIL|UNCLEAR — <reason>
Done definition:   PASS|FAIL|UNCLEAR — <reason>
Clear title:       PASS|FAIL|UNCLEAR — <reason>
```

**All PASS** — Print `Ready to promote.` then suggest the promotion commands with actual values filled in from your evaluation (not raw placeholders):

```
Ready to promote.

bd update <id> --notes="Promoted to refined: <actual strand name>, <confidence signal>"
bd update <id> --add-label refined --remove-label idea
```

For confidence signal, use phrasing like: "no open questions", "one assumption: X needs to hold", or "depends on Y being confirmed".

**Any FAIL or UNCLEAR** — Print `Not ready to promote.` For each failing criterion, explain what specifically needs to change. Tell the user to fix the gaps and re-run `/helix:refine <id>`.

## Rules

- Never execute `bd update`. Only print suggested commands.
- Do not offer to run commands or rewrite the description for the user.
- Promotion is a rewrite, not a label swap — if the description can't be restructured to satisfy the checklist, the issue isn't refined.
- If no DNA strand fits, that's acceptable — flag as unlinked and note what the issue serves instead.
