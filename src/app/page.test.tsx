import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("home page renders the site heading", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Remote Tech Jobs" }),
  ).toBeInTheDocument();
});
