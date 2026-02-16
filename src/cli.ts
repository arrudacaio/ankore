#!/usr/bin/env node

import { listModeDetails, startMode } from "./index.js";
import { generateSampleExport } from "./lib/sample-export.js";
import { getAnkiConnectStatus } from "./lib/anki-connect.js";

function printHelp() {
  const modeLines = listModeDetails()
    .map((mode) => `  - ${mode.name}: ${mode.description}`)
    .join("\n");

  console.log("Ankore CLI");
  console.log("");
  console.log("Uso:");
  console.log(
    "  ankore start [modo] [--watch]  Inicia um modo (default: mining)",
  );
  console.log(
    "  ankore sample-export  Gera arquivo de exemplo para importacao",
  );
  console.log("  ankore doctor         Verifica conectividade com AnkiConnect");
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

  if (command === "doctor") {
    try {
      const status = await getAnkiConnectStatus();
      console.log("AnkiConnect OK");
      console.log(`- endpoint: ${status.endpointUrl}`);
      console.log(`- version: ${status.version}`);
      console.log(`- deck: ${status.deckName}`);
      console.log(`- model: ${status.modelName}`);
      console.log(
        `- fields: ${status.frontFieldName} / ${status.backFieldName}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("AnkiConnect falhou");
      console.error(`- motivo: ${reason}`);
      process.exitCode = 1;
    }

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
