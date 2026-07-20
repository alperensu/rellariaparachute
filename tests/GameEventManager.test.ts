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

  it("always lands alperensu in the exact center of the bowl", () => {
    const emittedPlayers: PlayerDropEvent[] = [];
    const output: GameEventOutput = {
      emitEventStarted: vi.fn(),
      emitPlayerDrop: (event) => emittedPlayers.push(event),
      emitEventEnded: vi.fn(),
    };
    const manager = new GameEventManager(output, { random: () => 0.5 });

    for (let index = 0; index < 12; index += 1) {
      manager.emitDrop(drop(String(index)));
    }
    manager.emitDrop({ ...drop("special"), username: "AlPeReNsU" });

    const specialPlayer = emittedPlayers.at(-1);
    expect(specialPlayer?.landingX).toBe(0.5);
    expect(specialPlayer?.targetX).toBe(0.5);
    expect(specialPlayer?.score).toBe(100);
    expect(
      emittedPlayers.slice(0, -1).every((player) => Math.abs(player.landingX - 0.5) >= 0.034),
    ).toBe(true);
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
