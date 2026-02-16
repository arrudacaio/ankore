import { modeRegistry } from "./modes/index.js";

export function listModes() {
  return modeRegistry.listNames();
}

export function listModeDetails() {
  return modeRegistry.listDetails();
}

export async function startMode(
  modeName: string,
  options: Record<string, unknown> = {},
) {
  const modeKey = String(modeName || "").toLowerCase();
  const mode = modeRegistry.get(modeKey);

  if (!mode) {
    const availableModes = listModes().join(", ");
    throw new Error(
      `Modo invalido: ${modeName}. Modos disponiveis: ${availableModes}`,
    );
  }

  const normalizedOptions = mode.normalizeOptions
    ? mode.normalizeOptions(options)
    : options;

  await mode.run(normalizedOptions);
}
