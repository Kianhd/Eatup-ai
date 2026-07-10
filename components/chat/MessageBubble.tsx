/**
 * Stage-3 · F — A single chat bubble. Role drives placeholder styling; optional `pending`
 * dims an optimistic user message until the send is confirmed.
 */

import type { ChatMessageDto } from "../../lib/dto";

type Props = {
  message: Pick<ChatMessageDto, "role" | "content">;
  pending?: boolean;
};

export function MessageBubble({ message, pending = false }: Props) {
  const mine = message.role === "user";
  return (
    <div
      className={`chat-bubble chat-bubble--${mine ? "user" : "coach"}${
        pending ? " chat-bubble--pending" : ""
      }`}
    >
      {message.content}
    </div>
  );
}
