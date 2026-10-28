// dedupe_key: spots the same job listed on more than one source.
//
// The same posting often arrives from two feeds with different spelling:
//   Remotive:   "Acme, Inc." + "Senior Software Engineer (Remote)"
//   Remote OK:  "ACME"       + "Sr. Software Engineer - Remote"
// Both must produce the same key, "acme|senior software engineer", so Layer 3b can show the job
// once. Two different jobs must never share a key, or 3b would hide one behind the other.
//
// The key identifies a posting; it is not a search filter. Company is part of it because the
// same title at two companies is two different jobs.
//
// Study guide: docs/study/dedupe-key.md

// ---------------------------------------------------------------------------
// Rules as data
// ---------------------------------------------------------------------------
// The rules are lists, not if-chains, so tuning them after a real ingest run is a one-word
// edit (plus a test case in dedupe.test.ts).

/**
 * Legal suffixes removed from the END of a company name, matched as whole words.
 * "Acme Inc" -> "acme", but "Costco" and "Co Labs" keep their "co".
 */
const COMPANY_SUFFIXES = new Set(["inc", "llc", "ltd", "corp", "co"]);

/**
 * Title words rewritten to one spelling. "Sr", "Sr." and "SR." all reach this map as "sr"
 * (toWords lower-cases and removes dots first), and leave as "senior".
 */
const TITLE_ALIASES: Record<string, string> = { sr: "senior", jr: "junior" };

// ---------------------------------------------------------------------------
// Shared cleanup
// ---------------------------------------------------------------------------

/**
 * Turns free text into a list of plain lower-case words.
 *
 *   "Acme, L.L.C."         -> ["acme", "llc"]
 *   "Sr. Full-Stack Dev"   -> ["sr", "full", "stack", "dev"]
 *   "Ciudad de México"     -> ["ciudad", "de", "mexico"]
 *
 * Every later rule works on whole words, which is why spaces are kept as word boundaries
 * instead of being deleted ("acmeinc" would hide the word "inc").
 */
function toWords(text: string): string[] {
  return (
    text
      // 1. Split accented letters into base letter + accent mark ("é" -> "e" + U+0301)...
      .normalize("NFKD")
      // 2. ...then delete the marks. \p{M} is the Unicode "mark" category; it needs the u flag.
      .replace(/\p{M}/gu, "")
      // 3. Case never distinguishes two jobs.
      .toLowerCase()
      // 4. Delete dots outright, so abbreviations stay one word: "l.l.c." -> "llc", "sr." -> "sr".
      //    (Replacing them with spaces would give "l l c", which no suffix rule matches.)
      .replace(/\./g, "")
      // 5. Any other run of non-letters/digits becomes ONE space: "full-stack" -> "full stack",
      //    "acme, inc" -> "acme inc". The + collapses ", " into a single space.
      .replace(/[^a-z0-9]+/g, " ")
      // 6. Remove the space step 5 may leave at either end.
      .trim()
      // 7. Split into words. filter drops the single "" that split returns for empty input.
      .split(" ")
      .filter((word) => word !== "")
  );
}

// ---------------------------------------------------------------------------
// The two halves of the key
// ---------------------------------------------------------------------------

/**
 * Company half of the key: cleaned words, minus one trailing legal suffix.
 *
 *   "Acme, Inc."  -> "acme"
 *   "Acme Co."    -> "acme"
 *   "Co Labs"     -> "co labs"   (suffix only counts at the end)
 *   "Costco"      -> "costco"    (whole words only: "co" inside a word is untouched)
 */
function normalizeCompany(companyName: string): string {
  const words = toWords(companyName);

  // words[words.length - 1] is typed string | undefined because the project enables
  // noUncheckedIndexedAccess (an array index can be out of range). The undefined check below
  // narrows it without a ! assertion.
  const last = words[words.length - 1];

  // Drop the last word if it is a legal suffix. words.length > 1 keeps a company whose whole
  // name is "Co" from becoming an empty string.
  if (words.length > 1 && last !== undefined && COMPANY_SUFFIXES.has(last)) {
    words.pop();
  }

  return words.join(" ");
}

/**
 * Title half of the key: the role, without location qualifiers, with seniority spelled out.
 *
 *   "Sr. Software Engineer - Remote"     -> "senior software engineer"
 *   "Senior Software Engineer (Remote)"  -> "senior software engineer"
 *   "Back-end Engineer - US"             -> "back end engineer"
 *   "Software Engineer II"               -> "software engineer ii"   (levels are kept)
 *
 * Order matters: steps 1 and 2 look for punctuation (" - ", parentheses) that toWords erases,
 * so they must run before it.
 */
function normalizeTitle(title: string): string {
  // 1. Keep only what comes before the first " - " (space, hyphen, space). That drops
  //    "- Remote", "- United States" and "- Remote - US". A hyphen without spaces, as in
  //    "Back-end", is part of a word and does not split.
  //    split always returns at least one element, so the ?? fallback never runs; it is there
  //    because noUncheckedIndexedAccess types [0] as possibly undefined.
  const beforeQualifier = title.split(" - ")[0] ?? title;

  // 2. Remove every "( ... )" group: "(Remote)", "(US)", "(Remote, US)".
  //    [^)]* means "any characters except )", so each match stops at its own closing paren.
  const withoutParens = beforeQualifier.replace(/\([^)]*\)/g, " ");

  // 3. Clean into words, then 4. replace aliases word by word ("sr" -> "senior").
  //    TITLE_ALIASES[word] is undefined for most words; ?? keeps the word unchanged then.
  return toWords(withoutParens)
    .map((word) => TITLE_ALIASES[word] ?? word)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Builds the dedupe_key stored on every job: "<company>|<title>", both normalized.
 *
 * Equal for the same posting however each source spells it:
 *   computeDedupeKey("Acme, Inc.", "Senior Software Engineer (Remote)")
 *   computeDedupeKey("ACME", "Sr. Software Engineer - Remote")
 *   // both -> "acme|senior software engineer"
 *
 * Different for different postings: other roles ("frontend" vs "backend"), other levels
 * ("ii" vs "iii"), other companies.
 *
 * The "|" separator keeps the two halves apart. Without it, "Acme Data" + "Engineer" and
 * "Acme" + "Data Engineer" would both become "acme data engineer". toWords removes every "|"
 * from the inputs, so the separator can only appear once.
 *
 * jobs.dedupe_key is indexed, not unique (decision 0006): a wrong collision groups two rows in
 * Layer 3b's canonical selection but never blocks an insert or loses data.
 */
export function computeDedupeKey(companyName: string, title: string): string {
  return `${normalizeCompany(companyName)}|${normalizeTitle(title)}`;
}
