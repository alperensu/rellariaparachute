import type { ChatMessage } from "../domain/ChatMessage.js";

interface PusherEnvelope {
  event?: string;
  data?: unknown;
  channel?: string;
}

export type KickProtocolEvent =
  | { type: "chat"; message: ChatMessage }
  | { type: "ping" }
  | { type: "subscribed" }
  | { type: "other"; eventName?: string };

function parseNestedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseKickProtocolMessage(rawMessage: string): KickProtocolEvent | null {
  let envelope: PusherEnvelope;
  try {
    envelope = JSON.parse(rawMessage) as PusherEnvelope;
  } catch {
    return null;
  }

  if (envelope.event === "pusher:ping") return { type: "ping" };
  if (envelope.event === "pusher_internal:subscription_succeeded") {
    return { type: "subscribed" };
  }
  if (envelope.event !== "App\\Events\\ChatMessageEvent") {
    return { type: "other", eventName: envelope.event };
  }

  const raw = parseNestedJson(envelope.data) as {
    id?: unknown;
    chatroom_id?: unknown;
    content?: unknown;
    created_at?: unknown;
    sender?: { id?: unknown; username?: unknown };
  } | null;
  if (
    !raw ||
    typeof raw.id !== "string" ||
    typeof raw.chatroom_id !== "number" ||
    typeof raw.content !== "string" ||
    typeof raw.sender?.id !== "number" ||
    typeof raw.sender.username !== "string"
  ) {
    return null;
  }

  return {
    type: "chat",
    message: {
      id: raw.id,
      chatroomId: raw.chatroom_id,
      content: raw.content,
      createdAt: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
      sender: {
        id: raw.sender.id,
        username: raw.sender.username,
      },
    },
  };
}

export function createSubscribeMessage(chatroomId: number): string {
  return JSON.stringify({
    event: "pusher:subscribe",
    data: {
      auth: "",
      channel: `chatrooms.${chatroomId}.v2`,
    },
  });
}

export const PUSHER_PONG_MESSAGE = JSON.stringify({ event: "pusher:pong", data: {} });
export const PUSHER_PING_MESSAGE = JSON.stringify({ event: "pusher:ping", data: {} });
