// Les photos des fiches (22 nov. 2026, Jules : « chaque agent qu'on met soit en favori soit dans Meilleurs agents doit
// avoir une image, on peut soit l'importer soit ça la met automatiquement ; tous les clients doivent aussi avoir une image
// qu'on importe »). Une photo par fiche, rangée par sa clé (« agent:<id> », « client:<id> », « twenty:agentImmobilier:<id> »),
// pour les agents de Klocka comme pour ceux du CRM.
//
// Automatique, pour un agent seulement : la photo déjà trouvée sur la page équipe de son agence (photos_equipe, toutes
// agences confondues, par son nom), sinon la page équipe de son agence relue, sinon Google Images quand il est branché
// (une recherche, gardée pour ne pas repayer). Rien trouvé : ses initiales, et « Ajouter une photo » à la main.
// Un client n'a jamais de photo cherchée : on l'importe.

import { Records } from './db.js';

const ENTITE = 'PhotoFiche';
const bas = (t) => String(t || '').trim().toLowerCase();
const EN_COURS = new Map();

// Plusieurs photos par fiche (23 nov. 2026, Jules : « on puisse mettre plusieurs images des gens, car il y en a qui
// investissent à plusieurs ») : un couple, des associés. Rangées par `ordre` ; la première est celle des listes.
const MAX = 6;
const deLaFiche = (c) => Records.filter(ENTITE, { cle: c }).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || String(a.le).localeCompare(String(b.le)));

/** La première photo d'une fiche, ou null. */
export function photoDe(cle) {
  const p = deLaFiche(String(cle || ''))[0];
  return p ? { url: p.url, source: p.source || null } : null;
}

/** Toutes les photos d'une fiche, dans l'ordre : [{ id, url, source }]. */
export function photosDe(cle) {
  return deLaFiche(String(cle || '')).map((p) => ({ id: p.id, url: p.url, source: p.source || null }));
}

/** La première photo de chaque fiche, par clé : les listes (Clients, Meilleurs agents) les lisent d'un coup. */
export function toutesLesPhotos() {
  const out = {};
  for (const p of Records.list(ENTITE).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))) if (!out[p.cle]) out[p.cle] = p.url;
  return out;
}

// L'agent de Klocka garde sa première photo sur sa fiche : la Prospection et le fil la lisent là.
function reporterSurLAgent(c) {
  if (!c.startsWith('agent:') || !Records.get('AgentImmo', c.slice(6))) return;
  const p = deLaFiche(c)[0];
  Records.update('AgentImmo', c.slice(6), { photo: p?.url || null, photo_source: p?.source || null });
}

/**
 * Pose une photo sur une fiche ; `source` : « importee » ou « auto ». Par défaut elle remplace la première ; `id` en
 * remplace une autre ; `ajouter` en met une de plus (une personne de plus).
 */
export function poserPhoto(cle, url, { source = 'importee', par = null, id = null, ajouter = false } = {}) {
  const c = String(cle || '');
  if (!/^(agent|client|twenty):/.test(c) || !url) return { ok: false, error: 'Une photo se pose sur un agent ou un client.' };
  let deja = deLaFiche(c);
  // Un agent dont la photo n'est que sur sa fiche de la Prospection : elle devient la première avant d'en ajouter une.
  const agent = ajouter && !deja.length && c.startsWith('agent:') ? Records.get('AgentImmo', c.slice(6)) : null;
  if (agent?.photo) { Records.create(ENTITE, { cle: c, url: agent.photo, source: agent.photo_source || 'auto', par: null, le: new Date().toISOString(), ordre: 0 }); deja = deLaFiche(c); }
  const donnees = { cle: c, url, source, par: bas(par) || null, le: new Date().toISOString() };
  const visee = id ? deja.find((p) => p.id === id) : ajouter ? null : deja[0];
  if (id && !visee) return { ok: false, error: 'Cette photo n\'est plus sur la fiche.' };
  if (!visee && deja.length >= MAX) return { ok: false, error: `${MAX} photos au plus sur une fiche.` };
  const p = visee ? Records.update(ENTITE, visee.id, donnees) : Records.create(ENTITE, { ...donnees, ordre: deja.length ? Math.max(...deja.map((x) => x.ordre ?? 0)) + 1 : 0 });
  reporterSurLAgent(c);
  return { ok: true, url, id: p?.id || visee?.id || null };
}

/** Retire une photo d'une fiche. */
export function retirerPhoto(cle, id) {
  const c = String(cle || '');
  const p = deLaFiche(c).find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Cette photo n\'est plus sur la fiche.' };
  Records.delete(ENTITE, p.id);
  reporterSurLAgent(c);
  return { ok: true };
}

/**
 * Pure : la photo d'une personne dans les photos d'équipe des agences, par son nom ; à plusieurs homonymes, celle de
 * l'agence dont le nom ressemble. `agences` : [{ nom, photos_equipe }].
 */
export function photoParNom(agences, nom, agence = '', cleNom) {
  const n = cleNom(nom);
  if (!n || n.split(' ').length < 2) return null;
  const trouvees = agences.filter((a) => a.photos_equipe?.par_nom?.[n]).map((a) => ({ url: a.photos_equipe.par_nom[n], agence: cleNom(a.nom) }));
  if (!trouvees.length) return null;
  const ag = cleNom(agence);
  return (ag && trouvees.find((t) => t.agence && (t.agence.includes(ag) || ag.includes(t.agence)))?.url) || trouvees[0].url;
}

/** Qui est l'agent d'une clé : son nom, son agence, sa ville, ses adresses. */
async function personneDe(cle) {
  if (cle.startsWith('agent:')) {
    const a = Records.get('AgentImmo', cle.slice(6));
    if (!a) return null;
    return { nom: [a.prenom, a.nom_famille].filter(Boolean).join(' ') || a.nom, agence: a.agence || '', ville: a.ville || '', emails: (a.emails || []).map(bas), photo: a.photo || null };
  }
  if (cle.startsWith('twenty:agentImmobilier:')) {
    const { objetDe } = await import('./fiche-dossier/modele.js');
    const o = objetDe(cle);
    const [agence = '', ville = ''] = String(Records.findBy('FicheDossier', 'cle', cle)?.detail || o?.detail || '').split(' · ');
    return o ? { nom: o.nom, agence: agence === 'Twenty CRM' ? '' : agence, ville, emails: [], photo: null } : null;
  }
  return null;
}

/**
 * Cherche et pose la photo d'un agent qui n'en a pas (en tâche de fond, une fois à la fois par agent). Rend l'adresse
 * trouvée, ou null.
 */
export function photoAuto(cle, indice = null) {
  const c = String(cle || '');
  if (process.env.NODE_TEST_CONTEXT || !/^(agent|twenty:agentImmobilier):/.test(c) || photoDe(c)) return Promise.resolve(null);
  if (EN_COURS.has(c)) return EN_COURS.get(c);
  const p = (async () => {
    const qui = await personneDe(c);
    // Un agent du CRM sans fiche : le nom et l'agence gardés à son ajout.
    if (qui && (!qui.nom || qui.nom === 'Fiche du CRM') && indice?.nom) Object.assign(qui, { nom: indice.nom, ...(indice.detail ? { agence: indice.detail.split(' · ')[0] || '', ville: indice.detail.split(' · ')[1] || '' } : {}) });
    if (!qui?.nom || qui.nom === 'Fiche du CRM') return null;
    if (qui.photo) return poserPhoto(c, qui.photo, { source: 'auto' }).url;
    const P = await import('./prospection/photos-equipe.js');
    const agences = Records.list('AgenceProspect');
    let url = photoParNom(agences, qui.nom, qui.agence, P.cleNom);
    // Son agence : celle qui porte une de ses adresses, sinon celle de même nom dans sa ville.
    const sienne = !url && (agences.find((a) => (a.agents || []).some((x) => qui.emails.includes(bas(x.email))) || qui.emails.includes(bas(a.email)))
      || agences.find((a) => qui.agence && P.cleNom(a.nom) === P.cleNom(qui.agence) && (!qui.ville || P.cleNom(a.ville) === P.cleNom(qui.ville))));
    if (sienne) {
      url = (await P.photosDeLAgence(sienne, [qui.nom]))[P.cleNom(qui.nom)] || null;
      if (!url && P.imagesBranchees()) {
        await P.chercherPhotosImages(sienne.id, [{ nom: qui.nom }], { max: 1 });
        url = Records.get('AgenceProspect', sienne.id)?.photos_equipe?.par_nom?.[P.cleNom(qui.nom)] || null;
      }
    }
    return url ? poserPhoto(c, url, { source: 'auto' }).url : null;
  })().catch((e) => { console.warn('[photos] agent', c, ':', e?.message || e); return null; }).finally(() => EN_COURS.delete(c));
  EN_COURS.set(c, p);
  return p;
}
