/**
 * Stage-3 · F — Empty-state starter questions. Tapping a chip sends it as the first message.
 */

type Props = { onPick: (text: string) => void };

export const STARTER_QUESTIONS = [
  "What should I eat now?",
  "Can I eat pizza tonight?",
  "Am I eating enough protein?",
  "Why am I not gaining weight?",
] as const;

export function StarterChips({ onPick }: Props) {
  return (
    <div className="chat-starters">
      <p className="chat-starters__lead">Ask your coach anything</p>
      <div className="chat-starters__chips">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            className="chat-starters__chip"
            onClick={() => onPick(q)}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
