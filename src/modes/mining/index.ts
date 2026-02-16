import { access, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import ora from "ora";
import {
  buildAnkiImportFile,
  getDefaultAnkiFileName,
} from "../../lib/anki-export.js";
import { reviewCardCandidate } from "../../lib/card-session.js";
import {
  prepareSessionDirectories,
  buildExportPath,
} from "../../lib/session-storage.js";
import { generateSentenceAudio } from "../../lib/tts.js";
import {
  printDim,
  printInfo,
  printSuccess,
  printTitle,
  printWarning,
  askText,
  askWatchIdleAction,
  uiTokens,
} from "../../lib/ui.js";
import { startClipboardWatch } from "../../lib/clipboard-watch.js";
import { fetchWordData } from "../../lib/word-data.js";

const { icons } = uiTokens();

async function writeAnkiFile(
  cards: AnkiExportCard[],
  fileName: string,
): Promise<void> {
  const outputPath = buildExportPath(fileName);

  const spinner = ora({
    text: `Gerando arquivo em ${outputPath}...`,
    color: "cyan",
  }).start();

  try {
    const content = buildAnkiImportFile(cards);
    await writeFile(outputPath, content, "utf8");

    const mediaFiles = cards
      .map((card) => card.audioFileName)
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
      .filter((value, index, list) => list.indexOf(value) === index);

    spinner.succeed(`${icons.tick} Arquivo gerado: ${outputPath}`);
    if (mediaFiles.length > 0) {
      printInfo(
        `Midias disponiveis em session-output/exports: ${mediaFiles.length}`,
      );
      await optionallySyncMediaToAnki(mediaFiles);
    }
  } catch (error) {
    spinner.fail(`${icons.cross} Falha ao gerar arquivo: ${error.message}`);
    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectDefaultAnkiMediaDir(): Promise<string> {
  const envPath = process.env.ANKORE_ANKI_MEDIA_DIR;
  if (envPath && (await pathExists(envPath))) {
    return envPath;
  }

  const home = os.homedir();
  const linuxDefault = path.join(
    home,
    ".local",
    "share",
    "Anki2",
    "User 1",
    "collection.media",
  );
  const macDefault = path.join(
    home,
    "Library",
    "Application Support",
    "Anki2",
    "User 1",
    "collection.media",
  );

  if (await pathExists(linuxDefault)) {
    return linuxDefault;
  }

  if (await pathExists(macDefault)) {
    return macDefault;
  }

  return "";
}

async function optionallySyncMediaToAnki(mediaFiles: string[]): Promise<void> {
  const suggestedPath = await detectDefaultAnkiMediaDir();
  const prompt =
    "Diretorio collection.media do Anki (Enter para pular copia de audio):";
  const mediaDirInput = await askText(prompt, suggestedPath);
  const mediaDir = mediaDirInput ? mediaDirInput.trim() : "";

  if (!mediaDir) {
    printWarning("Audio nao foi copiado para o Anki automaticamente.");
    printDim(
      "Para ouvir no Anki, copie os .mp3 para sua pasta collection.media.",
    );
    return;
  }

  const mediaDirExists = await pathExists(mediaDir);
  if (!mediaDirExists) {
    printWarning(`Diretorio inexistente: ${mediaDir}`);
    printDim("Pulando copia automatica de audio para o Anki.");
    return;
  }

  for (const mediaFileName of mediaFiles) {
    const fromPath = buildExportPath(mediaFileName);
    const toPath = path.join(mediaDir, mediaFileName);
    await copyFile(fromPath, toPath);
  }

  printSuccess(`Audios copiados para o Anki: ${mediaFiles.length}`);
}

async function finishSession(cards: AnkiExportCard[]): Promise<void> {
  if (cards.length === 0) {
    printWarning("Nenhum card foi criado.");
    return;
  }

  const defaultName = getDefaultAnkiFileName();
  const fileNameRaw = await askText(
    "Nome do arquivo de importacao:",
    defaultName,
  );
  const fileName =
    fileNameRaw && fileNameRaw.trim() ? fileNameRaw.trim() : defaultName;

  await writeAnkiFile(cards, fileName);
  printInfo(`Total de cards: ${cards.length}`);
}

async function handleWord(
  rawWord: string,
  cards: AnkiExportCard[],
): Promise<void> {
  const word = rawWord.toLowerCase();
  const spinner = ora({
    text: `Buscando dados de \"${word}\" no dicionario...`,
    color: "cyan",
  }).start();

  let wordData: WordDataResult;
  try {
    wordData = await fetchWordData(word);
    spinner.succeed(`${icons.tick} Dados carregados para \"${word}\".`);
  } catch (error) {
    spinner.fail(`${icons.cross} ${error.message}`);
    return;
  }

  const card: CardDraft | null = await reviewCardCandidate({
    word,
    definition: wordData.definition,
    phonetic: wordData.phonetic,
    sentenceCandidates: wordData.sentenceCandidates,
    initialSentence: wordData.sentence,
  });

  if (!card) {
    return;
  }

  const audioSpinner = ora({
    text: "Gerando audio TTS (en-US) para a frase...",
    color: "cyan",
  }).start();

  try {
    const audio = await generateSentenceAudio({
      sentence: card.sentence,
      word: card.word,
    });
    card.front = `${card.front} [sound:${audio.fileName}]`;
    card.audioFileName = audio.fileName;
    audioSpinner.succeed(`${icons.tick} Audio gerado: ${audio.fileName}`);
  } catch (error) {
    audioSpinner.fail(`${icons.cross} Falha ao gerar audio: ${error.message}`);
    printWarning("Card nao salvo porque o audio nao foi gerado.");
    console.log("");
    return;
  }

  const { sentence: _sentence, word: _word, ...exportCard } = card;
  cards.push(exportCard);
  printSuccess(`Card salvo. Total: ${cards.length}`);
  console.log("");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWatchMode(cards: AnkiExportCard[]): Promise<void> {
  const queue: string[] = [];
  const queuedWords = new Set<string>();
  let stopRequested = false;
  let lastActivityAt = Date.now();
  let idlePromptAt = 0;

  const IDLE_SUGGESTION_MS = 30000;

  const stopWatch = startClipboardWatch({
    onWord: (word) => {
      if (queuedWords.has(word)) {
        return;
      }

      queuedWords.add(word);
      queue.push(word);
      lastActivityAt = Date.now();
      printInfo(`Palavra capturada do clipboard: ${word}`);
    },
    onError: (error) => {
      printWarning(`Falha ao ler clipboard: ${error.message}`);
    },
  });

  const requestStop = () => {
    stopRequested = true;
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  printInfo("Modo watch ativo. Copie uma palavra para captura automatica.");
  printDim("Use Ctrl+C para encerrar e salvar o arquivo final.");
  console.log("");

  try {
    while (!stopRequested) {
      const nextWord = queue.shift();
      if (!nextWord) {
        const now = Date.now();
        const canSuggestFinish =
          cards.length > 0 &&
          now - lastActivityAt >= IDLE_SUGGESTION_MS &&
          now - idlePromptAt >= IDLE_SUGGESTION_MS;

        if (canSuggestFinish) {
          idlePromptAt = now;
          const idleAction = await askWatchIdleAction();
          lastActivityAt = Date.now();

          if (idleAction === "finish") {
            stopRequested = true;
            continue;
          }
        }

        await wait(250);
        continue;
      }

      queuedWords.delete(nextWord);
      await handleWord(nextWord, cards);
      lastActivityAt = Date.now();
    }
  } finally {
    stopWatch();
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
  }

  if (cards.length === 0) {
    printWarning("Watch encerrado sem cards criados.");
    return;
  }

  await finishSession(cards);
}

export async function runMiningMode({
  watchMode = false,
}: MiningModeOptions = {}): Promise<void> {
  const cards: AnkiExportCard[] = [];

  await prepareSessionDirectories();

  printTitle();
  printDim(
    "Pastas de sessao preparadas: arquivos antigos removidos (mantendo .keep).",
  );
  console.log("");

  if (watchMode) {
    await runWatchMode(cards);
    return;
  }

  while (true) {
    const rawWordInput = await askText("Palavra (ou /finish):");

    if (rawWordInput === null) {
      if (cards.length === 0) {
        printDim("Sessao encerrada sem cards.");
        return;
      }

      const defaultName = getDefaultAnkiFileName();
      await writeAnkiFile(cards, defaultName);
      printInfo(`Total de cards: ${cards.length}`);
      return;
    }

    const rawWord = rawWordInput.trim();
    if (!rawWord) {
      continue;
    }

    if (rawWord.toLowerCase() === "/finish") {
      await finishSession(cards);
      return;
    }

    await handleWord(rawWord, cards);
  }
}
