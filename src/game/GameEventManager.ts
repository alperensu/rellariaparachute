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
  private static readonly LANDING_SLOT_COUNT = 120;
  private static readonly SPECIAL_USERNAME = "alperensu";
  private static readonly SPECIAL_CLEARANCE = 0.034;
  private readonly durationMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private activeEvent: GameEventState | null = null;
  private readonly joinedUsers = new Set<string>();
  private availableLandingSlots: number[] = [];
  private occupiedLandingX: number[] = [];
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
    const landingX = this.allocateLandingX(drop.username, this.activeEvent.targetX);
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
    this.availableLandingSlots = [];
    this.occupiedLandingX = [];
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
    this.occupiedLandingX = [];
    this.availableLandingSlots = Array.from(
      { length: GameEventManager.LANDING_SLOT_COUNT },
      (_, index) => 0.04 + ((index + 0.5) / GameEventManager.LANDING_SLOT_COUNT) * 0.92,
    ).filter(
      (slot) => Math.abs(slot - this.activeEvent!.targetX) >= GameEventManager.SPECIAL_CLEARANCE,
    );
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
    this.availableLandingSlots = [];
    this.occupiedLandingX = [];
    this.endTimer = null;
  }

  private allocateLandingX(username: string, targetX: number): number {
    if (username.trim().toLowerCase() === GameEventManager.SPECIAL_USERNAME) {
      this.occupiedLandingX.push(targetX);
      return targetX;
    }

    if (this.availableLandingSlots.length === 0) {
      const anchors = [0.04, targetX, ...this.occupiedLandingX, 0.96]
        .sort((left, right) => left - right);
      let largestGapStart = anchors[0] ?? 0.04;
      let largestGap = 0;
      for (let index = 1; index < anchors.length; index += 1) {
        const start = anchors[index - 1] ?? 0.04;
        const end = anchors[index] ?? 0.96;
        if (end - start > largestGap) {
          largestGap = end - start;
          largestGapStart = start;
        }
      }
      const fallback = largestGapStart + largestGap / 2;
      this.occupiedLandingX.push(fallback);
      return fallback;
    }

    const anchors = [targetX, ...this.occupiedLandingX];
    let bestDistance = -1;
    let bestIndices: number[] = [];
    for (let index = 0; index < this.availableLandingSlots.length; index += 1) {
      const candidate = this.availableLandingSlots[index]!;
      const nearestDistance = anchors.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...anchors.map((occupied) => Math.abs(candidate - occupied)));
      if (nearestDistance > bestDistance + Number.EPSILON) {
        bestDistance = nearestDistance;
        bestIndices = [index];
      } else if (Math.abs(nearestDistance - bestDistance) <= Number.EPSILON) {
        bestIndices.push(index);
      }
    }

    const tieIndex = Math.min(
      bestIndices.length - 1,
      Math.floor(this.random() * bestIndices.length),
    );
    const selectedIndex = bestIndices[Math.max(0, tieIndex)] ?? 0;
    const landingX = this.availableLandingSlots.splice(selectedIndex, 1)[0] ?? 0.5;
    this.occupiedLandingX.push(landingX);
    return landingX;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  private calculateScore(landingX: number, targetX: number): number {
    const targetRadius = 0.056;
    const distance = Math.abs(landingX - targetX);
    if (distance > targetRadius) return 0;
    if (distance === 0) return 100;
    return Math.max(1, Math.round((1 - distance / targetRadius) * 99));
  }
}
