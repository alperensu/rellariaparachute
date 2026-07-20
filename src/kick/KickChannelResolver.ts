import { execFile } from "node:child_process";
import { promisify } from "node:util";

interface KickChannelResponse {
  id?: number;
  chatroom?: {
    id?: number;
  };
}

const execFileAsync = promisify(execFile);

export class KickChannelResolver {
  constructor(private readonly fetchImplementation: typeof fetch = fetch) {}

  async resolveChatroomId(channelSlug: string): Promise<number> {
    const encodedSlug = encodeURIComponent(channelSlug);
    const urls = [
      `https://kick.com/api/v2/channels/${encodedSlug}/chatroom`,
      `https://kick.com/api/v2/channels/${encodedSlug}`,
    ];

    for (const url of urls) {
      const channel = await this.tryNativeFetch(url);
      const id = this.extractChatroomId(channel);
      if (id) return id;
    }

    // Kick bazı Node.js TLS istemcilerini 403 ile engelliyor. Sistemdeki curl,
    // tarayıcıyla aynı herkese açık endpoint'i okuyabildiği için güvenli fallback'tir.
    for (const url of urls) {
      const channel = await this.tryCurl(url);
      const id = this.extractChatroomId(channel);
      if (id) return id;
    }

    throw new Error(
      "Kick chatroom ID otomatik alınamadı. " +
        `Tarayıcıda https://kick.com/api/v2/channels/${encodedSlug}/chatroom adresini açıp ` +
        "JSON içindeki id değerini KICK_CHATROOM_ID olarak ayarlayın.",
    );
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

  private extractChatroomId(channel: KickChannelResponse | null): number | undefined {
    const id = channel?.chatroom?.id ?? channel?.id;
    return Number.isInteger(id) && id && id > 0 ? id : undefined;
  }
}
