function sanitizeFieldForAnki(value) {
  return String(value).replace(/\r?\n/g, "<br>").replace(/\t/g, " ").trim();
}

function buildTsvBody(cards) {
  const lines = cards.map((card) => {
    const front = sanitizeFieldForAnki(card.front);
    const back = sanitizeFieldForAnki(card.back);
    return `${front}\t${back}`;
  });

  return `${lines.join("\n")}\n`;
}

export function buildAnkiImportFile(cards) {
  const utf8Bom = "\uFEFF";
  return `${utf8Bom}${buildTsvBody(cards)}`;
}

export function getDefaultAnkiFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `ankore-cards-${year}-${month}-${day}.tsv`;
}
