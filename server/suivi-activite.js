// Le Suivi de l'activité (2 nov. 2026, Jules : « un tableau de bord, avec tous les chiffres », « des graphiques ») :
// est-ce que ça avance vers des ventes, et où ça coince ? Les cinq gestes qui font une vente sur la période (biens prospectés,
// visite réalisée, mandat signé, offre reçue, vente), le parcours des biens aujourd'hui (combien à chaque étape, combien y
// sont arrêtés), ce qui passe d'une étape à la suivante, les délais, le portefeuille sous mandat, et chaque mandataire.
// L'usage, les appels et les coûts ont leurs onglets : rien n'est recopié ici. Lecture seule.
//
// Les biens sont ceux de l'espace mandataire (regrouperBiens), l'équipe comprise quand elle prospecte ; les fiches
// d'exemple et les biens d'essai sont écartés, et comptés.

import { Records } from './db.js';
import { ETAPES_BIEN, MOTS_PERDU, regrouperBiens } from '../src/lib/biens-mandataire.js';

const JOUR = 86400000;
const norm = (e) => String(e || '').trim().toLowerCase();
const jourDe = (iso) => String(iso || '').slice(0, 10);
const MANDAT_FAIT = new Set(['signe', 'enregistre']);
const VENDU = new Set(['acte', 'commission_payee']);
/** Un bien qui n'a pas bougé depuis ce nombre de jours est « arrêté ». */
export const ARRET_JOURS = 14;

export const GESTES = [
  // Les biens prospectés plutôt que les RDV (2 nov. 2026, Jules) : chaque bien appelé ou dont la fiche a changé de
  // statut, une fois par jour.
  { cle: 'prospectes', libelle: 'Biens prospectés' },
  // Les visites réalisées plutôt que les avis envoyés (2 nov. 2026, Jules).
  { cle: 'visites', libelle: 'Visites réalisées' },
  { cle: 'mandats', libelle: 'Mandats signés' },
  { cle: 'offres', libelle: 'Offres reçues' },
  { cle: 'ventes', libelle: 'Ventes' },
];

const PROSPECTION = [
  { cle: 'a_appeler', libelle: 'À appeler', statuts: new Set(['a_appeler']) },
  { cle: 'contactes', libelle: 'Contactés', statuts: new Set(['contacte', 'en_discussion', 'a_recontacter']) },
];

const mediane = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
};
const ecart = (de, a) => (de && a && Date.parse(a) >= Date.parse(de) ? (Date.parse(a) - Date.parse(de)) / JOUR : null);

/** Pure : les dates des gestes d'un bien (et de son RDV, pour les délais) (chacune une liste : un bien peut recevoir plusieurs offres). */
export function gestesDuBien(b) {
  const p = b.proprietaire;
  const rdv = (p?.historique || []).filter((h) => h.type === 'statut' && /^RDV pris/i.test(String(h.texte || ''))).map((h) => h.le);
  const avis = b.estimation?.envoye_le ? [b.estimation.envoye_le] : [];
  const m = b.mandat;
  const mandats = m && MANDAT_FAIT.has(m.statut) ? [m.signe_le || m.updated_date || m.cree_le].filter(Boolean) : [];
  const k = b.marche;
  const offres = (k?.offres || []).map((o) => o.le).filter(Boolean);
  const ventes = k && VENDU.has(k.statut) ? [k.acte_le || k.updated_date].filter(Boolean) : [];
  const jours = new Map();
  for (const h of p?.historique || []) if (['appel', 'statut'].includes(h.type) && h.le && !jours.has(jourDe(h.le))) jours.set(jourDe(h.le), h.le);
  // La visite : notée faite sur la fiche, sinon racontée dans l'historique, sinon l'avis commencé (il la suppose).
  const visite = p?.biens?.visite?.faite_le || (p?.historique || []).find((h) => h.type === 'visite')?.le || b.estimation?.cree_le || null;
  return { prospectes: [...jours.values()], visites: visite ? [visite] : [], rdv: rdv.slice(0, 1), avis, mandats, offres, ventes };
}

/**
 * Pure, sur les tables passées : l'activité de la période. `estTest(x)` dit un objet d'essai. `email` : celle d'un seul
 * mandataire, son tableau de bord à lui (2 nov. 2026, Jules : le tableau de bord dans l'espace mandataire).
 */
export function suiviActivite({ jours = 30, maintenant = new Date(), tables = null, estTest = (x) => !!(x?.test || x?.essai_bien), email = null } = {}) {
  const tout = tables || {
    users: Records.list('User'), proprietaires: Records.list('ProprietaireMandataire'),
    estimations: Records.list('EstimationMandataire'), mandats: Records.list('MandatMandataire'),
    dossiers: Records.list('DossierMandataire'), marches: Records.list('MiseEnMarche'),
  };
  const lui = (l) => (email ? (l || []).filter((x) => norm(x.mandataire_email) === norm(email)) : l);
  const t = { ...tout, proprietaires: lui(tout.proprietaires), estimations: lui(tout.estimations), mandats: lui(tout.mandats), dossiers: lui(tout.dossiers), marches: lui(tout.marches) };
  const fin = maintenant.getTime();
  const depuis = new Date(fin - jours * JOUR).toISOString();
  const avant = new Date(fin - 2 * jours * JOUR).toISOString();
  const sansExemple = (l) => (l || []).filter((x) => !x.exemple);

  const tous = regrouperBiens({
    proprietaires: t.proprietaires || [], estimations: sansExemple(t.estimations), mandats: sansExemple(t.mandats),
    dossiers: sansExemple(t.dossiers), marches: sansExemple(t.marches),
  });
  const objets = (b) => [b.proprietaire, b.estimation, b.mandat, b.dossier, b.marche].filter(Boolean);
  const essais = tous.filter((b) => b.test || objets(b).some(estTest));
  const biens = tous.filter((b) => !essais.includes(b));
  const dansBiens = new Set(biens.flatMap((b) => (b.proprietaire ? [b.proprietaire.id] : [])));
  const essaisP = new Set(essais.flatMap((b) => (b.proprietaire ? [b.proprietaire.id] : [])));

  // Les gestes, jour par jour, et la période d'avant pour l'évolution.
  const parJour = new Map();
  for (let i = jours - 1; i >= 0; i -= 1) parJour.set(jourDe(new Date(fin - i * JOUR).toISOString()), Object.fromEntries(GESTES.map((g) => [g.cle, 0])));
  const total = Object.fromEntries(GESTES.map((g) => [g.cle, 0]));
  const precedent = Object.fromEntries(GESTES.map((g) => [g.cle, 0]));
  // Le RDV d'une fiche restée en prospection compte aussi (elle n'entre dans Biens qu'au rendez-vous fixé).
  const pourGestes = [...biens, ...(t.proprietaires || []).filter((p) => !dansBiens.has(p.id) && !essaisP.has(p.id) && !estTest(p)).map((p) => ({ proprietaire: p }))];
  const gestes = new Map();
  for (const b of pourGestes) {
    const g = gestesDuBien(b);
    gestes.set(b, g);
    for (const { cle } of GESTES) {
      for (const le of g[cle]) {
        if (le >= depuis) { total[cle] += 1; const j = parJour.get(jourDe(le)); if (j) j[cle] += 1; } else if (le >= avant) precedent[cle] += 1;
      }
    }
  }

  // Le parcours aujourd'hui : la prospection (fiches pas encore en Biens), puis chaque étape, puis les vendus.
  const prospects = (t.proprietaires || []).filter((p) => !dansBiens.has(p.id) && !essaisP.has(p.id) && !estTest(p));
  const vivant = (b) => !b.proprietaire?.biens?.perdu && !b.proprietaire?.biens?.pause && b.dossier?.statut !== 'no_go';
  const vendu = (b) => b.faites?.has('vente');
  const arrete = (b) => !b.modifie || fin - Date.parse(b.modifie) > ARRET_JOURS * JOUR;
  const parcours = [
    ...PROSPECTION.map((s) => ({ cle: s.cle, libelle: s.libelle, n: prospects.filter((p) => s.statuts.has(p.statut)).length, arretes: null, prospection: true })),
    ...ETAPES_BIEN.map((e) => {
      const ici = biens.filter((b) => vivant(b) && !vendu(b) && b.etape === e.n);
      return { cle: e.id, libelle: e.label, n: ici.length, arretes: ici.filter(arrete).length };
    }),
    { cle: 'vendus', libelle: 'Vendus', n: biens.filter(vendu).length, arretes: null },
  ];

  // Ce qui passe : de tous les biens arrivés à une étape (perdus compris), la part arrivée à la suivante.
  const atteints = ETAPES_BIEN.map((e) => biens.filter((b) => vendu(b) || b.etape >= e.n).length);
  const passages = ETAPES_BIEN.slice(0, -1).map((e, i) => ({
    de: e.label, vers: ETAPES_BIEN[i + 1].label, entres: atteints[i], passes: atteints[i + 1],
    taux: atteints[i] ? Math.round((atteints[i + 1] / atteints[i]) * 100) : null,
  }));

  const delais = [
    { de: 'RDV pris', vers: 'Avis envoyé', jours: mediane(biens.map((b) => ecart(gestes.get(b)?.rdv[0], gestes.get(b)?.avis[0]))) },
    { de: 'Avis envoyé', vers: 'Mandat signé', jours: mediane(biens.map((b) => ecart(gestes.get(b)?.avis[0], gestes.get(b)?.mandats[0]))) },
    { de: 'Mandat signé', vers: 'Vente', jours: mediane(biens.map((b) => ecart(gestes.get(b)?.mandats[0], gestes.get(b)?.ventes[0]))) },
  ];

  // Le portefeuille : les mandats signés pas encore vendus, au prix du mandat, et les honoraires qu'ils promettent.
  const sousMandat = biens.filter((b) => b.mandat && MANDAT_FAIT.has(b.mandat.statut) && !vendu(b) && vivant(b));
  const prixDe = (b) => Number(b.mandat?.prix) || Number(b.estimation?.avis?.chiffres?.valeur) || 0;
  // Les honoraires du mandat sont un pourcentage ; un ancien mandat les porte en euros (au-delà de 100).
  const honorairesDe = (b) => {
    const h = Number(b.mandat?.honoraires ?? b.estimation?.avis?.chiffres?.honoraires_pct) || 0;
    return h > 100 ? h : (prixDe(b) * h) / 100;
  };
  const portefeuille = {
    mandats: sousMandat.length,
    valeur: sousMandat.reduce((s, b) => s + prixDe(b), 0),
    honoraires: Math.round(sousMandat.reduce((s, b) => s + honorairesDe(b), 0)),
    sans_prix: sousMandat.filter((b) => !prixDe(b)).length,
  };

  const perdus = new Map();
  const perdu = (motif) => perdus.set(motif, (perdus.get(motif) || 0) + 1);
  for (const b of biens) {
    const m = b.proprietaire?.biens?.perdu;
    if (m && !b.mandat) perdu(MOTS_PERDU[m.motif] || m.motif || 'sans motif');
    else if (b.dossier?.statut === 'no_go') perdu('no-go');
  }

  const proprietaireDe = (b) => norm(b.marche?.mandataire_email || b.dossier?.mandataire_email || b.mandat?.mandataire_email || b.estimation?.mandataire_email || b.proprietaire?.mandataire_email);
  const noms = new Map((t.users || []).map((u) => [norm(u.email), u.full_name || null]));
  const nomDe = (e) => noms.get(e) || (e ? e.split('@')[0] : 'Sans mandataire');

  const parMandataire = new Map();
  for (const b of biens) {
    const e = proprietaireDe(b);
    const m = parMandataire.get(e) || { email: e, nom: nomDe(e), etapes: ETAPES_BIEN.map(() => 0), vendus: 0, arretes: 0, mandats: 0, valeur: 0, prospects: 0 };
    if (vendu(b)) m.vendus += 1; else if (vivant(b)) { m.etapes[b.etape - 1] += 1; if (arrete(b)) m.arretes += 1; }
    if (sousMandat.includes(b)) m.valeur += prixDe(b);
    m.mandats += (gestes.get(b)?.mandats || []).filter((le) => le >= depuis).length;
    parMandataire.set(e, m);
  }
  for (const p of prospects) {
    const e = norm(p.mandataire_email);
    const m = parMandataire.get(e) || { email: e, nom: nomDe(e), etapes: ETAPES_BIEN.map(() => 0), vendus: 0, arretes: 0, mandats: 0, valeur: 0, prospects: 0 };
    m.prospects += 1;
    parMandataire.set(e, m);
  }
  const mandataires = [...parMandataire.values()]
    .map((m) => ({ ...m, biens: m.etapes.reduce((s, n) => s + n, 0) + m.vendus }))
    .sort((a, b) => b.vendus - a.vendus || b.biens - a.biens || b.prospects - a.prospects);

  return {
    jours,
    etapes: ETAPES_BIEN.map((e) => e.label),
    gestes: GESTES.map((g) => ({ ...g, n: total[g.cle], avant: precedent[g.cle] })),
    par_jour: [...parJour.entries()].map(([jour, x]) => ({ jour, ...x })),
    parcours, passages, delais, portefeuille,
    perdus: [...perdus.entries()].sort((a, b) => b[1] - a[1]).map(([motif, n]) => ({ motif, n })),
    en_pause: biens.filter((b) => b.proprietaire?.biens?.pause && !b.proprietaire?.biens?.perdu).length,
    mandataires,
    ecartes: essais.length,
  };
}
