import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import WebSocket, { type RawData } from "ws";
import type { ChatMessage } from "../domain/ChatMessage.js";
import { KickChannelResolver } from "./KickChannelResolver.js";
import {
  createSubscribeMessage,
  parseKickProtocolMessage,
  PUSHER_PING_MESSAGE,
  PUSHER_PONG_MESSAGE,
} from "./KickProtocol.js";

const execFileAsync = promisify(execFile);

export type KickConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "stopped";

export interface KickChatClientOptions {
  channelSlug: string;
  chatroomId?: number;
  pusherUrl: string;
  channelResolver?: KickChannelResolver;
}

export interface ChatMessageSource {
  on(event: "message", listener: (message: ChatMessage) => void): this;
  off(event: "message", listener: (message: ChatMessage) => void): this;
}

export class KickChatClient extends EventEmitter implements ChatMessageSource {
  private readonly channelResolver: KickChannelResolver;
  private resolvedChatroomId?: number;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopping = false;
  private connectionStatus: KickConnectionStatus = "idle";

  constructor(private readonly options: KickChatClientOptions) {
    super();
    this.resolvedChatroomId = options.chatroomId;
    this.channelResolver = options.channelResolver ?? new KickChannelResolver();
  }

  get status(): KickConnectionStatus {
    return this.connectionStatus;
  }

  get chatroomId(): number | undefined {
    return this.resolvedChatroomId;
  }

  private cachedToken: { token: string; expiresAt: number } | null = null;

  async sendScoreMessage(username: string, score: number): Promise<boolean> {
    const message = score === 100
      ? `@${username} TEBRİKLER! Tam 100 PUAN aldınız! 🎯🪂`
      : `@${username} ${score} puan aldınız! 🪂`;

    console.log(`[CHAT BILDIRIMI] ${message}`);

    const chatroomId = this.resolvedChatroomId;
    if (!chatroomId) return false;

    const token = await this.getOrFetchAccessToken();

    const endpoints = [
      {
        url: `https://kick.com/api/v2/chatrooms/${chatroomId}/messages`,
        body: JSON.stringify({ content: message, type: "message" }),
      },
      {
        url: `https://kick.com/api/v2/chatrooms/${chatroomId}/messages`,
        body: JSON.stringify({ content: message, type: "bot" }),
      },
      {
        url: "https://kick.com/api/v2/messages/send",
        body: JSON.stringify({ chatroom_id: chatroomId, content: message, type: "message" }),
      },
      {
        url: "https://api.kick.com/public/v1/chat",
        body: JSON.stringify({ broadcaster_user_id: chatroomId, content: message, type: "user" }),
      },
    ];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Referer": `https://kick.com/${encodeURIComponent(this.options.channelSlug)}`,
      "Origin": "https://kick.com",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    for (const ep of endpoints) {
      const ok = await this.tryPostFetch(ep.url, headers, ep.body);
      if (ok) return true;
    }

    for (const ep of endpoints) {
      const ok = await this.tryPostCurl(ep.url, headers, ep.body);
      if (ok) return true;
    }

    return false;
  }

  private async tryPostFetch(url: string, headers: Record<string, string>, body: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const responseText = await response.text();
      if (response.ok) {
        console.log(`[KICK CHAT] Mesaj gönderildi: ${url}`);
        return true;
      } else {
        console.warn(`[KICK CHAT FETCH HATA ${response.status}] ${url} -> ${responseText.slice(0, 300)}`);
      }
    } catch (err: any) {
      console.warn(`[KICK CHAT FETCH EXCEPTION] ${url} -> ${err.message}`);
    }
    return false;
  }

  private async tryPostCurl(url: string, headers: Record<string, string>, body: string): Promise<boolean> {
    try {
      const executable = process.platform === "win32" ? "curl.exe" : "curl";
      const headerArgs: string[] = [];
      for (const [key, value] of Object.entries(headers)) {
        headerArgs.push("-H", `${key}: ${value}`);
      }
      const { stdout } = await execFileAsync(
        executable,
        [
          "-X", "POST",
          "-L",
          "--silent",
          "--show-error",
          "--max-time", "10",
          ...headerArgs,
          "-d", body,
          url,
        ],
        { maxBuffer: 1024 * 1024 },
      );
      console.log(`[KICK CHAT cURL YANIT] ${url} -> ${stdout.slice(0, 300)}`);
      if (stdout.includes('"status":') || stdout.includes('"message":') || stdout.includes('"id":') || stdout.includes('"content":')) {
        return true;
      }
    } catch (err: any) {
      console.warn(`[KICK CHAT cURL EXCEPTION] ${url} -> ${err.message}`);
    }
    return false;
  }

  private async getOrFetchAccessToken(): Promise<string | null> {
    if (process.env.KICK_BOT_TOKEN?.trim()) {
      return process.env.KICK_BOT_TOKEN.trim();
    }

    const clientId = process.env.KICK_CLIENT_ID?.trim();
    const clientSecret = process.env.KICK_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;

    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    try {
      const params = new URLSearchParams();
      params.append("grant_type", "client_credentials");
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("scope", "chat:write");

      const response = await fetch("https://id.kick.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body: params.toString(),
      });

      if (!response.ok) return null;
      const data = (await response.json()) as { access_token?: string; expires_in?: number };
      if (data.access_token) {
        const expiresInMs = (data.expires_in ?? 3600) * 1000 - 60000;
        this.cachedToken = {
          token: data.access_token,
          expiresAt: Date.now() + expiresInMs,
        };
        return data.access_token;
      }
    } catch (error) {
      console.warn("[KICK OAUTH] Client Credentials token otomatik alınamadı:", error);
    }
    return null;
  }

  async start(): Promise<void> {
    if (this.connectionStatus !== "idle" && this.connectionStatus !== "stopped") return;
    this.stopping = false;
    this.connectionStatus = "connecting";
    this.resolvedChatroomId ??= await this.channelResolver.resolveChatroomId(
      this.options.channelSlug,
    );
    this.openSocket();
  }

  stop(): void {
    this.stopping = true;
    this.connectionStatus = "stopped";
    this.clearTimers();
    const activeSocket = this.socket;
    this.socket = null;
    if (activeSocket) {
      activeSocket.removeAllListeners();
      // ws, bağlantı kurulurken terminate edilirse asenkron bir error olayı üretir.
      activeSocket.on("error", () => undefined);
      if (activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.close(1000, "server shutdown");
      } else if (activeSocket.readyState !== WebSocket.CLOSED) {
        activeSocket.terminate();
      }
    }
  }

  private openSocket(): void {
    if (this.stopping || !this.resolvedChatroomId) return;

    const url = new URL(this.options.pusherUrl);
    url.searchParams.set("protocol", "7");
    url.searchParams.set("client", "js");
    url.searchParams.set("version", "8.4.0");
    url.searchParams.set("flash", "false");

    this.socket = new WebSocket(url);
    this.socket.on("open", () => {
      this.socket?.send(createSubscribeMessage(this.resolvedChatroomId!));
      this.startHeartbeat();
    });
    this.socket.on("message", (data: RawData) => this.handleMessage(data.toString()));
    this.socket.on("error", (error) => this.emit("clientError", error));
    this.socket.on("close", (code, reason) => {
      this.clearHeartbeat();
      this.socket = null;
      this.emit("disconnected", { code, reason: reason.toString() });
      if (!this.stopping) this.scheduleReconnect();
    });
  }

  private handleMessage(rawMessage: string): void {
    const event = parseKickProtocolMessage(rawMessage);
    if (!event) return;

    if (event.type === "ping") {
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(PUSHER_PONG_MESSAGE);
      return;
    }
    if (event.type === "subscribed") {
      this.connectionStatus = "connected";
      this.reconnectAttempt = 0;
      this.emit("ready", {
        channelSlug: this.options.channelSlug,
        chatroomId: this.resolvedChatroomId,
      });
      return;
    }
    if (event.type === "chat") this.emit("message", event.message);
    if (event.type === "other" && event.eventName === "pusher:error") {
      this.emit("clientError", new Error("Pusher aboneliği hata döndürdü."));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    this.connectionStatus = "reconnecting";
    this.reconnectAttempt += 1;
    const backoff = Math.min(1_000 * 2 ** (this.reconnectAttempt - 1), 30_000);
    const delay = backoff + Math.floor(Math.random() * 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(PUSHER_PING_MESSAGE);
    }, 30_000);
    this.heartbeatTimer.unref();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
