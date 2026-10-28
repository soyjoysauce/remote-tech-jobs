import { describe, expect, it } from "vitest";

import { computeDedupeKey } from "./dedupe";

const key = computeDedupeKey;

describe("computeDedupeKey", () => {
  it("matches the same job spelled differently by two sources", () => {
    expect(key("Acme, Inc.", "Senior Software Engineer (Remote)")).toBe(
      key("ACME", "Sr. Software Engineer - Remote"),
    );
  });

  it("is deterministic", () => {
    expect(key("Acme", "Software Engineer")).toBe(
      key("Acme", "Software Engineer"),
    );
  });

  describe("company names", () => {
    it.each([
      "Acme Inc",
      "Acme, Inc.",
      "Acme LLC",
      "Acme, L.L.C.",
      "Acme Ltd.",
      "Acme Corp",
      "Acme Corp.",
      "Acme Co.",
      "Acme co",
    ])("strips the legal suffix in %s", (company) => {
      expect(key(company, "Software Engineer")).toBe(
        key("Acme", "Software Engineer"),
      );
    });

    it("ignores case and surrounding or repeated whitespace", () => {
      expect(key("  ACME   Labs ", "Software Engineer")).toBe(
        key("acme labs", "Software Engineer"),
      );
    });

    it("only strips whole-word suffixes", () => {
      // "co" inside a word is part of the name.
      expect(key("Costco", "Software Engineer")).not.toBe(
        key("Cost", "Software Engineer"),
      );
      expect(key("Cohere", "Software Engineer")).not.toBe(
        key("Coh", "Software Engineer"),
      );
    });

    it("only strips suffixes at the end", () => {
      expect(key("Co Labs", "Software Engineer")).not.toBe(
        key("Labs", "Software Engineer"),
      );
    });

    it("keeps different companies apart", () => {
      expect(key("Acme", "Software Engineer")).not.toBe(
        key("Globex", "Software Engineer"),
      );
    });
  });

  describe("titles", () => {
    it.each([
      "Sr Software Engineer",
      "Sr. Software Engineer",
      "SR. software engineer",
      "Senior Software Engineer",
    ])("normalizes seniority in %s", (title) => {
      expect(key("Acme", title)).toBe(key("Acme", "Senior Software Engineer"));
    });

    it("normalizes jr / jr. to junior", () => {
      expect(key("Acme", "Jr. Developer")).toBe(
        key("Acme", "Junior Developer"),
      );
      expect(key("Acme", "Jr Developer")).toBe(key("Acme", "Junior Developer"));
    });

    it.each([
      "Software Engineer (Remote)",
      "Software Engineer (US)",
      "Software Engineer (Remote, US)",
      "Software Engineer - Remote",
      "Software Engineer - United States",
      "Software Engineer - Remote - US",
    ])("strips the location or remote qualifier in %s", (title) => {
      expect(key("Acme", title)).toBe(key("Acme", "Software Engineer"));
    });

    it("treats hyphens inside words as spelling, not as a qualifier separator", () => {
      expect(key("Acme", "Full-Stack Engineer")).toBe(
        key("Acme", "Full Stack Engineer"),
      );
      // Only " - " (spaces on both sides) starts a qualifier: "Back-end" must not become "Back".
      expect(key("Acme", "Back-end Engineer")).not.toBe(
        key("Acme", "Back Engineer"),
      );
      expect(key("Acme", "Back-end Engineer - Remote")).toBe(
        key("Acme", "Back-end Engineer"),
      );
    });

    it("keeps different roles apart", () => {
      expect(key("Acme", "Frontend Engineer")).not.toBe(
        key("Acme", "Backend Engineer"),
      );
    });

    it("keeps different levels apart", () => {
      expect(key("Acme", "Software Engineer II")).not.toBe(
        key("Acme", "Software Engineer III"),
      );
      expect(key("Acme", "Senior Software Engineer")).not.toBe(
        key("Acme", "Software Engineer"),
      );
    });
  });

  it("does not let the company and title run together", () => {
    // Without a separator, "ab" + "c" and "a" + "bc" would both become "abc".
    expect(key("Acme Data", "Engineer")).not.toBe(key("Acme", "Data Engineer"));
  });
});
