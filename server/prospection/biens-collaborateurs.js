// Les biens de chaque collaborateur, sur la carte d'avant l'appel (25 nov. 2026, Jules : « en mode appel, en plus des
// collaborateurs, ce serait top de pouvoir voir leurs biens directement ; ça nous permettrait de cibler celui qu'on
// appelle »). Rien de nouveau à lire : la Mémoire a déjà les deux sources.
//  - les annonces de commerce publiées sur Equimmox (memoire/equimmox.js), avec le mail et le numéro de l'agent ;
//  - les fiches qu'il nous a envoyées (transferts, boîtes, dossiers), avec son nom, son mail, son numéro.
// Une personne se reconnaît à son mail (le vrai ou celui déduit du format de l'agence), à son numéro personnel, ou à son
// nom quand le bien est bien de cette agence. Ce qui est de l'agence sans être à personne de la liste se range à part.

import { Records } from '../db.js';
import { norm, normEmail, normTel } from './regles.js';
import { cleAgence, domaineDe, domaineRacine, domainesAgence } from './agent-ia.js';

const MAX_PAR_PERSONNE = 20;
const memeNom = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.split(' ').sort().join(' ') === y.split(' ').sort().join(' '));
};

/** Pure : le bien est-il de cette agence ? Par le domaine du mail de l'agent, sinon par le nom de l'agence. */
export function bienDeLAgence(b, agence) {
  const dom = domaineRacine(domaineDe(b?.agent_email || b?.agent?.email));
  // domaineDe écarte les messageries grand public : un mail Gmail ne dit pas l'agence.
  if (dom && domainesAgence(agence).has(dom)) return true;
  const nom = cleAgence(b?.agent?.agence || '');
  const sienne = cleAgence(agence?.nom || '');
  if (!nom || !sienne) return false;
  const mots = sienne.split(' ').filter((m) => m.length > 3);
  return nom === sienne || (mots.length > 0 && mots.every((m) => nom.includes(m)));
}

/** Pure : le bien tel que la carte le montre. */
export function bienVu(b) {
  const annonce = b.origine === 'equimmox';
  return {
    id: b.id,
    genre: annonce ? 'annonce' : 'fiche',
    titre: [b.adresse?.rue, b.ville].filter(Boolean).join(', ') || b.ville || 'Adresse inconnue',
    transaction: b.transaction || 'vente',
    prix: b.prix || null,
    loyer: b.loyer_annuel || null,
    surface: b.surface_m2 || null,
    rendement: b.rendement_annonce || null,
    activite: b.locataire_activite || b.exploitation || null,
    le: String(b.publiee_le || b.recu_le || b.created_date || '').slice(0, 10) || null,
    retiree: !!b.retiree_le,
    lien: annonce && /^https:\/\//.test(b.equimmox_url || '') ? b.equimmox_url : null,
  };
}

// En ligne d'abord, puis les plus récents.
const ordre = (x, y) => Number(x.retiree) - Number(y.retiree) || String(y.le || '').localeCompare(String(x.le || ''));

/**
 * Pure : les biens de chaque personne de la carte, et ceux de l'agence qui ne sont à personne de la liste.
 * `contacts` : `[{ id, nom, email, email_deduit, telephone, standard }]`, tels que l'écran les a.
 * @returns {{ par_contact: Record<string, object[]>, agence: object[] }}
 */
export function biensDesCollaborateurs(agence, contacts = [], biens = []) {
  const standard = normTel(agence?.telephone);
  const personnes = (contacts || []).filter((c) => c && !c.standard).map((c) => ({
    id: String(c.id),
    nom: c.nom,
    mails: new Set([c.email, c.email_deduit].map((e) => normEmail(e || '')).filter(Boolean)),
    // Le standard n'est à personne : un bien au numéro de l'agence n'est pas celui de qui décroche.
    tel: normTel(c.telephone) && normTel(c.telephone) !== standard ? normTel(c.telephone) : null,
  }));
  const par = Object.fromEntries(personnes.map((p) => [p.id, []]));
  const reste = [];
  for (const b of biens || []) {
    if (!b || b.supprime_le) continue;
    const mail = normEmail(b.agent_email || b.agent?.email || '');
    const tel = normTel(b.agent?.telephone);
    const deLAgence = bienDeLAgence(b, agence);
    const qui = personnes.find((p) => (mail && p.mails.has(mail)) || (tel && p.tel === tel) || (deLAgence && memeNom(p.nom, b.agent?.nom)));
    if (qui) par[qui.id].push(bienVu(b));
    else if (deLAgence) reste.push(bienVu(b));
  }
  for (const k of Object.keys(par)) par[k] = par[k].sort(ordre).slice(0, MAX_PAR_PERSONNE);
  return { par_contact: par, agence: reste.sort(ordre).slice(0, MAX_PAR_PERSONNE) };
}

/** Les biens des collaborateurs d'une agence de la prospection, lus dans la Mémoire. */
export function biensDeLAgenceProspect(agenceId, contacts = []) {
  const a = Records.get('AgenceProspect', agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  return { ok: true, ...biensDesCollaborateurs(a, contacts, Records.list('BienMemoire')) };
}
