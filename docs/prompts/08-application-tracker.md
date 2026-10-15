# Layer 8 — Application tracker

**Goal:** mark any job as applied and track it through statuses (applied, interviewing, offer, rejected, withdrawn) with dates, notes and a full status history. Applications keep a snapshot of the job's title, company and URLs, so your history survives after the job closes and is cleaned up. Includes a board view and a table view with filters, plus manually added applications for jobs found elsewhere.

**Mode:** plan mode. Explanatory, with Learning-style `TODO(human)` for RLS policies.

## Before you start

```bash
cd ~/Desktop/sauce-dev/remote-tech-jobs-seeker
git status --short
npm run db:start
claude
```

## Prompt

```
Layer 8: Application tracker. Follow the learning workflow rules in CLAUDE.md. Present a plan and wait for my approval.

Context: @supabase/migrations/ @src/lib/supabase/ @src/app/account/ @scripts/cleanup.ts @docs/decisions/

## Preconditions (stop if any fail)
- Layer 7 committed; I can sign in locally; saved_jobs RLS tests pass.

## Part A: Data (migration)
- application_status enum: applied, interviewing, offer, rejected, withdrawn. Explain enum vs check constraint vs lookup table and pick one.
- applications:
  - id, user_id (FK auth.users ON DELETE CASCADE)
  - job_id nullable (FK jobs ON DELETE SET NULL)
  - Snapshot columns: job_title, company_name, apply_url, job_page_url, source
  - status, applied_at (date), next_step_at (nullable date), notes (text, length-capped)
  - created_at, updated_at
  - Unique (user_id, job_id) where job_id is not null (partial unique index)
  Explain why snapshotting beats joining to jobs here (cleanup deletes closed jobs).
- application_events: id, application_id (FK ON DELETE CASCADE), user_id, from_status, to_status, note, created_at. A trigger inserts an event on status change. Explain trigger vs app-code event logging.
- RLS on both. Policies are TODO(human), Learning style: comments + FAILING pgTAP tests, then stop. Tests:
  - Owner can CRUD own applications; others cannot read or modify
  - Owner can read own events; nobody can insert/update/delete events directly (only the trigger writes them; explain how a SECURITY DEFINER trigger function bypasses the missing insert policy, and its search_path requirement)
  - Inserting an application with another user's user_id fails
- Update the cleanup script extension point: confirm deleting a job leaves applications intact with job_id null (integration test).

## Part B: Server actions (src/app/account/applications/actions.ts)
- createFromJob(jobId), createManual(fields), updateStatus(id, status, note?), updateDetails(id, fields), delete(id).
- zod validation; return typed results ({ ok, error }) instead of throwing to the client.
- createFromJob reads the job server-side for the snapshot (never trust snapshot fields from the client).
- revalidatePath for affected routes.

## Part C: UI
- "Mark as applied" button on the job page and JobCard (becomes a status badge once applied); saving from a saved job is one click.
- /account/applications:
  - Board view: columns per status with drag-and-drop to change status. Use a maintained accessible DnD library (justify the pick) with keyboard support.
  - Table view: sortable by applied_at / next_step_at, filter by status, search by company/title.
  - URL param ?view=board|table.
- Application detail drawer: snapshot info, link to job page (or "job no longer listed"), notes editor, next-step date, status history timeline.
- "Add application" form for jobs found elsewhere.
- Small stats strip: total applied, by status, applied this week. Computed in SQL (a view or RPC), not in JS; explain.

## Tests
- pgTAP above; integration test for cleanup + SET NULL; unit tests for action input schemas; component test for status change (optimistic UI rolls back on error).

## Finish
1. After my TODO(human) tests pass: create 3 applications locally across statuses and show me the event history.
2. Layer-end rules from CLAUDE.md. Code-reviewer focus: RLS, trusting client input, trigger security.
3. docs/decisions/0015 tracker data model (snapshot + SET NULL, event table via trigger, enum choice). Reasons from this prompt only.

## Final output to me
- Files table, verification, reviewer findings
- 5 interview talking points
- Anything I must do manually
```
