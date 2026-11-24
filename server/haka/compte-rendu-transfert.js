// Le compte rendu d'un transfert à sourcing@, dans le chat de l'assistant de celui qui l'a transféré (23 nov. 2026,
// Jules : « quand le traitement est fini, le système répond à la personne qui a transféré : 3 biens détectés, un
// document n'a pas pu être lu ; une erreur devient visible tout de suite et se corrige en dix secondes », canal choisi :
// le chat de l'assistant, ni mail ni cloche). Le compte rendu est posé sur le mail (`compte_rendu`) ; la page de
// l'assistant le montre comme un message de l'assistant à la prochaine ouverture ; la personne répond dans le chat
// (« c'était 2 », « ce n'est pas une fiche ») et l'outil `corriger_transfert` corrige le compte, en gardant sa remarque.

import { Records } from '../db.js';

const min = (e) => String(e || '').trim().toLowerCase();
const k = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€` : `${Math.round(n / 1000).toLocaleString('fr-FR')} k€`);

// Les liens de partage qu'on ne sait pas ouvrir : on les dit, au lieu de les taire.
const LIENS = [
  [/https?:\/\/(?:www\.)?(?:wetransfer\.com|we\.tl)\/\S+/gi, 'WeTransfer'],
  [/https?:\/\/(?:drive|docs)\.google\.com\/\S+/gi, 'Google Drive'],
  [/https?:\/\/(?:www\.)?dropbox\.com\/\S+/gi, 'Dropbox'],
  [/https?:\/\/(?:1drv\.ms|onedrive\.live\.com|[a-z0-9-]+\.sharepoint\.com)\/\S+/gi, 'OneDrive'],
  [/https?:\/\/(?:www\.)?(?:swisstransfer\.com|fromsmash\.com|transfernow\.net)\/\S+/gi, 'un service de transfert'],
];

/** Pure : les liens de partage d'un mail (WeTransfer, Drive, Dropbox…), un par adresse. */
export function liensNonLus(texte = '') {
  const vus = new Map();
  for (const [re, service] of LIENS) for (const m of String(texte).matchAll(re)) {
    const url = m[0].replace(/[)>\].,;]+$/, '');
    if (!vus.has(url)) vus.set(url, { url, service });
  }
  return [...vus.values()];
}

// Ce qui commence une réponse citée : « Le 12 nov. 2026 à 10:02, Paul a écrit : », « On … wrote: », l'en-tête d'un
// message d'origine (« De : … » suivi d'« Envoyé : » ou « Date : »), « -----Original Message----- ».
const REPONSE = /^\s*(?:le\s.{4,80}\sa\s[ée]crit\s*:|on\s.{4,80}\swrote\s*:|-{2,}\s*(?:original message|message d'origine)\s*-{2,})/im;
const ENTETE = /^\s*(?:\*\*)?(?:de|from)(?:\*\*)?\s*:.*\n(?:.*\n){0,3}?\s*(?:\*\*)?(?:envoy[ée]|sent|date)(?:\*\*)?\s*:/gim;

/**
 * Pure : le texte d'un mail transféré sans l'historique cité (23 nov. 2026 : « un fil avec trois réponses contient trois
 * fois la même description ; le modèle compte trois biens au lieu d'un »). On garde le message du collègue et le mail
 * d'origine (le premier en-tête « De : … »), on coupe au premier message plus ancien, et les lignes citées « > ».
 */
export function sansHistorique(texte = '') {
  let t = String(texte || '').replace(/\r/g, '');
  const entetes = [...t.matchAll(ENTETE)].map((m) => m.index);
  // Le premier en-tête ouvre le mail d'origine transféré ; le suivant, un message plus ancien du fil.
  const coupes = [];
  if (entetes.length > 1) coupes.push(entetes[1]);
  const apres = entetes.length ? entetes[0] + 1 : 0;
  const r = t.slice(apres).search(REPONSE);
  if (r >= 0) coupes.push(apres + r);
  if (coupes.length) t = t.slice(0, Math.min(...coupes));
  return t.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').trim();
}

/** Pure : une ligne de liste par bien : où, combien. */
const ligneBien = (b) => `- ${b.nom || 'adresse non lue'}${b.prix ? ` : ${k(b.prix)}` : ''}${b.loyer ? `${b.prix ? ',' : ' :'} loyer ${k(b.loyer)} par an` : ''}`;
const listeOu = (noms) => (noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0] || '');

/**
 * Pure : le compte rendu, rédigé comme une réponse du chat (23 nov. 2026, Jules : « je veux que ce soit une
 * conversation comme ça », une réponse en paragraphes, une liste à tirets) : ce qui a été repéré, ce qui n'a pas pu
 * être lu, puis comment corriger. `r` : le résultat de l'étape « agir » du transfert ; `liens` : ses liens de partage.
 */
export function texteDuCompteRendu({ objet = '', r = {}, liens = [] } = {}) {
  const sujet = String(objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim();
  const memoire = r.fait === 'memoire' ? r : r.memoire_dabord || null;
  const biens = (memoire?.biens || []).filter(Boolean);
  const deja = (memoire?.deja_biens || []).filter(Boolean);
  const paragraphes = [];
  const debut = `J'ai lu votre transfert${sujet ? ` « ${sujet} »` : ''}.`;
  if (biens.length) paragraphes.push(`${debut} ${biens.length > 1 ? `J'y ai repéré ${biens.length} biens` : "J'y ai repéré un bien"}, rangé${biens.length > 1 ? 's' : ''} dans la Mémoire :\n\n${biens.map(ligneBien).join('\n')}`);
  else if (deja.length) paragraphes.push(`${debut} ${deja.length > 1 ? 'Ces biens étaient' : 'Ce bien était'} déjà dans la Mémoire : c'est un renvoi.`);
  else if (r.fait === 'bien') paragraphes.push(`${debut} « ${r.nom || 'Le bien'} » ${r.complete ? 'était déjà dans vos biens : je l\'ai complété' : 'est dans vos biens'}${r.pieces ? `, avec ${r.pieces} pièce${r.pieces > 1 ? 's' : ''}` : ''}.`);
  else if (r.fait === 'plusieurs') paragraphes.push(`${debut} Il parle de plusieurs biens : envoyez-les un par un pour que chacun entre dans vos biens.`);
  else if (!['fiche', 'documents', 'nouveau', 'rejoint'].includes(r.fait)) paragraphes.push(`${debut} Je n'y ai repéré aucun bien.`);
  else paragraphes.push(debut);
  if (biens.length && deja.length) paragraphes.push(`Déjà dans la Mémoire, c'est un renvoi : ${listeOu(deja.map((b) => b.nom).filter(Boolean)) || `${deja.length} bien${deja.length > 1 ? 's' : ''}`}.`);
  if (r.fait === 'fiche') paragraphes.push(r.n_dossiers > 1 ? `Comme demandé, ${r.n_dossiers} dossiers sont créés et pré-analysés.` : `Comme demandé, le dossier « ${r.nom || 'nouveau bien'} » est créé et pré-analysé.`);
  if (r.fait === 'documents' && r.deposes?.length) paragraphes.push(`Les pièces sont rangées dans la Data Room de « ${r.nom} » : ${listeOu(r.deposes)}.`);
  if (r.fait === 'nouveau') paragraphes.push(`J'ai créé le dossier « ${r.nom} » avec ses pièces.`);
  if (r.fait === 'rejoint') paragraphes.push(`Ce bien était déjà suivi : je l'ai rattaché au dossier « ${r.nom || r.deal_id} ».`);
  // « Aucune fiche à lire » quand le mail n'a qu'un lien : le lien le dit mieux.
  const nonLus = [...(memoire?.erreurs || []), ...(r.erreurs && r !== memoire ? r.erreurs : [])].filter((x) => !(liens.length && /^Aucune fiche à lire/.test(x)));
  if (nonLus.length) paragraphes.push(nonLus.length > 1 ? `Je n'ai pas pu lire :\n\n${nonLus.map((x) => `- ${x}`).join('\n')}` : `Je n'ai pas pu lire ${nonLus[0].replace(/^([^:]+) : /, '« $1 » : ')}.`);
  if (liens.length) paragraphes.push(`Je n'ouvre pas les liens de partage (${listeOu([...new Set(liens.map((l) => l.service))])}) : joignez le fichier au mail pour qu'il soit lu.`);
  paragraphes.push("C'est juste ? Sinon, dites-le-moi ici, par exemple « c'était 5 », « il manque celui de Nice » ou « ce n'est pas une fiche ».");
  return paragraphes.join('\n\n');
}

/** Pure : le message de départ du fil, le transfert lui-même, comme un message envoyé. */
export function messageDuTransfert(mail = {}) {
  const sujet = String(mail.objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim() || 'sans objet';
  const pieces = (mail.pieces_jointes || []).map((p) => p?.nom).filter(Boolean);
  return `Transfert à sourcing@ : « ${sujet} »${pieces.length ? `\n\n${pieces.length > 1 ? `${pieces.length} pièces jointes` : 'Pièce jointe'} : ${listeOu(pieces.slice(0, 6))}${pieces.length > 6 ? '…' : ''}` : ''}`;
}

/** Pure : le compte rendu en une ligne, pour la pop-up (« 4 biens repérés · 1 pièce non lue »). */
export function resumeDuCompteRendu(r = {}, liens = []) {
  const memoire = r.fait === 'memoire' ? r : r.memoire_dabord || null;
  const n = (memoire?.biens || []).length;
  const deja = (memoire?.deja_biens || []).length;
  const nonLus = (memoire?.erreurs || []).filter((x) => !(liens.length && /^Aucune fiche à lire/.test(x))).length;
  return [
    n ? `${n} bien${n > 1 ? 's' : ''} repéré${n > 1 ? 's' : ''}` : deja ? 'déjà en Mémoire' : r.fait === 'fiche' ? 'dossier pré-analysé' : r.fait === 'documents' ? 'pièces rangées' : 'aucun bien repéré',
    nonLus ? `${nonLus} pièce${nonLus > 1 ? 's' : ''} non lue${nonLus > 1 ? 's' : ''}` : null,
    liens.length ? `${liens.length > 1 ? 'des liens' : 'un lien'} non ouvert${liens.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');
}

/** Pose le compte rendu sur le mail, pour la personne qui l'a transféré : une pop-up le lui annonce. */
export function poserCompteRendu(mail, { pour, r, lu = {} }) {
  if (!mail?.id || !pour) return null;
  const liens = liensNonLus(mail.texte);
  const texte = texteDuCompteRendu({ objet: lu.objet_origine || mail.objet, r, liens });
  Records.update('MailRecu', mail.id, { compte_rendu: { texte, resume: resumeDuCompteRendu(r, liens), pour: min(pour), le: new Date().toISOString(), vu_le: null } });
  return texte;
}

const sujetDe = (m) => String(m?.objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim() || 'sans objet';

/**
 * Le geste sur la pop-up (23 nov. 2026, Jules : « une pop-up de base, on clique dessus, on arrive sur la conversation ;
 * quand on ferme la pop-up, c'est mis dans À faire ; on clique dessus et ça ouvre la bonne conversation »).
 * `ouvrir` : vu et ouvert, rend la conversation ; `plus_tard` : vu, rangé dans « À faire » jusqu'à ce qu'on l'ouvre.
 */
export function gesteSurCompteRendu(email, mailId, geste) {
  const m = Records.get('MailRecu', String(mailId));
  if (!m?.compte_rendu || m.compte_rendu.pour !== min(email)) return { ok: false, error: 'Compte rendu introuvable.' };
  const maintenant = new Date().toISOString();
  const cr = { ...m.compte_rendu, vu_le: m.compte_rendu.vu_le || maintenant };
  if (geste === 'ouvrir') cr.ouvert_le = cr.ouvert_le || maintenant;
  else if (geste === 'plus_tard') cr.a_faire = true;
  else return { ok: false, error: 'Geste inconnu.' };
  Records.update('MailRecu', m.id, { compte_rendu: cr });
  return { ok: true, conversation_id: cr.conversation_id || null };
}

/** Les comptes rendus fermés sans être ouverts : des lignes de « À faire », qui ouvrent leur conversation. */
export function comptesRendusAFaire(email) {
  const e = min(email);
  return Records.list('MailRecu')
    .filter((m) => m.compte_rendu?.pour === e && m.compte_rendu.a_faire && !m.compte_rendu.ouvert_le && m.compte_rendu.conversation_id)
    .sort((a, b) => String(b.compte_rendu.le).localeCompare(String(a.compte_rendu.le)))
    .map((m) => ({ id: `cr:${m.id}`, genre: 'transfert', titre: `Compte rendu du transfert « ${sujetDe(m)} »`, echeance: null, du: false, contexte: [], fiches: [], cr: m.id, conversation_id: m.compte_rendu.conversation_id, resume: m.compte_rendu.resume || null }));
}

/** Les comptes rendus pas encore vus par cette personne, les plus anciens d'abord (sept jours au plus). */
export function comptesRendusPour(email, { maintenant = Date.now() } = {}) {
  const e = min(email);
  return Records.list('MailRecu')
    .filter((m) => m.compte_rendu?.pour === e && !m.compte_rendu.vu_le && maintenant - Date.parse(m.compte_rendu.le || 0) < 7 * 86400000)
    .sort((a, b) => String(a.compte_rendu.le).localeCompare(String(b.compte_rendu.le)))
    .map((m) => ({ id: m.id, texte: m.compte_rendu.texte, le: m.compte_rendu.le, objet: sujetDe(m), resume: m.compte_rendu.resume || null }));
}

/**
 * Les comptes rendus pas encore vus, chacun dans sa conversation de l'Historique (23 nov. 2026, Jules : « au lieu d'un
 * message dans le chat comme ça, qui est trop moche, je veux un vrai fil de discussion, comme quand on envoie un
 * message ») : la conversation « Transfert · <objet> » est créée à la première ouverture, puis l'écran l'ouvre.
 */
export async function conversationsDesComptesRendus(user) {
  const { ouvrirConversationAssistant } = await import('../assistant-conversations.js');
  const sortie = [];
  for (const c of comptesRendusPour(user?.email)) {
    const m = Records.get('MailRecu', c.id);
    let id = m?.compte_rendu?.conversation_id || null;
    if (!id) {
      const sujet = String(m?.objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim();
      // Le fil commence par le transfert, comme un message envoyé, puis l'assistant répond (23 nov. 2026, Jules).
      const r = ouvrirConversationAssistant(user, { titre: `Transfert · ${sujet || 'sans objet'}`, messages: [
        { role: 'user', contenu: messageDuTransfert(m), le: m?.date || c.le },
        { role: 'assistant', contenu: c.texte, le: c.le },
      ] });
      if (!r?.ok || !r.id) continue;
      id = r.id;
      Records.update('MailRecu', c.id, { compte_rendu: { ...m.compte_rendu, conversation_id: id } });
    }
    sortie.push({ ...c, conversation_id: id });
  }
  return sortie;
}

export function marquerVus(email, ids = []) {
  const e = min(email);
  let n = 0;
  for (const id of ids) {
    const m = Records.get('MailRecu', String(id));
    if (m?.compte_rendu?.pour !== e || m.compte_rendu.vu_le) continue;
    Records.update('MailRecu', m.id, { compte_rendu: { ...m.compte_rendu, vu_le: new Date().toISOString() } });
    n += 1;
  }
  return n;
}

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * L'outil de l'assistant : la personne corrige le compte de son dernier transfert (ou de celui qu'elle nomme). Le
 * nombre de fiches retenu passe dans `fiche_compte` (le compte de Statistiques), la remarque est gardée telle quelle
 * (`avis_fiche`) : c'est elle qui règle ensuite le repérage.
 */
export async function corrigerTransfert({ nombre = null, pas_une_fiche = false, remarque = '', objet = '' } = {}, user) {
  const e = min(user?.email);
  if (!e) return { ok: false, error: 'Personne connectée.' };
  const recents = Records.list('MailRecu')
    .filter((m) => m.compte_rendu?.pour === e && Date.now() - Date.parse(m.compte_rendu.le || 0) < 14 * 86400000)
    .sort((a, b) => String(b.compte_rendu.le).localeCompare(String(a.compte_rendu.le)));
  if (!recents.length) return { ok: false, error: "Je ne trouve pas de transfert récent de votre part à corriger." };
  const cherche = sansAccent(objet).split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  const mail = cherche.length ? recents.find((m) => cherche.every((x) => sansAccent(`${m.objet} ${m.compte_rendu.texte}`).includes(x))) || null : recents[0];
  if (!mail) return { ok: false, error: `Aucun de vos transferts récents ne parle de « ${objet} ».`, transferts: recents.slice(0, 5).map((m) => m.objet) };
  const { corrigerCompte } = await import('../deal/justesse-compte.js');
  const { fiches } = await import('../prospection/index.js');
  const ligne = (await fiches()).find((f) => f.id === `mail:${mail.id}`);
  const corps = pas_une_fiche ? { pas_fiche: true } : Number.isInteger(Number(nombre)) && Number(nombre) >= 0 ? { biens: Number(nombre) } : {};
  const avis = String(remarque || '').trim() ? [...(mail.avis_fiche || []), { texte: String(remarque).trim().slice(0, 2000), par: e, le: new Date().toISOString() }] : mail.avis_fiche || [];
  const patch = { avis_fiche: avis };
  if (Object.keys(corps).length) patch.fiche_compte = corrigerCompte(mail.fiche_compte || {}, corps, { auto: ligne ? ligne.biens : null, par: e });
  Records.update('MailRecu', mail.id, patch);
  return {
    ok: true,
    transfert: String(mail.objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim(),
    retenu: pas_une_fiche ? 'pas une fiche' : corps.biens != null ? `${corps.biens} fiche${corps.biens > 1 ? 's' : ''}` : 'remarque gardée',
    consigne: 'Confirme en une phrase ce qui est corrigé, sans plus.',
  };
}

/**
 * Le rattrapage (23 nov. 2026, Jules : « il faut que ça fasse le truc pour le dernier mail ») : les transferts de
 * l'équipe à sourcing@ déjà traités avant que le compte rendu existe (ou pendant un redémarrage) reçoivent le leur, bâti
 * sur ce qui a été rentré (biens en Mémoire, renvois, dossiers). Seulement ceux qui ont donné quelque chose : un
 * transfert encore en cours de lecture attend sa fin normale. Rejouer ne double rien.
 */
export function rattraperComptesRendus({ heures = 48, maintenant = Date.now(), boite = (process.env.AK_COMPTE || 'sourcing@klocka.immo') } = {}) {
  const vu = (b) => ({ nom: [b?.adresse?.rue, b?.ville].filter(Boolean).join(', ') || null, prix: b?.prix || null, loyer: b?.loyer_annuel || null });
  let n = 0;
  for (const m of Records.list('MailRecu')) {
    if (min(m.compte) !== min(boite) || !m.interne || m.compte_rendu || !m.de_email) continue;
    if (maintenant - Date.parse(m.date || 0) > heures * 3600000) continue;
    const biens = (m.memoire_ids || []).map((id) => Records.get('BienMemoire', id)).filter(Boolean).map(vu);
    const deja = (m.memoire_deja_ids || []).map((id) => Records.get('BienMemoire', id)).filter(Boolean).map(vu);
    const dossiers = [...new Set([m.deal_id, ...(m.deal_ids || [])].filter(Boolean))].map((id) => Records.findBy('Deal', 'deal_id', id)).filter(Boolean);
    if (!biens.length && !deja.length && !dossiers.length) continue;
    const memoire = { fait: 'memoire', biens, deja_biens: deja, erreurs: [] };
    const r = dossiers.length
      ? { fait: 'fiche', nom: dossiers[0].nom || dossiers[0].lots?.[0]?.synthese?.titre || 'nouveau bien', n_dossiers: dossiers.length, memoire_dabord: memoire }
      : memoire;
    poserCompteRendu(m, { pour: m.de_email, r, lu: {} });
    n += 1;
  }
  return n;
}
