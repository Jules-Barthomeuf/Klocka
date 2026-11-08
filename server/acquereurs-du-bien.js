// Les acquéreurs d'un bien en vente (7 nov. 2026, Jules : « fais comme dans un tableau Monday »). Après le teaser et les
// annonces, le mandataire qui commercialise seul passe son temps sur ses acheteurs : chaque personne qui appelle est une
// ligne, groupée par où elle en est (contact, qualifié, visite, offre, signé, écarté), avec son projet, sa visite et son
// bon, son offre et la prochaine action. En location, les mêmes lignes se lisent en candidats, et « signé » est le bail.
// Tout se remplit à la main dans le tableau ou en racontant au chat (outil noter_acquereur).

import { Records } from './db.js';

const PISTE = 'PisteAcquereur';
const maintenant = () => new Date().toISOString();
const emailDe = (u) => String(u?.email || '').toLowerCase();
const texte = (v, max = 400) => (v == null ? null : String(v).trim().slice(0, max) || null);
const norme = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Les groupes du tableau, dans l'ordre du travail. Le libellé de location quand il diffère. */
export const STATUTS = [
  { cle: 'contact', mot: 'Nouveau contact', location: 'Nouveau contact' },
  { cle: 'qualifie', mot: 'Qualifié', location: 'Dossier reçu' },
  { cle: 'visite', mot: 'Visite', location: 'Visite' },
  { cle: 'offre', mot: 'Offre', location: 'Accord' },
  { cle: 'signe', mot: 'Signé', location: 'Bail signé' },
  { cle: 'ecarte', mot: 'Écarté', location: 'Écarté' },
];
const CLES = new Set(STATUTS.map((x) => x.cle));
export const SOURCES = ['Leboncoin', 'SeLoger', 'LinkedIn', 'Réseau', 'Fichier', 'Panneau', 'Confrère', 'Autre'];

const sienne = (id, user) => {
  const x = Records.get(PISTE, id);
  return x && (x.mandataire_email === emailDe(user) || user?.role === 'admin') ? x : null;
};

/** Pure : un montant dit (« 600 k », « 1,2 M€ », « 580000 ») en euros, ou null. */
export function montantDit(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const t = String(v).replace(/[\s\u202f\u00a0]/g, '').replace(',', '.').toLowerCase();
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m)?/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  return n > 0 ? Math.round(n) : null;
}

/** Pure : la ligne telle que le tableau la montre, avec la dernière visite de la personne sur ce bien. */
export function ligneDe(x, visites = []) {
  const v = visites.filter((y) => x.acquereur_id && y.acquereur?.acquereur_id === x.acquereur_id && (!y.bien?.marche_id || y.bien.marche_id === x.marche_id)).sort((a, b) => String(b.quand).localeCompare(String(a.quand)))[0] || null;
  const etatBon = v ? (v.bon?.signe_le ? 'signe' : Date.parse(v.quand) <= Date.now() ? 'manquant' : 'a_signer') : null;
  return {
    id: x.id, nom: x.nom, telephone: x.telephone || null, email: x.email || null, source: x.source || null, statut: x.statut,
    projet: x.projet || null, budget: x.budget || null, offre: x.offre || null, prochaine: x.prochaine || null, prochaine_le: x.prochaine_le || null,
    note: x.note || null, cree_le: x.cree_le, maj_le: x.maj_le || x.cree_le,
    visite: v ? { id: v.id, quand: v.quand, bon: etatBon, bon_via: v.bon?.via || null, lien: !!v.lien_bon?.jeton, compte_rendu: !!v.envoi?.le } : null,
  };
}

/** Le tableau d'une commercialisation : ses groupes et leurs lignes. */
export async function tableauDe(marcheId, user) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  const d = m.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const location = d ? P.transactionDuDossier(d) === 'location' : m.teaser?.classe === 'a_louer';
  const visites = Records.list('VisiteAcquereur').filter((v) => v.bien?.marche_id === m.id || (v.bien?.cles || []).includes(`marche:${m.id}`));
  const lignes = Records.list(PISTE).filter((x) => x.marche_id === m.id).map((x) => ligneDe(x, visites));
  return {
    ok: true, location,
    statuts: STATUTS.map((s) => ({ cle: s.cle, mot: location ? s.location : s.mot })),
    sources: SOURCES,
    lignes: lignes.sort((a, b) => String(b.maj_le).localeCompare(String(a.maj_le))),
  };
}

const CHAMPS = ['nom', 'telephone', 'email', 'source', 'projet', 'prochaine', 'note'];

/** Pure : le patch d'une ligne depuis ce que l'écran ou le chat envoie ; rend { patch } ou { error }. */
export function patchDe(corps = {}) {
  const patch = {};
  for (const k of CHAMPS) if (corps[k] !== undefined) patch[k] = texte(corps[k], k === 'note' || k === 'projet' ? 1000 : 200);
  if (patch.email) patch.email = patch.email.toLowerCase();
  if (corps.statut !== undefined) {
    if (!CLES.has(corps.statut)) return { error: 'Statut inconnu.' };
    patch.statut = corps.statut;
  }
  if (corps.budget !== undefined) patch.budget = montantDit(corps.budget);
  if (corps.offre !== undefined) patch.offre = montantDit(corps.offre);
  if (corps.prochaine_le !== undefined) {
    const t = corps.prochaine_le ? Date.parse(corps.prochaine_le) : null;
    if (corps.prochaine_le && !Number.isFinite(t)) return { error: 'Date illisible.' };
    patch.prochaine_le = t ? new Date(t).toISOString() : null;
  }
  // Une offre dite fait passer la ligne en Offre, si elle était avant.
  if (patch.offre && !patch.statut) patch.statut_si_avant = 'offre';
  return { patch };
}

const RANG = Object.fromEntries(STATUTS.map((s, i) => [s.cle, i]));

/** Une ligne de plus dans un groupe. L'acquéreur est aussi créé dans le carnet du mandataire, pour ses visites. */
export async function ajouterLigne(marcheId, corps = {}, user) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  const { patch, error } = patchDe({ statut: 'contact', ...corps });
  if (error) return { ok: false, error };
  const nom = patch.nom || 'Nouveau contact';
  const a = Records.create('AcquereurMandataire', { mandataire_email: m.mandataire_email, nom, telephone: patch.telephone || null, email: patch.email || null, historique: [], cree_le: maintenant() });
  delete patch.statut_si_avant;
  const x = Records.create(PISTE, { mandataire_email: m.mandataire_email, marche_id: m.id, acquereur_id: a.id, ...patch, nom, cree_le: maintenant(), maj_le: maintenant(), historique: [{ le: maintenant(), par: emailDe(user), action: 'ajouté' }] });
  return { ok: true, ligne: ligneDe(x) };
}

/** Une cellule changée. Le nom, le téléphone et le mail suivent dans le carnet. */
export function modifierLigne(id, corps = {}, user) {
  const x = sienne(id, user);
  if (!x) return { ok: false, error: 'Ligne introuvable.' };
  const { patch, error } = patchDe(corps);
  if (error) return { ok: false, error };
  if (patch.statut_si_avant) { if (RANG[x.statut] < RANG.offre) patch.statut = 'offre'; delete patch.statut_si_avant; }
  const action = patch.statut && patch.statut !== x.statut ? `${x.statut} → ${patch.statut}` : `modifié : ${Object.keys(patch).join(', ')}`;
  const y = Records.update(PISTE, x.id, { ...patch, maj_le: maintenant(), historique: [...(x.historique || []), { le: maintenant(), par: emailDe(user), action }].slice(-50) });
  const carnet = Object.fromEntries(['nom', 'telephone', 'email'].filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]]));
  if (x.acquereur_id && Object.keys(carnet).length && Records.get('AcquereurMandataire', x.acquereur_id)) Records.update('AcquereurMandataire', x.acquereur_id, carnet);
  return { ok: true, ligne: ligneDe(y) };
}

/** Une ligne retirée du tableau (le contact reste dans le carnet). */
export function retirerLigne(id, user) {
  const x = sienne(id, user);
  if (!x) return { ok: false, error: 'Ligne introuvable.' };
  Records.delete(PISTE, x.id);
  return { ok: true };
}

/** La visite d'une ligne : créée sur le bien, avec son bon à signer ; la ligne passe en Visite. */
export async function planifierVisite(id, { quand } = {}, user) {
  const x = sienne(id, user);
  if (!x) return { ok: false, error: 'Ligne introuvable.' };
  const m = Records.get('MiseEnMarche', x.marche_id);
  const d = m?.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const P = await import('./mandataire-portes.js');
  const fiche = d ? P.ficheDuDossier(d) : null;
  const cles = [`marche:${m.id}`, d && `dossier:${d.id}`, fiche && `proprietaire:${fiche.id}`, d?.mandat_id && `mandat:${d.mandat_id}`].filter(Boolean);
  // Le titre sans l'adresse qu'il porte déjà (« Local de 60 m² · 38 rue… ») : le bon ne la répète pas.
  const bien = { cles, titre: String(m.bien || 'Bien').split(' · ')[0], adresse: d?.adresse || String(m.bien || '').split(' · ')[1] || null, location: P.transactionDuDossier(d) === 'location', proprietaire_id: fiche?.id || null, mandat_id: d?.mandat_id || null, dossier_id: d?.id || null, marche_id: m.id, estimation_id: null };
  const V = await import('./visites-acquereur.js');
  const r = await V.creerVisite({ bien, acquereur: { acquereur_id: x.acquereur_id }, quand }, { ...user, email: x.mandataire_email });
  if (!r.ok) return r;
  // Une visite à venir est la prochaine action, avec son échéance (8 nov. 2026, Jules : « elle n'est pas en visite, une
  // visite est programmée ») : le statut passe à Visite quand le bon est signé (server/visites-acquereur.js).
  const heure = new Date(r.visite.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ');
  Records.update(PISTE, x.id, { prochaine: `Visite à ${heure}`, prochaine_le: String(r.visite.quand).slice(0, 10), maj_le: maintenant(), historique: [...(x.historique || []), { le: maintenant(), par: emailDe(user), action: `visite prévue le ${String(r.visite.quand).slice(0, 10)} à ${heure}` }].slice(-50) });
  return { ok: true, visite: r.visite };
}

// ---------------------------------------------------------------------------
// Le chat : noter un acquéreur en le racontant
// ---------------------------------------------------------------------------

export const OUTIL_ACQUEREUR = {
  name: 'noter_acquereur',
  description: "Ajoute ou met à jour une ligne du tableau des acquéreurs (en location : des candidats) d'un bien en commercialisation, d'après ce que raconte le mandataire : « un tel m'a appelé pour la brasserie, budget 600 k, il visite jeudi », « Durand a fait une offre à 560 k », « écarte Martin ». Une personne déjà dans le tableau (même nom) est mise à jour. statut : contact, qualifie (projet et budget connus ; en location, dossier reçu), visite, offre, signe, ecarte. Une visite datée : quand (ISO) la crée avec son bon de visite. N'invente rien : un champ non dit reste vide.",
  input_schema: {
    type: 'object',
    properties: {
      bien: { type: 'string', description: 'Le bien, tel que le mandataire le nomme (vide si la fiche ouverte est le bien)' },
      nom: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' },
      source: { type: 'string', description: 'Leboncoin, SeLoger, LinkedIn, Réseau, Fichier, Panneau, Confrère, Autre' },
      statut: { type: 'string', enum: STATUTS.map((s) => s.cle) },
      projet: { type: 'string' }, budget: { type: 'string' }, offre: { type: 'string' },
      prochaine: { type: 'string', description: 'La prochaine action (« rappeler », « envoyer le dossier »)' },
      prochaine_le: { type: 'string', description: 'AAAA-MM-JJ' },
      visite_le: { type: 'string', description: "La visite, date et heure ISO (heure de Paris), si elle est fixée" },
      note: { type: 'string' },
    },
    required: ['nom'],
  },
};

/** L'outil du chat : la commercialisation du bien (la fiche ouverte, ou le bien nommé), puis la ligne. */
const VIDES = new Set(['et', 'les', 'la', 'le', 'de', 'du', 'des', 'mme', 'mr', 'm', 'madame', 'monsieur', 'test', 'famille', 'couple']);
const motsDuNom = (t) => norme(t).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !VIDES.has(w));
/**
 * Pure : la ligne d'une personne parmi celles d'un bien. Tous les mots du nom dit dans ceux d'une ligne (ou l'inverse),
 * sans « (test) », « et », « les » ; sinon le même nom de famille, s'il n'est qu'à une ligne. Plusieurs : `ambigu`.
 */
export function memeContact(lignes = [], nom) {
  const dits = motsDuNom(nom);
  if (!dits.length) return { ligne: null, ambigu: null };
  const contient = (a, b) => a.every((w) => b.includes(w));
  const pleins = lignes.filter((x) => { const m = motsDuNom(x.nom); return m.length && (contient(dits, m) || contient(m, dits)); });
  if (pleins.length === 1) return { ligne: pleins[0], ambigu: null };
  if (pleins.length > 1) return { ligne: null, ambigu: pleins };
  const famille = dits[dits.length - 1];
  const parFamille = lignes.filter((x) => motsDuNom(x.nom).includes(famille));
  if (parFamille.length === 1) return { ligne: parFamille[0], ambigu: null };
  return { ligne: null, ambigu: parFamille.length > 1 ? parFamille : null };
}

export async function noterAcquereur(input = {}, user, { fiche = null } = {}) {
  const P = await import('./mandataire-portes.js');
  const moi = emailDe(user);
  const marches = P.listerMarches({ ...user, role: user?.role === 'admin' ? 'mandataire' : user?.role }).filter((m) => m.mandataire_email === moi && !m.exemple);
  let m = null;
  if (fiche) m = marches.find((x) => { const d = x.dossier_id ? Records.get('DossierMandataire', x.dossier_id) : null; return d && P.ficheDuDossier(d)?.id === fiche.id; }) || null;
  if (!m && input.bien) {
    const mots = norme(input.bien).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const tri = marches.map((x) => [x, mots.filter((w) => norme(x.bien).includes(w)).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    if (tri.length > 1 && tri[0][1] === tri[1][1]) return { ok: false, error: 'Plusieurs biens en vente correspondent : demande lequel en une ligne.' };
    m = tri[0]?.[0] || null;
  }
  if (!m && marches.length === 1) m = marches[0];
  if (!m) return { ok: false, error: marches.length ? 'Pour quel bien en vente ? Demande-le en une ligne.' : "Aucun bien en commercialisation : le tableau des acquéreurs s'ouvre à la mise en vente." };
  // La ligne déjà là pour cette personne (8 nov. 2026, Jules : « il a créé de nouvelles lignes au lieu de mettre à jour
  // celles présentes ») : « Sophie Martin » retrouve « (test) Sophie Martin », « les Bertrand » « Joël et Marie Bertrand ».
  const { ambigu, ligne: meme } = memeContact(Records.list(PISTE).filter((x) => x.marche_id === m.id), input.nom);
  if (ambigu) return { ok: false, ambigu: true, choix: ambigu.map((x) => x.nom), error: 'Plusieurs lignes du tableau peuvent être cette personne : demande laquelle en une ligne, rien n\'est créé.' };
  const corps = Object.fromEntries(['nom', 'telephone', 'email', 'source', 'statut', 'projet', 'budget', 'offre', 'prochaine', 'prochaine_le', 'note'].filter((k) => input[k] != null && input[k] !== '').map((k) => [k, input[k]]));
  // Une ligne retrouvée garde son nom (« (test) Sophie Martin » ne devient pas « Sophie Martin »).
  if (meme) delete corps.nom;
  const r = meme ? modifierLigne(meme.id, corps, user) : await ajouterLigne(m.id, corps, user);
  if (!r.ok) return r;
  let visite = null;
  if (input.visite_le) {
    const v = await planifierVisite(r.ligne.id, { quand: input.visite_le }, user);
    if (!v.ok) return { ...r, avertissement: `Ligne notée, mais la visite n'est pas créée : ${v.error}` };
    visite = v.visite;
  }
  return {
    ok: true, cree: !meme, bien: m.bien, ligne: r.ligne, ...(visite ? { visite_id: visite.id, visite_quand: visite.quand } : {}),
    note: `${meme ? 'Ligne mise à jour' : 'Ligne ajoutée'} dans le tableau des acquéreurs (Mise en vente, onglet Acquéreurs).${visite ? " La visite est sa prochaine action : sur place, il touche le nom de la personne, puis « Bon de visite », et le visiteur signe sur son téléphone. Après la visite, « envoie le bon de visite » prépare le mail." : ''} Dis-le en une ligne.`,
  };
}
