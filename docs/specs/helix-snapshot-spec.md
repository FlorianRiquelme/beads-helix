# helix-snapshot — Data Backbone Requirements Spec

**Date:** 2026-04-12
**Status:** Draft
**Sources:** Multi-AI definition (Codex GPT-5.4, Gemini, Claude)

## 1. Problem Statement

Dashboard renderers (triage view, kanban board, future visualizations) each need the same enriched issue data, but computing it per-render means repeated Dolt queries, duplicated board-column logic, and inconsistent results across views. helix-snapshot provides a single pre-computed snapshot that all renderers read, keeping data retrieval and derivation logic in one place and UI code purely presentational.

## 2. Component Name & Responsibility

**helix-snapshot** is a lazy-refresh collector that reads raw issue data from Dolt, enriches it with board-column derivations and summary lines, and writes an atomic JSON snapshot to a well-known path — it does not render UI, manage the Dolt server, or run as a daemon.

## 3. Functional Requirements

**FR-01 Snapshot Generation**
The collector MUST read all issues from Dolt using two queries inside a single read-only transaction (issues+labels JOIN, and dependencies). Server-first via SQL connection to the port in `.beads/dolt-server.port`, falling back to direct `dolt sql --disable-auto-gc` against `.beads/embeddeddolt/hq`. Result written as a single JSON file.

**FR-02 Atomic Writes**
The snapshot MUST be written to a temporary file first, then atomically renamed to `/tmp/beads-sidecar/<project_id>.snapshot.json`. Readers MUST never see a partial file.

**FR-03 Board Column Derivation — Closed**
Any issue with `status: closed` MUST have `board_column` set to `"done"`, regardless of labels.

**FR-04 Board Column Derivation — In Progress**
Any issue with `status: in_progress` MUST have `board_column` set to `"in_progress"`, regardless of labels.

**FR-05 Board Column Derivation — Deferred**
Any issue with `status: deferred` MUST have `board_column` set to `"deferred"`, regardless of labels.

**FR-06 Board Column Derivation — Maturity Fallback**
For all other issues, `board_column` MUST be set to the issue's maturity label (`idea`, `refined`, or `ready`). If no maturity label is present, `board_column` MUST be `"idea"` (default).

**FR-07 Summary Line**
Each issue in the snapshot MUST include a `summary_line` field: `"<id> <title> [<board_column>]"`, pre-formatted for compact display.

**FR-08 Columns Summary**
The snapshot MUST include a top-level `columns_summary` object mapping each board column name to its issue count.

**FR-09 Invalidation via File Watch**
The collector MUST watch `.beads/last-touched` using `fs.watch`. On change, it MUST debounce for 500ms before triggering a refresh.

**FR-10 Safety-Net Refresh**
If no invalidation event has fired for 60 seconds, the collector MUST perform a refresh regardless, to catch changes made outside the watched file.

**FR-11 Staleness Metadata**
The snapshot MUST include `generated_at` (ISO 8601 timestamp) and `stale_after` (`generated_at` + 60s) at the top level so consumers can detect stale data.

**FR-12 Error Recovery**
If a Dolt read fails, the collector MUST retain the previous snapshot on disk unchanged, log the error to stderr, and retry on the next invalidation or safety-net tick.

## 4. Non-Functional Requirements

**NFR-01 Refresh Latency**
A full snapshot refresh (Dolt read + enrichment + write) MUST complete in under 2 seconds for repositories with up to 500 issues.

**NFR-02 Snapshot Read Time**
Reading and parsing the snapshot from disk MUST take under 50ms (consumers are dashboard renderers that need snappy loads).

**NFR-03 Idle Resource Usage**
When no invalidation events are firing, the collector MUST consume negligible CPU (only the fs.watch listener and a 60s timer).

**NFR-04 Crash Recovery**
If the collector process crashes, the last valid snapshot MUST remain on disk. On restart, the collector MUST generate a fresh snapshot immediately rather than trusting the existing file's `stale_after`.

**NFR-05 Compatibility**
Primary target: macOS (darwin). Secondary: Linux. `fs.watch` behavior differences between platforms MUST be accounted for (macOS uses FSEvents, Linux uses inotify).

## 5. Public API Surface

Two CLI commands and one optional library helper:

**`helix snapshot path [--repo <path>]`**
Resolves `.beads/metadata.json`, reads `project_id`, prints the snapshot path. This is the renderer discovery contract — renderers MUST NOT reimplement project discovery.

**`helix snapshot refresh [--repo <path>] [--force]`**
Acquires `/tmp/beads-sidecar/<project_id>.refresh.lock` with non-blocking `flock`. Returns JSON result:

```ts
type RefreshResult =
  | { status: 'refreshed' | 'noop' | 'busy'; snapshot_path: string; source?: 'dolt_server' | 'dolt_sql' }
  | { status: 'error'; code: 'NOT_BEADS_REPO' | 'SOURCE_UNAVAILABLE'; snapshot_path: string; message: string };
```

**`watchBeadsInvalidation(repoRoot, onDirty): FSWatcher`** (library export)
Watches `.beads/last-touched`, debounced at 500ms. Renderer owns refresh policy.

## 6. SQL Queries

Two queries in one read-only transaction for snapshot consistency:

```sql
-- Query 1: Issues with maturity labels
SELECT i.id, i.title, i.status, i.priority, i.issue_type, i.assignee,
       i.created_at, i.updated_at, i.closed_at,
       CASE
         WHEN SUM(CASE WHEN l.label = 'ready' THEN 1 ELSE 0 END) > 0 THEN 'ready'
         WHEN SUM(CASE WHEN l.label = 'refined' THEN 1 ELSE 0 END) > 0 THEN 'refined'
         WHEN SUM(CASE WHEN l.label = 'idea' THEN 1 ELSE 0 END) > 0 THEN 'idea'
         ELSE NULL
       END AS maturity,
       GROUP_CONCAT(DISTINCT l.label ORDER BY l.label SEPARATOR ',') AS labels_csv
FROM issues i
LEFT JOIN labels l ON l.issue_id = i.id
GROUP BY i.id
ORDER BY i.updated_at DESC;

-- Query 2: Dependency edges with blocker status
SELECT d.issue_id, d.depends_on_id, d.type, blocker.status AS depends_on_status
FROM dependencies d
JOIN issues blocker ON blocker.id = d.depends_on_id
WHERE d.type = 'blocks';
```

Board column derivation (in collector code, not SQL):
- `status=closed` → `done` (status wins)
- `status=in_progress` → `in_progress`
- `status=deferred` → `deferred`
- else: `maturity` field from SQL (`ready`/`refined`/`idea`, default `idea`)

## 7. Interface Contract

### Input

| Source | What is read |
|--------|-------------|
| Dolt SQL (server or direct) | `issues`, `labels`, `dependencies` tables |
| `.beads/last-touched` | Watched for mtime changes (invalidation trigger) |
| `.beads/metadata.json` | `project_id` for cache keying |
| `.beads/dolt-server.port` + `.beads/dolt-server.pid` | Server detection |

### Output

Path: `/tmp/beads-sidecar/<project_id>.snapshot.json`

```jsonc
{
  "project_id": "beads-helix",
  "generated_at": "2026-04-12T14:30:00.000Z",
  "stale_after": "2026-04-12T14:31:00.000Z",
  "columns_summary": {
    "idea": 3,
    "refined": 2,
    "ready": 1,
    "in_progress": 1,
    "done": 5,
    "deferred": 0
  },
  "issues": [
    {
      "id": "beads-helix-sw3",
      "title": "Implement /helix:close",
      "status": "open",
      "labels": ["idea"],
      "priority": 3,
      "board_column": "idea",
      "summary_line": "beads-helix-sw3 Implement /helix:close [idea]",
      "dependency_count": 1,
      "dependent_count": 0
    }
  ]
}
```

### Configuration

All values are **hardcoded conventions** (design DNA: convention over infrastructure):

| Setting | Value | Rationale |
|---------|-------|-----------|
| Snapshot path | `/tmp/beads-sidecar/<project_id>.snapshot.json` | OS temp dir, no cleanup burden |
| Debounce | 500ms | Fast enough to feel live, slow enough to batch rapid writes |
| Safety-net interval | 60s | Catches out-of-band changes without polling overhead |
| Dolt connection | Server-first, direct-fallback | Works whether or not `dolt sql-server` is running |

Nothing is user-configurable in v1.

## 8. Error Contract

| Scenario | Behavior |
|----------|----------|
| Dolt server down AND embeddeddolt lock held | Preserve existing snapshot, return `SOURCE_UNAVAILABLE`. Renderer continues stale. |
| `.beads/` missing | Return `NOT_BEADS_REPO`, no snapshot created |
| Snapshot missing or corrupted | Treat as cache miss, attempt one refresh |
| `flock` contention (another refresh running) | Return `busy` with current snapshot path |
| `bd` mid-write during read | Read-only transaction sees committed state only |
| `dolt sql` hangs | 5s timeout, kill child process, preserve last good snapshot |

## 9. Edge Cases & Failure Modes

- **Sleep/wake:** `fs.watch` may not survive. Safety-net poll (60s) is the recovery. Treat `fs.watch` as optimization, not guarantee.
- **Re-init (.beads/ deleted + bd init):** Watcher loses file descriptor. Collector MUST verify watch target exists before every poll and re-attach if missing.
- **Silent data changes (git pull/dolt pull):** `.beads/last-touched` not updated since `bd` CLI wasn't used. Safety-net poll is the only recovery.
- **Schema drift:** If beads updates its Dolt schema, collector queries may fail. Collector MUST log a clear error and preserve last good snapshot rather than crash.
- **Large repos (500+ issues):** At 500 issues, snapshot is ~40KB JSON — well within limits. NFR-01 covers the 2s refresh budget.

## 10. Security

- Snapshot files in `/tmp/beads-sidecar/` MUST be created with mode `0600` (owner-readable only)
- Use `project_id` (UUID) from `.beads/metadata.json` for file naming — not guessable paths
- Lock file in same directory with same permissions
- Never store credentials or tokens in the snapshot

## 11. Technology Choice

**Node.js/TypeScript** — rationale:
- `fs.watch` + debounce built-in
- Atomic write + JSON shaping straightforward
- Can probe Dolt server, then spawn `dolt sql --disable-auto-gc`
- No build/runtime tax if shipping compiled JS
- Better than shell for JSON, locking, cross-query transaction handling
- Better than a `bd` subcommand: helix is a layer, should not require beads core changes

## 12. Explicit Non-Goals

1. **Does not start or manage the Dolt server process.** Assumes Dolt is available; connects or falls back.
2. **Does not render any UI.** Renderers (triage, kanban, future views) are separate consumers.
3. **Does not run as a persistent daemon.** Lazy-refresh: starts on first consumer request, stops when no consumers remain.
4. **Does not write back to Dolt.** Strictly read-only; all mutations go through `bd` commands.
5. **Does not handle multi-project aggregation.** One snapshot per project. Cross-project views are a separate concern.
6. **Does not implement custom or configurable maturity stages.** Pipeline is fixed at idea/refined/ready.
7. **Does not provide a network API.** Consumers read the JSON file directly from disk.

## 13. Acceptance Criteria

**AC-01: Fresh snapshot on first run**
Given a repo with beads initialized and 3 open issues,
When the collector runs for the first time,
Then `/tmp/beads-sidecar/<project_id>.snapshot.json` exists, contains all 3 issues with correct `board_column` values, and `columns_summary` counts match.

**AC-02: Invalidation triggers refresh**
Given a valid snapshot exists and a new issue is created via `bd create`,
When `.beads/last-touched` mtime updates,
Then within 3 seconds (500ms debounce + refresh time), the snapshot includes the new issue.

**AC-03: Atomic write under concurrent read**
Given a renderer is reading the snapshot file,
When the collector writes a new snapshot simultaneously,
Then the renderer either reads the old complete snapshot or the new complete snapshot — never a partial file.

**AC-04: Dolt failure preserves last good snapshot**
Given a valid snapshot exists with `generated_at` T1,
When the Dolt server becomes unreachable and a refresh triggers,
Then the snapshot on disk remains unchanged with `generated_at` still at T1, and an error is logged to stderr.

**AC-05: Board column derivation correctness**
Given issues in states: closed, in_progress, deferred, open+idea, open+refined, open+ready, open+no-label,
When the collector generates a snapshot,
Then board_column values are: done, in_progress, deferred, idea, refined, ready, idea (respectively).
