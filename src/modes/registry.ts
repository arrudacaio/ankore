type ModeRawOptions = Record<string, unknown>;

export interface AnkoreModeDefinition {
  name: string;
  description: string;
  normalizeOptions?: (options: ModeRawOptions) => ModeRawOptions;
  run: (options: ModeRawOptions) => Promise<void>;
}

export interface AnkoreModeSummary {
  name: string;
  description: string;
}

export class AnkoreModeRegistry {
  private readonly modes = new Map<string, AnkoreModeDefinition>();

  register(mode: AnkoreModeDefinition): void {
    const modeName = mode.name.trim().toLowerCase();
    if (!modeName) {
      throw new Error("Mode name cannot be empty.");
    }

    if (this.modes.has(modeName)) {
      throw new Error(`Mode "${modeName}" is already registered.`);
    }

    this.modes.set(modeName, {
      ...mode,
      name: modeName,
    });
  }

  registerMany(modes: AnkoreModeDefinition[]): void {
    for (const mode of modes) {
      this.register(mode);
    }
  }

  listNames(): string[] {
    return [...this.modes.keys()];
  }

  listDetails(): AnkoreModeSummary[] {
    return [...this.modes.values()].map((mode) => ({
      name: mode.name,
      description: mode.description,
    }));
  }

  get(name: string): AnkoreModeDefinition | undefined {
    return this.modes.get(name.trim().toLowerCase());
  }
}
