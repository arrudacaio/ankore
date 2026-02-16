import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );

  return {
    ...actual,
    readFile: readFileMock,
  };
});

function buildResponse(result: unknown, error: string | null = null): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      error,
      result,
    }),
  } as Response;
}

function readBody(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const call = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(call[1].body)) as Record<string, unknown>;
}

describe("anki connect", () => {
  const originalAnkiConnectUrl = process.env.ANKORE_ANKI_CONNECT_URL;
  const originalWslDistro = process.env.WSL_DISTRO_NAME;
  const originalWslInterop = process.env.WSL_INTEROP;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    readFileMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.ANKORE_ANKI_CONNECT_URL;
    delete process.env.WSL_DISTRO_NAME;
    delete process.env.WSL_INTEROP;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.ANKORE_ANKI_CONNECT_URL = originalAnkiConnectUrl;
    process.env.WSL_DISTRO_NAME = originalWslDistro;
    process.env.WSL_INTEROP = originalWslInterop;
  });

  it("creates deck, stores audio and adds note", async () => {
    readFileMock.mockResolvedValue(Buffer.from("audio-data"));
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(
        buildResponse(["Basic", "Basic (and reversed card)"]),
      )
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]))
      .mockResolvedValueOnce(buildResponse(null))
      .mockResolvedValueOnce(buildResponse(1200));

    const { addCardToAnki, ANKORE_MINING_DECK_NAME } =
      await import("../../src/lib/anki-connect.ts");

    const noteId = await addCardToAnki({
      front: "Sentence [sound:ankore-1.mp3]",
      back: "Meaning",
      audioFileName: "ankore-1.mp3",
    });

    expect(noteId).toBe(1200);
    expect(readFileMock).toHaveBeenCalledWith(
      path.join("session-output", "exports", "ankore-1.mp3"),
    );

    const createDeckBody = readBody(fetchMock, 0);
    const deckNamesBody = readBody(fetchMock, 1);
    const modelNamesBody = readBody(fetchMock, 2);
    const modelFieldNamesBody = readBody(fetchMock, 3);
    const storeMediaBody = readBody(fetchMock, 4);
    const addNoteBody = readBody(fetchMock, 5);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8765");
    expect(createDeckBody).toMatchObject({
      action: "createDeck",
      params: {
        deck: ANKORE_MINING_DECK_NAME,
      },
      version: 6,
    });
    expect(storeMediaBody).toMatchObject({
      action: "storeMediaFile",
      params: {
        filename: "ankore-1.mp3",
        data: Buffer.from("audio-data").toString("base64"),
      },
      version: 6,
    });
    expect(addNoteBody).toMatchObject({
      action: "addNote",
      params: {
        note: {
          deckName: ANKORE_MINING_DECK_NAME,
          modelName: "Basic",
          fields: {
            Front: "Sentence [sound:ankore-1.mp3]",
            Back: "Meaning",
          },
        },
      },
      version: 6,
    });
    expect(modelNamesBody).toMatchObject({
      action: "modelNames",
      version: 6,
    });
    expect(deckNamesBody).toMatchObject({
      action: "deckNames",
      version: 6,
    });
    expect(modelFieldNamesBody).toMatchObject({
      action: "modelFieldNames",
      params: {
        modelName: "Basic",
      },
      version: 6,
    });
  });

  it("adds note without media upload when audio is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Basic"]))
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]))
      .mockResolvedValueOnce(buildResponse(80));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    const noteId = await addCardToAnki({
      front: "Front",
      back: "Back",
    });

    expect(noteId).toBe(80);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(readBody(fetchMock, 0).action).toBe("createDeck");
    expect(readBody(fetchMock, 1).action).toBe("deckNames");
    expect(readBody(fetchMock, 2).action).toBe("modelNames");
    expect(readBody(fetchMock, 3).action).toBe("modelFieldNames");
    expect(readBody(fetchMock, 4).action).toBe("addNote");
  });

  it("reuses deck creation for multiple notes in same session", async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Basic"]))
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]))
      .mockResolvedValueOnce(buildResponse(10))
      .mockResolvedValueOnce(buildResponse(11));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await addCardToAnki({ front: "A", back: "B" });
    await addCardToAnki({ front: "C", back: "D" });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(readBody(fetchMock, 0).action).toBe("createDeck");
    expect(readBody(fetchMock, 1).action).toBe("deckNames");
    expect(readBody(fetchMock, 2).action).toBe("modelNames");
    expect(readBody(fetchMock, 3).action).toBe("modelFieldNames");
    expect(readBody(fetchMock, 4).action).toBe("addNote");
    expect(readBody(fetchMock, 5).action).toBe("addNote");
  });

  it("uses configured AnkiConnect URL when provided", async () => {
    process.env.ANKORE_ANKI_CONNECT_URL = "http://localhost:8876";
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Basic"]))
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]))
      .mockResolvedValueOnce(buildResponse(99));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await addCardToAnki({ front: "Front", back: "Back" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8876");
  });

  it("throws when AnkiConnect returns action error", async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(null, "model list unavailable"));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await expect(
      addCardToAnki({ front: "Front", back: "Back" }),
    ).rejects.toThrow(/model list unavailable/i);
  });

  it("maps Portuguese basic model fields automatically", async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Básico"]))
      .mockResolvedValueOnce(buildResponse(["Frente", "Verso"]))
      .mockResolvedValueOnce(buildResponse(500));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await addCardToAnki({
      front: "Front text",
      back: "Back text",
    });

    expect(readBody(fetchMock, 4)).toMatchObject({
      action: "addNote",
      params: {
        note: {
          modelName: "Básico",
          fields: {
            Frente: "Front text",
            Verso: "Back text",
          },
        },
      },
    });
  });

  it("throws when deck is not visible after createDeck", async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["Default"]))
      .mockResolvedValueOnce(buildResponse(["Basic"]))
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await expect(
      addCardToAnki({ front: "Front", back: "Back" }),
    ).rejects.toThrow(/nao apareceu na lista de decks/i);
  });

  it("returns connection status with resolved mapping", async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse(6))
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Básico"]))
      .mockResolvedValueOnce(buildResponse(["Frente", "Verso"]));

    const { getAnkiConnectStatus } =
      await import("../../src/lib/anki-connect.ts");

    await expect(getAnkiConnectStatus()).resolves.toEqual({
      version: 6,
      endpointUrl: "http://127.0.0.1:8765",
      deckName: "ankore-mining",
      modelName: "Básico",
      frontFieldName: "Frente",
      backFieldName: "Verso",
    });

    expect(readBody(fetchMock, 0).action).toBe("version");
  });

  it("falls back to Windows host endpoint when running in WSL", async () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    readFileMock.mockResolvedValue("nameserver 172.20.16.1\n");

    fetchMock
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1"))
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Basic"]))
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]))
      .mockResolvedValueOnce(buildResponse(700));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await expect(addCardToAnki({ front: "Front", back: "Back" })).resolves.toBe(
      700,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8765");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://172.20.16.1:8765");
  });

  it("prefers default route gateway over DNS nameserver in WSL", async () => {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    readFileMock.mockImplementation(async (filePath: string) => {
      if (filePath === "/proc/net/route") {
        return [
          "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT",
          "eth0\t00000000\t0100000A\t0003\t0\t0\t0\t00000000\t0\t0\t0",
        ].join("\n");
      }

      if (filePath === "/etc/resolv.conf") {
        return "nameserver 10.255.255.254\n";
      }

      return "";
    });

    fetchMock
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1"))
      .mockResolvedValueOnce(buildResponse(1))
      .mockResolvedValueOnce(buildResponse(["ankore-mining", "Default"]))
      .mockResolvedValueOnce(buildResponse(["Basic"]))
      .mockResolvedValueOnce(buildResponse(["Front", "Back"]))
      .mockResolvedValueOnce(buildResponse(701));

    const { addCardToAnki } = await import("../../src/lib/anki-connect.ts");

    await expect(addCardToAnki({ front: "Front", back: "Back" })).resolves.toBe(
      701,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8765");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://10.0.0.1:8765");
  });
});
