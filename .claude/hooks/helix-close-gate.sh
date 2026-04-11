#!/usr/bin/env bash
# helix-close-gate.sh — PreToolUse hook for bd close
#
# FR-03: Advisory on close without ready (non-blocking)
# FR-04: Enforced gate on close while idea (blocking)
# FR-05: --force escape hatch with friction logging
# FR-07: --quiet suppression
# FR-08: Suggestion logging via bd remember
#
# Exit codes: 0 = proceed, 2 = block (hard gate)

# AC-5: Fail-safe — never break the original command
trap 'exit 0' ERR

command -v jq &>/dev/null || exit 0
command -v bd &>/dev/null || exit 0
[ -d ".beads" ] || exit 0

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

# Only match bd close commands (with or without rtk prefix)
echo "$CMD" | grep -qE '(^|\s)(rtk\s+)?bd\s+close\s' || exit 0

# Parse helix flags
FORCE=false
QUIET=false
echo "$CMD" | grep -qE '\s--force(\s|$)' && FORCE=true
echo "$CMD" | grep -qE '\s--quiet(\s|$)' && QUIET=true
[ "${HELIX_QUIET:-}" = "1" ] && QUIET=true

# Extract issue IDs: everything after "bd close" that isn't a flag
IDS=$(echo "$CMD" | sed -E 's/.*bd[[:space:]]+close[[:space:]]+//' | tr ' ' '\n' | grep -v '^--' | grep -v '^$')
[ -z "$IDS" ] && exit 0

IDEA_IDS=""
REFINED_IDS=""

for ID in $IDS; do
  ISSUE_JSON=$(bd show "$ID" --json 2>/dev/null) || continue
  STATUS=$(echo "$ISSUE_JSON" | jq -r '.[0].status // empty' 2>/dev/null) || continue

  # Skip already-closed issues
  [ "$STATUS" = "closed" ] && continue

  LABELS=$(echo "$ISSUE_JSON" | jq -r '.[0].labels[]?' 2>/dev/null) || LABELS=""

  HAS_READY=false; HAS_REFINED=false; HAS_IDEA=false; HAS_MATURITY=false
  while IFS= read -r LABEL; do
    [ -z "$LABEL" ] && continue
    case "$LABEL" in
      ready)   HAS_READY=true;   HAS_MATURITY=true ;;
      refined) HAS_REFINED=true; HAS_MATURITY=true ;;
      idea)    HAS_IDEA=true;    HAS_MATURITY=true ;;
    esac
  done <<< "$LABELS"

  # Ready issues close cleanly
  $HAS_READY && continue

  # Multiple maturity labels: use highest
  if $HAS_REFINED; then
    REFINED_IDS="$REFINED_IDS $ID"
  elif $HAS_IDEA || ! $HAS_MATURITY; then
    # idea or unlabeled (pre-idea) — both trigger the gate
    IDEA_IDS="$IDEA_IDS $ID"
  fi
done

# Strip helix-specific flags so bd doesn't see them
CLEAN_CMD=$(echo "$CMD" | sed -E 's/[[:space:]]+--force([[:space:]]|$)/ /g; s/[[:space:]]+--quiet([[:space:]]|$)/ /g' | sed 's/  */ /g; s/ *$//')

# FR-04: Enforced gate — block close on idea/unlabeled issues
if [ -n "$IDEA_IDS" ] && ! $FORCE; then
  for ID in $IDEA_IDS; do
    echo "[helix] error: cannot close $ID at stage 'idea' — promote or use --force" >&2
  done
  exit 2
fi

# FR-05: Force override — log friction event
if [ -n "$IDEA_IDS" ] && $FORCE; then
  for ID in $IDEA_IDS; do
    bd remember "maturity-friction: closed idea-stage issue $ID with --force" 2>/dev/null || true
  done
fi

# FR-03: Advisory on close without ready (non-blocking)
if [ -n "$REFINED_IDS" ] && ! $QUIET; then
  for ID in $REFINED_IDS; do
    echo "[helix] $ID is still 'refined' — promote to 'ready' before closing? (suppress: --quiet)" >&2
    bd remember "promotion-suggestion: advised promoting $ID from refined before close" 2>/dev/null || true
  done
fi

# Pass cleaned command (helix flags stripped) to bd
if [ "$CMD" != "$CLEAN_CMD" ]; then
  ORIGINAL_INPUT=$(echo "$INPUT" | jq -c '.tool_input')
  UPDATED_INPUT=$(echo "$ORIGINAL_INPUT" | jq --arg cmd "$CLEAN_CMD" '.command = $cmd')
  jq -n --argjson updated "$UPDATED_INPUT" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "updatedInput": $updated
    }
  }'
fi

exit 0
