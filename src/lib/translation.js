function decodeHtmlEntities(value) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export async function fetchLiteralTranslationPtBr(sentence) {
  const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sentence)}&langpair=en|pt-BR`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Translation service unavailable.");
  }

  const data = await response.json();
  const translatedText = data?.responseData?.translatedText;

  if (!translatedText || typeof translatedText !== "string") {
    throw new Error("Could not translate this sentence right now.");
  }

  return decodeHtmlEntities(translatedText).trim();
}
