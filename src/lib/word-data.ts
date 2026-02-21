import { containsWord, normalizeSentence, uniqueSentences } from "./text.js";

type DefinitionCandidate = {
  definition: string;
  example: string | null;
};

type DictionaryEntryData = {
  definitionCandidates: DefinitionCandidate[];
  examples: string[];
  phonetic: string;
};

type ReversoDefinitionExample = {
  example?: string;
};

type ReversoDefinitionItem = {
  Def?: string;
  examples?: ReversoDefinitionExample[];
};

type ReversoDefinitionByPos = {
  Defs?: ReversoDefinitionItem[];
};

type ReversoExpressionDef = {
  expression?: string;
  def?: string;
  examples?: ReversoDefinitionExample[];
};

type ReversoWordData = {
  pronounceIpa?: string;
  pronounceSpelling?: string;
  DefsByPos?: ReversoDefinitionByPos[];
  expressionDefs?: ReversoExpressionDef[];
};

type ReversoDefinitionResponse = {
  DefsByWord?: ReversoWordData[];
};

type ReversoFetchResult = {
  data: ReversoDefinitionResponse | null;
  hasRequestFailure: boolean;
};

function encodeWord(word: string): string {
  return encodeURIComponent(word.trim());
}

function buildReversoDefinitionUrls(word: string): string[] {
  const encodedWord = encodeWord(word);
  return [
    `https://definition-api.reverso.net/v1/api/definitionSearch/en/${encodedWord}`,
    `https://definition-api.reverso.net/v1/api/definitions/en/${encodedWord}`,
  ];
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseReversoDefinitionResponse(
  payload: unknown,
): ReversoDefinitionResponse | null {
  if (!isObjectLike(payload)) {
    return null;
  }

  const defsByWord = payload.DefsByWord;
  if (!Array.isArray(defsByWord)) {
    return null;
  }

  return payload as ReversoDefinitionResponse;
}

function normalizeExampleList(
  examples: ReversoDefinitionExample[] | undefined,
): string[] {
  if (!Array.isArray(examples)) {
    return [];
  }

  const normalized = examples
    .map((item) =>
      item && typeof item.example === "string" ? item.example : "",
    )
    .map((value) => normalizeSentence(value))
    .filter(Boolean);

  return uniqueSentences(normalized);
}

function pickReversoPhonetic(entry: ReversoWordData | undefined): string {
  if (!entry) {
    return "N/A";
  }

  if (entry.pronounceIpa && entry.pronounceIpa.trim()) {
    return entry.pronounceIpa.trim();
  }

  if (entry.pronounceSpelling && entry.pronounceSpelling.trim()) {
    return entry.pronounceSpelling.trim();
  }

  return "N/A";
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

function collectDefinitionCandidatesAndExamples(
  payload: ReversoDefinitionResponse,
  word: string,
): DictionaryEntryData {
  if (!Array.isArray(payload.DefsByWord) || payload.DefsByWord.length === 0) {
    return {
      definitionCandidates: [],
      examples: [],
      phonetic: "N/A",
    };
  }

  const baseEntry = payload.DefsByWord[0];
  const normalizedWord = normalizeSentence(word).toLowerCase();
  const definitionCandidates: DefinitionCandidate[] = [];
  const examples: string[] = [];

  for (const entry of payload.DefsByWord) {
    if (!Array.isArray(entry.DefsByPos)) {
      continue;
    }

    for (const definitionPos of entry.DefsByPos) {
      if (!Array.isArray(definitionPos.Defs)) {
        continue;
      }

      for (const definitionItem of definitionPos.Defs) {
        if (!definitionItem || typeof definitionItem.Def !== "string") {
          continue;
        }

        const normalizedDefinition = normalizeSentence(definitionItem.Def);
        if (!normalizedDefinition) {
          continue;
        }

        const normalizedExamples = normalizeExampleList(
          definitionItem.examples,
        );
        const representativeExample = normalizedExamples[0] || null;

        definitionCandidates.push({
          definition: normalizedDefinition,
          example: representativeExample,
        });

        for (const normalizedExample of normalizedExamples) {
          if (isContextualSentence(normalizedExample, word)) {
            examples.push(normalizedExample);
          }
        }
      }
    }

    if (!Array.isArray(entry.expressionDefs)) {
      continue;
    }

    for (const expressionDefinition of entry.expressionDefs) {
      const expression = normalizeSentence(
        expressionDefinition.expression || "",
      );
      if (!expression || expression.toLowerCase() !== normalizedWord) {
        continue;
      }

      if (
        !expressionDefinition.def ||
        typeof expressionDefinition.def !== "string"
      ) {
        continue;
      }

      const normalizedDefinition = normalizeSentence(expressionDefinition.def);
      if (!normalizedDefinition) {
        continue;
      }

      const normalizedExamples = normalizeExampleList(
        expressionDefinition.examples,
      );
      const representativeExample = normalizedExamples[0] || null;

      definitionCandidates.push({
        definition: normalizedDefinition,
        example: representativeExample,
      });

      for (const normalizedExample of normalizedExamples) {
        if (isContextualSentence(normalizedExample, word)) {
          examples.push(normalizedExample);
        }
      }
    }
  }

  return {
    definitionCandidates,
    examples: uniqueSentences(examples),
    phonetic: pickReversoPhonetic(baseEntry),
  };
}

function tokenizeForScoring(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

const GENERIC_DEFINITION_PATTERNS = [
  /\bsomething\b/i,
  /\bsomeone\b/i,
  /\bthing\b/i,
  /\ba kind of\b/i,
  /\ban act of\b/i,
  /\bused to\b/i,
  /\bto do\b/i,
];

function hasGenericTone(definition: string): boolean {
  return GENERIC_DEFINITION_PATTERNS.some((pattern) =>
    pattern.test(definition),
  );
}

function scoreDefinitionCandidate(
  candidate: DefinitionCandidate,
  word: string,
  sentenceCandidates: string[],
): number {
  const definitionTokens = new Set(tokenizeForScoring(candidate.definition));
  let bestSentenceOverlap = 0;

  for (const sentence of sentenceCandidates) {
    const sentenceTokens = tokenizeForScoring(sentence);
    if (sentenceTokens.length === 0) {
      continue;
    }

    let overlap = 0;
    for (const token of sentenceTokens) {
      if (definitionTokens.has(token)) {
        overlap += 1;
      }
    }

    if (overlap > bestSentenceOverlap) {
      bestSentenceOverlap = overlap;
    }
  }

  let score = bestSentenceOverlap;

  if (containsWord(candidate.definition, word)) {
    score += 2;
  }

  if (candidate.example && containsWord(candidate.example, word)) {
    score += 2;
  }

  if (candidate.example) {
    const exampleTokens = new Set(tokenizeForScoring(candidate.example));
    let exampleOverlap = 0;

    for (const sentence of sentenceCandidates) {
      const sentenceTokens = tokenizeForScoring(sentence);
      for (const token of sentenceTokens) {
        if (exampleTokens.has(token)) {
          exampleOverlap += 1;
        }
      }
    }

    score += Math.min(exampleOverlap, 3);
  }

  if (hasGenericTone(candidate.definition)) {
    score -= 1.5;
  }

  if (candidate.definition.length < 20) {
    score -= 0.5;
  }

  return score;
}

function resolveMeaningFromDictionary(
  definitionCandidates: DefinitionCandidate[],
  word: string,
  sentenceCandidates: string[],
  meaningMode: MeaningMode,
): {
  definition: string;
  meaningCandidates: string[];
  meaningConfidence: MeaningConfidence;
} | null {
  if (definitionCandidates.length === 0) {
    return null;
  }

  if (meaningMode === "normal") {
    const first = definitionCandidates[0].definition;
    return {
      definition: first,
      meaningCandidates: [first],
      meaningConfidence: "medium",
    };
  }

  const ranked = definitionCandidates
    .map((candidate) => ({
      candidate,
      score: scoreDefinitionCandidate(candidate, word, sentenceCandidates),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const second = ranked[1];
  const confidenceGap = best.score - (second ? second.score : 0);

  let meaningConfidence: MeaningConfidence = "low";
  if (best.score >= 5 && confidenceGap >= 2) {
    meaningConfidence = "high";
  } else if (best.score >= 3 && confidenceGap >= 1) {
    meaningConfidence = "medium";
  }

  const meaningCandidates = Array.from(
    new Set(ranked.slice(0, 5).map((item) => item.candidate.definition)),
  );

  return {
    definition: best.candidate.definition,
    meaningCandidates,
    meaningConfidence,
  };
}

async function fetchReversoDefinitionData(
  word: string,
): Promise<ReversoFetchResult> {
  const urls = buildReversoDefinitionUrls(word);
  let hasRequestFailure = false;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        hasRequestFailure = true;
        continue;
      }

      const payload = await response.json();
      const parsedPayload = parseReversoDefinitionResponse(payload);
      if (!parsedPayload) {
        continue;
      }

      return {
        data: parsedPayload,
        hasRequestFailure,
      };
    } catch {
      hasRequestFailure = true;
    }
  }

  return {
    data: null,
    hasRequestFailure,
  };
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

function fetchExpressionMeaningFallback(
  expression: string,
  definitionCandidates: DefinitionCandidate[],
): string | null {
  const normalizedExpression = normalizeSentence(expression).toLowerCase();

  for (const candidate of definitionCandidates) {
    if (containsWord(candidate.definition, normalizedExpression)) {
      return candidate.definition;
    }
  }

  return null;
}

export async function fetchWordData(
  word: string,
  options: {
    meaningMode?: MeaningMode;
  } = {},
): Promise<WordDataResult> {
  const meaningMode = options.meaningMode || "normal";
  const reversoDataResult = await fetchReversoDefinitionData(word);

  const allowDictionaryFallback = isMultiWordExpression(word);

  let definition = "Definition not found.";
  let phonetic = "N/A";
  let meaningCandidates: string[] = [];
  let meaningConfidence: MeaningConfidence = "low";
  let examples: string[] = [];
  let definitionCandidates: DefinitionCandidate[] = [];

  if (reversoDataResult.data) {
    const dictionaryEntryData = collectDefinitionCandidatesAndExamples(
      reversoDataResult.data,
      word,
    );
    definitionCandidates = dictionaryEntryData.definitionCandidates;
    examples = dictionaryEntryData.examples;
    phonetic = dictionaryEntryData.phonetic;
  } else if (!allowDictionaryFallback && reversoDataResult.hasRequestFailure) {
    throw new Error(`Could not fetch dictionary data for "${word}".`);
  } else if (!allowDictionaryFallback) {
    throw new Error(`No dictionary entries found for "${word}".`);
  }

  const sentenceCandidates = uniqueSentences(examples);

  if (sentenceCandidates.length === 0) {
    throw new Error(
      `No contextual sentence found for \"${word}\". Try another word or add one manually after selecting a different word.`,
    );
  }

  const resolvedMeaning = resolveMeaningFromDictionary(
    definitionCandidates,
    word,
    sentenceCandidates,
    meaningMode,
  );

  if (resolvedMeaning) {
    definition = resolvedMeaning.definition;
    meaningCandidates = resolvedMeaning.meaningCandidates;
    meaningConfidence = resolvedMeaning.meaningConfidence;
  }

  if (allowDictionaryFallback && definition === "Definition not found.") {
    const expressionMeaning = fetchExpressionMeaningFallback(
      word,
      definitionCandidates,
    );
    definition =
      expressionMeaning || `Definition not found for expression "${word}".`;
    meaningCandidates = [definition];
    meaningConfidence = expressionMeaning ? "medium" : "low";
  }

  if (!allowDictionaryFallback && definition === "Definition not found.") {
    throw new Error(`No dictionary entries found for "${word}".`);
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
    meaningCandidates,
    meaningConfidence,
  };
}
