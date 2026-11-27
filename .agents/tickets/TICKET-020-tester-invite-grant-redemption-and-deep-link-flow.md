# 20: Tester InviteGrant Redemption via ?invite=CODE Deep-Link & Inline UI

**Parent:** TICKET-017  
**Labels:** `ready-for-agent`, `tracer-bullet`, `domain`, `application`, `infrastructure`, `presentation`  
**Blocked by:** TICKET-018  
**Status:** ready-for-agent

**What to build:** Enable closed-beta and complimentary tester onboarding—playable immediately even before live merchant payout activation—by letting the product owner create single- or multi-use invitation codes in Supabase (`max_uses`, optional duration in days or unlimited, instant per-code or per-user revocation) and letting testers redeem an `InviteGrant` seamlessly via a shareable `?invite=CODE` link or an inline code input on the Upgrade Card and in the global Membership menu.

## Acceptance Criteria

- [ ] Database schema adds `invite_codes(code primary key, max_uses, used_count, grant_duration_days, expires_at, is_active, note, created_at)` and `invite_grants(user_id primary key, code references invite_codes(code), granted_at, expires_at, revoked_at)` (indexed on `code`), locked down with RLS to `service_role` only.
- [ ] Authorization precedence grants `InviteGrant` priority above `FreeAllowance` (with standard `15` `coach` / `50` `classify` UTC daily fair-use limits and zero `FreeAllowance` consumption) strictly when `invite_codes.is_active = true`, `invite_grants.revoked_at IS NULL`, and `invite_grants.expires_at IS NULL OR invite_grants.expires_at > now()`, ensuring deactivating a leaked code or revoking an individual user takes effect immediately.
- [ ] Atomic `redeem_invite_code` RPC normalizes codes (trimmed uppercase), validates `is_active`, optional code redemption deadline, and `used_count < max_uses`, returns idempotent success without incrementing `used_count` if the caller re-submits their already-active code, rejects re-redemption of a revoked grant, and allows replacing a previously expired grant with a new valid code.
- [ ] `billing` Edge Function handles `action: "redeem-invite"` behind per-user/IP rate limiting against brute-force enumeration, returning the updated `Entitlement` snapshot or typed error codes (`invite-invalid`, `invite-exhausted`, `invite-expired`, `invite-already-redeemed`).
- [ ] Application bootstrap captures `?invite=CODE` from both `window.location.search` and initial `window.location.hash` into `sessionStorage` before hash-router / loading redirects can strip query parameters, scrubs the URL immediately via `history.replaceState`, and adds `invite` to client Sentry query-param and extra-key scrubbers so codes never leak to telemetry.
- [ ] Once authenticated, `useBillingStore` automatically redeems any captured `sessionStorage` invite code with localized (`de` / `en`) success or error toast feedback, and exposes manual invite-code redemption via a collapsible form on the Upgrade Card as well as in the `GlobalHeaderActions` Membership section (displaying active tester status and optional expiration date).
- [ ] Behavioural seam tests cover `redeem-invite` rate limiting, capacity/expiry/per-code revocation rules, bootstrap URL capture across unauthenticated login redirects, Sentry `invite` scrubbing, and Upgrade Card / Membership menu redemption flows.
