import { generateSpeech } from "./piper.js";

export interface TtsGenerationRequest {
  text: string;
  outputWav: string;
  model?: string;
}

export interface TtsRuntimeConfig {
  strategy: string;
  model?: string;
}

export interface TtsStrategy {
  id: string;
  description: string;
  generateWav: (request: TtsGenerationRequest) => Promise<void>;
}

const STRATEGIES: TtsStrategy[] = [
  {
    id: "piper",
    description: "Piper local inference",
    generateWav: ({ text, outputWav, model }) =>
      generateSpeech(text, outputWav, { model }),
  },
];

function getRequestedStrategyId(): string {
  return process.env.ANKORE_TTS_STRATEGY?.trim().toLowerCase() || "piper";
}

function getRequestedModelId(): string | undefined {
  const configured = process.env.ANKORE_TTS_MODEL?.trim();
  if (!configured) {
    return undefined;
  }

  return configured.toLowerCase();
}

export function listTtsStrategies(): Array<{
  id: string;
  description: string;
}> {
  return STRATEGIES.map((strategy) => ({
    id: strategy.id,
    description: strategy.description,
  }));
}

export function resolveTtsRuntimeConfig(): TtsRuntimeConfig {
  return {
    strategy: getRequestedStrategyId(),
    model: getRequestedModelId(),
  };
}

export function resolveTtsStrategy(
  config = resolveTtsRuntimeConfig(),
): TtsStrategy {
  const strategyId = config.strategy;
  const strategy = STRATEGIES.find((item) => item.id === strategyId);
  if (!strategy) {
    const supported = listTtsStrategies()
      .map((item) => item.id)
      .join(", ");
    throw new Error(
      `Unsupported TTS strategy "${strategyId}". Supported strategies: ${supported}.`,
    );
  }

  return strategy;
}
