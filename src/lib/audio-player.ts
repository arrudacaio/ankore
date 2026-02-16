import { spawn } from "node:child_process";

interface AudioPlayerStrategy {
  id: string;
  command: string;
  args: (filePath: string) => string[];
}

function parseArgs(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildStrategies(): AudioPlayerStrategy[] {
  const configuredPlayer = process.env.ANKORE_AUDIO_PLAYER?.trim();
  const configuredPlayerArgs = parseArgs(process.env.ANKORE_AUDIO_PLAYER_ARGS);

  const strategies: AudioPlayerStrategy[] = [];
  if (configuredPlayer) {
    strategies.push({
      id: "configured",
      command: configuredPlayer,
      args: (filePath) => [...configuredPlayerArgs, filePath],
    });
  }

  if (process.platform === "darwin") {
    strategies.push({
      id: "afplay",
      command: "afplay",
      args: (filePath) => [filePath],
    });
    strategies.push({
      id: "open",
      command: "open",
      args: (filePath) => [filePath],
    });
  }

  if (process.platform === "linux") {
    strategies.push(
      {
        id: "ffplay",
        command: "ffplay",
        args: (filePath) => [
          "-nodisp",
          "-autoexit",
          "-loglevel",
          "error",
          filePath,
        ],
      },
      {
        id: "mpg123",
        command: "mpg123",
        args: (filePath) => ["-q", filePath],
      },
      {
        id: "mpg321",
        command: "mpg321",
        args: (filePath) => ["-q", filePath],
      },
      {
        id: "sox-play",
        command: "play",
        args: (filePath) => ["-q", filePath],
      },
      {
        id: "cvlc",
        command: "cvlc",
        args: (filePath) => ["--play-and-exit", "--intf", "dummy", filePath],
      },
      {
        id: "xdg-open",
        command: "xdg-open",
        args: (filePath) => [filePath],
      },
    );
  }

  if (process.platform === "win32") {
    strategies.push({
      id: "powershell",
      command: "powershell.exe",
      args: (filePath) => [
        "-NoProfile",
        "-Command",
        `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync();`,
      ],
    });
    strategies.push({
      id: "cmd-start",
      command: "cmd.exe",
      args: (filePath) => ["/c", "start", "", filePath],
    });
  }

  return strategies;
}

async function runPlayer(
  strategy: AudioPlayerStrategy,
  filePath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(strategy.command, strategy.args(filePath), {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(error);
    });

    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Audio player ${strategy.id} exited with code ${String(code)}. ${stderr.trim()}`.trim(),
          ),
        );
        return;
      }

      resolve();
    });
  });
}

export async function playAudioPreview(filePath: string): Promise<void> {
  const strategies = buildStrategies();
  const errors: string[] = [];

  for (const strategy of strategies) {
    try {
      await runPlayer(strategy, filePath);
      return;
    } catch (error) {
      errors.push(
        `${strategy.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    "No working audio player found for preview. Tried: " + errors.join(" | "),
  );
}
