// Le fichier acquéreurs d'un mandataire (30 oct. 2026, Jules : « ils vont pouvoir importer leur fichier acquéreur
// s'ils en ont un »). Un Excel, un CSV ou une liste collée : les colonnes se reconnaissent par leur titre (nom,
// téléphone, budget, villes…) ; un titre inconnu, ou une liste sans colonnes, passe une fois par le modèle. Chaque
// acquéreur appartient à son seul mandataire ; il sert ensuite au rapprochement avec ses biens (acquereursPour).

import { Records } from './db.js';

const ENTITE = 'AcquereurMandataire';
const moi = (user) => String(user?.email || '').toLowerCase();
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const CHAMPS = ['nom', 'telephone', 'email', 'recherche', 'villes', 'budget_min', 'budget_max', 'rendement_min', 'remarque'];

// Le titre d'une colonne → le champ. L'ordre compte : « budget max » avant « budget ».
const TITRES = [
  [/^(nom|prenom|nom complet|contact|acquereur|client|investisseur|societe|raison sociale)\b/, 'nom'],
  [/(tel|telephone|portable|mobile|gsm|phone)/, 'telephone'],
  [/(e-?mail|courriel|mail)/, 'email'],
  [/(budget|prix|enveloppe).*(max|haut|jusqu)/, 'budget_max'],
  [/(budget|prix|enveloppe).*(min|bas|a partir)/, 'budget_min'],
  [/(budget|prix|enveloppe|montant|capacite)/, 'budget_max'],
  [/(rendement|renta|taux)/, 'rendement_min'],
  [/(ville|commune|secteur|zone|localisation|lieu|departement|region)/, 'villes'],
  [/(recherche|type|actif|bien|activite|cible|critere)/, 'recherche'],
  [/(remarque|note|commentaire|observation|info)/, 'remarque'],
];

/** Pure : le champ d'un titre de colonne, ou null. */
export function champDuTitre(titre) {
  const t = sansAccents(titre);
  return (TITRES.find(([re]) => re.test(t)) || [])[1] || null;
}

/** Pure : « 300 k€ », « 1,2 M€ », « 300 000 € » → 300000 ; « 6 % » → 6. */
export function montant(v) {
  const t = sansAccents(v).replace(/\s|\u00a0|\u202f/g, '');
  const m = t.match(/(\d+(?:[.,]\d+)?)(k|m|me|meur|millions?)?/);
  if (!m) return null;
  let n = Number(m[1].replace(',', '.'));
  if (/^k/.test(m[2] || '')) n *= 1000;
  else if (/^m/.test(m[2] || '')) n *= 1000000;
  else if (n < 10000 && /\d{1,3}[.,]\d{3}/.test(t)) n = Number(m[1].replace(/[.,]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Pure : un CSV ou une liste collée en tableau (séparateur deviné : tabulation, point-virgule, virgule). */
export function lireCsv(texte) {
  const lignes = String(texte || '').replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const premiere = lignes[0];
  const sep = ['\t', ';', ','].map((s) => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0];
  if (sep[1] < 2) return [];
  const couper = (l) => {
    const out = []; let cur = ''; let guill = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (guill && l[i + 1] === '"') { cur += '"'; i++; } else guill = !guill; } else if (c === sep[0] && !guill) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const entete = couper(premiere);
  return lignes.slice(1).map((l) => { const v = couper(l); return Object.fromEntries(entete.map((h, k) => [h || `colonne ${k + 1}`, v[k] ?? ''])); });
}

/** Pure : une ligne du fichier en acquéreur, d'après la correspondance titre → champ. Null s'il n'a ni nom ni contact. */
export function acquereurDeLigne(ligne, correspondance) {
  const a = {};
  for (const [titre, valeur] of Object.entries(ligne || {})) {
    const champ = correspondance[titre];
    const v = String(valeur ?? '').trim();
    if (!champ || !v) continue;
    if (champ === 'budget_min' || champ === 'budget_max' || champ === 'rendement_min') { const n = montant(v); if (n != null && a[champ] == null) a[champ] = n; continue; }
    if (champ === 'villes') { a.villes = [...new Set([...(a.villes || []), ...v.split(/[,;/|]| et /).map((x) => x.trim()).filter(Boolean)])].slice(0, 20); continue; }
    a[champ] = a[champ] ? `${a[champ]} · ${v}` : v;
  }
  // Un budget écrit « 300 – 500 k€ » dans une seule colonne : les deux bornes.
  const brut = Object.entries(ligne || {}).find(([t]) => correspondance[t] === 'budget_max')?.[1];
  const deux = String(brut || '').match(/(\d[\d\s.,]*\s*[kKmM]?)\s*(?:-|–|à|a)\s*(\d[\d\s.,]*\s*[kKmM€]*)/);
  if (deux && a.budget_min == null) {
    const unite = /m/i.test(deux[2]) ? 'M' : /k/i.test(deux[2]) ? 'k' : '';
    a.budget_min = montant(/[kKmM]/.test(deux[1]) ? deux[1] : `${deux[1]}${unite}`);
    a.budget_max = montant(deux[2]);
  }
  if (a.email) a.email = a.email.toLowerCase();
  if (!a.nom && !a.telephone && !a.email) return null;
  if (!a.nom) a.nom = a.email || a.telephone;
  return a;
}

const SCHEMA_CORRESPONDANCE = {
  type: 'object',
  properties: { correspondance: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, champ: { type: 'string', enum: [...CHAMPS, 'ignorer'] } }, required: ['titre', 'champ'] } } },
  required: ['correspondance'],
};
const SCHEMA_LISTE = {
  type: 'object',
  properties: { acquereurs: { type: 'array', items: { type: 'object', properties: {
    nom: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' }, recherche: { type: 'string' }, villes: { type: 'array', items: { type: 'string' } },
    budget_min: { type: 'number' }, budget_max: { type: 'number' }, rendement_min: { type: 'number' }, remarque: { type: 'string' },
  } } } },
  required: ['acquereurs'],
};

async function lignesDuFichier({ buffer = null, nom = '', texte = '' }) {
  if (buffer && /\.xlsx$/i.test(nom)) return (await import('./xlsx.js')).lireXlsx(buffer);
  if (buffer && /\.xls$/i.test(nom)) throw new Error('Ancien format Excel (.xls) : enregistrez le fichier en .xlsx ou en CSV.');
  return lireCsv(buffer ? buffer.toString('utf8') : texte);
}

/**
 * Lit un fichier ou une liste collée et rend les acquéreurs, sans rien enregistrer. Un tableau se lit par ses titres
 * (le modèle seulement pour les titres inconnus) ; un texte libre (« Dupont, 06…, cherche une pharmacie à Lyon »)
 * passe entier au modèle.
 */
export async function lireAcquereurs({ buffer = null, nom = '', texte = '' } = {}) {
  const lignes = await lignesDuFichier({ buffer, nom, texte });
  const { invokeLLM } = await import('./llm.js');
  if (!lignes.length) {
    const brut = String(buffer ? buffer.toString('utf8') : texte).trim();
    if (!brut) return { acquereurs: [], par: 'vide' };
    const r = await invokeLLM({
      prompt: `Voici le fichier d'acquéreurs d'un agent immobilier (murs commerciaux), en texte libre. Rends un acquéreur par personne ou société : nom, téléphone, e-mail, ce qu'il recherche (type de bien ou de commerce), villes, budget minimum et maximum en euros (« 300 k€ » = 300000), rendement minimum en %, remarque. N'invente rien : un champ absent reste vide.\n\n${brut.slice(0, 30000)}`,
      response_json_schema: SCHEMA_LISTE,
    });
    return { acquereurs: (r?.acquereurs || []).map((a) => acquereurDeLigne(Object.fromEntries(CHAMPS.map((c) => [c, Array.isArray(a[c]) ? a[c].join(', ') : a[c] ?? ''])), Object.fromEntries(CHAMPS.map((c) => [c, c])))).filter(Boolean), par: 'modele' };
  }
  const titres = Object.keys(lignes[0]);
  const correspondance = Object.fromEntries(titres.map((t) => [t, champDuTitre(t)]));
  const inconnus = titres.filter((t) => !correspondance[t]);
  let par = 'titres';
  if (inconnus.length && (!Object.values(correspondance).includes('nom') || inconnus.length >= titres.length / 2)) {
    const exemples = lignes.slice(0, 3).map((l) => JSON.stringify(l)).join('\n');
    const r = await invokeLLM({
      prompt: `Les colonnes d'un fichier d'acquéreurs d'un agent immobilier. Pour chaque titre, dis le champ qu'il contient parmi ${CHAMPS.join(', ')}, ou « ignorer ». Exemples de lignes :\n${exemples}\n\nTitres : ${JSON.stringify(titres)}`,
      response_json_schema: SCHEMA_CORRESPONDANCE,
    });
    for (const x of r?.correspondance || []) if (titres.includes(x.titre) && !correspondance[x.titre]) correspondance[x.titre] = x.champ === 'ignorer' ? null : x.champ;
    par = 'titres et modèle';
  }
  return { acquereurs: lignes.map((l) => acquereurDeLigne(l, correspondance)).filter(Boolean), correspondance, par };
}

const cleDe = (a) => [a.email ? `m:${a.email}` : null, a.telephone ? `t:${String(a.telephone).replace(/\D/g, '').slice(-9)}` : null, `n:${sansAccents(a.nom)}`].filter(Boolean);

/** Enregistre les acquéreurs lus pour ce mandataire ; un acquéreur déjà là (même e-mail, téléphone ou nom) n'est pas doublé. */
export function enregistrerAcquereurs(liste = [], user, { source = 'import' } = {}) {
  const deja = new Set(mesAcquereurs(user).flatMap(cleDe));
  let ajoutes = 0; let doublons = 0;
  for (const a of liste) {
    const cles = cleDe(a);
    if (cles.some((c) => deja.has(c))) { doublons += 1; continue; }
    Records.create(ENTITE, { ...Object.fromEntries(CHAMPS.map((c) => [c, a[c] ?? null])), mandataire_email: moi(user), source, cree_le: new Date().toISOString() });
    cles.forEach((c) => deja.add(c));
    ajoutes += 1;
  }
  return { ajoutes, doublons };
}

export const mesAcquereurs = (user) => Records.list(ENTITE).filter((a) => a.mandataire_email === moi(user)).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));

export function supprimerAcquereur(id, user) {
  const a = Records.get(ENTITE, id);
  if (!a || a.mandataire_email !== moi(user)) return { ok: false, error: 'Acquéreur introuvable.' };
  Records.delete(ENTITE, id);
  return { ok: true };
}

/**
 * Pure : les acquéreurs qui collent à un bien (ville, budget, ce qu'il cherche), les plus proches d'abord. Un critère
 * absent chez l'acquéreur ne l'écarte pas ; un critère contraire, si.
 */
export function acquereursPour(bien = {}, liste = []) {
  const ville = sansAccents(bien.ville);
  const prix = Number(bien.prix) || null;
  const mots = sansAccents([bien.type, bien.activite].filter(Boolean).join(' ')).split(/\W+/).filter((m) => m.length > 3);
  return liste.map((a) => {
    let score = 0; const pourquoi = [];
    if (ville && (a.villes || []).length) {
      if (!(a.villes || []).some((v) => sansAccents(v) && (ville.includes(sansAccents(v)) || sansAccents(v).includes(ville)))) return null;
      score += 2; pourquoi.push('la ville');
    }
    if (prix && (a.budget_max || a.budget_min)) {
      if (a.budget_max && prix > a.budget_max * 1.1) return null;
      if (a.budget_min && prix < a.budget_min * 0.8) return null;
      score += 2; pourquoi.push('le budget');
    }
    if (mots.length && a.recherche && mots.some((m) => sansAccents(a.recherche).includes(m))) { score += 1; pourquoi.push('ce qu’il cherche'); }
    return { ...a, score, pourquoi };
  }).filter(Boolean).sort((x, y) => y.score - x.score);
}
