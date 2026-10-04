# 0004: Search via Postgres FTS

- Status: Accepted
- Layer: 5
- Date: 2026-10-04

## Context

Users need to search job listings. The data already lives in Supabase Postgres, the database is kept to a few thousand current jobs, and the whole project has to stay under $50/month.

## Decision

Use Postgres full-text search for job search. Do not add an external search service.

## Alternatives considered

- **An external search service**: not used. The project brief does not name a specific one.

## Consequences

- Search runs in the same database as the job data, so there is no second copy of the data to keep in sync.
- No extra service to pay for or operate.
- Search quality and features are limited to what Postgres full-text search offers.

## Interview talking points

- "I used Postgres full-text search instead of a separate search service, because the jobs already live in Postgres and I only keep a few thousand of them."
- "Keeping search in the database means there is no second index to keep in sync with the job table."
- "It also kept me inside my budget of under $50 a month, since there is no extra service to pay for."
