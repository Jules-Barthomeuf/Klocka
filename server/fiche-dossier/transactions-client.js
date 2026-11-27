// Les transactions d'un client, dans sa fiche (27 nov. 2026, Jules : « dans Transactions on voit avec qui on est en
// transaction et avec qui on en a déjà fait : est-ce que Loïc Grange négocie, finance, signe le compromis ; ça alimente
// les fiches »).
//
// Lu dans Twenty, sans IA : les objets Transactions 2025, 2026, 2027, KP · Transactions ventes et KP · Transactions
// locatives (relus sur les métadonnées de l'instance le 27 nov. 2026). Une transaction est au client par sa relation
// « Clients (fiche) » (clientsFicheId), sinon par son nom écrit dans « Clients ». Sur la fiche : chaque transaction, son
// statut, le bien, le prix ; dans l'historique, ses jalons datés (LOI, compromis, acte), écrits une fois chacun
// (EntreeDossier.jalon_cle). Rien d'autre n'est touché sur la fiche ; Twenty n'est jamais modifié.

import { Records } from '../db.js';
import { montant } from '../montants.js';

const OBJETS = [
  { pluriel: 'transactions2027Liste', singulier: 'transactions2027', titre: 'Transactions 2027', genre: 'vente' },
  { pluriel: 'transactions2026Liste', singulier: 'transactions2026', titre: 'Transactions 2026', genre: 'vente' },
  { pluriel: 'transactions2025Liste', singulier: 'transactions2025', titre: 'Transactions 2025', genre: 'vente' },
  { pluriel: 'kpTransactionsVentesListe', singulier: 'kpTransactionsVentes', titre: 'KP · Transactions ventes', genre: 'vente' },
  { pluriel: 'kpTransactionsLocativesListe', singulier: 'kpTransactionsLocatives', titre: 'KP · Transactions locatives', genre: 'location' },
];

// Les statuts, avec les mots des options de Twenty.
const STATUTS = {
  LOI_EN_COURS: 'LOI en cours', OFFRE_ACCEPTEE: 'Offre acceptée', OFFRE_REFUSEE: 'Offre refusée', FINANCEMENT_OK: 'Financement OK',
  FINANCEMENT_OUT: 'Financement refusé', COMPROMIS: 'Compromis', FINALISEE: 'Finalisée', AVORTEE: 'Avortée', PREEMPTION: 'Préemption',
  CANDIDATURE_RETENUE: 'Candidature retenue', DOSSIER_VALIDE: 'Dossier validé', DOSSIER_REFUSE: 'Dossier refusé', BAIL_SIGNE: 'Bail signé',
  DESISTEMENT: 'Désistement', RELOCATION_PRIORITAIRE: 'Relocation prioritaire',
};
const FINIES = new Set(['FINALISEE', 'BAIL_SIGNE']);
const ARRETEES = new Set(['AVORTEE', 'OFFRE_REFUSEE', 'FINANCEMENT_OUT', 'DOSSIER_REFUSE', 'DESISTEMENT', 'PREEMPTION']);

// Les jalons datés : le champ de Twenty, et ce qu'on écrit dans l'historique.
const JALONS = [
  ['dateDeLoi', 'LOI signée'], ['dateDeSignatureDeLaLoi', 'LOI signée'], ['dateLoiAcceptee', 'LOI acceptée'],
  ['dateCompromis', 'Compromis signé'], ['compromisDeVente', 'Compromis signé'],
  ['dateActeAuthentique', 'Acte authentique'], ['dateDeLaPriseDEffetDuBail', 'Prise d\'effet du bail'],
];

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const estDate = (t) => /^\d{4}-\d{2}-\d{2}/.test(String(t || ''));
const titre = (v) => STATUTS[v] || String(v || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) || null;

/** Pure : le même nom ? « Loïc GRANGE » et « Grange Loïc » oui ; un prénom seul non. */
export function memeNom(a, b) {
  const x = norm(a).split(' ').filter((m) => m.length > 1);
  const y = norm(b).split(' ').filter((m) => m.length > 1);
  if (x.length < 2 || y.length < 2) return false;
  return x.every((m) => y.includes(m)) || y.every((m) => x.includes(m));
}

/** Pure : une ligne de Twenty, dite pour la fiche. */
export function transactionLisible(t, objet) {
  const prix = Number(t.prixNegocie) || Number(String(t.prixAffiche || '').replace(/[^\d.]/g, '')) || Number(t.loyerNegocie) || null;
  const statut = t.statut || null;
  const jalons = JALONS.filter(([k]) => estDate(t[k])).map(([k, mot]) => ({ cle: k, mot, le: String(t[k]).slice(0, 10) }))
    .filter((j, i, l) => l.findIndex((x) => x.mot === j.mot) === i).sort((a, b) => a.le.localeCompare(b.le));
  return {
    id: t.id, objet: objet.singulier, nom: t.name || null, bien: String(t.proprietes || '').trim() || null,
    prix: prix ? `${montant(prix)}${objet.genre === 'location' ? ' de loyer' : ''}` : null,
    statut: titre(statut), en_cours: !!statut && !FINIES.has(statut) && !ARRETEES.has(statut) && !/AVORT/i.test(t.groupe || ''),
    finie: FINIES.has(statut), arretee: ARRETEES.has(statut) || /AVORT/i.test(t.groupe || ''),
    agent: t.agentImmobilier || null, suivi_par: t.personne || null, jalons, client_id: t.clientsFicheId || null, clients: t.clients || null,
    lien: `/CRM?${new URLSearchParams({ t: objet.singulier, f: t.id })}`, mise_a_jour: t.updatedAt || t.createdAt || null,
  };
}

let cache = { le: 0, lignes: null };
/** Toutes les transactions de Twenty, gardées dix minutes. */
async function toutes() {
  if (cache.lignes && Date.now() - cache.le < 10 * 60 * 1000) return cache.lignes;
  const { lister, twentyConfigure } = await import('../twenty.js');
  if (!twentyConfigure()) return [];
  const lignes = [];
  for (const o of OBJETS) {
    try { for (const t of await lister(o.pluriel, { limite: 2000 })) lignes.push(transactionLisible(t, o)); } catch { /* un objet absent n'arrête pas les autres */ }
  }
  cache = { le: Date.now(), lignes };
  return lignes;
}

/** Pure : les transactions d'un client, par sa fiche de Twenty, sinon par son nom ; en cours d'abord. */
export function siennes(lignes, { twentyId = null, nom = null } = {}) {
  return lignes.filter((t) => (twentyId && t.client_id === twentyId) || (!t.client_id && nom && String(t.clients || t.nom || '').split(/[,;/&]| et /).some((c) => memeNom(c, nom))))
    .sort((a, b) => Number(b.en_cours) - Number(a.en_cours) || String(b.jalons.at(-1)?.le || b.mise_a_jour || '').localeCompare(String(a.jalons.at(-1)?.le || a.mise_a_jour || '')));
}

/** Les transactions d'une fiche client, et leurs jalons dans l'historique. Null sans Twenty ou sans transaction. */
export async function transactionsDuClient(f, { lignes = null } = {}) {
  if (!f || f.genre !== 'client') return null;
  if (!lignes && process.env.NODE_TEST_CONTEXT) return null;
  const twentyId = String(f.cle || '').startsWith('twenty:clients:') ? f.cle.slice('twenty:clients:'.length) : null;
  const l = siennes(lignes || await toutes(), { twentyId, nom: f.nom });
  if (!l.length) return null;
  for (const t of l) for (const j of t.jalons) {
    const k = `${t.objet}:${t.id}:${j.cle}`;
    if (Records.findBy('EntreeDossier', 'jalon_cle', k)) continue;
    Records.create('EntreeDossier', { fiche_cle: f.cle, genre: 'evenement', texte: `${j.mot}${t.bien ? ` : ${t.bien}` : t.nom ? ` : ${t.nom}` : ''}${t.prix ? `, ${t.prix}` : ''}`, raison: null, note_id: null, par: null, le: `${j.le}T12:00:00.000Z`, ordre: 0, source: 'twenty', jalon_cle: k });
  }
  return { lignes: l, en_cours: l.filter((t) => t.en_cours).length, finies: l.filter((t) => t.finie).length };
}
