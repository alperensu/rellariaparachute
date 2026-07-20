import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { DropCommandHandler, type DropEventEmitter } from "../src/commands/DropCommandHandler.js";
import type { ChatMessage } from "../src/domain/ChatMessage.js";
import type { ChatMessageSource } from "../src/kick/KickChatClient.js";

class FakeChatSource extends EventEmitter implements ChatMessageSource {
  send(message: ChatMessage): void {
    this.emit("message", message);
  }
}

function message(content: string, id = "message-1"): ChatMessage {
  return {
    id,
    chatroomId: 10,
    content,
    createdAt: "2026-07-20T12:00:00.000Z",
    sender: { id: 42, username: "RellariaFan" },
  };
}

describe("DropCommandHandler", () => {
  it("emits a drop event for !drop", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop } as DropEventEmitter);
    handler.start();

    chat.send(message("!drop"));

    expect(emitDrop).toHaveBeenCalledWith({
      messageId: "message-1",
      userId: "42",
      username: "RellariaFan",
      emoji: "🙂",
      receivedAt: "2026-07-20T12:00:00.000Z",
    });
  });

  it("uses the first emoji after !drop as the character", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop });
    handler.start();

    chat.send(message("!drop merhaba 🦄 😎"));

    expect(emitDrop).toHaveBeenCalledWith(expect.objectContaining({ emoji: "🦄" }));
  });

  it("uses a native Kick emote after !drop as the character", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop });
    handler.start();

    chat.send(message("!drop [emote:2569312:rellaria200iq]"));

    expect(emitDrop).toHaveBeenCalledWith(expect.objectContaining({
      emoji: "🙂",
      kickEmote: { id: "2569312", name: "rellaria200iq" },
    }));
  });

  it("uses whichever supported character appears first", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop });
    handler.start();

    chat.send(message("!drop 🐸 [emote:2569312:rellaria200iq]"));

    expect(emitDrop).toHaveBeenCalledWith(expect.objectContaining({ emoji: "🐸" }));
    expect(emitDrop.mock.calls[0]?.[0]).not.toHaveProperty("kickEmote");
  });

  it("accepts !atla as an exact, case-insensitive alias", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop });
    handler.start();

    chat.send(message("!ATLA 🐱", "atla-1"));
    chat.send(message("!atlama", "atla-2"));

    expect(emitDrop).toHaveBeenCalledTimes(1);
    expect(emitDrop).toHaveBeenCalledWith(expect.objectContaining({ emoji: "🐱" }));
  });

  it("accepts case and optional arguments but rejects similar text", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop });
    handler.start();

    chat.send(message("  !DROP 😎  ", "1"));
    chat.send(message("!dropper", "2"));
    chat.send(message("hello !drop", "3"));

    expect(emitDrop).toHaveBeenCalledTimes(1);
  });

  it("does not emit the same Kick message twice", () => {
    const chat = new FakeChatSource();
    const emitDrop = vi.fn();
    const handler = new DropCommandHandler(chat, { emitDrop });
    handler.start();

    chat.send(message("!drop"));
    chat.send(message("!drop"));

    expect(emitDrop).toHaveBeenCalledTimes(1);
  });
});
