// Le modèle a beau avoir la consigne, un astérisque passe parfois : on nettoie
// à l'affichage. Les listes « - » restent, le gras et les titres deviennent
// du texte, les puces « * » deviennent des tirets.
export const sansMarkdown = (t) => String(t || "")
  .replace(/\r\n?/g, "\n")
  .replace(/^[ \t]*```[^\n]*$/gm, "")
  .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
  .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "")
  .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, l) => l.split("|").map((c) => c.trim()).filter(Boolean).join(" — "))
  .replace(/^([ \t]*)[*+•][ \t]+/gm, "$1- ")
  .replace(/\*\*([^*\n]+)\*\*/g, "$1")
  .replace(/__([^_\n]+)__/g, "$1")
  .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?=[^*\w]|$)/g, "$1$2")
  .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
  .replace(/`([^`\n]+)`/g, "$1")
  .replace(/^[ \t]*(---+|\*\*\*+|___+)[ \t]*$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
