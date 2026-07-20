export interface ChatMessage {
  id: string;
  chatroomId: number;
  content: string;
  createdAt: string;
  sender: {
    id: number;
    username: string;
  };
}

export interface DropEvent {
  messageId: string;
  userId: string;
  username: string;
  emoji: string;
  kickEmote?: {
    id: string;
    name: string;
  };
  receivedAt: string;
}
