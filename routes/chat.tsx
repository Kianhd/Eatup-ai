/**
 * Stage-3 · F — /chat coach conversation screen.
 *
 * - Loads history via getChat(); day-aware sends via sendChat (client sends local day).
 * - Optimistic user bubble + animated typing indicator while the reply is pending.
 * - Empty state shows 4 starter chips. rate_limit → inline retry (keeps the user's text);
 *   other errors → error bubble with retry. Auto-scrolls unless the user scrolled up.
 *
 * INTEGRATION: route id assumed `/chat`; merge with your real router/layout as needed.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { getChat, sendChat } from "../lib/_stage1";
import { useLocalDay } from "../lib/useLocalDay";
import type { ChatMessageDto, SendChatResult } from "../lib/dto";
import { MessageBubble } from "../components/chat/MessageBubble";
import { Composer } from "../components/chat/Composer";
import { TypingIndicator } from "../components/chat/TypingIndicator";
import { StarterChips } from "../components/chat/StarterChips";
import { useAutoScroll } from "../components/chat/useAutoScroll";

export const Route = createFileRoute("/chat")({
  component: ChatScreen,
});

type HistoryState = "loading" | "ready" | "error";
type SendErrorCode = Extract<SendChatResult, { ok: false }>["code"];
type Failed = { text: string; code: SendErrorCode };

// Stable client-side ids for optimistic bubbles without Math.random (SSR/runtime safe).
let optimisticSeq = 0;

function ChatScreen() {
  const day = useLocalDay();
  const loadChat = useServerFn(getChat);
  const send = useServerFn(sendChat);

  const [history, setHistory] = useState<HistoryState>("loading");
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<Failed | null>(null);

  const { containerRef, onScroll, scrollToBottom } = useAutoScroll(
    `${messages.length}:${sending}`,
  );

  // Load conversation history once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await loadChat({});
        if (!alive) return;
        setMessages(res.messages);
        setHistory("ready");
      } catch {
        if (alive) setHistory("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadChat]);

  const deliver = useCallback(
    async (text: string) => {
      if (!day) return;
      setSending(true);
      setFailed(null);
      scrollToBottom();
      try {
        const res = await send({ data: { message: text, day } });
        if (res.ok) {
          setMessages((m) => [...m, res.reply]);
        } else {
          setFailed({ text, code: res.code });
        }
      } catch {
        setFailed({ text, code: "error" });
      } finally {
        setSending(false);
      }
    },
    [day, send, scrollToBottom],
  );

  const submit = useCallback(
    (text: string) => {
      const optimistic: ChatMessageDto = {
        id: `local-${optimisticSeq++}`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);
      void deliver(text);
    },
    [deliver],
  );

  const isEmpty = history === "ready" && messages.length === 0 && !sending;

  return (
    <main className="chat-screen">
      <header className="chat-screen__header">
        <h1 className="chat-screen__title">Coach</h1>
      </header>

      <div className="chat-screen__log" ref={containerRef} onScroll={onScroll}>
        {history === "loading" && (
          <div className="chat-screen__loading" aria-busy="true">
            <span className="chat-skeleton chat-skeleton--coach" />
            <span className="chat-skeleton chat-skeleton--user" />
            <span className="chat-skeleton chat-skeleton--coach" />
          </div>
        )}

        {history === "error" && (
          <p className="chat-screen__load-error">
            Couldn't load your conversation. Please reopen the coach.
          </p>
        )}

        {isEmpty && <StarterChips onPick={submit} />}

        {history === "ready" &&
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              pending={m.id.startsWith("local-") && sending}
            />
          ))}

        {sending && <TypingIndicator />}

        {failed && (
          <div className={`chat-error chat-error--${failed.code}`} role="alert">
            <p className="chat-error__text">
              {failed.code === "rate_limit"
                ? "Coach is busy right now."
                : failed.code === "unauthorized"
                  ? "Please sign in again to keep chatting."
                  : "Message didn't send."}
            </p>
            {failed.code !== "unauthorized" && (
              <button
                type="button"
                className="chat-error__retry"
                onClick={() => void deliver(failed.text)}
                disabled={sending}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <Composer pending={sending || !day} onSend={submit} />
    </main>
  );
}
