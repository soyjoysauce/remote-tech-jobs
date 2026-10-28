# Claude Code prompts — remote-tech-jobs

One prompt per layer. Run them in order, one Claude Code session per prompt.

| File                      | Layer                                                                      | Learning-style parts (you write)             |
| ------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| 03a-ingestion-core.md     | Pipeline core + Remotive + Remote OK                                       | dedupe key, remote-US classifier, close rule |
| 03b-ingestion-ats.md      | Company discovery + Greenhouse/Lever/Ashby + cross-source dedupe + cleanup | canonical-job selection                      |
| 04-scheduled-runs.md      | Hosted Supabase + GitHub Actions schedules                                 | —                                            |
| 05-search-listing.md      | Postgres full-text search + listing UI                                     | search SQL function                          |
| 06-job-detail-seo.md      | Job pages, JSON-LD, sitemap, attribution                                   | —                                            |
| 07-auth-saved-jobs.md     | Supabase Auth (4 methods), allowlist, saved jobs                           | RLS policies                                 |
| 08-application-tracker.md | Application tracker                                                        | RLS policies                                 |
| 09-email-alerts.md        | Saved searches + Resend digests                                            | RLS policies                                 |
| 10-apply-kit.md           | Resume parsing + tailored resume/cover letter                              | grounding validator, storage RLS             |
| 11-embeddings-matching.md | Voyage embeddings + pgvector + hybrid ranking                              | match function + rank fusion                 |
| 12-deploy-hardening.md    | Vercel deploy, security headers, rate limits, README                       | —                                            |

## How to run each one

1. `cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker`
2. `git status --short` must print nothing (previous layer committed).
3. Run the "Before you start" commands in the file.
4. `claude`, press **Shift+Tab** until plan mode is on, paste the prompt block.
5. Choose **"Yes, manually approve edits"** when the plan is ready.
6. When it finishes, paste the final output back into the chat before starting the next file.

## Important

- These were written before Layers 2–11 ran. Each prompt tells Claude Code to read the actual schema and code first and to stop and propose a change if the repo differs from what the prompt expects. If a layer diverges a lot, bring the output back to the chat so the later prompts can be adjusted.
- Every prompt ends with the layer-end rules already in `CLAUDE.md` (checks pass, code-reviewer subagent, `docs/decisions` entry, commit, ask before push).
- Manual steps (OAuth apps, hosted Supabase project, GitHub secrets, Vercel) are listed at the bottom of the file that needs them. Secrets are always entered by you with `gh secret set` or in the provider dashboard, never pasted into Claude Code.
