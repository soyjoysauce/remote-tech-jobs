import { describe, expect, it } from "vitest";

import { isTechRole } from "./tech";

describe("isTechRole", () => {
  it.each([
    // Engineering roles from the brief.
    "Software Engineer",
    "Senior Frontend Engineer",
    "Back-end Developer",
    "Senior React Full-stack Developer",
    "Full Stack Web Developer",
    "iOS Developer",
    "Android Engineer",
    "Mobile Engineer (React Native)",
    "DevOps Engineer",
    "Site Reliability Engineer",
    "SRE II",
    "QA Engineer",
    "QA Tester Entry Level",
    "SDET",
    "Test Automation Engineer",
    "Data Engineer",
    "Senior Security Engineer",
    "Application Security Engineer",
    // Real titles from the Remotive and Remote OK fixtures and feeds.
    "Tech Lead Full-Stack Rails Engineer",
    "Principal Engineer",
    "Member of Technical Staff Engineering",
    "Golang Kubernetes Engineer",
    "Senior Independent AI Engineer / Architect",
    "Staff Software Development Engineer SDM",
    "Engineering Manager, Platform",
    "Product Engineering Lead",
    "Software Architect",
  ])("includes %s", (title) => {
    expect(isTechRole(title)).toBe(true);
  });

  it.each([
    // Sales, marketing, recruiting and support at tech companies.
    "Sales Engineer",
    "Solutions Engineer",
    "Pre-Sales Engineer",
    "Technical Account Manager",
    "Inside Sales Contractor",
    "Growth Marketing Manager",
    "Developer Advocate",
    "Technical Recruiter",
    "Engineering Recruiter",
    "Customer Support Engineer",
    "Support Engineer",
    "Tier III Service Desk Engineer",
    "Customer Success Engineer",
    // Not engineering roles at all.
    "Freelance Copywriter",
    "Product Manager",
    "Senior Data Scientist",
    "Product Design Lead",
    "Remote Office Assistant",
    // Other engineering disciplines and look-alikes.
    "Mechanical Engineer",
    "Electrical Engineer",
    "Engineer Estimator",
    "AI Trainer Image QA Evaluator",
  ])("excludes %s", (title) => {
    expect(isTechRole(title)).toBe(false);
  });

  it("does not match inside other words", () => {
    // "engineered" and "qatar" contain include words but are not role titles.
    expect(isTechRole("Over-engineered Solutions Buyer")).toBe(false);
    expect(isTechRole("Operations Manager Qatar")).toBe(false);
  });
});
