import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA_PATH = resolve(process.cwd(), "supabase/schemas/01_ai_daily_usage.sql");
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

const GLOBAL_TABLE_START = "create table if not exists public.ai_daily_global_usage";
const GLOBAL_TABLE_END =
  "grant select, insert, update, delete on table public.ai_daily_global_usage to service_role;";

const FREE_ALLOWANCE_START = "create table if not exists public.free_allowance_usage";
const FREE_ALLOWANCE_END =
  "grant select, insert, update, delete on table public.free_allowance_usage to service_role;";

const ENTITLEMENT_STATUS_START = "create or replace function public.get_entitlement_status(";
const ENTITLEMENT_STATUS_END =
  "grant execute on function public.get_entitlement_status(text, text, text) to service_role;";

const AUTHORIZE_START = "create or replace function public.authorize_ai_request(";
const AUTHORIZE_END =
  "grant execute on function public.authorize_ai_request(text, text, text, text, integer, integer, integer) to service_role;";

const REFUND_START = "create or replace function public.refund_ai_quota(";
const REFUND_END =
  "grant execute on function public.refund_ai_quota(text, text, date, text, boolean) to service_role;";

function extractSection(sql: string, startMarker: string, endMarker: string): string {
  const start = sql.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Missing start marker: ${startMarker}`);
  }
  const end = sql.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }
  return sql.slice(start, end + endMarker.length).trim();
}

function loadLatestMigrationSection(
  migrations: Array<{ name: string; sql: string }>,
  startMarker: string,
  endMarker: string,
): string {
  const latest = [...migrations].reverse().find((migration) => migration.sql.includes(startMarker));
  if (!latest) {
    throw new Error(`No migration defines ${startMarker}`);
  }
  return extractSection(latest.sql, startMarker, endMarker);
}

describe("ai_daily_global_usage schema and migration contract", () => {
  const schemaSql = readFileSync(SCHEMA_PATH, "utf8");
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"),
    }));
  const allMigrationsSql = migrations.map((m) => m.sql).join("\n");

  const globalBlock = extractSection(schemaSql, GLOBAL_TABLE_START, GLOBAL_TABLE_END);
  const freeAllowanceBlock = extractSection(schemaSql, FREE_ALLOWANCE_START, FREE_ALLOWANCE_END);
  const entitlementStatusBlock = extractSection(
    schemaSql,
    ENTITLEMENT_STATUS_START,
    ENTITLEMENT_STATUS_END,
  );
  const authorizeBlock = extractSection(schemaSql, AUTHORIZE_START, AUTHORIZE_END);
  const refundBlock = extractSection(schemaSql, REFUND_START, REFUND_END);

  it("keeps ai_daily_global_usage, free_allowance_usage, and RPCs in zero-drift sync with latest migrations", () => {
    expect(loadLatestMigrationSection(migrations, GLOBAL_TABLE_START, GLOBAL_TABLE_END)).toBe(
      globalBlock,
    );
    expect(loadLatestMigrationSection(migrations, FREE_ALLOWANCE_START, FREE_ALLOWANCE_END)).toBe(
      freeAllowanceBlock,
    );
    expect(
      loadLatestMigrationSection(migrations, ENTITLEMENT_STATUS_START, ENTITLEMENT_STATUS_END),
    ).toBe(entitlementStatusBlock);
    expect(loadLatestMigrationSection(migrations, AUTHORIZE_START, AUTHORIZE_END)).toBe(
      authorizeBlock,
    );
    expect(loadLatestMigrationSection(migrations, REFUND_START, REFUND_END)).toBe(refundBlock);
  });

  it("wraps LOCK TABLE migrations in an explicit transaction (the Supabase CLI adds none)", () => {
    for (const { name, sql } of migrations) {
      const lockIdx = sql.search(/^\s*lock table/im);
      if (lockIdx === -1) continue;
      expect(sql.slice(0, lockIdx), name).toMatch(/^\s*begin;/im);
      expect(sql.slice(lockIdx), name).toMatch(/^\s*commit;/im);
    }
  });

  it("eliminates O(N) daily SUM scans, keeps capped rejections read-only, enforces 24-month TTL separately, and guarantees deadlock-free lock ordering", () => {
    expect(authorizeBlock).not.toMatch(/\bsum\s*\(\s*coaching_count\s*\)/i);
    expect(authorizeBlock).not.toMatch(/\bsum\s*\(\s*classify_count\s*\)/i);
    expect(authorizeBlock).toContain("from public.ai_daily_global_usage");
    expect(authorizeBlock).toContain("insert into public.ai_daily_global_usage");

    const capFastPathIdx = authorizeBlock.indexOf(
      "if v_global_cap <= 0 or coalesce(v_global_count, 0) >= v_global_cap then",
    );
    const requestResultsPruneIdx = authorizeBlock.indexOf("delete from public.ai_request_results");
    expect(capFastPathIdx).toBeGreaterThan(-1);
    expect(requestResultsPruneIdx).toBeGreaterThan(capFastPathIdx);

    // 24-month FreeAllowance retention must use interval '24 months' (separate from 30-day daily pruning)
    expect(freeAllowanceBlock).toContain("idx_free_allowance_usage_updated_at");
    expect(authorizeBlock).toContain("where updated_at < (v_now - interval '24 months')");

    // Independent coach vs classify free-allowance checks
    expect(authorizeBlock).toContain(
      "p_kind = 'coach' and v_free_coach_used >= v_free_coach_limit",
    );
    expect(authorizeBlock).toContain(
      "p_kind = 'classify' and v_free_classify_used >= v_free_classify_limit",
    );

    // Deadlock-free lock ordering: ai_daily_usage -> free_allowance_usage -> ai_daily_global_usage
    const authDailyIdx = authorizeBlock.indexOf("insert into public.ai_daily_usage");
    const authFreeIdx = authorizeBlock.indexOf("insert into public.free_allowance_usage");
    const authGlobalIdx = authorizeBlock.indexOf("insert into public.ai_daily_global_usage");
    expect(authDailyIdx).toBeGreaterThan(-1);
    expect(authFreeIdx).toBeGreaterThan(authDailyIdx);
    expect(authGlobalIdx).toBeGreaterThan(authFreeIdx);

    // Key-rotation parity & null-safe p_free_daily_limit guard in authorize_ai_request
    expect(authorizeBlock).toContain(
      "if p_free_daily_limit is null or p_free_daily_limit <= 0 then",
    );
    const fastPathSlice = authorizeBlock.slice(capFastPathIdx, requestResultsPruneIdx);
    expect(fastPathSlice).toContain("p_previous_subject_digest");
    expect(fastPathSlice).toContain("greatest(");
    expect(authorizeBlock).toContain("on conflict (subject_digest) do update");
    expect(authorizeBlock).toContain(
      "coach_used = greatest(public.free_allowance_usage.coach_used, excluded.coach_used)",
    );

    const refDailyIdx = refundBlock.indexOf("update public.ai_daily_usage");
    const refFreeIdx = refundBlock.indexOf("update public.free_allowance_usage");
    const refGlobalIdx = refundBlock.indexOf("update public.ai_daily_global_usage");
    expect(refDailyIdx).toBeGreaterThan(-1);
    expect(refFreeIdx).toBeGreaterThan(refDailyIdx);
    expect(refGlobalIdx).toBeGreaterThan(refFreeIdx);

    expect(allMigrationsSql).toContain("lock table public.ai_daily_usage in share mode;");
    expect(allMigrationsSql).toContain("insert into public.ai_daily_global_usage");
    expect(allMigrationsSql).toContain(
      "drop function if exists public.consume_ai_quota(text, text, integer, integer);",
    );
    expect(allMigrationsSql).toContain(
      "drop function if exists public.refund_ai_quota(text, text, date);",
    );
  });

  it("enforces project RLS, service_role policy, null-safe kind guards, grants, and empty search_path on every object", () => {
    for (const [tableName, block] of [
      ["ai_daily_global_usage", globalBlock],
      ["free_allowance_usage", freeAllowanceBlock],
    ] as const) {
      expect(block).toContain(`alter table public.${tableName} enable row level security;`);
      expect(block).toContain('create policy "service_role_full_access"');
      expect(block).toContain(`on public.${tableName}`);
      expect(block).toContain("for all");
      expect(block).toContain("to service_role");
      expect(block).toContain(
        `revoke all on table public.${tableName} from public, anon, authenticated;`,
      );
      expect(block).toContain(
        `grant select, insert, update, delete on table public.${tableName} to service_role;`,
      );
    }

    for (const [fnName, sig, block] of [
      ["get_entitlement_status", "text, text, text", entitlementStatusBlock],
      ["authorize_ai_request", "text, text, text, text, integer, integer, integer", authorizeBlock],
      ["refund_ai_quota", "text, text, date, text, boolean", refundBlock],
    ] as const) {
      expect(block).toMatch(/security invoker/i);
      expect(block).toContain("set search_path = ''");
      expect(block).toContain(
        `revoke all on function public.${fnName}(${sig}) from public, anon, authenticated;`,
      );
      expect(block).toContain(
        `grant execute on function public.${fnName}(${sig}) to service_role;`,
      );
    }

    expect(authorizeBlock).toContain(
      "if p_kind is null or p_kind not in ('coach', 'classify') then",
    );
    expect(refundBlock).toContain("if p_kind is null or p_kind not in ('coach', 'classify') then");
  });
});
