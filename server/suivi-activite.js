// Les statistiques du tableau de bord (2 nov. 2026, Jules, sur sa maquette « Vos statistiques ») : quatre indicateurs
// comparés à l'an passé (honoraires encaissés, mandats signés, passage estimation → mandat, délai mandat → vente), les
// honoraires mois par mois, l'entonnoir de l'appel à la vente, la semaine en cours, les dossiers en cours, et quand on
// prospecte. Pas d'objectif annuel pour l'instant (Jules) ; la semaine se compare à la précédente, pas à une cible.
// Le mandataire voit ses biens ; l'équipe voit tout, et chaque mandataire. Lecture seule.
//
// Les biens sont ceux de l'espace mandataire (regrouperBiens) ; les fiches d'exemple et les biens d'essai sont écartés.
// Rien n'enregistre le paiement d'une commission : un honoraire est « encaissé » à l'acte, au taux du mandat, sur le
// prix de l'offre acceptée (sinon le prix du mandat).

import { Records } from './db.js';
import { ETAPES_BIEN, regrouperBiens } from '../src/lib/biens-mandataire.js';
import { heureParis, jourSemaineParis } from './prospection/suivi-appels.js';

const JOUR = 86400000;
const norm = (e) => String(e || '').trim().toLowerCase();
const jourDe = (iso) => String(iso || '').slice(0, 10);
const MANDAT_FAIT = new Set(['signe', 'enregistre']);
const VENDU = new Set(['acte', 'commission_payee']);
export const PERIODES = ['30j', 'trimestre', 'annee'];

/** Ce qu'il reste à faire à chaque étape, quand Haka n'a pas posé de prochaine action. */
const SUITE = { previsite: 'Faire la visite', estimation: "Présenter l'avis au propriétaire", mandat: 'Faire signer le mandat', dataroom: 'Réunir les pièces de la Data room', marche: 'Commercialiser le bien', offre: 'Négocier les offres', vente: "Signer l'acte" };

const mediane = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const unAnAvant = (d) => { const x = new Date(d); x.setFullYear(x.getFullYear() - 1); return x; };

/** Pure : la fenêtre d'une période ({ de, a }), et la même un an plus tôt. 30 jours glissants, le trimestre ou l'année en cours. */
export function fenetre(periode, maintenant = new Date()) {
  const a = new Date(maintenant);
  let de;
  if (periode === 'annee') de = new Date(a.getFullYear(), 0, 1);
  else if (periode === 'trimestre') de = new Date(a.getFullYear(), Math.floor(a.getMonth() / 3) * 3, 1);
  else de = new Date(a.getTime() - 30 * JOUR);
  return { de: de.toISOString(), a: a.toISOString(), avant: { de: unAnAvant(de).toISOString(), a: unAnAvant(a).toISOString() } };
}

/** Pure : les dates des gestes d'un bien, chacune une liste (un bien peut recevoir plusieurs offres, être appelé chaque jour). */
export function gestesDuBien(b) {
  const p = b.proprietaire;
  const hist = p?.historique || [];
  // Un appel : chaque jour où le bien est appelé ou change de statut, une fois par jour ; une relance, un appel sur un
  // bien déjà appelé un autre jour.
  const jours = new Map();
  for (const h of [...hist].sort((x, y) => String(x.le).localeCompare(String(y.le)))) if (['appel', 'statut'].includes(h.type) && h.le && !jours.has(jourDe(h.le))) jours.set(jourDe(h.le), h.le);
  const appels = [...jours.values()];
  const m = b.mandat;
  const k = b.marche;
  return {
    appels,
    relances: appels.slice(1),
    rdv: hist.filter((h) => h.type === 'statut' && /^RDV pris/i.test(String(h.texte || ''))).map((h) => h.le),
    estimations: b.estimation?.cree_le ? [b.estimation.cree_le] : [],
    mandats: m && MANDAT_FAIT.has(m.statut) ? [m.signe_le || m.updated_date || m.cree_le].filter(Boolean) : [],
    offres: (k?.offres || []).map((o) => o.le).filter(Boolean),
    ventes: k && VENDU.has(k.statut) ? [k.acte_le || k.updated_date].filter(Boolean) : [],
  };
}

/** Pure : les honoraires d'un bien. Le mandat les dit en pourcentage ; un ancien mandat, en euros (au-delà de 100). */
export function honorairesDuBien(b) {
  const acceptee = (b.marche?.offres || []).find((o) => o.reponse === 'acceptee' && Number(o.montant));
  const prix = Number(acceptee?.montant) || Number(b.mandat?.prix) || Number(b.estimation?.avis?.chiffres?.valeur) || 0;
  const h = Number(b.mandat?.honoraires ?? b.estimation?.avis?.chiffres?.honoraires_pct) || 0;
  return Math.round(h > 100 ? h : (prix * h) / 100);
}

/**
 * Pure, sur les tables passées : les statistiques de la période. `estTest(x)` dit un objet d'essai. `email` : celle
 * d'un seul mandataire, ses statistiques à lui.
 */
export function suiviActivite({ periode = '30j', maintenant = new Date(), tables = null, estTest = (x) => !!(x?.test || x?.essai_bien), email = null } = {}) {
  const tout = tables || {
    users: Records.list('User'), proprietaires: Records.list('ProprietaireMandataire'),
    estimations: Records.list('EstimationMandataire'), mandats: Records.list('MandatMandataire'),
    dossiers: Records.list('DossierMandataire'), marches: Records.list('MiseEnMarche'),
  };
  const lui = (l) => (email ? (l || []).filter((x) => norm(x.mandataire_email) === norm(email)) : l || []);
  const sansExemple = (l) => lui(l).filter((x) => !x.exemple);
  const tous = regrouperBiens({
    proprietaires: lui(tout.proprietaires), estimations: sansExemple(tout.estimations), mandats: sansExemple(tout.mandats),
    dossiers: sansExemple(tout.dossiers), marches: sansExemple(tout.marches),
  });
  const objets = (b) => [b.proprietaire, b.estimation, b.mandat, b.dossier, b.marche].filter(Boolean);
  const biens = tous.filter((b) => !b.test && !objets(b).some(estTest));
  // Une fiche restée en prospection compte pour ses appels (elle n'entre dans Biens qu'au rendez-vous fixé).
  const dansBiens = new Set(tous.flatMap((b) => (b.proprietaire ? [b.proprietaire.id] : [])));
  const prospects = lui(tout.proprietaires).filter((p) => !dansBiens.has(p.id) && !estTest(p)).map((p) => ({ proprietaire: p, prospect: true }));
  const tousGestes = [...biens, ...prospects].map((b) => ({ b, g: gestesDuBien(b) }));

  const f = fenetre(periode, maintenant);
  const dans = (le, w) => !!le && le >= w.de && le <= w.a;
  const compte = (cle, w) => tousGestes.reduce((s, { g }) => s + g[cle].filter((le) => dans(le, w)).length, 0);
  const vendus = (w) => tousGestes.filter(({ g }) => g.ventes.some((le) => dans(le, w)));
  const encaisse = (w) => vendus(w).reduce((s, { b }) => s + honorairesDuBien(b), 0);
  const passage = (w) => { const e = compte('estimations', w); return e ? Math.min(100, Math.round((compte('mandats', w) / e) * 100)) : null; };
  const delai = (w) => {
    const mois = vendus(w).map(({ g }) => (g.mandats[0] && g.ventes[0] ? (Date.parse(g.ventes[0]) - Date.parse(g.mandats[0])) / (30.44 * JOUR) : null));
    const d = mediane(mois.filter((x) => x != null && x >= 0));
    return d == null ? null : Math.round(d * 10) / 10;
  };
  const indicateurs = [
    { cle: 'honoraires', libelle: 'Honoraires encaissés', valeur: encaisse(f), avant: encaisse(f.avant), unite: 'euros' },
    { cle: 'mandats', libelle: 'Mandats signés', valeur: compte('mandats', f), avant: compte('mandats', f.avant), unite: 'nombre' },
    { cle: 'passage', libelle: 'Estimation → mandat', valeur: passage(f), avant: passage(f.avant), unite: 'pct' },
    { cle: 'delai', libelle: 'Délai mandat → vente', valeur: delai(f), avant: delai(f.avant), unite: 'mois', moins_mieux: true },
  ];

  // Les honoraires encaissés, mois par mois, sur l'année en cours ; les mois à venir restent vides.
  const annee = maintenant.getFullYear();
  const moisCourant = maintenant.getMonth();
  const mois = Array.from({ length: 12 }, (_, i) => {
    const w = { de: new Date(annee, i, 1).toISOString(), a: new Date(annee, i + 1, 1).toISOString() };
    return { mois: i, montant: i > moisCourant ? null : encaisse(w), courant: i === moisCourant };
  });

  // L'entonnoir de la période : chaque étape et la part de la précédente.
  const etages = [['appels', 'Appels'], ['estimations', 'Estimations'], ['mandats', 'Mandats'], ['offres', 'Offres'], ['ventes', 'Ventes']];
  const entonnoir = etages.map(([cle, libelle]) => ({ cle, libelle, n: compte(cle, f) }));
  entonnoir.forEach((x, i) => { x.taux = i && entonnoir[i - 1].n ? Math.round((x.n / entonnoir[i - 1].n) * 100) : null; });

  // Cette semaine (depuis lundi) et la semaine dernière entière.
  const lundi = new Date(maintenant); lundi.setHours(0, 0, 0, 0); lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const semaineW = { de: lundi.toISOString(), a: maintenant.toISOString() };
  const derniereW = { de: new Date(lundi.getTime() - 7 * JOUR).toISOString(), a: new Date(lundi.getTime() - 1).toISOString() };
  const cetteSemaine = [['appels', 'Appels'], ['relances', 'Relances'], ['rdv', 'Rendez-vous']]
    .map(([cle, libelle]) => ({ cle, libelle, n: compte(cle, semaineW), avant: compte(cle, derniereW) }));

  // Quand on prospecte : jour × heure, à Paris, sur la période.
  const semaine = Array.from({ length: 7 }, (_, j) => ({ jour: j, heures: Array(24).fill(0) }));
  for (const { g } of tousGestes) for (const le of g.appels) if (dans(le, f)) semaine[jourSemaineParis(le)].heures[heureParis(le)] += 1;

  const proprietaireDe = (b) => norm(b.marche?.mandataire_email || b.dossier?.mandataire_email || b.mandat?.mandataire_email || b.estimation?.mandataire_email || b.proprietaire?.mandataire_email);
  const noms = new Map((tout.users || []).map((u) => [norm(u.email), u.full_name || null]));
  const nomDe = (e) => noms.get(e) || (e ? e.split('@')[0] : 'Sans mandataire');

  // Les dossiers en cours : vivants, pas vendus, le plus récemment bougé d'abord.
  const vivant = (b) => !b.proprietaire?.biens?.perdu && !b.proprietaire?.biens?.pause && b.dossier?.statut !== 'no_go' && !b.faites?.has('vente');
  const dossiers = biens.filter(vivant).map((b) => {
    const e = ETAPES_BIEN[b.etape - 1] || ETAPES_BIEN[0];
    const prochaine = b.proprietaire?.biens?.prochaine;
    return {
      cle: b.cle, titre: b.titre, etape: e.n, etape_libelle: e.label, faites: ETAPES_BIEN.filter((x) => b.faites?.has(x.id)).map((x) => x.id),
      honoraires: honorairesDuBien(b) || null,
      prochaine: prochaine?.quoi ? { quoi: prochaine.quoi, le: prochaine.le || null } : { quoi: SUITE[e.id], le: null },
      mandataire: email ? null : nomDe(proprietaireDe(b)),
      lien: `/Biens?bien=${encodeURIComponent(b.cle)}&etape=${e.id}`, modifie: b.modifie,
    };
  });

  // L'équipe : chaque mandataire, ses biens à chaque étape, ses mandats de la période, ses honoraires encaissés.
  let mandataires = null;
  if (!email) {
    const par = new Map();
    const de = (e) => par.get(e) || par.set(e, { email: e, nom: nomDe(e), etapes: ETAPES_BIEN.map(() => 0), vendus: 0, mandats: 0, honoraires: 0, prospects: 0 }).get(e);
    for (const b of biens) {
      const m = de(proprietaireDe(b));
      const g = gestesDuBien(b);
      if (b.faites?.has('vente')) m.vendus += 1; else if (vivant(b)) m.etapes[b.etape - 1] += 1;
      m.mandats += g.mandats.filter((le) => dans(le, f)).length;
      if (g.ventes.some((le) => dans(le, f))) m.honoraires += honorairesDuBien(b);
    }
    for (const { proprietaire: p } of prospects) de(norm(p.mandataire_email)).prospects += 1;
    mandataires = [...par.values()].map((m) => ({ ...m, biens: m.etapes.reduce((s, n) => s + n, 0) + m.vendus }))
      .sort((a, b) => b.honoraires - a.honoraires || b.biens - a.biens || b.prospects - a.prospects);
  }

  return {
    periode, au: maintenant.toISOString(), annee, annee_avant: annee - 1,
    nom: email ? nomDe(norm(email)) : null,
    etapes: ETAPES_BIEN.map((e) => ({ id: e.id, label: e.label })),
    indicateurs, mois, entonnoir, cette_semaine: cetteSemaine, semaine, dossiers, mandataires,
  };
}
