import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { DoltIssueRow, DoltDepRow } from './types.js';

const ISSUES_QUERY = `SELECT i.id, i.title, i.status, i.priority, i.issue_type, i.assignee,
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
ORDER BY i.updated_at DESC`;

const DEPS_QUERY = `SELECT d.issue_id, d.depends_on_id, d.type, blocker.status AS depends_on_status
FROM dependencies d
JOIN issues blocker ON blocker.id = d.depends_on_id
WHERE d.type = 'blocks'`;

export type DoltSource = 'dolt_server' | 'dolt_sql';

export interface DoltResult {
  issues: DoltIssueRow[];
  deps: DoltDepRow[];
  source: DoltSource;
}

async function queryServerTransaction(
  port: number,
  database: string,
): Promise<{ issues: unknown[]; deps: unknown[] }> {
  const mysql2 = await import('mysql2/promise');
  const connection = await mysql2.createConnection({
    host: '127.0.0.1',
    port,
    user: 'root',
    database,
  });
  try {
    await connection.execute('START TRANSACTION READ ONLY');
    const [issues] = await connection.execute(ISSUES_QUERY);
    const [deps] = await connection.execute(DEPS_QUERY);
    await connection.execute('COMMIT');
    return { issues: issues as unknown[], deps: deps as unknown[] };
  } catch (err) {
    try { await connection.execute('ROLLBACK'); } catch {}
    throw err;
  } finally {
    await connection.end();
  }
}

function queryDirect(embeddedPath: string, sql: string): unknown[] {
  const stdout = execFileSync('dolt', ['sql', '--disable-auto-gc', '-q', sql, '-r', 'json'], {
    cwd: embeddedPath,
    timeout: 5000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse Dolt JSON output: ${stdout.slice(0, 200)}`);
  }
  // dolt sql -r json returns { rows: [...] } format
  return parsed.rows ?? parsed;
}

export async function readDolt(
  port: number | null,
  database: string,
  embeddedPath: string,
): Promise<DoltResult> {
  // Server-first strategy (FR-01: single read-only transaction)
  if (port !== null) {
    try {
      const { issues, deps } = await queryServerTransaction(port, database);
      return {
        issues: issues as DoltIssueRow[],
        deps: deps as DoltDepRow[],
        source: 'dolt_server',
      };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== 'ECONNREFUSED' && code !== 'ETIMEDOUT') {
        throw err;
      }
      // Fall through to direct mode
      process.stderr.write(`helix-snapshot: Dolt server unavailable (${code}), falling back to direct SQL\n`);
    }
  }

  // Direct fallback
  const issues = queryDirect(embeddedPath, ISSUES_QUERY);
  const deps = queryDirect(embeddedPath, DEPS_QUERY);

  return {
    issues: issues as DoltIssueRow[],
    deps: deps as DoltDepRow[],
    source: 'dolt_sql',
  };
}
