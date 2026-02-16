import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SESSION_ROOT = "session-output";
const EXPORTS_DIR = path.join(SESSION_ROOT, "exports");
const KEEP_FILE_NAME = ".keep";

async function ensureKeepFile(dirPath) {
  const keepPath = path.join(dirPath, KEEP_FILE_NAME);
  await writeFile(keepPath, "", { flag: "a" });
}

async function cleanDirectoryKeepingKeepFile(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === KEEP_FILE_NAME) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    await rm(entryPath, { recursive: true, force: true });
  }
}

export async function prepareSessionDirectories() {
  await mkdir(EXPORTS_DIR, { recursive: true });

  await ensureKeepFile(EXPORTS_DIR);

  await cleanDirectoryKeepingKeepFile(EXPORTS_DIR);
}

export function getExportsDir() {
  return EXPORTS_DIR;
}

export function buildExportPath(fileName) {
  return path.join(EXPORTS_DIR, fileName);
}
