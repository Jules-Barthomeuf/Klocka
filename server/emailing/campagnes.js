// Les campagnes : un envoi ponctuel (newsletter, annonce, invitation à un
// webinaire) à une audience de listes, de segments et de tags.
//
// Brouillon → Programmée (maintenant ou à une date, heure de Paris) → En
// cours → Envoyée. Le tour de la file (toutes les minutes, sur Render)
// prépare d'abord un EmailingEnvoi « en_attente » par contact éligible, sous
// sa clé unique, puis les envoie par lots de 100 (API batch de Resend). Une
// limite de débit ou une panne : le lot attend le tour suivant. Un contact
// désinscrit entre-temps est sauté. Un email déjà parti ne repart jamais.
//
// Hors Render, le garde-fou : les trois premiers emails d'une campagne vont à
// l'adresse de test (ou à son auteur), les autres sont seulement notés.

import { Records } from '../db.js';
import { rendreEmail, remplir, variablesDeLEmail } from '../../src/lib/email-design.js';
import { E, audience, envoyable, cleEnvoi } from './schema.js';
import { envoyerLot, envoyerResend, resendConfigure, TAILLE_LOT } from './resend.js';
import { envoiReel, expedier, adresseDeTest } from './envoi.js';
import { compterAudience } from './contacts.js';
import { designNewsletter } from './modeles.js';
import { lienSimulateur } from './newsletters.js';

const maintenant = () => new Date().toISOString();
const base = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001').replace(/\/$/, '');
const logo = () => `${base()}/icones/icone-192.png`;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const LOTS_PAR_TOUR = 20;
const REDIRECTION_LOCALE = 3;
const ENVOYE = new Set(['envoye', 'redirige', 'simule']);
const MODIFIABLE = new Set(['brouillon', 'programmee']);

const audienceDe = (c) => ({ listes: c.audience?.listes || [], segments: c.audience?.segments || [], tags: c.audience?.tags || [] });
export const lienDesinscription = (contact, source) => `${base()}/api/emailing/desinscription/${contact.jeton}${source ? `?s=${encodeURIComponent(source)}` : ''}`;
export const varsDuContact = (c) => ({ prenom: c.prenom || '', nom: c.nom || '', entreprise: c.entreprise || '', ville: c.ville || '', email: c.email, ...(c.champs || {}) });
// La source d'un envoi : la newsletter pour un mail de newsletter, sinon la campagne.
const sourceDe = (c) => (c.origine?.newsletter_id ? `newsletter:${c.origine.newsletter_id}:${c.origine.mail_id}` : `campagne:${c.id}`);
// Un mail de newsletter ne va pas à qui a pris un call (9 oct. 2026).
const servi = (c, contact) => !(c.origine?.newsletter_id && contact?.call_pris_le);

function resume(c) {
  const envois = Records.list(E.ENVOI).filter((e) => e.campagne_id === c.id);
  const partis = envois.filter((e) => ENVOYE.has(e.statut));
  return {
    ...c,
    envoyes: partis.length,
    en_attente: envois.filter((e) => e.statut === 'en_attente').length,
    echecs: envois.filter((e) => e.statut === 'echec').length,
    ouverts: partis.filter((e) => e.ouvert_le).length,
    cliques: partis.filter((e) => e.clique_le).length,
    desinscrits: Records.list(E.CONTACT).filter((x) => x.desinscription_source === `campagne:${c.id}`).length,
    eligibles: MODIFIABLE.has(c.statut) ? compterAudience(audienceDe(c)).eligibles : null,
  };
}

export const campagnes = () => Records.list(E.CAMPAGNE).filter((c) => !c.origine).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le))).map(resume);
export const campagne = (id) => { const c = Records.get(E.CAMPAGNE, id); return c ? resume(c) : null; };

export function creerCampagne({ nom = '', design = null, objet = '', apercu = '' } = {}, user = null) {
  return Records.create(E.CAMPAGNE, {
    nom: String(nom).trim() || 'Nouvelle campagne', statut: 'brouillon',
    audience: { listes: [], segments: [], tags: [] },
    objet, apercu, expediteur_nom: 'L\'équipe Klocka', repondre_a: user?.email || null,
    design: design || designNewsletter(), cree_par: user?.email || null, cree_le: maintenant(),
  });
}

export function modifierCampagne(id, patch) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c) return { ok: false, error: 'Campagne introuvable.' };
  if (!MODIFIABLE.has(c.statut)) return { ok: false, error: 'Une campagne partie ne se modifie plus : dupliquez-la.' };
  const champs = {};
  if (patch.nom != null) champs.nom = String(patch.nom).trim().slice(0, 120) || c.nom;
  if (patch.objet != null) champs.objet = String(patch.objet).slice(0, 200);
  if (patch.apercu != null) champs.apercu = String(patch.apercu).slice(0, 200);
  if (patch.expediteur_nom != null) champs.expediteur_nom = String(patch.expediteur_nom).trim().slice(0, 80) || 'L\'équipe Klocka';
  if (patch.repondre_a !== undefined) champs.repondre_a = String(patch.repondre_a || '').trim().toLowerCase() || null;
  if (patch.audience) champs.audience = { listes: (patch.audience.listes || []).slice(0, 50), segments: (patch.audience.segments || []).slice(0, 50), tags: (patch.audience.tags || []).slice(0, 50) };
  if (patch.design?.blocs) champs.design = { theme: patch.design.theme || 'clair', logo: patch.design.logo !== false, blocs: patch.design.blocs.slice(0, 60) };
  // Un contenu modifié après le test : le test n'en dit plus rien.
  if (champs.design || champs.objet != null) champs.test_envoye_le = null;
  return { ok: true, campagne: Records.update(E.CAMPAGNE, id, champs) };
}

export function dupliquer(id, user) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c) return { ok: false, error: 'Campagne introuvable.' };
  const copie = Records.create(E.CAMPAGNE, {
    nom: `${c.nom} (copie)`, statut: 'brouillon', audience: c.audience, objet: c.objet, apercu: c.apercu,
    expediteur_nom: c.expediteur_nom, repondre_a: c.repondre_a, design: c.design, cree_par: user?.email || null, cree_le: maintenant(),
  });
  return { ok: true, campagne: copie };
}

export function supprimer(id) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c) return { ok: false, error: 'Campagne introuvable.' };
  if (c.statut === 'en_cours') return { ok: false, error: 'La campagne part en ce moment : attendez la fin.' };
  Records.delete(E.CAMPAGNE, id);
  return { ok: true };
}

/**
 * La checklist avant l'envoi : objet, audience, désinscription, liens des
 * boutons, variables sans repli quand des contacts n'ont pas la valeur, test.
 */
export function verification(id) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c) return null;
  const contacts = audience(audienceDe(c));
  const vars = variablesDeLEmail(c);
  const sansRepli = [...new Set(vars.filter((v) => v.repli == null).map((v) => v.cle))]
    .filter((k) => !['email', 'expediteur'].includes(k))
    .map((k) => ({ cle: k, manquants: contacts.filter((x) => !String(varsDuContact(x)[k] ?? '').trim()).length }))
    .filter((v) => v.manquants > 0);
  const boutons = (c.design?.blocs || []).filter((b) => b.type === 'bouton');
  const items = [
    { cle: 'objet', ok: !!String(c.objet || '').trim(), texte: 'L\'objet est rempli' },
    { cle: 'audience', ok: contacts.length > 0, texte: `${contacts.length} contact${contacts.length > 1 ? 's' : ''} éligible${contacts.length > 1 ? 's' : ''} (désinscrits et bounces exclus)` },
    { cle: 'desinscription', ok: true, texte: 'Le lien de désinscription est ajouté à chaque email' },
    { cle: 'liens', ok: boutons.every((b) => /^https?:\/\//.test(String(b.lien || '').replace(/\{\{.*?\}\}/g, 'x'))), texte: boutons.length ? 'Chaque bouton a un lien' : 'Aucun bouton' },
    { cle: 'variables', ok: !sansRepli.length, avertissement: true, texte: sansRepli.length ? sansRepli.map((v) => `{{${v.cle}}} sans valeur de repli : ${v.manquants} contact${v.manquants > 1 ? 's' : ''} sans valeur`).join(' ; ') : 'Chaque variable a une valeur pour tous, ou un repli' },
    { cle: 'test', ok: !!c.test_envoye_le, avertissement: true, texte: c.test_envoye_le ? 'Un test a été envoyé' : 'Aucun test envoyé depuis la dernière modification' },
  ];
  return { items, bloquant: items.some((i) => !i.ok && !i.avertissement), eligibles: contacts.length };
}

/** Le rendu de la campagne pour un contact (ou un exemple). */
export function rendrePour(c, contact) {
  const vars = { ...varsDuContact(contact), lien_simulateur: lienSimulateur(contact, sourceDe(c)), k: contact.jeton || 'exemple' };
  const { html, texte } = rendreEmail(c.design, vars, { desinscription: lienDesinscription(contact, `campagne:${c.id}`), logo: logo(), apercu: c.apercu, contact });
  return { objet: remplir(c.objet, vars).trim(), html, texte };
}

/** Un test à soi-même, rendu pour un contact de l'audience (« voir en tant que ») ou un exemple. */
export async function envoyerTest(id, a, { contactId = null, envoyer = envoyerResend } = {}) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c) return { ok: false, error: 'Campagne introuvable.' };
  const contact = (contactId && Records.get(E.CONTACT, contactId)) || audience(audienceDe(c))[0] || { email: a, prenom: 'Jules', nom: 'Exemple', jeton: 'test', tags: [], champs: {} };
  const m = rendrePour(c, contact);
  const r = await envoyer({ a, objet: `[Test] ${m.objet}`, html: m.html, texte: m.texte, repondreA: c.repondre_a || null });
  if (r.ok) Records.update(E.CAMPAGNE, id, { test_envoye_le: maintenant() });
  return r;
}

/** Envoie maintenant (quand absent) ou programme à une date (ISO). */
export function programmer(id, quand = null) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c) return { ok: false, error: 'Campagne introuvable.' };
  if (!MODIFIABLE.has(c.statut)) return { ok: false, error: 'Cette campagne est déjà partie.' };
  const v = verification(id);
  if (v.bloquant) return { ok: false, error: v.items.filter((i) => !i.ok && !i.avertissement).map((i) => i.texte).join(' ; ') };
  const date = quand ? new Date(quand) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Date invalide.' };
  Records.update(E.CAMPAGNE, id, { statut: 'programmee', programmee_le: date.toISOString(), erreur: null });
  return { ok: true, programmee_le: date.toISOString(), immediat: !quand };
}

/** Une campagne programmée revient en brouillon. */
export function annuler(id) {
  const c = Records.get(E.CAMPAGNE, id);
  if (!c || c.statut !== 'programmee') return { ok: false, error: 'Seule une campagne programmée s\'annule.' };
  Records.update(E.CAMPAGNE, id, { statut: 'brouillon', programmee_le: null });
  return { ok: true };
}

/** Prépare les envois d'une campagne dont l'heure est venue : un par contact éligible, sous sa clé. */
function preparer(c, quand) {
  const deja = new Set(Records.list(E.ENVOI).filter((e) => e.campagne_id === c.id).map((e) => e.cle_envoi));
  let n = 0;
  for (const contact of audience(audienceDe(c)).filter((x) => servi(c, x))) {
    const cle = cleEnvoi.campagne(c.id, contact.id);
    if (deja.has(cle)) continue;
    Records.create(E.ENVOI, { type: 'campagne', cle_envoi: cle, campagne_id: c.id, contact_id: contact.id, email: contact.email, statut: 'en_attente', le: quand });
    n += 1;
  }
  Records.update(E.CAMPAGNE, c.id, { statut: 'en_cours', demarree_le: quand, total: n });
  return n;
}

/**
 * Le tour de la file des campagnes : prépare celles dont l'heure est venue,
 * envoie les envois en attente par lots, clôt celles qui n'en ont plus.
 */
export async function tourCampagnes({ quand = new Date(), lot = envoyerLot, unitaire = envoyerResend } = {}) {
  if (!resendConfigure() && lot === envoyerLot) return { envoyes: 0 };
  const iso = quand.toISOString();
  for (const c of Records.list(E.CAMPAGNE).filter((x) => x.statut === 'programmee' && Date.parse(x.programmee_le) <= quand.getTime())) preparer(c, iso);
  let envoyes = 0;
  let lots = 0;
  for (const c of Records.list(E.CAMPAGNE).filter((x) => x.statut === 'en_cours')) {
    if (c.prochaine_tentative && Date.parse(c.prochaine_tentative) > quand.getTime()) continue;
    let attente = Records.list(E.ENVOI).filter((e) => e.campagne_id === c.id && e.statut === 'en_attente');
    while (attente.length && lots < LOTS_PAR_TOUR) {
      const paquet = attente.slice(0, TAILLE_LOT);
      attente = attente.slice(TAILLE_LOT);
      const prets = [];
      for (const e of paquet) {
        const contact = Records.get(E.CONTACT, e.contact_id);
        if (!envoyable(contact)) { Records.update(E.ENVOI, e.id, { statut: 'ignore', erreur: contact ? `contact ${contact.statut}` : 'contact supprimé' }); continue; }
        if (!servi(c, contact)) { Records.update(E.ENVOI, e.id, { statut: 'ignore', erreur: 'call pris' }); continue; }
        const m = rendrePour(c, contact);
        const lien = lienDesinscription(contact, `campagne:${c.id}`);
        prets.push({ e, m: {
          a: contact.email, objet: m.objet, html: m.html, texte: m.texte, repondreA: c.repondre_a || null,
          de: `${c.expediteur_nom || 'L\'équipe Klocka'} <equipe@notifications-klocka.com>`,
          entetes: { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          etiquettes: [['campagne', c.id]],
        } });
      }
      if (!prets.length) continue;
      lots += 1;
      if (!envoiReel()) {
        // Hors Render : quelques-uns chez l'adresse de test, le reste noté.
        const dejaRediriges = Records.list(E.ENVOI).filter((x) => x.campagne_id === c.id && x.statut === 'redirige').length;
        for (const [k, p] of prets.entries()) {
          if (dejaRediriges + k < REDIRECTION_LOCALE && adresseDeTest(c.cree_par)) {
            const r = await expedier({ ...p.m, idempotence: p.e.cle_envoi }, { testeur: c.cree_par, envoyer: unitaire });
            Records.update(E.ENVOI, p.e.id, { statut: r.ok ? 'redirige' : 'echec', redirige_vers: r.redirige || null, resend_id: r.id || null, objet: p.m.objet, erreur: r.ok ? null : r.error, le: iso });
          } else {
            Records.update(E.ENVOI, p.e.id, { statut: 'simule', objet: p.m.objet, le: iso });
          }
          envoyes += 1;
        }
        continue;
      }
      const r = await lot(prets.map((p) => p.m), { idempotence: `campagne:${c.id}:${prets[0].e.id}` });
      if (r.ok) {
        prets.forEach((p, k) => Records.update(E.ENVOI, p.e.id, { statut: 'envoye', resend_id: r.ids[k] || null, objet: p.m.objet, le: iso }));
        envoyes += prets.length;
      } else if (r.reessayer) {
        Records.update(E.CAMPAGNE, c.id, { prochaine_tentative: new Date(quand.getTime() + 60_000).toISOString(), erreur: r.error });
        break;
      } else {
        for (const p of prets) Records.update(E.ENVOI, p.e.id, { statut: 'echec', objet: p.m.objet, erreur: r.error, le: iso });
        if (/domain|from|api key/i.test(r.error)) { Records.update(E.CAMPAGNE, c.id, { statut: 'erreur', erreur: r.error }); break; }
      }
      await pause(150);
    }
    const reste = Records.list(E.ENVOI).some((e) => e.campagne_id === c.id && e.statut === 'en_attente');
    const apres = Records.get(E.CAMPAGNE, c.id);
    if (!reste && apres.statut === 'en_cours') Records.update(E.CAMPAGNE, c.id, { statut: 'envoyee', envoyee_le: iso, prochaine_tentative: null });
  }
  return { envoyes };
}
