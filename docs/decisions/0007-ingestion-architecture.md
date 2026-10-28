# 0007: Ingestion architecture

- Status: Accepted
- Layer: 3
- Date: 2026-10-28

## Context

Layer 3a adds the first code that writes jobs: Remotive and Remote OK now, Greenhouse, Lever and Ashby in Layer 3b. Each source has its own URL, response shape and quirks, and all of them are third-party data we do not control. Ingestion runs unattended on a schedule (Layer 4), so a bad response must be visible in the run log rather than crash silently or corrupt data. Job descriptions are third-party HTML that Layer 6 renders.

## Decision

- **Adapter pattern.** Each source implements `SourceAdapter` (`src/lib/ingestion/types.ts`): `fetchJobs()` returns raw items, `itemSchema` validates one item, `normalize()` maps it to the shared `NormalizedJob` shape. Everything after `normalize()` is source-agnostic, in one pipeline (`pipeline.ts`). A new source is one adapter plus one registry entry.
- **zod validation at the boundary, in two levels.** The envelope (the response as a whole) must match its schema or the run fails: a different envelope means the API changed. Each item is then validated on its own; an invalid item is counted (`ingestion_runs.invalid_count`) and skipped, so one malformed job never fails the run.
- **HTTP with timeout and retries** (`http.ts`). Every attempt gets its own `AbortSignal.timeout`. 429, 5xx, network errors and timeouts are retried with exponential backoff and full jitter; `Retry-After` is honored (seconds or HTTP date); if it asks for more than 60 seconds, the call gives up instead of retrying early, and the next scheduled run tries again. Other 4xx are not retried. Requests carry a descriptive User-Agent with the repo URL.
- **Sanitize HTML at ingest** (`html.ts`) with `sanitize-html` and an allowlist (paragraphs, lists, emphasis, headings, code, links with http/https/mailto only). `description_text` is derived from the sanitized HTML. Stored data is safe for every reader, so a page that forgets to sanitize cannot render an XSS payload.
- **Secret key only in server code.** `src/lib/supabase/admin.ts` uses the secret key (`service_role`, which bypasses RLS). An ESLint `no-restricted-imports` rule stops every file in `src/` from importing it or `env.server.ts`, except the listed server-only modules (the ingestion code and the two modules themselves). `import "server-only"` is not used because it throws outside Next.js's server bundle, which includes the tsx scripts.
- **Env validated with zod, failing fast** (`env.server.ts`): one error lists every missing variable by name, never by value.
- **Idempotent upsert on `(source_id, external_id)`** (`upsert.ts`): new rows are inserted; rows whose `content_hash` changed are upserted without `first_seen_at`; unchanged rows only get `last_seen_at` bumped. A closed job that reappears is reopened.
- **Run log.** Every run writes an `ingestion_runs` row with a counter per pipeline step (migration `ingestion_layer_3a`), finished as `succeeded` or `failed` with the error text.
- **CLI** `npm run ingest -- --source <id|all> [--dry-run] [--force]`. `.env.local` is loaded with Node 24's built-in `--env-file-if-exists` (tsx forwards it), so no dotenv dependency and no failure in CI, where the file does not exist.

## Alternatives considered

- **One script per source.** Duplicates validation, filtering, upsert and logging per source; the adapter pattern keeps those in one tested place.
- **Trusting the response types** (casting `response.json()`). A feed change would surface as wrong data in the database instead of a counted, logged validation failure.
- **Failing the run on any invalid item.** One bad listing would block every good one.
- **Sanitizing at render time only.** Every reader of `description_html` would have to remember to do it.
- **DOMPurify** for sanitizing. It needs a DOM (jsdom) in Node; `sanitize-html` runs on htmlparser2 directly. The `xss` package works too, but its allowlist configuration is harder to read.
- **A Postgres function for the upsert** (`ON CONFLICT ... DO UPDATE ... WHERE content_hash IS DISTINCT FROM`). One round trip and atomic, but the logic moves into SQL that is harder to unit test, and it is another function the publishable key must be denied. With a single writer, plain queries have no race.

## Consequences

- Layer 3b adds ATS adapters to the registry and extends the pipeline; it does not fork it.
- Remote OK's feed is UTF-8 decoded as Latin-1 upstream ("MÃ©xico"). Its adapter repairs this with a guarded re-decode.
- Layer 6 can render `description_html` directly, because it was sanitized on the way in.
- Dry runs still call the source API, so they obey the same rate limits as real runs.
- `.env.local` loading depends on Node 24 (`.nvmrc`). On an older Node, Vitest fails at startup (`styleText` missing from `node:util`).

## Interview talking points

- "Each source is an adapter with fetch, validate and normalize; everything after normalize is one shared, tested pipeline."
- "I validate at the boundary in two levels: a wrong envelope fails the run, a wrong item is counted and skipped, and the counts are on the run row."
- "Retries only for transient failures: 429, 5xx, network errors and timeouts, with jittered exponential backoff and Retry-After respected. A 404 is never retried."
- "I sanitize description HTML once, at ingest, with an allowlist, so stored data is safe for every page that renders it."
- "The secret key bypasses RLS, so a lint rule stops UI code from even importing the admin client."
