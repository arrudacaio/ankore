import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExportPath,
  getExportsDir,
} from "../../src/lib/session-storage.ts";

describe("session storage paths", () => {
  it("returns the exports directory path", () => {
    expect(getExportsDir()).toBe(path.join("session-output", "exports"));
  });

  it("builds a path inside exports directory", () => {
    expect(buildExportPath("sample.tsv")).toBe(
      path.join("session-output", "exports", "sample.tsv"),
    );
  });
});
