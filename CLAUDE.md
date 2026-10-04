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

| Command                | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                        |
| `npm run build`        | Production build                                            |
| `npm run start`        | Serve the production build                                  |
| `npm run lint`         | ESLint                                                      |
| `npm run format`       | Prettier, write changes                                     |
| `npm run format:check` | Prettier, check only (used in CI)                           |
| `npm run typecheck`    | `next typegen` (generates route types), then `tsc --noEmit` |
| `npm test`             | Vitest, single run                                          |
| `npm run test:watch`   | Vitest, watch mode                                          |

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
