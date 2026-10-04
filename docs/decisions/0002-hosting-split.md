# 0002: Hosting split (Vercel + Supabase + GitHub Actions)

- Status: Accepted
- Layer: 1
- Date: 2026-10-04

## Context

The project has three kinds of work: serving the website, storing data and handling sign-in, and running scheduled jobs (job ingestion and email alerts). The total budget is under $50/month. The site deploys on Vercel Hobby, where cron is limited to once per day, which is not often enough for ingestion.

## Decision

Split hosting three ways:

- **Vercel Hobby** serves the Next.js app.
- **Supabase** provides Postgres, Auth (email+password, magic link, Google, GitHub), Storage and pgvector.
- **GitHub Actions** runs the scheduled TypeScript scripts: job ingestion, and email alerts sent through Resend.

## Alternatives considered

- **Vercel Cron for scheduled work**: rejected because Hobby cron is limited to once per day.

## Consequences

- Scheduled scripts live in the same repo as the app, and their run logs are visible in GitHub Actions.
- Ingestion scripts run outside the Next.js app, so they need their own access to Supabase through secrets stored in GitHub Actions.
- Three platforms means three places to configure environment variables and secrets.
- Database, auth, file storage and vector search all come from one service.

## Interview talking points

- "I ran ingestion on GitHub Actions instead of Vercel Cron because Hobby cron only runs daily, and Actions gave me free scheduled runs with visible logs in the same repo."
- "Supabase gives me Postgres, auth, storage and vector search, so the whole backend is one service."
- "I split the system by type of work: Vercel serves pages, Supabase holds data and identity, and GitHub Actions does anything on a schedule."
- "The whole design had to fit under $50 a month, and that constraint drove the hosting choices."
