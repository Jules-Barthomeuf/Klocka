// Le tableau de bord et les résultats du module Emailing (8 nov. 2026, Jules). Ce qui compte d'abord : les fiches, les
// calls et les réponses que les mails ont produits ; les ouvertures restent indicatives.

import db, { Records } from '../db.js';
import { E } from './schema.js';
import * as J from './journal.js';
import { liste as automatisations } from './automatisations.js';
import { repartition } from './scores.js';
import { aTraiter as reponsesATraiter } from './reponses.js';

const JOUR = 86400000;
const compte = (type, depuis) => db.prepare('SELECT COUNT(*) n FROM mail_evenement WHERE type = ? AND le >= ?').get(type, depuis).n;

export function tableau({ jours = 30, quand = new Date() } = {}) {
  const depuis = new Date(quand.getTime() - jours * JOUR).toISOString();
  const delivres = compte('delivre', depuis);
  const plaintes = compte('plainte', depuis);
  const rebonds = compte('rebond', depuis);
  const autos = automatisations();
  const noms = new Map(autos.map((a) => [a.id, a.nom]));
  const prochains = db.prepare(`SELECT automatisation_id a, canal, etat, MIN(prevu_le) le, COUNT(*) n FROM mail_file WHERE etat IN ('a_valider', 'a_partir') GROUP BY 1, 2, 3 ORDER BY le LIMIT 8`).all()
    .map((l) => ({ nom: noms.get(l.a) || 'Sans automatisation', canal: l.canal, etat: l.etat, le: l.le, n: l.n }));
  const newsletters = Records.list('EmailingNewsletter').filter((n) => n.statut === 'active').slice(0, 5).map((n) => ({ nom: n.nom, statut: n.statut }));
  return {
    jours,
    fiches: db.prepare(`SELECT COUNT(*) n FROM mail_parcours WHERE raison = 'fiche_recue' AND sorti_le >= ?`).get(depuis).n,
    calls: compte('call_pris', depuis),
    reponses: compte('reponse', depuis),
    reponses_a_traiter: reponsesATraiter(),
    a_valider: J.compterAValider(),
    delivres, plaintes, rebonds,
    taux_plaintes: delivres ? (plaintes / delivres) * 100 : 0,
    taux_rebonds: delivres ? (rebonds / delivres) * 100 : 0,
    stades: repartition(),
    leads_recents: compte('lead_magnet_pris', depuis) + compte('webinaire_inscrit', depuis),
    prochains, newsletters,
    automatisations: autos.filter((a) => a.statut === 'active').slice(0, 8).map((a) => ({ id: a.id, nom: a.nom, nature: a.nature, ...a.chiffres })),
  };
}

export function resultats() {
  return automatisations().map((a) => ({ id: a.id, nom: a.nom, nature: a.nature, statut: a.statut, ...a.chiffres }));
}

/** Les contacts par stade, les plus chauds d'abord. */
export function contactsScores({ stade = null, q = '', limite = 200 } = {}) {
  const t = J.norm(q);
  return Records.list(E.CONTACT)
    .filter((c) => (!stade || (c.stade || 'lead') === stade) && (!t || `${c.email} ${c.prenom} ${c.nom} ${c.entreprise}`.toLowerCase().includes(t)))
    .sort((a, b) => (b.score_sql || 0) - (a.score_sql || 0) || (b.score_mql || 0) - (a.score_mql || 0))
    .slice(0, limite)
    .map((c) => ({ id: c.id, email: c.email, prenom: c.prenom, nom: c.nom, entreprise: c.entreprise, type: c.type, tags: c.tags, statut: c.statut, source: c.source, base_legale: c.base_legale, stade: c.stade || 'lead', score_mql: c.score_mql || 0, score_sql: c.score_sql || 0, stade_le: c.stade_le || null, suivi_par: c.suivi_par || null }));
}

/** Tout ce que le module sait d'un contact : scores, parcours, mails, faits. */
export function ficheContact(id) {
  const c = Records.get(E.CONTACT, id);
  if (!c) return null;
  const autos = new Map(Records.list('EmailingAutomatisation').map((a) => [a.id, a.nom]));
  return {
    contact: c,
    opposition: J.opposition(c.email),
    parcours: J.parcoursDe(c.id).map((p) => ({ id: p.id, nom: autos.get(p.automatisation_id) || 'Supprimée', statut: p.statut, raison: p.raison, entre_le: p.entre_le, sorti_le: p.sorti_le, prochain_le: p.prochain_le })),
    mails: J.fileDe(c.email).map((l) => ({ id: l.id, objet: l.objet, canal: l.canal, boite: l.boite, etat: l.etat, envoye_le: l.envoye_le, ouvert_le: l.ouvert_le, clique_le: l.clique_le, repondu_le: l.repondu_le, automatisation: autos.get(l.automatisation_id) || null })),
    faits: J.evenementsDe(c.email, 100).map((e) => ({ id: e.id, type: e.type, le: e.le, source: e.source })),
  };
}

/** Par adresse : ce que le CRM affiche sur une fiche. */
export function ficheParEmail(email) {
  const c = J.contactParEmail(email);
  return c ? ficheContact(c.id) : { contact: null, opposition: J.opposition(email), parcours: [], mails: J.fileDe(email).map((l) => ({ id: l.id, objet: l.objet, canal: l.canal, boite: l.boite, etat: l.etat, envoye_le: l.envoye_le })), faits: [] };
}

/** La file à valider, prête pour l'écran. */
export function fileAValider() {
  const autos = new Map(Records.list('EmailingAutomatisation').map((a) => [a.id, a]));
  return J.aValider().map((l) => {
    const c = l.contact_id ? Records.get(E.CONTACT, l.contact_id) : null;
    const a = autos.get(l.automatisation_id);
    return { ...l, automatisation: a?.nom || null, contact: c ? { id: c.id, prenom: c.prenom, nom: c.nom, entreprise: c.entreprise, ville: c.ville } : null };
  });
}
