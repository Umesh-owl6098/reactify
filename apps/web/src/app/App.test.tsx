import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the Reactify landing screen", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Reactify" })).toBeInTheDocument();
    expect(screen.getByText(/Turn UI screenshots into production-ready React/i)).toBeInTheDocument();
  });
});
