# Layer 4 — Hosted Supabase + scheduled GitHub Actions

**Goal:** a hosted Supabase project receives the migrations automatically from `main`, and GitHub Actions runs ingestion every 6 hours plus daily discovery, cleanup and a storage/health check, with a summary table on each run. These runs also keep the free Supabase project from pausing after 7 days idle.

**Mode:** plan mode. Explanatory.

## Before you start (manual)

1. In the Supabase dashboard, create a new project (free plan, the region closest to you). Save the database password in your password manager.
2. Create a personal access token: Supabase dashboard → Account → Access Tokens.
3. Then:

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
claude
```

## Prompt

```
Layer 4: Hosted Supabase + scheduled GitHub Actions. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @.github/workflows/ @package.json @scripts/ @supabase/config.toml @CLAUDE.md

## Preconditions (stop if any fail)
- Layer 3b committed; ingest, discover, cleanup and storage-report scripts exist and pass locally.
- I have created a hosted Supabase project. Ask me for the project ref (it's not secret). Never ask me to paste the DB password, access token or secret key into this session.

## Part A: Link and deploy migrations
1. `npx supabase login` and `npx supabase link --project-ref <ref>` are interactive: tell me to run them myself in a separate terminal, then continue.
2. Push migrations with `npx supabase db push` after showing me the dry run (`--dry-run`), and ask before the real push.
3. Seed: the sources rows must exist in production. Decide whether to move them from seed.sql into a migration (seed.sql only runs locally) and explain the trade-off.
4. Workflow .github/workflows/db-deploy.yml: on push to main when supabase/migrations/** changes, run supabase db push using secrets SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_ID. Explain why migrations deploy from CI instead of my laptop.

## Part B: Scheduled workflows
Constraints to design around (explain each):
- GitHub cron minimum interval is 5 minutes; runs at the top of the hour are often delayed, so use an off-minute (e.g. 17 */6 * * *).
- In a public repo, scheduled workflows are automatically disabled after 60 days with no repository activity.
- Remotive asks for only a few calls per day (the 6-hour gate in the adapter already enforces this).

Workflows:
1. ingest.yml: every 6 hours + workflow_dispatch (with a "source" input). Steps: checkout, setup-node from .nvmrc, npm ci, ingest --source all, dedupe pass. concurrency group "ingest" with cancel-in-progress: false (never kill a run mid-write). timeout-minutes.
2. maintenance.yml: daily + workflow_dispatch. discover (re-verify companies), cleanup, storage-report. Storage-report exiting non-zero fails the run so GitHub emails me.
3. health check (inside maintenance.yml or its own script): fail if no succeeded ingestion_run in the last 24 hours. Explain how this catches silent failures.
4. Each run writes a Markdown table to $GITHUB_STEP_SUMMARY: per-source fetched/eligible/inserted/updated/closed, duplicates, storage %.
5. Security:
   - permissions: contents: read on every workflow
   - Secrets only via env on the step that needs them
   - Pin third-party actions to a full commit SHA with the version in a comment
   - Add .github/dependabot.yml for github-actions and npm (weekly)
6. Scripts need env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from repo secrets. Make sure scripts read process.env when .env.local is absent (CI).

## Part C: Secrets (I run these, not you)
List every secret each workflow needs and give me the exact `gh secret set NAME` commands (they prompt for the value without echoing). Wait for me to confirm, then trigger `gh workflow run ingest.yml` and `gh workflow run maintenance.yml`, watch with `gh run watch`, and show me the summaries.

## Docs and finish
1. README: architecture section (Vercel later / Supabase / GitHub Actions), how to re-enable a schedule disabled by inactivity (`gh workflow enable <name>`), and how to run a workflow manually.
2. docs/decisions/0011 scheduling on GitHub Actions (frequencies, off-minute cron, concurrency without cancel, health check, migration deploy from CI). Reasons from this prompt only.
3. Layer-end rules from CLAUDE.md. Code-reviewer focus: secret exposure in logs, workflow permissions, action pinning.

## Final output to me
- Files table, first scheduled-run summaries, verification, reviewer findings
- 5 interview talking points
- Anything I must do manually
```
