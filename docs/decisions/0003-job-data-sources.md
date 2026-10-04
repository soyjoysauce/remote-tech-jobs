# 0003: Job data sources

- Status: Accepted
- Layer: 3
- Date: 2026-10-04

## Context

The site needs a steady supply of remote, US-based software/tech jobs. The database should stay small: a few thousand current, de-duplicated jobs. Some sources attach conditions to using their data.

## Decision

Ingest from five sources:

- Greenhouse, Lever and Ashby public job-board APIs
- Remotive
- Remote OK

Adzuna is not used.

Jobs are de-duplicated. A job that disappears from its source feed is marked closed, then deleted after a grace period.

## Alternatives considered

- **Adzuna**: excluded. The project brief does not record the reason.

TODO(human): add why Adzuna was dropped.

## Consequences

- Remotive and Remote OK require attribution and a link back, so listings from them must show their source.
- Remotive asks for only a few calls per day, so the ingestion schedule has to call it less often than the other sources.
- The same job can arrive from more than one source, so ingestion needs de-duplication.
- The closed-then-deleted lifecycle keeps the database to current jobs only.

## Interview talking points

- "I pulled jobs from the public job-board APIs of Greenhouse, Lever and Ashby, plus two remote-job aggregators, Remotive and Remote OK."
- "Two of my sources require attribution and a link back, so I treated that as a product requirement and show the source on those listings."
- "Remotive asks for only a few calls per day, so I schedule that source less often than the others."
- "I keep the database to a few thousand current jobs: when a job drops out of its source feed I mark it closed, and delete it after a grace period."
- "The same job can show up in more than one feed, so de-duplication is part of ingestion."
