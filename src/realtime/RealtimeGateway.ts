import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type { GameEventState, PlayerDropEvent } from "../domain/GameEvent.js";
import type { GameEventOutput } from "../game/GameEventManager.js";

export class RealtimeGateway implements GameEventOutput {
  private readonly io: SocketIOServer;
  private activeEvent: GameEventState | null = null;

  constructor(server: HttpServer, clientOrigin: string) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: clientOrigin === "*" ? "*" : clientOrigin,
        methods: ["GET", "POST"],
      },
    });

    this.io.on("connection", (socket) => {
      console.log(`[SOCKET] Frontend bağlandı: ${socket.id}`);
      if (this.activeEvent && Date.parse(this.activeEvent.endsAt) > Date.now()) {
        socket.emit("game:event-started", this.activeEvent);
      }
      socket.on("disconnect", () => console.log(`[SOCKET] Frontend ayrıldı: ${socket.id}`));
    });
  }

  emitEventStarted(event: GameEventState): void {
    this.activeEvent = event;
    this.io.emit("game:event-started", event);
  }

  emitPlayerDrop(event: PlayerDropEvent): void {
    this.io.emit("drop", event);
  }

  emitEventEnded(eventId: string): void {
    if (this.activeEvent?.id === eventId) this.activeEvent = null;
    this.io.emit("game:event-ended", { eventId });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.io.close(() => resolve()));
  }
}
