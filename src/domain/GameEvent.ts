import type { DropEvent } from "./ChatMessage.js";

export interface WindState {
  direction: number; // -1 (left) or 1 (right)
  speed: number;     // e.g. 0.02 to 0.08
  active: boolean;
}

export interface ObstacleData {
  id: string;
  type: "bird" | "balloon" | "zeppelin";
  yRatio: number;    // Normalized height (0.15 - 0.65)
  speed: number;     // Horizontal speed factor
  direction: number; // -1 (left) or 1 (right)
}

export interface GameEventState {
  id: string;
  targetX: number;
  startedAt: string;
  endsAt: string;
  durationMs: number;
  wind?: WindState;
  obstacles?: ObstacleData[];
}

export interface PlayerDropEvent extends DropEvent {
  eventId: string;
  targetX: number;
  spawnX: number;
  landingX: number;
  launchVelocityX: number;
  score: number;
  wind?: WindState;
}
