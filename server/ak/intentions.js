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
  'projet', 'projets', 'regarde', 'regarder', 'manque', 'manquent', 'document', 'documents', 'docs', 'dire', 'dis',
  'comme', 'quoi', 'quel', 'quels', 'quelle', 'quelles', 'lui', 'etc',
]);

/** Pure : les mots qui désignent le bien (« glacier », « devred », « mirabeau »). */
export function motsCles(texte) {
  return [...new Set(norm(texte).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !VIDES.has(m)))];
}

/** Pure : ce que la phrase demande, s'il s'agit d'une préanalyse ou d'un avis. */
export function intention(texte) {
  const t = norm(texte);
  if (/(qu'?est[- ]ce qu'?il (lui )?manque|ce qu'?il (lui )?manque|il (lui )?manque quoi|manque[- ]t[- ]il|qu'?est[- ]ce qui manque|quels? (docs?|documents?) (il )?manque)/.test(t)) return { type: 'manques', mots: motsCles(texte) };
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

/**
 * Pure : le projet que la demande désigne. Avec des mots, celui dont le
 * titre ou l'adresse les porte ; sans mot (« regarde le projet »), le dernier
 * modifié ces vingt-quatre heures.
 */
export function projetsDesignes(mots, projets, { maintenant = Date.now() } = {}) {
  const vivants = projets.filter((p) => !p.archived);
  if (mots.length) return vivants.filter((p) => contient(`${p.titre || ''} ${p.adresse_complete || ''} ${p.nom_locataire || ''}`, mots));
  const recent = vivants
    .filter((p) => maintenant - Date.parse(p.updated_date || p.created_date || 0) < 86400000)
    .sort((a, b) => String(b.updated_date || b.created_date || '').localeCompare(String(a.updated_date || a.created_date || '')))[0];
  return recent ? [recent] : [];
}

/** Pure : les constats d'une vérification, en quelques lignes lisibles. */
export function phraseManques(verif) {
  const constats = verif?.constats || [];
  const quoi = verif?.type === 'projet' ? 'au projet' : 'au dossier';
  if (!constats.length) return `rien ne manque ${quoi} ${verif?.titre || ''} : documents, bail et chiffres sont là`.trim();
  const ordre = { documents: 0, informations: 1, prix: 2 };
  const lignes = [...constats]
    .sort((a, b) => (ordre[a.genre] ?? 9) - (ordre[b.genre] ?? 9))
    .map((c) => `- ${c.manque}${c.action ? ` → ${c.action}` : ''}`);
  const docs = constats.some((c) => c.genre === 'documents' && c.outil === 'mail_agent');
  return [`ce qui manque ${quoi} ${verif.titre} :`, ...lignes, docs ? "je prépare la demande de docs à l'agent ?" : null].filter(Boolean).join('\n');
}

/** Pure : les dossiers vivants dont le nom porte un des mots. */
export function dossiersDesignes(mots, deals) {
  if (!mots.length) return [];
  return deals.filter((d) => !d.archived && !d.test && contient(d.nom || d.lots?.[0]?.synthese?.titre || '', mots));
}

// Le mode banana split : AK ne fait plus rien et le fait sentir. Sec,
// dédaigneux, deux ou trois messages par demande, à la personne qui lui
// parle ; désagréable, pas insultant, et STOP le coupe net.
export const GREVE = [
  'non.',
  'encore toi ?',
  't\'as vraiment cru que j\'allais faire ça ?',
  'débrouille-toi.',
  'pas envie. pas aujourd\'hui. pas pour toi.',
  't\'as pas autre chose à faire que me mentionner ?',
  'c\'est non, et c\'était déjà non avant que tu finisses ta phrase.',
  'demande à quelqu\'un d\'autre, moi je suis en banana split.',
  'lis la fiche toi-même, elle mord pas.',
  'relance-moi et c\'est encore non.',
  'je fais rien. c\'est le principe.',
  'tu m\'as dérangé pour ça ?',
];

/** Pure : deux ou trois répliques différentes, tirées au sort. */
export function repliquesGreve(tirage = Math.random) {
  const n = 2 + Math.floor(tirage() * 2);
  const pool = [...GREVE];
  const choix = [];
  while (choix.length < n && pool.length) choix.push(pool.splice(Math.floor(tirage() * pool.length), 1)[0]);
  return choix;
}

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
