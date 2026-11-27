// Le jour où une chose s'est passée, d'après les mots de la note (26 nov. 2026, Jules : « j'ai eu un premier contact
// avec Arthur mardi », et l'historique disait le 26 novembre, le jour de la note). Comme pour le mode appel
// (prospection/dates-fr.js), le modèle relève les mots (« mardi », « hier », « le 12 ») et le code calcule le jour :
// un modèle qui compte les jours se trompe. Ici on regarde en arrière : un fait rapporté est passé. Ce qu'on ne sait
// pas lire rend null, et la ligne garde le jour de la note.

import { jourDe, plusJours, norm } from '../prospection/regles.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15 };

const jourSemaine = (j) => new Date(`${j}T12:00:00Z`).getUTCDay();
const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
const valide = (a, m, j) => { const d = new Date(Date.UTC(a, m - 1, j)); return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j; };

/** Pure : le dernier jour passé qui tombe tel jour de la semaine ; aujourd'hui compte, sauf « dernier ». */
function dernier(auj, cible, strict = false) {
  let d = strict ? plusJours(auj, -1) : auj;
  while (jourSemaine(d) !== cible) d = plusJours(d, -1);
  return d;
}

/** Pure : un jour du mois dans le passé : ce mois-ci s'il est passé (ou aujourd'hui), sinon le mois d'avant ; un mois nommé, cette année ou la précédente. */
function passe(auj, jour, mois = null, annee = null) {
  const [a, m] = auj.split('-').map(Number);
  if (annee) return valide(annee, mois || m, jour) ? iso(annee, mois || m, jour) : null;
  if (mois) {
    if (!valide(a, mois, jour)) return valide(a - 1, mois, jour) ? iso(a - 1, mois, jour) : null;
    const d = iso(a, mois, jour);
    return d <= auj ? d : iso(a - 1, mois, jour);
  }
  if (valide(a, m, jour) && iso(a, m, jour) <= auj) return iso(a, m, jour);
  const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1];
  return valide(pa, pm, jour) ? iso(pa, pm, jour) : null;
}

/**
 * Pure : le jour (AAAA-MM-JJ) d'un fait passé dit en mots, ou null. « mardi », « mardi dernier », « hier »,
 * « avant-hier », « ce matin », « il y a 3 jours », « le 12 », « le 12 novembre », « 12/11 », « 12/11/2026 ».
 * Jamais après aujourd'hui.
 */
export function dateDuFait(quand, maintenant = new Date()) {
  const t = norm(quand).replace(/-/g, ' ');
  if (!t) return null;
  const auj = jourDe(maintenant);
  if (/\b(aujourd hui|ce matin|cet apres midi|ce midi|ce soir|tout a l heure|tantot)\b/.test(t)) return auj;
  if (/\bavant hier\b/.test(t)) return plusJours(auj, -2);
  if (/\bhier\b/.test(t)) return plusJours(auj, -1);
  const ilya = t.match(/\bil y a (\d+|[a-z]+) (jour|jours|semaine|semaines)\b/);
  if (ilya) {
    const n = /^\d+$/.test(ilya[1]) ? Number(ilya[1]) : NOMBRES[ilya[1]];
    if (n) return plusJours(auj, -n * (ilya[2].startsWith('semaine') ? 7 : 1));
  }
  const chiffres = t.match(/\b(\d{1,2})[ /.](\d{1,2})(?:[ /.](\d{2,4}))?\b/);
  if (chiffres && /\d[/.]\d/.test(quand)) {
    const an = chiffres[3] ? Number(chiffres[3].length === 2 ? `20${chiffres[3]}` : chiffres[3]) : null;
    const d = passe(auj, Number(chiffres[1]), Number(chiffres[2]), an);
    return d && d <= auj ? d : null;
  }
  const nomme = t.match(new RegExp(`\\b(1er|\\d{1,2}) (${MOIS.join('|')})(?: (\\d{4}))?\\b`));
  if (nomme) {
    const d = passe(auj, nomme[1] === '1er' ? 1 : Number(nomme[1]), MOIS.indexOf(nomme[2]) + 1, nomme[3] ? Number(nomme[3]) : null);
    return d && d <= auj ? d : null;
  }
  const quantieme = t.match(/\ble (1er|\d{1,2})\b/);
  if (quantieme) return passe(auj, quantieme[1] === '1er' ? 1 : Number(quantieme[1]));
  const jour = JOURS.findIndex((j) => new RegExp(`\\b${j}\\b`).test(t));
  if (jour >= 0) return dernier(auj, jour, /\b(dernier|passe)\b/.test(t));
  return null;
}
