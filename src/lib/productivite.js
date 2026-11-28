// Productivité (28 nov. 2026, Jules : « un onglet juste pour moi : voir sa journée, préparer les heures des pauses,
// puis un timer jusqu'à chaque pause » ; « aussi pouvoir dire les temps de pause qu'on veut »). Pur : la journée
// enregistrée sur le compte (champ `productivite`), et où l'on en est à une heure donnée.

export const PLANNING_DEFAUT = Object.freeze({
  debut: "09:00",
  fin: "19:00",
  pauses: [
    { heure: "10:30", duree: 10 },
    { heure: "13:00", duree: 60 },
    { heure: "16:00", duree: 15 },
  ],
  // Le bloqueur (28 nov. 2026, Jules : « un module qui va bloquer par exemple YouTube pendant ces temps de travail ») :
  // l'extension de extensions/bloqueur-productivite lit ces sites et les ferme pendant le travail, jamais en pause.
  blocage: true,
  sites: ["youtube.com"],
});

/** « https://www.YouTube.com/watch?v=… » en « youtube.com » ; null si ce n'est pas un nom de site. */
export function nomDeSite(brut) {
  const s = String(brut || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:\s]/)[0];
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : null;
}

const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** « 09:30 » en minutes depuis minuit ; null si ce n'est pas une heure. */
export const enMinutes = (h) => {
  const m = HEURE.exec(String(h || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Des minutes depuis minuit en « 09:30 ». */
export const enHeure = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Une journée sûre : début avant fin, pauses rangées par heure, chacune entre 1 et 240 minutes, sans doublon
 * d'heure. Ce qui manque ou ne se lit pas retombe sur la journée par défaut.
 */
export function normaliserPlanning(brut) {
  const b = brut && typeof brut === "object" ? brut : {};
  let debut = enMinutes(b.debut) ?? enMinutes(PLANNING_DEFAUT.debut);
  let fin = enMinutes(b.fin) ?? enMinutes(PLANNING_DEFAUT.fin);
  if (fin <= debut) { debut = enMinutes(PLANNING_DEFAUT.debut); fin = enMinutes(PLANNING_DEFAUT.fin); }
  const source = Array.isArray(b.pauses) ? b.pauses : PLANNING_DEFAUT.pauses;
  const vues = new Set();
  const pauses = source
    .map((p) => ({ heure: enMinutes(p?.heure), duree: Math.round(Number(p?.duree)) }))
    .filter((p) => p.heure != null && Number.isFinite(p.duree))
    .map((p) => ({ heure: p.heure, duree: Math.min(240, Math.max(1, p.duree)) }))
    .sort((x, y) => x.heure - y.heure)
    .filter((p) => (vues.has(p.heure) ? false : (vues.add(p.heure), true)))
    .slice(0, 12)
    .map((p) => ({ heure: enHeure(p.heure), duree: p.duree }));
  const sites = Array.isArray(b.sites) ? [...new Set(b.sites.map(nomDeSite).filter(Boolean))].slice(0, 30) : [...PLANNING_DEFAUT.sites];
  return { debut: enHeure(debut), fin: enHeure(fin), pauses, blocage: b.blocage !== false, sites };
}

/** Les morceaux de la journée, dans l'ordre : travail et pauses, en minutes depuis minuit. */
export function blocsDuJour(planning) {
  const p = normaliserPlanning(planning);
  const debut = enMinutes(p.debut);
  const fin = enMinutes(p.fin);
  const blocs = [];
  let curseur = debut;
  p.pauses.forEach((pause, i) => {
    const de = Math.max(enMinutes(pause.heure), curseur);
    const a = Math.min(enMinutes(pause.heure) + pause.duree, fin);
    if (a <= de || de >= fin) return;
    if (de > curseur) blocs.push({ type: "travail", de: curseur, a: de });
    blocs.push({ type: "pause", de, a, rang: i });
    curseur = a;
  });
  if (curseur < fin) blocs.push({ type: "travail", de: curseur, a: fin });
  return blocs;
}

/**
 * Le temps de la journée, en minutes (28 nov. 2026, Jules : « calculer le temps qu'on va passer à travailler ») : le
 * travail prévu, les pauses, et le travail qui reste à partir de `maintenant`.
 */
export function tempsDuJour(planning, maintenant = new Date()) {
  const ici = maintenant.getHours() * 60 + maintenant.getMinutes() + maintenant.getSeconds() / 60;
  let travail = 0;
  let pauses = 0;
  let reste = 0;
  for (const b of blocsDuJour(planning)) {
    if (b.type === "pause") { pauses += b.a - b.de; continue; }
    travail += b.a - b.de;
    reste += Math.max(0, b.a - Math.max(b.de, ici));
  }
  return { travail, pauses, reste: Math.round(reste) };
}

/**
 * Où l'on en est à `maintenant` (une Date) : la phase, les secondes qui restent avant la suivante, la durée entière
 * de la phase (pour la barre de progression) et la pause visée.
 *   avant   : la journée n'a pas commencé ; restant jusqu'au début.
 *   travail : restant jusqu'à la prochaine pause (`pause`), ou jusqu'à la fin s'il n'y en a plus (`pause` null).
 *   pause   : restant jusqu'à la reprise.
 *   fini    : la journée est finie.
 */
export function etatDuMoment(planning, maintenant = new Date()) {
  const s = maintenant.getHours() * 3600 + maintenant.getMinutes() * 60 + maintenant.getSeconds();
  const blocs = blocsDuJour(planning);
  const pauses = blocs.filter((b) => b.type === "pause");
  if (!blocs.length) return { phase: "fini", restant: 0, total: 0, pause: null, suivante: null };
  const debut = blocs[0].de * 60;
  const fin = blocs[blocs.length - 1].a * 60;
  if (s < debut) return { phase: "avant", restant: debut - s, total: 0, pause: null, suivante: pauses[0] || null };
  if (s >= fin) return { phase: "fini", restant: 0, total: 0, pause: null, suivante: null };
  const bloc = blocs.find((b) => s >= b.de * 60 && s < b.a * 60);
  if (bloc.type === "pause") {
    const suivante = pauses.find((p) => p.de > bloc.de) || null;
    return { phase: "pause", restant: bloc.a * 60 - s, total: (bloc.a - bloc.de) * 60, pause: bloc, suivante };
  }
  const prochaine = pauses.find((p) => p.de * 60 > s) || null;
  // Un bloc de travail finit à la pause qui le suit ou à la fin de la journée.
  return { phase: "travail", restant: bloc.a * 60 - s, total: (bloc.a - bloc.de) * 60, pause: prochaine && prochaine.de === bloc.a ? prochaine : null, suivante: prochaine };
}

/** Des secondes en « 32:14 », ou « 1:05:09 » au-delà d'une heure. */
export function compteARebours(secondes) {
  const t = Math.max(0, Math.floor(secondes));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const deux = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${deux(m)}:${deux(s)}` : `${deux(m)}:${deux(s)}`;
}

/** Des secondes dites en mots : « 40 minutes », « 1 h 05 », « moins d'une minute ». */
export function enMots(secondes) {
  const min = Math.ceil(Math.max(0, secondes) / 60);
  if (secondes < 60) return "moins d'une minute";
  if (min < 60) return `${min} minute${min > 1 ? "s" : ""}`;
  const h = Math.floor(min / 60);
  const reste = min % 60;
  return reste ? `${h} h ${String(reste).padStart(2, "0")}` : `${h} h`;
}

/** Une durée de pause en minutes, dite courte : « 15 min », « 1 h », « 1 h 30 ». */
export function dureeCourte(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}
