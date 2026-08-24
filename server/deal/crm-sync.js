// Alimentation du CRM depuis les dossiers.
//
// Deux sens, tous deux déterministes — aucun modèle n'intervient :
//
//  1. Les agents immobiliers (entité Contact) sont créés et tenus à jour à
//     partir des dossiers : dès qu'un agent envoie une fiche, il entre au CRM
//     avec sa dernière ville connue et le nombre de dossiers apportés. Cette
//     table était vide alors que l'information existait déjà sur chaque deal.
//
//  2. Les clients (entité ClientCRM) sont rapprochés des dossiers : budget,
//     apport et zone recherchée face au prix de revient et à la ville du lot.
//     Le rapprochement ne modifie rien — il propose.

import { Records } from '../db.js';
import { statutDe } from './lifecycle.js';

const OUVERTS = ['analyse', 'documents_demandes', 'documents_recus', 'depouille'];

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

// --- Rapprochement clients ↔ dossiers --------------------------------------

const nombre = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Prix de revient du lot, à défaut son prix FAI. */
function coutDuLot(deal) {
  const lot = deal.lots?.[0];
  const aem = lot?.evaluation?.aem;
  if (aem?.prix_aem) return aem.prix_aem;
  const fai = lot?.lot?.prix_fai;
  return fai && fai.absent === false ? fai.valeur : null;
}

/**
 * Clients dont le budget et la zone collent à un dossier.
 * Un critère absent ne disqualifie pas : il ne compte simplement pas.
 * @returns {Array<{client, raisons: string[]}>}
 */
export function clientsPourDeal(deal, clients = null) {
  const liste = (clients || Records.list('ClientCRM')).filter((c) => c.categorie !== 'signe');
  const cout = coutDuLot(deal);
  const ville = norm(villeDuDeal(deal));

  const resultats = [];
  for (const client of liste) {
    const raisons = [];
    const budget = nombre(client.budget);
    const apport = nombre(client.fond_propre);

    if (cout && budget) {
      if (budget < cout * 0.9) continue; // hors budget : on écarte franchement
      raisons.push(`budget ${Math.round(budget / 1000)} k€ pour un prix de revient de ${Math.round(cout / 1000)} k€`);
    }
    // L'apport usuel est de 15 % du prix de revient.
    if (cout && apport && apport >= cout * 0.15) {
      raisons.push(`apport suffisant (${Math.round(apport / 1000)} k€)`);
    }
    if (ville && client.localisation && norm(client.localisation).includes(ville)) {
      raisons.push(`cherche sur ${client.localisation}`);
    }
    if (raisons.length) resultats.push({ client, raisons });
  }

  // Le plus de raisons d'abord, puis le plus gros budget.
  return resultats.sort(
    (a, b) => b.raisons.length - a.raisons.length || (nombre(b.client.budget) || 0) - (nombre(a.client.budget) || 0)
  );
}

/** Rapprochements pour tous les dossiers ouverts, dossiers sans client exclus. */
export function rapprochements() {
  const clients = Records.list('ClientCRM');
  if (!clients.length) return [];
  return Records.list('Deal')
    .filter((d) => !d.archived && !d.test && d.lots?.length && OUVERTS.includes(statutDe(d)))
    .map((deal) => ({ deal, candidats: clientsPourDeal(deal, clients) }))
    .filter((r) => r.candidats.length);
}
