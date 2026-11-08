// La Mémoire dans Twenty CRM (30 oct. 2026, Jules : « ça va aussi mettre dans Twenty l'adresse du bien avec l'agent
// lié, le loyer, le prix »). Chaque bien de la Mémoire devient une « Propriété » au statut Mémoire, reliée à son
// « Agent immobilier » (retrouvé ou créé par son adresse mail) ; les chiffres d'un agent se posent sur sa fiche.
// Le schéma (statut, relation, champs) est posé par scripts/crm/memoire-twenty.mjs.
//
// Twenty seulement en CRM=twenty ou CRM=double ; en CRM=monday on passe et on le dit. Rejouer ne crée rien deux
// fois : la propriété garde son id Twenty, l'agent se retrouve par mail.

import { Records } from '../db.js';
import { TWENTY } from './drapeaux.js';
import { ENTITE } from './memoire.js';
import { normaliserAdresse } from '../haka/doublons.js';

const PROPRIETES = 'proprietesListe';
const AGENTS = 'agentImmobilierListe';

async function pret() {
  const T = await import('../twenty.js');
  const { crmTwenty, crmDouble } = await import('../monday.js');
  if (!(crmTwenty() || crmDouble())) return { ok: false, raison: 'CRM=monday : Twenty sauté' };
  if (!T.twentyConfigure()) return { ok: false, raison: 'Twenty non configuré' };
  return { ok: true, T };
}

const nomDe = (b) => [b.ville, b.adresse?.rue].filter(Boolean).join(' - ') || b.cle_adresse || 'Bien';
const adresseTwenty = (a) => ({ addressStreet1: a?.rue || '', addressCity: a?.ville || '', addressPostcode: a?.code_postal || '', addressCountry: 'France' });

/** L'agent dans Twenty : retrouvé par mail, sinon créé avec ce que la fiche dit. Rend son id, ou null. */
export async function agentTwenty(agent, T) {
  const email = String(agent?.email || '').trim().toLowerCase();
  if (!email) return null;
  const existant = await T.trouver(AGENTS, { 'eMail.primaryEmail': email });
  if (existant?.id) return existant.id;
  const { versTwenty } = await import('../crm/monday-sur-twenty.js');
  const cree = await T.creer(AGENTS, {
    name: agent.nom || email,
    eMail: versTwenty('EMAILS', email),
    ...(agent.telephone ? { telephone: versTwenty('PHONES', agent.telephone) } : {}),
    ...(agent.agence ? { entreprise: agent.agence } : {}),
  });
  if (cree?.id) await versMonday('agentImmobilier', cree);
  return cree?.id || null;
}

// En CRM=double, ce que la Mémoire crée dans Twenty naît aussi dans Monday (5 nov. 2026, Jules : « Monday et Twenty,
// tout mis ensemble »). Un agent, et un bien en dossier ; un bien au statut Mémoire reste dans Twenty seul (donnée de
// marché, hors pipeline, sans statut dans Monday).
async function versMonday(singulier, fiche, champs = []) {
  const M = await import('../monday.js');
  if (!M.crmDouble() || !fiche?.id) return;
  const S = await import('../crm/synchro.js');
  const o = S.objetSchema(singulier);
  if (o) M.enFileCrm(`Mémoire → Monday (${singulier})`, () => S.ficheVersMonday(o, fiche.mondayId ? 'updated' : 'created', fiche, champs));
}

/** Pose ou met à jour un bien de la Mémoire dans « Propriétés ». */
export async function pousserBienMemoire(bien) {
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const { T } = p;
  const agentId = await agentTwenty(bien.agent, T);
  const valeurs = {
    name: nomDe(bien),
    adresse: adresseTwenty(bien.adresse),
    statut: bien.statut === 'dossier' ? undefined : 'MEMOIRE',
    loyer: bien.loyer_annuel ?? null,
    prix: bien.prix ?? null,
    m: bien.surface_m2 ?? null,
    activiteLocataire: [bien.locataire_nom, bien.locataire_activite].filter(Boolean).join(' · ') || null,
    agentImmobilier: bien.agent?.nom || bien.agent?.agence || bien.agent_email || null,
    ...(agentId ? { agentId } : {}),
    date: bien.recu_le ? String(bien.recu_le).slice(0, 10) : null,
    notes: [bien.bail_type ? `Bail ${bien.bail_type}` : null, bien.bail_echeance ? `échéance ${bien.bail_echeance}` : null, bien.type_actif, bien.compte ? `reçu sur ${bien.compte}` : null].filter(Boolean).join(' · ') || null,
  };
  for (const k of Object.keys(valeurs)) if (valeurs[k] === undefined) delete valeurs[k];
  const r = await T.poser(PROPRIETES, { id: bien.twenty_id || null, valeurs });
  if (valeurs.statut !== 'MEMOIRE') await versMonday('proprietes', await T.lire(PROPRIETES, r.id).catch(() => null), Object.keys(valeurs));
  Records.update(ENTITE, bien.id, { twenty_id: r.id, twenty_le: new Date().toISOString(), twenty_agent_id: agentId });
  return { id: r.id, cree: !!r.cree, agent_id: agentId };
}

/** Les chiffres d'un agent (server/memoire/agents.js) sur sa fiche Twenty. */
export async function pousserChiffresAgent(email, chiffres) {
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const { T } = p;
  const a = await T.trouver(AGENTS, { 'eMail.primaryEmail': String(email || '').toLowerCase() });
  if (!a?.id) return { ignore: true, raison: 'agent absent de Twenty' };
  const f = (x) => (x?.min != null ? `${Math.round(x.min).toLocaleString('fr-FR')} · ${Math.round(x.mediane).toLocaleString('fr-FR')} · ${Math.round(x.max).toLocaleString('fr-FR')}` : null);
  await T.modifier(AGENTS, a.id, {
    fichesRecues: chiffres.nb_fiches,
    villesFiches: (chiffres.villes || []).join(', ') || null,
    loyersFiches: f(chiffres.loyers),
    prixFiches: f(chiffres.prix),
    dernierEnvoi: chiffres.dernier_envoi ? String(chiffres.dernier_envoi).slice(0, 10) : null,
    tauxRetenu: chiffres.taux_retenu == null ? null : Math.round(chiffres.taux_retenu * 100),
  });
  return { id: a.id };
}

// « Propriétés Klocka » (8 nov. 2026, Jules : « toutes les fiches qu'on a reçues, avec les 4 personnes, l'adresse ou la
// ville, le loyer, le prix ; remplir au maximum ») : chaque bien de la Mémoire y a sa ligne, dans le groupe « Mémoire »
// (posé par scripts/crm/memoire-klocka-twenty.mjs). Un bien déjà dans ce tableau, à la même adresse, ne crée pas de
// ligne : ses cases vides se remplissent, rien de ce qui est écrit n'est remplacé.
const KLOCKA = 'proprietesKlockaListe';
export const PERSONNES_MEMOIRE = 'JulesB, Nora LORINQUER, Coralie GUILLAUD, Maxime Pama';
const ESSAIS_KLOCKA = 3;

/** Pure : la clé d'une adresse (numéro, voie, ville) ; null sans voie ou sans ville. */
export function cleLieu(adresse) {
  const n = normaliserAdresse(adresse);
  return n.voie && n.ville ? `${n.numero}|${n.voie}|${n.ville}` : null;
}

/** Pure : la clé d'une ligne de Propriétés Klocka (la rue y est parfois l'adresse entière, « 23 Rue X, Orsay, France »). */
export const cleLigneKlocka = (l) => cleLieu({ rue: String(l?.adresse?.addressStreet1 || '').split(',')[0], ville: l?.adresse?.addressCity });

/** Pure : la ligne de Propriétés Klocka d'un bien de la Mémoire, sans les cases dont on ne sait rien. */
export function valeursKlocka(bien) {
  const a = { ...(bien.adresse || {}), ville: bien.adresse?.ville || bien.ville || null, code_postal: bien.adresse?.code_postal || bien.code_postal || null };
  const agent = bien.agent || {};
  const v = {
    name: nomDe({ ...bien, ville: a.ville }) === 'Bien' ? String(bien.objet_mail || bien.fiche?.nom || 'Bien').slice(0, 120) : nomDe({ ...bien, ville: a.ville }),
    groupe: 'MEMOIRE',
    personnes: PERSONNES_MEMOIRE,
    ...(a.rue || a.ville ? { adresse: adresseTwenty(a) } : {}),
    date: bien.recu_le ? String(bien.recu_le).slice(0, 10) : null,
    loyer: bien.loyer_annuel ?? null,
    prix: bien.prix ?? null,
    m: bien.surface_m2 ?? null,
    activiteLocataire: [bien.locataire_nom, bien.locataire_activite].filter(Boolean).join(' · ') || null,
    agentImmobilier: agent.nom || agent.agence || bien.agent_email || null,
    ...(bien.drive_url ? { drive: { primaryLinkUrl: bien.drive_url, primaryLinkLabel: '', secondaryLinks: [] } } : {}),
    notes: [
      bien.type_actif,
      bien.rendement_annonce ? `Rendement annoncé ${bien.rendement_annonce} %` : null,
      bien.bail_type ? `Bail ${bien.bail_type}` : null,
      bien.bail_echeance ? `échéance ${bien.bail_echeance}` : null,
      [agent.nom, agent.agence, agent.telephone, agent.email].filter(Boolean).join(', ') || null,
      bien.origine === 'drive' ? 'trouvé dans le Drive Klocka' : bien.compte ? `reçu sur ${bien.compte}` : null,
    ].filter(Boolean).join(' · ') || null,
  };
  for (const k of Object.keys(v)) if (v[k] == null) delete v[k];
  return v;
}

const caseVide = (x) => x == null || x === '' || (typeof x === 'object' && !Object.values(x).some((y) => y != null && y !== '' && !(Array.isArray(y) && !y.length)));

/** Pure : ce qui peut s'écrire sur une ligne qui existe déjà : seulement ses cases vides, jamais son groupe ni son nom. */
export function seulementVides(valeurs, ligne) {
  return Object.fromEntries(Object.entries(valeurs).filter(([k]) => k !== 'groupe' && k !== 'name').filter(([k]) => caseVide(ligne?.[k])));
}

/** Pose les biens de la Mémoire dans Propriétés Klocka, par paquets ; `restants` dit ce qu'il reste à poser. */
export async function synchroniserKlocka({ max = 50 } = {}) {
  if (!TWENTY) return { ignore: true, raison: 'MEMOIRE_TWENTY éteint' };
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const { T } = p;
  const aPoser = () => Records.list(ENTITE).filter((b) => (b.twenty_klocka_essais || 0) < ESSAIS_KLOCKA && (!b.twenty_klocka_le || String(b.maj_le || '') > String(b.twenty_klocka_le)));
  const lot = aPoser().slice(0, max);
  if (!lot.length) return { poses: 0, restants: 0 };
  const lignes = new Map();
  for (const l of await T.lister(KLOCKA)) { const c = cleLigneKlocka(l); if (c && !lignes.has(c)) lignes.set(c, l); }
  const { apresEcriture } = await import('../crm/membres.js');
  let poses = 0;
  for (const b of lot) {
    try {
      const valeurs = valeursKlocka(b);
      const cle = cleLieu({ ...(b.adresse || {}), ville: b.adresse?.ville || b.ville });
      const meme = (cle && lignes.get(cle)) || null;
      const id = b.twenty_klocka_id || meme?.id || null;
      const aEcrire = id ? (b.twenty_klocka_id ? valeurs : seulementVides(valeurs, meme)) : valeurs;
      let idPose = id;
      if (!id) idPose = (await T.creer(KLOCKA, aEcrire)).id;
      else if (Object.keys(aEcrire).length) await T.modifier(KLOCKA, id, aEcrire);
      if ('personnes' in aEcrire) await apresEcriture('proprietesKlocka', idPose, { personnes: aEcrire.personnes }).catch(() => {});
      if (cle && !meme) lignes.set(cle, { id: idPose, ...aEcrire });
      Records.update(ENTITE, b.id, { twenty_klocka_id: idPose, twenty_klocka_le: new Date().toISOString(), twenty_klocka_essais: 0 });
      poses += 1;
    } catch (e) {
      Records.update(ENTITE, b.id, { twenty_klocka_essais: (b.twenty_klocka_essais || 0) + 1 });
      console.warn(`[mémoire] Propriétés Klocka ${b.id} :`, e?.message || e);
    }
  }
  return { poses, restants: aPoser().length };
}

/**
 * Les biens pas encore dans Twenty (ou modifiés depuis), par paquets ; puis les chiffres des agents touchés.
 * Appelé par le tour du lecteur de nuit ; éteint sans MEMOIRE_TWENTY.
 */
export async function synchroniser({ max = 50 } = {}) {
  if (!TWENTY) return { ignore: true, raison: 'MEMOIRE_TWENTY éteint' };
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const aFaire = Records.list(ENTITE).filter((b) => !b.twenty_le || String(b.maj_le || '') > String(b.twenty_le)).slice(0, max);
  let poses = 0;
  const agents = new Set();
  for (const b of aFaire) {
    try {
      await pousserBienMemoire(b);
      poses += 1;
      if (b.agent_email) agents.add(b.agent_email);
    } catch (e) { console.warn(`[mémoire] Twenty ${b.id} :`, e?.message || e); }
  }
  let chiffres = 0;
  if (agents.size) {
    const { chiffresAgent } = await import('./agents.js');
    const tous = Records.list(ENTITE);
    for (const email of agents) {
      try { await pousserChiffresAgent(email, chiffresAgent(tous.filter((b) => b.agent_email === email))); chiffres += 1; } catch (e) { console.warn(`[mémoire] chiffres ${email} :`, e?.message || e); }
    }
  }
  return { poses, chiffres, restants: Math.max(0, Records.list(ENTITE).filter((b) => !b.twenty_le).length) };
}
