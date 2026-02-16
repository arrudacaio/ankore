import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

function buildFailingChildProcess(message = "command not found") {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  setImmediate(() => {
    const error = new Error(message) as NodeJS.ErrnoException;
    error.code = "ENOENT";
    child.emit("error", error);
  });

  return child;
}

describe("playAudioPreview", () => {
  const originalPlayer = process.env.ANKORE_AUDIO_PLAYER;
  const originalPlayerArgs = process.env.ANKORE_AUDIO_PLAYER_ARGS;

  afterEach(() => {
    spawnMock.mockReset();
    vi.restoreAllMocks();
    process.env.ANKORE_AUDIO_PLAYER = originalPlayer;
    process.env.ANKORE_AUDIO_PLAYER_ARGS = originalPlayerArgs;
  });

  it("tries only CLI players and never desktop openers on Linux", async () => {
    if (process.platform !== "linux") {
      return;
    }

    spawnMock.mockImplementation(() => buildFailingChildProcess());

    const { playAudioPreview } = await import("../../src/lib/audio-player.ts");

    await expect(playAudioPreview("/tmp/preview.mp3")).rejects.toThrow(
      /No working CLI audio player found for preview/i,
    );

    const attemptedCommands = spawnMock.mock.calls.map((call) => call[0]);
    expect(attemptedCommands).toEqual(
      expect.arrayContaining(["ffplay", "mpg123", "mpg321", "play", "cvlc"]),
    );
    expect(
      attemptedCommands.some((command) => String(command).includes("ffmpeg")),
    ).toBe(true);
    expect(attemptedCommands).not.toContain("xdg-open");
  });

  it("prioritizes configured CLI player via environment", async () => {
    process.env.ANKORE_AUDIO_PLAYER = "my-player";
    process.env.ANKORE_AUDIO_PLAYER_ARGS = "--flag --quiet";
    spawnMock.mockImplementation(() => buildFailingChildProcess());

    const { playAudioPreview } = await import("../../src/lib/audio-player.ts");

    await expect(playAudioPreview("/tmp/preview.mp3")).rejects.toThrow();

    expect(spawnMock).toHaveBeenCalled();
    const configuredCall = spawnMock.mock.calls.find(
      (call) => call[0] === "my-player",
    );
    expect(configuredCall).toBeDefined();
    expect(configuredCall?.[1]).toEqual([
      "--flag",
      "--quiet",
      "/tmp/preview.mp3",
    ]);

    const configuredIndex = spawnMock.mock.calls.findIndex(
      (call) => call[0] === "my-player",
    );
    const mpg123Index = spawnMock.mock.calls.findIndex(
      (call) => call[0] === "mpg123",
    );
    if (mpg123Index >= 0) {
      expect(configuredIndex).toBeLessThan(mpg123Index);
    }
  });
});
