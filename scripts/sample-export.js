import { generateSampleExport } from "../src/lib/sample-export.js";

async function main() {
  const outputFile = await generateSampleExport();
  console.log(`Sample file generated: ${outputFile}`);
}

main().catch((error) => {
  console.error("Failed to generate sample file:", error);
  process.exitCode = 1;
});
