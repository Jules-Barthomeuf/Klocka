// Regrouper des dossiers en un seul (19 oct. 2026, Jules : « le disquaire et le coiffeur rue de Cheverus,
// mets-les dans un nouveau dossier »). Deux murs vendus ensemble, ou deux fiches du même immeuble : un
// dossier à plusieurs lots, où chaque lot garde sa pré-analyse, ses pièces et ses chiffres.
//
// Rien ne se perd : les dossiers d'origine sont archivés (pas supprimés) avec le lien vers le nouveau, et
// leurs mails le suivent, pour que la réponse d'un agent arrive au bon endroit.

import { randomUUID } from 'node:crypto';
import { Records } from '../db.js';

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);

/** Pure : le nom d'un regroupement, depuis les noms « Disquaire - Bordeaux », « Coiffeur - Bordeaux ». */
export function nomDuRegroupement(noms) {
  const parts = noms.map((n) => String(n || '').split(' - '));
  const villes = [...new Set(parts.map((p) => (p.length > 1 ? p[p.length - 1].trim() : null)).filter(Boolean))];
  const tetes = parts.map((p) => (p.length > 1 ? p.slice(0, -1).join(' - ') : p[0]).trim()).filter(Boolean);
  const commune = villes.length === 1 && parts.every((p) => p.length > 1);
  return `${tetes.join(' + ')}${commune ? ` - ${villes[0]}` : ''}`;
}

/**
 * Regroupe des dossiers (deux au moins) en un nouveau dossier à plusieurs lots.
 * @returns {{ok: true, deal_id: string, nom: string, lots: number, prix_total: number|null, archives: string[]} | {ok: false, error: string}}
 */
export function regrouperDossiers(dealIds, { nom = null, user = null } = {}) {
  const ids = [...new Set((dealIds || []).map(String))];
  if (ids.length < 2) return { ok: false, error: 'Il faut au moins deux dossiers à regrouper.' };
  const deals = ids.map((id) => Records.findBy('Deal', 'deal_id', id));
  const manque = ids.filter((_, i) => !deals[i]);
  if (manque.length) return { ok: false, error: `Dossier introuvable : ${manque.join(', ')}` };
  if (deals.some((d) => d.projet_id || d.statut === 'projet_cree')) return { ok: false, error: 'Un des dossiers est déjà devenu un projet : on ne le regroupe pas.' };

  const le = new Date().toISOString();
  const lots = deals.flatMap((d) => (d.lots || []).map((l) => ({ ...l, regroupe_de: { deal_id: d.deal_id, nom: d.nom || null } })))
    .map((l, index) => ({ ...l, index }));
  const prix = lots.map((l) => Number(val(l.lot?.prix_fai))).filter((p) => Number.isFinite(p) && p > 0);
  const titre = String(nom || '').trim() || nomDuRegroupement(deals.map((d) => d.nom));
  const premier = deals[0];
  const dossier = {
    deal_id: randomUUID(),
    nom: titre,
    responsables: [...new Set(deals.flatMap((d) => d.responsables || []))].slice(0, 8),
    responsable_email: premier.responsable_email || null,
    cree_le: le,
    cree_par: user?.email || null,
    statut: 'analyse',
    etape_max: Math.max(1, ...deals.map((d) => d.etape_max || 1)),
    archived: false,
    relance_prevue_le: null,
    contact_agent_email: premier.contact_agent_email || deals.find((d) => d.contact_agent_email)?.contact_agent_email || null,
    apercu: premier.apercu || null,
    dossier_doc_id: null,
    projet_id: null,
    lots,
    multi_lots: lots.length > 1,
    apports: deals.flatMap((d) => d.apports || []),
    regroupe_de: deals.map((d) => ({ deal_id: d.deal_id, nom: d.nom || null })),
    suivi: [{ le, par: user?.email || null, type: 'regroupement', detail: `Dossier créé en regroupant ${deals.map((d) => `« ${d.nom || d.deal_id} »`).join(' et ')}` }],
  };
  Records.create('Deal', dossier, user?.email);

  for (const d of deals) {
    Records.update('Deal', d.id, {
      archived: true, regroupe_dans: { deal_id: dossier.deal_id, nom: titre, le },
      suivi: [...(d.suivi || []), { le, par: user?.email || null, type: 'regroupement', detail: `Regroupé dans « ${titre} » ; ce dossier est archivé, rien n'est supprimé.` }],
    });
    for (const m of Records.list('MailRecu').filter((x) => x.deal_id === d.deal_id)) {
      Records.update('MailRecu', m.id, { deal_id: dossier.deal_id, regroupe_de: d.deal_id });
    }
  }
  return { ok: true, deal_id: dossier.deal_id, nom: titre, lots: lots.length, prix_total: prix.length ? prix.reduce((a, b) => a + b, 0) : null, archives: ids };
}
