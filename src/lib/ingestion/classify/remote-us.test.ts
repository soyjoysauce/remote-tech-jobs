import { describe, expect, it } from "vitest";

import { classifyRemoteUS, type RemoteRegion } from "./remote-us";

interface Case {
  locationRaw: string | null;
  sourceRemoteFlag?: boolean;
  tags?: string[];
  eligible: boolean;
  remoteRegion?: RemoteRegion;
  isRemote?: boolean;
}

function check({ locationRaw, sourceRemoteFlag, tags, ...expected }: Case) {
  const result = classifyRemoteUS({ locationRaw, sourceRemoteFlag, tags });
  expect(result).toMatchObject(expected);
}

describe("classifyRemoteUS: cases from the brief", () => {
  it.each<Case>([
    {
      locationRaw: "Remote - US",
      eligible: true,
      remoteRegion: "us",
      isRemote: true,
    },
    {
      locationRaw: "United States (Remote)",
      eligible: true,
      remoteRegion: "us",
      isRemote: true,
    },
    {
      locationRaw: "Remote, CA or NY",
      eligible: true,
      remoteRegion: "us",
      isRemote: true,
    },
    {
      locationRaw: "Worldwide",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "worldwide",
    },
    {
      locationRaw: "Anywhere",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "worldwide",
    },
    {
      locationRaw: "North America",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "north_america",
    },
    {
      locationRaw: "Remote - Canada",
      eligible: false,
      remoteRegion: "non_us",
      isRemote: true,
    },
    {
      locationRaw: "EMEA",
      sourceRemoteFlag: true,
      eligible: false,
      remoteRegion: "non_us",
    },
    {
      locationRaw: "Europe only",
      sourceRemoteFlag: true,
      eligible: false,
      remoteRegion: "non_us",
    },
    {
      locationRaw: "LATAM",
      sourceRemoteFlag: true,
      eligible: false,
      remoteRegion: "non_us",
    },
  ])("$locationRaw -> eligible: $eligible", check);

  it("treats a US city with no remote signal as on-site", () => {
    check({
      locationRaw: "San Francisco, CA",
      eligible: false,
      isRemote: false,
    });
  });

  it("keeps an empty location when the source says remote, with an unknown region", () => {
    // Judgment call, explained in the docstring.
    check({
      locationRaw: "",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "unknown",
      isRemote: true,
    });
    check({
      locationRaw: null,
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "unknown",
      isRemote: true,
    });
  });
});

describe("classifyRemoteUS: US spellings", () => {
  it.each([
    "USA",
    "US only",
    "U.S.",
    "US",
    "United States of America",
    "Remote (USA)",
  ])("%s -> us", (locationRaw) => {
    check({
      locationRaw,
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "us",
    });
  });

  it.each([
    "Austin, TX",
    "Kansas ",
    "Texas, ",
    "New York, New York, New York, United States",
  ])("%s with a remote flag -> us", (locationRaw) => {
    check({
      locationRaw,
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "us",
    });
  });
});

describe("classifyRemoteUS: mixed lists (real Remotive values)", () => {
  it.each<Case>([
    {
      locationRaw: "USA, Canada",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "us",
    },
    {
      locationRaw: "Europe, USA",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "us",
    },
    {
      locationRaw: "USA, Canada, USA timezones",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "us",
    },
    {
      locationRaw: "Europe, USA, Canada, APAC",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "us",
    },
    {
      locationRaw: "Northern America, LATAM, Europe, APAC",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "north_america",
    },
    {
      locationRaw: "Americas",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "americas",
    },
    {
      locationRaw: "Americas, Europe, Israel",
      sourceRemoteFlag: true,
      eligible: true,
      remoteRegion: "americas",
    },
  ])("$locationRaw -> $remoteRegion", check);
});

describe("classifyRemoteUS: non-US", () => {
  it.each([
    "Remote (UK)",
    "United Kingdom",
    "Germany",
    "Ireland",
    "India",
    "Vancouver, BC, Canada",
    "APAC",
  ])("%s -> not eligible", (locationRaw) => {
    check({
      locationRaw,
      sourceRemoteFlag: true,
      eligible: false,
      remoteRegion: "non_us",
    });
  });

  it.each(["Australia", "Russia", "Belarus"])(
    "%s does not match the 'us' inside it",
    (locationRaw) => {
      check({
        locationRaw,
        sourceRemoteFlag: true,
        eligible: false,
        remoteRegion: "non_us",
      });
    },
  );

  it("Canada does not match 'CA' (California)", () => {
    check({
      locationRaw: "Canada",
      sourceRemoteFlag: true,
      eligible: false,
      remoteRegion: "non_us",
    });
  });
});

describe("classifyRemoteUS: no signals", () => {
  it("empty location and no remote flag is not remote", () => {
    check({
      locationRaw: "",
      eligible: false,
      isRemote: false,
      remoteRegion: "unknown",
    });
    check({
      locationRaw: null,
      sourceRemoteFlag: false,
      eligible: false,
      isRemote: false,
    });
  });

  it("uses a tag when the location is empty", () => {
    check({
      locationRaw: null,
      sourceRemoteFlag: true,
      tags: ["worldwide"],
      eligible: true,
      remoteRegion: "worldwide",
    });
  });
});
