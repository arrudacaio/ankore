export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsWord(sentence: string, word: string): boolean {
  const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
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
  const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "i");
  return sentence.replace(regex, "<b>$1</b>");
}

export function highlightWordForCli(
  sentence: string,
  word: string,
  accentColor: (value: string) => string,
): string {
  const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "i");
  return sentence.replace(regex, accentColor("$1"));
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
