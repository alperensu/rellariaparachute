const DEFAULT_PUSHER_URL = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679";

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT 1 ile 65535 arasında bir tam sayı olmalıdır.");
  }
  return port;
}

function parseChatroomId(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("KICK_CHATROOM_ID pozitif bir tam sayı olmalıdır.");
  }
  return id;
}

export class AppConfig {
  private constructor(
    public readonly port: number,
    public readonly channelSlug: string,
    public readonly chatroomId: number | undefined,
    public readonly pusherUrl: string,
    public readonly clientOrigin: string,
    public readonly clientId: string,
    public readonly clientSecret: string,
    public readonly publicBaseUrl: string,
  ) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): AppConfig {
    const channelSlug = (environment.KICK_CHANNEL_SLUG ?? "rellaria").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/u.test(channelSlug)) {
      throw new Error("KICK_CHANNEL_SLUG geçerli bir Kick kanal adı olmalıdır.");
    }

    const pusherUrl = environment.KICK_PUSHER_URL?.trim() || DEFAULT_PUSHER_URL;
    if (!pusherUrl.startsWith("wss://")) {
      throw new Error("KICK_PUSHER_URL güvenli bir wss:// adresi olmalıdır.");
    }

    const clientId = environment.KICK_CLIENT_ID?.trim() || "";
    const clientSecret = environment.KICK_CLIENT_SECRET?.trim() || "";
    const publicBaseUrl = (environment.PUBLIC_BASE_URL?.trim() || `http://localhost:${parsePort(environment.PORT)}`).replace(/\/+$/, "");

    return new AppConfig(
      parsePort(environment.PORT),
      channelSlug,
      parseChatroomId(environment.KICK_CHATROOM_ID),
      pusherUrl,
      environment.CLIENT_ORIGIN?.trim() || "*",
      clientId,
      clientSecret,
      publicBaseUrl,
    );
  }
}
