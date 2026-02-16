import { containsWord, normalizeSentence, uniqueSentences } from "./text.js";

function isContextualSentence(sentence: string, word: string): boolean {
  const normalized = normalizeSentence(sentence);
  const wordCount = normalized.split(" ").filter(Boolean).length;

  return (
    wordCount >= 4 &&
    normalized.length >= 20 &&
    normalized.length <= 220 &&
    containsWord(normalized, word)
  );
}

function pickPhonetic(entry: any): string {
  if (entry.phonetic && entry.phonetic.trim()) {
    return entry.phonetic.trim();
  }

  if (Array.isArray(entry.phonetics)) {
    for (const phonetic of entry.phonetics) {
      if (phonetic.text && phonetic.text.trim()) {
        return phonetic.text.trim();
      }
    }
  }

  return "N/A";
}

function pickDefinitionAndExamples(
  entry: any,
  word: string,
): { definition: string; examples: string[] } {
  if (!Array.isArray(entry.meanings)) {
    return {
      definition: "Definition not found.",
      examples: [],
    };
  }

  let definition = null;
  const examples: string[] = [];

  for (const meaning of entry.meanings) {
    if (!Array.isArray(meaning.definitions)) {
      continue;
    }

    for (const definitionItem of meaning.definitions) {
      if (!definitionItem.definition) {
        continue;
      }

      if (!definition) {
        definition = definitionItem.definition;
      }

      if (
        definitionItem.example &&
        containsWord(definitionItem.example, word)
      ) {
        examples.push(normalizeSentence(definitionItem.example));
      }
    }
  }

  return {
    definition: definition || "Definition not found.",
    examples,
  };
}

async function fetchQuotableSentences(word: string): Promise<string[]> {
  const url = `https://api.quotable.io/search/quotes?query=${encodeURIComponent(word)}&limit=30`;
  const response = await fetch(url);

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  const candidates = data.results
    .map((item) =>
      item && typeof item.content === "string" ? item.content : "",
    )
    .map((content) => normalizeSentence(content))
    .filter((content) => isContextualSentence(content, word));

  return uniqueSentences(candidates);
}

async function fetchTatoebaSentences(word: string): Promise<string[]> {
  const url = `https://tatoeba.org/en/api_v0/search?from=eng&query=${encodeURIComponent(word)}&sort=relevance`;
  const response = await fetch(url);

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  const candidates = data.results
    .map((item) => (item && typeof item.text === "string" ? item.text : ""))
    .map((content) => normalizeSentence(content))
    .filter((content) => isContextualSentence(content, word));

  return uniqueSentences(candidates);
}

function pickRandomSentence(sentences: string[]): string | null {
  if (sentences.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * sentences.length);
  return sentences[index];
}

export async function fetchWordData(word: string): Promise<WordDataResult> {
  const dictionaryUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const [dictionaryResponse, quotableSentences, tatoebaSentences] =
    await Promise.all([
      fetch(dictionaryUrl),
      fetchQuotableSentences(word).catch(() => []),
      fetchTatoebaSentences(word).catch(() => []),
    ]);

  if (!dictionaryResponse.ok) {
    throw new Error(`Could not fetch dictionary data for "${word}".`);
  }

  const dictionaryData = await dictionaryResponse.json();
  if (!Array.isArray(dictionaryData) || dictionaryData.length === 0) {
    throw new Error(`No dictionary entries found for "${word}".`);
  }

  const entry = dictionaryData[0];
  const { definition, examples } = pickDefinitionAndExamples(entry, word);
  const phonetic = pickPhonetic(entry);

  const sentenceCandidates = uniqueSentences([
    ...tatoebaSentences,
    ...quotableSentences,
    ...examples,
  ]);

  if (sentenceCandidates.length === 0) {
    throw new Error(
      `No contextual sentence found for \"${word}\". Try another word or add one manually after selecting a different word.`,
    );
  }

  const sentence = pickRandomSentence(sentenceCandidates);
  if (!sentence) {
    throw new Error(`No contextual sentence found for "${word}".`);
  }

  return {
    definition,
    phonetic,
    sentence,
    sentenceCandidates,
  };
}
