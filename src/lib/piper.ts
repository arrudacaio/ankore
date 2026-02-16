import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PiperModelDefinition {
  id: string;
  fileName: string;
  configFileName: string;
  baseUrl: string;
}

const PIPER_MODELS: PiperModelDefinition[] = [
  {
    id: "en_us-ryan-high",
    fileName: "en_US-ryan-high.onnx",
    configFileName: "en_US-ryan-high.onnx.json",
    baseUrl:
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high",
  },
];

const DEFAULT_PIPER_MODEL_ID = PIPER_MODELS[0].id;
const PIPER_RELEASE_TAG = "2023.11.14-2";
const DOWNLOAD_TIMEOUT_MS = 60000;
const DOWNLOAD_RETRY_COUNT = 2;

interface CommandResult {
  code: number;
  stderr: string;
}

function getProjectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
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
): Promise<CommandResult> {
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

async function canSpawnBinary(binaryPath: string): Promise<boolean> {
  try {
    await runCommand(binaryPath, ["--help"]);
    return true;
  } catch {
    return false;
  }
}

function resolvePiperArchiveName(): string {
  if (process.platform === "linux" && process.arch === "x64") {
    return "piper_linux_x86_64.tar.gz";
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    return "piper_linux_aarch64.tar.gz";
  }

  throw new Error(
    `Automatic Piper installation is not supported for ${process.platform}/${process.arch}. Install Piper manually and set ANKORE_PIPER_BIN.`,
  );
}

function buildPiperDownloadUrls(): string[] {
  const archiveName = resolvePiperArchiveName();
  return [
    `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/${archiveName}`,
    `https://downloads.sourceforge.net/project/piper-tts.mirror/${PIPER_RELEASE_TAG}/${archiveName}`,
  ];
}

function buildModelDownloadUrls(
  model: PiperModelDefinition,
  fileName: string,
): string[] {
  return [
    `${model.baseUrl}/${fileName}`,
    `${model.baseUrl}/${fileName}?download=true`,
  ];
}

function resolveRequestedPiperModelId(explicitModel?: string): string {
  const configuredModel =
    explicitModel ??
    process.env.ANKORE_PIPER_MODEL?.trim() ??
    process.env.ANKORE_TTS_MODEL?.trim();

  if (!configuredModel) {
    return DEFAULT_PIPER_MODEL_ID;
  }

  return configuredModel.toLowerCase();
}

function resolvePiperModelDefinition(
  requestedId: string,
): PiperModelDefinition {
  const model = PIPER_MODELS.find((candidate) => candidate.id === requestedId);
  if (!model) {
    const supportedModels = PIPER_MODELS.map((item) => item.id).join(", ");
    throw new Error(
      `Unsupported Piper model "${requestedId}". Supported models: ${supportedModels}.`,
    );
  }

  return model;
}

async function extractTarGz(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  const tarResult = await runCommand("tar", [
    "-xzf",
    archivePath,
    "-C",
    targetDir,
  ]);
  if (tarResult.code !== 0) {
    throw new Error(
      `Failed to extract Piper archive with tar. ${tarResult.stderr}`.trim(),
    );
  }
}

async function ensureManagedPiperInstalled(
  projectRoot: string,
): Promise<string> {
  const managedDirs = [
    path.join(os.homedir(), ".cache", "ankore", "piper"),
    path.join(projectRoot, "tools", "piper"),
  ];
  const executableName = process.platform === "win32" ? "piper.exe" : "piper";

  for (const managedDir of managedDirs) {
    const directPath = path.join(managedDir, executableName);
    const nestedPath = path.join(managedDir, "piper", executableName);

    if (
      (await isExecutable(directPath)) &&
      (await canSpawnBinary(directPath))
    ) {
      return directPath;
    }

    if (
      (await isExecutable(nestedPath)) &&
      (await canSpawnBinary(nestedPath))
    ) {
      return nestedPath;
    }

    await mkdir(managedDir, { recursive: true });
    const archivePath = path.join(managedDir, resolvePiperArchiveName());

    try {
      await downloadFile(buildPiperDownloadUrls(), archivePath);
      await extractTarGz(archivePath, managedDir);
    } finally {
      await rm(archivePath, { force: true }).catch(() => undefined);
    }

    if (
      (await isExecutable(directPath)) &&
      (await canSpawnBinary(directPath))
    ) {
      return directPath;
    }

    if (
      (await isExecutable(nestedPath)) &&
      (await canSpawnBinary(nestedPath))
    ) {
      return nestedPath;
    }

    if (await isReadable(directPath)) {
      await chmod(directPath, 0o755).catch(() => undefined);
      if (
        (await isExecutable(directPath)) &&
        (await canSpawnBinary(directPath))
      ) {
        return directPath;
      }
    }

    if (await isReadable(nestedPath)) {
      await chmod(nestedPath, 0o755).catch(() => undefined);
      if (
        (await isExecutable(nestedPath)) &&
        (await canSpawnBinary(nestedPath))
      ) {
        return nestedPath;
      }
    }
  }

  throw new Error(
    "Piper was downloaded but executable was not found after extraction.",
  );
}

async function isPiperInPathAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("piper", ["--help"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function resolvePiperExecutable(): Promise<string> {
  const configured = process.env.ANKORE_PIPER_BIN?.trim();
  if (configured) {
    return configured;
  }

  const projectRoot = getProjectRoot();
  const executableName = process.platform === "win32" ? "piper.exe" : "piper";
  const cacheExecutable = path.join(
    os.homedir(),
    ".cache",
    "ankore",
    "piper",
    executableName,
  );

  const candidates = [
    cacheExecutable,
    path.join(projectRoot, "tools", "piper", executableName),
    path.join(projectRoot, "vendor", "piper", executableName),
    path.join(projectRoot, "bin", executableName),
    path.join(os.homedir(), ".local", "bin", executableName),
    "/usr/local/bin/piper",
    "/usr/bin/piper",
  ];

  for (const candidate of candidates) {
    if ((await isExecutable(candidate)) && (await canSpawnBinary(candidate))) {
      return candidate;
    }
  }

  if (await isPiperInPathAvailable()) {
    return "piper";
  }

  const managedInstalledPath = await ensureManagedPiperInstalled(projectRoot);
  if (
    (await isExecutable(managedInstalledPath)) &&
    (await canSpawnBinary(managedInstalledPath))
  ) {
    return managedInstalledPath;
  }

  throw new Error(
    "Piper binary was not found and automatic install failed. Set ANKORE_PIPER_BIN manually.",
  );
}

async function resolvePiperModelPath(explicitModel?: string): Promise<string> {
  const configured = process.env.ANKORE_PIPER_MODEL_PATH?.trim();
  if (configured) {
    if (await isReadable(configured)) {
      return configured;
    }

    throw new Error(`Piper model not found or unreadable: ${configured}`);
  }

  const requestedModelId = resolveRequestedPiperModelId(explicitModel);
  const model = resolvePiperModelDefinition(requestedModelId);

  const projectRoot = getProjectRoot();
  const managedDir = path.join(projectRoot, "models", "piper", model.id);
  const candidates = [
    path.join(projectRoot, "models", model.fileName),
    path.join(projectRoot, "models", "piper", model.fileName),
    path.join(projectRoot, "models", "piper", model.id, model.fileName),
    path.join(projectRoot, "assets", "piper", model.fileName),
    path.join(os.homedir(), ".local", "share", "piper", model.fileName),
    path.join(os.homedir(), ".cache", "piper", model.fileName),
    path.join("/usr/local/share/piper", model.fileName),
    path.join("/usr/share/piper", model.fileName),
  ];

  for (const candidate of candidates) {
    if (await isReadable(candidate)) {
      return candidate;
    }
  }

  return ensureManagedModelDownloaded(managedDir, model);
}

async function downloadWithFetch(
  url: string,
  outputPath: string,
): Promise<void> {
  const tempPath = `${outputPath}.tmp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Download failed (${response.status}) for ${url}`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    await writeFile(tempPath, data);
    await rename(tempPath, outputPath);
  } finally {
    clearTimeout(timeout);
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function downloadWithCurl(
  url: string,
  outputPath: string,
): Promise<void> {
  const result = await runCommand("curl", [
    "-fL",
    "--retry",
    "3",
    "--retry-all-errors",
    "--connect-timeout",
    "15",
    "-o",
    outputPath,
    url,
  ]);

  if (result.code !== 0) {
    throw new Error(result.stderr || "curl failed");
  }
}

async function downloadWithWget(
  url: string,
  outputPath: string,
): Promise<void> {
  const result = await runCommand("wget", [
    "-O",
    outputPath,
    "--tries=3",
    "--timeout=30",
    url,
  ]);

  if (result.code !== 0) {
    throw new Error(result.stderr || "wget failed");
  }
}

async function downloadFile(urls: string[], outputPath: string): Promise<void> {
  const errors: string[] = [];

  for (const url of urls) {
    for (let attempt = 1; attempt <= DOWNLOAD_RETRY_COUNT; attempt += 1) {
      try {
        await downloadWithFetch(url, outputPath);
        return;
      } catch (error) {
        errors.push(
          `[fetch attempt ${attempt}] ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  for (const url of urls) {
    try {
      await downloadWithCurl(url, outputPath);
      return;
    } catch (error) {
      errors.push(
        `[curl] ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const url of urls) {
    try {
      await downloadWithWget(url, outputPath);
      return;
    } catch (error) {
      errors.push(
        `[wget] ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `All download attempts failed for ${outputPath}. Details: ${errors.join(" | ")}`,
  );
}

async function ensureManagedModelDownloaded(
  managedDir: string,
  model: PiperModelDefinition,
): Promise<string> {
  const modelPath = path.join(managedDir, model.fileName);
  const configPath = path.join(managedDir, model.configFileName);

  if ((await isReadable(modelPath)) && (await isReadable(configPath))) {
    return modelPath;
  }

  await mkdir(managedDir, { recursive: true });

  try {
    if (!(await isReadable(modelPath))) {
      await downloadFile(
        buildModelDownloadUrls(model, model.fileName),
        modelPath,
      );
    }

    if (!(await isReadable(configPath))) {
      await downloadFile(
        buildModelDownloadUrls(model, model.configFileName),
        configPath,
      );
    }

    return modelPath;
  } catch (error) {
    await rm(modelPath, { force: true }).catch(() => undefined);
    await rm(configPath, { force: true }).catch(() => undefined);
    throw new Error(
      `Unable to auto-download Piper model ${model.fileName}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function ensureModelExists(modelPath: string): Promise<void> {
  try {
    await access(modelPath, constants.R_OK);
  } catch {
    throw new Error(`Piper model not found or unreadable: ${modelPath}`);
  }
}

export async function generateSpeech(
  text: string,
  outputWav: string,
  options: { model?: string } = {},
): Promise<void> {
  const spokenText = text.trim();
  if (!spokenText) {
    throw new Error("Cannot generate speech for empty text.");
  }

  const piperBin = await resolvePiperExecutable();
  const modelPath = await resolvePiperModelPath(options.model);
  await ensureModelExists(modelPath);

  if (await isReadable(piperBin)) {
    await chmod(piperBin, 0o755).catch(() => undefined);
  }

  const runPiperProcess = async (binaryPath: string): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        binaryPath,
        ["--model", modelPath, "--output_file", outputWav],
        {
          stdio: ["pipe", "ignore", "pipe"],
        },
      );

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
              `Piper exited with code ${String(code)}. ${stderr.trim()}`.trim(),
            ),
          );
          return;
        }

        resolve();
      });

      child.stdin.write(`${spokenText}\n`, (error) => {
        if (error) {
          reject(
            new Error(`Failed writing text to Piper stdin: ${error.message}`),
          );
          child.kill("SIGKILL");
          return;
        }

        child.stdin.end();
      });
    });
  };

  try {
    await runPiperProcess(piperBin);
  } catch (error) {
    const errnoError = error as NodeJS.ErrnoException;
    if (errnoError.code === "EACCES") {
      await chmod(piperBin, 0o755).catch(() => undefined);
      const fallbackBin = await ensureManagedPiperInstalled(getProjectRoot());
      const retryBin =
        fallbackBin && fallbackBin !== piperBin ? fallbackBin : piperBin;
      await runPiperProcess(retryBin).catch((retryError) => {
        throw new Error(
          `Piper binary "${retryBin}" is not executable in this environment. ` +
            `Check filesystem noexec permissions or set ANKORE_PIPER_BIN to a working binary. ` +
            `${retryError instanceof Error ? retryError.message : String(retryError)}`,
        );
      });
      return;
    }

    throw new Error(
      `Failed to start Piper binary "${piperBin}". Install Piper or set ANKORE_PIPER_BIN. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
