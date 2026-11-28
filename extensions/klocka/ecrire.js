// Commun aux deux sites : poser un texte dans une case de saisie riche, comme un collage (WhatsApp et Gmail le lisent
// comme si on avait collé), sans jamais appuyer sur Entrée ni sur Envoyer. `remplacer` : le brouillon prend la place de
// ce qui est déjà tapé (WhatsApp) ; sinon il s'écrit en tête, avant la signature et le mail cité (Gmail).
//
// La case se met à jour un instant APRÈS le collage (28 nov. 2026, Jules : le message était bien écrit dans WhatsApp,
// mais l'extension disait « je n'ai pas trouvé la case ») : on laisse passer deux images avant de vérifier, et la
// vérification ne compare que les lettres et les chiffres (WhatsApp change les espaces, les retours et les guillemets).
const lettres = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const deuxImages = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 60))));

globalThis.klockaPoser = async function poser(champ, texte, { remplacer = true } = {}) {
  const selectionner = () => {
    champ.focus();
    const sel = window.getSelection();
    const plage = document.createRange();
    plage.selectNodeContents(champ);
    if (!remplacer) plage.collapse(true);
    sel.removeAllRanges();
    sel.addRange(plage);
  };
  const fin = lettres(texte).slice(-20);
  const pose = () => lettres(champ.innerText).includes(fin);
  const avant = lettres(champ.innerText);
  selectionner();
  const donnees = new DataTransfer();
  donnees.setData("text/plain", texte);
  champ.dispatchEvent(new ClipboardEvent("paste", { clipboardData: donnees, bubbles: true, cancelable: true }));
  await deuxImages();
  // Le site n'a pas pris le collage (la case n'a pas bougé) : on tape le texte à la place de la sélection.
  if (!pose() && lettres(champ.innerText) === avant) {
    selectionner();
    document.execCommand("insertText", false, texte);
    await deuxImages();
  }
  return pose();
};

// Apprendre de ce qu'on envoie vraiment (28 nov. 2026, Jules) : après un brouillon posé, on guette le message que la
// personne envoie elle-même dans la même conversation. S'il vient de ce brouillon (retouché ou non), sa version envoyée
// part à Klocka, qui apprend ainsi sa façon d'écrire. Un message sans rapport avec le brouillon n'est pas gardé ; on
// cesse de guetter après trente minutes, ou si l'on change de conversation.
const mots = (t) => new Set(String(t || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/[^a-z0-9]+/).filter((m) => m.length >= 3));
function proches(a, b) {
  const x = mots(a);
  const y = mots(b);
  if (!x.size || !y.size) return false;
  let communs = 0;
  for (const m of x) if (y.has(m)) communs += 1;
  return communs / Math.min(x.size, y.size) >= 0.4;
}
let guet = null;
globalThis.klockaGuetter = function guetter({ envoyes, memeLieu, brouillon, canal, pour, cle }) {
  guet?.arreter();
  const avant = envoyes().length;
  const fin = Date.now() + 30 * 60 * 1000;
  let attente = null;
  const observer = new MutationObserver(() => {
    clearTimeout(attente);
    attente = setTimeout(() => {
      if (Date.now() > fin || !memeLieu()) { guet?.arreter(); return; }
      const liste = envoyes();
      if (liste.length <= avant) return;
      const texte = liste[liste.length - 1];
      guet?.arreter();
      if (texte && proches(texte, brouillon)) (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({ quoi: "envoye", cle, canal, pour, texte, initial: brouillon }).catch?.(() => {});
    }, 700);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  guet = { arreter: () => { observer.disconnect(); clearTimeout(attente); guet = null; } };
};
