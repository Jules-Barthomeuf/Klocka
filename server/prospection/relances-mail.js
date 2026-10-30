// Les relances par mail (10 oct. 2026) : pour chaque relance due dont l'agent
// a une adresse, l'IA prépare le mail ; l'analyste le relit et le valide. Une
// fois validé, c'est une relance comme une autre, au même titre qu'un appel :
//   - le mail part de sa boîte, avec sa signature ;
//   - un contact « Relance par mail » est noté (il compte dans le Suivi et
//     dans les agents contactés à 30 jours) ;
//   - la prochaine relance passe un mois plus tard, sur la fiche et dans
//     Monday (Dernier contact, Date de relance, Remarque) ;
//   - l'agent prévenu de son bien jugé, et la ligne libérée, comme après un appel.
// Rien ne part sans un clic ; la préparation se lance d'un bouton.

import { Records } from '../db.js';
import * as R from './regles.js';
import { MOTIFS, biensAJuger, biensDesAgents, phraseDe, relances, apresAppel } from './relances.js';
import { prenomDeLAgent, modifierMail, ecarterMail, envoyerMails } from './mails.js';

const MAIL = 'ProspectionMail';
const APPEL = 'AppelAgent';
const AGENCE = 'AgenceProspect';
export const SOUS_GENRE = 'relance_mail';
const LOT = 20;

/** Pure : un mois plus tard, le même jour (le dernier du mois s'il n'existe pas), jamais un week-end. */
export function unMoisPlusTard(jour) {
  const [a, m, j] = String(jour).split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(a, m, Math.min(j, dernier), 12));
  const js = d.getUTCDay();
  if (js === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (js === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** L'adresse d'un agent : sa fiche, sinon l'agence, sinon un contact de l'agence qui porte son nom. */
function adresseDe(fiche, agence) {
  return R.normEmail((fiche?.emails || [])[0] || agence?.email || (agence?.agents || []).find((x) => x.email && (!fiche?.nom || R.norm(x.nom || '') === R.norm(fiche.nom)))?.email || null) || null;
}

/** Les mails de relance préparés, qui attendent un clic. */
export const relancesMailAValider = () => Records.list(MAIL)
  .filter((m) => !m.essai && m.etat === 'pret' && m.sous_genre === SOUS_GENRE)
  .sort((x, y) => String(x.ligne_le || '').localeCompare(String(y.ligne_le || '')) || String(x.cree_le).localeCompare(String(y.cree_le)))
  .map((m) => ({ id: m.id, agent_id: m.agent_id, agence_id: m.agence_id || null, nom: m.nom, agence: m.agence, ville: m.ville || null, a: m.a, objet: m.objet, corps: m.corps, motif: m.motif || null, ligne_le: m.ligne_le || null, cree_le: m.cree_le }));

/**
 * Les relances dues qu'on peut faire par mail, pas encore préparées : celles
 * d'un agent du carnet avec une adresse, sans mail déjà en attente pour lui.
 */
export async function candidats({ maintenantD = new Date() } = {}) {
  const r = await relances({ maintenantD });
  const enAttente = new Set(Records.list(MAIL).filter((m) => m.etat === 'pret' && m.agent_id).map((m) => m.agent_id));
  const faits = new Set(Records.list(MAIL).filter((m) => m.sous_genre === SOUS_GENRE && m.cle).map((m) => m.cle));
  const out = [];
  let sansAdresse = 0;
  for (const l of r.lignes) {
    const fiche = l.agent_id ? Records.get('AgentImmo', l.agent_id) : null;
    const agence = l.agence_id ? Records.get(AGENCE, l.agence_id) : null;
    const a = fiche ? adresseDe(fiche, agence) : null;
    if (!fiche || !a) { sansAdresse += 1; continue; }
    const cle = `${SOUS_GENRE}:${fiche.id}:${l.le || r.jour}`;
    if (faits.has(cle) || enAttente.has(fiche.id)) continue;
    out.push({ cle, ligne: l, fiche, agence, a });
  }
  return { jour: r.jour, candidats: out, sans_adresse: sansAdresse };
}

const CONSIGNE = `Tu rédiges des mails de relance pour Klocka, qui achète des murs commerciaux loués (un local loué à un commerce) et travaille avec des agents immobiliers partenaires. L'analyste de Klocka les relira et les enverra de sa boîte.

Pour chaque agent, un mail court, selon le motif de la relance :
- Point mensuel : prendre des nouvelles et demander s'il a de nouveaux murs commerciaux loués à proposer (ou, si une recherche client est donnée, s'il a ce qui correspond).
- Fiche non reçue : lui rappeler gentiment la fiche commerciale du bien dont vous avez parlé (adresse, prix, loyer, bail).
- Bien retenu : lui annoncer que son bien est retenu, et que la suite, ce sont les documents (bail, quittances, diagnostics, taxe foncière).
- Bien refusé : lui dire que son bien n'est pas retenu, avec la raison si elle est donnée, sans détour, et garder le lien pour les suivants.
- Engagement : revenir vers lui sur ce qui avait été convenu (dit dans le contexte).
- Retenter : l'équipe a essayé de le joindre plusieurs fois ; proposer un court échange, ou qu'il réponde par mail.

Règles :
- Vouvoiement. Trois à cinq phrases, concrètes, chaleureuses sans emphase. Pas de tiret cadratin, pas d'emoji, pas de jargon.
- Commence par « Bonjour Prénom, » (ou « Bonjour, » sans prénom) et termine exactement par « Bien cordialement, » : la signature s'ajoute à l'envoi.
- N'invente aucun fait, aucun chiffre, aucun bien : seulement ce que donne le contexte. Ne cite jamais un autre agent.
- Objet court et précis, avec une majuscule au début seulement.
- Jamais les mots de l'équipe : pas de « point mensuel », « relance », « retenter », « motif ». On écrit à un partenaire, pas un compte rendu.
- Le corps en trois parties séparées par une ligne vide : la salutation, le texte, « Bien cordialement, ».

Réponds UNIQUEMENT par un objet JSON : { "mails": [ { "cle": "…", "objet": "…", "corps": "…" } ] }, une entrée par agent, la même clé.`;

/** Pure : la mise en forme d'un mail rédigé : salutation, texte, formule de politesse, séparés d'une ligne vide. */
export function mettreEnForme(corps) {
  let t = String(corps || '').replace(/\r/g, '').replace(/\n*\{signature\}\s*$/, '').trim();
  t = t.replace(/^(Bonjour[^\n,]*,)\s*\n(?!\n)/, '$1\n\n');
  t = t.replace(/\n?\s*(Bien cordialement,)\s*$/, '\n\n$1');
  return t.replace(/\n{3,}/g, '\n\n');
}

/** Pure : l'objet, une majuscule au début. */
const objetPropre = (o) => { const t = String(o || '').trim().slice(0, 160); return t ? t[0].toUpperCase() + t.slice(1) : t; };

/** Le contexte d'un agent pour le modèle : qui, le motif, la phrase de relance, les derniers échanges. */
function contexteDe(c, biens, jour, appelsDe) {
  const { ligne, fiche } = c;
  const aJuger = biensAJuger(biens.get(fiche.id) || [], jour);
  const bien = aJuger[0] || (biens.get(fiche.id) || [])[0] || null;
  const derniers = (appelsDe.get(fiche.id) || []).slice(-3).map((x) => `${String(x.le).slice(0, 10)} · ${R.ISSUES[x.issue] || x.issue}${x.resume ? ` : ${String(x.resume).slice(0, 200)}` : ''}`);
  return {
    cle: c.cle,
    prenom: prenomDeLAgent(fiche.nom) || null,
    agence: ligne.agence || fiche.agence || null,
    ville: ligne.ville || fiche.ville || null,
    motif: MOTIFS[ligne.motif?.cle] || ligne.motif?.libelle || 'Point mensuel',
    phrase: phraseDe(ligne.motif?.cle, { bien, fiche }),
    derniers_echanges: derniers,
  };
}

/**
 * Prépare les mails des relances dues, par lots de vingt, un appel au modèle
 * par lot (mesuré dans Coûts IA). `rediger` remplace le modèle dans les tests.
 */
export async function preparerRelancesMail({ user = null, maintenantD = new Date(), rediger = null } = {}) {
  const { jour, candidats: liste, sans_adresse } = await candidats({ maintenantD });
  if (!liste.length) return { ok: true, prepares: 0, sans_adresse };
  const biens = await biensDesAgents();
  const appelsDe = new Map();
  for (const x of Records.list(APPEL).filter((y) => y.etat === 'valide' && !y.essai).sort((p, q) => String(p.le).localeCompare(String(q.le)))) {
    if (!appelsDe.has(x.agent_id)) appelsDe.set(x.agent_id, []);
    appelsDe.get(x.agent_id).push(x);
  }
  let prepares = 0;
  for (let i = 0; i < liste.length; i += LOT) {
    const lot = liste.slice(i, i + LOT);
    const contextes = lot.map((c) => contexteDe(c, biens, jour, appelsDe));
    let rendu;
    if (rediger) rendu = await rediger(contextes);
    else {
      const { invokeLLM } = await import('../llm.js');
      const { mesurer } = await import('../llm-couts.js');
      rendu = (await mesurer({ operation: 'relances par mail', par: user?.email || null }, () => invokeLLM({
        prompt: `${CONSIGNE}\n\nLes agents (JSON) :\n${JSON.stringify(contextes)}`,
        response_json_schema: { type: 'object', properties: { mails: { type: 'array', items: { type: 'object', properties: { cle: { type: 'string' }, objet: { type: 'string' }, corps: { type: 'string' } }, required: ['cle', 'objet', 'corps'] } } }, required: ['mails'] },
        effort: 'low',
      }))).resultat;
    }
    const parCle = new Map((rendu?.mails || []).filter((m) => m?.cle && m.objet && m.corps).map((m) => [m.cle, m]));
    for (const c of lot) {
      const m = parCle.get(c.cle);
      if (!m) continue;
      Records.create(MAIL, {
        etat: 'pret', cree_le: new Date().toISOString(), genre: 'relance', sous_genre: SOUS_GENRE, cle: c.cle, signature_auto: true,
        agent_id: c.fiche.id, agence_id: c.agence?.id || null, nom: c.fiche.nom, agence: c.ligne.agence || c.fiche.agence || null, ville: c.ligne.ville || null,
        a: c.a, objet: objetPropre(m.objet), corps: mettreEnForme(m.corps).slice(0, 4000),
        motif: c.ligne.motif?.libelle || null, ligne_le: c.ligne.le || jour, prepare_par: user?.email || null,
      });
      prepares += 1;
    }
  }
  return { ok: true, prepares, sans_adresse };
}

/**
 * Valider un mail de relance : il part, puis la relance se note comme après
 * un appel (contact, fiche, Monday, prévenus, ligne libérée). Un mail qui ne
 * part pas ne compte pas comme une relance.
 */
export async function validerRelanceMail(id, { objet = null, corps = null, a = null } = {}, user, { maintenantD = new Date() } = {}) {
  const m = Records.get(MAIL, id);
  if (!m || m.sous_genre !== SOUS_GENRE || m.etat !== 'pret') return { ok: false, error: 'Mail introuvable ou déjà parti.' };
  if (objet != null || corps != null || a != null) {
    const r = modifierMail(id, { objet: objet ?? m.objet, corps: corps ?? m.corps, a: a ?? m.a });
    if (!r.ok) return r;
  }
  const envoi = await envoyerMails([id], user);
  const x = envoi.resultats?.[0];
  if (!x?.ok) return { ok: false, error: x?.error || "Le mail n'est pas parti : rien n'est noté." };
  const mail = Records.get(MAIL, id);
  const moi = String(user?.email || '').toLowerCase();
  const jour = R.jourDe(maintenantD);
  const prochaine = unMoisPlusTard(jour);
  const { majAgent, agentDe } = await import('./carnet.js');
  const appel = Records.create(APPEL, {
    agent_id: m.agent_id, agence_id: m.agence_id || null, par: moi, le: maintenantD.toISOString(), valide_le: maintenantD.toISOString(),
    etat: 'valide', issue: 'relance_mail', canal: 'mail', source: 'relances_mail', mail_id: id, numero: null,
    resume: `Relance par mail : ${mail.objet}`, motif: m.motif || null,
  });
  majAgent(m.agent_id, { prochaine: { quoi: 'point du mois', le: prochaine }, dernier_contact_le: maintenantD.toISOString(), dernier_mail_le: maintenantD.toISOString() });
  const fiche = agentDe(m.agent_id);
  const agence = m.agence_id ? Records.get(AGENCE, m.agence_id) : null;
  // Monday, comme après un appel abouti : la ligne de l'agent retrouvée ou créée, relue.
  let monday = null;
  try {
    const MA = await import('./mode-appel.js');
    const ag = agence || { id: null, nom: m.agence || fiche?.agence || null, liste_id: null, telephone: (fiche?.telephones || [])[0] || null };
    const d = MA.donneesMonday({ appel: { ...appel, compris: {} }, agence: ag, fiche, issue: 'relance_mail', user, relance: prochaine, email: m.a, diffusion: null });
    monday = (await MA.ecrireMonday({ appel_id: appel.id, cible: MA.cibleMonday(d, ag, fiche), donnees: d })).monday;
  } catch (e) { monday = { etat: 'attente', texte: 'Twenty CRM en attente', erreur: String(e?.message || e).slice(0, 200) }; }
  const recu = { mail: { etat: 'ok', texte: `Mail envoyé à ${m.a}${x.simule ? ' (simulé)' : ''}` }, monday, relance: { etat: 'ok', texte: `Prochaine relance le ${R.dateCourte(prochaine)}` }, le: maintenantD.toISOString() };
  Records.update(APPEL, appel.id, { recu });
  await apresAppel({ agent_id: m.agent_id, agence_id: m.agence_id || null, issue: 'relance_mail', user, maintenantD });
  return { ok: true, id, relance_le: prochaine, recu };
}

/** Valider plusieurs mails d'un coup : chacun part et se note, l'un après l'autre. */
export async function validerTout(ids, user, opts = {}) {
  const resultats = [];
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 100)) resultats.push(await validerRelanceMail(id, {}, user, opts));
  return { ok: true, valides: resultats.filter((r) => r.ok).length, rates: resultats.filter((r) => !r.ok).map((r) => r.error), resultats };
}

/** Écarter un mail préparé : la relance reste due, à faire autrement. */
export function ignorerRelanceMail(id, user) {
  const m = Records.get(MAIL, id);
  if (!m || m.sous_genre !== SOUS_GENRE || m.etat !== 'pret') return { ok: false, error: 'Mail introuvable ou déjà parti.' };
  return ecarterMail(id, user?.email || null);
}
