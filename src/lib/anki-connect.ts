import { readFile } from "node:fs/promises";
import { buildExportPath } from "./session-storage.js";

const ANKI_CONNECT_VERSION = 6;
const DEFAULT_ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const DEFAULT_ANKI_CONNECT_PORT = 8765;
const ANKI_CONNECT_TIMEOUT_MS = 2500;
const DEFAULT_ANKI_MODEL_NAME = "Basic";
const DEFAULT_FRONT_FIELD_NAME = "Front";
const DEFAULT_BACK_FIELD_NAME = "Back";

const FRONT_FIELD_CANDIDATES = [
  "Front",
  "Frente",
  "Question",
  "Pergunta",
] as const;

const BACK_FIELD_CANDIDATES = ["Back", "Verso", "Answer", "Resposta"] as const;

export const ANKORE_MINING_DECK_NAME = "ankore-mining";

type AnkiConnectPayload<T> = {
  result: T;
  error: string | null;
};

type AnkiNoteMapping = {
  modelName: string;
  frontFieldName: string;
  backFieldName: string;
};

type AnkiConnectionStatus = {
  version: number;
  endpointUrl: string;
  deckName: string;
  modelName: string;
  frontFieldName: string;
  backFieldName: string;
};

type AnkiConnectFailureKind = "connectivity" | "protocol" | "action";

class AnkiConnectRequestError extends Error {
  readonly kind: AnkiConnectFailureKind;
  readonly action: string;
  readonly url: string;

  constructor({
    kind,
    action,
    url,
    message,
  }: {
    kind: AnkiConnectFailureKind;
    action: string;
    url: string;
    message: string;
  }) {
    super(message);
    this.name = "AnkiConnectRequestError";
    this.kind = kind;
    this.action = action;
    this.url = url;
  }
}

let deckEnsured = false;
let noteMappingCache: AnkiNoteMapping | null = null;
let resolvedAnkiConnectUrl: string | null = null;

function getConfiguredAnkiConnectUrl(): string {
  const configuredUrl = process.env.ANKORE_ANKI_CONNECT_URL;
  if (configuredUrl && configuredUrl.trim()) {
    return configuredUrl.trim();
  }

  return "";
}

function isWslRuntime(): boolean {
  return (
    process.platform === "linux" &&
    Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
  );
}

function isValidIpv4(value: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return false;
  }

  return value
    .split(".")
    .map((part) => Number(part))
    .every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function buildAnkiConnectUrl(host: string): string {
  return `http://${host}:${DEFAULT_ANKI_CONNECT_PORT}`;
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

function parseDefaultGatewayFromProcRoute(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(1)) {
    const columns = line.split(/\s+/);
    if (columns.length < 3) {
      continue;
    }

    const destination = columns[1];
    const gatewayHex = columns[2];
    if (destination !== "00000000" || !/^[0-9A-Fa-f]{8}$/.test(gatewayHex)) {
      continue;
    }

    const bytes = gatewayHex
      .match(/.{2}/g)
      ?.map((chunk) => Number.parseInt(chunk, 16));

    if (
      !bytes ||
      bytes.length !== 4 ||
      bytes.some((byte) => Number.isNaN(byte))
    ) {
      continue;
    }

    const ip = `${bytes[3]}.${bytes[2]}.${bytes[1]}.${bytes[0]}`;
    if (isValidIpv4(ip)) {
      return ip;
    }
  }

  return "";
}

async function resolveWslHostIps(): Promise<string[]> {
  if (!isWslRuntime()) {
    return [];
  }

  const candidates: string[] = [];

  const configuredHostIp = process.env.ANKORE_WSL_HOST_IP;
  if (configuredHostIp && isValidIpv4(configuredHostIp.trim())) {
    candidates.push(configuredHostIp.trim());
  }

  const procRoute = await readTextFile("/proc/net/route");
  const defaultGateway = parseDefaultGatewayFromProcRoute(procRoute);
  if (defaultGateway) {
    candidates.push(defaultGateway);
  }

  const resolvConf = await readTextFile("/etc/resolv.conf");
  const nameserverLine = resolvConf
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("nameserver"));

  if (nameserverLine) {
    const nameserverIp = nameserverLine
      .trim()
      .split(/\s+/)
      .slice(1)
      .find((token) => isValidIpv4(token));

    if (nameserverIp) {
      candidates.push(nameserverIp);
    }
  }

  return candidates.filter(
    (hostIp, index, list) =>
      hostIp.length > 0 && list.indexOf(hostIp) === index,
  );
}

async function buildAnkiConnectUrlCandidates(): Promise<string[]> {
  const candidates: string[] = [];

  const configured = getConfiguredAnkiConnectUrl();
  if (configured) {
    candidates.push(configured);
  }

  candidates.push(DEFAULT_ANKI_CONNECT_URL);

  const wslHostIps = await resolveWslHostIps();
  for (const hostIp of wslHostIps) {
    candidates.push(buildAnkiConnectUrl(hostIp));
  }

  if (isWslRuntime()) {
    candidates.push(buildAnkiConnectUrl("host.docker.internal"));
  }

  return candidates.filter(
    (url, index, list) => url.length > 0 && list.indexOf(url) === index,
  );
}

function parseAnkiConnectPayload<T>(value: unknown): AnkiConnectPayload<T> {
  if (!value || typeof value !== "object") {
    throw new Error("Resposta invalida do AnkiConnect.");
  }

  const payload = value as Record<string, unknown>;
  if (!("error" in payload) || !("result" in payload)) {
    throw new Error("Resposta invalida do AnkiConnect.");
  }

  const error = payload.error;
  if (error !== null && typeof error !== "string") {
    throw new Error("Campo de erro invalido na resposta do AnkiConnect.");
  }

  return {
    error,
    result: payload.result as T,
  };
}

async function invokeAnkiConnectAtUrl<T>({
  action,
  params,
  url,
}: {
  action: string;
  params: Record<string, unknown>;
  url: string;
}): Promise<T> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, ANKI_CONNECT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        params,
        version: ANKI_CONNECT_VERSION,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new AnkiConnectRequestError({
        kind: "protocol",
        action,
        url,
        message: `AnkiConnect retornou HTTP ${response.status} ao executar ${action} em ${url}.`,
      });
    }

    const rawPayload = await parseResponseJson(response, action, url);
    const payload = parsePayloadOrThrow<T>(rawPayload, action, url);

    if (payload.error) {
      throw new AnkiConnectRequestError({
        kind: "action",
        action,
        url,
        message: `AnkiConnect (${action}): ${payload.error}`,
      });
    }

    return payload.result;
  } catch (error) {
    if (error instanceof AnkiConnectRequestError) {
      throw error;
    }

    const details = error instanceof Error ? error.message : String(error);
    throw new AnkiConnectRequestError({
      kind: "connectivity",
      action,
      url,
      message: `Nao foi possivel conectar ao AnkiConnect em ${url}: ${details}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponseJson(
  response: Response,
  action: string,
  url: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AnkiConnectRequestError({
      kind: "protocol",
      action,
      url,
      message: `Resposta invalida do AnkiConnect ao executar ${action} em ${url}.`,
    });
  }
}

function parsePayloadOrThrow<T>(
  rawPayload: unknown,
  action: string,
  url: string,
): AnkiConnectPayload<T> {
  try {
    return parseAnkiConnectPayload<T>(rawPayload);
  } catch (error) {
    throw new AnkiConnectRequestError({
      kind: "protocol",
      action,
      url,
      message:
        error instanceof Error
          ? `${error.message} URL: ${url}`
          : `Resposta invalida do AnkiConnect em ${url}.`,
    });
  }
}

function buildDiscoveryFailureMessage(
  action: string,
  errors: AnkiConnectRequestError[],
): string {
  if (errors.length === 0) {
    return `Falha ao executar ${action} no AnkiConnect.`;
  }

  const attempts = errors.map((error) => `${error.url} (${error.kind})`);
  const firstError = errors[0];
  const hints: string[] = [];

  if (isWslRuntime()) {
    hints.push(
      "WSL detectado: configure o AnkiConnect com webBindAddress=0.0.0.0, libere a porta 8765 no Firewall do Windows e/ou defina ANKORE_ANKI_CONNECT_URL/ANKORE_WSL_HOST_IP.",
    );
  }

  const hintText = hints.length > 0 ? ` Dica: ${hints.join(" ")}` : "";

  return `Falha ao executar ${action} no AnkiConnect. Endpoints testados: ${attempts.join(", ")}. Primeiro erro: ${firstError.message}${hintText}`;
}

async function discoverWorkingAnkiConnectUrl(
  action: string,
  params: Record<string, unknown>,
): Promise<{ result: unknown; url: string }> {
  const candidates = await buildAnkiConnectUrlCandidates();
  const errors: AnkiConnectRequestError[] = [];

  for (const url of candidates) {
    try {
      const result = await invokeAnkiConnectAtUrl({ action, params, url });
      resolvedAnkiConnectUrl = url;
      return {
        result,
        url,
      };
    } catch (error) {
      if (!(error instanceof AnkiConnectRequestError)) {
        throw error;
      }

      if (error.kind === "action") {
        throw error;
      }

      errors.push(error);
    }
  }

  throw new Error(buildDiscoveryFailureMessage(action, errors));
}

async function invokeAnkiConnect<T>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (resolvedAnkiConnectUrl) {
    try {
      return await invokeAnkiConnectAtUrl<T>({
        action,
        params,
        url: resolvedAnkiConnectUrl,
      });
    } catch (error) {
      if (
        error instanceof AnkiConnectRequestError &&
        error.kind === "connectivity"
      ) {
        resolvedAnkiConnectUrl = null;
      } else {
        throw error;
      }
    }
  }

  const discovered = await discoverWorkingAnkiConnectUrl(action, params);
  return discovered.result as T;
}

async function ensureMiningDeck(): Promise<void> {
  if (deckEnsured) {
    return;
  }

  await invokeAnkiConnect<number>("createDeck", {
    deck: ANKORE_MINING_DECK_NAME,
  });

  const deckNames = await invokeAnkiConnect<string[]>("deckNames");
  if (!deckNames.includes(ANKORE_MINING_DECK_NAME)) {
    throw new Error(
      `O deck ${ANKORE_MINING_DECK_NAME} nao apareceu na lista de decks do Anki apos createDeck.`,
    );
  }

  deckEnsured = true;
}

function getConfiguredModelName(): string {
  const configured = process.env.ANKORE_ANKI_MODEL_NAME;
  if (configured && configured.trim()) {
    return configured.trim();
  }

  return DEFAULT_ANKI_MODEL_NAME;
}

function getConfiguredFieldName(envName: string, fallback: string): string {
  const configured = process.env[envName];
  if (configured && configured.trim()) {
    return configured.trim();
  }

  return fallback;
}

function findFieldName(
  availableFieldNames: string[],
  preferredNames: readonly string[],
  fallbackIndex: number,
): string {
  const matchedPreferred = preferredNames.find((candidate) =>
    availableFieldNames.includes(candidate),
  );

  if (matchedPreferred) {
    return matchedPreferred;
  }

  const fallbackByIndex = availableFieldNames[fallbackIndex];
  if (fallbackByIndex) {
    return fallbackByIndex;
  }

  const fallbackFirst = availableFieldNames[0];
  if (fallbackFirst) {
    return fallbackFirst;
  }

  throw new Error("O modelo selecionado nao possui campos utilizaveis.");
}

async function resolveModelName(): Promise<string> {
  const configured = getConfiguredModelName();
  const modelNames = await invokeAnkiConnect<string[]>("modelNames");

  if (modelNames.includes(configured)) {
    return configured;
  }

  const fallbackModelNames = ["Básico", "Basico", "Basic (type in the answer)"];
  const fallback = fallbackModelNames.find((item) => modelNames.includes(item));
  if (fallback) {
    return fallback;
  }

  throw new Error(
    `Modelo do Anki nao encontrado: ${configured}. Configure ANKORE_ANKI_MODEL_NAME com um dos modelos disponiveis: ${modelNames.join(", ")}`,
  );
}

async function resolveNoteMapping(): Promise<AnkiNoteMapping> {
  if (noteMappingCache) {
    return noteMappingCache;
  }

  const modelName = await resolveModelName();
  const availableFieldNames = await invokeAnkiConnect<string[]>(
    "modelFieldNames",
    {
      modelName,
    },
  );

  const preferredFrontFieldName = getConfiguredFieldName(
    "ANKORE_ANKI_FRONT_FIELD",
    DEFAULT_FRONT_FIELD_NAME,
  );
  const preferredBackFieldName = getConfiguredFieldName(
    "ANKORE_ANKI_BACK_FIELD",
    DEFAULT_BACK_FIELD_NAME,
  );

  const frontFieldName = findFieldName(
    availableFieldNames,
    [preferredFrontFieldName, ...FRONT_FIELD_CANDIDATES],
    0,
  );

  let backFieldName = findFieldName(
    availableFieldNames,
    [preferredBackFieldName, ...BACK_FIELD_CANDIDATES],
    1,
  );

  if (backFieldName === frontFieldName) {
    const alternative = availableFieldNames.find(
      (fieldName) => fieldName !== frontFieldName,
    );

    if (!alternative) {
      throw new Error(
        `Nao foi possivel mapear dois campos distintos no modelo ${modelName}.`,
      );
    }

    backFieldName = alternative;
  }

  noteMappingCache = {
    modelName,
    frontFieldName,
    backFieldName,
  };

  return noteMappingCache;
}

async function syncAudioToAnkiMedia(audioFileName: string): Promise<void> {
  const audioPath = buildExportPath(audioFileName);
  const data = await readFile(audioPath);
  const encoded = data.toString("base64");

  await invokeAnkiConnect<string>("storeMediaFile", {
    data: encoded,
    filename: audioFileName,
  });
}

export async function addCardToAnki(card: AnkiExportCard): Promise<number> {
  await ensureMiningDeck();
  const noteMapping = await resolveNoteMapping();

  if (card.audioFileName) {
    await syncAudioToAnkiMedia(card.audioFileName);
  }

  const fields: Record<string, string> = {
    [noteMapping.frontFieldName]: card.front,
    [noteMapping.backFieldName]: card.back,
  };

  return invokeAnkiConnect<number>("addNote", {
    note: {
      deckName: ANKORE_MINING_DECK_NAME,
      modelName: noteMapping.modelName,
      fields,
      options: {
        allowDuplicate: true,
      },
      tags: ["ankore", "mining"],
    },
  });
}

export async function getAnkiConnectStatus(): Promise<AnkiConnectionStatus> {
  const version = await invokeAnkiConnect<number>("version");
  await ensureMiningDeck();
  const noteMapping = await resolveNoteMapping();
  const endpointUrl =
    resolvedAnkiConnectUrl ||
    getConfiguredAnkiConnectUrl() ||
    DEFAULT_ANKI_CONNECT_URL;

  return {
    version,
    endpointUrl,
    deckName: ANKORE_MINING_DECK_NAME,
    modelName: noteMapping.modelName,
    frontFieldName: noteMapping.frontFieldName,
    backFieldName: noteMapping.backFieldName,
  };
}
