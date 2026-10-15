# Layer 11 — Embeddings matching (Voyage + pgvector)

**Goal:** a "Jobs matching your resume" page ranks open jobs by semantic similarity to your primary resume, so roles worded differently from your resume still surface. Job embeddings are created during scheduled ingestion, only for new or changed jobs, using Voyage AI (Anthropic's recommended embeddings provider) and stored with pgvector in Supabase. You write the match function and the hybrid ranking that combines vector similarity with the Layer 5 keyword search. A small labeled evaluation measures whether hybrid ranking actually beats either method alone.

**Mode:** plan mode. Explanatory, with Learning-style `TODO(human)` for the match function and rank fusion.

## Before you start (manual)

1. Create a Voyage AI account and API key.
2. Add it to `.env.local` as `VOYAGE_API_KEY` yourself.

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
claude
```

## Prompt

```
Layer 11: Embeddings matching. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @supabase/migrations/ @src/lib/ingestion/ @src/lib/ai/ @src/app/ @.github/workflows/ingest.yml @.env.example

## Preconditions (stop if any fail)
- Layer 10 committed; I have a primary parsed resume locally.
- Read current Voyage AI docs: model names (voyage-4 family as of 2026), default and supported output dimensions, input_type ("document" vs "query"), batch size and token limits, rate limits, free-token allowance. Read current Supabase pgvector docs for HNSW indexes and halfvec. Don't rely on memory for these.

## Part A: Data (migration)
- Enable the vector extension (in the extensions schema per Supabase guidance).
- job_embeddings: job_id (PK, FK jobs ON DELETE CASCADE), model, dims, content_hash, embedding vector(N) (or halfvec; compare storage for my job count and choose), created_at. Separate table instead of a jobs column; explain (re-embedding on model change, keeping job row scans lean).
- resume_embeddings: resume_id (PK, FK CASCADE), user_id, model, embedding, created_at. RLS owner-only (follow my existing pattern).
- HNSW index with cosine ops on job_embeddings. Explain HNSW vs IVFFlat and why exact search might be fine at a few thousand rows; show EXPLAIN for both.
- job_embeddings has RLS enabled with public read (embeddings are derived from public data) or no policies + access only through a function; decide and explain.

## Part B: Embedding pipeline
- src/lib/embeddings/voyage.ts: typed client using fetch or the official SDK (justify), batching, retry via the existing http helper, input_type support.
- Embedding text per job: title, company, tags, then description_text truncated to a token budget. Clean newlines/whitespace first. Explain why one vector per job (descriptions are short) instead of chunking with overlap, and when chunking would be needed.
- scripts/embed-jobs.ts (npm script "embed"): embed open canonical jobs whose job_embeddings row is missing or whose content_hash/model changed. --dry-run, --limit. Print counts and tokens used.
- Add an embed step to ingest.yml after dedupe and before alerts. Give me the `gh secret set VOYAGE_API_KEY` command; I'll run it.
- Resume embedding: created/updated when the primary resume's parsed data is saved (input_type "query"; explain the asymmetric query/document setup). Text = summary + titles + bullets + skills.

## Part C: Matching (TODO(human), Learning style)
Write signatures, SQL comments and FAILING tests (pgTAP for SQL, Vitest for TS), then stop.
1. SQL function match_jobs(query_embedding, match_count, min_similarity, plus the same filter params as search_jobs): open canonical jobs ordered by cosine distance (<=>), returning similarity = 1 - distance. SECURITY INVOKER.
   Tests: nearest job first; closed/duplicate jobs excluded; filters apply; min_similarity cuts off.
2. Hybrid ranking with Reciprocal Rank Fusion: hybrid_search_jobs (SQL) or a TS function combining search_jobs (keyword ranks) and match_jobs (vector ranks): score = sum of 1 / (k + rank) across lists, k = 60 by default. Explain why RRF needs no score normalization.
   Tests: a job ranked top in both lists wins; a job in only one list still appears; k changes the weighting as expected.

## Part D: UI
- /account/matches: top jobs for my primary resume, with filters, similarity shown as a label (Strong/Good/Fair; explain thresholds come from the eval, not guesses), and "Why this match" listing overlapping skills (computed in code from resume skills vs job text, no extra LLM call).
- Search page: when signed in with a resume, an optional "Rank with my resume" toggle that switches to hybrid ranking.

## Part E: Evaluate retrieval
- scripts/eval-matching.ts (npm script "eval:match"): I label ~30 jobs as relevant/not relevant to my resume in evals/labels/matches.json (create the file with instructions and an example). Compute precision@10 and nDCG@10 for keyword-only, vector-only and hybrid (RRF), and print a comparison table. Use the result to set the label thresholds in Part D.

## Finish
1. After my TODO(human) tests pass: run embed locally, show token usage, run eval:match after I label jobs, and show me the comparison table.
2. Layer-end rules from CLAUDE.md. Code-reviewer focus: dimension/model mismatches, re-embedding logic, RLS on resume embeddings, query cost.
3. docs/decisions/0018 embeddings design (Voyage model + dims, separate table, no chunking, HNSW vs exact, RRF hybrid, evaluation results). Reasons from this prompt only.

## Final output to me
- Files table, embed stats, eval table, verification, reviewer findings
- 5 interview talking points (embeddings vs keyword search, asymmetric query/document embeddings, HNSW, RRF, measuring retrieval quality)
- Anything I must do manually
```
