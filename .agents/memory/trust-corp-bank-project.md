---
name: Trust Corp Bank Project
description: Key decisions and gotchas for the Trust Corp Bank e-banking PWA
---

## Hook call signatures
Generated Orval hooks like `useGetMe`, `useListAccounts`, etc. take ONE argument (options object), not two. Always call as:
```ts
useGetMe({ query: { queryKey: getGetMeQueryKey() } })
```
NOT `useGetMe(undefined, { query: ... })`.

**Why:** The OpenAPI spec has no path/body params for these endpoints, so orval generates 0-1 arg signatures.

**How to apply:** Any time you add a new page/component using generated hooks with no path params, use single-arg form.

## No @clerk/themes in frontend
Do not import `@clerk/themes` in the frontend — the package is not installed. Use inline appearance variables in `clerkAppearance` instead.

**Why:** The design subagent tried to use it but it wasn't available and causes build failures.

## DB schema location
All tables are in `lib/db/src/schema/`. Run `pnpm --filter @workspace/db run push` after schema changes, then `pnpm run typecheck:libs` to rebuild declarations.

## Backend route registration
All API routes are registered in `artifacts/api-server/src/routes/index.ts`. The `getUserId(clerkId)` helper in `routes/accounts.ts` is imported by other route files.

## Clerk proxy
`clerkProxyMiddleware` in `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` is only active in production. Uses `publishableKeyFromHost` from `@clerk/shared/keys` on the server and `@clerk/react/internal` on the client.

## Exchange rates
`routes/exchange.ts` uses `open.er-api.com/v6/latest/{base}` with a 60s in-memory cache. Falls back to hardcoded approximate rates if API is unavailable.
