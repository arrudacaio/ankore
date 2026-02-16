import { containsWord, normalizeSentence, uniqueSentences } from "./text.js";

type ReversoContextExample = {
  source?: string;
};

type ReversoContextResponse = {
  ok?: boolean;
  examples?: ReversoContextExample[];
};

type ReversoClient = {
  getContext: (
    text: string,
    source: string,
    target: string,
  ) => Promise<ReversoContextResponse>;
};

let reversoClientPromise: Promise<ReversoClient | null> | null = null;

async function getReversoClient(): Promise<ReversoClient | null> {
  if (reversoClientPromise) {
    return reversoClientPromise;
  }

  reversoClientPromise = (async () => {
    try {
      const reversoModule = await import("reverso-api");
      const ReversoConstructor =
        "default" in reversoModule ? reversoModule.default : reversoModule;

      if (typeof ReversoConstructor !== "function") {
        return null;
      }

      const instance = new ReversoConstructor();
      if (!instance || typeof instance.getContext !== "function") {
        return null;
      }

      return instance as ReversoClient;
    } catch {
      return null;
    }
  })();

  return reversoClientPromise;
}

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

async function fetchReversoSentences(word: string): Promise<string[]> {
  const reverso = await getReversoClient();
  if (!reverso) {
    return [];
  }

  const response = await reverso.getContext(word, "english", "portuguese");
  if (!response || response.ok === false || !Array.isArray(response.examples)) {
    return [];
  }

  const candidates = response.examples
    .map((item) => (item && typeof item.source === "string" ? item.source : ""))
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

function isMultiWordExpression(value: string): boolean {
  return /\s+/.test(value.trim());
}

export async function fetchWordData(word: string): Promise<WordDataResult> {
  const dictionaryUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const [
    dictionaryResponse,
    reversoSentences,
    quotableSentences,
    tatoebaSentences,
  ] = await Promise.all([
    fetch(dictionaryUrl),
    fetchReversoSentences(word).catch(() => []),
    fetchQuotableSentences(word).catch(() => []),
    fetchTatoebaSentences(word).catch(() => []),
  ]);

  const allowDictionaryFallback = isMultiWordExpression(word);

  let definition = "Definition not found.";
  let phonetic = "N/A";
  let examples: string[] = [];

  if (dictionaryResponse.ok) {
    const dictionaryData = await dictionaryResponse.json();
    if (Array.isArray(dictionaryData) && dictionaryData.length > 0) {
      const entry = dictionaryData[0];
      const definitionAndExamples = pickDefinitionAndExamples(entry, word);
      definition = definitionAndExamples.definition;
      examples = definitionAndExamples.examples;
      phonetic = pickPhonetic(entry);
    } else if (!allowDictionaryFallback) {
      throw new Error(`No dictionary entries found for "${word}".`);
    }
  } else if (!allowDictionaryFallback) {
    throw new Error(`Could not fetch dictionary data for "${word}".`);
  }

  if (allowDictionaryFallback && definition === "Definition not found.") {
    definition = `Definition not found for expression "${word}".`;
  }

  const sentenceCandidates = uniqueSentences([
    ...reversoSentences,
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
