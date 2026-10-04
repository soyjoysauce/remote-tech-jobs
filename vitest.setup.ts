// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library only auto-unmounts when test globals are enabled.
// We import test APIs explicitly instead, so unmount between tests here.
afterEach(() => {
  cleanup();
});
