// Retrouver l'annonce publique d'un bien à partir de ce qu'on en sait.
//
// Une fiche arrive par mail, sans lien. Or le bien est presque toujours en
// ligne quelque part — portail, site de l'agence. Le modèle cherche sur le
// web ; mais ce n'est pas lui qui décide : une adresse n'entre au CRM que si
// la page répond et parle bien de ce bien-là (la ville, et le prix ou la
// surface). Sans cette preuve, on préfère aucun lien à un lien faux.
//
// Une recherche par bien, mémorisée sept jours — trouvée ou non — pour ne
// pas payer deux fois la même question.

import { Records } from '../db.js';

const SEPT_JOURS = 7 * 86400000;

const normaliser = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Le premier http(s) trouvé dans un texte, débarrassé de la ponctuation qui suit. */
function extraireUrl(texte) {
  const m = String(texte || '').match(/https?:\/\/[^\s<>"')\]]+/);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

/**
 * La page existe-t-elle, et parle-t-elle de ce bien ? Preuve déterministe :
 * la ville doit y figurer, et le prix ou la surface. Un portail qui renvoie
 * une page « annonce expirée » n'a ni l'un ni l'autre.
 */
async function pageParleDuBien(url, { ville, prix, surface }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Klocka/1.0)', Accept: 'text/html,*/*' },
    });
    if (!resp.ok) return false;
    const html = normaliser((await resp.text()).slice(0, 400000));
    const titre = (html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '';
    // « 47 annonces à Lyon » : une page de résultats, pas un bien. Elle
    // contient toutes les villes et tous les prix — elle passerait tout.
    if (/\b\d+\s+(annonces?|biens?|resultats?|offres?)\b/.test(titre)) return false;
    const texte = html.replace(/<[^>]+>/g, ' ');
    const compact = texte.replace(/[\s.  ]/g, '');
    const villeOk = ville ? texte.includes(normaliser(ville)) : true;
    const present = (n) => typeof n === 'number' && n > 0 && compact.includes(String(Math.round(n)));
    const prixOk = present(prix);
    const surfaceOk = present(surface);
    // Une annonce a un identifiant dans son adresse ; un index de ville, non.
    const aUnId = /\d{5,}/.test(url) || /\/(annonce|offre|bien|local|vente)[-_/][^/]*\d/.test(url);
    if (!villeOk) return false;
    if (prix > 0 && surface > 0) return prixOk && surfaceOk;
    return (prixOk || surfaceOk) && aUnId;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cherche l'annonce d'un bien.
 * @param {{rue?, ville?, prix?, surface?, loyer?, activite?, locataire?, agence?}} bien
 * @returns {Promise<{url: string, titre: string|null}|null>}
 */
export async function chercherAnnonce(bien) {
  const { invokeLLMGrounded } = await import('../llm.js');
  const description = [
    bien.rue ? `adresse : ${bien.rue}` : null,
    bien.ville ? `ville : ${bien.ville}` : null,
    bien.prix ? `prix : ${bien.prix} €` : null,
    bien.surface ? `surface : ${bien.surface} m²` : null,
    bien.loyer ? `loyer annuel : ${bien.loyer} €` : null,
    bien.activite ? `activité du locataire : ${bien.activite}` : null,
    bien.locataire ? `locataire : ${bien.locataire}` : null,
    bien.agence ? `agence ou agent : ${bien.agence}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  if (!bien.ville && !bien.rue) return null;

  const r = await invokeLLMGrounded({
    prompt: `Retrouve l'annonce en ligne (vente de murs commerciaux / local commercial occupé) correspondant à ce bien, sur un portail immobilier (SeLoger, Leboncoin, BureauxLocaux, Geolocaux, CessionPME, Logic-Immo, Bien'ici…) ou le site de l'agence.

${description}

Réponds UNIQUEMENT par l'URL complète de l'annonce si tu en trouves une qui correspond à ce bien précis (même adresse ou même ville, prix ou surface concordants). Si tu n'es pas sûr, réponds exactement : AUCUNE`,
  });
  if (!r?.text) return null;

  // L'URL du texte d'abord, puis les sources, dans l'ordre : on prend la
  // première qui prouve qu'elle parle du bien.
  const candidates = [extraireUrl(r.text), ...(r.sources || []).map((s) => s.url)].filter(Boolean);
  for (const url of candidates.slice(0, 5)) {
    if (await pageParleDuBien(url, bien)) {
      const source = (r.sources || []).find((s) => s.url === url);
      return { url, titre: source?.titre || null };
    }
  }
  return null;
}

/**
 * L'annonce d'un enregistrement (Deal ou Project), mémorisée sur lui.
 * @returns {Promise<string|null>} l'URL, ou null
 */
export async function annonceDe(entite, record, bien, { forcer = false } = {}) {
  if (record.annonce_url) return record.annonce_url;
  if (!forcer && record.annonce_cherchee_le && Date.now() - new Date(record.annonce_cherchee_le).getTime() < SEPT_JOURS) {
    return null;
  }
  const { mesurer } = await import('../llm-couts.js');
  const { resultat } = await mesurer({ operation: 'annonce', sur: record.deal_id || record.id }, () => chercherAnnonce(bien));
  Records.update(entite, record.id, {
    annonce_url: resultat?.url || null,
    annonce_titre: resultat?.titre || null,
    annonce_cherchee_le: new Date().toISOString(),
  });
  return resultat?.url || null;
}
