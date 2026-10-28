import { describe, expect, it } from "vitest";

import { htmlToText, sanitizeDescription } from "./html";

describe("sanitizeDescription", () => {
  it("removes scripts, event handlers and disallowed tags", () => {
    const html = `<p onclick="steal()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.test"></iframe>`;
    expect(sanitizeDescription(html)).toBe("<p>Hi</p>");
  });

  it("drops javascript: and data: hrefs but keeps the link text", () => {
    expect(sanitizeDescription(`<a href="javascript:alert(1)">x</a>`)).toBe(
      '<a rel="noopener noreferrer nofollow" target="_blank">x</a>',
    );
    expect(
      sanitizeDescription(`<a href="data:text/html;base64,AAAA">y</a>`),
    ).not.toContain("data:");
  });

  it("forces rel and target on links, overriding the feed's", () => {
    expect(
      sanitizeDescription(
        `<a href="https://acme.test" rel="opener" target="_self">Acme</a>`,
      ),
    ).toBe(
      '<a href="https://acme.test" rel="noopener noreferrer nofollow" target="_blank">Acme</a>',
    );
  });

  it("keeps formatting tags and turns h1 into h2", () => {
    expect(
      sanitizeDescription("<h1>Role</h1><ul><li><strong>TS</strong></li></ul>"),
    ).toBe("<h2>Role</h2><ul><li><strong>TS</strong></li></ul>");
  });

  it("strips style attributes and class names", () => {
    expect(sanitizeDescription('<p class="h3" style="color:red">x</p>')).toBe(
      "<p>x</p>",
    );
  });

  it("returns null for empty input or input that sanitizes to nothing", () => {
    expect(sanitizeDescription(null)).toBeNull();
    expect(sanitizeDescription("")).toBeNull();
    expect(sanitizeDescription("<script>x</script>")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("separates block elements and list items with line breaks", () => {
    expect(
      htmlToText(
        "<h2>About</h2><p>We build things.</p><ul><li>TypeScript</li><li>Postgres</li></ul>",
      ),
    ).toBe("About\nWe build things.\n\n- TypeScript\n- Postgres");
  });

  it("decodes entities without double-decoding", () => {
    expect(htmlToText("<p>R&amp;D &lt;3 &amp;lt;tag&amp;gt;</p>")).toBe(
      "R&D <3 &lt;tag&gt;",
    );
  });

  it("collapses whitespace", () => {
    expect(htmlToText("<p>  a \n\t b  </p><br><br><br><p>c</p>")).toBe(
      "a b\n\nc",
    );
  });

  it("returns null for empty input", () => {
    expect(htmlToText(null)).toBeNull();
    expect(htmlToText("<p> </p>")).toBeNull();
  });
});
