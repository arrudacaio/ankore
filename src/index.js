import { runMiningMode } from "./modes/mining/index.js";

const MODE_REGISTRY = {
  mining: {
    run: runMiningMode,
    description: "Sentence mining para criar cards Anki"
  }
};

export function listModes() {
  return Object.keys(MODE_REGISTRY);
}

export function listModeDetails() {
  return Object.entries(MODE_REGISTRY).map(([name, config]) => ({
    name,
    description: config.description
  }));
}

export async function startMode(modeName, options = {}) {
  const modeKey = String(modeName || "").toLowerCase();
  const mode = MODE_REGISTRY[modeKey];

  if (!mode) {
    const availableModes = listModes().join(", ");
    throw new Error(`Modo invalido: ${modeName}. Modos disponiveis: ${availableModes}`);
  }

  await mode.run(options);
}
