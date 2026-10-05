# Remote Tech Jobs

A personal job-search site for remote, US-based software and tech jobs, with no paywall. It collects jobs from public job boards, makes them searchable, and helps with applying: a tailored resume and cover letter (the "apply kit") plus an application tracker. Applying itself happens on the employer's site.

Status: early build. The project is built in layers; see `CLAUDE.md` for the build order and `docs/decisions/` for why each choice was made.

## Stack

- Next.js (App Router), TypeScript (strict), Tailwind CSS, deployed on Vercel
- Supabase: Postgres, Auth, Storage, pgvector
- Job ingestion and email alerts run as TypeScript scripts on GitHub Actions
- Job sources: Greenhouse, Lever and Ashby public job-board APIs, Remotive, Remote OK
- Search: Postgres full-text search
- Email: Resend
- AI: Anthropic Claude API (apply kit), Voyage AI embeddings (resume-to-job matching)
- Tooling: ESLint, Prettier, Vitest, React Testing Library

## Local setup

Requires Node 24 (pinned in `.nvmrc`) and Docker, which runs the local Supabase stack.

```bash
nvm use
npm install
cp .env.example .env.local   # fill in values as later layers need them
npm run db:start             # first run downloads the Supabase images
npm run dev
```

Open http://localhost:3000.

### Local database

`npm run db:start` runs Supabase (Postgres, Auth, Studio and the rest) in Docker. This project uses ports 5532x instead of Supabase's default 5432x, so it can run next to another local Supabase project:

- API: http://127.0.0.1:55321
- Postgres: port 55322
- Studio: http://127.0.0.1:55323

To fill in the Supabase values in `.env.local`, run `npx supabase status -o env` and copy `API_URL` to `NEXT_PUBLIC_SUPABASE_URL`, `PUBLISHABLE_KEY` to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SECRET_KEY` to `SUPABASE_SECRET_KEY`.

The schema lives in `supabase/migrations/`. After changing a migration:

```bash
npm run db:reset   # recreate the database from the migrations, then run supabase/seed.sql
npm run db:test    # pgTAP tests in supabase/tests/database/
npm run db:types   # regenerate src/lib/supabase/database.types.ts, then commit it
```

CI runs the same three steps and fails if the committed types are out of date.

## Scripts

| Script                 | Purpose                              |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start the dev server                 |
| `npm run build`        | Production build                     |
| `npm run start`        | Serve the production build           |
| `npm run lint`         | Run ESLint                           |
| `npm run format`       | Format all files with Prettier       |
| `npm run format:check` | Check formatting without writing     |
| `npm run typecheck`    | Generate route types, then run `tsc` |
| `npm test`             | Run tests once                       |
| `npm run test:watch`   | Run tests in watch mode              |
| `npm run db:start`     | Start the local Supabase stack       |
| `npm run db:stop`      | Stop the local Supabase stack        |
| `npm run db:reset`     | Recreate the local database          |
| `npm run db:types`     | Regenerate the database types        |
| `npm run db:test`      | Run the database (pgTAP) tests       |

## Attribution

Job listings from [Remotive](https://remotive.com) and [Remote OK](https://remoteok.com) are shown with a link back to the source, as those sources require.
