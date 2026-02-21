import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, ok = true): Response {
  const status = ok ? 200 : 404;
  return new Response(JSON.stringify(payload), { status });
}

describe("fetchWordData", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps sentence search working for expressions with spaces", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("definition-api.reverso.net")) {
          return jsonResponse({
            DefsByWord: [
              {
                pronounceIpa: "goʊz əˈweɪ",
                DefsByPos: [
                  {
                    Defs: [
                      {
                        Def: "to stop being present",
                        examples: [
                          { example: "The pain goes away after a while." },
                          { example: "Small." },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { fetchWordData } = await import("../../src/lib/word-data.ts");

    const result = await fetchWordData("goes away");

    expect(result.definition).toBe("to stop being present");
    expect(result.phonetic).toBe("goʊz əˈweɪ");
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

        if (url.includes("definition-api.reverso.net")) {
          return jsonResponse(
            {
              title: "No Definitions Found",
            },
            false,
          );
        }

        throw new Error(`Unexpected URL: ${url}`);
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

        if (url.includes("definition-api.reverso.net")) {
          return jsonResponse({
            DefsByWord: [
              {
                pronounceIpa: "həˈloʊ",
                DefsByPos: [
                  {
                    Defs: [
                      {
                        Def: "A greeting.",
                        examples: [
                          {
                            example:
                              "People often say hello when meeting someone.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
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
  });

  it("matches inflected and separable phrasal-verb candidates", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockImplementation(async (input) => {
        const url = String(input);

        if (
          url.includes(
            "definition-api.reverso.net/v1/api/definitionSearch/en/go%20away",
          )
        ) {
          return jsonResponse({
            DefsByWord: [
              {
                DefsByPos: [
                  {
                    Defs: [
                      {
                        Def: "to leave",
                        examples: [
                          { example: "The pain goes away after a while." },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          });
        }

        if (
          url.includes(
            "definition-api.reverso.net/v1/api/definitionSearch/en/turn%20off",
          )
        ) {
          return jsonResponse({
            DefsByWord: [
              {
                DefsByPos: [
                  {
                    Defs: [
                      {
                        Def: "to deactivate",
                        examples: [
                          {
                            example:
                              "Please turn the lights off before leaving.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { fetchWordData } = await import("../../src/lib/word-data.ts");

    const goAwayResult = await fetchWordData("go away");
    expect(goAwayResult.sentenceCandidates).toContain(
      "The pain goes away after a while.",
    );
    expect(goAwayResult.definition).toBe("to leave");

    const turnOffResult = await fetchWordData("turn off");
    expect(turnOffResult.sentenceCandidates).toContain(
      "Please turn the lights off before leaving.",
    );
  });

  it("supports precise meaning mode with alternatives", async () => {
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockImplementation(async (input) => {
        const url = String(input);

        if (url.includes("definition-api.reverso.net")) {
          return jsonResponse({
            DefsByWord: [
              {
                pronounceIpa: "ɡɪv ʌp",
                DefsByPos: [
                  {
                    Defs: [
                      {
                        Def: "To do something.",
                      },
                      {
                        Def: "To stop trying or to quit.",
                        examples: [
                          {
                            example:
                              "He did not give up after the first failure.",
                          },
                          {
                            example: "I will not give up on this project.",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { fetchWordData } = await import("../../src/lib/word-data.ts");

    const normalResult = await fetchWordData("give up", {
      meaningMode: "normal",
    });
    expect(normalResult.definition).toBe("To do something.");

    const preciseResult = await fetchWordData("give up", {
      meaningMode: "precise",
    });
    expect(preciseResult.definition).toBe("To stop trying or to quit.");
    expect(preciseResult.meaningCandidates).toEqual([
      "To stop trying or to quit.",
      "To do something.",
    ]);
    expect(preciseResult.meaningConfidence).not.toBe("low");
  });
});
