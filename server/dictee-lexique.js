// La dictée écorche les noms propres : « Charnay-les-Macons » pour
// Charnay-lès-Mâcon, « a Macon » pour à Mâcon. Le modèle ne connaît pas le
// secteur ; nous, si. On corrige donc APRÈS coup, sans IA : les communes du
// secteur du mandataire, ses propriétaires et leurs commerces forment un
// lexique, et tout passage du texte qui s'y rapporte — aux accents, traits
// d'union et pluriels près — reprend sa vraie orthographe.

import { Records } from './db.js';

const normaliser = (t) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[-'’]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const PREPOSITIONS = new Set(['a', 'de', 'd', 'du', 'des', 'sur', 'vers', 'dans', 'chez', 'pres']);

/** Pure : les mots d'un texte, avec leur position et leur ponctuation collée. */
export function decouperEnMots(texte) {
  const mots = [];
  const re = /[^\s]+/g;
  let m;
  while ((m = re.exec(texte))) {
    const brut = m[0];
    const [, noyau, ponctuation] = brut.match(/^(.*?)([.,;:!?»")\]]*)$/);
    mots.push({ debut: m.index, fin: m.index + brut.length, brut, noyau, ponctuation, norme: normaliser(noyau) });
  }
  return mots;
}

/**
 * Pure : remplace dans `texte` chaque passage qui, normalisé, égale un terme
 * du lexique (le dernier mot tolère un pluriel). Un terme d'un seul mot ne se
 * remplace que s'il porte une majuscule ou suit une préposition de lieu :
 * « un maçon » reste un maçon, « à Macon » devient « à Mâcon ».
 */
export function corrigerDictee(texte, lexique = []) {
  const source = String(texte || '');
  if (!source.trim() || !lexique?.length) return source;
  const termes = [...new Set(lexique.filter(Boolean).map((t) => String(t).trim()))]
    .map((vrai) => ({ vrai, mots: normaliser(vrai).split(' ').filter(Boolean) }))
    .filter((t) => t.mots.length)
    .sort((a, b) => b.mots.length - a.mots.length);
  const tokens = decouperEnMots(source);
  // Un token du texte (« Charnay-les-Macons ») peut valoir plusieurs mots
  // normalisés : la correspondance se fait sur les mots APLATIS, et une
  // fenêtre ne peut que commencer au début d'un token et finir à la fin d'un
  // autre — on ne remplace jamais un demi-mot.
  const plats = [];
  tokens.forEach((t, it) => {
    const sous = t.norme ? t.norme.split(' ') : [];
    sous.forEach((mot, k) => plats.push({ mot, it, premier: k === 0, dernier: k === sous.length - 1 }));
  });
  const pris = new Array(plats.length).fill(false);
  const remplacements = [];

  for (const terme of termes) {
    const n = terme.mots.length;
    const voulu = terme.mots.join(' ');
    for (let d = 0; d + n <= plats.length; d += 1) {
      if (!plats[d].premier || !plats[d + n - 1].dernier) continue;
      if (pris.slice(d, d + n).some(Boolean)) continue;
      const premier = tokens[plats[d].it];
      const dernier = tokens[plats[d + n - 1].it];
      // La ponctuation ne vit qu'en fin de fenêtre : « Charnay, les Macon » ne colle pas.
      if (tokens.slice(plats[d].it, plats[d + n - 1].it).some((t) => t.ponctuation)) continue;
      const colle = plats.slice(d, d + n).map((x) => x.mot).join(' ');
      if (colle !== voulu && colle !== `${voulu}s`) continue;
      if (source.slice(premier.debut, dernier.fin - dernier.ponctuation.length) === terme.vrai) continue; // déjà bon
      if (n === 1 && plats[d].premier && plats[d].dernier) {
        const majuscule = /^[A-ZÀ-Ý]/.test(premier.noyau);
        const avantIdx = plats[d].it - 1;
        const avant = avantIdx >= 0 ? tokens[avantIdx] : null;
        const prep = avant && !avant.ponctuation && PREPOSITIONS.has(avant.norme);
        if (!majuscule && !prep) continue;
      }
      remplacements.push({ debut: premier.debut, fin: dernier.fin - dernier.ponctuation.length, par: terme.vrai });
      for (let k = d; k < d + n; k += 1) pris[k] = true;
    }
  }

  let resultat = source;
  for (const r of remplacements.sort((a, b) => b.debut - a.debut)) {
    resultat = resultat.slice(0, r.debut) + r.par + resultat.slice(r.fin);
  }
  return resultat;
}

/**
 * Le lexique d'une personne : les communes de son secteur, ses propriétaires
 * et leurs commerces, leurs villes. Borné, et jamais d'erreur : une dictée
 * sans lexique reste une dictée.
 */
export function lexiqueDe(user) {
  const termes = [];
  try {
    const email = String(user?.email || '').toLowerCase();
    const secteur = Records.list('SecteurMandataire').find((s) => s.mandataire_email === email);
    for (const u of secteur?.unites || []) termes.push(u.nom);
    const fiches = Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === email);
    for (const p of fiches.slice(0, 150)) {
      if (p.nom) termes.push(String(p.nom).replace(/^(m|mme|mr|monsieur|madame)\.?\s+/i, ''));
      if (p.commerce) termes.push(p.commerce);
      if (p.ville) termes.push(p.ville);
    }
    // Un admin n'a pas de secteur : les villes de la maison font son lexique.
    if (!secteur) {
      for (const v of Records.list('Ville').slice(0, 120)) if (!v.cachee && v.nom) termes.push(v.nom);
    }
  } catch { /* le lexique est un bonus */ }
  return [...new Set(termes.map((t) => String(t || '').trim()).filter((t) => t.length >= 3))];
}
