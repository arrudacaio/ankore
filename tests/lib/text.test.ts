import { describe, expect, it } from "vitest";
import {
  containsWord,
  escapeHtml,
  escapeRegExp,
  highlightWordForAnki,
  normalizeSentence,
  uniqueSentences,
} from "../../src/lib/text.ts";

describe("text utilities", () => {
  it("escapes regex tokens", () => {
    expect(escapeRegExp("a+b?(test)")).toBe("a\\+b\\?\\(test\\)");
  });

  it("matches whole words case-insensitively", () => {
    expect(containsWord("This is a Test sentence.", "test")).toBe(true);
    expect(containsWord("testing mode", "test")).toBe(false);
  });

  it("normalizes repeated whitespace", () => {
    expect(normalizeSentence("  hello   world\n")).toBe("hello world");
  });

  it("deduplicates normalized sentences", () => {
    expect(uniqueSentences([" Hello ", "hello", "World", "world "])).toEqual([
      "Hello",
      "World",
    ]);
  });

  it("highlights target word for Anki output", () => {
    expect(highlightWordForAnki("The test is ready", "test")).toBe(
      "The <b>test</b> is ready",
    );
  });

  it("escapes HTML entities", () => {
    expect(escapeHtml("<a>&\"'")).toBe("&lt;a&gt;&amp;&quot;&#39;");
  });
});
