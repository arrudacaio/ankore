import { describe, expect, it } from "vitest";
import {
  buildAnkiImportFile,
  getDefaultAnkiFileName,
} from "../../src/lib/anki-export.ts";

describe("anki export", () => {
  it("builds UTF-8 BOM prefixed TSV content", () => {
    const content = buildAnkiImportFile([
      { front: "Front 1", back: "Back 1" },
      { front: "Front 2", back: "Back 2" },
    ]);

    expect(content.startsWith("\uFEFF")).toBe(true);
    expect(content).toContain("Front 1\tBack 1\nFront 2\tBack 2\n");
  });

  it("sanitizes line breaks and tabs inside fields", () => {
    const content = buildAnkiImportFile([
      { front: "Line 1\nLine 2", back: "Back\tValue" },
    ]);

    expect(content).toContain("Line 1<br>Line 2\tBack Value\n");
  });

  it("creates default file names in expected format", () => {
    expect(getDefaultAnkiFileName()).toMatch(
      /^ankore-cards-\d{4}-\d{2}-\d{2}\.tsv$/,
    );
  });
});
