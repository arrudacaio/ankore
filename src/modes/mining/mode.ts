import { runMiningMode } from "./index.js";
import type { AnkoreModeDefinition } from "../registry.js";

function normalizeMiningOptions(
  options: Record<string, unknown>,
): Record<string, unknown> {
  return {
    watchMode: options.watchMode === true,
  };
}

function toMiningModeOptions(
  options: Record<string, unknown>,
): MiningModeOptions {
  return {
    watchMode: options.watchMode === true,
  };
}

export const miningMode: AnkoreModeDefinition = {
  name: "mining",
  description: "Sentence mining para criar cards Anki",
  normalizeOptions: normalizeMiningOptions,
  run: async (options) => {
    await runMiningMode(toMiningModeOptions(options));
  },
};
