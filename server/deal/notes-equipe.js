// Les notes de l'équipe sur un bien (15 nov. 2026, Jules, sur deux remarques de Maxime : « un onglet de prise de notes
// dans les projets, pour ce que nous dit l'agent sur le dossier, l'historique de la vente », puis « tout ça doit passer
// par le chat de l'assistant ») : ce qu'on raconte à l'assistant sur un bien, tel quel, rangé sur le dossier, ou sur le
// projet quand il n'a pas de dossier. L'assistant les relit quand on l'interroge sur ce bien (etat_dossier, etat_projet).
// Pas de modèle ici : la note est gardée telle que dite ; l'Intelligence en tire ses faits à part (layer.noter).

import { Records } from '../db.js';

const MAX_NOTES = 200;

const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || null;
const nettoyer = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 4000);

/**
 * Où ranger une note : le dossier du bien, le dossier d'où vient le projet, sinon le projet lui-même.
 * @returns {{ entite: 'Deal'|'Project', record: object, deal: object|null, projet: object|null } | null}
 */
export function cibleDeLaNote({ deal_id = null, projet_id = null } = {}) {
  const projet = projet_id ? Records.get('Project', String(projet_id)) : null;
  const dealId = deal_id || projet?.deal_id || null;
  const deal = dealId ? Records.findBy('Deal', 'deal_id', String(dealId)) : null;
  if (deal) return { entite: 'Deal', record: deal, deal, projet };
  if (projet) return { entite: 'Project', record: projet, deal: null, projet };
  return null;
}

/** Pose une note sur le bien. La date du dossier ou du projet ne bouge pas : une note n'est pas une modification. */
export function noterSurLeBien(cible, texte, user = null, { maintenant = () => new Date() } = {}) {
  const t = nettoyer(texte);
  if (!t) return { ok: false, error: 'La note est vide.' };
  const c = cibleDeLaNote(cible);
  if (!c) return { ok: false, error: 'Bien introuvable : cherche-le d\'abord (trouver_bien).' };
  const note = { id: `n-${maintenant().getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, texte: t, par: user?.email || null, le: maintenant().toISOString() };
  const notes = [...(c.record.notes_equipe || []), note].slice(-MAX_NOTES);
  Records.update(c.entite, c.record.id, { notes_equipe: notes }, { garderDate: true });
  return { ok: true, note, sur: c.entite === 'Deal' ? 'dossier' : 'projet', titre: (c.deal && titreDeal(c.deal)) || c.projet?.titre || null, nombre: notes.length, deal_id: c.deal?.deal_id || null, projet_id: c.projet?.id || null };
}

/** Les notes d'un bien, du dossier et du projet réunies, la plus récente d'abord. */
export function notesDuBien({ deal = null, projet = null } = {}) {
  const toutes = [...(deal?.notes_equipe || []), ...(projet?.notes_equipe || [])];
  const vues = new Set();
  return toutes
    .filter((n) => n?.texte && !vues.has(n.id) && vues.add(n.id))
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')));
}

/** Pour l'assistant : les dernières notes en clair, avec qui et quand. */
export function notesPourAssistant(bien, n = 20) {
  return notesDuBien(bien).slice(0, n).map((x) => ({ le: String(x.le || '').slice(0, 10), par: x.par ? String(x.par).split('@')[0] : null, texte: x.texte }));
}
