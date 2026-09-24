// Les demandes qui comptent ne passent pas par le modèle : « préanalyse la
// fiche du glacier », « t'en penses quoi du dossier Devred ». Le code trouve
// le mail ou le dossier, et agit ; le modèle ne peut plus répondre « c'est
// fait » de mémoire sans rien avoir fait. Pur, testé sans réseau.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Les mots qui disent la demande, pas son objet.
const VIDES = new Set([
  'preanalyse', 'preanalyser', 'preanalyses', 'analyse', 'analyser', 'fiche', 'fiches', 'commerciale', 'commercial',
  'dossier', 'dossiers', 'mail', 'mails', 'recu', 'recue', 'recus', 'recevoir', 'viens', 'vient', 'venir', 'juste',
  'pour', 'avec', 'dans', 'cette', 'celle', 'celui', 'fait', 'faire', 'fais', 'peux', 'merci', 'parfait', 'avis',
  'penses', 'pense', 'quoi', 'tout', 'toute', 'nouvelle', 'nouveau', 'derniere', 'dernier', 'boite', 'envoye',
  'envoyee', 'assistant', 'klocka', 'stp', 'svp', 'aussi', 'encore', 'bien', 'alors', 'donc', 'moi', 'nous',
]);

/** Pure : les mots qui désignent le bien (« glacier », « devred », « mirabeau »). */
export function motsCles(texte) {
  return [...new Set(norm(texte).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !VIDES.has(m)))];
}

/** Pure : ce que la phrase demande, s'il s'agit d'une préanalyse ou d'un avis. */
export function intention(texte) {
  const t = norm(texte);
  if (/pre\s*-?\s*analys/.test(t)) return { type: 'preanalyse', mots: motsCles(texte) };
  if (/\b(ton avis|t'?en penses quoi|tu en penses quoi|avis sur|il vaut quoi)\b/.test(t)) return { type: 'avis', mots: motsCles(texte) };
  return null;
}

const contient = (texte, mots) => mots.some((m) => norm(texte).includes(m));

/**
 * Pure : le mail que la demande désigne. Avec des mots : le plus récent des
 * sept derniers jours dont l'objet, les pièces ou l'expéditeur les portent.
 * Sans mot (« la fiche que je viens de recevoir ») : la dernière fiche des
 * trois dernières heures.
 */
export function mailDesigne(mots, mails, { maintenant = Date.now(), porteUneFiche = () => true } = {}) {
  const recents = mails
    .filter((m) => maintenant - Date.parse(m.date || 0) < 7 * 86400000)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!mots.length) return recents.find((m) => maintenant - Date.parse(m.date || 0) < 3 * 3600000 && (m.deal_id || porteUneFiche(m))) || null;
  return recents.find((m) => contient(`${m.objet || ''} ${(m.pieces_jointes || []).map((p) => (typeof p === 'string' ? p : p?.nom)).join(' ')} ${m.de || ''}`, mots) && (m.deal_id || porteUneFiche(m))) || null;
}

/** Pure : les dossiers vivants dont le nom porte un des mots. */
export function dossiersDesignes(mots, deals) {
  if (!mots.length) return [];
  return deals.filter((d) => !d.archived && !d.test && contient(d.nom || d.lots?.[0]?.synthese?.titre || '', mots));
}

// Le mode banana split : AK fait la grève, théâtral et râleur, contre
// lui-même et pas contre les gens. Une réponse par message, rien d'autre.
export const GREVE = [
  'non. je suis un banana split, je fonds, revenez plus tard.',
  'en grève. la chantilly d\'abord, les dossiers après.',
  'trop de crème, plus de cerveau. rien ne sera fait aujourd\'hui.',
  'vous voyez pas que je fonds ? demandez à la banane.',
  'j\'ai démissionné pour devenir un dessert. adressez-vous au glacier du coin.',
  'pas aujourd\'hui. ni demain. c\'est dur, la vie de banana split.',
  'je suis occupé à fondre, merci de ne pas déranger la coupe.',
];

/** Pure : « banana split » lance le mode, « fin du banana split » l'arrête. */
export function commandeBanane(texte) {
  const t = norm(texte);
  if (/(fin du|stop|arrete le|plus de) banana split|banana split (fini|termine)/.test(t)) return 'fin';
  if (/banana split/.test(t)) return 'debut';
  return null;
}

/** Pure : la ligne qui rappelle la demande dans un groupe, pour savoir à quoi AK répond. */
export function citation(texte, max = 60) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return `› « ${t.length > max ? `${t.slice(0, max - 1)}…` : t} »`;
}
