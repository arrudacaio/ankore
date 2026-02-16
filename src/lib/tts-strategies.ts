import { generateSpeech } from "./piper.js";

export type TtsStrategyId = "piper";

export interface TtsStrategy {
  id: TtsStrategyId;
  generateWav: (text: string, outputWav: string) => Promise<void>;
}

function buildAvailableStrategies(): TtsStrategy[] {
  return [
    {
      id: "piper",
      generateWav: generateSpeech,
    },
  ];
}

function getRequestedStrategyId(): TtsStrategyId {
  const configured = process.env.ANKORE_TTS_STRATEGY?.trim().toLowerCase();
  if (!configured) {
    return "piper";
  }

  if (configured === "piper") {
    return "piper";
  }

  throw new Error(
    `Unsupported TTS strategy "${configured}". Supported strategies: piper.`,
  );
}

export function resolveTtsStrategy(): TtsStrategy {
  const strategies = buildAvailableStrategies();
  const strategyId = getRequestedStrategyId();
  const strategy = strategies.find((item) => item.id === strategyId);
  if (!strategy) {
    throw new Error(
      `TTS strategy "${strategyId}" is not available in this build.`,
    );
  }

  return strategy;
}
