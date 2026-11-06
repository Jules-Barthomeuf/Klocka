// Title that reveals letter by letter (blur + fade + rise). parts: [{ text, serif }]
export default function LetterTitle({ parts, show, className = "" }) {
  let ci = 0;
  const letter = (ch) => {
    const d = ci++ * 9;
    return (
      <span
        key={ci}
        className="inline-block"
        style={{
          opacity: show ? 1 : 0,
          filter: show ? "blur(0)" : "blur(12px)",
          transform: show ? "none" : "translateY(10px)",
          transition: `opacity 600ms var(--k-ease) ${d}ms, filter 600ms var(--k-ease) ${d}ms, transform 600ms var(--k-ease) ${d}ms`,
        }}
      >
        {ch}
      </span>
    );
  };

  return (
    <h2 className={`k-h2 ${className}`} aria-label={parts.map((p) => p.text).join("")}>
      {parts.map((part, pi) => (
        <span key={pi} className={part.serif ? "k-serif" : ""} aria-hidden="true">
          {part.text.split(" ").filter(Boolean).map((word, wi) => (
            <span key={wi}>
              <span className="inline-block whitespace-nowrap">{[...word].map(letter)}</span>{" "}
            </span>
          ))}
        </span>
      ))}
    </h2>
  );
}
