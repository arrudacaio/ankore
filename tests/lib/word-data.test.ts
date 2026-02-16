import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reversoGetContextMock = vi.hoisted(() => vi.fn());

vi.mock("reverso-api", () => {
  return {
    default: class MockReverso {
      getContext(text: string, source: string, target: string) {
        return reversoGetContextMock(text, source, target);
      }
    },
  };
});

function jsonResponse(payload: unknown, ok = true): Response {
  const status = ok ? 200 : 404;
  return new Response(JSON.stringify(payload), { status });
}

describe("fetchWordData", () => {
  beforeEach(() => {
    reversoGetContextMock.mockReset();
  });

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

    reversoGetContextMock.mockResolvedValue({
      ok: true,
      examples: [{ source: "Context example should also go away naturally." }],
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { fetchWordData } = await import("../../src/lib/word-data.ts");

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

    reversoGetContextMock.mockResolvedValue({
      ok: true,
      examples: [],
    });

    vi.stubGlobal("fetch", fetchMock);

    const { fetchWordData } = await import("../../src/lib/word-data.ts");

    await expect(fetchWordData("hello")).rejects.toThrow(
      'Could not fetch dictionary data for "hello".',
    );
  });

  it("includes contextual examples from Reverso", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("dictionaryapi.dev")) {
          return jsonResponse([
            {
              phonetic: "/hɛˈləʊ/",
              meanings: [
                {
                  definitions: [
                    {
                      definition: "A greeting.",
                    },
                  ],
                },
              ],
            },
          ]);
        }

        if (url.includes("api.quotable.io") || url.includes("tatoeba.org")) {
          return jsonResponse({ results: [] });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

    reversoGetContextMock.mockResolvedValue({
      ok: true,
      examples: [{ source: "People often say hello when meeting someone." }],
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { fetchWordData } = await import("../../src/lib/word-data.ts");

    const result = await fetchWordData("hello");

    expect(result.sentenceCandidates).toEqual([
      "People often say hello when meeting someone.",
    ]);
    expect(result.sentence).toBe(
      "People often say hello when meeting someone.",
    );
    expect(reversoGetContextMock).toHaveBeenCalledWith(
      "hello",
      "english",
      "portuguese",
    );
  });
});
