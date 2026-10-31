// « Fait par Haka » (17 oct. 2026, Jules) : ce qu'il a fait seul, sans attendre
// de clic, pour la colonne de droite de l'Accueil. Deux sources : les passes
// automatiques de la veille des boîtes (RapportAuto : fiches pré-analysées,
// documents classés) et les tâches de Haka (dossiers créés, relances
// préparées, réponses à l'équipe). Ce qui attend un clic n'y est pas : c'est
// la colonne « À valider ».

import { Records } from '../db.js';

const pluriel = (n, mot, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;
const lienDossier = (dealId) => (dealId ? `/Dossiers?deal_id=${dealId}` : null);

/** Pure : les lignes d'un passage de la veille des boîtes. */
export function decrireRapport(r) {
  const items = [];
  (r.lignes || []).forEach((l, i) => {
    if (l.en_file || l.haka) return; // une tâche de l'Assistant KPartners la raconte déjà
    const docs = (l.documents || []).filter(Boolean);
    if (l.preanalyse) {
      items.push({ cle: `${r.id}:${i}`, le: r.le, genre: 'fiche', quoi: 'Fiche triée, dossier pré-analysé', detail: [l.dossier, l.de].filter(Boolean).join(' · '), lien: lienDossier(l.deal_id) });
    } else if (docs.length) {
      items.push({ cle: `${r.id}:${i}`, le: r.le, genre: 'documents', quoi: `${pluriel(docs.length, 'document classé', 'documents classés')}`, detail: [l.dossier, l.drive ? 'Drive' : null, l.monday].filter(Boolean).join(' · '), lien: lienDossier(l.deal_id) });
    }
  });
  return items;
}

/** Pure : ce qu'une tâche de Haka a fait seule (ses pas internes finis), ou null. */
export function decrireTache(t, etapes = [], { titreDossier = () => null } = {}) {
  const fait = new Set(etapes.filter((e) => e.etat === 'faite' && !e.externe).map((e) => e.nom));
  const resultat = (nom) => { try { return JSON.parse(etapes.find((e) => e.nom === nom)?.resultat || 'null'); } catch { return null; } };
  const le = t.finie_le || t.maj_le || t.cree_le;
  if (t.type === 'fiche_recue' && fait.has('creer_dossier')) {
    const r = resultat('creer_dossier') || {};
    const dealId = t.dossier || r.deal_id || null;
    return { cle: t.id, le, genre: 'fiche', quoi: r.rejoint || r.deja ? 'Fiche reçue, rattachée au dossier' : fait.has('preanalyse') ? 'Fiche triée, dossier créé et pré-analysé' : 'Fiche triée, dossier créé', detail: titreDossier(dealId) || null, lien: lienDossier(dealId) };
  }
  if (t.type === 'relances_matin' && t.etat === 'faite') {
    const r = resultat('preparer') || {};
    if (!r.en_file) return null;
    return { cle: t.id, le, genre: 'relances', quoi: `${pluriel(r.en_file, 'relance préparée', 'relances préparées')}`, detail: 'Les mails attendent dans À valider', lien: '/AValider' };
  }
  if (t.type === 'demande_equipe' && fait.has('repondre')) {
    return { cle: t.id, le, genre: 'reponse', quoi: 'Demande de l\'équipe traitée', detail: t.pour ? `Pour ${String(t.pour).split('@')[0]}` : null, lien: '/AValider' };
  }
  return null;
}

/** Les deux sources réunies, les plus récentes d'abord. */
export async function faitParHaka({ jours = 7, limite = 8 } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const items = Records.list('RapportAuto').filter((r) => (r.le || '') >= depuis).flatMap(decrireRapport);
  const { FILE } = await import('./drapeaux.js');
  if (FILE) {
    const T = await import('./taches.js');
    const titreDossier = (dealId) => {
      if (!dealId) return null;
      const d = Records.findBy('Deal', 'deal_id', dealId);
      return d?.nom || d?.lots?.[0]?.synthese?.titre || null;
    };
    for (const t of T.tachesRecentes({ limite: 60 })) {
      if ((t.cree_le || '') < depuis) continue;
      const it = decrireTache(t, T.etapesDe(t.id), { titreDossier });
      if (it) items.push(it);
    }
  }
  return items.sort((a, b) => String(b.le || '').localeCompare(String(a.le || ''))).slice(0, limite);
}
