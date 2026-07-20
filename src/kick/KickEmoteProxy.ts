import type { Request, Response } from "express";

interface CachedEmote {
  body: Buffer;
  contentType: string;
}

const MAX_EMOTE_BYTES = 2 * 1_024 * 1_024;
const MAX_CACHE_ENTRIES = 256;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/gif",
  "image/webp",
  "image/jpeg",
  "image/avif",
]);

export class KickEmoteProxy {
  private readonly cache = new Map<string, CachedEmote>();

  async handle(request: Request, response: Response): Promise<void> {
    const id = request.params.id;
    if (typeof id !== "string" || !/^\d{1,12}$/.test(id)) {
      response.status(400).json({ error: "Geçersiz Kick emote kimliği." });
      return;
    }

    const cached = this.cache.get(id);
    if (cached) {
      this.send(response, cached);
      return;
    }

    try {
      const upstream = await fetch(`https://files.kick.com/emotes/${id}/fullsize`, {
        headers: { accept: "image/avif,image/webp,image/png,image/gif,image/*" },
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
      const declaredSize = Number(upstream.headers.get("content-length") ?? 0);
      if (
        !upstream.ok ||
        !contentType ||
        !ALLOWED_CONTENT_TYPES.has(contentType) ||
        (declaredSize > 0 && declaredSize > MAX_EMOTE_BYTES)
      ) {
        response.status(404).json({ error: "Kick emote bulunamadı." });
        return;
      }

      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.byteLength > MAX_EMOTE_BYTES) {
        response.status(413).json({ error: "Kick emote dosyası çok büyük." });
        return;
      }

      const emote = { body, contentType };
      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(id, emote);
      this.send(response, emote);
    } catch {
      response.status(502).json({ error: "Kick emote şu anda yüklenemedi." });
    }
  }

  private send(response: Response, emote: CachedEmote): void {
    response.set({
      "Content-Type": emote.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    response.send(emote.body);
  }
}
