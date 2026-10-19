// Le brouillon de la fiche (19 oct. 2026, Jules : « on modifie tous les champs qu'on veut, ensuite on met OK et
// ça refait toute la pré-analyse, mais pas à chaque champ modifié »). Chaque champ modifié s'ajoute au brouillon
// de son lot ; la fiche l'affiche tout de suite, marqué « saisi à la main » ; OK envoie le brouillon en une fois.

/** Pure : le brouillon augmenté d'une saisie sur un lot. */
export const ajouterAuBrouillon = (brouillons, index, saisie) => ({ ...brouillons, [index]: { ...(brouillons[index] || {}), ...saisie } });

/** Pure : le nombre de champs en attente, tous lots confondus. */
export const champsEnAttente = (brouillons) => Object.values(brouillons || {}).reduce((n, s) => n + Object.keys(s || {}).length, 0);

/** Pure : la valeur d'un champ telle que la fiche la range ({valeur, saisi_a_la_main} ou {absent}). */
function enChamp(champ, v) {
  if (v === "" || v == null) return { absent: true, valeur: null, en_attente: true };
  if (champ === "adresse" && typeof v === "string") return { absent: false, valeur: { rue: v }, saisi_a_la_main: true, en_attente: true };
  const n = typeof v === "string" && /^[\d\s.,]+$/.test(v) ? Number(v.replace(/\s/g, "").replace(",", ".")) : v;
  return { absent: false, valeur: Number.isFinite(n) ? n : v, saisi_a_la_main: true, en_attente: true };
}

/** Pure : le dossier tel que l'écran le montre, brouillon posé sur les lots, sans toucher l'original. */
export function dossierAvecBrouillon(dossier, brouillons) {
  if (!dossier?.lots?.length || !champsEnAttente(brouillons)) return dossier;
  const lots = dossier.lots.map((l, i) => {
    const idx = l.index ?? i;
    const s = brouillons[idx];
    if (!s || !Object.keys(s).length) return l;
    const lot = { ...(l.lot || {}) };
    for (const [champ, v] of Object.entries(s)) lot[champ] = { ...(lot[champ] || {}), ...enChamp(champ, v) };
    return { ...l, lot };
  });
  return { ...dossier, lots };
}
