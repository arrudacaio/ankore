#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import ora from "ora";
import { buildAnkiImportFile, getDefaultAnkiFileName } from "./lib/anki-export.js";
import { reviewCardCandidate } from "./lib/card-session.js";
import {
  printDim,
  printInfo,
  printSuccess,
  printTitle,
  printWarning,
  askText,
  askWatchIdleAction,
  uiTokens
} from "./lib/ui.js";
import { startClipboardWatch } from "./lib/clipboard-watch.js";
import { fetchWordData } from "./lib/word-data.js";

const { icons } = uiTokens();

async function writeAnkiFile(cards, fileName) {
  const spinner = ora({
    text: `Gerando arquivo em ${fileName}...`,
    color: "cyan"
  }).start();

  try {
    const content = buildAnkiImportFile(cards);
    await writeFile(fileName, content, "utf8");
    spinner.succeed(`${icons.tick} Arquivo gerado: ${fileName}`);
  } catch (error) {
    spinner.fail(`${icons.cross} Falha ao gerar arquivo: ${error.message}`);
    throw error;
  }
}

async function finishSession(cards) {
  if (cards.length === 0) {
    printWarning("Nenhum card foi criado.");
    return;
  }

  const defaultName = getDefaultAnkiFileName();
  const fileNameRaw = await askText("Nome do arquivo de importacao:", defaultName);
  const fileName = fileNameRaw && fileNameRaw.trim() ? fileNameRaw.trim() : defaultName;

  await writeAnkiFile(cards, fileName);
  printInfo(`Total de cards: ${cards.length}`);
}

async function handleWord(rawWord, cards) {
  const word = rawWord.toLowerCase();
  const spinner = ora({
    text: `Buscando dados de \"${word}\" no dicionario...`,
    color: "cyan"
  }).start();

  let wordData;
  try {
    wordData = await fetchWordData(word);
    spinner.succeed(`${icons.tick} Dados carregados para \"${word}\".`);
  } catch (error) {
    spinner.fail(`${icons.cross} ${error.message}`);
    return;
  }

  const card = await reviewCardCandidate({
    word,
    definition: wordData.definition,
    phonetic: wordData.phonetic,
    sentenceCandidates: wordData.sentenceCandidates,
    initialSentence: wordData.sentence
  });

  if (!card) {
    return;
  }

  cards.push(card);
  printSuccess(`Card salvo. Total: ${cards.length}`);
  console.log("");
}

async function main() {
  const cards = [];
  const isWatchMode = process.argv.includes("--watch");

  printTitle();

  if (isWatchMode) {
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWatchMode(cards) {
  const queue = [];
  const queuedWords = new Set();
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
    }
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

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exitCode = 1;
});
