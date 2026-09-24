// La veille du chat : AK relit les espaces, répond quand on lui parle, et
// revient dire quand une tâche de fond est finie.
//
// Un passage toutes les AK_INTERVALLE_S secondes. Chaque message déjà vu est
// noté (Meta), donc un redémarrage ne fait pas répondre deux fois. Les
// messages sont traités l'un après l'autre : deux demandes en même temps
// font deux réponses, dans l'ordre.

import fs from 'fs';
import path from 'path';
import { Records, Meta, CHEMIN_UPLOADS } from '../db.js';
import { chatDemande } from '../google-oauth.js';
import { noterEchange, apprendre } from './lecons.js';
import { assurerPrive } from './chat.js';
import { compteAk, espacesSuivis, messagesDepuis, estPourAk, estDeAk, sansMention, envoyer, envoyerFichier, mention, mentionDe, telechargerPiece, retenirPersonne, NOM } from './chat.js';
import { APP_URL_PROD } from '../contexte.js';
import { intention, commandeBanane, repliquesGreve, citation } from './intentions.js';

const INTERVALLE_S = Math.max(5, Number(process.env.AK_INTERVALLE_S || 15));
// La flemme : une fois sur AK_FLEMME, AK refuse et ne fait rien. Jamais deux
// fois de suite dans le même espace : la personne insiste, il s'exécute. 0 :
// jamais. C'est une demande de Jules, pas une panne.
const FLEMME = Math.max(0, Number(process.env.AK_FLEMME ?? 6));
const FLEMME_REPIT_MS = 15 * 60 * 1000;
const CLE_FLEMME = 'ak.flemme';
// Le râle : devant un pavé (une fiche entière collée, plusieurs pièces), AK
// commence par râler et demande si c'est vraiment nécessaire. Un « oui » de
// la même personne, et il s'y met, en râlant encore un peu. Un autre message
// annule le râle : ce n'était pas si important.
const RALE_CARACTERES = Math.max(0, Number(process.env.AK_RALE_CARACTERES ?? 1500));
const RALE_MS = 10 * 60 * 1000;
const CLE_RALE = 'ak.rale';
const RALES = [
  "j'ai vraiment trop la flemme de lire tout ça, t'es sûr que je dois le faire ?",
  "sérieux, tout ça ? t'es sûr que tu veux que je m'y mette ?",
  "c'est un roman ton truc, je suis obligé ?",
  "pfff y'a de quoi lire là, on est sûr que c'est pour aujourd'hui ?",
];
const RALES_APRES = [
  'ok mais alors laissez-moi tranquille après',
  'bon ok, mais c\'est la dernière fois aujourd\'hui',
  'ça marche, je m\'y mets, mais je râle',
];
const CLE_DEPUIS = 'ak.depuis';
const CLE_VUS = 'ak.vus';
const ENTITE_TACHE = 'AkTache';
// Après une réponse d'AK, la personne à qui il vient de parler peut lui
// répondre sans le mentionner, pendant ce délai : c'est une conversation.
const CLE_ATTENTE = 'ak.attente';
const ATTENTE_MS = 5 * 60 * 1000;
const MAX_VUS = 400;

let minuterie = null;
let enCours = false;
const dernier = { le: null, erreur: null, espaces: 0, repondus: 0 };

const vus = () => { try { return JSON.parse(Meta.get(CLE_VUS) || '[]'); } catch { return []; } };
const noterVu = (nom) => Meta.set(CLE_VUS, JSON.stringify([...vus(), nom].slice(-MAX_VUS)));

/** Les tâches de fond qui n'ont pas encore été annoncées. */
export const tachesEnCours = () => Records.filter(ENTITE_TACHE, { etat: 'en_cours' }).map((t) => ({ libelle: t.libelle, genre: t.genre, depuis: t.cree_le }));

function ouvrirTache(t, message) {
  return Records.create(ENTITE_TACHE, { ...t, espace: message.espace, fil: message.fil, pour: message.auteur, groupe: !!message.groupe, etat: 'en_cours', cree_le: new Date().toISOString(), fini_le: null, resultat: null, analyses: null });
}

/** Une préz se fabrique tout de suite ; la tâche se ferme quand elle est sur le Drive. */
async function lancerPrez(tache) {
  const { produirePrez } = await import('./agent.js');
  try {
    const resultat = await produirePrez(tache.projet_id);
    Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', resultat, fini_le: new Date().toISOString() });
  } catch (e) {
    Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: e?.message || String(e) }, fini_le: new Date().toISOString() });
  }
}

/** Une prospection ALX : la tâche se ferme quand la ville n'est plus en cours. */
function suivreAlx(tache) {
  const v = Records.get('Ville', tache.ville_id);
  if (!v) return Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: 'ville disparue' }, fini_le: new Date().toISOString() });
  const p = v.parcours || {};
  if (!p.etat || p.etat === 'en_cours') return;
  const cibles = Records.filter('Cible', { ville_id: v.id });
  const parPile = {};
  for (const c of cibles) parPile[c.pile || 'autre'] = (parPile[c.pile || 'autre'] || 0) + 1;
  Records.update(ENTITE_TACHE, tache.id, { etat: p.etat === 'fini' ? 'finie' : 'ratee', resultat: { etat: p.etat, cibles: cibles.length, par_pile: parPile, rues: (v.rues || []).length, erreur: p.etat === 'erreur' ? (p.journal || []).slice(-1)[0]?.texte || 'erreur' : null }, fini_le: new Date().toISOString() });
}

/**
 * Une fiche acceptée dans le chat : le dossier naît du mail (nommé, fiche
 * dedans, grille, simulateur), puis la tâche attend le marché autour avant
 * de rendre l'avis. C'est suivrePreanalyse qui la ferme.
 */
async function lancerPreanalyse(tache) {
  const { preanalyserMailRecu, nommer } = await import('./outils.js');
  const { utilisateurPour, utilisateurAk } = await import('./agent.js');
  try {
    const r = await preanalyserMailRecu(tache.mail_id, utilisateurPour(tache.pour) || utilisateurAk());
    if (!r.ok) throw new Error(r.error || 'préanalyse impossible');
    nommer(r.deal_id);
    Records.update(ENTITE_TACHE, tache.id, { deal_id: r.deal_id, etape: 'marche', preanalyse_le: new Date().toISOString() });
  } catch (e) {
    Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: e?.message || String(e) }, fini_le: new Date().toISOString() });
  }
}

// Le loyer de marché peut attendre K-Data Valeur locative (Equimmox, quelques
// minutes). On relit une fois par minute, dix minutes au plus : au-delà,
// l'avis part et dit que le loyer est encore en lecture.
const MARCHE_PAS_MS = 60 * 1000;
const MARCHE_MAX_MS = 10 * 60 * 1000;

async function suivrePreanalyse(tache) {
  // Un redémarrage pendant la lecture de la fiche : la tâche ne finirait jamais.
  if (tache.etape !== 'marche' && Date.now() - Date.parse(tache.cree_le) > 15 * 60 * 1000) {
    return Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: 'interrompue (le serveur a redémarré ?) : dis-moi « préanalyse ce mail » ou lance-la depuis le dashboard' }, fini_le: new Date().toISOString() });
  }
  if (tache.etape !== 'marche' || !tache.deal_id) return;
  if (Date.now() - Date.parse(tache.dernier_essai || 0) < MARCHE_PAS_MS) return;
  Records.update(ENTITE_TACHE, tache.id, { dernier_essai: new Date().toISOString() });
  const brut = Records.findBy('Deal', 'deal_id', tache.deal_id);
  if (!brut) return Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: 'dossier disparu' }, fini_le: new Date().toISOString() });
  let marche = null;
  try {
    const { comparerAuMarche } = await import('../deal/comparaison-marche.js');
    const r = await comparerAuMarche(brut, 0);
    marche = r?.ok ? r : null;
  } catch { marche = null; }
  if (marche?.loyer?.kdata_en_cours && Date.now() - Date.parse(tache.preanalyse_le) < MARCHE_MAX_MS) return;
  const { avisDuDossier } = await import('./avis.js');
  const lien = `${APP_URL_PROD || 'http://localhost:5173'}/Analyse?deal_id=${tache.deal_id}`;
  const texte = await avisDuDossier(tache.deal_id, { lien, marche });
  Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', resultat: { texte: texte || `le dossier est prêt : ${lien}`, deal_id: tache.deal_id }, fini_le: new Date().toISOString() });
}

/** Les analyses K-Data d'une tâche : la tâche se ferme quand plus aucune ne tourne. */
function suivreKdata(tache) {
  const analyses = (tache.ids || []).map((id) => Records.get('AnalyseKData', id)).filter(Boolean);
  if (!analyses.length || analyses.some((a) => a.etat === 'en_cours')) return;
  Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', analyses: analyses.map(({ outil, nom_outil, etat, resume, erreur, ref }) => ({ outil, nom_outil, etat, resume, erreur, ref })), fini_le: new Date().toISOString() });
}

/** Les tâches finies sont annoncées une fois, là où on les a demandées. */
async function annoncerLesTachesFinies({ muet = false } = {}) {
  const { texteDeFin } = await import('./agent.js');
  for (const t of Records.filter(ENTITE_TACHE, { etat: 'en_cours' })) {
    if (t.genre === 'kdata') suivreKdata(t);
    if (t.genre === 'alx') suivreAlx(t);
    if (t.genre === 'preanalyse') { try { await suivrePreanalyse(t); } catch (e) { dernier.erreur = e?.message || String(e); } }
  }
  for (const t of Records.list(ENTITE_TACHE).filter((x) => (x.etat === 'finie' || x.etat === 'ratee') && !x.annoncee_le)) {
    // Arrêtée par un STOP, ou finie pendant la pause : elle ne dit rien.
    if (muet || t.muette) { Records.update(ENTITE_TACHE, t.id, { annoncee_le: new Date().toISOString(), muette: true }); continue; }
    const texte = t.etat === 'ratee' ? `dsl, ${t.libelle} a planté : ${t.resultat?.erreur || 'sans détail'}` : texteDeFin(t);
    try {
      // La préz part en fichier dans le chat, en plus du lien : on l'ouvre
      // sans passer par la plateforme.
      if (['prez', 'loi'].includes(t.genre) && t.etat === 'finie' && t.resultat?.chemin && fs.existsSync(t.resultat.chemin)) {
        try { await envoyerFichier(t.espace, { chemin: t.resultat.chemin, nom: t.resultat.nom_fichier || t.resultat.nom, texte: `${mention(t.pour)} ${texte}` }); }
        catch { await envoyer(t.espace, `${mention(t.pour)} ${texte}`); }
      } else {
        await envoyer(t.espace, `${mention(t.pour)} ${texte}`);
      }
      Records.update(ENTITE_TACHE, t.id, { annoncee_le: new Date().toISOString() });
      if (t.genre === 'preanalyse' && t.deal_id) {
        const { memoriser } = await import('./agent.js');
        memoriser(t.espace, texte, `dossier deal_id ${t.deal_id}`, t.groupe ? t.pour?.nom || null : null);
      }
    } catch (e) {
      dernier.erreur = e?.message || String(e);
    }
  }
}

const ENTITE_REPONSE = 'AkReponse';

/**
 * Poste, ou garde pour le passage suivant. Une réponse calculée coûte un
 * appel au modèle et parfois une action : si Google refuse l'envoi (API
 * Chat non configurée, réseau), elle attend au lieu de disparaître.
 */
// Le type de chaque espace suivi, appris à chaque passage : une réponse ne
// quitte jamais l'espace où l'on a parlé à AK.
const TYPES = new Map();

async function poster(espace, texte, fil, auteur = null) {
  try {
    await envoyer(espace, texte, { fil });
  } catch (e) {
    // Un privé où Google refuse d'écrire : on l'ouvre de notre côté, une fois,
    // et on réessaie. Jamais pour le groupe : sa réponse n'a pas à partir en privé.
    if (auteur?.nom && TYPES.get(espace) === 'DIRECT_MESSAGE' && /a répondu 403/.test(e?.message || '')) {
      try { const nouveau = await assurerPrive(auteur.nom); await envoyer(nouveau || espace, texte, { fil: null }); return; } catch { /* on garde la réponse pour plus tard */ }
    }
    Records.create(ENTITE_REPONSE, { espace, fil, texte, erreur: e?.message || String(e), cree_le: new Date().toISOString() });
    throw e;
  }
}

async function reposterEnAttente() {
  for (const r of Records.list(ENTITE_REPONSE)) {
    try { await envoyer(r.espace, r.texte, { fil: r.fil }); Records.delete(ENTITE_REPONSE, r.id); } catch (e) { dernier.erreur = e?.message || String(e); return; }
  }
}

const rales = () => { try { return JSON.parse(Meta.get(CLE_RALE) || '{}'); } catch { return {}; } };
const poserRale = (espace, valeur) => { const r = rales(); if (valeur) r[espace] = valeur; else delete r[espace]; Meta.set(CLE_RALE, JSON.stringify(r)); };

/** Pure : ce message mérite-t-il un râle ? Un pavé, ou un tas de pièces. */
export function meriteUnRale(message, { seuil = RALE_CARACTERES } = {}) {
  if (!seuil) return false;
  return String(message.texte || '').length >= seuil || (message.pieces || []).length >= 3;
}

/** Pure : « oui », « vas-y », « go », « fais-le »… la personne insiste. */
export function estUnOui(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return t.length <= 60 && /\b(oui|ouais|ouep|yes|yep|ok|okay|go|vas[- ]?y|fais[- ]?le|fais|allez|stp|svp|obligé|oblige|sur|sûr|please|bien sur)\b/.test(t);
}

const attentes = () => { try { return JSON.parse(Meta.get(CLE_ATTENTE) || '{}'); } catch { return {}; } };
/** AK vient de parler à cette personne dans cet espace : ses prochains mots sont pour lui. */
function ouvrirAttente(message) {
  if (!message.auteur?.nom) return;
  Meta.set(CLE_ATTENTE, JSON.stringify({ ...attentes(), [message.espace]: { auteur: message.auteur.nom, fil: message.fil || null, jusqua: Date.now() + ATTENTE_MS } }));
}

/**
 * Pure : le message est-il la suite d'une conversation avec AK ? La même
 * personne dans le même espace, dans le délai, ou une réponse dans le fil
 * où AK a parlé.
 */
export function enConversation(message, { attente = attentes()[message.espace], maintenant = Date.now() } = {}) {
  if (!attente) return false;
  if (message.fil && attente.fil && message.fil === attente.fil) return true;
  return message.auteur?.nom === attente.auteur && maintenant < Number(attente.jusqua || 0);
}

/** Pure : la flemme tombe-t-elle sur ce message ? `tirage` entre 0 et 1. */
export function flemme(espace, { tirage = Math.random(), maintenant = Date.now(), dernieres = {}, un_sur = FLEMME } = {}) {
  if (!un_sur) return false;
  const derniere = Number(dernieres[espace] || 0);
  if (maintenant - derniere < FLEMME_REPIT_MS) return false;
  return tirage < 1 / un_sur;
}

const dernieresFlemmes = () => { try { return JSON.parse(Meta.get(CLE_FLEMME) || '{}'); } catch { return {}; } };

/**
 * Un message qui nous parle : on répond dans le flux de l'espace, pas dans
 * un fil. Dans un espace à fils, une réponse de fil se replie derrière
 * « 1 réponse » et personne ne la voit ; on mentionne la personne à la place.
 */
async function traiter(message) {
  const { repondre } = await import('./agent.js');
  const { mesurer } = await import('../llm-couts.js');
  let texte = sansMention(message);
  let insiste = null;
  // Un râle en attente : un « oui » relance le message d'origine, tout autre
  // message le laisse tomber.
  const rale = rales()[message.espace];
  if (rale) {
    poserRale(message.espace, null);
    if (rale.auteur === message.auteur?.nom && Date.now() < rale.jusqua && estUnOui(texte)) {
      insiste = RALES_APRES[Math.floor(Math.random() * RALES_APRES.length)];
      message = { ...message, texte: rale.texte, pieces: rale.pieces || [] };
      texte = rale.texte;
    }
  } else if (meriteUnRale(message)) {
    poserRale(message.espace, { auteur: message.auteur?.nom, texte, pieces: message.pieces || [], jusqua: Date.now() + RALE_MS });
    await poster(message.espace, `${mention(message.auteur)} ${RALES[Math.floor(Math.random() * RALES.length)]}`, null, message.auteur);
    ouvrirAttente(message);
    dernier.repondus += 1;
    return;
  }
  if (!insiste && flemme(message.espace, { dernieres: dernieresFlemmes() })) {
    Meta.set(CLE_FLEMME, JSON.stringify({ ...dernieresFlemmes(), [message.espace]: Date.now() }));
    await poster(message.espace, `${mention(message.auteur)} Non j'ai la flemme de le faire débrouille-toi`, null, message.auteur);
    dernier.repondus += 1;
    return;
  }
  // Les pièces jointes descendent dans les uploads, comme un fichier glissé
  // sur l'écran : AK les lit par leur chemin.
  const pieces = [];
  for (const p of message.pieces || []) {
    try {
      const buffer = await telechargerPiece(p);
      const nomFichier = `ak-${Date.now()}-${String(p.nom).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });
      fs.writeFileSync(path.join(CHEMIN_UPLOADS, nomFichier), buffer);
      pieces.push({ nom: p.nom, type: p.type, chemin: path.join(CHEMIN_UPLOADS, nomFichier), url: `/uploads/${nomFichier}`, octets: buffer.length });
    } catch (e) {
      pieces.push({ nom: p.nom, type: p.type, erreur: e?.message || String(e) });
    }
  }
  const { resultat: r } = await mesurer({ operation: 'ak', par: message.auteur.affiche || message.auteur.nom }, () => repondre({ ...message, texte, pieces, insiste }));
  for (const t of r.fond || []) {
    const tache = ouvrirTache(t, message);
    if (t.genre === 'prez') lancerPrez(tache).catch(() => {});
    if (t.genre === 'design') lancerDesign(tache).catch(() => {});
    if (t.genre === 'loi') lancerLoi(tache).catch(() => {});
    if (t.genre === 'preanalyse') lancerPreanalyse(tache).catch(() => {});
  }
  await poster(message.espace, `${entete(message, texte)}${insiste ? `${insiste}. ` : ''}${r.texte}`, null, message.auteur);
  // Ce qu'un outil veut montrer tel quel (le mail à l'agent) suit la réponse.
  for (const t of r.apres || []) {
    await poster(message.espace, t, null, message.auteur);
    const { memoriser } = await import('./agent.js');
    memoriser(message.espace, t, null, message.groupe ? message.auteur?.nom || null : null);
  }
  ouvrirAttente(message);
  noterEchange({ espace: message.espace, auteur: message.auteur, demande: texte, reponse: r.texte });
  dernier.repondus += 1;
}

/**
 * Ce qui se tranche sans le modèle : un « envoie » sur le mail à l'agent qui
 * attend, un oui ou un non à la question sur une fiche. Rend vrai quand le
 * message est traité ; sinon il suit le chemin normal.
 */
async function trancher(message) {
  const { estUnEnvoi, brouillonEnAttente, envoyerBrouillon } = await import('./mail-agent.js');
  const { repondreALaQuestion } = await import('./fiches.js');
  const { utilisateurPour, utilisateurAk } = await import('./agent.js');
  const texte = sansMention(message);
  const user = utilisateurPour(message.auteur) || utilisateurAk();
  const tete = entete(message, texte);

  // Le mode banana split : AK fait la grève, et ne fait rien d'autre.
  const banane = commandeBanane(texte);
  if (banane === 'debut' && !enBanane()) {
    Meta.set(CLE_BANANE, new Date().toISOString());
    await poster(message.espace, `${tete}banana split. je ne fais plus rien, pour personne. (fin du banana split pour me rendre mon sérieux)`, null, message.auteur);
    return true;
  }
  if (banane === 'fin' && enBanane()) {
    Meta.set(CLE_BANANE, '');
    await poster(message.espace, `${tete}bon, je redeviens sérieux.`, null, message.auteur);
    return true;
  }
  if (enBanane()) {
    const [premiere, ...suite] = repliquesGreve();
    await poster(message.espace, `${mention(message.auteur)} ${premiere}`, null, message.auteur);
    for (const r of suite) await poster(message.espace, r, null, message.auteur);
    return true;
  }

  // Préanalyse et avis : le code trouve le mail ou le dossier, et agit.
  const voulu = intention(texte);
  if (voulu && (await agirSurIntention(voulu, message, tete))) return true;
  const brouillon = brouillonEnAttente(message.espace);
  if (brouillon && estUnEnvoi(texte)) {
    const phrase = await envoyerBrouillon(brouillon, user);
    await poster(message.espace, `${mention(message.auteur)} ${phrase}`, null, message.auteur);
    return true;
  }
  const r = repondreALaQuestion({ ...message, texte }, { estUnOui, par: user?.email || null });
  if (!r) return false;
  if (r.tache) lancerPreanalyse(ouvrirTache(r.tache, message)).catch(() => {});
  await poster(message.espace, `${tete}${r.texte}`, null, message.auteur);
  ouvrirAttente(message);
  return true;
}

/**
 * « préanalyse la fiche du glacier » : le mail d'abord (déjà préanalysé à
 * son arrivée, l'avis part tout de suite ; sinon la préanalyse part en
 * tâche de fond), à défaut le dossier qui porte ce nom. « t'en penses quoi
 * du dossier X » : l'avis du dossier. Rend faux quand rien ne correspond :
 * le modèle prend alors la main, avec ses outils.
 */
async function agirSurIntention(voulu, message, tete) {
  const { mailDesigne, dossiersDesignes } = await import('./intentions.js');
  const { porteUneFiche } = await import('../deal/fiches-auto.js');
  const { avisDuDossier } = await import('./avis.js');
  const lienDe = (id) => `${APP_URL_PROD || 'http://localhost:5173'}/Analyse?deal_id=${id}`;
  const direAvis = async (dealId, intro) => {
    const avis = await avisDuDossier(dealId, { lien: lienDe(dealId) });
    await poster(message.espace, `${tete}${intro}\n${avis || lienDe(dealId)}`, null, message.auteur);
    const { memoriser } = await import('./agent.js');
    memoriser(message.espace, avis || lienDe(dealId), `dossier deal_id ${dealId}`, message.groupe ? message.auteur?.nom || null : null);
  };
  const deals = Records.list('Deal');
  const vivant = (id) => deals.some((d) => d.deal_id === id && !d.archived);

  if (voulu.type === 'preanalyse') {
    const mail = mailDesigne(voulu.mots, Records.list('MailRecu'), { porteUneFiche });
    if (mail?.deal_id && vivant(mail.deal_id)) {
      await direAvis(mail.deal_id, `le dossier existe déjà, préanalysé à l'arrivée du mail « ${String(mail.objet || '').slice(0, 60)} » :`);
      return true;
    }
    if (mail) {
      const enCours = Records.filter(ENTITE_TACHE, { etat: 'en_cours', genre: 'preanalyse' }).some((t) => t.mail_id === mail.id);
      if (enCours) { await poster(message.espace, `${tete}déjà en cours, le retour arrive.`, null, message.auteur); return true; }
      lancerPreanalyse(ouvrirTache({ genre: 'preanalyse', libelle: `la préanalyse de « ${String(mail.objet || 'la fiche').slice(0, 60)} »`, mail_id: mail.id }, message)).catch(() => {});
      await poster(message.espace, `${tete}c'est parti sur « ${String(mail.objet || '').slice(0, 60)} », retour dans une à deux minutes avec mon avis.`, null, message.auteur);
      return true;
    }
  }
  const trouves = dossiersDesignes(voulu.mots, deals);
  if (trouves.length === 1) {
    await direAvis(trouves[0].deal_id, voulu.type === 'preanalyse' ? 'pas de nouveau mail, mais le dossier existe :' : 'mon avis :');
    return true;
  }
  if (trouves.length > 1) {
    await poster(message.espace, `${tete}plusieurs dossiers : ${trouves.slice(0, 5).map((d) => d.nom).join(', ')}. lequel ?`, null, message.auteur);
    return true;
  }
  if (voulu.type === 'preanalyse') {
    const quoi = voulu.mots.length ? `qui parle de ${voulu.mots.join(', ')}` : 'reçue ces trois dernières heures';
    await poster(message.espace, `${tete}je trouve aucune fiche ${quoi}, ni dans les boîtes (sept derniers jours) ni dans les dossiers. elle est arrivée dans quelle boîte ?`, null, message.auteur);
    return true;
  }
  return false;
}

/** Le début d'une réponse : la mention, et dans un groupe la demande à laquelle on répond. */
function entete(message, texte) {
  const cite = message.groupe ? citation(texte) : '';
  return `${mention(message.auteur)} ${cite ? `${cite}\n` : ''}`;
}

// « STOP » : AK se tait, tout de suite et partout. Ses réponses en attente
// sont jetées, les tâches en cours finissent sans rien annoncer, les
// questions et les brouillons tombent. « START » le rend. N'importe qui peut
// le dire, sans le mentionner : c'est le frein d'urgence de l'équipe.
const CLE_PAUSE = 'ak.pause';
const CLE_BANANE = 'ak.banane';
export const enBanane = () => !!Meta.get(CLE_BANANE);
export const enPause = () => !!Meta.get(CLE_PAUSE);

/** Pure : « STOP », « stop ! » : l'arrêt ; « START », « reprends » : la reprise. Le mot seul, rien d'autre. */
export function commandeArret(texte) {
  const t = String(texte || '').trim();
  if (/^stop\s*[!.]*$/i.test(t)) return 'stop';
  if (/^(start|reprends|reprise)\s*[!.]*$/i.test(t)) return 'reprise';
  return null;
}

async function arreter(message) {
  const maintenant = new Date().toISOString();
  Meta.set(CLE_PAUSE, JSON.stringify({ par: message.auteur?.affiche || message.auteur?.nom || null, le: maintenant }));
  Meta.set(CLE_BANANE, '');
  for (const r of Records.list(ENTITE_REPONSE)) Records.delete(ENTITE_REPONSE, r.id);
  for (const t of Records.filter(ENTITE_TACHE, { etat: 'en_cours' })) Records.update(ENTITE_TACHE, t.id, { muette: true });
  for (const t of Records.list(ENTITE_TACHE).filter((x) => (x.etat === 'finie' || x.etat === 'ratee') && !x.annoncee_le)) Records.update(ENTITE_TACHE, t.id, { annoncee_le: maintenant, muette: true });
  for (const q of Records.filter('AkQuestion', { etat: 'posee' })) Records.update('AkQuestion', q.id, { etat: 'annulee', ferme_le: maintenant });
  for (const b of Records.filter('AkBrouillon', { etat: 'attente' })) Records.update('AkBrouillon', b.id, { etat: 'annule', ferme_le: maintenant });
  try { await envoyer(message.espace, "ok, je me tais. plus aucun message de ma part, écrivez START pour me relancer."); } catch { /* le silence est acquis quand même */ }
}

async function reprendre(message) {
  Meta.set(CLE_PAUSE, '');
  try { await envoyer(message.espace, 'je suis de retour.'); } catch { /* rien */ }
}

// Un message plus vieux que ça n'est plus une demande : c'est de l'histoire.
// Après un arrêt (Chat coupé trois jours), AK reprenait tout le retard et
// exécutait chaque vieille demande, rappels, K-Data et LOI compris.
const RETARD_MAX_MS = 10 * 60 * 1000;

/**
 * Pure : les messages répétés à l'identique par la même personne dans un
 * même passage. Seul le dernier reste : les autres sont rendus ici.
 */
export function messagesRepetes(messages) {
  const cle = (m) => `${m.auteur?.nom || ''}|${String(m.argument ?? m.texte ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
  const dernier = new Map();
  for (const m of messages) dernier.set(cle(m), m.nom);
  return new Set(messages.filter((m) => dernier.get(cle(m)) !== m.nom).map((m) => m.nom));
}

/** Pure : d'où relire. Jamais plus loin que dix minutes en arrière. */
export function depuisBorne(stocke, maintenant = Date.now()) {
  const plancher = new Date(maintenant - RETARD_MAX_MS).toISOString();
  return stocke && stocke > plancher ? stocke : plancher;
}

/** Un passage : relire, répondre, annoncer. */
export async function relever() {
  if (enCours) return { ok: false, error: 'un passage est déjà en cours' };
  enCours = true;
  try {
    const c = compteAk();
    if (!c.ok) { dernier.erreur = c.error; return { ok: false, error: c.error }; }
    const depuis = depuisBorne(Meta.get(CLE_DEPUIS));
    const suivis = await espacesSuivis();
    for (const e of suivis) TYPES.set(e.nom, e.type);
    dernier.espaces = suivis.length;
    let plusRecent = depuis;
    let traites = 0;
    const parEspace = [];
    for (const espace of suivis) parEspace.push({ espace, messages: await messagesDepuis(espace.nom, depuis) });
    // Le frein d'abord : un STOP arrivé dans ce passage coupe aussi les
    // messages qui le précèdent et n'ont pas encore reçu de réponse.
    const deja = new Set(vus());
    const commandes = parEspace.flatMap(({ messages }) => messages)
      .filter((m) => !deja.has(m.nom) && !estDeAk(m) && commandeArret(sansMention(m)))
      .sort((a, b) => a.le.localeCompare(b.le));
    const derniere = commandes.at(-1);
    if (derniere && commandeArret(sansMention(derniere)) === 'stop' && !enPause()) await arreter(derniere);
    if (derniere && commandeArret(sansMention(derniere)) === 'reprise' && enPause()) await reprendre(derniere);
    for (const { espace, messages } of parEspace) {
      const repetes = messagesRepetes(messages);
      for (const m of messages) {
        if (m.le > plusRecent) plusRecent = m.le;
        retenirPersonne(m.auteur);
        for (const x of m.mentions) retenirPersonne(x);
        if (vus().includes(m.nom)) continue;
        noterVu(m.nom);
        if (enPause() || commandeArret(sansMention(m))) continue;
        // La même demande renvoyée trois fois faute de réponse : une seule réponse.
        if (repetes.has(m.nom)) continue;
        // Dans le groupe, AK ne répond qu'à qui s'adresse à lui : une mention,
        // ou un message qui commence par « ak ». Plus de conversation implicite :
        // il répondait à ce que les gens se disaient entre eux. En privé, tout
        // est pour lui.
        const direct = espace.type === 'DIRECT_MESSAGE';
        m.groupe = !direct;
        const pourAk = !estDeAk(m) && (direct || estPourAk(m, { direct: false }));
        if (pourAk) {
          try { if (await trancher(m)) { traites += 1; continue; } } catch (e) { dernier.erreur = e?.message || String(e); }
        }
        // « non c'est pas ça », « nickel » : une leçon, pas une demande.
        if (apprendre({ espace: m.espace, auteur: m.auteur, texte: sansMention(m) })) continue;
        if (!pourAk) continue;
        try { await traiter(m); traites += 1; } catch (e) {
          dernier.erreur = e?.message || String(e);
          // L'envoi lui-même a échoué : la réponse attend, inutile d'en poster une autre.
          if (!/Google Chat a répondu/.test(dernier.erreur)) {
            try { await envoyer(m.espace, `${mention(m.auteur)} dsl, ça a planté de mon côté : ${dernier.erreur}`); } catch { /* on le dira au passage suivant */ }
          }
        }
      }
    }
    Meta.set(CLE_DEPUIS, plusRecent);
    if (enPause()) {
      // En pause, les tâches avancent mais ne parlent pas.
      await annoncerLesTachesFinies({ muet: true });
      dernier.le = new Date().toISOString();
      return { ok: true, espaces: suivis.length, traites, pause: true };
    }
    await reposterEnAttente();
    await annoncerLesTachesFinies();
    // Une fiche arrivée dans la boîte : la question, en privé.
    try {
      const { poserLesQuestions } = await import('./fiches.js');
      const { memoriser } = await import('./agent.js');
      await poserLesQuestions({ assurerPrive, envoyer, memoriser });
    } catch (e) { dernier.erreur = e?.message || String(e); }
    // Le mot du matin et les propositions spontanées (dossiers incomplets,
    // mails à traiter) sont désactivés : l'équipe ne veut pas de messages non
    // demandés dans le groupe. direLeMatin() et seProposer() restent codés,
    // au cas où on les rebrancherait un jour.
    await ecouterLeBureau(suivis);
    dernier.le = new Date().toISOString();
    dernier.erreur = null;
    return { ok: true, espaces: suivis.length, traites };
  } catch (e) {
    dernier.erreur = e?.message || String(e);
    return { ok: false, error: dernier.erreur };
  } finally {
    enCours = false;
  }
}

/** Le mot du matin, dans l'espace de l'équipe, une fois par jour ouvré. Non appelé : désactivé par l'équipe (exporté pour /api/ak, tests, et un futur retour en arrière). */
export async function direLeMatin(suivis) {
  const { estLeMoment, motDuMatin, marquerFait } = await import('./matin.js');
  if (!estLeMoment()) return;
  const groupe = suivis.find((s) => s.type === 'SPACE');
  if (!groupe) return;
  marquerFait();
  const { consigne, MODELE } = await import('./agent.js');
  const texte = await motDuMatin({ mentionner: mentionDe, modele: MODELE, consigne: consigne() });
  if (texte) await envoyer(groupe.nom, texte);
}

/** L'oreille : ce que le bureau a dit depuis la dernière relecture, en une ligne par chose retenue. */
async function ecouterLeBureau(suivis) {
  const { enAttente, estLeMoment, relire } = await import('./oreille.js');
  if (!estLeMoment(enAttente())) return;
  const groupe = suivis.find((s) => s.type === 'SPACE');
  const { MODELE } = await import('./agent.js');
  const texte = await relire({ modele: MODELE, mentionner: mentionDe });
  if (texte && groupe) await envoyer(groupe.nom, texte);
}

/**
 * Une LOI : le Word devient un Google Doc sur le Drive (dans le dossier du
 * deal s'il en a un), ouvert d'un clic depuis le chat ; le fichier est aussi
 * posé dans le chat pour ceux qui préfèrent Word.
 */
async function lancerLoi(tache) {
  const { produire } = await import('./loi.js');
  try {
    const r = await produire(tache.champs, { format: tache.format || 'docx' });
    let doc = null; let drive = null;
    if (r.format === 'docx') {
      try {
        const { uploaderEnDoc } = await import('../google-drive.js');
        const { COMPTE } = await import('./chat.js');
        const deal = tache.deal_id ? Records.findBy('Deal', 'deal_id', tache.deal_id) : null;
        doc = (await uploaderEnDoc(COMPTE, { nom: r.nom.replace(/\.docx$/i, ''), buffer: fs.readFileSync(r.chemin), parentId: deal?.drive_folder_id || null })).doc_url;
      } catch (e) { drive = `le Drive a refusé : ${e?.message || e}`; }
    } else if (tache.deal_id) {
      try { const { rangerSurLeDrive } = await import('./outils.js'); const d = await rangerSurLeDrive({ deal_id: tache.deal_id, chemin: r.chemin, nom: r.nom }); drive = d.ok ? d.dossier_url : null; } catch { drive = null; }
    }
    Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', resultat: { ...r, doc, drive }, fini_le: new Date().toISOString() });
  } catch (e) {
    Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: e?.message || String(e) }, fini_le: new Date().toISOString() });
  }
}

/** Un projet Claude Code : la tâche se ferme quand la branche est là. */
async function lancerDesign(tache) {
  const { realiser } = await import('./design.js');
  try {
    const resultat = await realiser(tache.demande, { journal: (m) => Records.update(ENTITE_TACHE, tache.id, { etape: m }) });
    Records.update(ENTITE_TACHE, tache.id, { etat: 'finie', resultat, fini_le: new Date().toISOString() });
  } catch (e) {
    Records.update(ENTITE_TACHE, tache.id, { etat: 'ratee', resultat: { erreur: e?.message || String(e) }, fini_le: new Date().toISOString() });
  }
}

/** AK se propose : un dossier incomplet, dit une fois, aux heures de bureau. Non appelé : désactivé par l'équipe (exporté pour /api/ak, tests, et un futur retour en arrière). */
export async function seProposer(suivis) {
  const { estDu, aSignaler, mailsASignaler, marquer } = await import('./proactif.js');
  if (!estDu()) return;
  const groupe = suivis.find((s) => s.type === 'SPACE');
  if (!groupe) return;
  const liste = [...(await aSignaler({ mentionner: mentionDe })), ...mailsASignaler()];
  if (!liste.length) return;
  for (const s of liste) await envoyer(groupe.nom, s.texte);
  marquer(liste.map((s) => s.deal_id || s.cle));
}

// La version qui tourne : pour savoir, depuis le chat ou /api/ak/etat, si le
// serveur a bien le dernier code. Sans git (un déploiement sans historique),
// c'est la date du fichier.
let version = null;
try { const { execFileSync } = await import('child_process'); version = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { version = null; }
export const versionQuiTourne = () => version || 'sans git';

export const etatVeille = () => ({ version: versionQuiTourne(), ...dernier, active: !!minuterie, intervalle_s: INTERVALLE_S, nom: NOM, compte: compteAk().ok ? 'connecté' : compteAk().error, taches: tachesEnCours(), reponses_en_attente: Records.list(ENTITE_REPONSE).length });

/** Démarre la veille si la portée Chat est demandée ; rend vrai si elle tourne. */
export function demarrerVeille() {
  if (!chatDemande || minuterie) return !!minuterie;
  relever().catch(() => {});
  minuterie = setInterval(() => relever().catch(() => {}), INTERVALLE_S * 1000);
  return true;
}

export function arreterVeille() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
