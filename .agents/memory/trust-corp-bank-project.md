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
