import { writeFile } from "node:fs/promises";
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
import { playAudioPreview } from "../../lib/audio-player.js";
import { addCardToAnki, getAnkiConnectStatus } from "../../lib/anki-connect.js";
import {
  printDim,
  printInfo,
  printSuccess,
  printTitle,
  printWarning,
  askText,
  askMainAction,
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

    const mediaFileCount = cards
      .map((card) => card.audioFileName)
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
      .filter((value, index, list) => list.indexOf(value) === index).length;

    spinner.succeed(`${icons.tick} Arquivo gerado: ${outputPath}`);
    if (mediaFileCount > 0) {
      printInfo(`Midias geradas em session-output/exports: ${mediaFileCount}`);
    }
  } catch (error) {
    spinner.fail(`${icons.cross} Falha ao gerar arquivo: ${error.message}`);
    throw error;
  }
}

async function finishSession(cards: AnkiExportCard[]): Promise<void> {
  if (cards.length === 0) {
    printWarning("Nenhum card foi criado.");
    return;
  }

  const defaultName = getDefaultAnkiFileName();
  await writeAnkiFile(cards, defaultName);
  printInfo(`Total de cards: ${cards.length}`);
}

async function handleWord(
  rawWord: string,
  cards: AnkiExportCard[],
  meaningMode: MeaningMode,
): Promise<void> {
  const word = rawWord.toLowerCase();
  const spinner = ora({
    text: `Buscando dados de \"${word}\" no dicionario...`,
    color: "cyan",
  }).start();

  const wordData = await fetchWordData(word, { meaningMode })
    .then((data) => {
      spinner.succeed(`${icons.tick} Dados carregados para \"${word}\".`);
      return data;
    })
    .catch((error) => {
      spinner.fail(
        `${icons.cross} ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });

  if (!wordData) {
    return;
  }

  const card: CardDraft | null = await reviewCardCandidate({
    word,
    definition: wordData.definition,
    meaningCandidates: wordData.meaningCandidates || [wordData.definition],
    meaningConfidence: wordData.meaningConfidence,
    phonetic: wordData.phonetic,
    sentenceCandidates: wordData.sentenceCandidates,
    initialSentence: wordData.sentence,
    previewAudio: async (sentence) => {
      const audioSpinner = ora({
        text: "Gerando audio TTS (en-US) para preview...",
        color: "cyan",
      }).start();
      try {
        const audio = await generateSentenceAudio({ sentence });
        audioSpinner.text = `Reproduzindo audio: ${audio.fileName}`;
        try {
          await playAudioPreview(audio.filePath);
          audioSpinner.succeed(
            `${icons.tick} Audio reproduzido: ${audio.fileName}`,
          );
        } catch (error) {
          audioSpinner.succeed(
            `${icons.tick} Audio gerado para preview: ${audio.fileName}`,
          );
          printWarning(
            `Nao foi possivel reproduzir automaticamente. Voce ainda pode aceitar o card. Detalhe: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        return audio;
      } catch (error) {
        audioSpinner.fail(
          `${icons.cross} Falha no preview de audio: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      }
    },
  });

  if (!card) {
    return;
  }

  const { sentence: _sentence, word: _word, ...exportCard } = card;
  cards.push(exportCard);

  try {
    const noteId = await addCardToAnki(exportCard);
    printSuccess(
      `Card salvo no Anki (noteId: ${noteId}). Total: ${cards.length}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    printWarning(`Card salvo localmente, mas falhou no AnkiConnect: ${reason}`);
    printDim("Verifique se o Anki esta aberto com o add-on AnkiConnect ativo.");
    printDim(
      "Se necessario, configure ANKORE_ANKI_MODEL_NAME/ANKORE_ANKI_FRONT_FIELD/ANKORE_ANKI_BACK_FIELD.",
    );
    printSuccess(`Card salvo localmente. Total: ${cards.length}`);
  }

  console.log("");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runWatchModeWithOptions(
  cards: AnkiExportCard[],
  meaningMode: MeaningMode,
): Promise<void> {
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
      printInfo(`Termo capturado do clipboard: ${word}`);
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

  printInfo(
    "Modo watch ativo. Copie uma palavra ou expressao para captura automatica.",
  );
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
      await handleWord(nextWord, cards, meaningMode);
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
  meaningMode = "normal",
}: MiningModeOptions = {}): Promise<void> {
  const cards: AnkiExportCard[] = [];

  await prepareSessionDirectories();

  try {
    const ankiStatus = await getAnkiConnectStatus();
    printInfo(
      `AnkiConnect ativo (v${ankiStatus.version}) em ${ankiStatus.endpointUrl}, deck ${ankiStatus.deckName}, modelo ${ankiStatus.modelName}.`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    printWarning(`AnkiConnect indisponivel no inicio da sessao: ${reason}`);
    printDim(
      "Os cards continuarao salvos localmente e no arquivo .tsv, mesmo sem envio automatico.",
    );
  }

  printTitle();
  printDim(
    "Pastas de sessao preparadas: arquivos antigos removidos (mantendo .keep).",
  );
  printDim(`Modo de significado ativo: ${meaningMode}.`);
  console.log("");

  if (watchMode) {
    await runWatchModeWithOptions(cards, meaningMode);
    return;
  }

  while (true) {
    const mainAction = await askMainAction();
    if (mainAction === "finishSession") {
      await finishSession(cards);
      return;
    }

    const rawWordInput = await askText("Palavra/expressao:");

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

    await handleWord(rawWord, cards, meaningMode);
  }
}
