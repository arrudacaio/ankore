import { spawn } from "node:child_process";
import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface AudioPlayerStrategy {
  id: string;
  command: string;
  args: (filePath: string) => string[] | Promise<string[]>;
}

function summarizeStderr(stderr: string): string {
  const firstLine = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "";
  }

  if (firstLine.length <= 220) {
    return firstLine;
  }

  return `${firstLine.slice(0, 217)}...`;
}

function isWslEnvironment(): boolean {
  return (
    process.platform === "linux" &&
    (Boolean(process.env.WSL_DISTRO_NAME) || Boolean(process.env.WSL_INTEROP))
  );
}

async function prepareWslSharedFile(filePath: string): Promise<string> {
  const sharedDir = path.join(os.tmpdir(), "ankore-audio-preview");
  await mkdir(sharedDir, { recursive: true });

  const sharedPath = path.join(sharedDir, path.basename(filePath));
  await copyFile(filePath, sharedPath);
  await chmod(sharedPath, 0o644).catch(() => undefined);

  return sharedPath;
}

function buildWslWindowsOpenScript(filePath: string): string {
  const escaped = filePath.replace(/'/g, "''");

  return [
    "$ErrorActionPreference = 'Stop'",
    `Start-Process -FilePath '${escaped}'`,
    "Start-Sleep -Milliseconds 250",
  ].join("; ");
}

async function toWslWindowsPath(filePath: string): Promise<string | null> {
  try {
    const result = await runCommand("wslpath", ["-w", filePath]);
    if (result.code !== 0 || !result.stdout) {
      return null;
    }

    return result.stdout;
  } catch {
    return null;
  }
}

function getProjectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function isFfplayInPathAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("ffplay", ["-version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function isFfmpegInPathAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("ffmpeg", ["-version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function getBundledFfplayPath(): Promise<string | null> {
  try {
    const module = await import("ffplay-static");
    const ffplayPath =
      typeof module.default === "string"
        ? module.default
        : (module as { default?: unknown; [key: string]: unknown })["default"];

    if (typeof ffplayPath !== "string" || ffplayPath.length === 0) {
      return null;
    }

    if (await isExecutable(ffplayPath)) {
      return ffplayPath;
    }

    return null;
  } catch {
    return null;
  }
}

async function installBundledFfplay(projectRoot: string): Promise<void> {
  const installCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await runCommand(
    installCommand,
    ["install", "--no-save", "ffplay-static"],
    projectRoot,
  );

  if (result.code !== 0) {
    throw new Error(
      `Failed to auto-install ffplay-static. ${result.stderr}`.trim(),
    );
  }
}

async function resolveFfplayExecutable(): Promise<string | null> {
  const projectRoot = getProjectRoot();
  const executableName = process.platform === "win32" ? "ffplay.exe" : "ffplay";
  const candidates = [
    path.join(projectRoot, "tools", "ffmpeg", executableName),
    path.join(projectRoot, "vendor", "ffmpeg", "bin", executableName),
    path.join(projectRoot, "bin", executableName),
    path.join(os.homedir(), ".local", "bin", executableName),
    "/usr/local/bin/ffplay",
    "/usr/bin/ffplay",
  ];

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  if (await isFfplayInPathAvailable()) {
    return "ffplay";
  }

  if (process.platform !== "darwin" && process.platform !== "win32") {
    return null;
  }

  const bundled = await getBundledFfplayPath();
  if (bundled) {
    return bundled;
  }

  await installBundledFfplay(projectRoot);
  return getBundledFfplayPath();
}

async function getBundledFfmpegPath(): Promise<string | null> {
  try {
    const module = await import("ffmpeg-static");
    const ffmpegPath =
      typeof module.default === "string"
        ? module.default
        : (module as { default?: unknown; [key: string]: unknown })["default"];

    if (typeof ffmpegPath !== "string" || ffmpegPath.length === 0) {
      return null;
    }

    if (await isExecutable(ffmpegPath)) {
      return ffmpegPath;
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveFfmpegExecutable(): Promise<string | null> {
  const configured = process.env.ANKORE_FFMPEG_BIN?.trim();
  if (configured) {
    return configured;
  }

  const projectRoot = getProjectRoot();
  const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    path.join(projectRoot, "tools", "ffmpeg", executableName),
    path.join(projectRoot, "vendor", "ffmpeg", "bin", executableName),
    path.join(projectRoot, "bin", executableName),
    path.join(os.homedir(), ".local", "bin", executableName),
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  if (await isFfmpegInPathAvailable()) {
    return "ffmpeg";
  }

  return getBundledFfmpegPath();
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

async function buildStrategies(): Promise<AudioPlayerStrategy[]> {
  const configuredPlayer = process.env.ANKORE_AUDIO_PLAYER?.trim();
  const configuredPlayerArgs = parseArgs(process.env.ANKORE_AUDIO_PLAYER_ARGS);
  const ffplayBin = await resolveFfplayExecutable().catch(() => null);
  const ffmpegBin = await resolveFfmpegExecutable().catch(() => null);

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
  }

  if (process.platform === "linux") {
    if (isWslEnvironment()) {
      strategies.push({
        id: "wsl-powershell-open",
        command: "powershell.exe",
        args: async (filePath) => {
          const sharedPath = await prepareWslSharedFile(filePath).catch(
            () => filePath,
          );
          const windowsPath = await toWslWindowsPath(sharedPath);
          if (!windowsPath) {
            return ["-NoProfile", "-NonInteractive", "-Command", "exit 1"];
          }

          return [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            buildWslWindowsOpenScript(windowsPath),
          ];
        },
      });

      strategies.push({
        id: "wsl-cmd-start",
        command: "cmd.exe",
        args: async (filePath) => {
          const sharedPath = await prepareWslSharedFile(filePath).catch(
            () => filePath,
          );
          const windowsPath = await toWslWindowsPath(sharedPath);
          if (!windowsPath) {
            return ["/c", "exit", "1"];
          }

          return ["/c", "start", "", windowsPath];
        },
      });
    }

    strategies.push({
      id: "ffplay",
      command: ffplayBin || "ffplay",
      args: (filePath) => [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        filePath,
      ],
    });

    strategies.push(
      ...(ffmpegBin
        ? [
            {
              id: "ffmpeg-alsa",
              command: ffmpegBin,
              args: (filePath: string) => [
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                filePath,
                "-f",
                "alsa",
                "default",
              ],
            },
            {
              id: "ffmpeg-oss",
              command: ffmpegBin,
              args: (filePath: string) => [
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                filePath,
                "-f",
                "oss",
                "/dev/dsp",
              ],
            },
          ]
        : []),
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
    );
  }

  if (process.platform === "win32") {
    strategies.push({
      id: "ffplay",
      command: ffplayBin || "ffplay",
      args: (filePath) => [
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        filePath,
      ],
    });

    strategies.push({
      id: "powershell",
      command: "powershell.exe",
      args: (filePath) => [
        "-NoProfile",
        "-Command",
        `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync();`,
      ],
    });
  }

  return strategies;
}

async function runPlayer(
  strategy: AudioPlayerStrategy,
  filePath: string,
): Promise<void> {
  const args = await strategy.args(filePath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(strategy.command, args, {
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
        const stderrSummary = summarizeStderr(stderr);
        reject(
          new Error(
            `Audio player ${strategy.id} exited with code ${String(code)}.${stderrSummary ? ` ${stderrSummary}` : ""}`,
          ),
        );
        return;
      }

      resolve();
    });
  });
}

export async function playAudioPreview(filePath: string): Promise<void> {
  const strategies = await buildStrategies();
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

  const installHintByPlatform: Record<NodeJS.Platform, string> = {
    aix: "Configure ANKORE_AUDIO_PLAYER with a CLI-capable audio player.",
    android:
      "Install ffplay/mpg123 or configure ANKORE_AUDIO_PLAYER with a CLI-capable player.",
    darwin:
      "Install afplay (built-in on macOS) or configure ANKORE_AUDIO_PLAYER.",
    freebsd: "Install ffplay/mpg123 or configure ANKORE_AUDIO_PLAYER.",
    haiku: "Configure ANKORE_AUDIO_PLAYER with a CLI-capable audio player.",
    linux:
      "Install ffplay/mpg123/mpg321/cvlc or configure ANKORE_AUDIO_PLAYER.",
    netbsd: "Install ffplay/mpg123 or configure ANKORE_AUDIO_PLAYER.",
    openbsd: "Install ffplay/mpg123 or configure ANKORE_AUDIO_PLAYER.",
    sunos: "Install ffplay/mpg123 or configure ANKORE_AUDIO_PLAYER.",
    win32:
      "Configure ANKORE_AUDIO_PLAYER with a CLI-capable audio player (for example, ffplay.exe).",
    cygwin: "Configure ANKORE_AUDIO_PLAYER with a CLI-capable audio player.",
  };

  const installHint =
    installHintByPlatform[process.platform] ||
    "Configure ANKORE_AUDIO_PLAYER with a CLI-capable audio player.";

  throw new Error(
    "No working CLI audio player found for preview. Tried: " +
      errors.join(" | ") +
      `. ${installHint}`,
  );
}
