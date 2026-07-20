import type { DropEvent } from "./ChatMessage.js";

export interface GameEventState {
  id: string;
  targetX: number;
  startedAt: string;
  endsAt: string;
  durationMs: number;
}

export interface PlayerDropEvent extends DropEvent {
  eventId: string;
  targetX: number;
  spawnX: number;
  landingX: number;
  score: number;
}
