# 0005: Apply flow

- Status: Accepted
- Layer: 10
- Date: 2026-10-04

## Context

The site should help with applying to jobs, not only finding them. Submitting an application directly from this site is not possible: the submit endpoints of applicant tracking systems (ATS) require the employer's own API key.

## Decision

Applying happens on the employer's site. This site provides two things around it:

- An **apply kit**: a tailored resume and cover letter generated with the Anthropic Claude API.
- An **application tracker** for recording and following applications.

## Alternatives considered

- **Submitting applications from this site**: rejected because ATS submit endpoints require the employer's own API key.

## Consequences

- Every job links out to the employer's application page.
- The site never holds employer API keys.
- Because the application is submitted elsewhere, the tracker depends on the user recording it.
- Generating the apply kit calls the Claude API, so that key must stay in server code and its usage counts toward the $50/month budget.

## Interview talking points

- "I didn't build on-site application submission, because ATS submit endpoints need the employer's own API key, which a third-party site doesn't have."
- "Instead I focused on the parts I could own: an apply kit that tailors a resume and cover letter to the job, and a tracker for applications."
- "The apply kit calls the Claude API from server code, so the key never reaches the browser."
- "Users apply on the employer's site, so the tracker relies on them recording what they sent."
