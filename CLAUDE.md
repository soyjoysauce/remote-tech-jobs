@AGENTS.md

# Remote Tech Jobs

A personal job-search site for remote, US-based software/tech jobs, modeled on remotejobsfinder.co but with no paywall. Single user (the owner) for now; public GitHub repo. It is a portfolio piece: the owner must be able to explain every part of the codebase in job interviews.

## Stack decisions (final)

- **Web**: Next.js (App Router) + TypeScript (strict) + Tailwind, deployed on Vercel Hobby.
- **Backend**: Supabase for Postgres, Auth (email+password, magic link, Google, GitHub), Storage and pgvector.
- **Ingestion**: TypeScript scripts on a GitHub Actions schedule. Not Vercel Cron, because Hobby cron is limited to once per day.
- **Sources**: Greenhouse, Lever and Ashby public job-board APIs, plus Remotive and Remote OK. No Adzuna. Remotive and Remote OK require attribution/link-back; Remotive asks for only a few calls per day.
- **Search**: Postgres full-text search. No external search service.
- **Email alerts**: Resend, sent from GitHub Actions.
- **AI**: Anthropic Claude API for a tailored resume/cover letter (the "apply kit"); Voyage AI embeddings + pgvector for resume-to-job matching, built after core features.
- **Applying** happens on the employer's site. This site provides the apply kit and an application tracker.
- **Data size**: keep the DB to a few thousand current, de-duplicated jobs. Jobs missing from their source feed are marked closed, then deleted after a grace period.
- **SEO**: indexable server-rendered job pages with JobPosting JSON-LD.
- **Out of scope**: i18n, employer dashboard, onboarding quiz, payments.
- **Budget**: under $50/month total.

The reasoning behind each decision lives in `docs/decisions/`.

## Build order

One layer per Claude Code session.

1. Scaffold
2. DB schema
3. Ingestion
4. Scheduled runs
5. Search/listing
6. Job detail pages/SEO
7. Auth + RLS + saved jobs
8. Application tracker
9. Email alerts
10. Apply kit
11. Embeddings matching
12. Deploy/hardening

## Commands

Node version is pinned in `.nvmrc` (run `nvm use`).

| Command                    | What it does                                                             |
| -------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`              | Start the dev server                                                     |
| `npm run build`            | Production build                                                         |
| `npm run start`            | Serve the production build                                               |
| `npm run lint`             | ESLint                                                                   |
| `npm run format`           | Prettier, write changes                                                  |
| `npm run format:check`     | Prettier, check only (used in CI)                                        |
| `npm run typecheck`        | `next typegen` (generates route types), then `tsc --noEmit`              |
| `npm test`                 | Vitest, single run                                                       |
| `npm run test:watch`       | Vitest, watch mode                                                       |
| `npm run test:integration` | Vitest against the local Supabase stack (`*.integration.test.ts`)        |
| `npm run ingest`           | Ingest jobs: `-- --source remotive\|remoteok\|all [--dry-run] [--force]` |
| `npm run db:start`         | Start the local Supabase stack (needs Docker)                            |
| `npm run db:stop`          | Stop the local Supabase stack                                            |
| `npm run db:reset`         | Recreate the local DB from `supabase/migrations` + seed                  |
| `npm run db:types`         | Regenerate `src/lib/supabase/database.types.ts`                          |
| `npm run db:test`          | pgTAP tests in `supabase/tests/database`                                 |

After changing a migration, run `db:reset`, `db:test` and `db:types`, and commit the regenerated types; CI fails if they are stale. The local stack uses ports 5532x (API 55321, Postgres 55322, Studio 55323), not the Supabase defaults.

`ingest` and `test:integration` read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env.local`. A dry run writes nothing but still calls the source API. Remotive is skipped if its last recorded run (any status) was under 6 hours ago, unless `--force`.

## Ingestion rules

Code in `src/lib/ingestion/`; reasons in decisions 0007 and 0008; study guides in `docs/study/`.

- **Closing strategy, per source** (`selectJobsToClose` in `reconcile.ts`):
  - **max_age** (Remotive, Remote OK): their feeds are recent windows (Remotive's free API returns ~15 jobs). Close when `posted_at` (or `first_seen_at`) is strictly older than 30 days. Never close a job for being missing from the feed. Items already past the max age are dropped before the upsert (`stale_count`).
  - **snapshot** (for the Layer 3b ATS boards): close open jobs missing from a successful fetch. Pass one board's jobs as the scope, not the whole source.
  - **Circuit breaker**, both strategies: close nothing when the fetch failed, returned 0 items, or returned under 50% of the previous successful run's `fetched_count`. The reason goes in `ingestion_runs.warnings`.
- **Attribution rule (Layer 6):** Remotive and Remote OK job pages must name the source and link to `source_url` with a followed link (no `rel="nofollow"`). `nofollow` in `description_html` applies only to links inside descriptions.
- `description_html` is sanitized at ingest; render it as stored. `dedupe_key` is indexed, not unique; Layer 3b groups by it.
- The admin client (`src/lib/supabase/admin.ts`) bypasses RLS. ESLint blocks every file in `src/` from importing it, except the server-only modules listed in `eslint.config.mjs`.

## Conventions

- Server components by default. Add `"use client"` only when a component needs state, effects or browser APIs.
- No `any`. Use `unknown` and narrow, or define a type.
- Secrets only in server code. Never give a secret a `NEXT_PUBLIC_` prefix and never import a server-only key into a client component.
- Small typed modules in `src/lib/`.
- Tests sit next to the code they cover as `*.test.ts(x)`.

## Learning workflow rules

These apply to every session.

- Every layer starts in plan mode; wait for the owner's approval before editing.
- Explain non-obvious code as you write it: what it does, why this approach, what the alternative was.
- For ingestion/de-duplication, the search query, RLS policies, and embeddings, use Learning style: leave `TODO(human)` for the core logic and let the owner write it.
- Every layer ends with:
  1. lint, typecheck, test and build all pass;
  2. run the `code-reviewer` subagent and fix Blocking items;
  3. add a `docs/decisions/` entry;
  4. a conventional commit.
