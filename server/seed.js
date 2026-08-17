// Seeds a demo admin account plus a small set of realistic sample records so the
// app is navigable immediately. Idempotent: runs only when the DB is empty.
// Real Base44 exports can be loaded later with `npm run import` (see import.js).

import { Records, Meta } from './db.js';

// Adresse de l'admin créé au premier démarrage. À définir dans .env : le
// repli ci-dessous n'existe que pour qu'une installation vierge démarre.
export const ADMIN_EMAIL = process.env.KLOCKA_ADMIN_EMAIL || 'admin@klocka.local';

function ensureAdmin() {
  const existing = Records.filter('User', { email: ADMIN_EMAIL });
  if (existing.length) return existing[0];
  return Records.create('User', {
    email: ADMIN_EMAIL,
    full_name: 'Jules (Admin)',
    role: 'admin',
    etape_actuelle: 5,
    profil_investisseur: 'visionnaire',
    viewed_resources: [],
    comptes_lies: [],
  });
}

function seedDemoData(adminEmail) {
  // --- A demo client user ---
  const clientEmail = 'client.demo@klocka.local';
  if (!Records.filter('User', { email: clientEmail }).length) {
    Records.create('User', {
      email: clientEmail,
      full_name: 'Camille Client (Démo)',
      role: 'user',
      etape_actuelle: 3,
      profil_investisseur: 'equilibriste',
      revenus_annuels: 85000,
      epargne_annuelle: 18000,
      apport_disponible: 120000,
      duree_emprunt: 20,
      viewed_resources: [],
      comptes_lies: [],
    });
  }

  // --- App settings (used by the dashboard) ---
  if (!Records.filter('AppSettings', { setting_key: 'global' }).length) {
    Records.create('AppSettings', {
      setting_key: 'global',
      video_accueil_url: '',
    });
  }

  // --- Sample projects ---
  const projects = [
    {
      titre: 'Local commercial - Restauration Nice',
      adresse_complete: '12 Avenue Jean Médecin, 06000 Nice',
      nom_locataire: 'Brasserie du Sud',
      activite_locataire: 'Restauration',
      surface_m2: 180,
      prix_acquisition: 620000,
      rendement_locatif: 8.4,
      statut: 'disponible',
      latitude: 43.7009,
      longitude: 7.2683,
      client_email: clientEmail,
      client_emails: [clientEmail],
      admin_principal: adminEmail,
      archived: false,
      sim_prix_bien_negocie: 590000,
      sim_prix_revient: 645000,
      sim_apport: 130000,
      sim_montant_credit: 515000,
      sim_loyer_initial_ht: 52000,
      sim_surface: 180,
      sim_rendement_locatif_global_net: 8.1,
      sim_cashflow_cumule: 74000,
      sim_creation_richesse_nette: 210000,
      sim_multiple_fonds_propres: 2.6,
      sim_rendement_net_fonds_propres: 12.3,
      sim_annee_revente: 12,
      sim_prix_vente_net: 780000,
    },
    {
      titre: 'Murs commerciaux - Pharmacie Lyon',
      adresse_complete: '45 Rue de la République, 69002 Lyon',
      nom_locataire: 'Pharmacie Centrale',
      activite_locataire: 'Santé',
      surface_m2: 95,
      prix_acquisition: 480000,
      rendement_locatif: 6.9,
      statut: 'en_cours',
      latitude: 45.7640,
      longitude: 4.8357,
      admin_principal: adminEmail,
      archived: false,
      sim_prix_bien_negocie: 465000,
      sim_prix_revient: 505000,
      sim_apport: 110000,
      sim_loyer_initial_ht: 34000,
      sim_rendement_locatif_global_net: 6.5,
    },
    {
      titre: 'Boutique - Prêt-à-porter Bordeaux',
      adresse_complete: '8 Cours de l’Intendance, 33000 Bordeaux',
      nom_locataire: 'Maison Lacroix',
      activite_locataire: 'Commerce',
      surface_m2: 130,
      prix_acquisition: 540000,
      rendement_locatif: 7.5,
      statut: 'disponible',
      latitude: 44.8412,
      longitude: -0.5800,
      admin_principal: adminEmail,
      archived: false,
    },
  ];
  if (!Records.count('Project')) {
    projects.forEach((p) => Records.create('Project', p, adminEmail));
  }

  // --- Sample resources ---
  const resources = [
    { titre: "Introduction à l'immobilier commercial", description: 'Les bases pour démarrer.', type: 'video', categorie: 'acculturation', duree_minutes: 12, ordre: 1, visible: true },
    { titre: 'Comprendre le rendement net', description: 'Calculer la vraie rentabilité.', type: 'article', categorie: 'strategie', duree_minutes: 8, ordre: 2, visible: true },
    { titre: 'Négocier son financement bancaire', description: 'Préparer un dossier solide.', type: 'video', categorie: 'financement', duree_minutes: 18, ordre: 3, visible: true },
  ];
  if (!Records.count('Resource')) {
    resources.forEach((r) => Records.create('Resource', r, adminEmail));
  }

  // --- Sample CRM clients ---
  const crm = [
    { nom: 'Camille Client', email: clientEmail, telephone: '0600000000', categorie: 'en_cours', statut_client: 'recherche', mandat_signe: true, budget: 700000, revenu: 85000, fond_propre: 120000, localisation: 'PACA' },
    { nom: 'Prospect Dupont', email: 'dupont@example.com', categorie: 'stand_by', statut_client: 'negociation', budget: 450000, localisation: 'Lyon' },
  ];
  if (!Records.count('ClientCRM')) {
    crm.forEach((c) => Records.create('ClientCRM', c, adminEmail));
  }
}

export function runSeedIfEmpty() {
  if (Meta.get('seeded') === 'true') {
    ensureAdmin();
    return;
  }
  const admin = ensureAdmin();
  // Les données de démonstration (client fictif, projets d'exemple) n'ont pas
  // leur place sur un serveur de production : APP_URL en https signale la prod.
  const production = (process.env.APP_URL || '').startsWith('https://');
  if (!production) seedDemoData(admin.email);
  Meta.set('seeded', 'true');
  console.log(`[seed] Base initialisée${production ? ' (production, sans données de démo)' : ''}. Admin: ${admin.email}`);
}
