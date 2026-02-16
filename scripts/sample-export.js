import { mkdir, writeFile } from "node:fs/promises";
import { buildAnkiImportFile } from "../src/lib/anki-export.js";

const outputDir = "examples";
const outputFile = `${outputDir}/sample-anki-import.tsv`;

const sampleCards = [
  {
    front: "I decided to <b>improve</b> my listening routine this week.",
    back: "<small>Meaning:</small> to make something better<br><small>Phonetic:</small> <b>/imˈpruːv/</b>"
  },
  {
    front: "She tried to <b>maintain</b> focus during the entire class.",
    back: "<small>Meaning:</small> to continue or keep in a particular state<br><small>Phonetic:</small> <b>/meɪnˈteɪn/</b>"
  }
];

async function main() {
  await mkdir(outputDir, { recursive: true });
  const content = buildAnkiImportFile(sampleCards);
  await writeFile(outputFile, content, "utf8");
  console.log(`Sample file generated: ${outputFile}`);
}

main().catch((error) => {
  console.error("Failed to generate sample file:", error);
  process.exitCode = 1;
});
