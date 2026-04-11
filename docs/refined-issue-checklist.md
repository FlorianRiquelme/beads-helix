# Refined Issue Checklist

What an issue must look like before it can be promoted from `idea` to `refined`.

## The Checklist

Before promoting, the issue description MUST contain all four:

- [ ] **Problem statement** — What's broken or missing, from the user's perspective. Not a solution description.
- [ ] **DNA strand link** — Which design DNA strand this serves. If no strand fits, flag as unlinked with a reason — this may signal a missing strand.
- [ ] **Done definition** — How you know this is finished. Specific enough to verify, not "it works."
- [ ] **Clear title** — Scannable in `bd list` output. If the title needs a paragraph to explain, rewrite it.

## How Promotion Works

Promotion is a **rewrite, not a label swap**.

The act of restructuring the description to satisfy this checklist *is* the refinement test. If you can't rewrite the description cleanly into this shape, the issue isn't refined — it needs more thinking.

Ideas can be messy. Refined issues have structure.

### Steps

1. Rewrite the issue description to contain all four checklist items
2. Update the title if needed
3. Add a promotion note: `bd update <id> --notes="Promoted to refined: <strand>, <confidence>"`
4. Swap the label: `bd update <id> --add-label refined --remove-label idea`

### Promotion Note Convention

The note should contain:

- **Which strand** (or "unlinked: <reason>")
- **Confidence signal** — e.g. "no open questions" or "one assumption: X needs to hold"

Example: `Promoted to refined: convention-over-infrastructure, no open questions`

## Strandless Issues

An issue that can't link to a DNA strand isn't automatically invalid. It might reveal a gap in the design DNA.

When flagging as unlinked:
- State what the issue serves instead (e.g. "developer ergonomics", "tooling gap")
- If multiple unlinked issues cluster around the same theme, that's a signal to propose a new strand

## What This Is Not

- Not a form to fill in at creation time — ideas are free-form
- Not a gate enforced by tooling (yet — see beads-helix-jgj for future hooks)
- Not a quality bar for the solution — only for the problem definition and scope
