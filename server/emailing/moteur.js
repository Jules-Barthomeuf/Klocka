// Le moteur du module Emailing (8 nov. 2026, Jules). Chaque minute, sur Render : les réponses lues deviennent des faits,
// les faits font entrer et sortir les contacts, les parcours avancent, puis la file part.
//
// Le chemin d'un mail : un fait (mail_evenement) fait entrer un contact dans une automatisation (mail_parcours) ; à son
// étape « mail », le texte est rendu et mis en file (mail_file) sous une clé unique ; le garde-fou contrôle au dernier
// moment (opposition, plafond de la boîte, heures d'envoi) ; Resend ou Gmail envoie ; le retour redevient un fait.

import { Records, Meta } from '../db.js';
import { remplir } from '../../src/lib/email-design.js';
import { E } from './schema.js';
import { adresseDeTest, aParis, destinataireGarde, envoiReel, expedier, jourParis } from './envoi.js';
import { envoyerResend } from './resend.js';
import * as J from './journal.js';
import { recalculer, tourScores } from './scores.js';
import { actives, aplatir, AUTO, FENETRE_DEFAUT } from './automatisations.js';

const { maintenant } = J;
const JOUR = 86400000;
const ETAPES_PAR_TOUR = 12;

// --- Les heures d'envoi ------------------------------------------------------------------

const jourSemaine = (jour) => new Date(`${jour}T12:00:00Z`).getUTCDay();
const jourSuivant = (jour) => new Date(Date.parse(`${jour}T12:00:00Z`) + JOUR).toISOString().slice(0, 10);

/** Pure : l'instant, ou la prochaine ouverture de la fenêtre d'envoi. */
export function prochaineOuverture(instant, f = FENETRE_DEFAUT) {
  let jour = jourParis(instant);
  for (let i = 0; i < 15; i += 1) {
    if (f.jours.includes(jourSemaine(jour))) {
      const debut = aParis(jour, f.debut);
      if (instant < debut) return debut;
      if (instant < aParis(jour, f.fin)) return instant;
    }
    jour = jourSuivant(jour);
  }
  return instant;
}

export const dansLaFenetre = (instant, f = FENETRE_DEFAUT) => prochaineOuverture(instant, f).getTime() === instant.getTime();

/** Pure : avance de n jours d'envoi (un délai d'un jour posé un vendredi tombe le lundi). */
export function ajouterJours(instant, n, f = FENETRE_DEFAUT) {
  let t = instant.getTime();
  let reste = Math.max(0, Number(n) || 0);
  while (reste > 0) {
    t += JOUR;
    if (f.jours.includes(jourSemaine(jourParis(new Date(t))))) reste -= 1;
  }
  return new Date(t);
}

// --- Le rendu ----------------------------------------------------------------------------

/** Pure : un texte simple devient les blocs d'un mail. Une ligne [[Texte du bouton|lien]] devient un bouton. */
export function designDepuisTexte(texte) {
  const blocs = String(texte || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((p, i) => {
    const b = p.match(/^\[\[(.+?)\|(.+?)\]\]$/);
    return b ? { id: `t${i}`, type: 'bouton', texte: b[1], lien: b[2] } : { id: `t${i}`, type: 'texte', texte: p };
  });
  return { blocs: [...blocs, { id: 'sig', type: 'signature', texte: 'L\'équipe Klocka' }] };
}

const salutation = (c) => (c.prenom ? `Bonjour ${c.prenom},` : 'Bonjour,');
/** Ce qui se lit dans {{…}} en plus de la fiche : la salutation et ce que le fait d'entrée a apporté. */
const varsContexte = (p, c, phrase = '') => ({
  salutation: salutation(c), phrase, APP_URL: (process.env.APP_URL || '').replace(/\/$/, ''),
  ...Object.fromEntries(Object.entries(p.contexte || {}).filter(([, v]) => ['string', 'number'].includes(typeof v))),
});

let phraseDeTest = null;
export function brancherPourTests({ phrase = null } = {}) { if (process.env.NODE_TEST_CONTEXT) phraseDeTest = phrase; }

/** Une phrase propre à cet agent, tirée du compte rendu de l'appel. Sans compte rendu ou sans réponse : rien, le mail part sans. */
async function phraseHaka(p, a, c) {
  if (phraseDeTest) return phraseDeTest(p, c);
  const cr = String(p.contexte?.compte_rendu || '').trim();
  if (!cr || process.env.NODE_TEST_CONTEXT) return '';
  try {
    const { invokeLLM } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    const prompt = `Tu écris pour Klocka, qui achète des murs commerciaux pour ses investisseurs. Voici le compte rendu d'un appel avec un agent immobilier :\n${cr.slice(0, 1500)}\n\nÉcris UNE phrase de relance (vingt mots au plus, vouvoiement, sans formule de politesse) qui reprend un détail précis de cet échange. Si rien de précis n'y figure, rends une chaîne vide.`;
    const r = (await mesurer({ operation: 'emailing : phrase de relance', par: p.boite }, () => invokeLLM({ prompt, response_json_schema: { type: 'object', properties: { phrase: { type: 'string' } }, required: ['phrase'] } }))).resultat;
    return String(r?.phrase || '').trim();
  } catch (e) {
    console.warn('[emailing] phrase de relance :', e?.message || e);
    return '';
  }
}

async function rendre(a, e, p, c) {
  const { rendrePour, lienDesinscription, varsDuContact } = await import('./campagnes.js');
  if (a.nature === 'prospection') {
    const { lienSimulateur } = await import('./newsletters.js');
    const phrase = e.personnaliser ? await phraseHaka(p, a, c) : '';
    const vars = { ...varsDuContact(c), k: c.jeton, lien_simulateur: lienSimulateur(c, null), ...varsContexte(p, c, phrase) };
    const corps = remplir(e.texte, vars).replace(/\n{3,}/g, '\n\n').trim();
    const objet = e.meme_fil && p.fil?.objet ? `Re: ${p.fil.objet.replace(/^Re:\s*/i, '')}` : remplir(e.objet, vars).trim();
    return { objet, texte: `${corps}\n\nSi vous préférez ne plus recevoir ces messages : ${lienDesinscription(c, null)}`, html: null };
  }
  const modele = e.template_id ? Records.get(E.TEMPLATE, e.template_id) : null;
  const avecContexte = { ...c, champs: { ...(c.champs || {}), ...varsContexte(p, c) } };
  return rendrePour({ id: `auto-${a.id}`, objet: e.objet || modele?.objet || '', apercu: e.apercu || modele?.apercu || '', design: modele?.design || e.design || designDepuisTexte(e.texte) }, avecContexte);
}

// --- Les entrées et les sorties ----------------------------------------------------------

const filtreOk = (d, ev) => !d.filtre || Object.entries(d.filtre).every(([k, v]) => !v || String(ev.charge?.[k] ?? '') === String(v));

/** Fait entrer un contact dans une automatisation. Rend l'identifiant du parcours, ou null. */
export function entrer(a, c, { boite = null, contexte = {}, quand = new Date() } = {}) {
  const premier = a.etapes?.[0]?.id;
  if (!premier || !c || c.statut !== 'abonne') return null;
  if (!J.peutEcrire(c.email, { nature: a.nature }).ok) return null;
  if (!a.rejouable && J.dejaPasse(a.id, c.id)) return null;
  return J.creerParcours({ automatisation_id: a.id, contact_id: c.id, email: c.email, noeud_id: premier, prochain_le: quand.toISOString(), boite: J.norm(boite || a.expediteur) || null, contexte });
}

function arreterParcours(p, raison, quand) {
  J.majParcours(p.id, { statut: 'sortie', raison, sorti_le: quand });
  for (const l of J.fileDe(p.email)) if (l.parcours_id === p.id && ['a_valider', 'a_partir'].includes(l.etat)) J.majFile(l.id, { etat: 'annule', erreur: raison });
}

export function traiterEvenements({ quand = new Date() } = {}) {
  const lots = J.aTraiter();
  if (!lots.length) return 0;
  const autos = actives();
  for (const ev of lots) {
    try {
      if (ev.contact_id) recalculer(ev.contact_id, { quand: quand.getTime() });
      for (const p of J.parcoursEnCoursDe(ev.email)) {
        const a = Records.get(AUTO, p.automatisation_id);
        // Tout fait plus récent que celui qui l'a fait entrer : un appel annulé dans la minute fait bien sortir.
        if (a?.sorties?.includes(ev.type) && ev.id > (p.contexte?._ev || 0)) arreterParcours(p, ev.type, ev.le);
      }
      const c = ev.contact_id ? Records.get(E.CONTACT, ev.contact_id) : J.contactParEmail(ev.email);
      if (c) {
        for (const a of autos) {
          if (a.declencheurs?.some((d) => d.evenement === ev.type && filtreOk(d, ev))) entrer(a, c, { boite: ev.charge?.par, contexte: { ...(ev.charge || {}), _ev: ev.id }, quand });
        }
      }
    } catch (x) { console.warn('[emailing] fait non traité :', x?.message || x); }
    J.marquerTraite(ev.id);
  }
  return lots.length;
}

// --- Les parcours ------------------------------------------------------------------------

function condition(e, p, c) {
  const r = e.regle || {};
  switch (r.genre) {
    case 'evenement': return J.evenementDepuis(p.email, r.evenement, p.entre_le);
    case 'score': return Number(c[`score_${r.score}`] || 0) >= Number(r.min || 0);
    case 'stade': return ({ lead: 0, mql: 1, sql: 2 })[c.stade || 'lead'] >= ({ lead: 0, mql: 1, sql: 2 })[r.stade || 'mql'];
    case 'tag': return (c.tags || []).includes(r.tag);
    case 'champ': return r.valeur ? String(c.champs?.[r.champ] ?? '') === String(r.valeur) : !!String(c.champs?.[r.champ] ?? '').trim();
    case 'dernier_ouvert':
    case 'dernier_clique': {
      const l = J.fileDe(p.email).find((x) => x.parcours_id === p.id && x.envoye_le);
      return !!(r.genre === 'dernier_ouvert' ? l?.ouvert_le : l?.clique_le);
    }
    default: return false;
  }
}

async function tache(e, p, c, a) {
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
  try {
    (await import('../notifications.js')).notifier({ pour: e.pour || p.boite || a.cree_par || null, titre: remplir(e.titre || `Rappeler ${nom}`, { prenom: c.prenom || '', nom: c.nom || '' }), texte: `${nom}, depuis « ${a.nom} ».`, lien: `/Emailing?p=contacts&c=${c.id}`, cle: `tache:${p.id}:${e.id}` });
  } catch { /* la notification n'arrête pas le parcours */ }
}

/** Fait avancer un parcours jusqu'à sa prochaine attente. */
async function avancer(p, a, carte, quand) {
  let noeud = p.noeud_id;
  let attente = p.attente;
  const c = Records.get(E.CONTACT, p.contact_id);
  if (!c || c.statut !== 'abonne') return J.majParcours(p.id, { statut: 'sortie', raison: c ? c.statut : 'contact_supprime', sorti_le: quand.toISOString() });
  for (let i = 0; i < ETAPES_PAR_TOUR; i += 1) {
    if (!noeud) return J.majParcours(p.id, { statut: 'terminee', noeud_id: null, sorti_le: quand.toISOString() });
    const place = carte.get(noeud);
    // L'étape a été retirée depuis que le contact y est entré.
    if (!place) return J.majParcours(p.id, { statut: 'sortie', raison: 'etape_retiree', sorti_le: quand.toISOString() });
    const { e } = place;
    if (e.type === 'attendre' || e.type === 'avant_date') {
      if (attente) { attente = 0; noeud = place.suivant; continue; }
      const cible = e.type === 'attendre'
        ? ajouterJours(quand, e.jours, a.fenetre)
        : new Date(Date.parse(p.contexte?.[e.champ] || '') + Number(e.heures || 0) * 3600000);
      if (Number.isNaN(cible.getTime()) || cible <= quand) { noeud = place.suivant; continue; }
      return J.majParcours(p.id, { noeud_id: noeud, attente: 1, prochain_le: cible.toISOString() });
    }
    if (e.type === 'condition') { noeud = condition(e, p, c) ? place.oui : place.non; continue; }
    if (e.type === 'tag') { if (e.tag) Records.update(E.CONTACT, c.id, { tags: [...new Set([...(c.tags || []), e.tag])] }); noeud = place.suivant; continue; }
    if (e.type === 'tache') { await tache(e, p, c, a); noeud = place.suivant; continue; }
    if (e.type === 'sortir') return J.majParcours(p.id, { statut: 'sortie', raison: 'etape_sortie', sorti_le: quand.toISOString() });
    // Un mail : il part en file, le parcours attend qu'il soit parti.
    const m = await rendre(a, e, p, c);
    const prospection = a.nature === 'prospection';
    J.enFile({
      cle: `auto:${p.id}:${e.id}`, parcours_id: p.id, automatisation_id: a.id, noeud_id: e.id, contact_id: c.id, email: c.email,
      canal: prospection ? 'gmail' : 'resend', boite: prospection ? p.boite : null, objet: m.objet, texte: m.texte, html: m.html || null,
      etat: prospection ? 'a_valider' : 'a_partir', prevu_le: (e.immediat ? quand : prochaineOuverture(quand, a.fenetre)).toISOString(),
    });
    return J.majParcours(p.id, { noeud_id: noeud, attente: 0, statut: 'attente_envoi', prochain_le: null });
  }
  return J.majParcours(p.id, { noeud_id: noeud, attente: 0, prochain_le: quand.toISOString() });
}

export async function avancerParcours({ quand = new Date() } = {}) {
  const autos = new Map(actives().map((a) => [a.id, a]));
  const dus = J.parcoursDus(quand.toISOString(), [...autos.keys()]);
  const cartes = new Map();
  for (const p of dus) {
    const a = autos.get(p.automatisation_id);
    if (!cartes.has(a.id)) cartes.set(a.id, aplatir(a.etapes));
    try { await avancer(p, a, cartes.get(a.id), quand); } catch (x) {
      console.warn('[emailing] parcours bloqué :', x?.message || x);
      J.majParcours(p.id, { statut: 'echec', raison: String(x?.message || x).slice(0, 200), sorti_le: quand.toISOString() });
    }
  }
  return dus.length;
}

// --- La file -----------------------------------------------------------------------------

/** Le mail est parti : le parcours reprend à l'étape d'après. */
function apresEnvoi(l, quand, envoi = {}) {
  J.emettre('envoye', { email: l.email, contact_id: l.contact_id, source: l.automatisation_id, cle: `envoye:${l.id}`, le: quand.toISOString() });
  if (!l.parcours_id) return;
  const p = J.parcours(l.parcours_id);
  if (!p || p.statut !== 'attente_envoi') return;
  const a = Records.get(AUTO, p.automatisation_id);
  const suivant = a ? aplatir(a.etapes).get(p.noeud_id)?.suivant ?? null : null;
  const fil = p.fil || (envoi.thread ? { thread: envoi.thread, objet: l.objet } : null);
  J.majParcours(p.id, suivant
    ? { statut: 'en_cours', noeud_id: suivant, prochain_le: quand.toISOString(), ...(fil ? { fil } : {}) }
    : { statut: 'terminee', noeud_id: null, sorti_le: quand.toISOString(), ...(fil ? { fil } : {}) });
}

function echec(l, erreur, definitif, quand) {
  const tentatives = (l.tentatives || 0) + 1;
  if (!definitif && tentatives < 5) return J.majFile(l.id, { tentatives, erreur: String(erreur).slice(0, 300), prevu_le: new Date(quand.getTime() + 10 * 60000).toISOString() });
  J.majFile(l.id, { etat: 'erreur', tentatives, erreur: String(erreur).slice(0, 300) });
  if (l.parcours_id) J.majParcours(l.parcours_id, { statut: 'echec', raison: String(erreur).slice(0, 200), sorti_le: quand.toISOString() });
}

async function envoyerResendLigne(l, a, c, quand, envoyer) {
  const { lienDesinscription } = await import('./campagnes.js');
  const lien = c?.jeton ? lienDesinscription(c, null) : null;
  const r = await expedier({
    a: l.email, objet: l.objet, html: l.html, texte: l.texte, repondreA: a?.repondre_a || null,
    ...(a?.expediteur_nom ? { de: `${a.expediteur_nom} <equipe@notifications-klocka.com>` } : {}),
    ...(lien ? { entetes: { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    etiquettes: [['automatisation', l.automatisation_id || 'aucune']], idempotence: l.cle,
  }, { testeur: a?.cree_par || null, envoyer });
  if (!r.ok) return echec(l, r.error, !!r.definitif, quand);
  J.majFile(l.id, { etat: r.redirige ? 'redirige' : r.simule ? 'simule' : 'envoye', envoye_le: quand.toISOString(), externe_id: r.id || null, erreur: null });
  apresEnvoi(l, quand);
}

async function envoyerGmailLigne(l, a, quand, envoyer) {
  if (!l.boite) return echec(l, 'Aucune boîte d\'envoi pour ce mail : réglez l\'expéditeur de la séquence.', true, quand);
  const p = l.parcours_id ? J.parcours(l.parcours_id) : null;
  const garde = destinataireGarde(l.email, adresseDeTest(a?.cree_par || l.boite));
  if (!garde) {
    J.majFile(l.id, { etat: 'simule', envoye_le: quand.toISOString() });
    return apresEnvoi(l, quand);
  }
  const r = await envoyer({ from: l.boite, owner: l.boite, to: garde.a, subject: `${garde.objetPrefixe}${l.objet}`, body: l.texte, intention: 'prospection_sequence', ...(envoiReel() && p?.fil?.thread ? { threadId: p.fil.thread } : {}) });
  if (!r?.success) return echec(l, r?.error || 'Gmail a refusé l\'envoi.', false, quand);
  J.majFile(l.id, { etat: envoiReel() ? 'envoye' : 'redirige', envoye_le: quand.toISOString(), externe_id: r.messageId || null, thread_id: r.threadId || null, erreur: null });
  apresEnvoi(l, quand, { thread: r.threadId || null });
}

/**
 * Fait partir ce qui est dû. Le garde-fou se relit à ce moment précis : une opposition arrivée après la validation
 * l'emporte. Une boîte Gmail n'envoie qu'un mail par tour (une minute d'écart au moins) et respecte son plafond.
 */
export async function tourFile({ quand = new Date(), envoyerParResend = envoyerResend, envoyerParGmail = null } = {}) {
  const gmail = envoyerParGmail || (await import('../email.js')).sendEmail;
  const { plafondDe } = await import('./expediteurs.js');
  const boitesServies = new Set();
  const depuis = new Date(quand.getTime() - JOUR).toISOString();
  let partis = 0;
  for (const l of J.fileDue(quand.toISOString())) {
    const a = l.automatisation_id ? Records.get(AUTO, l.automatisation_id) : null;
    if (a && a.statut !== 'active') continue;
    const nature = l.canal === 'gmail' ? 'prospection' : 'diffusion';
    const droit = J.peutEcrire(l.email, { nature });
    if (!droit.ok) {
      J.majFile(l.id, { etat: 'annule', erreur: droit.motif });
      if (l.parcours_id) J.majParcours(l.parcours_id, { statut: 'sortie', raison: droit.motif, sorti_le: quand.toISOString() });
      continue;
    }
    if (l.canal === 'gmail') {
      if (boitesServies.has(l.boite) || !dansLaFenetre(quand, a?.fenetre || FENETRE_DEFAUT)) continue;
      if (J.envoyesParBoite(l.boite, depuis) >= plafondDe(l.boite)) continue;
      boitesServies.add(l.boite);
      await envoyerGmailLigne(l, a, quand, gmail);
    } else {
      await envoyerResendLigne(l, a, l.contact_id ? Records.get(E.CONTACT, l.contact_id) : null, quand, envoyerParResend);
    }
    partis += 1;
  }
  return partis;
}

// --- La validation -----------------------------------------------------------------------

export function valider(ids, user, { quand = new Date() } = {}) {
  let n = 0;
  for (const id of ids) {
    const l = J.ligneFile(id);
    if (l?.etat !== 'a_valider') continue;
    J.majFile(id, { etat: 'a_partir', valide_par: user?.email || null, valide_le: quand.toISOString(), prevu_le: quand.toISOString() });
    n += 1;
  }
  return { ok: true, valides: n };
}

export function modifierLigne(id, { objet, texte, boite }) {
  const l = J.ligneFile(id);
  if (l?.etat !== 'a_valider') return { ok: false, error: 'Ce mail n\'est plus à valider.' };
  J.majFile(id, { ...(objet !== undefined ? { objet: String(objet) } : {}), ...(texte !== undefined ? { texte: String(texte) } : {}), ...(boite !== undefined ? { boite: J.norm(boite) || null } : {}) });
  return { ok: true, ligne: J.ligneFile(id) };
}

/** Écarte un mail à valider : il ne part pas, et le contact sort de sa séquence. */
export function ecarter(ids, user) {
  let n = 0;
  for (const id of ids) {
    const l = J.ligneFile(id);
    if (l?.etat !== 'a_valider') continue;
    J.majFile(id, { etat: 'annule', erreur: 'ecarte', valide_par: user?.email || null });
    if (l.parcours_id) J.majParcours(l.parcours_id, { statut: 'sortie', raison: 'ecarte', sorti_le: maintenant() });
    n += 1;
  }
  return { ok: true, ecartes: n };
}

// --- Le tour -----------------------------------------------------------------------------

export async function tour({ quand = new Date() } = {}) {
  const { initialiser } = await import('./departs.js');
  initialiser();
  const { lireReponses } = await import('./reponses.js');
  const reponses = await lireReponses({ quand });
  const faits = traiterEvenements({ quand });
  const parcours = await avancerParcours({ quand });
  const partis = await tourFile({ quand });
  tourScores({ quand });
  Meta.set('emailing:moteur_le', quand.toISOString());
  return { reponses, faits, parcours, partis };
}

/** Pour l'écran : l'état du moteur. */
export const etatMoteur = () => ({ auto: !!process.env.RENDER || process.env.EMAILING_AUTO === 'true', reel: envoiReel(), dernier_tour: Meta.get('emailing:moteur_le') });
