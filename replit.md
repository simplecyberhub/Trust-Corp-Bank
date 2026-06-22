# Trust Corp Bank

A full production-ready e-banking PWA — dark-themed mobile-first US digital bank with Clerk auth, real PostgreSQL, and live exchange rates.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/trust-corp-bank run dev` — run the React frontend (port 20354, served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + TailwindCSS + shadcn/ui + Wouter
- Auth: Clerk (@clerk/react client, @clerk/express server)
- API: Express 5 + OpenAPI-first contract (Orval codegen → React Query hooks + Zod)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- Build: esbuild (CJS bundle for server)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)
- `lib/db/src/schema/` — Drizzle table definitions (users, accounts, transactions, beneficiaries, cards, notifications)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/trust-corp-bank/src/pages/` — Frontend pages (home, activity, transfer, cards, exchange, notifications, profile, kyc)
- `artifacts/trust-corp-bank/src/components/` — Shared UI components including layout + bottom nav

## Architecture decisions

- **Contract-first API**: OpenAPI spec → Orval codegen generates hooks + schemas. Never write raw fetch or manual TanStack Query hooks.
- **Clerk proxy**: `clerkProxyMiddleware` in the API server proxies Clerk FAPI through `/api/__clerk` for custom-domain deployments. Only active in production.
- **Exchange rates**: `open.er-api.com` (no key required) with 60s in-memory cache + hardcoded fallback rates.
- **User creation**: Users are auto-created in the DB on first `GET /api/users/me` call using Clerk JWT identity.
- **Authentication guard**: All routes except `/sign-in` and `/sign-up` are protected with Clerk's `<Show when="signed-in">` component.

## Product

Trust Corp Bank features:
- **Home**: Total balance summary, swipeable account cards, quick actions (Top Up/Transfer/Exchange), quick beneficiary transfer, recent activity feed
- **Activity**: Full transaction history with type filters (All/Credit/Debit/Transfer/Exchange)
- **Transfer**: Send money to any account or saved beneficiary, add/remove beneficiaries
- **Cards**: Virtual/physical card management, freeze/unfreeze, issue new cards
- **Exchange**: Live currency rates (30+ currencies), real-time conversion preview, execute exchanges between accounts
- **Notifications**: In-app notifications with unread badge, mark all read
- **Profile**: Edit personal info, view KYC status
- **KYC**: Identity verification form (name, DOB, address, ID document)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Generated hooks with no path params take ONE argument: `useGetMe({ query: { queryKey: getGetMeQueryKey() } })` — NOT `(undefined, { ... })`.
- Do NOT import from `@clerk/themes` — not installed. Use inline `appearance.variables` in ClerkProvider.
- After schema changes: run `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs`.
- `getUserId()` helper in `routes/accounts.ts` is imported by all other route files.
- Do not run `pnpm dev` at workspace root — use workflows or `pnpm --filter`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.local/skills/clerk-auth/references/setup-and-customization.md` for Clerk proxy and publishable key patterns
