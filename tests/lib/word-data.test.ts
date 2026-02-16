import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWordData } from "../../src/lib/word-data.ts";

function jsonResponse(payload: unknown, ok = true): Response {
  const status = ok ? 200 : 404;
  return new Response(JSON.stringify(payload), { status });
}

describe("fetchWordData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps sentence search working for expressions with spaces", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("dictionaryapi.dev")) {
          return jsonResponse(
            {
              title: "No Definitions Found",
            },
            false,
          );
        }

        if (url.includes("api.quotable.io")) {
          return jsonResponse({
            results: [
              { content: "The pain goes away after a while." },
              { content: "This one should not be used." },
            ],
          });
        }

        if (url.includes("tatoeba.org")) {
          return jsonResponse({ results: [] });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await fetchWordData("goes away");

    expect(result.definition).toBe(
      'Definition not found for expression "goes away".',
    );
    expect(result.phonetic).toBe("N/A");
    expect(result.sentenceCandidates).toEqual([
      "The pain goes away after a while.",
    ]);
    expect(result.sentence).toBe("The pain goes away after a while.");
  });

  it("still fails for single words when dictionary lookup fails", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("dictionaryapi.dev")) {
          return jsonResponse(
            {
              title: "No Definitions Found",
            },
            false,
          );
        }

        if (url.includes("api.quotable.io") || url.includes("tatoeba.org")) {
          return jsonResponse({ results: [] });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWordData("hello")).rejects.toThrow(
      'Could not fetch dictionary data for "hello".',
    );
  });
});
