import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameEventManager, type GameEventOutput } from "../src/game/GameEventManager.js";
import type { DropEvent } from "../src/domain/ChatMessage.js";

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
      expect.objectContaining({ score: 100 }),
    );
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
