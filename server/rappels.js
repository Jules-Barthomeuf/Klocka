// Les rappels : « rappelle-moi dans trois jours de rappeler Marc, voici son
// numéro ». On dit la chose au chat, elle revient sous le chat le jour venu.
//
// Chacun voit ses rappels. L'échéance se lit dans la phrase — « dans 3 jours »,
// « lundi », « le 12/09 » — et le modèle n'intervient que si la phrase ne se
// laisse pas lire toute seule.

import { Records } from './db.js';
import { invokeLLM } from './llm.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// --- L'heure de Paris -------------------------------------------------------
//
// Le serveur tourne en UTC (Render) : « demain matin » doit vouloir dire
// 9 h à Paris, pas 9 h UTC ni midi, et « demain » dit à minuit et demi à
// Paris doit compter depuis le jour de Paris, pas depuis le jour UTC.

const PARIS = 'Europe/Paris';

/** Pure : la date de ce jour-là à Paris, en clair. */
function dateAParis(d = new Date()) {
  const [a, mo, j] = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).split('-').map(Number);
  return { a, mo, j };
}

/** Pure : l'instant « ce jour-là à h:mi, heure de Paris », été comme hiver. */
export function instantParis(a, mo, j, h = 12, mi = 0) {
  const commeUtc = Date.UTC(a, mo - 1, j, h, mi);
  const vu = new Date(new Date(commeUtc).toLocaleString('en-US', { timeZone: PARIS }));
  const enUtc = new Date(new Date(commeUtc).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(commeUtc - (vu.getTime() - enUtc.getTime()));
}

/** Pure : l'heure de Paris d'un instant donné, pour la garder en reportant. */
export function heureParis(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { h: 9, mi: 0 };
  const [h, mi] = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).split(':').map(Number);
  return { h, mi };
}

/** Pure : dans n jours du calendrier de Paris, à h heures de Paris. */
export function dansNJoursParis(n, h = 12, mi = 0) {
  const { a, mo, j } = dateAParis();
  const d = new Date(Date.UTC(a, mo - 1, j + n));
  return instantParis(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi);
}

/**
 * L'heure dite dans la phrase : « à 9h », « 14 h 30 », « matin », « midi »,
 * « après-midi », « soir ». Null quand rien n'est dit.
 */
export function lireHeure(texte) {
  const t = sansAccents(texte);
  let m;
  if ((m = t.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/)) && Number(m[1]) <= 23) return { h: Number(m[1]), mi: Number(m[2] || 0) };
  if (/\bmatin(ee)?\b/.test(t)) return { h: 9, mi: 0 };
  if (/apres[- ]midi/.test(t)) return { h: 14, mi: 0 };
  if (/\bmidi\b/.test(t)) return { h: 12, mi: 0 };
  if (/\bsoir(ee)?\b/.test(t)) return { h: 18, mi: 0 };
  return null;
}

/** L'échéance lue dans la phrase, ou null. */
export function lireEcheance(texte) {
  const t = sansAccents(texte);
  const { h, mi } = lireHeure(t) || { h: 12, mi: 0 };
  const dansN = (n) => dansNJoursParis(n, h, mi);
  let m;
  if ((m = t.match(/dans\s+(\d{1,3})\s*(jour|j\b|jours)/))) return dansN(Number(m[1]));
  if ((m = t.match(/dans\s+(\d{1,2})\s*semaine/))) return dansN(7 * Number(m[1]));
  if ((m = t.match(/dans\s+(\d{1,2})\s*mois/))) {
    const { a, mo, j } = dateAParis();
    const d = new Date(Date.UTC(a, mo - 1 + Number(m[1]), j));
    return instantParis(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi);
  }
  if (/apres[- ]demain/.test(t)) return dansN(2);
  if (/\bdemain\b/.test(t)) return dansN(1);
  if (/aujourd|ce matin|cet apres[- ]midi|ce soir|ce midi/.test(t)) return dansN(0);
  // Une date chiffrée : jj/mm, pas un téléphone (06.12.34.56.78 n'est pas le 6 décembre 2034).
  if ((m = t.match(/(?<![\d./])\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b(?![./\d])/))) {
    if (Number(m[1]) > 31 || Number(m[2]) > 12) return null;
    const annee = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : dateAParis().a;
    const d = instantParis(annee, Number(m[2]), Number(m[1]), h, mi);
    if (!m[3] && d < new Date()) return instantParis(annee + 1, Number(m[2]), Number(m[1]), h, mi);
    return d;
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${JOURS[i]}\\b`).test(t)) {
      const { a, mo, j } = dateAParis();
      let ecart = (i - new Date(Date.UTC(a, mo - 1, j)).getUTCDay() + 7) % 7;
      if (ecart === 0) ecart = 7;
      return dansN(ecart);
    }
  }
  return null;
}

/** Le numéro de téléphone, ou null. */
export function lireTelephone(texte) {
  const m = String(texte || '').match(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/);
  return m ? m[0].replace(/[\s.-]/g, '') : null;
}

/** Le nom : ce qui suit « rappeler », « appeler », « nom : ». */
export function lireNom(texte) {
  const t = String(texte || '');
  let m;
  if ((m = t.match(/nom\s*:\s*([^\n,;]+)/i))) return m[1].trim();
  if ((m = t.match(/(?:de\s+)?(?:rappeler|appeler|relancer|contacter)\s+([A-ZÀ-Ý][^\n,;:]{1,60}?)(?=\s*(?:,|;|:|\bvoici\b|\bson\b|\bau\b|\bdans\b|$))/i))) return m[1].trim();
  return null;
}

// « Rappelle-moi de… » : le modèle rend parfois « moi », « moi-même » comme
// personne à joindre. Ce n'est personne, c'est celui qui pose le rappel.
const SOI = /^(moi|moi[- ]m[eê]me|me|je|nous|soi)$/i;

/**
 * Ce qu'il faut faire, quand la phrase ne nomme personne : ce qui suit « de »
 * après le moment. « Rappelle-moi jeudi de vérifier le bail » → « vérifier le
 * bail ».
 */
export function objetDuRappel(texte) {
  // Le numéro ne fait pas partie de ce qu'il y a à faire : il est lu à part et
  // devient un bouton d'appel sur la carte. Laissé dans le titre, il s'y
  // affichait une fois, puis une seconde fois à côté.
  const t = String(texte || '')
    .replace(/[\s,;]*(?:voici\s+(?:son|le)\s+(?:num[ée]ro|t[ée]l[ée]phone)\s*:?\s*|num[ée]ro\s*:?\s*|t[ée]l[ée]phone\s*:?\s*|au\s+|sur\s+)?(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}.*$/i, '')
    .trim();
  let m;
  if ((m = t.match(/\bde\s+([^\n.;]{3,120})/i))) return m[1].trim().replace(/\s+$/, '');
  // Sans « de », on ampute la phrase de sa formule d'ouverture ET du moment,
  // qui est déjà lu par ailleurs : « rappelle-moi dans 3 jours le PV d'AG »
  // laisse « le PV d'AG », pas « dans 3 jours le PV d'AG ».
  const nu = t
    .replace(/^\s*(rappelle[- ]moi|rappel|pense[rz]?\s+à|note)\b[\s,:]*/i, '')
    .replace(/^\s*(dans\s+\d{1,3}\s*(?:jours?|j|semaines?|mois)|demain|apr[eè]s[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le\s+\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)\b[\s,:]*/i, '')
    .trim();
  return nu.length >= 3 ? nu.slice(0, 120) : null;
}

const capitale = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Le titre d'un rappel : ce qu'on a demandé, tel qu'on l'a demandé. Le nom
 * ne sert de titre que pour les rappels d'avant, qui ne portaient pas `quoi`.
 */
export function titreDuRappel(r) {
  return capitale(r?.quoi || null) || (r?.nom ? `Rappeler ${r.nom}` : null) || r?.note || 'Rappel';
}

async function lireParModele(texte) {
  const { mesurer } = await import('./llm-couts.js');
  const { resultat } = await mesurer({ operation: 'rappel' }, () => invokeLLM({
    prompt: `Lis cette demande de rappel et réponds en JSON : nom de la personne à rappeler, numéro de téléphone s'il y en a un, nombre de jours avant le rappel (0 si aujourd'hui), et une note courte sur le motif. Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.\n\n« ${texte} »`,
    response_json_schema: {
      type: 'object',
      properties: { nom: { type: 'string' }, telephone: { type: 'string' }, dans_jours: { type: 'number' }, note: { type: 'string' } },
      required: ['nom', 'dans_jours'],
    },
    // Lire une date et un nom dans une phrase : rien à raisonner.
    effort: 'low',
  })).catch(() => ({ resultat: null }));
  return resultat && typeof resultat === 'object' ? resultat : null;
}

/**
 * Crée un rappel depuis la phrase dite au chat.
 * @returns {{ ok, rappel, error? }}
 */
export async function creerRappel({ texte, user }) {
  const brut = String(texte || '').trim();
  if (!brut) return { ok: false, error: 'Rien à noter' };
  let echeance = lireEcheance(brut);
  let nom = lireNom(brut);
  let telephone = lireTelephone(brut);
  let note = null;
  if (!echeance || !nom) {
    const lu = await lireParModele(brut);
    if (lu) {
      if (!nom && lu.nom && !SOI.test(String(lu.nom).trim())) nom = String(lu.nom).trim();
      if (!telephone && lu.telephone) telephone = lireTelephone(lu.telephone) || String(lu.telephone).trim();
      if (!echeance && isFinite(Number(lu.dans_jours))) { const he = lireHeure(brut) || { h: 12, mi: 0 }; echeance = dansNJoursParis(Math.max(0, Math.round(Number(lu.dans_jours))), he.h, he.mi); }
      if (lu.note) note = String(lu.note).trim();
    }
  }
  if (!echeance) return { ok: false, error: 'Je ne lis pas quand : dites « dans 3 jours », « lundi » ou une date.' };
  // Ce qu'il y a à faire, gardé tel quel : c'est le titre du rappel. Un rappel
  // n'est pas toujours un appel — « rappelle-moi jeudi de vérifier la surface
  // Carrez » en est un, sans personne à joindre — et quand il en est un, le
  // verbe dit est celui qu'on relira : relancer, passer voir, rappeler.
  const quoi = objetDuRappel(brut);
  if (!nom && !quoi) return { ok: false, error: 'Je ne lis pas ce qu\'il faut faire : dites « relancer Marc » ou « vérifier le bail ».' };
  const rappel = Records.create('Rappel', {
    nom,
    quoi,
    telephone: telephone || null,
    // La note dit le motif, pas la phrase qu'on a dictée : « rappelle-moi dans
    // 2 jours de rappeler Marc » laisse « rappeler Marc », pas tout le reste.
    note: note || objetDuRappel(brut) || brut,
    echeance: echeance.toISOString(),
    cree_le: new Date().toISOString(),
    cree_par: user?.email || null,
    fait_le: null,
  });
  return { ok: true, rappel: { ...rappel, titre: titreDuRappel(rappel) } };
}

// La distance en jours, dans le calendrier de Paris.
const jourParis = (d) => { const { a, mo, j } = dateAParis(d); return Date.UTC(a, mo - 1, j); };
const dans = (iso) => Math.round((jourParis(new Date(iso)) - jourParis(new Date())) / 86400000);

/** Les rappels de la personne : ceux qui sont dus, puis ceux à venir. */
export function listerRappels(user) {
  const tous = Records.list('Rappel')
    // Les rappels de l'espace mandataire n'ont rien à faire dans le dashboard admin.
    .filter((r) => !r.fait_le && !r.espace && (!user?.email || !r.cree_par || r.cree_par === user.email))
    .map((r) => ({ ...r, dans: dans(r.echeance) }))
    .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)));
  return { dus: tous.filter((r) => r.dans <= 0), a_venir: tous.filter((r) => r.dans > 0), total: tous.length };
}

// Un rappel appartient à qui l'a posé : personne d'autre ne le clôt ni ne le
// supprime. Les rappels d'avant cette règle n'ont pas d'auteur : ils restent
// ouverts à tous, faute de savoir à qui les rendre.
const sien = (r, user) => !r.cree_par || !user?.email || r.cree_par === user.email;

export function terminerRappel(id, user) {
  const r = Records.get('Rappel', id);
  if (!r) return { ok: false, error: 'Rappel introuvable' };
  if (!sien(r, user)) return { ok: false, error: 'Ce rappel est celui de quelqu\'un d\'autre.' };
  Records.update('Rappel', id, { fait_le: new Date().toISOString(), fait_par: user?.email || null });
  elaguer();
  return { ok: true };
}

export function supprimerRappel(id, user) {
  const r = Records.get('Rappel', id);
  if (!r) return { ok: false, error: 'Rappel introuvable' };
  if (!sien(r, user)) return { ok: false, error: 'Ce rappel est celui de quelqu\'un d\'autre.' };
  Records.delete('Rappel', id);
  return { ok: true };
}

// Les rappels faits ne servent plus qu'à se souvenir qu'on les a faits. Au-delà
// de ce nombre, les plus anciens partent.
const PLAFOND_FAITS = 300;
function elaguer() {
  const faits = Records.list('Rappel').filter((r) => r.fait_le);
  if (faits.length <= PLAFOND_FAITS) return;
  faits
    .sort((a, b) => String(a.fait_le).localeCompare(String(b.fait_le)))
    .slice(0, faits.length - PLAFOND_FAITS)
    .forEach((r) => Records.delete('Rappel', r.id));
}
