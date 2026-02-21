export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PHRASAL_PARTICLES = new Set([
  "about",
  "across",
  "after",
  "along",
  "around",
  "away",
  "back",
  "down",
  "for",
  "in",
  "into",
  "off",
  "on",
  "out",
  "over",
  "through",
  "up",
]);

const IRREGULAR_VERB_FORMS: Record<string, string[]> = {
  be: ["am", "are", "is", "was", "were", "been", "being"],
  come: ["comes", "came", "coming"],
  do: ["does", "did", "done", "doing"],
  get: ["gets", "got", "gotten", "getting"],
  give: ["gives", "gave", "given", "giving"],
  go: ["goes", "went", "gone", "going"],
  have: ["has", "had", "having"],
  make: ["makes", "made", "making"],
  run: ["runs", "ran", "running"],
  take: ["takes", "took", "taken", "taking"],
};

function tokenizeExpression(value: string): string[] {
  return normalizeSentence(value).toLowerCase().split(" ").filter(Boolean);
}

function isConsonant(letter: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]$/i.test(letter);
}

function buildVerbForms(verb: string): string[] {
  const normalized = verb.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const forms = new Set<string>([normalized]);
  const irregularForms = IRREGULAR_VERB_FORMS[normalized] || [];
  for (const form of irregularForms) {
    forms.add(form);
  }

  if (/(s|sh|ch|x|z|o)$/.test(normalized)) {
    forms.add(`${normalized}es`);
  } else if (/[^aeiou]y$/.test(normalized)) {
    forms.add(`${normalized.slice(0, -1)}ies`);
  } else {
    forms.add(`${normalized}s`);
  }

  if (normalized.endsWith("e")) {
    forms.add(`${normalized}d`);
  } else if (/[^aeiou]y$/.test(normalized)) {
    forms.add(`${normalized.slice(0, -1)}ied`);
  } else {
    forms.add(`${normalized}ed`);
  }

  if (normalized.endsWith("ie")) {
    forms.add(`${normalized.slice(0, -2)}ying`);
  } else if (normalized.endsWith("e") && !normalized.endsWith("ee")) {
    forms.add(`${normalized.slice(0, -1)}ing`);
  } else if (
    normalized.length >= 3 &&
    isConsonant(normalized[normalized.length - 1]) &&
    !/w|x|y/.test(normalized[normalized.length - 1]) &&
    /[aeiou]/.test(normalized[normalized.length - 2]) &&
    isConsonant(normalized[normalized.length - 3])
  ) {
    const last = normalized[normalized.length - 1];
    forms.add(`${normalized}${last}ing`);
  } else {
    forms.add(`${normalized}ing`);
  }

  return Array.from(forms);
}

function createExpressionRegex(expression: string): RegExp {
  const tokens = tokenizeExpression(expression);
  if (tokens.length === 0) {
    return /$^/i;
  }

  if (tokens.length === 1) {
    const token = escapeRegExp(tokens[0]);
    return new RegExp(`\\b${token}\\b`, "i");
  }

  const [first, ...rest] = tokens;
  const isLikelyPhrasalVerb =
    tokens.length === 2 && PHRASAL_PARTICLES.has(tokens[1]);

  const firstAlternatives = buildVerbForms(first)
    .map((item) => escapeRegExp(item))
    .join("|");

  if (isLikelyPhrasalVerb) {
    const particle = escapeRegExp(rest[0]);
    return new RegExp(
      `\\b(?:${firstAlternatives})\\b(?:\\s+\\w+){0,3}\\s+\\b${particle}\\b`,
      "i",
    );
  }

  const restPattern = rest.map((item) => escapeRegExp(item)).join("\\s+");
  return new RegExp(`\\b(?:${firstAlternatives})\\b\\s+${restPattern}\\b`, "i");
}

export function containsWord(sentence: string, word: string): boolean {
  const regex = createExpressionRegex(word);
  return regex.test(sentence);
}

export function normalizeSentence(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim();
}

export function uniqueSentences(sentences: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const rawSentence of sentences) {
    if (!rawSentence) {
      continue;
    }

    const sentence = normalizeSentence(rawSentence);
    if (!sentence) {
      continue;
    }

    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(sentence);
  }

  return output;
}

export function highlightWordForAnki(sentence: string, word: string): string {
  const regex = createExpressionRegex(word);
  return sentence.replace(regex, "<b>$&</b>");
}

export function highlightWordForCli(
  sentence: string,
  word: string,
  accentColor: (value: string) => string,
): string {
  const regex = createExpressionRegex(word);
  return sentence.replace(regex, (match) => accentColor(match));
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
