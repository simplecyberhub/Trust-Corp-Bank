---
name: Trust Corp Bank Project
description: Hook signatures, Clerk setup, UX decisions, and API patterns for the Trust Corp Bank e-banking PWA.
---

## Hook signature rules

- No-param hooks (useGetMe, useListAccounts, useListCards, etc.) take ONE arg: `useGetMe({ query: { queryKey: getGetMeQueryKey() } })`
- Parameterized hooks (useListTransactions, useGetExchangeRates) take TWO args: `(params, options)` — correct by Orval codegen

## Type exports to watch

- `ListTransactionsType` does NOT exist as a named export. Use local `type TxFilter = "all" | "credit" | "debit" | "transfer" | "exchange" | "topup"`.
- `card.network` is `string | undefined` — accept `string | undefined` in any function that handles it.

## Clerk

- Do NOT import from `@clerk/themes` — not installed. Use inline `appearance.variables` in ClerkProvider.
- "Development mode" badge on Clerk sign-in: Clerk's own, removed only with production Clerk keys at deploy time.
- `publishableKeyFromHost` auto-selects Clerk key based on hostname.

## Transfer page

- Has Send / Top Up tabs. Home quick-action "Top Up" links to `/transfer?type=topup`.
- Uses `useSearch()` from wouter to read `?type=topup` query param for initial tab selection.

## Profile page

- Fully inline-editable with `useUpdateMe` per-field. No sub-routes.

## API users route (upsert pattern)

- `PUT /api/users/me` is an upsert: inserts if user doesn't exist (first-login race condition).
- Only non-empty, non-null field values are written on update to avoid overwriting real data.
- Layout.tsx auto-syncs Clerk name/email to backend when `me.fullName === "User"` or email is blank.

## Exchange page

- 0.5% fee on the send amount, shown in rate row.
- Toggle to execute between real accounts vs. just preview.

## Activity page

- Groups by Today / Yesterday / formatted date using date-fns `isToday`/`isYesterday`.
- Shows `balanceAfter` per transaction if available.

## Layout / nav

- Bottom nav center item (Home) is a raised floating circle with primary color.
- Clerk profile sync runs in layout `useEffect`, not in individual pages.

## Transaction PIN system

- DB columns already exist: `transactionPin` (text, scrypt hash), `pinAttempts` (int), `pinLockedUntil` (timestamp).
- Hashing: Node built-in `crypto.scrypt` (no bcrypt dep needed). Format: `salt:hash` stored in DB.
- Routes: `POST /api/users/me/pin` (set/change), `POST /api/users/me/pin/verify`, `DELETE /api/users/me/pin`.
- Lockout: 5 wrong attempts → 30-min lockout via `pinLockedUntil`.
- Frontend: PinDialog in Profile (set/change/remove); PinConfirmDialog in Transfer before send.
- Auto-submits after 4th digit entered (200ms timeout via useEffect).
- useEffect cleanup pattern: `if (condition) return; const t = setTimeout(...); return () => clearTimeout(t)` — NOT `if (condition) { ...; return cleanup; }` (TS7030).

## SMS Gateway system

- 2 new DB tables: `settings` (key-value for config) and `sms_logs` (per-message history).
- Service: `artifacts/api-server/src/services/sms.ts` — reads config from DB, sends via provider.
- 4 providers: TextBelt (key="textbelt" free, 1/day), Termii (free trial), Vonage (key:secret format), custom Webhook.
- Config keys in settings table: `sms.provider`, `sms.apiKey`, `sms.senderId`, `sms.webhookUrl`, `sms.enabled`.
- Admin routes: GET/POST `/api/admin/sms/config`, POST `/api/admin/sms/test`, GET `/api/admin/sms/logs`.
- SMS fires async (fire-and-forget) after successful transfer/topup — never blocks the API response.
- Admin SMS page at `/admin/sms` with provider cards, toggle enable/disable, test, logs table.

## Admin routes registration

- Admin router (`routes/admin.ts`) was NOT in `routes/index.ts` originally — had to add it manually.
- All admin routes use `requireAdmin` middleware (checks `user.role === "admin"`).
- `useAdminApi` hook in admin app is fully generic: `api.get<MyType>("/path")` — always pass type param.

## DB schema additions pattern

- New tables export from `lib/db/src/schema/<name>.ts`, then add `export * from "./<name>"` in `lib/db/src/schema/index.ts`.
- After schema changes: `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs`.

## Security decisions

- OTP verify brute-force: in-memory attempt map keyed `${userId}:${type}`, max 5 attempts, resets at OTP expiry. On lockout the OTP is invalidated in DB. No schema migration needed.
- Admin bootstrap (`POST /admin/setup`): gated behind `ADMIN_SETUP_SECRET` env var (body must contain `{ secret }` matching it). Returns 503 if not set — effectively disabled by default.
- CORS: narrowed from `origin: true` to regex allowing `*.replit.app`, `*.replit.dev`, and `localhost:*`. No-origin (same-origin/server) requests pass through.
- Clerk proxy: both bank and admin frontends now read `VITE_CLERK_PROXY_URL` and pass it as `proxyUrl` to ClerkProvider for parity on custom-domain deployments.
