import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA_PATH = resolve(process.cwd(), "supabase/schemas/01_ai_daily_usage.sql");
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

const GLOBAL_TABLE_START = "create table if not exists public.ai_daily_global_usage";
const GLOBAL_TABLE_END =
  "grant select, insert, update, delete on table public.ai_daily_global_usage to service_role;";

const CONSUME_START = "create or replace function public.consume_ai_quota(";
const CONSUME_END =
  "grant execute on function public.consume_ai_quota(text, text, integer, integer) to service_role;";

const REFUND_START = "create or replace function public.refund_ai_quota(";
const REFUND_END =
  "grant execute on function public.refund_ai_quota(text, text, date) to service_role;";

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
  const consumeBlock = extractSection(schemaSql, CONSUME_START, CONSUME_END);
  const refundBlock = extractSection(schemaSql, REFUND_START, REFUND_END);

  it("keeps ai_daily_global_usage, consume_ai_quota, and refund_ai_quota in zero-drift sync with latest migrations", () => {
    expect(loadLatestMigrationSection(migrations, GLOBAL_TABLE_START, GLOBAL_TABLE_END)).toBe(
      globalBlock,
    );
    expect(loadLatestMigrationSection(migrations, CONSUME_START, CONSUME_END)).toBe(consumeBlock);
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

  it("eliminates O(N) daily SUM scans, keeps capped rejections read-only, and enforces atomic backfill + overload cleanup", () => {
    expect(consumeBlock).not.toMatch(/\bsum\s*\(\s*coaching_count\s*\)/i);
    expect(consumeBlock).not.toMatch(/\bsum\s*\(\s*classify_count\s*\)/i);
    expect(consumeBlock).toContain("from public.ai_daily_global_usage");
    expect(consumeBlock).toContain("insert into public.ai_daily_global_usage");

    const capFastPathIdx = consumeBlock.indexOf(
      "if coalesce(v_global_count, 0) >= v_global_cap then",
    );
    const requestResultsPruneIdx = consumeBlock.indexOf("delete from public.ai_request_results");
    expect(capFastPathIdx).toBeGreaterThan(-1);
    expect(requestResultsPruneIdx).toBeGreaterThan(capFastPathIdx);

    expect(allMigrationsSql).toContain("lock table public.ai_daily_usage in share mode;");
    expect(allMigrationsSql).toContain("insert into public.ai_daily_global_usage");
    expect(allMigrationsSql).toContain(
      "drop function if exists public.consume_ai_quota(text, text, integer);",
    );
  });

  it("enforces project RLS, service_role policy, null-safe kind guards, grants, and empty search_path on every object", () => {
    expect(globalBlock).toContain(
      "alter table public.ai_daily_global_usage enable row level security;",
    );
    expect(globalBlock).toContain('create policy "service_role_full_access"');
    expect(globalBlock).toContain("on public.ai_daily_global_usage");
    expect(globalBlock).toContain("for all");
    expect(globalBlock).toContain("to service_role");
    expect(globalBlock).toContain(
      "revoke all on table public.ai_daily_global_usage from public, anon, authenticated;",
    );
    expect(globalBlock).toContain(
      "grant select, insert, update, delete on table public.ai_daily_global_usage to service_role;",
    );

    expect(consumeBlock).toMatch(/security invoker/i);
    expect(consumeBlock).toContain("set search_path = ''");
    expect(consumeBlock).toContain("if p_kind is null or p_kind not in ('coach', 'classify') then");
    expect(consumeBlock).toContain(
      "revoke all on function public.consume_ai_quota(text, text, integer, integer) from public, anon, authenticated;",
    );
    expect(consumeBlock).toContain(
      "grant execute on function public.consume_ai_quota(text, text, integer, integer) to service_role;",
    );

    expect(refundBlock).toMatch(/security invoker/i);
    expect(refundBlock).toContain("set search_path = ''");
    expect(refundBlock).toContain("if p_kind is null or p_kind not in ('coach', 'classify') then");
    expect(refundBlock).toContain(
      "revoke all on function public.refund_ai_quota(text, text, date) from public, anon, authenticated;",
    );
    expect(refundBlock).toContain(
      "grant execute on function public.refund_ai_quota(text, text, date) to service_role;",
    );
  });
});
