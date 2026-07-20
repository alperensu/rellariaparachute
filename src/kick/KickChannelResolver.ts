import { execFile } from "node:child_process";
import { promisify } from "node:util";

interface KickChannelResponse {
  id?: number;
  user_id?: number;
  user?: {
    id?: number;
  };
  chatroom?: {
    id?: number;
  };
}

export interface ResolvedChannel {
  chatroomId: number;
  broadcasterId: number;
}

const execFileAsync = promisify(execFile);

export class KickChannelResolver {
  constructor(private readonly fetchImplementation: typeof fetch = fetch) {}

  async resolveChannel(channelSlug: string): Promise<ResolvedChannel> {
    const encodedSlug = encodeURIComponent(channelSlug);
    const urls = [
      `https://kick.com/api/v2/channels/${encodedSlug}/chatroom`,
      `https://kick.com/api/v2/channels/${encodedSlug}`,
    ];

    for (const url of urls) {
      const channel = await this.tryNativeFetch(url);
      const resolved = this.extractIds(channel);
      if (resolved) return resolved;
    }

    // Kick bazı Node.js TLS istemcilerini 403 ile engelliyor. Sistemdeki curl,
    // tarayıcıyla aynı herkese açık endpoint'i okuyabildiği için güvenli fallback'tir.
    for (const url of urls) {
      const channel = await this.tryCurl(url);
      const resolved = this.extractIds(channel);
      if (resolved) return resolved;
    }

    throw new Error(
      "Kick chatroom ID otomatik alınamadı. " +
        `Tarayıcıda https://kick.com/api/v2/channels/${encodedSlug}/chatroom adresini açıp ` +
        "JSON içindeki id değerini KICK_CHATROOM_ID olarak ayarlayın.",
    );
  }

  /** @deprecated Use resolveChannel instead */
  async resolveChatroomId(channelSlug: string): Promise<number> {
    const result = await this.resolveChannel(channelSlug);
    return result.chatroomId;
  }

  private async tryNativeFetch(url: string): Promise<KickChannelResponse | null> {
    try {
      const response = await this.fetchImplementation(url, {
        headers: {
          accept: "application/json",
          "accept-language": "en-US,en;q=0.9",
          referer: `https://kick.com/${encodeURIComponent(url.split("/").at(-2) ?? "")}`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15_000),
      });
      return response.ok ? ((await response.json()) as KickChannelResponse) : null;
    } catch {
      return null;
    }
  }

  private async tryCurl(url: string): Promise<KickChannelResponse | null> {
    try {
      const executable = process.platform === "win32" ? "curl.exe" : "curl";
      const { stdout } = await execFileAsync(
        executable,
        [
          "-L",
          "--silent",
          "--show-error",
          "--fail",
          "--max-time",
          "15",
          "-H",
          "Accept: application/json",
          "-H",
          "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
          url,
        ],
        { maxBuffer: 2 * 1_024 * 1_024 },
      );
      return JSON.parse(stdout) as KickChannelResponse;
    } catch {
      return null;
    }
  }

  private extractIds(channel: KickChannelResponse | null): ResolvedChannel | undefined {
    const chatroomId = channel?.chatroom?.id ?? channel?.id;
    const broadcasterId = channel?.user_id ?? channel?.user?.id ?? channel?.id;
    if (
      Number.isInteger(chatroomId) && chatroomId && chatroomId > 0 &&
      Number.isInteger(broadcasterId) && broadcasterId && broadcasterId > 0
    ) {
      return { chatroomId, broadcasterId };
    }
    // chatroom id bulundu ama broadcaster id bulunamadıysa yine döndür
    if (Number.isInteger(chatroomId) && chatroomId && chatroomId > 0) {
      return { chatroomId, broadcasterId: chatroomId };
    }
    return undefined;
  }
}
