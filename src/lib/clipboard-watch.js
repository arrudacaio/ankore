import clipboard from "clipboardy";

function extractClipboardWord(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const withoutEdges = trimmed.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  if (!withoutEdges || /\s/.test(withoutEdges)) {
    return null;
  }

  const normalized = withoutEdges.toLowerCase();
  if (!/^[a-z]+(?:[-'][a-z]+)*$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function startClipboardWatch({ onWord, onError, intervalMs = 700 }) {
  let lastClipboardText = null;
  let isPolling = false;

  const timer = setInterval(async () => {
    if (isPolling) {
      return;
    }

    isPolling = true;

    try {
      const clipboardText = await clipboard.read();
      if (typeof clipboardText !== "string") {
        return;
      }

      const currentText = clipboardText.trim();
      if (!currentText || currentText === lastClipboardText) {
        return;
      }

      lastClipboardText = currentText;

      const word = extractClipboardWord(currentText);
      if (!word) {
        return;
      }

      onWord(word);
    } catch (error) {
      if (onError) {
        onError(error);
      }
    } finally {
      isPolling = false;
    }
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
