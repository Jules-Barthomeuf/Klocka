// Les coordonnées d'une fiche et les collaborateurs d'une agence (28 nov. 2026, Jules : « toutes les agences et agents ont
// la même carte ; au-dessus, ses infos : son email si on l'a, son numéro de téléphone » ; « si c'est une agence, une
// partie collaborateurs, et une fiche par agent »).
//
// Chaque chose a sa fiche, de la même forme :
//   - un agent de la Prospection (agent:<id>), une ligne d'Agent immobilier ou de Clients du CRM (twenty:…) ;
//   - une ligne du tableau Agences (twenty:agence:<id>) : une agence, ou un mandataire (une personne, donc un agent) ;
//   - un collaborateur d'une agence de la liste (personne:<id de l'agence>:<son nom en clé>) : sa fiche n'existe en base
//     qu'à la première note, au premier appel ou au premier lien ; avant, elle se lit dans les collaborateurs de l'agence.
// Les coordonnées se lisent dans Klocka d'abord, puis dans la ligne de Twenty (lecture seule, 3 s au plus).

import { Records } from '../db.js';
import { numero } from '../prospection/page-donnee.js';

const AGENCE = 'AgenceProspect';

/** Pure : un nom en clé d'adresse (« Loïc Borges » → « loic-borges »). */
export const slugNom = (nom) => String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** L'agence de la liste derrière une ligne du tableau Agences (son id Twenty est gardé sur l'agence). */
export function agenceDeLaLigne(twentyId) {
  if (!twentyId) return null;
  return Records.filter(AGENCE, { twenty_agence_id: twentyId })[0] || null;
}

/** La clé de fiche d'une agence de la liste : sa ligne du tableau Agences quand elle y est posée. */
export const cleDeLAgence = (a) => (a?.twenty_agence_id ? `twenty:agence:${a.twenty_agence_id}` : null);

/** Les collaborateurs d'une agence, tels que la carte d'appel les montre (sans le standard ni les faux noms). */
function gensDe(a) {
  return import('../prospection/mode-appel.js').then(({ contactsDe }) => {
    const fiche = a.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
    return contactsDe(a, fiche, null).filter((x) => !x.standard && !/^(equipe|équipe|team|contact|accueil|agence|service)\b/i.test(String(x.nom || '').trim()));
  });
}

/** La clé de fiche d'un collaborateur : l'agent de la Prospection quand c'est lui (déjà appelé), sinon sa clé de personne. */
export function cleDuCollaborateur(a, x) {
  const fiche = a?.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
  const n = slugNom(x.nom);
  if (fiche && !fiche.essai && slugNom(fiche.nom) === n) return `agent:${fiche.id}`;
  return `personne:${a.id}:${n}`;
}

/** Pure (lit l'agence) : le nom et le poste d'un collaborateur par sa clé de nom, sans passer par la carte d'appel. */
export function personneDeLAgence(a, n) {
  const gens = [...(a?.agents || []), ...(a?.gerants || []).map((g) => ({ ...g, fonction: g.qualite })), ...(a?.apollo_equipe?.gens || []).map((g) => ({ nom: g.nom_complet || g.nom, fonction: g.poste }))];
  const x = gens.find((y) => y?.nom && slugNom(y.nom) === n);
  return x ? { nom: x.nom, fonction: x.fonction || null } : null;
}

/** Le collaborateur derrière une clé personne:<agence>:<nom>, ou null. */
export async function collaborateurDeLaCle(cle) {
  const [, agenceId, n] = String(cle || '').split(':');
  const a = agenceId ? Records.get(AGENCE, agenceId) : null;
  if (!a || !n) return null;
  const x = (await gensDe(a)).find((y) => slugNom(y.nom) === n);
  return x ? { a, x } : { a, x: null };
}

/** Pure : le premier numéro et le premier mail d'une ligne de Twenty, quels que soient les noms de ses champs. */
export function contactsTwenty(t) {
  let telephone = null, email = null, site = null;
  for (const v of Object.values(t || {})) {
    if (!v || typeof v !== 'object') continue;
    if (!telephone && v.primaryPhoneNumber) {
      const brut = `${v.primaryPhoneCallingCode && !String(v.primaryPhoneNumber).startsWith('0') ? v.primaryPhoneCallingCode : ''}${v.primaryPhoneNumber}`;
      // Un numéro français s'écrit par paires (« 02 57 70 07 77 »), les autres tels que Twenty les garde.
      telephone = numero(brut) || brut.trim();
    }
    if (!email && v.primaryEmail) email = String(v.primaryEmail).toLowerCase();
    if (!site && v.primaryLinkUrl) site = v.primaryLinkUrl;
  }
  return { telephone, email, site };
}

async function lireTwenty(objet, id) {
  if (process.env.NODE_TEST_CONTEXT) return null;
  try {
    const { lire, twentyConfigure } = await import('../twenty.js');
    if (!twentyConfigure()) return null;
    return await Promise.race([lire(objet, id), new Promise((_, non) => setTimeout(() => non(new Error('délai')), 3000))]);
  } catch { return null; }
}

const STATUTS = { EN_CONTACT: 'En contact', JAMAIS: 'Jamais contacté', MORT: 'Mort' };
const propre = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));

/**
 * Les coordonnées d'une fiche : { telephone, autres_telephones, email, site, adresse, ville, poste, statut, reseau, page,
 * agence: { nom, cle } , lien_page: { agence_id, nom } (pour coller le lien de sa page) }. Rien pour un bien.
 */
export async function coordonnees(cle, { twenty = lireTwenty } = {}) {
  const [type, ...reste] = String(cle || '').split(':');
  if (type === 'agent') {
    const g = Records.get('AgentImmo', reste.join(':'));
    if (!g) return null;
    const a = Records.list(AGENCE).find((x) => x.carnet_id === g.id) || null;
    const lu = a ? (await gensDe(a)).find((x) => slugNom(x.nom) === slugNom(g.nom)) : null;
    const tels = [...new Set([lu?.telephone, ...(g.telephones || [])].filter(Boolean))];
    return propre({
      telephone: tels[0] || null, autres_telephones: tels.slice(1, 3), email: lu?.email || (g.emails || [])[0] || null,
      ville: g.ville || null, poste: lu?.fonction || null, page: lu?.page || null,
      agence: g.agence ? { nom: g.agence, cle: a?.genre === 'mandataire' ? null : cleDeLAgence(a) } : null,
      lien_page: a ? { agence_id: a.id, nom: g.nom } : null,
    });
  }
  if (type === 'personne') {
    const r = await collaborateurDeLaCle(cle);
    if (!r?.x) return r?.a ? { agence: { nom: r.a.nom, cle: cleDeLAgence(r.a) } } : null;
    const { a, x } = r;
    return propre({
      telephone: x.telephone || null, email: x.email || null, email_deduit: x.email ? null : x.email_deduit || null,
      poste: x.fonction || null, page: x.page || null, note: x.note || null, nb_avis: x.nb_avis || null,
      ville: a.ville || null, agence: { nom: a.nom, cle: cleDeLAgence(a) }, lien_page: { agence_id: a.id, nom: x.nom },
    });
  }
  if (type === 'twenty' && reste[0] === 'agence') {
    const id = reste.slice(1).join(':');
    const t = await twenty('agences', id);
    // L'agence de la liste : par l'id de sa ligne gardé chez elle, sinon par l'id Klocka gardé sur la ligne.
    const a = agenceDeLaLigne(id) || (t?.klockaId ? Records.get(AGENCE, t.klockaId) : null);
    const tw = contactsTwenty(t);
    const mandataire = a?.genre === 'mandataire' || t?.genre === 'MANDATAIRE';
    return propre({
      telephone: a?.telephone || tw.telephone || null, email: a?.email || tw.email || null,
      site: a?.site || tw.site || null, adresse: [a?.adresse, a?.code_postal].filter(Boolean).join(' ') || t?.adresse || null,
      ville: a?.ville || null, statut: STATUTS[t?.contact] || null, reseau: a?.reseau_nom || t?.reseau || null,
      ...(mandataire && a ? { lien_page: { agence_id: a.id, nom: a.nom } } : {}),
      ...(!mandataire && a ? { page_equipe: { agence_id: a.id } } : {}),
    });
  }
  if (type === 'twenty') {
    const objet = reste[0] === 'agentImmobilier' ? 'agentImmobilierListe' : reste[0] === 'clients' ? 'clientsListe' : null;
    if (!objet) return null;
    const tw = contactsTwenty(await twenty(objet, reste.slice(1).join(':')));
    return propre(tw);
  }
  if (type === 'client') {
    const d = Records.get('DemandeClient', reste.join(':'));
    return d ? propre({ email: d.client_email || null }) : null;
  }
  return null;
}

/** Les collaborateurs d'une fiche d'agence (twenty:agence:<id>, une agence et pas un mandataire), chacun avec sa clé. */
export async function collaborateurs(cle, { twenty = lireTwenty } = {}) {
  const m = /^twenty:agence:(.+)$/.exec(String(cle || ''));
  if (!m) return null;
  let a = agenceDeLaLigne(m[1]);
  if (!a) {
    const t = await twenty('agences', m[1]);
    a = t?.klockaId ? Records.get(AGENCE, t.klockaId) : null;
    // Une agence que Klocka ne connaît pas : ses interlocuteurs de Twenty, une personne par ligne, sans fiche à ouvrir.
    if (!a) {
      if (!t || t.genre === 'MANDATAIRE') return t ? null : [];
      const { collaborateursDe } = await import('../crm/ecran.js');
      return (await collaborateursDe(t)).map((x) => propre({ cle: null, nom: x.nom, poste: x.fonction || null, telephone: x.telephone || null, email: x.email || null }));
    }
  }
  if (a.genre === 'mandataire') return null;
  return (await gensDe(a)).map((x) => propre({
    cle: cleDuCollaborateur(a, x), nom: x.nom, poste: x.fonction || null, telephone: x.telephone || null,
    email: x.email || null, photo: x.photo || null, page: x.page || null, biens: x.biens_page?.length || null,
  }));
}
