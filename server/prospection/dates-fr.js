// Les dates dites au téléphone, converties par le code (spec du mode appel,
// 7 oct. 2026) : AK relève la phrase (« rappelez-moi jeudi prochain », « peut-
// être un bien dans un mois »), ce fichier calcule le jour. Un modèle qui
// compte les jours se trompe ; une expression qu'on ne sait pas lire rend
// null, et la relance garde sa date par défaut, surlignée.

import { jourDe, plusJours, ouvre, norm } from './regles.js';

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30 };

const jourSemaine = (j) => new Date(`${j}T12:00:00Z`).getUTCDay();
const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
const dernierDuMois = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const nombre = (t) => (/^\d+$/.test(t) ? Number(t) : NOMBRES[t] ?? null);

/** Pure : un mois de plus, au même quantième (le 31 devient le dernier jour du mois). */
function plusMois(jour, n) {
  const [a, m, j] = jour.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const an = Math.floor(total / 12);
  const mois = (total % 12) + 1;
  return iso(an, mois, Math.min(j, dernierDuMois(an, mois)));
}

/** Pure : le prochain jour (strictement après aujourd'hui) qui tombe tel jour de la semaine. */
function prochain(auj, cible, semaineProchaine = false) {
  let d = plusJours(auj, 1);
  while (jourSemaine(d) !== cible) d = plusJours(d, 1);
  // « mardi prochain » dit un mardi d'après ce week-end, pas celui de demain.
  if (semaineProchaine && Math.round((Date.parse(d) - Date.parse(auj)) / 86400000) < 7 && jourSemaine(auj) !== 0 && cible > jourSemaine(auj)) d = plusJours(d, 7);
  return d;
}

/** Pure : un jour du mois dans l'avenir : ce mois-ci s'il n'est pas passé, sinon le suivant (ou l'an prochain pour un mois nommé). */
function aVenir(auj, jour, mois = null) {
  const [a, m] = auj.split('-').map(Number);
  if (mois) {
    let d = iso(a, mois, Math.min(jour, dernierDuMois(a, mois)));
    if (d <= auj) d = iso(a + 1, mois, Math.min(jour, dernierDuMois(a + 1, mois)));
    return d;
  }
  let d = iso(a, m, Math.min(jour, dernierDuMois(a, m)));
  if (d <= auj) d = plusMois(iso(a, m, 1), 1).slice(0, 8) + String(Math.min(jour, 28)).padStart(2, '0');
  return d;
}

/**
 * Pure : le jour qu'une phrase désigne, ou null. Rend { le, expression },
 * le jour ramené à un jour ouvré. `maintenant` : la date de l'appel.
 */
export function dateDepuisTexte(texte, maintenant = new Date()) {
  const t = ` ${norm(texte).replace(/[.,;:!?]/g, ' ').replace(/\s+/g, ' ')} `;
  if (!t.trim()) return null;
  const auj = jourDe(maintenant);
  const [an, moisAuj] = auj.split('-').map(Number);
  const rendre = (le, expression) => (le ? { le: ouvre(le), expression } : null);
  const reMois = MOIS.join('|');
  let m;

  // Une date écrite : 20/10, 20/10/2026, 20-10.
  if ((m = String(texte || '').match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const j = Number(m[1]); const mo = Number(m[2]);
    if (j >= 1 && j <= 31 && mo >= 1 && mo <= 12) {
      if (m[3]) { const a = Number(m[3].length === 2 ? `20${m[3]}` : m[3]); return rendre(iso(a, mo, Math.min(j, dernierDuMois(a, mo))), m[0].trim()); }
      return rendre(aVenir(auj, j, mo), m[0].trim());
    }
  }
  // « après le 15 octobre », « le 20 octobre », « 3 novembre », « 1er décembre ».
  if ((m = t.match(new RegExp(`\\b(apres le |a partir du |le |du )?(\\d{1,2})(?:er)? (${reMois})(?: (\\d{4}))?\\b`)))) {
    const j = Number(m[2]); const mo = MOIS.indexOf(m[3]) + 1;
    if (j >= 1 && j <= 31) {
      const base = m[4] ? iso(Number(m[4]), mo, Math.min(j, dernierDuMois(Number(m[4]), mo))) : aVenir(auj, j, mo);
      return rendre(/apres|a partir/.test(m[1] || '') ? plusJours(base, /apres/.test(m[1]) ? 1 : 0) : base, m[0].trim());
    }
  }
  // « fin octobre », « début novembre », « mi-novembre », « courant décembre », « en janvier ».
  if ((m = t.match(new RegExp(`\\b(fin|debut|mi|courant|en|au mois de|d ici)[ -](${reMois})\\b`)))) {
    const mo = MOIS.indexOf(m[2]) + 1;
    const j = { fin: 25, debut: 3, mi: 15, courant: 10 }[m[1]] ?? 3;
    const a = mo < moisAuj || (mo === moisAuj && j <= Number(auj.slice(8))) ? an + 1 : an;
    // « fin octobre » dit ce mois-ci s'il n'est pas passé : on ne repousse pas d'un an un 25 déjà proche.
    return rendre(iso(a, mo, j), m[0].trim());
  }
  // « fin du mois », « début du mois prochain », « le mois prochain ».
  if (/\bfin (du|de ce) mois\b/.test(t)) return rendre(iso(an, moisAuj, Math.max(Number(auj.slice(8)) + 1, dernierDuMois(an, moisAuj) - 3)), 'fin du mois');
  if (/\b(debut du mois prochain|le mois prochain|au mois prochain)\b/.test(t)) return rendre(plusMois(iso(an, moisAuj, 1), 1).slice(0, 8) + '03', 'le mois prochain');
  if (/\bfin (de l annee|d annee)\b/.test(t)) return rendre(iso(an, 12, 15) > auj ? iso(an, 12, 15) : iso(an + 1, 12, 15), "fin d'année");
  if (/\b(l annee prochaine|debut d annee|debut de l annee)\b/.test(t)) return rendre(iso(an + 1, 1, 5), "l'année prochaine");
  // « dans 15 jours », « dans trois semaines », « d'ici un mois », « dans une quinzaine ».
  if (/\b(une|la) quinzaine\b/.test(t)) return rendre(plusJours(auj, 15), 'une quinzaine');
  if ((m = t.match(/\b(dans|d ici|sous|d ici a) (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente) (jours?|semaines?|mois|ans?)\b/))
    || (m = t.match(/\b()(un|une|deux|trois|quatre|six) (mois|semaines?)\b/))) {
    const n = nombre(m[2]);
    if (n) {
      const u = m[3];
      const le = u.startsWith('jour') ? plusJours(auj, n) : u.startsWith('semaine') ? plusJours(auj, n * 7) : u === 'mois' ? plusMois(auj, n) : plusMois(auj, n * 12);
      return rendre(le, m[0].trim());
    }
  }
  // « demain », « après-demain ».
  if (/\bapres demain\b/.test(t)) return rendre(plusJours(auj, 2), 'après-demain');
  if (/\bdemain\b/.test(t)) return rendre(plusJours(auj, 1), 'demain');
  // « la semaine prochaine » : son lundi ; « en fin de semaine » : le vendredi.
  if (/\b(la semaine prochaine|semaine pro)\b/.test(t)) return rendre(prochain(auj, 1), 'la semaine prochaine');
  if (/\b(en )?fin de semaine\b/.test(t)) return rendre(jourSemaine(auj) >= 5 || jourSemaine(auj) === 0 ? prochain(auj, 5) : plusJours(auj, 5 - jourSemaine(auj)), 'fin de semaine');
  // « jeudi », « mardi prochain », « lundi matin ».
  if ((m = t.match(new RegExp(`\\b(${JOURS.join('|')})( prochain)?\\b`)))) return rendre(prochain(auj, JOURS.indexOf(m[1]), !!m[2]), m[0].trim());
  // « le 15 », « après le 15 » : ce mois-ci, ou le suivant s'il est passé.
  if ((m = t.match(/\b(apres le|a partir du|le) (\d{1,2})(?:er)?\b(?! (jours?|semaines?|mois|h|heures?|minutes?|%|k|m2|metres?))/))) {
    const j = Number(m[2]);
    if (j >= 1 && j <= 31) return rendre(plusJours(aVenir(auj, j), /apres/.test(m[1]) ? 1 : 0), m[0].trim());
  }
  return null;
}
