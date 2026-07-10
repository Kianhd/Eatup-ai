/**
 * Stage-3 · F — Chat composer. Auto-growing textarea, Enter to send / Shift+Enter for a
 * newline, send disabled while a message is pending or the input is empty.
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  pending: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
};

const MAX_HEIGHT_PX = 160;

export function Composer({ pending, onSend, placeholder = "Message your coach…" }: Props) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: reset then grow to content, capped.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !pending;

  const send = () => {
    const text = value.trim();
    if (!text || pending) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="chat-composer">
      <textarea
        ref={taRef}
        className="chat-composer__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        rows={1}
        aria-label="Message your coach"
      />
      <button
        type="button"
        className="chat-composer__send"
        onClick={send}
        disabled={!canSend}
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
}
