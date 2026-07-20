import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { resolve } from "node:path";
import express, { type Express } from "express";
import { DropCommandHandler } from "./commands/DropCommandHandler.js";
import type { AppConfig } from "./config/AppConfig.js";
import { GameEventManager } from "./game/GameEventManager.js";
import { KickChatClient } from "./kick/KickChatClient.js";
import { KickEmoteProxy } from "./kick/KickEmoteProxy.js";
import { RealtimeGateway } from "./realtime/RealtimeGateway.js";

interface PkceSession {
  codeVerifier: string;
  expiresAt: number;
}

export class GameServer {
  private readonly app: Express;
  private readonly httpServer: HttpServer;
  private readonly kickChat: KickChatClient;
  private readonly realtime: RealtimeGateway;
  private readonly gameEvents: GameEventManager;
  private readonly commandHandler: DropCommandHandler;
  private readonly emoteProxy = new KickEmoteProxy();
  private readonly pkceSessions = new Map<string, PkceSession>();
  private started = false;

  constructor(private readonly config: AppConfig) {
    this.app = express();
    this.app.set("trust proxy", true);
    this.httpServer = createServer(this.app);
    this.kickChat = new KickChatClient({
      channelSlug: config.channelSlug,
      chatroomId: config.chatroomId,
      pusherUrl: config.pusherUrl,
    });
    this.realtime = new RealtimeGateway(this.httpServer, config.clientOrigin, (event) => {
      void this.kickChat.sendScoreMessage(event.username, event.score);
    });
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

  private getPublicBaseUrl(req: express.Request): string {
    if (process.env.PUBLIC_BASE_URL?.trim()) {
      return process.env.PUBLIC_BASE_URL.trim().replace(/\/+$/, "");
    }
    const hostHeader = (req.headers["x-forwarded-host"] as string) || req.headers.host;
    if (hostHeader && !hostHeader.includes("localhost") && !hostHeader.includes("127.0.0.1")) {
      const proto = (req.headers["x-forwarded-proto"] as string) || (req.secure ? "https" : "http");
      const normalizedProto = hostHeader.includes("onrender.com") ? "https" : proto;
      return `${normalizedProto}://${hostHeader}`;
    }
    if (req.headers.host && !req.headers.host.includes("localhost") && !req.headers.host.includes("127.0.0.1")) {
      return `https://${req.headers.host}`;
    }
    return "https://rellariaparachute.onrender.com";
  }

  private configureHttpRoutes(): void {
    this.app.disable("x-powered-by");

    this.app.get("/auth/kick", (request, response) => {
      const state = randomBytes(16).toString("hex");
      const codeVerifier = randomBytes(32).toString("base64url");
      const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

      this.pkceSessions.set(state, {
        codeVerifier,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const baseUrl = this.getPublicBaseUrl(request);
      const redirectUri = encodeURIComponent(`${baseUrl}/auth/kick/callback`);
      const clientId = encodeURIComponent(this.config.clientId);
      const scopes = [
        "user:read",
        "channel:read",
        "channel:write",
        "chat:write",
        "chat:read",
        "streamkey:read",
        "events:subscribe",
        "moderator:manage",
      ].join(" ");
      const encodedScopes = encodeURIComponent(scopes);
      const authUrl = `https://id.kick.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodedScopes}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;
      response.redirect(authUrl);
    });

    this.app.get("/auth/kick/callback", async (request, response) => {
      const code = request.query.code;
      const state = request.query.state as string;

      if (typeof code !== "string" || !code) {
        response.status(400).send("Giriş kodu (code) alınamadı.");
        return;
      }

      const session = state ? this.pkceSessions.get(state) : null;
      const codeVerifier = session?.codeVerifier || "";

      try {
        const baseUrl = this.getPublicBaseUrl(request);
        const redirectUri = `${baseUrl}/auth/kick/callback`;
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("client_id", this.config.clientId);
        params.append("client_secret", this.config.clientSecret);
        params.append("redirect_uri", redirectUri);
        params.append("code", code);
        if (codeVerifier) {
          params.append("code_verifier", codeVerifier);
        }

        const res = await fetch("https://id.kick.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body: params.toString(),
        });

        if (!res.ok) {
          const errText = await res.text();
          response.status(400).send(`Token alınamadı (${res.status}): ${errText}`);
          return;
        }

        const data = (await res.json()) as { access_token?: string };
        if (data.access_token) {
          process.env.KICK_BOT_TOKEN = data.access_token;
          this.kickChat.setBotToken(data.access_token);
          console.log("[KICK OAUTH 2.1 PKCE] Resmi Access Token başarıyla alındı!");
          response.send(`
            <div style="font-family:sans-serif; text-align:center; padding: 50px;">
              <h1 style="color:#00e701;">✅ Kick OAuth 2.1 Yetkilendirmesi Başarılı!</h1>
              <p style="font-size:18px;">Resmi PKCE Bot Token'ınız alındı ve sunucuda aktif edildi.</p>
              <p style="background:#f0f0f0; padding:15px; border-radius:8px; word-break:break-all; font-family:monospace;">
                KICK_BOT_TOKEN=${data.access_token}
              </p>
            </div>
          `);
        } else {
          response.status(400).send("Access token yanıt içerisinde bulunamadı.");
        }
      } catch (err: any) {
        response.status(500).send(`Token hatası: ${err.message}`);
      }
    });

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
