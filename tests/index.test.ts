import { describe, expect, it } from "vitest";
import { listModeDetails, listModes } from "../src/index.ts";

describe("mode registry", () => {
  it("exposes mining mode", () => {
    expect(listModes()).toContain("mining");
  });

  it("returns mode details with description", () => {
    expect(listModeDetails()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "mining",
          description: expect.any(String),
        }),
      ]),
    );
  });
});
