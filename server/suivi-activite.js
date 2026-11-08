// Les statistiques du tableau de bord (2 nov. 2026, Jules, sur sa seconde maquette « Vos statistiques ») : quatre
// indicateurs comparés à la même période un an plus tôt, chacun avec sa courbe (honoraires encaissés, mandats signés,
// passage rendez-vous → mandat, délai mandat → vente), la semaine jour par jour contre la précédente (biens repérés,
// prospections, rendez-vous obtenus), et l'entonnoir de la prospection à la vente. Période : semaine, mois ou année.
// Pas d'objectif pour l'instant (Jules). Le mandataire voit ses biens ; l'équipe voit tout, et chaque mandataire.
//
// Les biens sont ceux de l'espace mandataire (regrouperBiens) ; les fiches d'exemple et les biens d'essai sont écartés.
// Rien n'enregistre le paiement d'une commission : un honoraire est « encaissé » à l'acte, au taux du mandat, sur le
// prix de l'offre acceptée (sinon le prix du mandat).

import { Records } from './db.js';
import { NB_ETAPES_VISIBLES, etapesVisibles, rangVisible, regrouperBiens } from '../src/lib/biens-mandataire.js';
import { estLocation, honorairesLocation } from '../src/lib/location.js';

const JOUR = 86400000;
const norm = (e) => String(e || '').trim().toLowerCase();
const jourDe = (iso) => String(iso || '').slice(0, 10);
const MANDAT_FAIT = new Set(['signe', 'enregistre']);
const VENDU = new Set(['acte', 'commission_payee']);
export const PERIODES = ['semaine', 'mois', 'annee'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const mediane = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const unAnAvant = (d) => { const x = new Date(d); x.setFullYear(x.getFullYear() - 1); return x; };

/** Pure : le lundi 0 h de la semaine d'une date. */
const lundiDe = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/**
 * Pure : la fenêtre d'une période ({ de, a }), la même un an plus tôt, ses tranches pour les courbes (les jours de la
 * semaine ou du mois, les mois de l'année) et ce qu'elle couvre en mots (« Janvier → novembre »).
 */
export function fenetre(periode, maintenant = new Date()) {
  const a = new Date(maintenant);
  let de;
  let tranches;
  let etendue;
  if (periode === 'annee') {
    de = new Date(a.getFullYear(), 0, 1);
    tranches = Array.from({ length: a.getMonth() + 1 }, (_, i) => [new Date(a.getFullYear(), i, 1), new Date(a.getFullYear(), i + 1, 1)]);
    etendue = a.getMonth() ? `Janvier → ${MOIS[a.getMonth()]}` : 'Janvier';
  } else {
    de = periode === 'mois' ? new Date(a.getFullYear(), a.getMonth(), 1) : lundiDe(a);
    const n = Math.floor((a - de) / JOUR) + 1;
    tranches = Array.from({ length: n }, (_, i) => [new Date(de.getFullYear(), de.getMonth(), de.getDate() + i), new Date(de.getFullYear(), de.getMonth(), de.getDate() + i + 1)]);
    etendue = periode === 'mois' ? majuscule(MOIS[a.getMonth()]) : 'Depuis lundi';
  }
  return {
    de: de.toISOString(), a: a.toISOString(), etendue,
    tranches: tranches.map(([x, y]) => ({ de: x.toISOString(), a: (y < a ? y : a).toISOString() })),
    avant: { de: unAnAvant(de).toISOString(), a: unAnAvant(a).toISOString() },
  };
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
    reperes: [p?.created_date || p?.cree_le].filter(Boolean),
    appels,
    rdv: hist.filter((h) => h.type === 'statut' && /^RDV pris/i.test(String(h.texte || ''))).map((h) => h.le),
    estimations: b.estimation?.cree_le ? [b.estimation.cree_le] : [],
    mandats: m && MANDAT_FAIT.has(m.statut) ? [m.signe_le || m.updated_date || m.cree_le].filter(Boolean) : [],
    offres: (k?.offres || []).map((o) => o.le).filter(Boolean),
    // Un bien à louer ne se vend pas : son bail signé (`biens.loue`) compte à part (6 nov. 2026, Jules).
    ventes: k && VENDU.has(k.statut) && !estLocation(p) ? [k.acte_le || k.updated_date].filter(Boolean) : [],
    locations: estLocation(p) && p?.biens?.loue?.le ? [p.biens.loue.le] : [],
  };
}

/** Pure : les honoraires d'un bien. Le mandat les dit en pourcentage ; un ancien mandat, en euros (au-delà de 100). */
export function honorairesDuBien(b) {
  // Une location : les honoraires de location (15 % HT du loyer annuel, à la charge du preneur), sur le loyer du bail.
  if (estLocation(b.proprietaire)) {
    const loyer = b.proprietaire.biens?.loue?.loyer_annuel || b.proprietaire.biens?.repris?.loyer_annuel || b.proprietaire.mandat_importe?.loyer_annuel;
    return honorairesLocation(loyer) || 0;
  }
  const acceptee = (b.marche?.offres || []).find((o) => o.reponse === 'acceptee' && Number(o.montant));
  const prix = Number(acceptee?.montant) || Number(b.mandat?.prix) || Number(b.estimation?.avis?.chiffres?.valeur) || 0;
  const h = Number(b.mandat?.honoraires ?? b.estimation?.avis?.chiffres?.honoraires_pct) || 0;
  return Math.round(h > 100 ? h : (prix * h) / 100);
}

/**
 * Pure, sur les tables passées : les statistiques de la période. `estTest(x)` dit un objet d'essai. `email` : celle
 * d'un seul mandataire, ses statistiques à lui.
 */
export function suiviActivite({ periode = 'annee', maintenant = new Date(), tables = null, estTest = (x) => !!(x?.test || x?.essai_bien), email = null } = {}) {
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
  const loues = (w) => tousGestes.filter(({ g }) => g.locations.some((le) => dans(le, w)));
  // Les honoraires encaissés : ceux des ventes à l'acte et ceux des locations au bail signé.
  const encaisse = (w) => [...vendus(w), ...loues(w)].reduce((s, { b }) => s + honorairesDuBien(b), 0);
  const passage = (w) => { const r = compte('rdv', w); return r ? Math.min(100, Math.round((compte('mandats', w) / r) * 100)) : null; };
  const delai = (w) => {
    const mois = vendus(w).map(({ g }) => (g.mandats[0] && g.ventes[0] ? (Date.parse(g.ventes[0]) - Date.parse(g.mandats[0])) / (30.44 * JOUR) : null));
    const d = mediane(mois.filter((x) => x != null && x >= 0));
    return d == null ? null : Math.round(d * 10) / 10;
  };
  // La courbe de chaque indicateur, tranche par tranche : les honoraires de la tranche ; les autres depuis le début de
  // la période jusqu'à la fin de la tranche (un taux ou une médiane sur une seule tranche saute trop pour se lire).
  const cumul = (fn) => f.tranches.map((t) => fn({ de: f.de, a: t.a }));
  const indicateurs = [
    { cle: 'honoraires', libelle: 'Honoraires encaissés', valeur: encaisse(f), avant: encaisse(f.avant), unite: 'euros', courbe: f.tranches.map(encaisse) },
    { cle: 'mandats', libelle: 'Mandats signés', valeur: compte('mandats', f), avant: compte('mandats', f.avant), unite: 'nombre', courbe: cumul((w) => compte('mandats', w)) },
    { cle: 'passage', libelle: 'Rendez-vous → mandat', valeur: passage(f), avant: passage(f.avant), unite: 'pct', courbe: cumul(passage) },
    { cle: 'delai', libelle: 'Délai mandat → vente', valeur: delai(f), avant: delai(f.avant), unite: 'mois', moins_mieux: true, courbe: cumul(delai) },
  ];

  // Cette semaine, du lundi au vendredi, contre la semaine précédente ; les totaux comptent la semaine entière.
  const lundi = lundiDe(maintenant);
  const jour = (base, i) => { const de = new Date(base); de.setDate(de.getDate() + i); const a = new Date(de); a.setDate(a.getDate() + 1); return { de: de.toISOString(), a: new Date(a.getTime() - 1).toISOString() }; };
  const avantLundi = new Date(lundi); avantLundi.setDate(avantLundi.getDate() - 7);
  const semaineW = { de: lundi.toISOString(), a: maintenant.toISOString() };
  const precedenteW = { de: avantLundi.toISOString(), a: new Date(lundi.getTime() - 1).toISOString() };
  const cetteSemaine = [['reperes', 'Biens repérés'], ['appels', 'Prospections'], ['rdv', 'Rendez-vous obtenus']].map(([cle, libelle]) => ({
    cle, libelle, n: compte(cle, semaineW), avant: compte(cle, precedenteW),
    jours: Array.from({ length: 5 }, (_, i) => {
      const w = jour(lundi, i);
      return { n: w.de > maintenant.toISOString() ? null : compte(cle, w), avant: compte(cle, jour(avantLundi, i)) };
    }),
  }));

  // De la prospection à la vente, sur la période : chaque étape et la part de la précédente.
  const etages = [['appels', 'Prospections'], ['rdv', 'Rendez-vous'], ['mandats', 'Mandats'], ['offres', 'Offres'], ['ventes', 'Ventes']];
  const entonnoir = etages.map(([cle, libelle]) => ({ cle, libelle, n: compte(cle, f) }));
  entonnoir.forEach((x, i) => { x.taux = i && entonnoir[i - 1].n ? Math.round((x.n / entonnoir[i - 1].n) * 100) : null; });

  const proprietaireDe = (b) => norm(b.marche?.mandataire_email || b.dossier?.mandataire_email || b.mandat?.mandataire_email || b.estimation?.mandataire_email || b.proprietaire?.mandataire_email);
  const noms = new Map((tout.users || []).map((u) => [norm(u.email), u.full_name || null]));
  const nomDe = (e) => noms.get(e) || (e ? e.split('@')[0] : 'Sans mandataire');
  const vivant = (b) => !b.proprietaire?.biens?.perdu && !b.proprietaire?.biens?.pause && b.dossier?.statut !== 'no_go' && !b.faites?.has('vente');

  // L'équipe : chaque mandataire, ses biens à chaque étape, ses mandats de la période, ses honoraires encaissés.
  let mandataires = null;
  if (!email) {
    const par = new Map();
    const de = (e) => par.get(e) || par.set(e, { email: e, nom: nomDe(e), etapes: Array(NB_ETAPES_VISIBLES).fill(0), vendus: 0, loues: 0, mandats: 0, honoraires: 0, prospects: 0 }).get(e);
    for (const b of biens) {
      const m = de(proprietaireDe(b));
      const g = gestesDuBien(b);
      // Un bien loué compte à part des vendus (6 nov. 2026).
      if (b.faites?.has('vente')) { if (estLocation(b.proprietaire)) m.loues += 1; else m.vendus += 1; } else if (vivant(b)) m.etapes[rangVisible(b.etape) - 1] += 1; // six étapes à l'écran (7 nov. 2026)
      m.mandats += g.mandats.filter((le) => dans(le, f)).length;
      if ([...g.ventes, ...g.locations].some((le) => dans(le, f))) m.honoraires += honorairesDuBien(b);
    }
    for (const { proprietaire: p } of prospects) de(norm(p.mandataire_email)).prospects += 1;
    mandataires = [...par.values()].map((m) => ({ ...m, biens: m.etapes.reduce((s, n) => s + n, 0) + m.vendus + m.loues }))
      .sort((a, b) => b.honoraires - a.honoraires || b.biens - a.biens || b.prospects - a.prospects);
  }

  return {
    periode, au: maintenant.toISOString(), etendue: f.etendue, annee_avant: maintenant.getFullYear() - 1,
    nom: email ? nomDe(norm(email)) : null,
    etapes: etapesVisibles(null).map((e) => ({ id: e.id, label: e.label })),
    indicateurs, cette_semaine: cetteSemaine, entonnoir, mandataires,
    // Les baux signés de la période, à part des ventes de l'entonnoir (6 nov. 2026).
    locations: { n: compte('locations', f), avant: compte('locations', f.avant) },
  };
}
