// La fiche du dossier (19 nov. 2026, Jules, sur les notes de Maxime) : une fiche par dossier, sur laquelle on
// branche des agents et des clients. On écrit en vrac sur la page de l'assistant, on lie la note (icône lien) à un
// bien, un agent, un ou des clients ; l'assistant propose « Ce que j'en retiens » (mises à jour, décisions et leur
// raison, actions datées, questions), la personne appuie sur OK et tout se range ici. Rien ne s'écrit sans ce OK.
//
// Cinq choses, et rien d'autre :
//   - FicheDossier : une par clé (un bien, un agent, un client) ; le résumé qui se lit en vingt secondes, l'étape,
//     le blocage, et les fiches liées (les personnes d'un bien, les biens d'une personne) ;
//   - NoteDossier : la note telle qu'écrite, ce que l'assistant en a tiré, ce qui a été gardé ;
//   - EntreeDossier : le journal daté de chaque fiche (mise à jour, décision et sa raison, ressenti, précision,
//     action faite), chaque ligne rattachée à sa note ;
//   - ActionDossier : ce qu'il reste à faire, qui (soi, l'assistant qui a préparé un message, un collègue), pour quand ;
//   - les notes de l'équipe sur le bien (notes_equipe), pour que l'assistant les relise quand on l'interroge.
//
// Twenty fait foi pour les coordonnées des agents et des clients ; la plateforme garde l'historique et le contexte.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { Records } from '../db.js';
import { agenceDeLaLigne, personneDeLAgence } from './coordonnees.js';
import { noterSurLeBien } from '../deal/notes-equipe.js';
import { ETAPES, donneesDuBien } from './dossier.js';
import { photoDe, photosDe } from '../photos-fiches.js';
import { nomAgent } from '../nom-agent.js';
import { envoisDeLAgent } from './fiches-envoyees.js';
import { cleUnique, rassembler } from './une-cle.js';

export { ETAPES };
// `profil`, `ecart`, `message` (22 nov. 2026) : comment parler à la personne, deux sources qui se contredisent, un message
// envoyé (seul l'envoyé entre dans l'historique : un brouillon jamais parti n'affirme rien).
const GENRES_ENTREE = ['note', 'evenement', 'maj', 'decision', 'negociation', 'ressenti', 'precision', 'action_faite', 'etape', 'projet', 'profil', 'ecart', 'message'];

const propre = (t, n = 2000) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const jour = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const dateValide = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime()) ? String(s) : null);

// ---------------------------------------------------------------------------
// L'équipe : à qui une action peut revenir.
// ---------------------------------------------------------------------------

const ICI = path.dirname(fileURLToPath(import.meta.url));
let equipeLue = null;
/** Les personnes de l'équipe Klocka (crm/equipe.json, liste « _spoc ») : nom, prénom, adresse. */
export function equipe() {
  if (equipeLue) return equipeLue;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ICI, '..', '..', 'crm', 'equipe.json'), 'utf8'));
    equipeLue = (j._spoc || []).filter((p) => p?.email).map((p) => ({ nom: p.nom, prenom: String(p.nom || '').split(/\s+/)[0], email: String(p.email).toLowerCase() }));
  } catch { equipeLue = []; }
  return equipeLue;
}
export const prenomDe = (email) => {
  const e = String(email || '').toLowerCase();
  const p = equipe().find((x) => x.email === e);
  if (p) return p.prenom;
  const avant = e.split('@')[0].split(/[._-]/)[0];
  return avant ? avant[0].toUpperCase() + avant.slice(1) : null;
};
/** « Paul », « paul de zulueta », une adresse : la personne de l'équipe, ou null. */
export function membreDe(qui) {
  const q = String(qui || '').toLowerCase().trim();
  if (!q) return null;
  return equipe().find((p) => p.email === q || p.prenom.toLowerCase() === q || p.nom.toLowerCase() === q) || null;
}

// ---------------------------------------------------------------------------
// Les clés : un bien (dossier ou projet), un agent, un client.
// ---------------------------------------------------------------------------

const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id || 'Dossier';

/** La clé d'un bien : son dossier s'il en a un (un projet né d'un dossier partage sa fiche), sinon le projet. */
export function cleDuBien({ deal_id = null, projet_id = null } = {}) {
  const projet = projet_id ? Records.get('Project', String(projet_id)) : null;
  const dealId = deal_id || projet?.deal_id || null;
  if (dealId && Records.findBy('Deal', 'deal_id', String(dealId))) return `deal:${dealId}`;
  if (projet) return `projet:${projet.id}`;
  return null;
}

/** Ce que désigne une clé : son genre, son nom lisible, et de quoi ouvrir l'objet ailleurs. */
export function objetDe(cle) {
  const [type, ...reste] = String(cle || '').split(':');
  const id = reste.join(':');
  if (type === 'deal') {
    const deal = Records.findBy('Deal', 'deal_id', id);
    if (!deal) return null;
    const projet = deal.projet_id ? Records.get('Project', deal.projet_id) : Records.findBy('Project', 'deal_id', id);
    return { cle, genre: 'bien', nom: projet?.titre || titreDeal(deal), deal_id: id, projet_id: projet?.id || null, statut: deal.statut || null, lien: projet ? `/Projets?id=${projet.id}` : `/Dossiers?deal_id=${id}` };
  }
  if (type === 'projet') {
    const p = Records.get('Project', id);
    if (!p) return null;
    return { cle, genre: 'bien', nom: p.titre || p.adresse_complete || 'Projet', deal_id: p.deal_id || null, projet_id: p.id, statut: p.statut || null, lien: `/Projets?id=${p.id}` };
  }
  if (type === 'agent') {
    const a = Records.get('AgentImmo', id);
    // Le nom de Twenty d'abord, quand l'agent y est (23 nov. 2026, Jules) : server/crm/klocka.js le garde.
    return a ? { cle, genre: 'agent', nom: nomAgent(a.nom_crm) || nomAgent(a.nom, a) || a.nom || 'Agent', nom_crm: !!a.nom_crm, detail: [a.agence, a.ville].filter(Boolean).join(' · ') || null, photo: a.photo || null, lien: `/Prospection?agent=${id}` } : null;
  }
  if (type === 'client') {
    const c = Records.get('DemandeClient', id);
    return c ? { cle, genre: 'client', nom: c.nom_crm || c.client_nom || 'Client', nom_crm: !!c.nom_crm, detail: c.profil || null } : null;
  }
  if (type === 'personne') {
    // personne:<agence>:<nom> : un collaborateur d'une agence de la liste (28 nov. 2026, une fiche par agent).
    const [agenceId, n] = reste;
    const a = Records.get('AgenceProspect', agenceId);
    const x = a ? personneDeLAgence(a, n) : null;
    const f = Records.findBy('FicheDossier', 'cle', cle);
    if (!a && !f) return null;
    // Sa photo de la page équipe (photos-equipe.js la range par nom : minuscules, sans accents, mots séparés d'une espace).
    const cleNom = String(x?.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    return { cle, genre: 'agent', nom: f?.nom || x?.nom || 'Collaborateur', detail: [x?.fonction, a?.nom].filter(Boolean).join(' · ') || null, photo: a?.photos_equipe?.par_nom?.[cleNom] || null };
  }
  if (type === 'twenty') {
    // twenty:<objet>:<id> : la fiche du CRM ; son nom est celui qu'on a reçu au moment du lien.
    const [objet] = reste;
    const f = Records.findBy('FicheDossier', 'cle', cle);
    const crm = { objet, id: reste.slice(1).join(':') };
    // Une ligne du tableau Agences (28 nov. 2026) : une agence, ou un mandataire (une personne, donc un agent).
    if (objet === 'agence') {
      const a = agenceDeLaLigne(crm.id);
      const genre = a ? (a.genre === 'mandataire' ? 'agent' : 'agence') : f?.genre || 'agence';
      return { cle, genre, nom: f?.nom || a?.nom || 'Fiche du CRM', detail: [a?.genre === 'mandataire' ? a?.reseau_nom : null, a?.ville].filter(Boolean).join(' · ') || null, crm };
    }
    // Un client du CRM qui a sa demande dans Klocka : le nom de Twenty qu'elle garde fait foi (23 nov.), et son profil.
    const d = objet === 'clients' && crm.id ? Records.findBy('DemandeClient', 'twenty_id', crm.id) : null;
    if (d) return { cle, genre: 'client', nom: d.nom_crm || f?.nom || d.client_nom || 'Client', nom_crm: !!d.nom_crm, detail: d.profil || null, crm };
    // Un mandataire du tableau Agences (twenty:agence:<id>, 28 nov. 2026) est un agent, comme ceux d'Agent immobilier.
    return { cle, genre: objet === 'agentImmobilier' ? 'agent' : 'client', nom: f?.nom || 'Fiche du CRM', crm };
  }
  return null;
}

/** Un lien venu de l'écran, réduit à ce que la plateforme connaît : { cle, genre, nom }. */
export function lienPropre(l) {
  const brute = propre(l?.cle, 200);
  if (!/^(deal|projet|agent|client|twenty|personne):/.test(brute)) return null;
  // La clé qui fait foi (25 nov. 2026) : un lien posé sur la demande de Rachel va sur sa fiche du CRM (une-cle.js).
  const cle = cleUnique(brute);
  const o = objetDe(cle);
  if (!o && !cle.startsWith('twenty:')) return null;
  const genre = o?.genre || (/:agentImmobilier:/.test(cle) || cle.startsWith('personne:') ? 'agent' : /:agence:/.test(cle) ? 'agence' : 'client');
  return { cle, genre, nom: propre(cle.startsWith('twenty:') ? (l?.nom || o?.nom) : (o?.nom || l?.nom), 160) || 'Sans nom', ...((l?.detail || o?.detail) ? { detail: propre(l?.detail || o.detail, 160) } : {}) };
}

// ---------------------------------------------------------------------------
// Les fiches.
// ---------------------------------------------------------------------------

/** La fiche d'une clé, créée vide au premier besoin. */
export function fiche(cleRecue, { nom = null, genre = null } = {}) {
  const cle = cleUnique(cleRecue);
  const f = Records.findBy('FicheDossier', 'cle', cle);
  if (f) return f;
  const o = objetDe(cle);
  return Records.create('FicheDossier', { cle, genre: genre || o?.genre || 'bien', nom: nom || o?.nom || 'Sans nom', etape: null, resume: null, blocage: null, liees: [], maj_le: null, maj_par: null });
}

/**
 * Reporte un chiffre dit dans une note sur le projet du bien (taxe foncière, surface…), après le oui de la personne.
 * @returns {string|null} la ligne d'historique, ou null si le bien n'a pas de projet
 */
export function majProjet(cleBien, { champ, valeur }) {
  const o = objetDe(cleBien);
  const projet = o?.projet_id ? Records.get('Project', o.projet_id) : null;
  if (!projet) return null;
  const nombre = /^[\d\s.,]+$/.test(String(valeur)) ? Number(String(valeur).replace(/\s/g, '').replace(',', '.')) : null;
  const v = nombre !== null && Number.isFinite(nombre) ? nombre : String(valeur);
  Records.update('Project', projet.id, { [champ]: v });
  const libelles = { taxe_fonciere_an: 'Taxe foncière', charges_copropriete: 'Charges de copropriété', loyer_annuel_ht: 'Loyer annuel HT', surface_m2: 'Surface', prix_acquisition: 'Prix', nom_locataire: 'Locataire', activite_locataire: 'Activité du locataire', echeance_bail: 'Fin de bail' };
  return `Projet mis à jour : ${libelles[champ] || champ} ${typeof v === 'number' ? v.toLocaleString('fr-FR') : v}`;
}

/** La position d'un client sur un bien, sur le lien de la fiche `de` vers `vers`. */
function poserPosition(de, vers, { position, position_detail: detail = null }, le) {
  const f = Records.findBy('FicheDossier', 'cle', de);
  if (!f) return;
  Records.update('FicheDossier', f.id, { liees: (f.liees || []).map((l) => (l.cle === vers ? { ...l, position, position_detail: detail, position_le: le } : l)) });
}

const lier = (a, b) => {
  const fa = fiche(a.cle, a);
  const liees = fa.liees || [];
  // Lier à nouveau ce qu'on avait retiré : le retrait ne tient plus.
  const ecartees = (fa.ecartees || []).filter((c) => c !== b.cle);
  if (!liees.some((x) => x.cle === b.cle)) Records.update('FicheDossier', fa.id, { liees: [...liees, { cle: b.cle, genre: b.genre, nom: b.nom }], ecartees });
  else if (ecartees.length !== (fa.ecartees || []).length) Records.update('FicheDossier', fa.id, { ecartees });
};

/**
 * Délie deux fiches, des deux côtés (24 nov. 2026, Jules : « on doit pouvoir retirer un bien d'un agent, cliquer sur une
 * croix pour le délier d'Alexis »). Le lien noté est retiré ; un dossier que la plateforme rattachait seule (son analyse
 * nomme l'agent) est écarté, pour ne pas revenir. Rend ce qu'il faut pour le relier (Annuler).
 */
export function delier(de, vers) {
  const a = cleUnique(de), b = cleUnique(vers);
  if (!a || !b || a === b) return { ok: false, error: 'Rien à délier.' };
  const avant = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    const f = Records.findBy('FicheDossier', 'cle', x) || (objetDe(x) ? fiche(x) : null);
    if (!f) continue;
    const lien = (f.liees || []).find((l) => l.cle === y) || null;
    avant.push({ de: x, vers: y, lien });
    Records.update('FicheDossier', f.id, { liees: (f.liees || []).filter((l) => l.cle !== y), ecartees: [...new Set([...(f.ecartees || []), y])] });
  }
  return avant.length ? { ok: true, avant } : { ok: false, error: 'Fiche introuvable.' };
}

/** Défait un retrait : chaque lien revient tel qu'il était, l'écart est levé. */
export function relier(avant = []) {
  for (const { de, vers, lien } of avant) {
    const f = Records.findBy('FicheDossier', 'cle', de);
    if (!f) continue;
    const liees = (f.liees || []).filter((l) => l.cle !== vers);
    Records.update('FicheDossier', f.id, { liees: lien ? [...liees, lien] : liees, ecartees: (f.ecartees || []).filter((c) => c !== vers) });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ranger une note : ce que la personne a gardé de la proposition, et rien d'autre.
// ---------------------------------------------------------------------------

/**
 * Range la note validée. `garde` liste les ids des éléments gardés (tous si absent) ; `modifs` change une action
 * (titre, échéance, qui, texte du message) ; `reponses` sont les réponses aux questions, rangées en précisions.
 */
/**
 * Une fiche travaillée à la main : relue (« OK, c'est relu »), touchée par une note rangée avec son OK, ou portant une
 * note écrite dans son onglet Notes. Un import n'y réécrit plus rien (27 nov. 2026, Jules).
 */
export function aLaMain(f) {
  if (!f) return false;
  if (f.relue_le || f.maj_humain) return true;
  // Une note tapée dans l'onglet Notes (sans note d'origine ni source), une passation, une photo posée à la main.
  if (Records.filter('EntreeDossier', { fiche_cle: f.cle }).some((e) => e.source === 'passation' || (!e.note_id && e.par && !e.source && !e.importe))) return true;
  if (Records.filter('PhotoFiche', { cle: f.cle }).some((p) => p.par)) return true;
  return Records.filter('NoteDossier', { etat: 'rangee' }).some((n) => !n.importe && (n.liens || []).some((l) => l?.cle === f.cle));
}

export function rangerNote(note, { garde = null, modifs = {}, reponses = {} } = {}, user = null, { maintenant = () => new Date() } = {}) {
  if (!note || note.etat !== 'proposee') return { ok: false, error: note ? 'Cette note est déjà rangée.' : 'Note introuvable.' };
  const p = note.proposition || {};
  const garder = (id) => !Array.isArray(garde) || garde.includes(id);
  const le = maintenant().toISOString();
  const par = user?.email || note.par || null;
  const creees = { entrees: [], actions: [], fiches: [] };
  // `arrive_le` : le jour où la chose s'est passée, quand la note le dit (« mardi » ; 26 nov. 2026, Jules) ; `le` reste
  // le jour où on l'a rangée.
  const entree = (cle, genre, texte, raison = null, arriveLe = null) => {
    if (!GENRES_ENTREE.includes(genre) || !propre(texte)) return;
    creees.entrees.push(Records.create('EntreeDossier', { fiche_cle: cle, genre, texte: propre(texte), raison: raison ? propre(raison) : null, note_id: note.id, par, le, ordre: creees.entrees.length, ...(arriveLe && /^\d{4}-\d{2}-\d{2}$/.test(arriveLe) ? { arrive_le: arriveLe } : {}), ...(note.importe ? { importe: true, source: note.source?.genre || null } : {}) }).id);
  };

  // Les liens entre les fiches : les personnes d'un bien, les biens d'une personne.
  const liens = note.liens || [];
  for (const l of liens) fiche(l.cle, l);
  const biens = liens.filter((l) => l.genre === 'bien');
  const gens = liens.filter((l) => l.genre !== 'bien');
  for (const b of biens) for (const g of gens) { lier(b, g); lier(g, b); }

  // Chaque fiche : ses éléments gardés, puis son résumé, son étape et son blocage s'ils ont été gardés.
  for (const fp of p.fiches || []) {
    const lien = liens.find((l) => l.cle === fp.cle);
    if (!lien) continue;
    const f = fiche(lien.cle, lien);
    let touchee = false;
    for (const el of fp.elements || []) {
      if (!garder(el.id)) continue;
      entree(lien.cle, el.genre, el.texte, el.genre === 'decision' ? el.raison : null, el.genre === 'evenement' ? el.arrive_le : null);
      touchee = true;
    }
    const patch = {};
    // Une fiche déjà travaillée à la main (27 nov. 2026, Jules : « juste rajoute, ne modifie rien de ce que j'ai fait ») :
    // un import, rangé sans OK, n'y ajoute que des lignes ; son résumé, son étape, « Comment lui parler », son blocage et
    // son vendeur restent tels quels. Une note dite par quelqu'un, rangée par son OK, les met à jour comme avant.
    if (note.importe && aLaMain(f)) {
      if (touchee) {
        Records.update('FicheDossier', f.id, { a_relire: true, a_relire_par: f.a_relire_par || relecteurDe(lien.cle), maj_le: le, maj_par: par, maj_auto: true });
        creees.fiches.push(lien.cle);
      }
      continue;
    }
    if (fp.etape && garder(`${fp.id}-etape`) && (fp.etape !== f.etape || (fp.etat || null) !== (f.etat || null))) {
      patch.etape = fp.etape;
      patch.etat = fp.etat || null;
      entree(lien.cle, 'etape', `Étape : ${fp.etape}${fp.etat ? ` · ${fp.etat}` : ''}`);
    }
    if (fp.blocage !== undefined && garder(`${fp.id}-blocage`)) patch.blocage = fp.blocage || null;
    if (fp.vendeur && fp.vendeur !== f.vendeur) patch.vendeur = fp.vendeur;
    // La position d'un client sur les biens de la note : portée par le lien, des deux côtés (la carte du dossier).
    if (fp.position) for (const b of biens) { poserPosition(b.cle, lien.cle, fp, le); poserPosition(lien.cle, b.cle, fp, le); }
    if (fp.comment_parler && fp.genre !== 'bien' && (touchee || Object.keys(patch).length)) patch.comment_parler = fp.comment_parler;
    if (fp.resume && (touchee || Object.keys(patch).length)) patch.resume = fp.resume;
    // Rempli par l'import (22 nov. 2026, Jules : « valider par fiche, pas fait par fait ») : la fiche attend la relecture
    // de son analyste ; ses lignes portent l'étiquette « importé » jusque-là.
    if (note.importe && (touchee || Object.keys(patch).length)) { patch.a_relire = true; patch.a_relire_par = relecteurDe(lien.cle); }
    if (touchee || Object.keys(patch).length) {
      Records.update('FicheDossier', f.id, { ...patch, maj_le: le, maj_par: par, ...(note.importe ? { maj_auto: true } : { maj_humain: le }) });
      creees.fiches.push(lien.cle);
    }
  }

  // Les fiches liées que la note demande d'enlever (24 nov. 2026, Jules : « il ne nous a pas envoyé le dossier à Pau,
  // enlève-le de la fiche d'Alexis ») : déliées au OK, des deux côtés ; Annuler les relie.
  creees.retraits = [];
  for (const r of p.retraits || []) {
    if (!garder(r.id)) continue;
    const d = delier(r.de, r.vers);
    if (d.ok) creees.retraits.push(...d.avant);
  }
  const retirees = new Set((p.retraits || []).filter((r) => garder(r.id)).map((r) => r.de));
  for (const c of retirees) {
    const f = Records.findBy('FicheDossier', 'cle', c);
    if (f) Records.update('FicheDossier', f.id, { maj_le: le, maj_par: par });
    if (!creees.fiches.includes(c)) creees.fiches.push(c);
  }

  // Les réponses aux questions : une précision sur la fiche visée, ou sur chaque bien lié.
  for (const q of p.questions || []) {
    const r = propre(reponses?.[q.id], 600);
    if (!r) continue;
    // Un chiffre du bien accepté : il passe dans le projet, et l'historique le dit.
    if (q.maj_projet) {
      if (/^(oui|ok|yes|vas-y|d'accord|ouais)/i.test(r) && q.fiche) {
        const fait = majProjet(q.fiche, q.maj_projet);
        if (fait) entree(q.fiche, 'projet', fait);
      }
      continue;
    }
    const cibles = q.fiche && liens.some((l) => l.cle === q.fiche) ? [q.fiche] : (biens.length ? biens : liens).map((l) => l.cle);
    for (const c of cibles) entree(c, 'precision', `${q.texte} Réponse : ${r}.`.replace(/\.\.$/, '.'));
  }

  // Une fiche liée dont rien n'a été gardé garde au moins la note, pour que son journal la montre (pas pour un import :
  // une source qui n'apprend rien sur la fiche ne l'encombre pas).
  for (const l of note.importe ? [] : liens) {
    if (retirees.has(l.cle) || creees.entrees.some((id) => Records.get('EntreeDossier', id)?.fiche_cle === l.cle)) continue;
    entree(l.cle, 'note', p.titre || propre(note.texte, 160));
    Records.update('FicheDossier', fiche(l.cle, l).id, { maj_le: le, maj_par: par });
  }

  // Les actions déjà prévues que la note montre faites (20 nov. 2026, Jules : « on a appelé Alexandre, la relance
  // ne doit pas rester dans À faire ») : fermées avec le OK, sans ligne de plus au journal ; Annuler les rouvre.
  creees.faites = [];
  for (const d of p.faites || []) {
    if (!garder(d.id)) continue;
    const a = Records.get('ActionDossier', d.action_id);
    if (!a || a.statut !== 'ouverte') continue;
    if (changerAction(a.id, { statut: 'faite', journal: false }, user || { email: par }, { maintenant }).ok) creees.faites.push(a.id);
  }

  // Les actions gardées, avec ce que la personne a changé.
  for (const a of p.actions || []) {
    if (!garder(a.id)) continue;
    const m = modifs?.[a.id] || {};
    const qui = m.qui ?? a.qui;
    const membre = qui && qui !== 'moi' && qui !== 'assistant' ? membreDe(qui) : null;
    const brouillon = a.brouillon ? { ...a.brouillon, texte: propre(m.brouillon ?? a.brouillon.texte, 4000) } : null;
    creees.actions.push(Records.create('ActionDossier', {
      ...(a.avant ? { avant: a.avant } : {}),
      // Le brouillon tel que proposé : l'écart avec ce qui part, c'est ce que l'assistant apprend du style (22 nov. 2026).
      ...(brouillon ? { brouillon_initial: a.brouillon.texte } : {}),
      titre: propre(m.titre ?? a.titre, 300),
      genre: a.genre || (brouillon ? brouillon.canal : 'tache'),
      pour: a.pour || null,
      contexte: Array.isArray(a.contexte) ? a.contexte : [],
      qui: qui === 'assistant' && brouillon ? 'assistant' : 'personne',
      responsable: membre?.email || par,
      echeance: m.echeance === null ? null : dateValide(m.echeance ?? a.echeance),
      statut: 'ouverte',
      fiches: (a.fiches || []).filter((c) => liens.some((l) => l.cle === c)),
      note_id: note.id,
      brouillon,
      cree_par: par,
      cree_le: le,
    }).id);
    // Un message du Brouillon déjà envoyé (27 nov. 2026) : fermé tout de suite comme envoyé ; il entre dans
    // l'historique de ses fiches avec ce qu'il dit, et le style de l'auteur s'en nourrit.
    if ((note.envoye || a.deja_envoye) && brouillon?.de_l_auteur && ['whatsapp', 'mail'].includes(a.genre || brouillon.canal)) {
      changerAction(creees.actions[creees.actions.length - 1], { statut: 'faite' }, user || { email: par }, { maintenant });
    }
  }

  // L'assistant relit les notes d'un bien quand on l'interroge : la note brute y va aussi.
  const notesEquipe = [];
  for (const b of biens) {
    const o = objetDe(b.cle);
    const r = o ? noterSurLeBien({ deal_id: o.deal_id, projet_id: o.projet_id }, note.texte, user || { email: par }, { maintenant }) : null;
    if (r?.ok) notesEquipe.push({ deal_id: r.deal_id, projet_id: r.projet_id, note_id: r.note.id });
  }

  // Les règles de travail que la note énonce : gardées, puis proposées au Cerveau par la route (garderRegles).
  creees.regles = (p.regles || []).filter((r) => garder(r.id)).map((r) => ({ texte: r.texte, portee: r.portee }));
  Records.update('NoteDossier', note.id, { etat: 'rangee', rangee_le: le, rangee_par: par, garde: Array.isArray(garde) ? garde : null, modifs, reponses, creees: { ...creees, notes_equipe: notesEquipe } });
  return { ok: true, note_id: note.id, ...compteDe(creees), fiches: [...new Set(creees.fiches.length ? creees.fiches : liens.map((l) => l.cle))].map((c) => ({ cle: c, nom: liens.find((l) => l.cle === c)?.nom || objetDe(c)?.nom })) };
}

const compteDe = (c) => ({ entrees: c.entrees.length, actions: c.actions.length, faites: (c.faites || []).length, retraits: new Set((c.retraits || []).map((x) => [x.de, x.vers].sort().join('|'))).size });

/** Défait une note rangée : ses lignes de journal, ses actions, sa note sur le bien. Les fiches liées restent liées. */
export function annulerNote(note, user = null) {
  if (!note || note.etat !== 'rangee') return { ok: false, error: 'Rien à annuler.' };
  const c = note.creees || {};
  for (const id of c.entrees || []) Records.delete('EntreeDossier', id);
  for (const id of c.actions || []) {
    // Un message fermé comme envoyé à l'accord (le Brouillon) : sa ligne d'historique et son message envoyé partent aussi.
    const a = Records.get('ActionDossier', id);
    for (const e of a?.entrees || []) Records.delete('EntreeDossier', e);
    for (const m of Records.filter('MessageEnvoye', { action_id: id })) Records.delete('MessageEnvoye', m.id);
    Records.delete('ActionDossier', id);
  }
  for (const id of c.faites || []) changerAction(id, { statut: 'ouverte' }, user);
  relier(c.retraits || []);
  for (const n of c.notes_equipe || []) {
    const r = n.deal_id ? Records.findBy('Deal', 'deal_id', n.deal_id) : n.projet_id ? Records.get('Project', n.projet_id) : null;
    if (r) Records.update(n.deal_id ? 'Deal' : 'Project', r.id, { notes_equipe: (r.notes_equipe || []).filter((x) => x.id !== n.note_id) }, { garderDate: true });
  }
  Records.update('NoteDossier', note.id, { etat: 'annulee', annulee_le: new Date().toISOString(), annulee_par: user?.email || null });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Les actions.
// ---------------------------------------------------------------------------

/** Faite ou rouverte ; une action faite laisse une ligne au journal de ses fiches. */
// Les verbes qui ne font pas leur participe en « -é » (« écrire » → « écrit ») ; les autres en « -er » le font.
// Les verbes en « -er » d'une action (une liste, pas une règle : « dossier », « loyer » ne sont pas des verbes).
const VERBES_ER = new Set(['relancer', 'rappeler', 'appeler', 'envoyer', 'renvoyer', 'contacter', 'recontacter', 'demander', 'redemander', 'verifier', 'confirmer', 'programmer', 'planifier', 'preparer', 'organiser', 'transferer', 'presenter', 'proposer', 'valider', 'signer', 'visiter', 'passer', 'repasser', 'chercher', 'rechercher', 'trouver', 'recuperer', 'noter', 'caler', 'fixer', 'reserver', 'rencontrer', 'discuter', 'negocier', 'estimer', 'analyser', 'completer', 'finaliser', 'modifier', 'ajouter', 'retirer', 'lancer', 'poster', 'publier', 'partager', 'informer', 'consulter', 'creer', 'enregistrer', 'telephoner', 'expliquer', 'remercier', 'saluer', 'inviter', 'accompagner', 'boucler', 'cloturer', 'chiffrer', 'calculer', 'comparer', 'classer', 'deposer', 'imprimer', 'scanner', 'telecharger', 'importer', 'exporter', 'monter', 'demarcher', 'prospecter', 'qualifier', 'facturer', 'payer', 'regler', 'annuler', 'decaler', 'reporter', 'checker', 'pinger', 'briefer', 'debriefer', 'rediger', 'corriger']);
const PARTICIPES = { ecrire: 'écrit', faire: 'fait', refaire: 'refait', prendre: 'pris', reprendre: 'repris', mettre: 'mis', remettre: 'remis', transmettre: 'transmis', voir: 'vu', revoir: 'revu', lire: 'lu', relire: 'relu', dire: 'dit', joindre: 'joint', rejoindre: 'rejoint', obtenir: 'obtenu', recevoir: 'reçu', rendre: 'rendu', attendre: 'attendu', finir: 'fini', choisir: 'choisi', reunir: 'réuni', remplir: 'rempli', definir: 'défini', fournir: 'fourni', produire: 'produit', construire: 'construit', inscrire: 'inscrit', decrire: 'décrit' };

/**
 * Une action cochée, au passé et datée, pour l'historique de la fiche (25 nov. 2026, Jules : « relancer Sébastien Robic,
 * on coche, ça met dans l'historique relancé le x novembre ») : « Relancé Sébastien Robic, le 25 novembre ». Un premier
 * mot qui n'est pas un verbe connu garde « Fait : … ».
 */
export function ligneFaite(titre, le = new Date()) {
  const t = String(titre || '').trim();
  const jour = new Date(le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const m = t.match(/^(\S+)(.*)$/s);
  if (!m) return `Fait, le ${jour}`;
  const verbe = m[1].toLowerCase();
  const cle = sansAccent(verbe);
  const passe = PARTICIPES[cle] || (VERBES_ER.has(cle) ? `${verbe.slice(0, -2)}é` : null);
  if (!passe) return `Fait : ${t}, le ${jour}`;
  return `${passe.charAt(0).toUpperCase()}${passe.slice(1)}${m[2].replace(/[\s.]+$/, '')}, le ${jour}`;
}

export function changerAction(id, { statut = null, echeance, titre = null, brouillon = null, journal = true } = {}, user = null, { maintenant = () => new Date() } = {}) {
  const a = Records.get('ActionDossier', String(id));
  if (!a) return { ok: false, error: 'Action introuvable.' };
  const patch = {};
  if (statut && ['ouverte', 'faite', 'annulee'].includes(statut) && statut !== a.statut) {
    patch.statut = statut;
    if (statut === 'faite') {
      patch.faite_le = maintenant().toISOString();
      patch.faite_par = user?.email || null;
      // Fermée par la note qui rapporte l'appel (20 nov. 2026) : l'événement de la note dit déjà « Appel avec … ».
      // Un message envoyé entre dans l'historique avec ce qu'il dit (22 nov. 2026, Jules : « chaque message envoyé est un
      // fait à garder : ce qu'on a dit au client ») ; et le style de l'auteur s'apprend de ce qu'il a envoyé.
      const envoye = a.brouillon && ['whatsapp', 'mail'].includes(a.genre) ? String((brouillon != null ? brouillon : a.brouillon.texte) || '').trim() : '';
      const ligne = envoye ? `${a.genre === 'mail' ? 'Mail' : 'Message WhatsApp'} envoyé${a.pour ? ` à ${a.pour}` : ''} : « ${propre(envoye, 1500)} »` : ligneFaite(a.titre, patch.faite_le);
      patch.entrees = journal || envoye ? (a.fiches || []).map((c) => Records.create('EntreeDossier', { fiche_cle: c, genre: envoye ? 'message' : 'action_faite', texte: ligne, note_id: a.note_id || null, action_id: a.id, par: user?.email || null, le: patch.faite_le }).id) : [];
      if (envoye) {
        patch.envoye = envoye;
        Records.create('MessageEnvoye', { par: String(user?.email || a.responsable || '').toLowerCase() || null, pour: a.pour || null, canal: a.genre, initial: a.brouillon_initial || a.brouillon.texte || null, texte: envoye, de_l_auteur: !!a.brouillon.de_l_auteur, retouche: !a.brouillon.de_l_auteur && String(a.brouillon_initial || a.brouillon.texte || '').trim() !== envoye, action_id: a.id, fiches: a.fiches || [], le: patch.faite_le });
      }
    } else if (a.statut === 'faite') {
      for (const e of a.entrees || []) Records.delete('EntreeDossier', e);
      for (const m of Records.filter('MessageEnvoye', { action_id: a.id })) Records.delete('MessageEnvoye', m.id);
      patch.entrees = [];
      patch.faite_le = null;
      patch.envoye = null;
    }
  }
  if (echeance !== undefined) patch.echeance = echeance === null ? null : dateValide(echeance) || a.echeance;
  if (titre) patch.titre = propre(titre, 300);
  if (brouillon != null && a.brouillon) patch.brouillon = { ...a.brouillon, texte: String(brouillon).trim().slice(0, 4000) };
  return { ok: true, action: Records.update('ActionDossier', a.id, patch) };
}

/**
 * Le style d'une personne (22 nov. 2026, Jules : « l'écart entre le brouillon et l'envoi, c'est l'apprentissage ») : ses
 * derniers messages envoyés, et ceux où elle a retouché le brouillon de l'assistant (avant, après).
 */
export function styleDe(email, { n = 6, retouches = 3 } = {}) {
  const moi = String(email || '').toLowerCase();
  if (!moi) return null;
  const siens = Records.filter('MessageEnvoye', { par: moi }).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  if (!siens.length) return null;
  return {
    envoyes: siens.slice(0, n).map((m) => ({ pour: m.pour, canal: m.canal, texte: m.texte })),
    retouches: siens.filter((m) => m.retouche && m.initial).slice(0, retouches).map((m) => ({ initial: m.initial, texte: m.texte })),
  };
}

/**
 * Qui relit une fiche remplie par l'import (22 nov. 2026, Jules : « chaque analyste relit ses propres fiches, la relation
 * agent-analyste est individuelle ») : pour un agent, la dernière personne qui l'a appelé ; pour un bien, le premier
 * responsable du dossier ; sinon personne en particulier (toute l'équipe le voit).
 */
export function relecteurDe(cle) {
  const c = String(cle || '');
  if (c.startsWith('agent:')) {
    const appels = Records.filter('AppelAgent', { agent_id: c.slice(6) }).filter((x) => x.par).sort((a, b) => String(b.le).localeCompare(String(a.le)));
    return appels[0]?.par ? String(appels[0].par).toLowerCase() : null;
  }
  const o = objetDe(c);
  const deal = o?.deal_id ? Records.findBy('Deal', 'deal_id', o.deal_id) : null;
  const r = (deal?.responsables || []).map((x) => (typeof x === 'string' ? x : x?.email)).find(Boolean) || deal?.cree_par || null;
  // Un responsable noté par son prénom (« jules ») : son adresse, sans quoi la fiche ne sortirait chez personne.
  return r ? (membreDe(r)?.email || String(r).toLowerCase()) : null;
}

/** La fiche relue : ses lignes importées deviennent les siennes, l'étiquette tombe (22 nov. 2026). */
export function validerFiche(cle, user, { maintenant = new Date() } = {}) {
  const f = Records.findBy('FicheDossier', 'cle', cleUnique(cle));
  if (!f) return { ok: false, error: 'Fiche introuvable.' };
  const le = maintenant.toISOString();
  let n = 0;
  for (const e of Records.filter('EntreeDossier', { fiche_cle: f.cle }).filter((x) => x.importe)) { Records.update('EntreeDossier', e.id, { importe: false, relue_le: le }); n += 1; }
  Records.update('FicheDossier', f.id, { a_relire: false, relue_le: le, relue_par: user?.email || null });
  return { ok: true, cle: f.cle, lignes: n };
}

/** Les fiches importées qui attendent une relecture : les siennes d'abord, puis celles sans relecteur. */
export function aRelire(user, { limite = 60 } = {}) {
  const moi = String(user?.email || '').toLowerCase();
  const toutes = Records.filter('FicheDossier', { a_relire: true });
  const rang = (f) => (f.a_relire_par === moi ? 0 : !f.a_relire_par ? 1 : 2);
  return toutes.filter((f) => rang(f) < 2).sort((a, b) => rang(a) - rang(b) || String(a.nom).localeCompare(String(b.nom))).slice(0, limite)
    .map((f) => ({ cle: f.cle, nom: f.nom, genre: f.genre, a_moi: f.a_relire_par === moi, lignes: Records.filter('EntreeDossier', { fiche_cle: f.cle }).filter((e) => e.importe).length }));
}

/**
 * Une prochaine action dite au chat (19 nov. 2026, Jules : « je vais devoir relancer l'agent vendredi » ; « la fiche c'est
 * ce qui fait foi, une relance c'est juste une prochaine action qui arrive ce jour-là ») : posée sur la fiche du dossier
 * quand il est connu, à la personne qui l'a dite ou au collègue nommé, datée ; le jour venu, elle sort dans
 * « Aujourd'hui ». Une relance (relancer, rappeler, appeler) est du genre « appel ».
 */
export function poserProchaineAction({ dealId = null, projetId = null, quoi, echeance = null, de = null, aDemander = [], user = null }, { maintenant = () => new Date() } = {}) {
  const titre = propre(quoi, 300);
  if (!titre) return { ok: false, error: 'Rien à noter' };
  const cle = dealId || projetId ? cleDuBien({ deal_id: dealId, projet_id: projetId }) : null;
  if ((dealId || projetId) && !cle) return { ok: false, error: 'Dossier introuvable' };
  const par = user?.email || null;
  const membre = de ? membreDe(de) : null;
  const genre = /\b(relanc|rappel|appel)/i.test(sansAccent(titre)) ? 'appel' : 'tache';
  // L'agent du dossier, quand c'est lui qu'il faut relancer : sa fiche est liée aussi, son nom dit pour qui.
  const agent = cle && dealId && /\bagent\b/i.test(titre) ? agentsDuDossier(dealId)[0] || null : null;
  const le = maintenant().toISOString();
  if (cle) { const f = fiche(cle); Records.update('FicheDossier', f.id, { maj_le: le, maj_par: par }); }
  const action = Records.create('ActionDossier', {
    titre: titre.charAt(0).toUpperCase() + titre.slice(1),
    genre,
    pour: agent?.nom || null,
    // Les questions préparées pour l'appel (19 nov. 2026, Jules : « on va aussi préparer les questions à poser à l'agent »).
    contexte: (Array.isArray(aDemander) ? aDemander : []).map((q) => propre(q, 240)).filter(Boolean).slice(0, 10),
    qui: 'personne',
    responsable: membre?.email || par,
    echeance: dateValide(echeance),
    statut: 'ouverte',
    fiches: [cle, agent?.cle].filter(Boolean),
    note_id: null,
    brouillon: null,
    cree_par: par,
    cree_le: le,
    source: 'chat',
  });
  return { ok: true, action: actionLisible(action), fiche: cle ? { cle, nom: objetDe(cle)?.nom || null } : null };
}

/** L'inverse, pour l'annulation de la dernière action du chat. */
export function retirerProchaineAction(id) {
  const a = Records.get('ActionDossier', String(id || ''));
  if (!a) return { ok: false, error: 'Action introuvable' };
  Records.delete('ActionDossier', a.id);
  return { ok: true };
}

const actionLisible = (a) => ({
  id: a.id, titre: a.titre, qui: a.qui, responsable: a.responsable, responsable_prenom: prenomDe(a.responsable), echeance: a.echeance || null,
  statut: a.statut, genre: a.genre || (a.brouillon ? a.brouillon.canal : 'tache'), pour: a.pour || null, contexte: a.contexte || [], brouillon: a.brouillon || null, faite_le: a.faite_le || null, note_id: a.note_id || null,
  avant: a.avant || null, envoye: a.envoye || null,
  fiches: (a.fiches || []).map((c) => ({ cle: c, nom: Records.findBy('FicheDossier', 'cle', c)?.nom || objetDe(c)?.nom || null })),
  telephone: ['appel', 'whatsapp'].includes(a.genre) ? telephoneDe(a.fiches, a.pour) : null,
});

/**
 * Le numéro de la personne à appeler (20 nov. 2026, Jules : « la relance dit Appeler Alexandre, sans son numéro ») :
 * celui de l'agent lié à l'action, celui qui porte son nom quand il y en a plusieurs.
 */
export function telephoneDe(cles = [], pour = null) {
  const agents = (cles || []).filter((c) => String(c).startsWith('agent:')).map((c) => Records.get('AgentImmo', String(c).slice(6))).filter(Boolean);
  const cible = sansAccent(pour || '');
  const a = agents.length === 1 ? agents[0] : agents.find((x) => cible && sansAccent(x.nom).includes(cible.split(/\s+/).pop())) || null;
  const tel = (a?.telephones || []).map((t) => String(t || '').trim()).find(Boolean);
  return tel || null;
}

/** Les actions encore ouvertes sur les fiches d'une note, numérotées A1, A2… pour que le modèle dise lesquelles sont faites. */
export function prevuesDes(liens = [], { limite = 12 } = {}) {
  const cles = new Set((liens || []).map((l) => l.cle));
  return Records.filter('ActionDossier', { statut: 'ouverte' })
    .filter((a) => (a.fiches || []).some((c) => cles.has(c)))
    .sort(parEcheance)
    .slice(0, limite)
    .map((a, i) => ({ ref: `A${i + 1}`, id: a.id, genre: a.genre || (a.brouillon ? a.brouillon.canal : 'tache'), titre: a.titre, pour: a.pour || null, contexte: a.contexte || [], echeance: a.echeance || null, fiches: a.fiches || [] }));
}

// ---------------------------------------------------------------------------
// Ce qu'on lit : la fiche, le jour, les fiches récentes.
// ---------------------------------------------------------------------------

/** Les actions ouvertes d'une fiche, la plus urgente d'abord (sans date en dernier). */
export const actionsDe = (cle) => Records.list('ActionDossier').filter((a) => (a.fiches || []).includes(cle));
const parEcheance = (a, b) => String(a.echeance || '9999').localeCompare(String(b.echeance || '9999'));

/**
 * La fiche entière : le résumé qui se lit en vingt secondes (étape, dernière action, prochaine action, blocage),
 * les actions, les personnes ou les biens liés, les décisions et leur raison, le journal daté avec ses notes brutes.
 */
/**
 * Les dossiers dont le texte nomme cette personne (« conseiller Sébastien ROBIC » dans l'analyse) : prénom et nom qui
 * se suivent, dans un sens ou dans l'autre. Une recherche dans la base, quelques millisecondes.
 */
export function dossiersQuiNomment(nom, { emails = [] } = {}) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  const noms = mots.length >= 2 && mots.join(' ').length >= 6 ? [mots.join(' '), [...mots].reverse().join(' ')] : [];
  // Son adresse aussi : un dossier transféré garde l'expéditeur (« s robic <srobic@immobilier-professionnel.bzh> »).
  const adresses = (emails || []).map((e) => String(e || '').trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e));
  const motifs = [...noms, ...adresses].map((m) => `%${m.replace(/[%_]/g, '')}%`);
  if (!motifs.length) return [];
  const lignes = db.prepare(`SELECT json_extract(data, '$.deal_id') AS id FROM records WHERE entity = 'Deal' AND (${motifs.map(() => 'data LIKE ?').join(' OR ')}) AND COALESCE(json_extract(data, '$.archived'), 0) = 0 AND COALESCE(json_extract(data, '$.test'), 0) = 0`).all(...motifs);
  return lignes.map((r) => objetDe(`deal:${r.id}`)).filter(Boolean).slice(0, 12).map((o) => ({ cle: o.cle, genre: 'bien', nom: o.nom, plateforme: true }));
}

const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Les agents qu'un dossier nomme : l'adresse de l'expéditeur du mail transféré, l'adresse de contact, ou le nom complet
 * d'un agent de la Prospection dans le texte (« conseiller Sébastien ROBIC »).
 */
export function agentsDuDossier(dealId) {
  const ligne = dealId ? db.prepare("SELECT data FROM records WHERE entity = 'Deal' AND json_extract(data, '$.deal_id') = ?").get(dealId) : null;
  if (!ligne) return [];
  // En minuscules seulement : ôter les accents d'un dossier entier coûte plus que la recherche elle-même.
  const texte = ligne.data.toLowerCase();
  const adresses = new Set(texte.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []);
  const mots = new Set(texte.split(/[^\p{L}'-]+/u));
  return Records.champs('AgentImmo', ['nom', 'prenom', 'nom_famille', 'agence', 'ville', 'emails'])
    .filter((a) => {
      const nom = String(a.nom || [a.prenom, a.nom_famille].filter(Boolean).join(' ')).toLowerCase().trim();
      // Les mots du nom d'abord, dans l'ensemble des mots du dossier ; le nom entier ensuite, pour les seuls candidats.
      return (a.emails || []).some((e) => adresses.has(String(e).toLowerCase().trim()))
        || (nom.length >= 6 && /\s/.test(nom) && nom.split(/\s+/).every((m) => mots.has(m)) && texte.includes(nom));
    })
    .slice(0, 3)
    .map((a) => ({ cle: `agent:${a.id}`, genre: 'agent', nom: a.nom || [a.prenom, a.nom_famille].filter(Boolean).join(' '), detail: [a.agence, a.ville].filter(Boolean).join(' · ') || null }));
}

/**
 * La carte d'un dossier (19 nov. 2026, Jules) : le dossier au centre, l'agent (et le vendeur, lié à lui seul), les
 * clients à qui on l'a présenté avec leur position, et les personnes de l'équipe qui y ont vraiment travaillé (une note
 * liée, un appel avec l'agent), chacune reliée à ce qu'elle a touché.
 */
export function carteDuBien(cle, f) {
  const liees = f?.liees || [];
  const o = objetDe(cle);
  const agenceDe = (c) => (c.startsWith('agent:') ? Records.get('AgentImmo', c.slice(6))?.agence || null : null);
  const agents = [...liees.filter((l) => l.genre === 'agent').map((l) => ({ cle: l.cle, nom: l.nom, detail: agenceDe(l.cle) }))];
  const ecartees = new Set(f?.ecartees || []);
  for (const a of agentsDuDossier(o?.deal_id)) if (!ecartees.has(a.cle) && !agents.some((x) => x.cle === a.cle)) agents.push({ cle: a.cle, nom: a.nom, detail: agenceDe(a.cle), plateforme: true });
  // Sans position notée, une offre en négociation qui nomme le client vaut « offre » ; sinon il a été présenté.
  const nego = Records.filter('EntreeDossier', { fiche_cle: cle, genre: 'negociation' }).map((e) => sansAccent(e.texte));
  const clients = liees.filter((l) => l.genre === 'client').map((l) => {
    const famille = sansAccent(l.nom).split(/\s+/).filter((m) => m.length >= 3).pop();
    const deduite = famille && nego.some((t) => /offre|loi/.test(t) && t.includes(famille)) ? 'offre' : null;
    // « interesse » d'avant le 19 nov. au soir vaut « positionne ».
    const position = l.position === 'interesse' ? 'positionne' : l.position || deduite || 'presente';
    return { cle: l.cle, nom: l.nom, position, detail: l.position ? l.position_detail || null : null, le: l.position_le || null };
  });
  // L'équipe : qui a écrit une note liée à l'une de ces fiches, qui a appelé l'agent.
  const cles = new Set([cle, ...agents.map((a) => a.cle), ...clients.map((c) => c.cle)]);
  const parPersonne = new Map();
  const toucher = (email, vers, le) => {
    const e = String(email || '').toLowerCase();
    if (!e) return;
    const p = parPersonne.get(e) || { email: e, prenom: prenomDe(e), liens: new Set(), le: '', premier: '' };
    p.liens.add(vers);
    if (String(le || '') > p.le) p.le = String(le || '');
    if (le && (!p.premier || String(le) < p.premier)) p.premier = String(le);
    parPersonne.set(e, p);
  };
  for (const n of Records.filter('NoteDossier', { etat: 'rangee' })) for (const l of n.liens || []) if (cles.has(l.cle)) toucher(n.par, l.cle, n.le);
  const idsAgents = new Set(agents.map((a) => a.cle.replace(/^agent:/, '')));
  if (idsAgents.size) {
    const ids = [...idsAgents];
    const appels = db.prepare(`SELECT json_extract(data, '$.agent_id') AS agent_id, json_extract(data, '$.par') AS par, json_extract(data, '$.le') AS le FROM records WHERE entity = 'AppelAgent' AND json_extract(data, '$.agent_id') IN (${ids.map(() => '?').join(',')}) AND COALESCE(json_extract(data, '$.essai'), 0) = 0`).all(...ids);
    for (const a of appels) if (a.par) toucher(a.par, `agent:${a.agent_id}`, a.le);
  }
  return {
    dossier: { cle, nom: f?.nom || o?.nom || 'Dossier' },
    vendeur: f?.vendeur || null,
    agents,
    clients,
    // Le premier à y avoir travaillé porte le dossier ; ceux venus après l'ont repris (Coralie, un appel la semaine d'après).
    equipe: [...parPersonne.values()].sort((a, b) => a.premier.localeCompare(b.premier)).slice(0, 5)
      .map((p, i) => ({ prenom: p.prenom, email: p.email, liens: [...p.liens], repris: i > 0, depuis: p.premier || null })),
  };
}

/**
 * Les fiches liées à une fiche : celles que les notes ont liées, puis, pour un agent, les dossiers que la plateforme
 * connaît sans note (ceux dont l'analyse le nomme : 19 nov. 2026, Jules, « ça ne m'a pas rempli les dossiers de
 * l'agent ») ; jamais ce qu'on a retiré à la main ou par une note (`ecartees`).
 */
function lieesBrutes(cle, f, o) {
  const genre = f?.genre || o?.genre;
  const ecartees = new Set(f?.ecartees || []);
  const deLaPlateforme = genre === 'agent' ? dossiersQuiNomment(f?.nom || o?.nom, { emails: cle.startsWith('agent:') ? Records.get('AgentImmo', cle.slice(6))?.emails : [] }).filter((d) => !(f?.liees || []).some((l) => l.cle === d.cle)) : [];
  return [...(f?.liees || []), ...deLaPlateforme].filter((l) => !ecartees.has(l.cle));
}

/** Les fiches liées à `cle`, comme sa fiche les montre : [{ cle, genre, nom, plateforme? }]. */
export function lieesDe(cleRecue) {
  const cle = cleUnique(cleRecue);
  const f = Records.findBy('FicheDossier', 'cle', cle);
  const o = objetDe(cle);
  return f || o ? lieesBrutes(cle, f, o) : [];
}

export function ficheVue(cleRecue) {
  // Une seule fiche par chose (25 nov. 2026, Jules) : la clé qui fait foi, et ce qui était rangé sous une autre y est fondu.
  const cle = cleUnique(cleRecue);
  rassembler(cle);
  const f = Records.findBy('FicheDossier', 'cle', cle);
  const o = objetDe(cle);
  if (!f && !o) return null;
  const photoPosee = photoDe(cle);
  const entrees = Records.filter('EntreeDossier', { fiche_cle: cle }).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const actions = actionsDe(cle);
  const ouvertes = actions.filter((a) => a.statut === 'ouverte').sort(parEcheance);
  const faites = actions.filter((a) => a.statut === 'faite').sort((a, b) => String(b.faite_le).localeCompare(String(a.faite_le)));
  const notes = new Map();
  for (const e of entrees) if (e.note_id && !notes.has(e.note_id)) notes.set(e.note_id, Records.get('NoteDossier', e.note_id));
  // Le journal : une ligne par note (ce qu'on en a gardé, la note brute dépliable), une ligne par action faite.
  const journal = [];
  const vues = new Set();
  for (const e of entrees) {
    if (e.genre === 'action_faite' || (e.genre === 'message' && e.action_id)) { journal.push({ id: e.id, le: e.le, par: prenomDe(e.par), source: 'action', titre: e.texte, lignes: [{ genre: e.genre, texte: e.texte }] }); continue; }
    const k = e.note_id || e.id;
    if (vues.has(k)) continue;
    vues.add(k);
    const n = e.note_id ? notes.get(e.note_id) : null;
    const evenement = entrees.find((x) => (x.note_id || x.id) === k && x.genre === 'evenement');
    journal.push({
      // La ligne de l'historique : ce qui s'est passé, vu de cette fiche (« Appel avec Sébastien Robic à propos de la
      // taxe foncière »), sinon le titre de la note (20 nov. 2026, Jules).
      // Le jour de ce qui s'est passé quand la note le dit (« mardi »), sinon celui de la note (26 nov. 2026, Jules).
      id: k, le: evenement?.arrive_le ? `${evenement.arrive_le}T12:00:00.000Z` : n?.le || e.le, par: prenomDe(n?.par || e.par), source: 'note',
      titre: evenement?.texte || n?.proposition?.titre || null,
      lignes: entrees.filter((x) => (x.note_id || x.id) === k && !['action_faite', 'ressenti', 'evenement', 'profil'].includes(x.genre)).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map((x) => ({ genre: x.genre, texte: x.texte, raison: x.raison || null })),
      brut: n?.importe ? null : n?.texte || null,
      importe: entrees.some((x) => (x.note_id || x.id) === k && x.importe),
      origine: n?.source ? { genre: n.source.genre, de: n.source.de || null, lieu: n.source.lieu || null } : null,
    });
  }
  journal.sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const derniere = journal[0] || null;
  const genre = f?.genre || o?.genre;
  // Les dossiers d'un agent que la plateforme connaît sans note : ceux dont l'analyse le nomme (19 nov. 2026, Jules :
  // « ça ne m'a pas rempli les dossiers de l'agent »).
  const liees = lieesBrutes(cle, f, o).map((l) => {
    const sa = Records.findBy('FicheDossier', 'cle', l.cle);
    // Un dossier dit son étape : celle des notes, sinon celle que la plateforme voit (« Projet »), pas « Dossier ».
    const etape = sa?.etape || (l.genre === 'bien' ? donneesDuBien(l.cle)?.avancement?.etapes?.find((e) => e.courante)?.nom || null : null);
    const dernierRessenti = Records.filter('EntreeDossier', { fiche_cle: l.cle, genre: 'ressenti' }).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    return { ...l, resume: sa?.resume || null, etape: etape && sa?.etat ? `${etape} · ${sa.etat}` : etape, maj_le: sa?.maj_le || null, ressenti: dernierRessenti?.texte || null, ressenti_le: dernierRessenti?.le || null };
  });
  return {
    dossier: genre === 'bien' ? donneesDuBien(cle, { etape: f?.etape || null, entrees }) : null,
    carte: genre === 'bien' ? carteDuBien(cle, f) : null,
    cle, genre, nom: (o?.nom_crm && o.nom) || (genre === 'agent' && (f?.nom || o?.nom) !== 'Fiche du CRM' && nomAgent(f?.nom || o?.nom)) || f?.nom || o?.nom, lien: o?.lien || null, crm: o?.crm || null, detail: o?.detail || null,
    // La photo posée sur la fiche (importée, ou trouvée pour un agent : server/photos-fiches.js), sinon celle de l'agent.
    photo: photoPosee?.url || o?.photo || null, photo_importee: photoPosee?.source === 'importee', photos: photosDe(cle),
    etape: f?.etape || null, etat: f?.etat || null, etapes: ETAPES, resume: f?.resume || null, source: f?.source || null, blocage: f?.blocage || null, maj_le: f?.maj_le || null, maj_par: prenomDe(f?.maj_par),
    // Comment lui parler (22 nov. 2026) : la synthèse, puis les profils notés, du plus récent au plus ancien.
    comment_parler: f?.comment_parler || null,
    profils: entrees.filter((e) => e.genre === 'profil').map((e) => ({ id: e.id, texte: e.texte, le: e.le, par: prenomDe(e.par), importe: !!e.importe })),
    ecarts: entrees.filter((e) => e.genre === 'ecart').map((e) => ({ id: e.id, texte: e.texte, le: e.le })),
    // Les fiches qu'il nous a envoyées, lues dans la Mémoire à chaque ouverture (24 nov. 2026, Jules) : fiches-envoyees.js.
    envois: genre === 'agent' ? envoisDeLAgent(cle, { nom: f?.nom || o?.nom, prenomDe }) : null,
    a_relire: !!f?.a_relire, a_relire_par: prenomDe(f?.a_relire_par), importees: entrees.filter((e) => e.importe).length,
    derniere: derniere ? { le: derniere.le, par: derniere.par, texte: derniere.lignes[0]?.texte || null } : null,
    prochaine: ouvertes[0] ? actionLisible(ouvertes[0]) : null,
    actions: ouvertes.map(actionLisible),
    faites: faites.slice(0, 20).map(actionLisible),
    decisions: entrees.filter((e) => e.genre === 'decision').map((e) => ({ id: e.id, texte: e.texte, raison: e.raison || null, le: e.le, par: prenomDe(e.par) })),
    // Les notes libres : les ressentis et impressions, hors de l'historique (19 nov. 2026, Jules).
    notes: entrees.filter((e) => e.genre === 'ressenti').map((e) => ({ id: e.id, texte: e.texte, le: e.le, par: prenomDe(e.par), rangee: !!e.note_id })),
    liees,
    journal,
  };
}

/** Le jour d'une personne : ses actions dues (en retard comprises), les messages prêts à relire, les notes laissées sans OK. */
export function aujourdhui(user, { maintenant = () => new Date() } = {}) {
  const moi = String(user?.email || '').toLowerCase();
  const auj = jour(maintenant());
  const dans7 = jour(new Date(maintenant().getTime() + 7 * 864e5));
  const miennes = Records.filter('ActionDossier', { statut: 'ouverte' }).filter((a) => String(a.responsable || '').toLowerCase() === moi);
  const dues = miennes.filter((a) => a.echeance && a.echeance <= auj).sort(parEcheance);
  const prets = miennes.filter((a) => a.qui === 'assistant' && a.brouillon && !(a.echeance && a.echeance <= auj));
  const bientot = miennes.filter((a) => a.qui !== 'assistant' && a.echeance && a.echeance > auj && a.echeance <= dans7).sort(parEcheance);
  const sansDate = miennes.filter((a) => !a.echeance && a.qui !== 'assistant');
  const enSuspens = Records.filter('NoteDossier', { etat: 'proposee' })
    .filter((n) => String(n.par || '').toLowerCase() === moi && Date.now() - new Date(n.le).getTime() < 14 * 864e5)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map((n) => ({ id: n.id, le: n.le, titre: n.proposition?.titre || propre(n.texte, 90), liens: n.liens || [] }));
  return { aujourdhui: auj, dues: dues.map(actionLisible), prets: prets.map(actionLisible), bientot: bientot.map(actionLisible), sans_date: sansDate.length, en_suspens: enSuspens };
}

/** Les fiches touchées le plus récemment, pour qui revient et veut voir où en est l'équipe. */
export function fichesRecentes({ genre = 'bien', limite = 8 } = {}) {
  return Records.filter('FicheDossier', { genre })
    .filter((f) => f.maj_le)
    .sort((a, b) => String(b.maj_le).localeCompare(String(a.maj_le)))
    .slice(0, limite)
    .map((f) => {
      const prochaine = actionsDe(f.cle).filter((a) => a.statut === 'ouverte').sort(parEcheance)[0];
      return { cle: f.cle, nom: f.nom, etape: f.etape, resume: f.resume, blocage: f.blocage, maj_le: f.maj_le, maj_par: prenomDe(f.maj_par), prochaine: prochaine ? actionLisible(prochaine) : null };
    });
}

/** Ce que l'assistant sait déjà d'une fiche, à lui redonner avant qu'il lise une nouvelle note. */
export function contexteDe(cle) {
  const f = Records.findBy('FicheDossier', 'cle', cle);
  if (!f) return null;
  const ouvertes = actionsDe(cle).filter((a) => a.statut === 'ouverte').sort(parEcheance).slice(0, 8);
  const decisions = Records.filter('EntreeDossier', { fiche_cle: cle, genre: 'decision' }).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 5);
  return {
    etape: f.etape || null, etat: f.etat || null, resume: f.resume || null, blocage: f.blocage || null,
    actions_ouvertes: ouvertes.map((a) => `${a.titre}${a.echeance ? ` (pour le ${a.echeance})` : ''}`),
    decisions: decisions.map((d) => `${d.texte}${d.raison ? ` : ${d.raison}` : ''}`),
  };
}

// ---------------------------------------------------------------------------
// Mes notes (19 nov. 2026, Jules : « c'est l'entrée la plus importante, parce que c'est son réflexe : je relis mes
// notes ») : toutes les notes de la personne, de la plus récente à la plus ancienne, avec leurs liens et leur état ;
// une note ouverte montre le texte tel qu'écrit et ce qui en a été rangé, fiche par fiche.
// ---------------------------------------------------------------------------

const ETAT_LISIBLE = { proposee: 'En attente de validation', rangee: 'Rangée', ecartee: 'Écartée', annulee: 'Annulée' };

/** Les notes de `user`, une recherche sur le texte, le titre et les noms liés. Les propositions remplacées sont tues. */
export function mesNotes(user, { q = '', limite = 300 } = {}) {
  const moi = String(user?.email || '').toLowerCase();
  const mots = sansAccent(q).split(/\s+/).filter(Boolean);
  return Records.filter('NoteDossier', {})
    .filter((n) => String(n.par || '').toLowerCase() === moi && ETAT_LISIBLE[n.etat])
    .map((n) => ({ id: n.id, le: n.le, etat: n.etat, etat_lisible: ETAT_LISIBLE[n.etat], titre: n.proposition?.titre || propre(n.texte, 90), liens: (n.liens || []).map((l) => ({ cle: l.cle, genre: l.genre, nom: l.nom })), extrait: propre(n.texte, 220), _texte: n.texte }))
    .filter((n) => !mots.length || mots.every((m) => sansAccent(`${n.titre} ${n._texte} ${n.liens.map((l) => l.nom).join(' ')}`).includes(m)))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .slice(0, limite)
    .map(({ _texte, ...n }) => n);
}

/** Une note ouverte : le texte tel qu'écrit, et ce qui en a été rangé sur chaque fiche (ou ce qui est proposé). */
export function noteEtRangement(id) {
  const n = Records.get('NoteDossier', id);
  if (!n) return null;
  const parFiche = new Map();
  const ajouter = (cle, ligne) => {
    const l = (n.liens || []).find((x) => x.cle === cle);
    const f = parFiche.get(cle) || { cle, genre: l?.genre || objetDe(cle)?.genre || null, nom: l?.nom || objetDe(cle)?.nom || cle, lignes: [] };
    f.lignes.push(ligne);
    parFiche.set(cle, f);
  };
  for (const eid of n.creees?.entrees || []) {
    const e = Records.get('EntreeDossier', eid);
    if (e && e.genre !== 'note') ajouter(e.fiche_cle, { genre: e.genre, texte: e.texte, raison: e.raison || null });
  }
  const actions = (n.creees?.actions || []).map((aid) => Records.get('ActionDossier', aid)).filter(Boolean)
    .map((a) => ({ id: a.id, titre: a.titre, echeance: a.echeance || null, statut: a.statut, genre: a.genre }));
  return {
    id: n.id, le: n.le, etat: n.etat, etat_lisible: ETAT_LISIBLE[n.etat] || n.etat, titre: n.proposition?.titre || propre(n.texte, 90),
    texte: n.texte, conversation: !!n.conversation, liens: n.liens || [],
    rangement: [...parFiche.values()], actions,
  };
}

// ---------------------------------------------------------------------------
// Les fiches récentes (19 nov. 2026, Jules : « on range, on part, on revient dans la journée, on ouvre l'application :
// il faut juste avoir accès aux fiches récemment ouvertes ») : une ligne par personne et par fiche, datée à chaque
// ouverture ; avec les fiches que ses notes ont touchées.
// ---------------------------------------------------------------------------

/** Note qu'une personne a ouvert une fiche. */
/**
 * Une note écrite sur la fiche elle-même, dans l'onglet Notes (20 nov. 2026, Jules, maquette « Ajouter une note sur
 * Sébastien ROBIC ») : gardée telle quelle, sans passer par l'assistant ; celles qu'il a rangées le disent.
 */
export function noterSurLaFiche(cle, texte, user, { maintenant = new Date() } = {}) {
  const c = cleUnique(cle);
  const t = propre(texte);
  if (!t) return { ok: false, error: 'La note est vide.' };
  if (!Records.findBy('FicheDossier', 'cle', c) && !objetDe(c)) return { ok: false, error: 'Fiche introuvable.' };
  const e = Records.create('EntreeDossier', { fiche_cle: c, genre: 'ressenti', texte: t, note_id: null, par: user?.email || null, le: maintenant.toISOString() });
  { const fm = Records.findBy('FicheDossier', 'cle', c); if (fm) Records.update('FicheDossier', fm.id, { maj_humain: maintenant.toISOString() }); }
  return { ok: true, note: { id: e.id, texte: e.texte, le: e.le, par: prenomDe(e.par), rangee: false } };
}

export function noterOuverture(cle, user, { maintenant = new Date() } = {}) {
  const par = String(user?.email || '').toLowerCase();
  if (!par || !cle) return;
  const deja = Records.filter('FicheOuverte', { par, cle })[0];
  if (deja) Records.update('FicheOuverte', deja.id, { le: maintenant.toISOString() }, { garderDate: true });
  else Records.create('FicheOuverte', { par, cle, le: maintenant.toISOString() });
}

const GENRE_COURT = { bien: 'Dossier', agent: 'Agent', client: 'Client' };

/**
 * Les fiches qu'une personne a ouvertes, la plus récente en haut : sa liste à elle (19 nov. 2026, Jules : « nos fiches
 * individuelles qu'on a ouvertes récemment »). La fiche, elle, est la même pour tous : une note de l'un la met à jour
 * pour chacun.
 */
export function fichesRecentesDe(user, { limite = 10 } = {}) {
  const par = String(user?.email || '').toLowerCase();
  const quand = new Map();
  const vu = (cle, le) => { if (cle && String(le || '') > String(quand.get(cle) || '')) quand.set(cle, String(le || '')); };
  for (const o of Records.filter('FicheOuverte', { par })) vu(o.cle, o.le);
  return [...quand.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, limite * 2)
    .map(([cle, le]) => {
      const f = Records.findBy('FicheDossier', 'cle', cle);
      const o = objetDe(cle);
      if (!f && !o) return null;
      const genre = f?.genre || o?.genre;
      const nom = f?.nom || o?.nom;
      // Un dossier dit où il en est : l'étape notée, sinon celle que la plateforme voit (« Offre », « Projet »).
      const etape = genre === 'bien' ? f?.etape || donneesDuBien(cle, { entrees: Records.filter('EntreeDossier', { fiche_cle: cle }) })?.avancement?.etapes?.find((e) => e.courante)?.nom || null : null;
      return { cle, genre, nom, sous: [GENRE_COURT[genre], etape ? `${etape}${f?.etat ? ` · ${f.etat}` : ''}` : o?.detail || null].filter(Boolean).join(' · '), le };
    })
    .filter(Boolean)
    .slice(0, limite);
}

/**
 * Les choses à faire d'une personne (20 nov. 2026, Jules : la pilule « À faire » de l'accueil) : ses actions ouvertes,
 * le retard et le jour d'abord, puis les dates à venir, puis ce qui n'a pas de date.
 */
/** Ses actions cochées aujourd'hui (28 nov. 2026, Jules : la liste épinglée les garde barrées, « 1 tâche faite aujourd'hui »). */
export function faitesDuJour(user, { maintenant = new Date() } = {}) {
  const moi = String(user?.email || '').toLowerCase();
  const auj = jour(maintenant);
  return Records.filter('ActionDossier', { statut: 'faite' })
    .filter((a) => a.faite_le && jour(a.faite_le) === auj && String(a.faite_par || a.responsable || '').toLowerCase() === moi)
    .sort((a, b) => String(a.faite_le).localeCompare(String(b.faite_le)))
    .map((a) => actionLisible(a));
}

export function mesActions(user, { maintenant = new Date() } = {}) {
  const moi = String(user?.email || '').toLowerCase();
  const auj = jour(maintenant);
  const miennes = Records.filter('ActionDossier', { statut: 'ouverte' }).filter((a) => String(a.responsable || '').toLowerCase() === moi);
  const rang = (a) => (!a.echeance ? 2 : a.echeance <= auj ? 0 : 1);
  return miennes.sort((a, b) => rang(a) - rang(b) || String(a.echeance || '').localeCompare(String(b.echeance || '')))
    .map((a) => ({ ...actionLisible(a), du: !!a.echeance && a.echeance <= auj }));
}
