// Sanitizes job description HTML at ingest time.
//
// Descriptions are HTML written by third parties. Layer 6 renders description_html with
// dangerouslySetInnerHTML, so an unsanitized <script>, onerror= attribute or javascript: link
// would run in our visitors' browsers (stored XSS). Cleaning once, before the database, means
// every reader of the column (pages, emails, the apply kit) gets safe HTML, and a page that
// forgets to sanitize cannot render a payload.
//
// sanitize-html works on an allowlist: anything not listed is removed. A blocklist would have to
// anticipate every dangerous tag and attribute, and miss the next one.
import sanitizeHtml from "sanitize-html";

const DESCRIPTION_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "a",
    "h2",
    "h3",
    "h4",
    "code",
    "pre",
    "blockquote",
  ],
  allowedAttributes: { a: ["href", "rel", "target"] },
  // Removes javascript:, data: and vbscript: hrefs. The <a> stays, without its href.
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    // The job page has its own <h1> (the job title), so a description's h1 becomes an h2.
    h1: "h2",
    // Overwrites any rel/target the feed sent. nofollow here is for links inside the
    // description, which point at arbitrary third-party sites. It is not the attribution link
    // to the source, which must be followed (see CLAUDE.md, attribution rule).
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
};

/** Returns allowlisted HTML, or null when nothing is left. */
export function sanitizeDescription(
  html: string | null | undefined,
): string | null {
  if (!html) return null;
  const clean = sanitizeHtml(html, DESCRIPTION_OPTIONS).trim();
  return clean === "" ? null : clean;
}

/**
 * Plain text for description_text (search in Layer 5, embeddings in Layer 11).
 * Block elements become line breaks so words from adjacent paragraphs do not run together.
 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;

  // Newlines in HTML source are ordinary whitespace, so they are collapsed first; line breaks
  // come only from elements. (This flattens <pre> blocks, which is fine for a search column.)
  // Each list item starts a line; </li> adds none, or items would be separated by blank lines.
  const withBreaks = html
    .replace(/\s+/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|h[1-6]|pre|blockquote|div|ul|ol|tr)>/gi, "\n");

  // With no tags allowed, sanitize-html returns the text. It escapes &, < and > in that text
  // (it is meant to produce HTML), so those three are decoded back. &amp; goes last so that
  // "&amp;lt;" becomes "&lt;", not "<".
  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  const normalized = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized === "" ? null : normalized;
}
