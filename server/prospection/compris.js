// « Ce qui a été compris » après un appel (spec du mode appel, 7 oct. 2026).
// AK relève les champs et la phrase exacte qui porte chacun ; ce fichier,
// sans modèle, décide ce qu'on en garde :
//   - un champ sans phrase reste vide, jamais deviné ;
//   - un téléphone ou un mail au mauvais format est surligné, jamais corrigé ;
//   - un nom proche d'un nom connu (« Marting » pour « Martin ») est surligné,
//     et la salutation reste « Bonjour, » ;
//   - la date est calculée ici, depuis les mots dits ;
//   - l'issue tapée par l'analyste n'est jamais changée : si la conversation
//     semble dire autre chose, un avertissement discret s'affiche.

import * as R from './regles.js';
import { dateDepuisTexte } from './dates-fr.js';

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** Pure : un téléphone français valide (10 chiffres en 0X, ou +33 suivi de 9), sans rien corriger. */
export function telephoneValide(v) {
  const t = String(v || '').replace(/[\s.()-]/g, '');
  return /^0[1-9]\d{8}$/.test(t) || /^\+33[1-9]\d{8}$/.test(t) || /^0033[1-9]\d{8}$/.test(t);
}

/** Pure : le numéro au format international, sans espaces (+33612345678), ou null. */
export function telephoneInternational(v) {
  const t = String(v || '').replace(/[\s.()-]/g, '');
  if (/^0[1-9]\d{8}$/.test(t)) return `+33${t.slice(1)}`;
  if (/^\+33[1-9]\d{8}$/.test(t)) return t;
  if (/^0033[1-9]\d{8}$/.test(t)) return `+${t.slice(2)}`;
  return null;
}

/** Pure : la distance d'édition entre deux mots (pour « Marting » contre « Martin »). */
function distance(a, b) {
  const m = a.length; const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) for (let j = 1; j <= n; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

const nomDeFamille = (nom) => R.norm(nom).split(' ').filter((x) => x.length > 1 && !['madame', 'monsieur', 'mme', 'm'].includes(x)).pop() || '';

/** Pure : un nom entendu presque égal à un nom connu, mais pas égal : le nom connu, ou null. */
export function nomProche(entendu, connus = []) {
  const e = nomDeFamille(entendu);
  if (e.length < 3) return null;
  for (const c of connus) {
    const k = nomDeFamille(c);
    if (!k || k === e) continue;
    if (distance(e, k) <= (Math.min(e.length, k.length) >= 6 ? 2 : 1)) return c;
  }
  return null;
}

/** Pure : la phrase contient-elle bien la valeur ? (chiffres pour un téléphone, l'adresse pour un mail) */
function phrasePorte(phrase, valeur, genre) {
  const p = String(phrase || '');
  if (!p.trim()) return false;
  if (genre === 'telephone') return p.replace(/\D/g, '').includes(String(valeur || '').replace(/\D/g, '').slice(-8));
  if (genre === 'email') return p.toLowerCase().includes(String(valeur || '').toLowerCase());
  return R.norm(p).includes(R.norm(valeur).split(' ').pop() || '');
}

const ISSUES_ENTENDUES = { pas_de_murs: "Pas de bien pour l'instant", a_des_murs: 'A un bien intéressant', pas_interesse: 'Pas intéressé', pas_de_reponse: 'Pas de réponse' };

/**
 * Pure : les champs de « Ce qui a été compris », chacun { valeur, source,
 * incertain }, la salutation sûre, la date calculée, et l'avertissement si la
 * conversation contredit l'issue tapée.
 * @param {object} lu ce qu'AK a relevé
 * @param {{issue: string, connus?: string[], maintenant?: Date}} o
 */
export function comprisDe(lu, { issue, connus = [], maintenant = new Date() } = {}) {
  const c = lu?.citations || {};
  const confiance = lu?.confiance || {};
  const champs = {};
  const poser = (cle, valeur, source, incertain = null) => {
    const v = Array.isArray(valeur) ? valeur.filter(Boolean) : String(valeur || '').trim();
    if (!v || (Array.isArray(v) && !v.length)) return;
    // Sans la phrase qui la porte, une information n'existe pas.
    if (!String(source || '').trim()) return;
    champs[cle] = { valeur: v, source: String(source).trim(), ...(incertain ? { incertain } : confiance[cle] && confiance[cle] !== 'haute' ? { incertain: 'AK n\'en est pas sûr' } : {}) };
  };

  const inter = lu?.interlocuteur || {};
  if (inter.nom) {
    const proche = nomProche(inter.nom, connus);
    poser('interlocuteur', [inter.civilite, inter.nom].filter(Boolean).join(' '), c.interlocuteur, proche ? `proche de « ${proche} », déjà connu : à vérifier` : !phrasePorte(c.interlocuteur, inter.nom, 'nom') ? 'le nom ne se lit pas dans la phrase' : null);
  }
  if (inter.fonction) poser('fonction', inter.fonction, c.interlocuteur);
  if (lu?.telephone_direct) poser('telephone', lu.telephone_direct, c.telephone, !telephoneValide(lu.telephone_direct) ? 'format de numéro invalide' : !phrasePorte(c.telephone, lu.telephone_direct, 'telephone') ? 'les chiffres ne se lisent pas dans la phrase' : null);
  const mail = String(lu?.email_donne || '').trim();
  if (mail) poser('email', mail, c.email, !EMAIL.test(mail) ? 'format d\'adresse invalide' : !phrasePorte(c.email, mail, 'email') ? 'adresse épelée, à vérifier' : null);
  if ((lu?.biens || []).length) poser('biens', lu.biens, c.biens);
  if (lu?.prochaine_etape) poser('prochaine_etape', lu.prochaine_etape, c.prochaine_etape || c.date);

  // Un mandat que l'agent pense rentrer : le point se fait à l'échéance dite, sinon dans trois semaines.
  const mandat = lu?.mandat_a_venir || {};
  if (mandat.quoi && String(c.mandat || '').trim()) {
    const quand = mandat.echeance_en_mots ? dateDepuisTexte(mandat.echeance_en_mots, maintenant) : null;
    champs.mandat = { valeur: String(mandat.quoi).trim(), source: String(c.mandat).trim(), ...(quand ? { date: quand.le, mots: quand.expression } : {}) };
  }
  // La date : les mots d'AK, le calcul du code.
  const mots = String(lu?.date_en_mots || '').trim() || String(c.date || '').trim();
  const calcul = mots ? dateDepuisTexte(mots, maintenant) : null;
  if (calcul && c.date) champs.date = { valeur: calcul.le, mots: calcul.expression, source: String(c.date).trim(), ...(confiance.date && confiance.date !== 'haute' ? { incertain: 'AK n\'en est pas sûr' } : {}) };

  // « Bonjour Madame Martin, » seulement si la civilité est dite et le nom sûr.
  const i = champs.interlocuteur;
  const civ = /^(madame|monsieur)$/i.test(String(inter.civilite || '').trim()) ? String(inter.civilite).trim() : null;
  const nomFamille = inter.nom ? String(inter.nom).trim().split(/\s+/).pop() : '';
  const salutation = i && !i.incertain && civ && nomFamille ? `Bonjour ${civ.charAt(0).toUpperCase()}${civ.slice(1).toLowerCase()} ${nomFamille.charAt(0).toUpperCase()}${nomFamille.slice(1)},` : 'Bonjour,';

  // L'issue tapée fait foi ; une conversation qui semble dire autre chose se signale.
  const entendue = lu?.issue_entendue && ISSUES_ENTENDUES[lu.issue_entendue] ? lu.issue_entendue : null;
  const proches = { repondeur: 'pas_de_reponse' };
  const avertissement = entendue && entendue !== (proches[issue] || issue) ? `La conversation semble dire « ${ISSUES_ENTENDUES[entendue]} ». L'issue tapée est gardée : changez-la si besoin.` : null;

  // Le nouveau contact donné (« appelez Sophie au 06… ») : proposé, jamais ajouté seul.
  const nc = lu?.nouveau_contact || {};
  const nouveau = (nc.nom || nc.telephone) && String(c.nouveau_contact || '').trim()
    ? { nom: nc.nom || null, telephone: nc.telephone || null, email: nc.email || null, source: String(c.nouveau_contact).trim(), ...(nc.telephone && !telephoneValide(nc.telephone) ? { incertain: 'format de numéro invalide' } : {}) }
    : null;

  // La phrase de contexte du mail Murs commerciaux : une seule, et seulement si un bien a été cité.
  const contexte = issue === 'a_des_murs' && champs.biens && lu?.contexte ? String(lu.contexte).trim().split(/(?<=[.!?])\s/)[0].slice(0, 220) : null;

  // Pour un bien : la fiche commerciale seule, sauf si les pièces du dossier ont été demandées.
  const demande = issue === 'a_des_murs' ? (lu?.demande_documents === 'documents' ? 'documents' : 'fiche_commerciale') : null;
  return { champs, salutation, date_dite: champs.date?.valeur || null, avertissement, nouveau_contact: nouveau, contexte, demande };
}
