#!/usr/bin/env node

import { listModeDetails, startMode } from "./index.js";
import { generateSampleExport } from "./lib/sample-export.js";

function printHelp() {
  const modeLines = listModeDetails()
    .map((mode) => `  - ${mode.name}: ${mode.description}`)
    .join("\n");

  console.log("Ankore CLI");
  console.log("");
  console.log("Uso:");
  console.log("  ankore start [modo] [--watch]  Inicia um modo (default: mining)");
  console.log("  ankore sample-export  Gera arquivo de exemplo para importacao");
  console.log("  ankore help           Mostra esta ajuda");
  console.log("");
  console.log("Modos disponiveis:");
  console.log(modeLines);
}

async function run() {
  const command = process.argv[2] || "help";
  const args = process.argv.slice(3);

  if (command === "start") {
    const modeArg = args.find((arg) => !arg.startsWith("-"));
    const mode = modeArg || "mining";

    const watchMode = args.includes("--watch");
    await startMode(mode, { watchMode });
    return;
  }

  if (command === "sample-export") {
    const outputFile = await generateSampleExport();
    console.log(`Sample file generated: ${outputFile}`);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  console.error(`Comando invalido: ${command}`);
  console.log("");
  printHelp();
  process.exitCode = 1;
}

run().catch((error) => {
  console.error("Unexpected error:", error);
  process.exitCode = 1;
});
