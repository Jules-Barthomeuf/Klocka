// K-Foncier, le local (lot 6 de la boîte à outils de Haka, spec de Jules du 18 oct. 2026).
//
// Qui possède les murs d'une adresse : on part de l'identifiant de local et de
// sa parcelle (socle/local.js), puis
//   1. les propriétaires personnes morales de la parcelle (fichier des locaux
//      des personnes morales, DGFiP, millésime servi par le miroir) ;
//   2. leur société : par le SIREN quand le fichier le donne, sinon par le nom
//      et la commune dans l'annuaire des entreprises, avec un score (on ne
//      retient qu'au-dessus de SCORE_MIN, et l'écran montre le score) ;
//   3. ses dirigeants (registre national des entreprises, via l'annuaire) ;
//   4. ses annonces BODACC des trois dernières années (procédures collectives,
//      cessions, radiations) ;
//   5. la dernière mutation DVF de la parcelle.
// Sans personne morale sur la parcelle : « personne physique, non
// identifiable ». Aucune source légale ne la donne, on ne la devine pas.
// Chaque source passe par son interrupteur (viaSource). Rien n'appelle Data-B.

import { viaSource } from './socle/registre-sources.js';

export const SCORE_MIN = 0.6;
const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const ALERTES = new Set(['procédure collective', 'radiation ou dissolution', 'cession', 'décès d’un dirigeant']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const FORMES = new Set(['sci', 'sarl', 'sas', 'sasu', 'sa', 'eurl', 'snc', 'scp', 'sccv', 'societe', 'civile', 'immobiliere', 'la', 'le', 'les', 'de', 'du', 'des', 'et']);
const mots = (s) => new Set(norm(s).split(' ').filter((m) => m && !FORMES.has(m)));

/**
 * Pure : la ressemblance entre le propriétaire lu au fichier (nom, adresse) et une société de l'annuaire, de 0 à 1.
 * Le nom compte pour 0,8 (mots communs, sans les formes juridiques), la commune ou le code postal pour 0,2.
 */
export function scoreRapprochement(nom, adresse, candidat) {
  const a = mots(nom);
  const b = mots(candidat?.nom_raison_sociale || candidat?.nom_complet);
  if (!a.size || !b.size) return 0;
  const communs = [...a].filter((m) => b.has(m)).length;
  const nomScore = communs / Math.max(a.size, b.size);
  const lieu = norm(adresse);
  const cp = String(candidat?.siege?.code_postal || '');
  const ville = norm(candidat?.siege?.libelle_commune);
  const lieuScore = lieu && ((cp && lieu.includes(cp)) || (ville && lieu.includes(ville))) ? 1 : 0;
  return Math.round((nomScore * 0.8 + lieuScore * 0.2) * 100) / 100;
}

/** Pure : les alertes BODACC qui comptent pour un propriétaire. */
export const alertesDe = (evenements = []) => evenements.filter((e) => ALERTES.has(e.type));

/** Pure : le constat quand la parcelle n'a aucune personne morale connue. */
export const PERSONNE_PHYSIQUE = { type: 'personne_physique', libelle: 'Personne physique, non identifiable', raison: "Aucune personne morale au fichier de la DGFiP pour cette parcelle. Les personnes physiques n'y figurent pas : aucune source légale ne les donne." };

async function chercherParNom(nom, adresse) {
  const r = await fetch(`${ANNUAIRE}?${new URLSearchParams({ q: nom, per_page: '5' })}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`annuaire ${r.status}`);
  const candidats = (await r.json()).results || [];
  const notes = candidats.map((c) => ({ c, score: scoreRapprochement(nom, adresse, c) })).sort((x, y) => y.score - x.score);
  return notes[0] && notes[0].score >= SCORE_MIN ? { siren: notes[0].c.siren, score: notes[0].score, nom: notes[0].c.nom_complet } : { siren: null, score: notes[0]?.score ?? 0, nom: notes[0]?.c?.nom_complet || null };
}

/** Un propriétaire : sa société, ses dirigeants, ses alertes. */
async function enrichir(p) {
  let siren = p.siren || null;
  let rapprochement = siren ? { methode: 'siren', score: 1 } : null;
  if (!siren && p.nom) {
    const r = await viaSource('inpi_rne', () => chercherParNom(p.nom, p.adresse));
    if (r.valeur?.siren) { siren = r.valeur.siren; rapprochement = { methode: 'nom_adresse', score: r.valeur.score, nom_trouve: r.valeur.nom }; }
    else rapprochement = { methode: 'nom_adresse', score: r.valeur?.score ?? 0, trouve: false };
  }
  const [fiche, bodacc] = await Promise.all([
    siren ? viaSource('inpi_rne', async () => {
      const { societe } = await import('./kzoning-societe.js');
      const r = await societe({ siret: siren, leger: true });
      return r.ok ? r.societe : null;
    }) : { valeur: null },
    siren ? viaSource('bodacc', async () => (await import('./bodacc.js')).evenementsSociete(siren)) : { valeur: [] },
  ]);
  const evenements = bodacc.valeur || [];
  return {
    ...p,
    siren,
    rapprochement,
    societe: fiche.valeur || null,
    dirigeants: fiche.valeur?.dirigeants || [],
    bodacc: evenements.slice(0, 12),
    alertes: alertesDe(evenements),
  };
}

/**
 * Les murs d'un local : sa parcelle, ses propriétaires personnes morales enrichis, ou le constat « personne physique »,
 * et la dernière mutation DVF. `parcelles` : le résultat de kfoncier.analyser (propriétaires déjà lus par section).
 */
export async function proprietaireDuLocal(local, parcelles = []) {
  const idu = local?.parcelle?.idu || null;
  if (!idu) return { ok: false, error: "La parcelle de l'adresse n'a pas pu être trouvée au cadastre." };
  const p = parcelles.find((x) => x.idu === idu) || null;
  const proprietaires = p?.proprietaires || [];
  const [enrichis, mutation] = await Promise.all([
    Promise.all(proprietaires.slice(0, 6).map(enrichir)),
    viaSource('dvf', async () => {
      const { mutationsDeLaParcelle } = await import('./dvf.js');
      return (await mutationsDeLaParcelle(local.adresse?.code_insee, idu))[0] || null;
    }),
  ]);
  return {
    ok: true,
    id_local: local.id_local || null,
    parcelle: { idu, section: local.parcelle.section, numero: local.parcelle.numero, contenance: local.parcelle.contenance ?? p?.contenance ?? null },
    proprietaires: enrichis,
    constat: enrichis.length ? null : PERSONNE_PHYSIQUE,
    derniere_mutation: mutation.valeur || null,
  };
}
