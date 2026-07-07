---
name: Trust Corp Bank Project
description: Key decisions, conventions, and non-obvious constraints for this monorepo banking app
---

## Stack
- pnpm monorepo: `artifacts/api-server` (Express 5 + Drizzle + Clerk), `artifacts/trust-corp-bank` (React 19 + Vite, port 20354, preview `/`), `artifacts/admin` (React 19 + Vite, port 23744, preview `/admin/`), `lib/db` (shared Drizzle schema)
- `lib/api-client-react` and `lib/api-zod` are Orval-generated — do NOT edit manually
- DB push: `pnpm --filter @workspace/db run push`

## Auth
- Clerk keys stored as Replit secrets: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- `ADMIN_SETUP_SECRET` also a Replit secret (not in `.replit`)
- Email is Clerk-managed. Profile page calls `openUserProfile()` from `useClerk()` to let users edit email — destructure `{ signOut, openUserProfile }` from `useClerk()`.

## Email service
- Uses Resend HTTP API via fetch (no npm package) to avoid esbuild bundling issues
- Config stored in `settings` table under keys `email.provider`, `email.apiKey`, `email.fromAddress`, `email.enabled`
- Service at `artifacts/api-server/src/services/email.ts`: exports `emailAsync`, `getEmailConfig`, `saveEmailConfig`, `sendTestEmail`
- Admin UI at `/admin/email` — tracks `keyTouched` state; only sends `apiKey` to server when admin actually typed a new one (never re-submits masked placeholder)

## Notifications pattern
- All user-facing events fire three channels: in-app (`notifyAsync`), SMS (`sendSms`), email (`emailAsync`)
- Always fetch user's `email` + `phone` from DB after response is sent for fire-and-forget delivery

## Exchange route restrictions
- `POST /exchange/convert` with `execute=true` enforces banned/hardFrozen/transferRestricted/account-frozen checks (same as transfer route)
- `formatSmsAlert("exchange", { fromCurrency, fromAmount, toCurrency, toAmount, ref })` — use these exact field names
- Handle `err.status === 403` in the catch block

## Admin transactions filter
- `GET /admin/transactions` accepts `?type=<type>` with allowlist validation via `VALID_TX_TYPES` Set
- Both the item query and count query use the same `whereClause`

## Audit logging
- `auditLogsTable` in `lib/db/src/schema/audit-logs.ts`; exported from schema index
- `logAudit(adminId, adminEmail, action, targetUserId?, targetEmail?, details?)` — fire-and-forget helper defined at top of `admin.ts`
- Currently logs: KYC approve/reject/revoke, ban/unban, transfer restrict/unrestrict
- Missing: hard-freeze, credit, debit, broadcast — add when needed

## esbuild note
- `zod`/`zod/v4` cannot be resolved directly in api-server bundle; use manual validation or `@workspace/api-zod` Zod types only
- All other workspace packages bundle fine
