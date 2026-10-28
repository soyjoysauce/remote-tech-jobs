// Title-based tech-role classifier.
//
// A title is a tech role when it matches an INCLUDE pattern and no EXCLUDE pattern. Exclude
// wins, which is what keeps "Sales Engineer", "Technical Recruiter" and "Customer Support
// Engineer" out: they contain tech words but are sales, recruiting and support jobs.
//
// Driven by the two lists below rather than by code, so tuning it after a real run means
// editing a list. Title-only on purpose: tags and descriptions mention tech in almost every job
// at a tech company, including the ones we want to exclude.

/** Engineering roles: software, frontend, backend, full-stack, web, mobile, devops/SRE, QA/test,
 * data engineering, security engineering. "engineer" alone counts, because aggregator titles are
 * often bare ("Principal Engineer"); the exclude list removes non-software engineers. */
export const TECH_INCLUDE_PATTERNS: readonly RegExp[] = [
  /\bengineer(s|ing)?\b/,
  /\b(developer|programmer|coder)\b/,
  /\b(devops|devsecops|sre|site reliability)\b/,
  /\b(qa|quality assurance|sdet|tester)\b/,
  /\btest automation\b/,
  /\b(tech|technical) lead\b/,
  /\bmember of technical staff\b/,
  /\b(software|cloud|data|platform|security|systems?|infrastructure|frontend|backend|mobile) architect\b/,
];

export const TECH_EXCLUDE_PATTERNS: readonly RegExp[] = [
  // Sales and business development, including technical pre-sales.
  /\b(sales|pre-?sales|account (executive|manager)|business development|bdr|sdr)\b/,
  /\bsolutions? (engineer|architect|consultant)\b/,
  // Marketing and content.
  /\b(marketing|marketer|seo|copywriter|content|developer (relations|advocate|evangelist)|devrel)\b/,
  // Recruiting and people.
  /\b(recruit(er|ing|ment)?|talent|sourcer|hr|people (ops|operations|partner))\b/,
  // Support and customer-facing roles.
  /\b(customer|client) (support|success|service|experience)\b/,
  /\b(support (engineer|specialist|agent|representative|analyst)|technical support|help ?desk|service desk)\b/,
  // Non-software engineering disciplines.
  /\b(civil|mechanical|electrical|chemical|structural|manufacturing|process|hvac|biomedical|industrial|mining|petroleum|environmental|field|sound|audio) engineer/,
  /\bestimator\b/,
  // Data labeling and AI-training gigs, which reuse "QA" and "engineer".
  /\b(annotator|annotation|ai trainer|evaluator|rater)\b/,
];

/** True when the title is a tech role we want to list. */
export function isTechRole(title: string): boolean {
  // Lower-case once and turn separators into spaces, so "Full-Stack" and "Back-end" match the
  // same patterns as "full stack" and "back end", and the patterns need no "i" flag.
  const normalized = title.toLowerCase().replace(/[_/|]+/g, " ");
  if (TECH_EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized)))
    return false;
  return TECH_INCLUDE_PATTERNS.some((pattern) => pattern.test(normalized));
}
