// Local ports of the Base44 Deno backend functions (base44/functions/*).
// Each takes (params, ctx) where ctx carries the current user + helpers.

import { Records } from './db.js';
import { sendEmail } from './email.js';

function normalize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slimProject(p) {
  return {
    id: p.id,
    titre: p.titre,
    adresse_complete: p.adresse_complete,
    nom_locataire: p.nom_locataire,
    activite_locataire: p.activite_locataire,
    surface_m2: p.surface_m2,
    rendement_locatif: p.rendement_locatif,
    prix_acquisition: p.prix_acquisition,
    statut: p.statut,
    sim_prix_bien_negocie: p.sim_prix_bien_negocie,
    sim_prix_revient: p.sim_prix_revient,
    sim_apport: p.sim_apport,
    sim_montant_credit: p.sim_montant_credit,
    sim_loyer_initial_ht: p.sim_loyer_initial_ht,
    sim_surface: p.sim_surface,
    sim_indexation_loyers: p.sim_indexation_loyers,
    sim_rendement_locatif_global_net: p.sim_rendement_locatif_global_net,
    sim_cashflow_cumule: p.sim_cashflow_cumule,
    sim_creation_richesse_nette: p.sim_creation_richesse_nette,
    sim_multiple_fonds_propres: p.sim_multiple_fonds_propres,
    sim_rendement_net_fonds_propres: p.sim_rendement_net_fonds_propres,
    sim_annee_revente: p.sim_annee_revente,
    sim_prix_vente_net: p.sim_prix_vente_net,
  };
}

// Projects visible to the current user (admins see all).
function accessibleProjects(user) {
  const all = Records.list('Project', { sort: '-created_date' });
  if (user && user.role === 'admin') return all.filter((p) => !p.archived);
  const email = user?.email;
  const master = user?.est_compte_shadow && user?.compte_maitre_email ? user.compte_maitre_email : email;
  return all.filter(
    (p) =>
      !p.archived &&
      (p.client_email === email ||
        p.client_email === master ||
        (Array.isArray(p.client_emails) && (p.client_emails.includes(email) || p.client_emails.includes(master))))
  );
}

export const functions = {
  getMesProjects({ search } = {}, { user }) {
    const accessible = accessibleProjects(user);
    const total = accessible.length;
    let projects = accessible;

    if (search && search.trim()) {
      const q = normalize(search);
      const terms = q.split(' ').filter(Boolean);
      projects = accessible
        .map((p) => {
          const hay = normalize(`${p.titre} ${p.adresse_complete} ${p.nom_locataire} ${p.activite_locataire}`);
          const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
          return { p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.p);
    }

    projects = projects.slice(0, 8).map(slimProject);
    return { projects, count: projects.length, total_accessible: total };
  },

  getPublicProject({ id } = {}) {
    if (!id) return { success: false, error: 'Missing project id' };
    const project = Records.get('Project', id);
    if (!project) return { success: false, error: 'Project not found' };
    return { success: true, project };
  },

  searchProjects({ searchTerm } = {}, { user }) {
    if (!searchTerm) return { error: 'searchTerm is required' };
    const q = normalize(searchTerm);
    const all = accessibleProjects(user);
    const results = all.filter((p) =>
      normalize(`${p.titre} ${p.adresse_complete} ${p.nom_locataire}`).includes(q)
    );
    return { results };
  },

  async sendProjectAssignmentEmail(params, { user }) {
    const { to, clientEmail, projectTitle, projectId } = params || {};
    const recipient = to || clientEmail;
    await sendEmail({
      to: recipient,
      subject: `Un nouveau projet vous a été attribué : ${projectTitle || ''}`,
      body: `Bonjour,\n\nUn nouveau projet (${projectTitle || projectId}) vous a été attribué sur Klocka.\n\nConnectez-vous pour le consulter.`,
    });
    return { success: true };
  },

  async sendCustomEmail(params) {
    const { to, subject, body, html } = params || {};
    await sendEmail({ to, subject, body: body || html });
    return { success: true };
  },

  // External-integration functions require OAuth to Google/GitHub which isn't
  // available in the local recreation. They return an explanatory stub.
  importFromGoogleDrive() {
    return { success: false, error: 'Intégration Google Drive non disponible en local.' };
  },
  searchGoogleDrive() {
    return { success: false, error: 'Intégration Google Drive non disponible en local.' };
  },
  syncGitHub() {
    return { success: false, error: 'Intégration GitHub non disponible en local.' };
  },
  uploadImage() {
    return { success: false, error: "Utilisez l'upload de fichier standard en local." };
  },
};

export function callFunction(name, params, ctx) {
  const fn = functions[name];
  if (!fn) return { error: `Unknown function: ${name}` };
  return fn(params || {}, ctx || {});
}
