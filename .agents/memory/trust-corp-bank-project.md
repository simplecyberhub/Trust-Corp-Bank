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
- Email is Clerk-managed. Profile page calls `openUserProfile()` from `useClerk()` — destructure `{ signOut, openUserProfile }` from `useClerk()`.

## Email service
- `RESEND_API_KEY` Replit secret → checked first; DB config is fallback
- `getEmailConfig()` in `artifacts/api-server/src/services/email.ts` reads env var first, then `settings` table
- `fromAddress` configurable in DB (`email.fromAddress`) or defaults to `onboarding@resend.dev`
- Admin test email endpoint always returns HTTP 200 with `{ success: boolean, error?: string }` (not 400) so UI shows the actual error

## Notifications pattern
- All user-facing events fire three channels: in-app (`notifyAsync`), SMS (`sendSms`), email (`emailAsync`)
- Fetch user `email` + `phone` from DB AFTER response is sent for fire-and-forget delivery

## Transfer form — bank fields
- Added: `transferType` (domestic|international), `bankName`, `routingNumber`, `swiftCode`, `iban`, `bankCountry`
- Stored in `transactionsTable` as dedicated columns (pushed to DB)
- These fields are NOT in Orval-generated `SendMoneyBody` — passed via `as any` spread in the mutate call; backend reads from `req.body` directly after Zod parse
- Backend validates: routing = 9 digits, SWIFT = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/
- `bankName` required for both; `routingNumber` required for domestic; `swiftCode` + `bankCountry` required for international

## PWA
- `manifest.json` at `public/manifest.json` — already linked in `index.html`
- `sw.js` at `public/sw.js` — registered in `index.html` via script tag
- Icons: `public/icons/icon-192.png` and `public/icons/icon-512.png` (generated via pure Node.js PNG encoder)
- iOS meta tags in `index.html`: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`
- SW strategy: API calls = network-only; navigation = cache-first shell; assets = cache-first

## Runtime error overlay
- `@replit/vite-plugin-runtime-error-modal` (`runtimeErrorOverlay()`) has been REMOVED from both vite configs — it caused the popup on every load/refresh. Do NOT re-add it.

## Exchange route restrictions
- `POST /exchange/convert` with `execute=true` enforces banned/hardFrozen/transferRestricted/account-frozen checks
- `formatSmsAlert("exchange", { fromCurrency, fromAmount, toCurrency, toAmount, ref })` — exact field names
- Handle `err.status === 403` in the catch block

## Admin transactions filter
- `GET /admin/transactions` accepts `?type=<type>` with allowlist validation via `VALID_TX_TYPES` Set
- Both item query and count query use the same `whereClause`

## Audit logging
- `auditLogsTable` in `lib/db/src/schema/audit-logs.ts`
- `logAudit(adminId, adminEmail, action, targetUserId?, targetEmail?, details?)` — fire-and-forget at top of `admin.ts`
- Logs: KYC approve/reject/revoke, ban/unban, transfer restrict/unrestrict

## esbuild note
- `zod`/`zod/v4` cannot be resolved directly in api-server bundle; use `@workspace/api-zod` Zod types only
