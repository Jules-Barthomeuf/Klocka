// Alimentation du CRM depuis les dossiers.
//
// Déterministe — aucun modèle n'intervient : les agents immobiliers (entité
// Contact) sont créés et tenus à jour à partir des dossiers. Dès qu'un agent
// envoie une fiche, il entre au CRM avec sa dernière ville connue et le nombre
// de dossiers apportés. Cette table était vide alors que l'information existait
// déjà sur chaque deal.
//

import { Records } from '../db.js';
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// « Jean Dupont <j.dupont@agence.fr> » → « Jean Dupont »
function nomDepuisEntete(entete, email) {
  const brut = String(entete || '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
  if (brut) return brut;
  const local = String(email || '').split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' ');
}

// agence-immo.fr → Agence Immo. Approximation assumée : le nom se corrige à la
// main, il vaut mieux une entreprise pré-remplie qu'un champ vide.
function entrepriseDepuisDomaine(email) {
  const domaine = String(email || '').split('@')[1] || '';
  const base = domaine.split('.')[0];
  if (!base || ['gmail', 'outlook', 'hotmail', 'yahoo', 'free', 'orange', 'wanadoo', 'icloud'].includes(base)) {
    return '';
  }
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' ');
}

const villeDuDeal = (deal) => {
  const lot = deal.lots?.[0];
  return lot?.enrichissement?.commune?.nom || lot?.lot?.adresse?.valeur?.ville || '';
};

/**
 * Crée ou complète les fiches agent du CRM à partir des dossiers.
 * N'écrase jamais un champ saisi à la main : ne remplit que le vide.
 * @returns {{ crees: number, completes: number }}
 */
export function synchroniserAgents() {
  const deals = Records.list('Deal').filter((d) => !d.test && d.contact_agent_email);
  const contacts = Records.list('Contact');
  const parEmail = new Map(contacts.filter((c) => c.email).map((c) => [norm(c.email), c]));

  let crees = 0;
  let completes = 0;

  // Un agent peut avoir apporté plusieurs dossiers : on regroupe d'abord.
  const parAgent = new Map();
  for (const deal of deals) {
    const cle = norm(deal.contact_agent_email);
    if (!cle) continue;
    const entree = parAgent.get(cle) || { email: deal.contact_agent_email, deals: [] };
    entree.deals.push(deal);
    parAgent.set(cle, entree);
  }

  for (const [cle, { email, deals: siens }] of parAgent) {
    // Le dossier le plus récent porte l'information la plus fraîche.
    const recents = [...siens].sort((a, b) =>
      String(b.updated_date || '').localeCompare(String(a.updated_date || ''))
    );
    const dernier = recents[0];
    const nom = nomDepuisEntete(dernier.source_mail?.de, email);
    const entreprise = entrepriseDepuisDomaine(email);
    const localisation = villeDuDeal(dernier);
    const notes = `${siens.length} dossier(s) apporté(s) à Klocka.`;

    const existant = parEmail.get(cle);
    if (!existant) {
      Records.create('Contact', {
        nom,
        email,
        entreprise,
        fonction: 'Agent immobilier',
        localisation,
        notes,
        source: 'dossiers',
      });
      crees += 1;
      continue;
    }

    // Complément : uniquement les champs restés vides, plus le compteur de
    // dossiers qui, lui, appartient à la synchronisation.
    const patch = {};
    if (!String(existant.nom || '').trim() && nom) patch.nom = nom;
    if (!String(existant.entreprise || '').trim() && entreprise) patch.entreprise = entreprise;
    if (!String(existant.localisation || '').trim() && localisation) patch.localisation = localisation;
    if (!String(existant.fonction || '').trim()) patch.fonction = 'Agent immobilier';
    if (existant.notes !== notes && String(existant.notes || '').includes('dossier(s) apporté(s)')) {
      patch.notes = notes;
    } else if (!String(existant.notes || '').trim()) {
      patch.notes = notes;
    }
    if (Object.keys(patch).length) {
      Records.update('Contact', existant.id, patch);
      completes += 1;
    }
  }

  return { crees, completes };
}
