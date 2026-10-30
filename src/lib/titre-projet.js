// Le titre d'un projet à l'écran, sans l'adresse qu'il répète (30 oct. 2026, Jules : « pourquoi est-ce qu'on saisit
// l'adresse dans le nom alors qu'elle est marquée juste en dessous »). Les projets rentrés avant ce jour portent
// « Nom du local - adresse » : la partie après le tiret part quand l'adresse du projet commence par elle.
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function titreSansAdresse(titre, adresse) {
  const t = String(titre || "");
  const i = t.lastIndexOf(" - ");
  if (i < 0 || !adresse) return t;
  const apres = plat(t.slice(i + 3));
  const nom = t.slice(0, i).trim();
  if (!apres || !nom || !plat(adresse).startsWith(apres)) return t;
  return nom;
}
