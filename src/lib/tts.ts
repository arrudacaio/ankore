import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildExportPath } from "./session-storage.js";
import { resolveTtsStrategy } from "./tts-strategies.js";

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeSpeechText(text: string): string {
  return stripHtmlTags(text).replace(/\s+/g, " ").trim();
}

function buildSpeechHash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
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
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("close", (code) => {
      resolve({ code: code ?? 1, stderr: stderr.trim() });
    });
  });
}

async function isFfmpegInPathAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("ffmpeg", ["-version"]);
    return result.code === 0;
  } catch {
    return false;
  }
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

async function installBundledFfmpeg(projectRoot: string): Promise<void> {
  const installCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await runCommand(
    installCommand,
    ["install", "--no-save", "ffmpeg-static"],
    projectRoot,
  );

  if (result.code !== 0) {
    throw new Error(
      `Failed to auto-install ffmpeg-static. ${result.stderr}`.trim(),
    );
  }
}

async function resolveFfmpegExecutable(): Promise<string> {
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

  const bundled = await getBundledFfmpegPath();
  if (bundled) {
    return bundled;
  }

  await installBundledFfmpeg(projectRoot);
  const installedBundled = await getBundledFfmpegPath();
  if (installedBundled) {
    return installedBundled;
  }

  throw new Error(
    "ffmpeg was not found and could not be auto-installed. Install ffmpeg or set ANKORE_FFMPEG_BIN.",
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function convertWavToMp3(
  inputWav: string,
  outputMp3: string,
): Promise<void> {
  const ffmpegBin = await resolveFfmpegExecutable();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegBin,
      [
        "-y",
        "-i",
        inputWav,
        "-codec:a",
        "libmp3lame",
        "-qscale:a",
        "2",
        outputMp3,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Failed to start ffmpeg binary "${ffmpegBin}". Install ffmpeg or set ANKORE_FFMPEG_BIN. ${error.message}`,
        ),
      );
    });

    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg exited with code ${String(code)}. ${stderr.trim()}`.trim(),
          ),
        );
        return;
      }

      resolve();
    });
  });
}

export async function generateSentenceAudio({
  sentence,
}: {
  sentence: string;
}) {
  const strategy = resolveTtsStrategy();
  const spokenText = normalizeSpeechText(sentence);
  if (!spokenText) {
    throw new Error("The sentence has no readable text for speech generation.");
  }

  const hash = buildSpeechHash(spokenText);
  const fileName = `ankore-${hash}.mp3`;
  const filePath = buildExportPath(fileName);

  if (await pathExists(filePath)) {
    return {
      fileName,
      filePath,
    };
  }

  const wavPath = buildExportPath(`ankore-${hash}.wav`);

  try {
    await strategy.generateWav(spokenText, wavPath);
    await convertWavToMp3(wavPath, filePath);
  } finally {
    await rm(wavPath, { force: true }).catch(() => undefined);
  }

  return {
    fileName,
    filePath,
  };
}
