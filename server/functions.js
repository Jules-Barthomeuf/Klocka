// Local ports of the Base44 Deno backend functions (base44/functions/*).
// Each takes (params, ctx) where ctx carries the current user + helpers.

import { Records } from './db.js';
import { sendEmail, mailStatus, listAccounts } from './email.js';
import { composeMail } from './mail.js';
import { llmEnabled, llmStatus } from './llm.js';
import { googleStatus, disconnectAccount } from './google-oauth.js';
import { changerStatut, repousserRelance, ajouterSuivi, statutDe } from './deal/lifecycle.js';
import { alimenterBaseMarche } from './deal/marche.js';

// Fait avancer le cycle de vie d'un deal après l'envoi d'un mail d'intention :
// trace l'envoi dans `suivi`, applique la transition de statut correspondante
// et capitalise dans la base marché quand le deal se clôt.
async function avancerDealApresMail(dealId, intention, sujet, destinataire, user) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return;

  ajouterSuivi(
    deal,
    {
      type: 'mail_envoye',
      intention: intention || null,
      detail: sujet,
      destinataire: Array.isArray(destinataire) ? destinataire.join(', ') : destinataire || null,
    },
    user
  );

  // Mémorise le contact agent si on ne le connaissait pas encore.
  const premierDest = (Array.isArray(destinataire) ? destinataire[0] : destinataire) || null;
  if (premierDest && !deal.contact_agent_email) {
    Records.update('Deal', deal.id, { contact_agent_email: premierDest });
  }

  if (intention === 'demande_documents') {
    changerStatut(deal, 'documents_demandes', { user, note: 'Demande de documents envoyée' });
  } else if (intention === 'relance' && statutDe(deal) === 'documents_demandes') {
    repousserRelance(deal, user);
  } else if (intention === 'refus' || intention === 'abandon') {
    for (const lot of deal.lots || []) alimenterBaseMarche(deal, lot, user);
    changerStatut(deal, 'abandonne', {
      user,
      note: intention === 'refus' ? 'Refusé après préanalyse' : 'Abandonné après étude des documents',
    });
  }
}

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

  // --- Mails page ---------------------------------------------------------

  // Turn "envoie le template présentation à Marc" into a ready-to-send draft.
  composeMail(params, ctx) {
    return composeMail(params, ctx);
  },

  // Send a (possibly hand-edited) draft and record it in the history.
  async sendMail(params, { user }) {
    const { from, to, cc, subject, body, template_id, template_titre, replyTo, deal_id, intention } =
      params || {};
    if (!subject || !subject.trim()) return { success: false, error: 'Objet manquant' };
    if (!body || !body.trim()) return { success: false, error: 'Corps du mail vide' };
    // `owner` restricts the sendable mailboxes to the caller's own.
    const resultat = await sendEmail({
      from,
      owner: user?.email,
      to,
      cc,
      subject,
      body,
      replyTo,
      template_id,
      template_titre,
      deal_id,
      intention,
    });

    // Un envoi lié à un deal fait avancer son cycle de vie. Le mode simulé
    // (aucun compte connecté) avance aussi : en local, le flux prime.
    if (deal_id && (resultat.success || resultat.simulated)) {
      try {
        await avancerDealApresMail(deal_id, intention, subject, to, user);
      } catch (e) {
        console.error('[deal] suivi après envoi impossible :', e?.message || e);
      }
    }
    return resultat;
  },

  // Sender accounts + config banner on the Mails page.
  async getMailStatus(params, { user }) {
    return { ...(await mailStatus(user?.email)), llm: llmEnabled, ia: llmStatus(), google: googleStatus() };
  },

  // Unlink a Google mailbox (revokes nothing on Google's side, just forgets it).
  disconnectMailAccount({ email } = {}, { user }) {
    if (!email) return { success: false, error: 'Adresse manquante' };
    // Never let someone unlink a colleague's mailbox.
    const mine = listAccounts(user?.email).some((a) => a.id === String(email).toLowerCase());
    if (!mine) return { success: false, error: 'Ce compte ne vous appartient pas.' };
    return disconnectAccount(email);
  },

  // Import Drive « à l'ancienne » de la page Projets : conservé tant que le
  // bouton existe côté admin. Le vrai classement Drive du workflow d'analyse
  // passe, lui, par /api/preanalyse/dossiers/:dealId/drive.
  importFromGoogleDrive() {
    return {
      success: false,
      error: "Import Drive indisponible ici : utilisez « Classer dans le Drive » depuis l'analyse du deal.",
    };
  },
};

export function callFunction(name, params, ctx) {
  const fn = functions[name];
  if (!fn) return { error: `Unknown function: ${name}` };
  return fn(params || {}, ctx || {});
}
