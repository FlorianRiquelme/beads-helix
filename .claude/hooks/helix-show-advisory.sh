#!/usr/bin/env bash
# helix-show-advisory.sh — PostToolUse hook for bd show
#
# FR-02: Advisory on show (refined → ready suggestion)
# FR-06: Session deduplication (1x per session per issue)
# FR-07: --quiet suppression
# FR-08: Suggestion logging via bd remember
#
# Exit code: always 0 (PostToolUse hooks are non-blocking)

# AC-5: Fail-safe — never interfere with the original command
trap 'exit 0' ERR

command -v jq &>/dev/null || exit 0
command -v bd &>/dev/null || exit 0
[ -d ".beads" ] || exit 0

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
[ -z "$CMD" ] && exit 0

# Only match bd show (not bd show --json, which is our own internal call)
echo "$CMD" | grep -qE '(^|\s)(rtk\s+)?bd\s+show\s' || exit 0
echo "$CMD" | grep -qE '\s--json(\s|$)' && exit 0

# FR-07: Check quiet
[ "${HELIX_QUIET:-}" = "1" ] && exit 0

# Extract issue ID (first non-flag arg after "bd show")
ID=$(echo "$CMD" | sed -E 's/.*bd[[:space:]]+show[[:space:]]+//' | awk '{print $1}')
[ -z "$ID" ] && exit 0
echo "$ID" | grep -qE '^--' && exit 0

# FR-06: Session deduplication
if [ -n "$SESSION_ID" ]; then
  DEDUP_FILE="/tmp/helix-show-${SESSION_ID}-${ID}"
  [ -f "$DEDUP_FILE" ] && exit 0
fi

# Get issue data
ISSUE_JSON=$(bd show "$ID" --json 2>/dev/null) || exit 0
STATUS=$(echo "$ISSUE_JSON" | jq -r '.[0].status // empty' 2>/dev/null) || exit 0
[ "$STATUS" = "closed" ] && exit 0

# Check for refined label
LABELS=$(echo "$ISSUE_JSON" | jq -r '.[0].labels[]?' 2>/dev/null) || exit 0
HAS_REFINED=false
while IFS= read -r LABEL; do
  [ "$LABEL" = "refined" ] && HAS_REFINED=true
done <<< "$LABELS"
$HAS_REFINED || exit 0

# Check acceptance criteria exist
ACC=$(echo "$ISSUE_JSON" | jq -r '.[0].acceptance_criteria // empty' 2>/dev/null) || ACC=""
[ -z "$ACC" ] && exit 0

# Check no open questions in notes
NOTES=$(echo "$ISSUE_JSON" | jq -r '.[0].notes // empty' 2>/dev/null) || NOTES=""
echo "$NOTES" | grep -qi "open question" && exit 0

# All checks pass — suggest promotion
echo "[helix] $ID looks ready for promotion (has acceptance criteria, no open questions)" >&2

# FR-08: Log suggestion
bd remember "promotion-suggestion: suggested promoting $ID from refined to ready on bd show" 2>/dev/null || true

# FR-06: Mark as shown this session
if [ -n "$SESSION_ID" ]; then
  touch "$DEDUP_FILE" 2>/dev/null || true
fi

# Provide context to Claude
jq -n --arg id "$ID" '{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": ("Issue " + $id + " appears ready for promotion from refined to ready — it has acceptance criteria and no open questions. Suggest: bd update " + $id + " --add-label ready --remove-label refined")
  }
}'
