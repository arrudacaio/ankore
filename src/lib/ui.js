import { Chalk } from "chalk";
import Table from "cli-table3";
import figures from "figures";
import { input as promptInput, select } from "@inquirer/prompts";
import supportsColor from "supports-color";
import { highlightWordForCli } from "./text.js";

const colorLevel = supportsColor.stdout ? supportsColor.stdout.level : 0;
const chalk = new Chalk({ level: colorLevel });

const palette = {
  title: colorLevel >= 3 ? chalk.hex("#1D3557") : chalk.blue,
  accent: colorLevel >= 3 ? chalk.hex("#2A9D8F") : chalk.green,
  warning: colorLevel >= 3 ? chalk.hex("#E76F51") : chalk.yellow,
  dim: chalk.dim
};

function resolveIcon(candidates, fallback) {
  for (const candidate of candidates) {
    if (typeof figures[candidate] === "string" && figures[candidate].trim()) {
      return figures[candidate];
    }
  }

  return fallback;
}

const icons = {
  tick: resolveIcon(["tick"], "[ok]"),
  edit: resolveIcon(["pencil", "pencilRight", "pencilLeft", "bullet"], "[edit]"),
  swap: resolveIcon(["play", "arrowRight", "pointerSmall"], "[swap]"),
  cross: resolveIcon(["cross"], "[x]"),
  warning: resolveIcon(["warning"], "[!]"),
  info: resolveIcon(["info"], "[i]"),
  pointer: resolveIcon(["pointer", "pointerSmall"], ">")
};

function getPromptErrorType(error) {
  if (!error) {
    return "unknown";
  }

  if (error.name === "ExitPromptError") {
    return "exit";
  }

  return "unknown";
}

export async function askText(message, defaultValue = "") {
  try {
    return await promptInput({ message, default: defaultValue });
  } catch (error) {
    if (getPromptErrorType(error) === "exit") {
      return null;
    }

    throw error;
  }
}

export async function askCardAction(canSwapSentence) {
  try {
    return await select({
      message: "Escolha uma acao para este card",
      choices: [
        {
          name: `${icons.tick} Aceitar card`,
          value: "accept"
        },
        {
          name: `${icons.swap} Trocar frase sugerida`,
          value: "swap",
          disabled: canSwapSentence ? false : "Sem frases alternativas"
        },
        {
          name: `${icons.edit} Editar frase manualmente`,
          value: "edit"
        },
        {
          name: `${icons.cross} Pular card`,
          value: "skip"
        }
      ]
    });
  } catch (error) {
    if (getPromptErrorType(error) === "exit") {
      return "skip";
    }

    throw error;
  }
}

export async function askWatchIdleAction() {
  try {
    return await select({
      message: "Nenhuma palavra nova detectada. O que deseja fazer?",
      choices: [
        {
          name: `${icons.tick} Gerar arquivo final e encerrar`,
          value: "finish"
        },
        {
          name: `${icons.swap} Continuar aguardando clipboard`,
          value: "wait"
        }
      ]
    });
  } catch (error) {
    if (getPromptErrorType(error) === "exit") {
      return "finish";
    }

    throw error;
  }
}

export function printTitle() {
  console.log("");
  console.log(palette.title.bold("Ankore CLI"));
  console.log(
    palette.dim(
      "Digite uma palavra em ingles por vez. Use /finish para gerar o arquivo de importacao final."
    )
  );
  console.log("");
}

export function printCardPreview({ sentence, word, definition, phonetic }) {
  const width = Math.max((process.stdout.columns || 100) - 14, 46);
  const table = new Table({
    head: [palette.title.bold("Campo"), palette.title.bold("Conteudo")],
    colWidths: [12, width],
    wordWrap: true,
    style: {
      head: [],
      border: []
    }
  });

  table.push(
    ["Front", highlightWordForCli(sentence, word, palette.accent.bold)],
    ["Back", `Meaning: ${definition}\nPhonetic: ${phonetic}`]
  );

  console.log(`${palette.accent.bold(icons.pointer)} Preview do card`);
  console.log(table.toString());
}

export function printInfo(message) {
  console.log(`${palette.accent(icons.info)} ${message}`);
}

export function printSuccess(message) {
  console.log(`${palette.accent(icons.tick)} ${message}`);
}

export function printWarning(message) {
  console.log(`${palette.warning(icons.warning)} ${message}`);
}

export function printDim(message) {
  console.log(palette.dim(message));
}

export function uiTokens() {
  return {
    palette,
    icons
  };
}
