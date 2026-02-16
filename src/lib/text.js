export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsWord(sentence, word) {
  const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
  return regex.test(sentence);
}

export function normalizeSentence(sentence) {
  return sentence.replace(/\s+/g, " ").trim();
}

export function uniqueSentences(sentences) {
  const seen = new Set();
  const output = [];

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

export function highlightWordForAnki(sentence, word) {
  const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "i");
  return sentence.replace(regex, "<b>$1</b>");
}

export function highlightWordForCli(sentence, word, accentColor) {
  const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "i");
  return sentence.replace(regex, accentColor("$1"));
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
