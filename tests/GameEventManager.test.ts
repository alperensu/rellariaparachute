import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameEventManager, type GameEventOutput } from "../src/game/GameEventManager.js";
import type { DropEvent } from "../src/domain/ChatMessage.js";
import type { PlayerDropEvent } from "../src/domain/GameEvent.js";

function drop(userId: string): DropEvent {
  return {
    messageId: `message-${userId}`,
    userId,
    username: `User${userId}`,
    emoji: "😎",
    receivedAt: new Date().toISOString(),
  };
}

describe("GameEventManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("starts a 60-second event with a safe random target and drops immediately", () => {
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: vi.fn(),
      emitEventEnded: vi.fn(),
    };
    const manager = new GameEventManager(output, { random: () => 0.5 });

    expect(manager.emitDrop(drop("1"))).toBe(true);
    expect(output.emitEventStarted).toHaveBeenCalledOnce();
    expect(output.emitEventStarted).toHaveBeenCalledWith(
      expect.objectContaining({ targetX: 0.5, durationMs: 60_000 }),
    );
    expect(output.emitPlayerDrop).toHaveBeenCalledOnce();
    expect(output.emitPlayerDrop).toHaveBeenCalledWith(
      expect.objectContaining({ score: 0 }),
    );
  });

  it("usually lands alperensu near the bowl center without pinning them to it", () => {
    const emittedPlayers: PlayerDropEvent[] = [];
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: (event) => emittedPlayers.push(event),
      emitEventEnded: vi.fn(),
    };
    const randomValues = [0.5, 0.2, 0.1, 0.8, 0.2, 0.3, 0.4];
    const manager = new GameEventManager(output, {
      random: () => randomValues.shift() ?? 0.5,
    });
    manager.emitDrop({ ...drop("special"), username: "AlPeReNsU" });

    const specialPlayer = emittedPlayers[0];
    expect(specialPlayer?.landingX).not.toBe(0.5);
    expect(specialPlayer?.targetX).toBe(0.5);
    expect(Math.abs(specialPlayer!.landingX - specialPlayer!.targetX)).toBeLessThan(0.045);
    expect(specialPlayer?.score).toBeGreaterThan(0);
  });

  it("does not guarantee alperensu a bowl landing", () => {
    const emittedPlayers: PlayerDropEvent[] = [];
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: (event) => emittedPlayers.push(event),
      emitEventEnded: vi.fn(),
    };
    const randomValues = [0.5, 0.2, 0.95];
    const manager = new GameEventManager(output, {
      random: () => randomValues.shift() ?? 0.5,
    });

    manager.emitDrop({ ...drop("special"), username: "alperensu" });

    expect(Math.abs(emittedPlayers[0]!.landingX - emittedPlayers[0]!.targetX)).toBeGreaterThanOrEqual(0.034);
  });

  it("gives every player a random left or right launch velocity", () => {
    const emittedPlayers: PlayerDropEvent[] = [];
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: (event) => emittedPlayers.push(event),
      emitEventEnded: vi.fn(),
    };
    const manager = new GameEventManager(output, { random: () => 0.25 });

    manager.emitDrop(drop("1"));

    expect(emittedPlayers[0]!.launchVelocityX).toBeLessThan(0);
    expect(Math.abs(emittedPlayers[0]!.launchVelocityX)).toBeGreaterThanOrEqual(0.065);
    expect(Math.abs(emittedPlayers[0]!.launchVelocityX)).toBeLessThanOrEqual(0.14);
  });

  it("assigns a distinct landing position to every player in a crowded event", () => {
    const emittedPlayers: PlayerDropEvent[] = [];
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: (event) => emittedPlayers.push(event),
      emitEventEnded: vi.fn(),
    };
    const manager = new GameEventManager(output, { random: () => 0.5 });

    for (let index = 0; index < 100; index += 1) {
      manager.emitDrop(drop(String(index)));
    }

    expect(emittedPlayers).toHaveLength(100);
    expect(new Set(emittedPlayers.map((player) => player.landingX)).size).toBe(100);
    const sortedLandingX = emittedPlayers.map((player) => player.landingX).sort((a, b) => a - b);
    const minimumGap = Math.min(
      ...sortedLandingX.slice(1).map((position, index) => position - sortedLandingX[index]!),
    );
    expect(minimumGap).toBeGreaterThan(0.007);
  });

  it("allows one jump per user and does not restart during the active minute", () => {
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: vi.fn(),
      emitEventEnded: vi.fn(),
    };
    const manager = new GameEventManager(output);

    expect(manager.emitDrop(drop("1"))).toBe(true);
    expect(manager.emitDrop({ ...drop("1"), messageId: "another-message" })).toBe(false);
    expect(manager.emitDrop(drop("2"))).toBe(true);
    expect(output.emitEventStarted).toHaveBeenCalledTimes(1);
    expect(output.emitPlayerDrop).toHaveBeenCalledTimes(2);
  });

  it("ends after one minute and lets the next command create a new event", () => {
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: vi.fn(),
      emitEventEnded: vi.fn(),
    };
    const manager = new GameEventManager(output);
    manager.emitDrop(drop("1"));

    vi.advanceTimersByTime(60_000);
    expect(output.emitEventEnded).toHaveBeenCalledOnce();

    expect(manager.emitDrop(drop("1"))).toBe(true);
    expect(output.emitEventStarted).toHaveBeenCalledTimes(2);
  });
});
