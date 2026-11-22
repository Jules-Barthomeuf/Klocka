// Les statistiques mois par mois (20 nov. 2026, Jules : « nombre de projets entrés, nombre d'offres faites ce mois-ci ;
// pas des bâtons, des courbes mois par mois, les projets rentrés dans la plateforme sur le même graphique que les
// offres »). Un projet entré : un projet créé dans la plateforme, à sa date de création. Une offre faite : une lettre
// d'intention rédigée dans Offres, à sa date de création.
//
// Pur : calculé sur les listes qu'on lui donne, testé sans base.

const moisDe = (iso) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 7);
};

/**
 * Pure : projets entrés et offres faites, mois par mois, sur `mois` mois finissant par celui de `maintenant`.
 * @param {{ projets?: object[], lettres?: object[], mois?: number, maintenant?: Date }} d
 */
export function parMois({ projets = [], lettres = [], mois = 12, maintenant = new Date() } = {}) {
  const liste = [];
  const a = maintenant.getUTCFullYear();
  const m = maintenant.getUTCMonth();
  for (let i = mois - 1; i >= 0; i -= 1) liste.push(new Date(Date.UTC(a, m - i, 1)).toISOString().slice(0, 7));
  const par = new Map(liste.map((x) => [x, { mois: x, projets: 0, offres: 0 }]));
  for (const p of projets) {
    const x = par.get(moisDe(p.created_date));
    if (x) x.projets += 1;
  }
  for (const l of lettres) {
    const x = par.get(moisDe(l.cree_le || l.created_date));
    if (x) x.offres += 1;
  }
  const serie = [...par.values()];
  const ce = serie[serie.length - 1];
  const avant = serie[serie.length - 2] || null;
  return {
    mois: serie,
    ce_mois: { mois: ce.mois, projets: ce.projets, offres: ce.offres },
    mois_dernier: avant ? { mois: avant.mois, projets: avant.projets, offres: avant.offres } : null,
    total: { projets: projets.length, offres: lettres.length },
  };
}

// « Mes statistiques » (22 nov. 2026, maquette de Jules) : pour une personne, par jour sur les `jours` derniers jours
// (mois glissant), comparés aux `jours` d'avant. Quatre chiffres : les fiches reçues qui lui reviennent, celles ouvertes
// en dossier (à la date de la fiche), les projets qu'elle a créés, les présentations bancaires qu'elle a faites.

const jourParis = (iso) => {
  const d = new Date(iso || '');
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const min = (e) => String(e || '').trim().toLowerCase();
export const CHIFFRES_PERSONNE = ['fiches', 'dossiers', 'projets', 'presentations'];

/**
 * Pure : la série par jour d'une personne et ses totaux, la période et celle d'avant.
 * @param {{ email: string, fiches?: object[], projets?: object[], presentations?: object[], jours?: number, maintenant?: Date }} d
 *   fiches : les lignes de fichesParAnalyste (le, analyste, dossier, ecartee).
 */
export function parJourPersonne({ email, fiches = [], projets = [], presentations = [], jours = 30, maintenant = new Date() }) {
  const qui = min(email);
  const fin = new Date(`${jourParis(maintenant)}T12:00:00Z`);
  const date = (decalage) => new Date(fin.getTime() - decalage * 86400000).toISOString().slice(0, 10);
  // Le rang d'un jour : 0 à jours-1 pour la période (le dernier est aujourd'hui), jours à 2*jours-1 pour celle d'avant.
  const rangs = new Map();
  for (let i = 0; i < 2 * jours; i += 1) rangs.set(date(i), i);
  const serie = Array.from({ length: jours }, (_, i) => ({ jour: date(jours - 1 - i), ...Object.fromEntries(CHIFFRES_PERSONNE.flatMap((k) => [[k, 0], [`${k}_avant`, 0]])) }));
  const totaux = Object.fromEntries(CHIFFRES_PERSONNE.map((k) => [k, { actuel: 0, avant: 0 }]));
  const compter = (k, iso) => {
    const r = rangs.get(jourParis(iso));
    if (r == null) return;
    const avant = r >= jours;
    const ligne = serie[jours - 1 - (avant ? r - jours : r)];
    ligne[avant ? `${k}_avant` : k] += 1;
    totaux[k][avant ? 'avant' : 'actuel'] += 1;
  };
  for (const f of fiches) {
    if (f.ecartee || min(f.analyste) !== qui) continue;
    compter('fiches', f.le);
    if (f.dossier) compter('dossiers', f.le);
  }
  for (const p of projets) if (min(p.created_by) === qui) compter('projets', p.created_date);
  for (const x of presentations) if (min(x.cree_par || x.created_by) === qui) compter('presentations', x.cree_le || x.created_date);
  return { email: qui, jours, serie, totaux };
}

