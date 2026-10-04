# 0001: Next.js App Router

- Status: Accepted
- Layer: 1
- Date: 2026-10-04

## Context

The site lists remote tech jobs and needs job pages that search engines can index, server-rendered and carrying JobPosting JSON-LD. It also calls services with secret keys (Supabase service role, Anthropic, Voyage, Resend), and those keys must stay in server code. It deploys on Vercel Hobby and the whole project has to stay under $50/month.

## Decision

Use Next.js with the App Router, TypeScript in strict mode, and Tailwind. Components are server components by default; client components are the exception.

## Alternatives considered

None were recorded in the project brief.

TODO(human): add any alternatives you actually weighed and why you ruled them out.

## Consequences

- Job pages can be rendered on the server, so their content and JSON-LD are in the HTML that crawlers receive.
- Server components give a natural home for code that uses secrets, which supports the "secrets only in server code" convention.
- The app deploys to Vercel Hobby, which fits the budget.
- Vercel Hobby cron runs at most once per day, so scheduled work moves elsewhere (see 0002).

## Interview talking points

- "I needed job pages that are indexable, so I chose a framework that renders them on the server and lets me put JobPosting JSON-LD straight into the HTML."
- "I default to server components and only opt into client components when a piece of UI needs state or browser APIs."
- "Keeping data access in server code means my API keys never reach the browser."
- "I turned on strict TypeScript plus noUncheckedIndexedAccess from day one, because the app parses third-party job feeds and I wanted the compiler to make me handle missing data."
