import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { buildExportPath } from "./session-storage.js";

function sanitizeToken(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function fetchAudioBuffer(url, sentence) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 AnkoreCLI/1.0",
      Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
      Referer: "https://translate.google.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`TTS request failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length < 512) {
    throw new Error(`Invalid TTS audio response for: ${sentence}`);
  }

  return buffer;
}

export async function generateSentenceAudio({ sentence, word }) {
  const encodedSentence = encodeURIComponent(sentence);
  const providers = [
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-US&q=${encodedSentence}`,
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=en-US&q=${encodedSentence}`
  ];

  let lastError = null;
  let audioBuffer = null;

  for (const providerUrl of providers) {
    try {
      audioBuffer = await fetchAudioBuffer(providerUrl, sentence);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!audioBuffer) {
    throw lastError || new Error("No TTS provider available.");
  }

  const safeWord = sanitizeToken(word) || "word";
  const fileName = `ankore-${safeWord}-${randomUUID().slice(0, 8)}.mp3`;
  const filePath = buildExportPath(fileName);

  await writeFile(filePath, audioBuffer);

  return {
    fileName,
    filePath
  };
}
