import { createServer, type Server as HttpServer } from "node:http";
import { resolve } from "node:path";
import express, { type Express } from "express";
import { DropCommandHandler } from "./commands/DropCommandHandler.js";
import type { AppConfig } from "./config/AppConfig.js";
import { GameEventManager } from "./game/GameEventManager.js";
import { KickChatClient } from "./kick/KickChatClient.js";
import { KickEmoteProxy } from "./kick/KickEmoteProxy.js";
import { RealtimeGateway } from "./realtime/RealtimeGateway.js";

export class GameServer {
  private readonly app: Express;
  private readonly httpServer: HttpServer;
  private readonly kickChat: KickChatClient;
  private readonly realtime: RealtimeGateway;
  private readonly gameEvents: GameEventManager;
  private readonly commandHandler: DropCommandHandler;
  private readonly emoteProxy = new KickEmoteProxy();
  private started = false;

  constructor(private readonly config: AppConfig) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.kickChat = new KickChatClient({
      channelSlug: config.channelSlug,
      chatroomId: config.chatroomId,
      pusherUrl: config.pusherUrl,
    });
    this.realtime = new RealtimeGateway(this.httpServer, config.clientOrigin);
    this.gameEvents = new GameEventManager(this.realtime);
    this.commandHandler = new DropCommandHandler(this.kickChat, this.gameEvents);
    this.configureHttpRoutes();
    this.configureKickLogging();
  }

  async start(): Promise<void> {
    if (this.started) return;
    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(this.config.port, "0.0.0.0", () => {
        this.httpServer.off("error", reject);
        resolve();
      });
    });
    this.started = true;
    this.commandHandler.start();

    try {
      await this.kickChat.start();
    } catch (error) {
      await this.stop();
      throw error;
    }

    console.log(`HTTP + Socket.io hazır: http://localhost:${this.config.port}`);
    console.log(`Kick kanalı dinleniyor: ${this.config.channelSlug}`);
  }

  async stop(): Promise<void> {
    this.commandHandler.stop();
    this.gameEvents.stop();
    this.kickChat.stop();
    if (this.started) {
      await this.realtime.close();
    }
    this.started = false;
  }

  private configureHttpRoutes(): void {
    this.app.disable("x-powered-by");
    this.app.get("/api/kick-emotes/:id", (request, response) => {
      void this.emoteProxy.handle(request, response);
    });
    this.app.use(
      "/vendor/phaser",
      express.static(resolve(process.cwd(), "node_modules/phaser/dist"), {
        immutable: true,
        maxAge: "1d",
      }),
    );
    this.app.use(
      express.static(resolve(process.cwd(), "public"), {
        etag: false,
        maxAge: 0,
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        },
      }),
    );

    this.app.get("/api/reload", (_request, response) => {
      this.realtime.broadcastReload();
      response.json({
        ok: true,
        message: "Tüm OBS tarayıcı ekranlarına yenileme (reload) sinyali gönderildi.",
      });
    });

    this.app.get("/api/info", (_request, response) => {
      response.json({
        name: "Rellaria Parachute Drop Backend",
        step: 2,
        socketEvent: "drop",
      });
    });
    this.app.get("/health", (_request, response) => {
      response.json({
        ok: true,
        kick: {
          channel: this.config.channelSlug,
          chatroomId: this.kickChat.chatroomId ?? null,
          status: this.kickChat.status,
        },
        socketClients: "Socket.io aktif",
      });
    });
  }

  private configureKickLogging(): void {
    this.kickChat.on("ready", ({ channelSlug, chatroomId }) => {
      console.log(`[KICK] ${channelSlug} sohbetine bağlandı (chatroom: ${chatroomId}).`);
    });
    this.kickChat.on("disconnected", ({ code, reason }) => {
      console.warn(`[KICK] Bağlantı kapandı (${code}: ${reason || "sebep yok"}), yeniden denenecek.`);
    });
    this.kickChat.on("clientError", (error: Error) => {
      console.error("[KICK] WebSocket hatası:", error.message);
    });
  }
}
