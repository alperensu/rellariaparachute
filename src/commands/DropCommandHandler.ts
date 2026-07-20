import type { ChatMessage, DropEvent } from "../domain/ChatMessage.js";
import type { ChatMessageSource } from "../kick/KickChatClient.js";

export interface DropEventEmitter {
  emitDrop(event: DropEvent): boolean | void;
}

const DROP_COMMAND = /^\s*!drop(?:\s+([\s\S]*?))?\s*$/iu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;
const KICK_EMOTE_PATTERN = /\[emote:(\d{1,12}):([^\]\r\n]{1,100})\]/iu;
const DEFAULT_CHARACTER = "🙂";

interface ParsedCharacter {
  emoji: string;
  kickEmote?: {
    id: string;
    name: string;
  };
}

export class DropCommandHandler {
  private readonly seenMessageIds = new Set<string>();
  private readonly seenOrder: string[] = [];
  private readonly onMessage = (message: ChatMessage) => this.handleMessage(message);

  constructor(
    private readonly chatSource: ChatMessageSource,
    private readonly dropEmitter: DropEventEmitter,
    private readonly maxRememberedMessages = 2_000,
  ) {}

  start(): void {
    this.chatSource.on("message", this.onMessage);
  }

  stop(): void {
    this.chatSource.off("message", this.onMessage);
  }

  private handleMessage(message: ChatMessage): void {
    const command = message.content.match(DROP_COMMAND);
    if (!command || this.seenMessageIds.has(message.id)) return;
    this.remember(message.id);

    const character = this.findCharacter(command[1]);
    const event: DropEvent = {
      messageId: message.id,
      userId: String(message.sender.id),
      username: message.sender.username.slice(0, 64),
      ...character,
      receivedAt: message.createdAt,
    };
    const accepted = this.dropEmitter.emitDrop(event);
    if (accepted === false) return;
    console.log(`[DROP] ${event.username} oyuna katıldı.`);
  }

  private findCharacter(argument: string | undefined): ParsedCharacter {
    if (!argument) return { emoji: DEFAULT_CHARACTER };

    const kickEmote = argument.match(KICK_EMOTE_PATTERN);
    const kickEmoteIndex = kickEmote?.index ?? Number.POSITIVE_INFINITY;
    const segmenter = new Intl.Segmenter("tr", { granularity: "grapheme" });
    for (const part of segmenter.segment(argument)) {
      if (!EMOJI_PATTERN.test(part.segment)) continue;
      if (part.index < kickEmoteIndex) return { emoji: part.segment };
      break;
    }

    const id = kickEmote?.[1];
    const name = kickEmote?.[2];
    if (id && name) {
      return {
        emoji: DEFAULT_CHARACTER,
        kickEmote: { id, name: name.slice(0, 100) },
      };
    }
    return { emoji: DEFAULT_CHARACTER };
  }

  private remember(messageId: string): void {
    this.seenMessageIds.add(messageId);
    this.seenOrder.push(messageId);
    if (this.seenOrder.length <= this.maxRememberedMessages) return;
    const oldest = this.seenOrder.shift();
    if (oldest) this.seenMessageIds.delete(oldest);
  }
}
