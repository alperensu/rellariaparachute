import { describe, expect, it } from "vitest";
import { createSubscribeMessage, parseKickProtocolMessage } from "../src/kick/KickProtocol.js";

describe("Kick Pusher protocol", () => {
  it("creates the correct chatroom v2 subscription", () => {
    expect(JSON.parse(createSubscribeMessage(123))).toEqual({
      event: "pusher:subscribe",
      data: { auth: "", channel: "chatrooms.123.v2" },
    });
  });

  it("parses a nested Kick chat event", () => {
    const raw = JSON.stringify({
      event: "App\\Events\\ChatMessageEvent",
      channel: "chatrooms.123.v2",
      data: JSON.stringify({
        id: "abc",
        chatroom_id: 123,
        content: "!drop",
        created_at: "2026-07-20T12:00:00Z",
        sender: { id: 55, username: "Viewer" },
      }),
    });

    expect(parseKickProtocolMessage(raw)).toEqual({
      type: "chat",
      message: {
        id: "abc",
        chatroomId: 123,
        content: "!drop",
        createdAt: "2026-07-20T12:00:00Z",
        sender: { id: 55, username: "Viewer" },
      },
    });
  });

  it("recognizes Pusher heartbeat events", () => {
    expect(parseKickProtocolMessage('{"event":"pusher:ping","data":{}}')).toEqual({ type: "ping" });
  });
});
