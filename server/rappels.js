// Les rappels : « rappelle-moi dans trois jours de rappeler Marc, voici son
// numéro ». On dit la chose au chat, elle revient sous le chat le jour venu.
//
// Chacun voit ses rappels. L'échéance se lit dans la phrase — « dans 3 jours »,
// « lundi », « le 12/09 » — et le modèle n'intervient que si la phrase ne se
// laisse pas lire toute seule.

import { Records } from './db.js';
import { invokeLLM } from './llm.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const aMidi = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
const dansNJours = (n) => { const d = aMidi(new Date()); d.setDate(d.getDate() + n); return d; };

/** L'échéance lue dans la phrase, ou null. */
export function lireEcheance(texte) {
  const t = sansAccents(texte);
  let m;
  if ((m = t.match(/dans\s+(\d{1,3})\s*(jour|j\b|jours)/))) return dansNJours(Number(m[1]));
  if ((m = t.match(/dans\s+(\d{1,2})\s*semaine/))) return dansNJours(7 * Number(m[1]));
  if ((m = t.match(/dans\s+(\d{1,2})\s*mois/))) { const d = aMidi(new Date()); d.setMonth(d.getMonth() + Number(m[1])); return d; }
  if (/\bdemain\b/.test(t)) return dansNJours(1);
  if (/apres[- ]demain/.test(t)) return dansNJours(2);
  if ((m = t.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/))) {
    const annee = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
    const d = aMidi(new Date(annee, Number(m[2]) - 1, Number(m[1])));
    if (!m[3] && d < new Date()) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${JOURS[i]}\\b`).test(t)) {
      const d = aMidi(new Date());
      let ecart = (i - d.getDay() + 7) % 7;
      if (ecart === 0) ecart = 7;
      d.setDate(d.getDate() + ecart);
      return d;
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

async function lireParModele(texte) {
  const { resultat } = await invokeLLM({
    prompt: `Lis cette demande de rappel et réponds en JSON : nom de la personne à rappeler, numéro de téléphone s'il y en a un, nombre de jours avant le rappel (0 si aujourd'hui), et une note courte sur le motif. Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.\n\n« ${texte} »`,
    response_json_schema: {
      type: 'object',
      properties: { nom: { type: 'string' }, telephone: { type: 'string' }, dans_jours: { type: 'number' }, note: { type: 'string' } },
      required: ['nom', 'dans_jours'],
    },
  }).then((r) => ({ resultat: r })).catch(() => ({ resultat: null }));
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
  // Les crochets du gabarit laissés tels quels : il manque une valeur.
  if (/\[[^\]]*\]/.test(brut)) return { ok: false, error: 'Remplacez les valeurs entre crochets : le nombre de jours, le nom, le numéro.' };
  if (!echeance || !nom) {
    const lu = await lireParModele(brut);
    if (lu) {
      if (!nom && lu.nom) nom = String(lu.nom).trim();
      if (!telephone && lu.telephone) telephone = lireTelephone(lu.telephone) || String(lu.telephone).trim();
      if (!echeance && isFinite(Number(lu.dans_jours))) echeance = dansNJours(Math.max(0, Math.round(Number(lu.dans_jours))));
      if (lu.note) note = String(lu.note).trim();
    }
  }
  if (!echeance) return { ok: false, error: 'Je ne lis pas quand : dites « dans 3 jours », « lundi » ou une date.' };
  if (!nom) return { ok: false, error: 'Je ne lis pas qui rappeler : donnez son nom.' };
  const rappel = Records.create('Rappel', {
    nom,
    telephone: telephone || null,
    note: note || brut,
    echeance: echeance.toISOString(),
    cree_le: new Date().toISOString(),
    cree_par: user?.email || null,
    fait_le: null,
  });
  return { ok: true, rappel };
}

const dans = (iso) => Math.round((aMidi(new Date(iso)) - aMidi(new Date())) / 86400000);

/** Les rappels de la personne : ceux qui sont dus, puis ceux à venir. */
export function listerRappels(user) {
  const tous = Records.list('Rappel')
    .filter((r) => !r.fait_le && (!user?.email || !r.cree_par || r.cree_par === user.email))
    .map((r) => ({ ...r, dans: dans(r.echeance) }))
    .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)));
  return { dus: tous.filter((r) => r.dans <= 0), a_venir: tous.filter((r) => r.dans > 0), total: tous.length };
}

export function terminerRappel(id, user) {
  const r = Records.get('Rappel', id);
  if (!r) return { ok: false, error: 'Rappel introuvable' };
  Records.update('Rappel', id, { fait_le: new Date().toISOString(), fait_par: user?.email || null });
  return { ok: true };
}

export function supprimerRappel(id) {
  const r = Records.get('Rappel', id);
  if (!r) return { ok: false, error: 'Rappel introuvable' };
  Records.delete('Rappel', id);
  return { ok: true };
}
