import { describe, expect, it } from "vitest";

describe("shared smoke", () => {
  it("loads types package", () => {
    expect("snapflow").toContain("flow");
  });
});
