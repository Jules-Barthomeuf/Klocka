// K-Data : plusieurs analyses d'un coup sur une adresse, suivies, rangées.
//
// Jusqu'ici, chaque outil s'ouvrait seul : une adresse par outil, un outil à
// la fois. Le tableau de bord devient le point de départ commun. On choisit
// les outils, on donne l'adresse, et chaque analyse part de son côté ; la
// file dessous dit lesquelles tournent encore et lesquelles sont prêtes.
// Une analyse prête s'ouvre dans son outil ; plusieurs analyses cochées se
// rangent dans un dossier.
//
// Les dossiers sont les affaires de la page Dossiers — « CAFPI de Courbevoie »
// — celles que l'équipe suit d'un bout à l'autre. Une analyse rangée dans une
// affaire y apparaît en onglet, à côté du bail et du marché, et s'y lit sans
// s'y modifier.
//
// Ce module ne recalcule rien : il appelle les outils par leurs fonctions, les
// mêmes que leurs routes, et garde de chaque analyse ce qu'il faut pour la
// retrouver — l'identifiant de sa fiche quand l'outil en tient une, l'adresse
// sinon, et une ligne de résumé pour la liste.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { creerZoneCercle } from './kzoning.js';
import { listerDossiers as listerAffaires } from './deal/index.js';
import { nettoyerLot, manquantes, formulaireEntame } from './kdata-questions.js';

const ENTITE = 'AnalyseKData';
/** Au-delà, une analyse en tâche de fond est déclarée perdue. */
const ATTENTE_MAX_MS = 25 * 60 * 1000;
const RAYON_ZONE_M = 300;

const dors = (ms) => new Promise((r) => setTimeout(r, ms));
const euros = (n) => (n == null ? null : `${Math.round(n).toLocaleString('fr-FR')} €`);
const virg = (n) => String(n).replace('.', ',');

// --- Les résumés, une ligne par outil. Purs : testés sans réseau. ---------

export function resumerExpertise(e) {
  const r = e?.resultat || {};
  const d = r.etude || r.data_b;
  const p = d?.flux_pieton?.par_heure;
  const morceaux = [];
  if (p?.basse?.min != null && p?.haute?.max != null) morceaux.push(`${Math.round(p.basse.min).toLocaleString('fr-FR')} à ${Math.round(p.haute.max).toLocaleString('fr-FR')} piétons / h`);
  if (r.generateurs?.length) morceaux.push(`${r.generateurs.length} générateurs de flux`);
  if (d?.rue?.commerces) morceaux.push(`${d.rue.commerces} commerces dans la rue`);
  return morceaux.join(' · ') || 'rapport prêt';
}

export function resumerEstimation(e) {
  const m = e?.marche || {};
  const morceaux = [];
  if (m.dvf?.n != null) morceaux.push(`${m.dvf.n} vente${m.dvf.n > 1 ? 's' : ''} DVF à 500 m`);
  const vl = m.vlm_dvf;
  if (vl?.basse) morceaux.push(`loyer déduit ${euros(vl.basse)} à ${euros(vl.haute)} / m² / an`);
  if (e?.resultat?.valeurs?.moyenne) return `${euros(e.resultat.valeurs.moyenne)} en valeur moyenne`;
  return `${morceaux.join(' · ') || 'marché lu'} · formulaire à remplir`;
}

export function resumerProspection(p) {
  if (p?.nb_commerces == null) return 'prospection prête';
  return `${p.nb_retenus ?? 0} commerce${(p.nb_retenus ?? 0) > 1 ? 's' : ''} retenu${(p.nb_retenus ?? 0) > 1 ? 's' : ''} sur ${p.nb_commerces}`;
}

export function resumerFoncier(r) {
  if (r?.total == null) return 'parcelles lues';
  return `${r.total} parcelle${r.total > 1 ? 's' : ''} dans 150 m, ${r.avec_proprietaires ?? 0} avec propriétaire connu`;
}

export function resumerValeurLocative(r) {
  const n = r?.resultat?.rue?.basse ? r.resultat.rue : r?.resultat?.quartier?.basse ? r.resultat.quartier : null;
  if (!n) return 'valeur locative lue';
  return `${euros(n.basse)} à ${euros(n.haute)} / m² / an${r.resultat.du_cache ? ', reprise de la base' : ''}`;
}

export function resumerVacance(r) {
  // Le verdict d'abord : c'est la réponse à la question posée.
  if (r?.verdict?.niveau && r.verdict.niveau !== 'inconnue') {
    const mot = r.verdict.niveau === 'moyenne' ? 'dans la moyenne' : r.verdict.niveau;
    return r?.vacance?.taux != null ? `vacance ${mot} : ${virg(r.vacance.taux)} % de devantures vides` : `vacance ${mot}`;
  }
  const morceaux = [];
  if (r?.vacance?.taux != null) morceaux.push(`${virg(r.vacance.taux)} % de vacance`);
  if (r?.turnover?.duree_mediane != null) morceaux.push(`${virg(r.turnover.duree_mediane)} ans d'exploitation médiane`);
  return morceaux.join(' · ') || 'quartier lu';
}

export function resumerTransactions(r) {
  const morceaux = [];
  if (r?.murs?.prix_m2?.median) morceaux.push(`murs ${euros(r.murs.prix_m2.median)} / m² sur ${r.murs.n} ventes`);
  if (r?.fonds?.n_avec_prix) morceaux.push(`${r.fonds.n_avec_prix} cessions de fonds chiffrées`);
  return morceaux.join(' · ') || 'marché lu';
}

/**
 * Les outils qu'on peut lancer d'ici, avec la façon de les lancer et le lien
 * qui rouvre leur résultat. `lancer` rend { ref, resume, libelle } ou lève.
 */
const OUTILS = {
  kzoning: {
    nom: 'K-Zoning',
    lien: (a) => `/kzoning?zone=${encodeURIComponent(a.ref?.id || '')}`,
    async lancer(adresse, point, user, reglages = {}) {
      const rayon = Number(reglages.rayon_m) || RAYON_ZONE_M;
      const r = creerZoneCercle({ adresse: point.label, lat: point.lat, lon: point.lon, rayon_m: rayon }, user);
      if (!r.ok) throw new Error(r.error);
      return { ref: { type: 'zone', id: r.zone.id }, resume: `zone de ${rayon} m posée, à lire`, libelle: point.label };
    },
  },
  kexpertise: {
    nom: 'K-Expertise',
    lien: (a) => `/kexpertise?id=${encodeURIComponent(a.ref?.id || '')}`,
    async lancer(adresse, point, user, reglages = {}) {
      const { lancerExpertise, lireExpertise } = await import('./kexpertise.js');
      const r = lancerExpertise({ adresse: point.label, activite: reglages.activite || null }, user);
      if (!r.ok) throw new Error(r.error);
      const e = await attendreFiche(() => lireExpertise(r.id));
      if (e.etat === 'echec') throw new Error(e.erreur || "l'expertise n'a pas abouti");
      return { ref: { type: 'expertise', id: r.id }, resume: resumerExpertise(e), libelle: e.libelle || point.label };
    },
  },
  kestimation: {
    nom: 'Estimation',
    lien: (a) => `/kestimation?id=${encodeURIComponent(a.ref?.id || '')}`,
    async lancer(adresse, point, user, reglages = {}) {
      const { lancerEstimation, lireEstimation, estimer } = await import('./kestimation.js');
      const { activite = null, ...reponses } = reglages;
      const r = lancerEstimation({ adresse: point.label, activite }, user);
      if (!r.ok) throw new Error(r.error);
      let e = await attendreFiche(() => lireEstimation(r.id));
      if (e.etat === 'echec') throw new Error(e.erreur || "la lecture du marché n'a pas abouti");
      // Le formulaire a été rempli avant le lancement : on enchaîne sur la
      // valorisation, plutôt que de rendre une lecture de marché à finir à la
      // main. Laissé vierge, l'outil s'arrête au marché, comme avant.
      if (formulaireEntame('kestimation', reglages)) {
        const calcul = estimer(r.id, reponses, user);
        if (!calcul.ok) throw new Error(calcul.error);
        e = await attendreFiche(() => lireEstimation(r.id));
      }
      return { ref: { type: 'estimation', id: r.id }, resume: resumerEstimation(e), libelle: e.libelle || point.label };
    },
  },
  kprospective: {
    nom: 'K-Prospective',
    lien: (a) => `/kprospective?id=${encodeURIComponent(a.ref?.id || '')}`,
    async lancer(adresse, point, user, reglages = {}) {
      const { lancerProspection, lireProspection } = await import('./kprospective.js');
      const r = lancerProspection({
        adresse: point.label,
        activite: reglages.activite || null,
        rayon_m: reglages.rayon_m,
        criteres: reglages.criteres || {},
      }, user);
      if (!r.ok) throw new Error(r.error);
      const p = await attendreFiche(() => lireProspection(r.id));
      if (p.etat === 'echec') throw new Error(p.erreur || "la prospection n'a pas abouti");
      return { ref: { type: 'prospection', id: r.id }, resume: resumerProspection(p), libelle: p.libelle || point.label };
    },
  },
  kfoncier: {
    nom: 'K-Foncier',
    lien: (a) => `/kfoncier?adresse=${encodeURIComponent(a.libelle || a.adresse)}`,
    async lancer(adresse, point, user) {
      const { analyser } = await import('./kfoncier.js');
      const r = await analyser(point.label, user);
      if (!r.ok) throw new Error(r.error);
      return { ref: { type: 'adresse' }, resume: resumerFoncier(r), libelle: r.point?.label || point.label };
    },
  },
  'valeur-locative': {
    nom: 'Valeur locative',
    lien: (a) => (a.ref?.id ? `/valeurlocative?id=${encodeURIComponent(a.ref.id)}` : `/valeurlocative?adresse=${encodeURIComponent(a.libelle || a.adresse)}`),
    async lancer(adresse, point, user) {
      const { rechercher } = await import('./kvaleurlocative.js');
      const r = await rechercher(point.label, { user });
      if (!r.ok) throw new Error(r.error);
      return { ref: { type: 'valeurlocative', id: r.id }, resume: resumerValeurLocative(r), libelle: r.point?.label || point.label };
    },
  },
  kvacance: {
    nom: 'K-Vacance',
    lien: (a) => `/kvacance?adresse=${encodeURIComponent(a.libelle || a.adresse)}`,
    async lancer(adresse, point, user, reglages = {}) {
      const { analyser } = await import('./kvacance.js');
      const r = await analyser(point.label, { rayon: Number(reglages.rayon) || undefined, user });
      if (!r.ok) throw new Error(r.error);
      return { ref: { type: 'adresse' }, resume: resumerVacance(r), libelle: r.point?.label || point.label };
    },
  },
  ktransactions: {
    nom: 'K-Transactions',
    lien: (a) => `/ktransactions?adresse=${encodeURIComponent(a.libelle || a.adresse)}`,
    async lancer(adresse, point, user, reglages = {}) {
      const { analyser } = await import('./ktransactions.js');
      const r = await analyser(point.label, { annees: Number(reglages.annees) || undefined, user });
      if (!r.ok) throw new Error(r.error);
      return { ref: { type: 'adresse' }, resume: resumerTransactions(r), libelle: r.point?.label || point.label };
    },
  },
};

export const CLES_OUTILS = Object.keys(OUTILS);

/** Attend qu'une fiche lancée en tâche de fond ait fini. */
async function attendreFiche(lire) {
  const debut = Date.now();
  for (;;) {
    const e = lire();
    if (!e) throw new Error('la fiche a disparu pendant le calcul');
    if (e.etat !== 'en_cours') return e;
    if (Date.now() - debut > ATTENTE_MAX_MS) throw new Error('le calcul a dépassé vingt-cinq minutes');
    await dors(2000);
  }
}

/** Le lien qui rouvre une analyse dans son outil. Pure : testée sans réseau. */
export function lienDe(a) {
  const outil = OUTILS[a?.outil];
  if (!outil || a?.etat !== 'terminee') return null;
  return outil.lien(a);
}

const noter = (id, patch) => Records.update(ENTITE, id, patch);

/**
 * Lance une analyse par outil demandé, toutes sur la même adresse, et rend
 * tout de suite leurs identifiants : chacune tourne de son côté.
 */
export function lancerAnalyses({ adresse, outils, reglages = {} }, user = null) {
  const texte = String(adresse || '').trim();
  if (texte.length < 5) return { ok: false, error: 'Il faut une adresse précise : numéro, rue, ville.' };
  const demandes = [...new Set((Array.isArray(outils) ? outils : []).map((o) => String(o || '').trim()).filter(Boolean))];
  if (!demandes.length) return { ok: false, error: 'Choisissez au moins un outil.' };
  const inconnus = demandes.filter((o) => !OUTILS[o]);
  if (inconnus.length) return { ok: false, error: `Outil inconnu : ${inconnus.join(', ')}.` };

  // Les réponses aux questions de chaque outil, ramenées à ce qu'il accepte.
  // Une question obligatoire restée vide arrête le lot ici : mieux vaut le
  // dire tout de suite que lancer une analyse qui échouera en chemin.
  const propres = nettoyerLot(demandes, reglages);
  for (const outil of demandes) {
    const manque = manquantes(outil, propres[outil] || {});
    if (manque.length) {
      return { ok: false, error: `${OUTILS[outil].nom} : il manque ${manque.map((m) => m.libelle.toLowerCase()).join(', ')}.` };
    }
  }

  const lot = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const le = new Date().toISOString();
  const analyses = demandes.map((outil) => Records.create(ENTITE, {
    outil, nom_outil: OUTILS[outil].nom, adresse: texte, libelle: texte, lot,
    // Gardés avec l'analyse : on doit pouvoir dire avec quels réglages elle a
    // été lancée, des mois plus tard.
    reglages: propres[outil] || null,
    etat: 'en_cours', erreur: null, ref: null, resume: null, dossier_id: null,
    cree_le: le, fini_le: null, par: user?.email || null,
  }, user?.email));

  // Une seule résolution d'adresse pour tout le lot, puis chaque outil part.
  // Un outil qui tombe ne fait pas tomber les autres.
  (async () => {
    let point = null;
    try { point = await resoudreAdresse(texte); } catch { point = null; }
    if (!point) {
      for (const a of analyses) noter(a.id, { etat: 'echec', erreur: `Adresse introuvable dans la Base Adresse Nationale : « ${texte.slice(0, 80)} ».`, fini_le: new Date().toISOString() });
      return;
    }
    for (const a of analyses) noter(a.id, { libelle: point.label });
    await Promise.all(analyses.map(async (a) => {
      try {
        const r = await OUTILS[a.outil].lancer(texte, point, user, propres[a.outil] || {});
        noter(a.id, { etat: 'terminee', ref: r.ref, resume: r.resume, libelle: r.libelle || point.label, fini_le: new Date().toISOString() });
      } catch (e) {
        noter(a.id, { etat: 'echec', erreur: e?.message || String(e), fini_le: new Date().toISOString() });
      }
    }));
  })().catch(() => {});

  return { ok: true, lot, ids: analyses.map((a) => a.id) };
}

/**
 * Les analyses, celles qui tournent d'abord, puis les plus récentes. Chaque
 * ligne porte son lien d'ouverture et le nom de son dossier.
 * Pure sur ses entrées : testée sans réseau.
 */
export function ordonner(analyses, dossiers = []) {
  const noms = new Map(dossiers.map((d) => [d.id, d.nom]));
  return [...analyses]
    .sort((a, b) => {
      const ea = a.etat === 'en_cours' ? 0 : 1;
      const eb = b.etat === 'en_cours' ? 0 : 1;
      return ea - eb || String(b.cree_le || '').localeCompare(String(a.cree_le || ''));
    })
    .map((a) => ({ ...a, lien: lienDe(a), dossier_nom: a.dossier_id ? noms.get(a.dossier_id) || null : null }));
}

/** Les affaires ouvertes, comme dossiers de rangement : leur deal_id et leur titre. */
export function listerDossiers() {
  return listerAffaires(300)
    .filter((d) => !d.archived)
    .map((d) => ({ id: d.deal_id, nom: d.titre || d.deal_id, cree_le: d.cree_le }));
}

/** Toutes les analyses, ou celles d'une seule affaire. */
export function listerAnalyses(limite = 60, { deal_id = null } = {}) {
  const toutes = Records.list(ENTITE).filter((a) => !deal_id || a.dossier_id === deal_id);
  return ordonner(toutes, listerDossiers()).slice(0, limite);
}

const affaireExiste = (deal_id) => Records.list('Deal').some((d) => d.deal_id === deal_id);

/** Range des analyses dans une affaire, ou les en sort avec `null`. */
export function ranger(ids, dossier_id) {
  const liste = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!liste.length) return { ok: false, error: 'Cochez au moins une analyse.' };
  if (dossier_id && !affaireExiste(dossier_id)) return { ok: false, error: "Ce dossier n'existe plus." };
  let n = 0;
  for (const id of liste) {
    if (!Records.get(ENTITE, id)) continue;
    Records.update(ENTITE, id, { dossier_id: dossier_id || null });
    n += 1;
  }
  if (!n) return { ok: false, error: "Aucune de ces analyses n'existe plus." };
  return { ok: true, rangees: n };
}

export function supprimerAnalyse(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: "Cette analyse n'existe plus." };
  Records.delete(ENTITE, id);
  return { ok: true };
}
