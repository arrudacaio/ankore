import { containsWord, escapeHtml, highlightWordForAnki } from "./text.js";
import {
  askText,
  askCardAction,
  printCardPreview,
  printDim,
  printWarning,
  printSuccess,
} from "./ui.js";
import { fetchLiteralTranslationPtBr } from "./translation.js";

export function createCard({
  sentence,
  word,
  definition,
  phonetic,
  literalTranslationPtBr,
}: {
  sentence: string;
  word: string;
  definition: string;
  phonetic: string;
  literalTranslationPtBr?: string | null;
}): CardDraft {
  const compactMeaning = escapeHtml(String(definition).trim());
  const compactPhonetic = escapeHtml(String(phonetic).trim());
  const compactLiteralTranslation = literalTranslationPtBr
    ? escapeHtml(String(literalTranslationPtBr).trim())
    : null;

  const backParts = [
    `<small>Meaning:</small> ${compactMeaning}`,
    `<small>Phonetic:</small> <b>${compactPhonetic}</b>`,
  ];

  if (compactLiteralTranslation) {
    backParts.push(
      `<small>Literal (pt-BR):</small> ${compactLiteralTranslation}`,
    );
  }

  return {
    front: highlightWordForAnki(sentence, word),
    back: backParts.join("<br>"),
    sentence,
    word,
  };
}

async function promptSentenceWithWord(word: string): Promise<string | null> {
  while (true) {
    const customSentenceRaw = await askText("Digite a nova frase:");
    if (customSentenceRaw === null) {
      return null;
    }

    const customSentence = customSentenceRaw.trim();
    if (!customSentence) {
      printWarning("A frase nao pode ser vazia.");
      continue;
    }

    if (!containsWord(customSentence, word)) {
      printWarning(`A frase precisa conter a palavra \"${word}\".`);
      continue;
    }

    return customSentence;
  }
}

export async function reviewCardCandidate({
  word,
  definition,
  phonetic,
  sentenceCandidates,
  initialSentence,
  previewAudio,
}: {
  word: string;
  definition: string;
  phonetic: string;
  sentenceCandidates: string[];
  initialSentence: string;
  previewAudio: (sentence: string) => Promise<{ fileName: string }>;
}): Promise<CardDraft | null> {
  let sentence = initialSentence;
  let sentenceIndex = sentenceCandidates.findIndex((item) => item === sentence);
  let literalTranslationPtBr = null;
  let translationSentenceReference: string | null = null;
  let previewedAudio: { sentence: string; fileName: string } | null = null;

  while (true) {
    printCardPreview({
      sentence,
      word,
      definition,
      phonetic,
      literalTranslationPtBr,
    });
    printDim(
      `Sugestoes de frase disponiveis para ${word}: ${sentenceCandidates.length}`,
    );

    const action = await askCardAction({
      canSwapSentence: sentenceCandidates.length > 1,
      hasLiteralTranslation: Boolean(literalTranslationPtBr),
      hasAudioPreview: Boolean(
        previewedAudio && previewedAudio.sentence === sentence,
      ),
    });

    if (action === "skip") {
      printDim("Card ignorado.");
      console.log("");
      return null;
    }

    if (action === "swap") {
      if (sentenceCandidates.length <= 1) {
        printWarning("Nao ha outra frase para trocar.");
        continue;
      }

      if (sentenceIndex < 0) {
        sentenceIndex = 0;
      } else {
        sentenceIndex = (sentenceIndex + 1) % sentenceCandidates.length;
      }

      sentence = sentenceCandidates[sentenceIndex];
      literalTranslationPtBr = null;
      translationSentenceReference = null;
      previewedAudio = null;
      printSuccess("Frase sugerida trocada.");
      continue;
    }

    if (action === "edit") {
      const customSentence = await promptSentenceWithWord(word);
      if (customSentence === null) {
        printWarning("Edicao cancelada. Card ignorado.");
        console.log("");
        return null;
      }

      sentence = customSentence;
      sentenceIndex = -1;
      literalTranslationPtBr = null;
      translationSentenceReference = null;
      previewedAudio = null;
      continue;
    }

    if (action === "previewAudio") {
      try {
        printDim("Gerando/reproduzindo audio da frase...");
        const preview = await previewAudio(sentence);
        previewedAudio = {
          sentence,
          fileName: preview.fileName,
        };
        printSuccess("Preview de audio concluido.");
      } catch (error) {
        printWarning(`Falha ao reproduzir audio: ${error.message}`);
      }

      continue;
    }

    if (action === "toggleTranslation") {
      if (literalTranslationPtBr) {
        literalTranslationPtBr = null;
        translationSentenceReference = null;
        printSuccess("Traducao literal removida do verso.");
        continue;
      }

      try {
        if (translationSentenceReference !== sentence) {
          printDim("Buscando traducao literal (pt-BR)...");
          literalTranslationPtBr = await fetchLiteralTranslationPtBr(sentence);
          translationSentenceReference = sentence;
        }

        if (!literalTranslationPtBr) {
          printWarning(
            "Nao foi possivel obter traducao literal para esta frase.",
          );
          continue;
        }

        printSuccess("Traducao literal adicionada ao verso.");
      } catch (error) {
        printWarning(`Falha na traducao literal: ${error.message}`);
      }

      continue;
    }

    if (!previewedAudio || previewedAudio.sentence !== sentence) {
      printWarning("Ouca o audio da frase antes de aceitar o card.");
      continue;
    }

    const card = createCard({
      sentence,
      word,
      definition,
      phonetic,
      literalTranslationPtBr,
    });

    card.front = `${card.front} [sound:${previewedAudio.fileName}]`;
    card.audioFileName = previewedAudio.fileName;

    return card;
  }
}
