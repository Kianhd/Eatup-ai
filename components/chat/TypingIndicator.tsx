/**
 * Stage-3 · F — "Coach is typing" indicator (animated dots). CSS-driven via placeholder
 * classNames; the integrator supplies the keyframes.
 */

export function TypingIndicator() {
  return (
    <div className="chat-typing" role="status" aria-label="Coach is typing">
      <span className="chat-typing__dot" />
      <span className="chat-typing__dot" />
      <span className="chat-typing__dot" />
    </div>
  );
}
