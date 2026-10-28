// Decides whether a job is remote and open to people living in the US.
//
// Approach: look for POSITIVE signals (US, North America, Americas, worldwide) in the location
// text. Anything else that names a place counts as non-US. That avoids keeping a list of every
// country in the world: "Germany", "Remote (UK)" and "Bishkek" all fall out as "a place that is
// not one of ours".
//
// Study guide: docs/study/remote-us.md

/**
 * Where a remote job accepts workers from.
 * - us: US only, or a list of US states/cities ("Remote, CA or NY"), or any explicit US mention
 *   alongside other countries ("USA, Canada", "Europe, USA").
 * - north_america: "North America" / "Northern America" without naming the US.
 * - americas: "Americas" without naming the US.
 * - worldwide: "Worldwide", "Anywhere", "Global".
 * - non_us: names places, none of which include the US ("Remote - Canada", "EMEA", "LATAM").
 * - unknown: no usable location text.
 *
 * jobs.remote_region stores every value except non_us (those jobs are filtered out).
 */
export const REMOTE_REGIONS = [
  "us",
  "north_america",
  "americas",
  "worldwide",
  "non_us",
  "unknown",
] as const;
export type RemoteRegion = (typeof REMOTE_REGIONS)[number];

export interface RemoteUSInput {
  /** The source's location text, as given. "", whitespace and null all mean "no location". */
  locationRaw: string | null;
  /** The source says the job is remote (both aggregators only list remote jobs). */
  sourceRemoteFlag?: boolean;
  /** Source tags, lower or mixed case. May carry a hint such as "us-only" or "worldwide". */
  tags?: readonly string[];
}

export interface RemoteUSResult {
  /** The job is remote, from the location text, the source flag or a tag. */
  isRemote: boolean;
  remoteRegion: RemoteRegion;
  /** isRemote AND the region accepts US-based workers: us, north_america, americas,
   * worldwide, or unknown (see the judgment call below). */
  eligible: boolean;
}

// ---------------------------------------------------------------------------
// Signal lists. Phrases are lower-case words, matched as whole words (see hasPhrase).
// ---------------------------------------------------------------------------

/** Names of the US itself. "us" and "usa" also cover "U.S." and "U.S.A.", because dots are
 * removed before matching. Bare "america" is NOT here: it would match "North America". */
const US_COUNTRY_PHRASES = [
  "us",
  "usa",
  "united states",
  "united states of america",
];

/** Full state names (and DC). Matched case-insensitively as whole words.
 * Known ambiguity: "georgia" is also a country. */
const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas",
  "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah",
  "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia",
]; // prettier-ignore

/**
 * Two-letter state codes. Matched ONLY in upper case in the original text ("Austin, TX"),
 * because several codes are ordinary lower-case words: "or" (Oregon), "in" (Indiana),
 * "me" (Maine), "de" (Delaware, and Spanish "de" in "Ciudad de México").
 */
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]); // prettier-ignore

const NORTH_AMERICA_PHRASES = ["north america", "northern america"];
const AMERICAS_PHRASES = ["americas"];
const WORLDWIDE_PHRASES = [
  "worldwide",
  "world wide",
  "anywhere",
  "global",
  "globally",
];

/** Words that say something about remoteness but name no place. */
const REMOTE_WORDS = ["remote", "remotely", "wfh"];

/**
 * Words that carry no place information. Whatever is left after removing these (and the remote
 * words) is treated as a place name; if none of the positive signals matched, it is non-US.
 */
const FILLER_WORDS = new Set([
  ...REMOTE_WORDS,
  "only", "fully", "100", "work", "from", "home", "based", "first", "friendly",
  "or", "and", "in", "the", "of", "within", "timezone", "timezones", "time", "zone", "zones",
]); // prettier-ignore

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Lower-case words with accents, dots and punctuation removed, joined by single spaces and
 * padded with a space at both ends: "Remote - U.S." -> " remote us ".
 * The padding lets hasPhrase match whole words with a plain includes().
 */
function toPaddedWords(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop accent marks: "México" -> "Mexico"
    .toLowerCase()
    .replace(/\./g, "") // "u.s.a." -> "usa"
    .replace(/[^a-z0-9]+/g, " ") // every other punctuation run -> one space
    .trim();
  return ` ${words} `;
}

/**
 * Whole-word phrase match. " australia " does not contain " us ", so short codes cannot match
 * inside longer words ("Australia", "Russia", "Belarus").
 */
function hasPhrase(padded: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => padded.includes(` ${phrase} `));
}

/** An upper-case two-letter US state code in the ORIGINAL text, e.g. "CA" in "Remote, CA or NY". */
function hasStateCode(original: string): boolean {
  const codes = original.match(/\b[A-Z]{2}\b/g) ?? [];
  return codes.some((code) => US_STATE_CODES.has(code));
}

// ---------------------------------------------------------------------------
// Region detection
// ---------------------------------------------------------------------------

/**
 * The region named by one piece of text, strongest signal first.
 *
 * Order matters: any US mention wins, even in a mixed list ("Europe, USA, Canada" -> us),
 * because a US-based worker can take that job. North America beats Americas because it is the
 * narrower (more informative) of the two.
 *
 * allowNonUs: location text may conclude "non_us" when it names places but none of ours. Tags
 * may not: tags such as "react" or "golang" are leftover words too, but they are not places.
 */
function detectRegion(text: string, allowNonUs: boolean): RemoteRegion {
  const padded = toPaddedWords(text);

  if (
    hasPhrase(padded, US_COUNTRY_PHRASES) ||
    hasPhrase(padded, US_STATE_NAMES) ||
    hasStateCode(text)
  ) {
    return "us";
  }
  if (hasPhrase(padded, NORTH_AMERICA_PHRASES)) return "north_america";
  if (hasPhrase(padded, AMERICAS_PHRASES)) return "americas";
  if (hasPhrase(padded, WORLDWIDE_PHRASES)) return "worldwide";

  if (allowNonUs) {
    // Something place-like is left ("germany", "uk", "emea", "latam"), and none of it was a
    // place we accept.
    const placeWords = padded
      .trim()
      .split(" ")
      .filter((word) => word !== "" && !FILLER_WORDS.has(word));
    if (placeWords.length > 0) return "non_us";
  }

  return "unknown";
}

/** Regions a US-based worker can apply to. non_us is the only one that is not. */
function acceptsUsWorkers(region: RemoteRegion): boolean {
  return region !== "non_us";
}

/**
 * Classifies a job's location for the "remote and open to US-based workers" filter.
 *
 * Goal: keep a job only when someone living in the US could take it without relocating.
 *
 * Signals, roughly in order of strength:
 * 1. Explicit regions in locationRaw: US names and abbreviations ("United States", "USA", "US",
 *    "U.S."), US state names/codes ("CA", "Texas"), "North America", "Americas", "Worldwide",
 *    "Anywhere", and non-US regions ("Canada", "UK", "Europe", "EMEA", "LATAM", "APAC", ...).
 * 2. A remote signal: "Remote" in locationRaw, or sourceRemoteFlag, or a tag.
 * 3. tags, as a weaker fallback for the region (e.g. a "worldwide" tag when locationRaw is empty).
 *
 * Edge cases handled:
 * - Short codes are easy to match by accident: "US" must not match inside "Australia", "Russia"
 *   or "Belarus", and "CA" (California) must not match inside "Canada" or "Jamaica". Matching
 *   is on whole words, and state codes only in upper case.
 * - Mixed lists: any explicit US mention makes the job eligible, even next to non-US places
 *   ("Europe, USA, Canada, APAC" -> us).
 * - A US city or state with no remote signal ("San Francisco, CA") is an on-site job: not
 *   eligible. The same text with sourceRemoteFlag true is remote and US-based -> us, eligible.
 * - Empty location + sourceRemoteFlag true -> isRemote true, region unknown, eligible true.
 *   This is a judgment call. Aggregators often leave the field blank for jobs open anywhere;
 *   dropping them would lose many real US-eligible jobs, while keeping them lets in some that
 *   turn out to be non-US. "unknown" lets the UI say so honestly instead of claiming "US".
 *   The same applies to location text with a remote signal but no place ("Remote").
 * - Empty location and no remote flag -> not remote, unknown, not eligible.
 * - Odd spacing straight from feeds ("Kansas ", "Texas, ") is handled by the word cleanup.
 *
 * Known limitations: a US city without its state ("Boston") has no US signal and is classed
 * non_us; "Georgia" is read as the US state; an upper-case "IN" meaning India reads as Indiana.
 */
export function classifyRemoteUS(input: RemoteUSInput): RemoteUSResult {
  const location = input.locationRaw?.trim() ?? "";
  const tagText = (input.tags ?? []).join(" , ");

  // 1. Region: from the location text first; tags only fill in when the location says nothing.
  let remoteRegion = location === "" ? "unknown" : detectRegion(location, true);
  if (remoteRegion === "unknown" && tagText !== "") {
    remoteRegion = detectRegion(tagText, false);
  }

  // 2. Remote: any of the three sources says so. "Worldwide"/"Anywhere" in the text also imply
  //    remote, since an on-site job cannot be anywhere.
  const locationPadded = toPaddedWords(location);
  const isRemote =
    input.sourceRemoteFlag === true ||
    hasPhrase(locationPadded, REMOTE_WORDS) ||
    hasPhrase(locationPadded, WORLDWIDE_PHRASES) ||
    hasPhrase(toPaddedWords(tagText), REMOTE_WORDS);

  // 3. Eligible: both conditions. An on-site US job and a remote EU-only job are both excluded.
  return {
    isRemote,
    remoteRegion,
    eligible: isRemote && acceptsUsWorkers(remoteRegion),
  };
}
