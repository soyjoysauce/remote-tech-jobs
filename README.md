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

Requires Node 24 (pinned in `.nvmrc`).

```bash
nvm use
npm install
cp .env.example .env.local   # fill in values as later layers need them
npm run dev
```

Open http://localhost:3000.

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

## Attribution

Job listings from [Remotive](https://remotive.com) and [Remote OK](https://remoteok.com) are shown with a link back to the source, as those sources require.
