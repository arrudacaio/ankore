import { containsWord, highlightWordForAnki } from "./text.js";
import { askText, askCardAction, printCardPreview, printDim, printWarning, printSuccess } from "./ui.js";

export function createCard({ sentence, word, definition, phonetic }) {
  const compactMeaning = String(definition).trim();
  const compactPhonetic = String(phonetic).trim();

  return {
    front: highlightWordForAnki(sentence, word),
    back:
      `<small>Meaning:</small> ${compactMeaning}` +
      `<br>` +
      `<small>Phonetic:</small> <b>${compactPhonetic}</b>`
  };
}

async function promptSentenceWithWord(word) {
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

export async function reviewCardCandidate({ word, definition, phonetic, sentenceCandidates, initialSentence }) {
  let sentence = initialSentence;
  let sentenceIndex = sentenceCandidates.findIndex((item) => item === sentence);

  while (true) {
    printCardPreview({ sentence, word, definition, phonetic });
    printDim(`Sugestoes de frase disponiveis para ${word}: ${sentenceCandidates.length}`);

    const action = await askCardAction(sentenceCandidates.length > 1);

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
      continue;
    }

    return createCard({ sentence, word, definition, phonetic });
  }
}
