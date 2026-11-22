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

/** La photo posée sur une fiche, ou null. */
export function photoDe(cle) {
  const p = Records.findBy(ENTITE, 'cle', String(cle || ''));
  return p ? { url: p.url, source: p.source || null } : null;
}

/** Toutes les photos posées, par clé : les listes (Clients, Meilleurs agents) les lisent d'un coup. */
export function toutesLesPhotos() {
  return Object.fromEntries(Records.list(ENTITE).map((p) => [p.cle, p.url]));
}

/** Pose la photo d'une fiche ; `source` : « importee » ou « auto ». */
export function poserPhoto(cle, url, { source = 'importee', par = null } = {}) {
  const c = String(cle || '');
  if (!/^(agent|client|twenty):/.test(c) || !url) return { ok: false, error: 'Une photo se pose sur un agent ou un client.' };
  const donnees = { cle: c, url, source, par: bas(par) || null, le: new Date().toISOString() };
  const deja = Records.findBy(ENTITE, 'cle', c);
  if (deja) Records.update(ENTITE, deja.id, donnees); else Records.create(ENTITE, donnees);
  // L'agent de Klocka la garde aussi sur sa fiche : la Prospection et le fil la lisent là.
  if (c.startsWith('agent:') && Records.get('AgentImmo', c.slice(6))) Records.update('AgentImmo', c.slice(6), { photo: url, photo_source: source });
  return { ok: true, url };
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
