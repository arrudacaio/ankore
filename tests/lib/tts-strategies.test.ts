import { afterEach, describe, expect, it } from "vitest";
import {
  listTtsStrategies,
  resolveTtsRuntimeConfig,
  resolveTtsStrategy,
} from "../../src/lib/tts-strategies.ts";

const originalEnv = {
  ANKORE_TTS_STRATEGY: process.env.ANKORE_TTS_STRATEGY,
  ANKORE_TTS_MODEL: process.env.ANKORE_TTS_MODEL,
};

function restoreEnv(name: keyof typeof originalEnv): void {
  const value = originalEnv[name];
  if (typeof value === "undefined") {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(() => {
  restoreEnv("ANKORE_TTS_STRATEGY");
  restoreEnv("ANKORE_TTS_MODEL");
});

describe("tts strategies", () => {
  it("exposes piper strategy metadata", () => {
    expect(listTtsStrategies()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "piper",
          description: expect.any(String),
        }),
      ]),
    );
  });

  it("uses ANKORE_TTS_MODEL when provided", () => {
    process.env.ANKORE_TTS_MODEL = "en_us-ryan-high";

    expect(resolveTtsRuntimeConfig()).toEqual({
      strategy: "piper",
      model: "en_us-ryan-high",
    });
  });

  it("throws for unsupported strategy", () => {
    process.env.ANKORE_TTS_STRATEGY = "unknown";

    expect(() => resolveTtsStrategy()).toThrow(/Unsupported TTS strategy/);
  });
});
