import "dotenv/config";
import { AppConfig } from "./config/AppConfig.js";
import { GameServer } from "./GameServer.js";

const config = AppConfig.fromEnvironment();
const server = new GameServer(config);

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} alındı, sunucu kapatılıyor...`);
  await server.stop();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.start().catch((error: unknown) => {
  console.error("Sunucu başlatılamadı:", error);
  // tsx watch altında process.exit(), Windows libuv watcher'ını kapanırken
  // yarıda kesebiliyor. Event loop'un doğal biçimde kapanmasına izin veriyoruz.
  process.exitCode = 1;
});
