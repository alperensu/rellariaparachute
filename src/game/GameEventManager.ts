import { randomUUID } from "node:crypto";
import type { DropEvent } from "../domain/ChatMessage.js";
import type { GameEventState, PlayerDropEvent } from "../domain/GameEvent.js";
import type { DropEventEmitter } from "../commands/DropCommandHandler.js";

export interface GameEventOutput {
  emitEventStarted(event: GameEventState): void;
  emitPlayerDrop(event: PlayerDropEvent): void;
  emitEventEnded(eventId: string): void;
}

export interface GameEventManagerOptions {
  durationMs?: number;
  now?: () => number;
  random?: () => number;
}

export class GameEventManager implements DropEventEmitter {
  private readonly durationMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private activeEvent: GameEventState | null = null;
  private readonly joinedUsers = new Set<string>();
  private endTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly output: GameEventOutput,
    options: GameEventManagerOptions = {},
  ) {
    this.durationMs = options.durationMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  emitDrop(drop: DropEvent): boolean {
    if (!this.activeEvent || Date.parse(this.activeEvent.endsAt) <= this.now()) {
      this.startEvent();
    }
    if (!this.activeEvent || this.joinedUsers.has(drop.userId)) return false;

    this.joinedUsers.add(drop.userId);
    const spawnX = this.clamp(0.06 + this.random() * 0.88, 0.06, 0.94);
    // İniş noktası hedeften bağımsızdır; kaseyi tutturmak yaklaşık %20 olasılıktır.
    const landingX = 0.04 + this.random() * 0.92;
    const score = this.calculateScore(landingX, this.activeEvent.targetX);

    this.output.emitPlayerDrop({
      ...drop,
      eventId: this.activeEvent.id,
      targetX: this.activeEvent.targetX,
      spawnX,
      landingX,
      score,
    });
    return true;
  }

  stop(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.activeEvent = null;
    this.joinedUsers.clear();
  }

  private startEvent(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    const startedAt = this.now();
    this.activeEvent = {
      id: randomUUID(),
      targetX: 0.2 + this.random() * 0.6,
      startedAt: new Date(startedAt).toISOString(),
      endsAt: new Date(startedAt + this.durationMs).toISOString(),
      durationMs: this.durationMs,
    };
    this.joinedUsers.clear();
    this.output.emitEventStarted(this.activeEvent);

    const eventId = this.activeEvent.id;
    this.endTimer = setTimeout(() => this.endEvent(eventId), this.durationMs);
    this.endTimer.unref?.();
  }

  private endEvent(eventId: string): void {
    if (this.activeEvent?.id !== eventId) return;
    this.output.emitEventEnded(eventId);
    this.activeEvent = null;
    this.joinedUsers.clear();
    this.endTimer = null;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  private calculateScore(landingX: number, targetX: number): number {
    const targetRadius = 0.07;
    const distance = Math.abs(landingX - targetX);
    if (distance > targetRadius) return 0;
    if (distance === 0) return 100;
    return Math.max(1, Math.round((1 - distance / targetRadius) * 99));
  }
}
