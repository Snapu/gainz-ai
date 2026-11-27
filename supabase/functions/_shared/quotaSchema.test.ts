import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_COST_CAP_USD_MICROS } from "./tokenCost";

const SCHEMA_PATH = resolve(process.cwd(), "supabase/schemas/01_ai_daily_usage.sql");
const TOKEN_SCHEMA_PATH = resolve(process.cwd(), "supabase/schemas/03_ai_token_usage.sql");
const INVITE_SCHEMA_PATH = resolve(process.cwd(), "supabase/schemas/04_invite_grants.sql");
const SUBSCRIPTION_SCHEMA_PATH = resolve(process.cwd(), "supabase/schemas/05_subscriptions.sql");
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
  "grant execute on function public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint) to service_role;";

const REFUND_START = "create or replace function public.refund_ai_quota(";
const REFUND_END =
  "grant execute on function public.refund_ai_quota(text, text, date, text, boolean) to service_role;";

const TOKEN_USAGE_TABLE_START = "create table if not exists public.ai_monthly_token_usage";
const TOKEN_USAGE_TABLE_END =
  "grant select, insert, update, delete on table public.ai_monthly_token_usage to service_role;";

const RECORD_TOKEN_USAGE_START = "create or replace function public.record_ai_token_usage(";
const RECORD_TOKEN_USAGE_END =
  "grant execute on function public.record_ai_token_usage(text, date, text, text, text, boolean, bigint, bigint, bigint, bigint, bigint) to service_role;";

const USER_COSTS_VIEW_START = "create or replace view public.v_ai_user_costs";
const USER_COSTS_VIEW_END = "grant select on public.v_ai_user_costs to service_role;";

const UNIT_ECONOMICS_VIEW_START = "create or replace view public.v_ai_unit_economics_monthly";
const UNIT_ECONOMICS_VIEW_END =
  "grant select on public.v_ai_unit_economics_monthly to service_role;";

const INVITE_CODES_TABLE_START = "create table if not exists public.invite_codes";
const INVITE_CODES_TABLE_END =
  "grant select, insert, update, delete on table public.invite_codes to service_role;";

const INVITE_GRANTS_TABLE_START = "create table if not exists public.invite_grants";
const INVITE_GRANTS_TABLE_END =
  "grant select, insert, update, delete on table public.invite_grants to service_role;";

const INVITE_ATTEMPTS_TABLE_START = "create table if not exists public.invite_redeem_attempts";
const INVITE_ATTEMPTS_TABLE_END =
  "grant select, insert, update, delete on table public.invite_redeem_attempts to service_role;";

const CHECK_INVITE_RATE_LIMIT_START =
  "create or replace function public.check_invite_redeem_rate_limit(";
const CHECK_INVITE_RATE_LIMIT_END =
  "grant execute on function public.check_invite_redeem_rate_limit(text, text, integer, integer, integer) to service_role;";

const REDEEM_INVITE_CODE_START = "create or replace function public.redeem_invite_code(";
const REDEEM_INVITE_CODE_END =
  "grant execute on function public.redeem_invite_code(text, text) to service_role;";

const USER_SUBSCRIPTIONS_TABLE_START = "create table if not exists public.user_subscriptions";
const USER_SUBSCRIPTIONS_TABLE_END =
  "grant select, insert, update, delete on table public.user_subscriptions to service_role;";

const PROCESSED_WEBHOOK_TABLE_START = "create table if not exists public.processed_webhook_events";
const PROCESSED_WEBHOOK_TABLE_END =
  "grant select, insert, update, delete on table public.processed_webhook_events to service_role;";

const SYNC_SUBSCRIPTION_RPC_START = "create or replace function public.sync_subscription_webhook(";
const SYNC_SUBSCRIPTION_RPC_END =
  "grant execute on function public.sync_subscription_webhook(text, bigint, text, text, text, text, text, text, boolean, timestamptz) to service_role;";

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
  const tokenSchemaSql = readFileSync(TOKEN_SCHEMA_PATH, "utf8");
  const inviteSchemaSql = readFileSync(INVITE_SCHEMA_PATH, "utf8");
  const subscriptionSchemaSql = readFileSync(SUBSCRIPTION_SCHEMA_PATH, "utf8");
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
  const tokenUsageBlock = extractSection(
    tokenSchemaSql,
    TOKEN_USAGE_TABLE_START,
    TOKEN_USAGE_TABLE_END,
  );
  const recordTokenUsageBlock = extractSection(
    tokenSchemaSql,
    RECORD_TOKEN_USAGE_START,
    RECORD_TOKEN_USAGE_END,
  );
  const userCostsViewBlock = extractSection(
    tokenSchemaSql,
    USER_COSTS_VIEW_START,
    USER_COSTS_VIEW_END,
  );
  const unitEconomicsViewBlock = extractSection(
    tokenSchemaSql,
    UNIT_ECONOMICS_VIEW_START,
    UNIT_ECONOMICS_VIEW_END,
  );
  const inviteCodesBlock = extractSection(
    inviteSchemaSql,
    INVITE_CODES_TABLE_START,
    INVITE_CODES_TABLE_END,
  );
  const inviteGrantsBlock = extractSection(
    inviteSchemaSql,
    INVITE_GRANTS_TABLE_START,
    INVITE_GRANTS_TABLE_END,
  );
  const inviteAttemptsBlock = extractSection(
    inviteSchemaSql,
    INVITE_ATTEMPTS_TABLE_START,
    INVITE_ATTEMPTS_TABLE_END,
  );
  const checkInviteRateLimitBlock = extractSection(
    inviteSchemaSql,
    CHECK_INVITE_RATE_LIMIT_START,
    CHECK_INVITE_RATE_LIMIT_END,
  );
  const redeemInviteCodeBlock = extractSection(
    inviteSchemaSql,
    REDEEM_INVITE_CODE_START,
    REDEEM_INVITE_CODE_END,
  );
  const userSubscriptionsBlock = extractSection(
    subscriptionSchemaSql,
    USER_SUBSCRIPTIONS_TABLE_START,
    USER_SUBSCRIPTIONS_TABLE_END,
  );
  const processedWebhookBlock = extractSection(
    subscriptionSchemaSql,
    PROCESSED_WEBHOOK_TABLE_START,
    PROCESSED_WEBHOOK_TABLE_END,
  );
  const syncSubscriptionRpcBlock = extractSection(
    subscriptionSchemaSql,
    SYNC_SUBSCRIPTION_RPC_START,
    SYNC_SUBSCRIPTION_RPC_END,
  );

  it("keeps ai_daily_global_usage, free_allowance_usage, token usage, invite tables, views, and RPCs in zero-drift sync with latest migrations", () => {
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
    expect(
      loadLatestMigrationSection(migrations, TOKEN_USAGE_TABLE_START, TOKEN_USAGE_TABLE_END),
    ).toBe(tokenUsageBlock);
    expect(
      loadLatestMigrationSection(migrations, RECORD_TOKEN_USAGE_START, RECORD_TOKEN_USAGE_END),
    ).toBe(recordTokenUsageBlock);
    expect(loadLatestMigrationSection(migrations, USER_COSTS_VIEW_START, USER_COSTS_VIEW_END)).toBe(
      userCostsViewBlock,
    );
    expect(
      loadLatestMigrationSection(migrations, UNIT_ECONOMICS_VIEW_START, UNIT_ECONOMICS_VIEW_END),
    ).toBe(unitEconomicsViewBlock);
    expect(
      loadLatestMigrationSection(migrations, INVITE_CODES_TABLE_START, INVITE_CODES_TABLE_END),
    ).toBe(inviteCodesBlock);
    expect(
      loadLatestMigrationSection(migrations, INVITE_GRANTS_TABLE_START, INVITE_GRANTS_TABLE_END),
    ).toBe(inviteGrantsBlock);
    expect(
      loadLatestMigrationSection(
        migrations,
        INVITE_ATTEMPTS_TABLE_START,
        INVITE_ATTEMPTS_TABLE_END,
      ),
    ).toBe(inviteAttemptsBlock);
    expect(
      loadLatestMigrationSection(
        migrations,
        CHECK_INVITE_RATE_LIMIT_START,
        CHECK_INVITE_RATE_LIMIT_END,
      ),
    ).toBe(checkInviteRateLimitBlock);
    expect(
      loadLatestMigrationSection(migrations, REDEEM_INVITE_CODE_START, REDEEM_INVITE_CODE_END),
    ).toBe(redeemInviteCodeBlock);
    expect(
      loadLatestMigrationSection(
        migrations,
        USER_SUBSCRIPTIONS_TABLE_START,
        USER_SUBSCRIPTIONS_TABLE_END,
      ),
    ).toBe(userSubscriptionsBlock);
    expect(
      loadLatestMigrationSection(
        migrations,
        PROCESSED_WEBHOOK_TABLE_START,
        PROCESSED_WEBHOOK_TABLE_END,
      ),
    ).toBe(processedWebhookBlock);
    expect(
      loadLatestMigrationSection(
        migrations,
        SYNC_SUBSCRIPTION_RPC_START,
        SYNC_SUBSCRIPTION_RPC_END,
      ),
    ).toBe(syncSubscriptionRpcBlock);
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

    const capFastPathIdx = authorizeBlock.indexOf("if v_global_cap <= 0");
    const requestResultsPruneIdx = authorizeBlock.indexOf("delete from public.ai_request_results");
    expect(capFastPathIdx).toBeGreaterThan(-1);
    expect(requestResultsPruneIdx).toBeGreaterThan(capFastPathIdx);
    expect(globalBlock).toContain(
      "estimated_cost_usd_micros bigint not null default 0 check (estimated_cost_usd_micros >= 0)",
    );
    expect(authorizeBlock).toContain(
      `v_default_global_cost_cap_micros constant bigint := ${DEFAULT_DAILY_COST_CAP_USD_MICROS};`,
    );
    expect(authorizeBlock).toContain("coalesce(v_global_cost_micros, 0) >= v_global_cost_cap");
    expect(authorizeBlock).toContain(
      "and public.ai_daily_global_usage.estimated_cost_usd_micros < v_global_cost_cap",
    );
    expect(tokenUsageBlock).toContain("constraint ai_monthly_token_usage_pkey primary key");
    expect(tokenUsageBlock).toContain("year_month char(7) not null check");
    expect(tokenUsageBlock).toContain("request_kind text not null check");
    expect(tokenUsageBlock).toContain("entitlement_source text not null check");
    for (const col of [
      "active_ai_users",
      "p50_cost_usd",
      "p95_cost_usd",
      "cost_usd_by_kind",
      "cost_usd_by_source",
      "active_subscribers",
      "estimated_margin_eur_per_subscriber",
    ]) {
      expect(unitEconomicsViewBlock).toContain(col);
    }
    expect(allMigrationsSql).toContain(
      "drop function if exists public.authorize_ai_request(text, text, text, text, integer, integer, integer);",
    );

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

    // User quota refunds must never reverse recorded API costs
    expect(refundBlock).not.toContain("ai_monthly_token_usage");
    expect(refundBlock).not.toContain("estimated_cost_usd_micros");

    expect(recordTokenUsageBlock).toContain("insert into public.ai_monthly_token_usage");
    expect(recordTokenUsageBlock).toContain("insert into public.ai_daily_global_usage");
    expect(recordTokenUsageBlock).toContain("estimated_cost_usd_micros");

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
      ["ai_monthly_token_usage", tokenUsageBlock],
      ["invite_codes", inviteCodesBlock],
      ["invite_grants", inviteGrantsBlock],
      ["invite_redeem_attempts", inviteAttemptsBlock],
      ["user_subscriptions", userSubscriptionsBlock],
      ["processed_webhook_events", processedWebhookBlock],
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
      [
        "authorize_ai_request",
        "text, text, text, text, integer, integer, integer, bigint",
        authorizeBlock,
      ],
      ["refund_ai_quota", "text, text, date, text, boolean", refundBlock],
      [
        "record_ai_token_usage",
        "text, date, text, text, text, boolean, bigint, bigint, bigint, bigint, bigint",
        recordTokenUsageBlock,
      ],
      [
        "check_invite_redeem_rate_limit",
        "text, text, integer, integer, integer",
        checkInviteRateLimitBlock,
      ],
      ["redeem_invite_code", "text, text", redeemInviteCodeBlock],
      [
        "sync_subscription_webhook",
        "text, bigint, text, text, text, text, text, text, boolean, timestamptz",
        syncSubscriptionRpcBlock,
      ],
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

    for (const [viewName, block] of [
      ["v_ai_user_costs", userCostsViewBlock],
      ["v_ai_unit_economics_monthly", unitEconomicsViewBlock],
    ] as const) {
      expect(block).toMatch(/with\s*\(\s*security_invoker\s*=\s*true\s*\)/i);
      expect(block).toContain(`revoke all on public.${viewName} from public, anon, authenticated;`);
      expect(block).toContain(`grant select on public.${viewName} to service_role;`);
    }

    expect(authorizeBlock).toContain(
      "if p_kind is null or p_kind not in ('coach', 'classify') then",
    );
    expect(refundBlock).toContain("if p_kind is null or p_kind not in ('coach', 'classify') then");

    // Active InviteGrant precedence & immediate revocation checks in both SQL RPCs
    for (const block of [entitlementStatusBlock, authorizeBlock]) {
      expect(block).toContain("and c.is_active = true");
      expect(block).toContain("and g.revoked_at is null");
      expect(block).toContain("and (g.expires_at is null or g.expires_at > v_now)");
    }
    expect(authorizeBlock).toContain("'invite_grant'::text");
    expect(inviteGrantsBlock).toContain("idx_invite_grants_code");
    expect(redeemInviteCodeBlock).toContain("pg_advisory_xact_lock");
    expect(checkInviteRateLimitBlock).toContain("p_user_max_attempts");
    expect(checkInviteRateLimitBlock).toContain("p_ip_max_attempts");
    expect(allMigrationsSql).toContain(
      "drop function if exists public.get_entitlement_status(text, text, text);",
    );
    expect(allMigrationsSql).toContain(
      "drop function if exists public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint);",
    );

    // Subscription precedence (active/trialing/3-day past_due grace) & monotonic webhook sync
    for (const block of [entitlementStatusBlock, authorizeBlock]) {
      expect(block).toContain("from public.user_subscriptions");
      expect(block).toContain("v_sub_status in ('active', 'trialing')");
      expect(block).toContain("v_sub_status = 'past_due'");
      expect(block).toContain("v_sub_grace_ends_at > v_now");
    }
    expect(authorizeBlock).toContain("'subscription'::text");
    expect(syncSubscriptionRpcBlock).toContain("pg_advisory_xact_lock");
    expect(syncSubscriptionRpcBlock).toContain("interval '3 days'");
    expect(syncSubscriptionRpcBlock).toContain("public.user_subscriptions.status <> 'canceled'");
    expect(syncSubscriptionRpcBlock).toContain(
      "(public.user_subscriptions.status = 'canceled' and excluded.status <> 'canceled')",
    );
    expect(syncSubscriptionRpcBlock).toContain(
      "excluded.last_event_created >= public.user_subscriptions.last_event_created",
    );
    expect(processedWebhookBlock).toContain("idx_processed_webhook_events_processed_at");
  });
});
