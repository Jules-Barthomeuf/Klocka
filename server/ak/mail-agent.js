// Le mail à l'agent immobilier d'un dossier, depuis le chat. AK le rédige,
// le montre en entier, et il ne part que sur un « envoie » de quelqu'un qui
// l'a lu. Ce qui part est exactement ce qui a été montré : le brouillon est
// gardé tel quel (AkBrouillon) et c'est lui qu'on envoie, jamais une
// reformulation du modèle. L'envoi passe par sendMail, comme depuis la
// fiche : le suivi du dossier, son statut et Monday avancent pareil.

import { Records } from '../db.js';

const ENTITE = 'AkBrouillon';
const VALIDITE_MS = 24 * 3600000;

export const INTENTIONS_AGENT = ['refus', 'demande_documents', 'relance', 'abandon', 'presentation_client'];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Un mail envoyé ne se rattrape pas. « envoie le à jules@… plutôt » a fait
// partir un brouillon chez l'agent parce que le mot « envoie » y était. Seul
// un ordre d'envoi nu fait partir le mail ; tout ce qui dit autre chose en
// plus (une adresse, « plutôt », « mais », une retouche) ne l'envoie pas.
const POLITESSE = "(?:ok|oui|ouais|vas[- ]?y|go|c'?est bon|parfait|nickel|top|bon|allez|super)";
const ORDRE = "(?:envoie|envoies|envoi|envoyer|balance|balances)";
const ENVOI_NU = new RegExp(`^(?:${POLITESSE}[ ,!.]*)*${ORDRE}(?:[- ](?:le|la|les|lui|leur))?(?:[ ,]+(?:stp|svp|merci|maintenant|direct|go))*[ !.]*$`);

/** Pure : un ordre d'envoi, et rien d'autre : « envoie », « ok envoie », « vas-y envoie-le stp ». */
export function estUnEnvoi(texte) {
  const t = norm(texte).replace(/[’]/g, "'");
  if (!t || t.length > 40) return false;
  return ENVOI_NU.test(t);
}

/**
 * Pure : un changement de destinataire demandé pour le brouillon qui attend.
 * Une adresse dans le message, ou « envoie-le moi » (l'adresse de la
 * personne qui parle). Rend l'adresse, ou null.
 */
export function nouveauDestinataire(texte, { moi = null } = {}) {
  const t = String(texte || '');
  const adresse = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (adresse) return adresse[0].toLowerCase();
  if (moi && /\b(envoie|envoies|envoyer|mets?|adresse)[- ](le|la|les)?[- ]?(moi|à moi|a moi)\b|\bà moi plutôt\b|\ba moi plutot\b/i.test(norm(t))) return String(moi).toLowerCase();
  return null;
}

/** Change le destinataire du brouillon qui attend, sans rien envoyer. Rend le brouillon à reposter. */
export function changerDestinataire(b, adresse) {
  Records.update(ENTITE, b.id, { a: adresse });
  return { ...b, a: adresse };
}

/** Pure : le brouillon tel qu'il s'affiche dans le chat. */
export function afficher(b, titre = null) {
  return [
    `le mail pour ${titre || 'le dossier'} :`,
    `à : ${b.a}`,
    `de : ${b.de || 'ta boîte par défaut'}`,
    `objet : ${b.objet}`,
    '',
    b.corps,
    '',
    'dis-moi « envoie » et il part, ou ce qu’il faut changer',
  ].join('\n');
}

/** Pure : ce que l'envoi change au dossier, en fin de phrase. */
export function suiteDeLEnvoi(intention) {
  if (intention === 'refus' || intention === 'abandon') return ', le dossier passe en abandonné';
  if (intention === 'demande_documents') return ', le dossier attend les docs et la relance est calée';
  return '';
}

/** La boîte qui envoie : celle qui a reçu la fiche si on y a droit, sinon la boîte par défaut. */
async function expediteur(deal, user) {
  const { listAccounts } = await import('../email.js');
  const comptes = listAccounts(user?.email);
  const source = deal?.source_mail?.mail_recu_id ? Records.get('MailRecu', deal.source_mail.mail_recu_id)?.compte : null;
  const choisi = (source && comptes.find((c) => c.email === source)) || comptes.find((c) => c.par_defaut) || comptes[0] || null;
  return choisi?.email || null;
}

/**
 * Rédige le mail et le garde en attente dans l'espace. `objet` et `corps`
 * donnés : on les prend tels quels (une retouche demandée dans le chat).
 * Un nouveau brouillon remplace celui qui attendait dans le même espace.
 */
export async function redigerPourLAgent({ deal_id, intention = 'refus', raisons = null, objet = null, corps = null, a = null }, { user = null, espace = null, pour = null } = {}) {
  if (!INTENTIONS_AGENT.includes(intention)) return { ok: false, error: `Intention inconnue : ${intention}.` };
  const { obtenirDossier, lotOuVide } = await import('../deal/index.js');
  const dossier = obtenirDossier(deal_id);
  if (!dossier) return { ok: false, error: 'Dossier introuvable.' };
  const destinataire = String(a || dossier.contact_agent_email || '').trim();
  if (!destinataire.includes('@')) return { ok: false, error: "Pas de mail d'agent sur ce dossier : demande-le, puis rappelle mail_agent avec a." };

  let mail = objet && corps ? { objet, corps } : null;
  if (!mail) {
    const { redigerMailIntention } = await import('../deal/mails-cycle.js');
    const { engagementsOuverts } = await import('../deal/engagements.js');
    mail = await redigerMailIntention(lotOuVide(dossier, 0), intention, {
      signature: user?.full_name || user?.email,
      raisons,
      sansIA: !!dossier.test,
      engagements: engagementsOuverts(deal_id),
    });
  }
  if (!mail?.objet || !mail?.corps) return { ok: false, error: 'Rédaction impossible.' };

  const brut = Records.findBy('Deal', 'deal_id', deal_id);
  const de = await expediteur(brut, user);
  const maintenant = new Date().toISOString();
  for (const b of Records.filter(ENTITE, { espace, etat: 'attente' })) Records.update(ENTITE, b.id, { etat: 'remplace', ferme_le: maintenant });
  const b = Records.create(ENTITE, { espace, pour: pour?.nom || null, deal_id, intention, a: destinataire, de, objet: mail.objet, corps: mail.corps, etat: 'attente', cree_le: maintenant });
  return { ok: true, brouillon: b, titre: dossier.nom || dossier.titre, texte: afficher(b, dossier.nom || dossier.titre) };
}

/** Le brouillon qui attend un « envoie » dans cet espace, s'il est encore frais. */
export function brouillonEnAttente(espace, maintenant = Date.now()) {
  return Records.filter(ENTITE, { espace, etat: 'attente' })
    .filter((b) => maintenant - Date.parse(b.cree_le) < VALIDITE_MS)
    .sort((x, y) => String(y.cree_le).localeCompare(String(x.cree_le)))[0] || null;
}

/** Envoie le brouillon, tel qu'il a été montré. Rend la phrase à poster. */
export async function envoyerBrouillon(b, user) {
  const { functions } = await import('../functions.js');
  // Envoyé à quelqu'un d'autre que l'agent du dossier (à soi, pour relire) :
  // un simple mail, le dossier ne bouge pas, aucune relance ne se cale.
  const deal = b.deal_id ? Records.findBy('Deal', 'deal_id', b.deal_id) : null;
  const versAgent = !!deal?.contact_agent_email && String(deal.contact_agent_email).toLowerCase() === String(b.a).toLowerCase();
  let r;
  try {
    r = await functions.sendMail({ from: b.de || undefined, to: b.a, subject: b.objet, body: b.corps, ...(versAgent ? { deal_id: b.deal_id, intention: b.intention } : {}) }, { user });
  } catch (e) {
    r = { success: false, error: e?.message || String(e) };
  }
  const maintenant = new Date().toISOString();
  if (r?.success) {
    Records.update(ENTITE, b.id, { etat: 'envoye', ferme_le: maintenant });
    return `c'est parti, mail envoyé à ${b.a}${b.de ? ` depuis ${b.de}` : ''}${versAgent ? suiteDeLEnvoi(b.intention) : b.deal_id ? ", ce n'est pas l'agent du dossier donc le dossier ne bouge pas" : ''}`;
  }
  if (r?.simulated) {
    Records.update(ENTITE, b.id, { etat: 'simule', ferme_le: maintenant });
    return `rien n'est parti (${r.test ? 'dossier de test' : 'aucune boîte connectée pour toi'})${versAgent ? `, mais le dossier avance comme si${suiteDeLEnvoi(b.intention)}` : ''}`;
  }
  return `dsl, l'envoi a raté : ${r?.error || 'sans détail'}. le brouillon attend toujours, redis « envoie » quand c'est réglé`;
}

// --- Le mail libre : à un contact, sans dossier ------------------------------
//
// « fais un mail à Jérôme Seviathan pour lui dire qui on est et demander la
// fiche » : il n'y a pas encore de dossier, seulement une adresse. Le mail
// de présentation est écrit par le code, dans les mots que Jules a fixés
// (objet « Klocka », le site, le mandat de recherche) : le modèle ne le
// réinvente pas à chaque fois. Un autre mail libre est rédigé par le modèle.
// Dans les deux cas, le brouillon attend dans l'espace comme celui d'un
// dossier : il se montre en entier, se retouche, et part sur « envoie ».

/** Pure : « Monsieur Seviathan », « Madame Martin », ou « Bonjour, » quand le prénom ne tranche pas. */
export function formuleDAppel(nom, genre = null) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  const famille = mots.length >= 2 ? mots.slice(1).join(' ') : null;
  if (!famille || !genre) return 'Bonjour,';
  const joli = famille.split(/([ -])/).map((m) => (m.length > 1 ? m.charAt(0).toUpperCase() + m.slice(1).toLowerCase() : m)).join('');
  return `Bonjour ${genre === 'femme' ? 'Madame' : 'Monsieur'} ${joli},`;
}

/**
 * Pure : le mail de présentation de Klocka, avec la demande de fiche.
 * `bien` : ce qu'on cherche ou ce dont on a entendu parler (« murs
 * commerciaux occupés », « le local de la rue X »), facultatif.
 */
export function mailPresentation({ nom = null, genre = null, bien = null, signature = null } = {}) {
  const ce = String(bien || '').trim().replace(/[.\s]+$/, '');
  return {
    objet: 'Klocka',
    corps: [
      formuleDAppel(nom, genre),
      '',
      "Je me permets de vous contacter au nom de Klocka (klocka.immo), société spécialisée dans l'acquisition de murs commerciaux pour le compte d'investisseurs.",
      '',
      `Nous disposons d'un mandat de recherche et ${ce ? `serions intéressés par ${ce.match(/^(les|le|la|l'|des|vos|votre|un|une)\b/i) ? ce : `les ${ce}`}` : 'recherchons activement des murs commerciaux'}. Pourriez-vous nous transmettre la fiche commerciale correspondante, avec les informations habituelles : prix, loyer, surface, locataire et bail en cours ?`,
      '',
      'Je vous remercie par avance pour votre retour.',
      '',
      'Cordialement,',
      signature || 'Klocka',
      'Klocka',
      'klocka.immo',
    ].join('\n'),
  };
}

/** Garde le brouillon comme le seul qui attend dans l'espace. */
function garder(espace, pour, champs) {
  const maintenant = new Date().toISOString();
  for (const b of Records.filter(ENTITE, { espace, etat: 'attente' })) Records.update(ENTITE, b.id, { etat: 'remplace', ferme_le: maintenant });
  return Records.create(ENTITE, { espace, pour: pour?.nom || null, etat: 'attente', cree_le: maintenant, ...champs });
}

/** La boîte par défaut de la personne, pour l'afficher et envoyer. */
async function boiteDe(user) {
  const { listAccounts } = await import('../email.js');
  const comptes = listAccounts(user?.email);
  return (comptes.find((c) => c.par_defaut) || comptes[0] || null)?.email || null;
}

/**
 * Rédige un mail libre à une adresse et le garde en attente. `objectif` :
 * « presentation » (qui on est, le mandat de recherche, la demande de fiche)
 * ou « autre » (le modèle rédige d'après `consigne`).
 */
export async function redigerMailLibre({ a, nom = null, objectif = 'presentation', bien = null, consigne = null }, { user = null, espace = null, pour = null } = {}) {
  const destinataire = String(a || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(destinataire)) return { ok: false, error: "Il faut l'adresse mail du destinataire : demande-la en une ligne." };
  const signature = user?.full_name || null;
  let mail;
  if (objectif === 'presentation') {
    const { genreDuPrenom } = await import('./outils.js');
    mail = mailPresentation({ nom, genre: genreDuPrenom(nom), bien, signature });
  } else {
    if (!String(consigne || '').trim()) return { ok: false, error: 'Dis ce que le mail doit dire.' };
    const { invokeLLM } = await import('../llm.js');
    mail = await invokeLLM({
      prompt: `Tu rédiges un mail court de ${signature || "quelqu'un de Klocka"}, de Klocka (klocka.immo, acquisition de murs commerciaux pour le compte d'investisseurs), à ${nom || destinataire}.

Ce que le mail doit dire, dans les mots de la personne : ${consigne}

Règles : français, vouvoiement, courtois et direct, texte brut sans markdown, pas de formule creuse. L'objet est court. Signe « ${signature || 'Klocka'} », puis « Klocka » et « klocka.immo » sur deux lignes.`,
      response_json_schema: { type: 'object', properties: { objet: { type: 'string' }, corps: { type: 'string' } }, required: ['objet', 'corps'] },
    });
  }
  if (!mail?.objet || !mail?.corps) return { ok: false, error: 'Rédaction impossible.' };
  const de = await boiteDe(user);
  const b = garder(espace, pour, { deal_id: null, intention: objectif, a: destinataire, destinataire_nom: nom || null, de, objet: mail.objet, corps: mail.corps });
  return { ok: true, brouillon: b, texte: afficher(b, nom || destinataire) };
}

/**
 * Retouche le brouillon qui attend dans l'espace, d'après une consigne
 * dite en français (« objet Klocka pas Klocka Immo, mets le site, dis qu'on a
 * un mandat de recherche »). Le modèle réécrit le mail en ne touchant qu'à
 * ce qu'on lui demande ; le nouveau brouillon remplace l'ancien et se
 * montre en entier. Rien ne part.
 */
export async function retoucherBrouillon(espace, consigne, { pour = null } = {}) {
  const b = brouillonEnAttente(espace);
  if (!b) return { ok: false, error: "Aucun brouillon n'attend ici : il faut d'abord rédiger le mail." };
  if (!String(consigne || '').trim()) return { ok: false, error: 'Dis ce qu’il faut changer.' };
  const { invokeLLM } = await import('../llm.js');
  const r = await invokeLLM({
    prompt: `Voici un mail en brouillon, et une retouche demandée par la personne qui va l'envoyer. Applique la retouche, toute la retouche, et rien d'autre : ce qui n'est pas visé reste mot pour mot. Si la retouche donne un objet, un mot ou une phrase, reprends-les exactement. Texte brut, pas de markdown.

Objet actuel : ${b.objet}

Corps actuel :
${b.corps}

Retouche demandée : ${consigne}`,
    response_json_schema: { type: 'object', properties: { objet: { type: 'string' }, corps: { type: 'string' }, fait: { type: 'string', description: 'ce qui a changé, en quelques mots' } }, required: ['objet', 'corps'] },
  });
  if (!r?.objet || !r?.corps) return { ok: false, error: 'Retouche impossible.' };
  const { id, cree_le, ferme_le, etat, created_date, updated_date, created_by, ...garde } = b; // eslint-disable-line no-unused-vars
  const nouveau = garder(espace, pour, { ...garde, objet: r.objet, corps: r.corps });
  const deal = nouveau.deal_id ? Records.findBy('Deal', 'deal_id', nouveau.deal_id) : null;
  return { ok: true, brouillon: nouveau, fait: r.fait || null, texte: afficher(nouveau, deal?.nom || nouveau.destinataire_nom || nouveau.a) };
}

/** Le brouillon qui attend, tel qu'il s'affiche : pour « montre-le moi ». */
export function montrerBrouillon(espace) {
  const b = brouillonEnAttente(espace);
  if (!b) return null;
  const deal = b.deal_id ? Records.findBy('Deal', 'deal_id', b.deal_id) : null;
  return afficher(b, deal?.nom || b.destinataire_nom || b.a);
}

/** Pure : « montre-le moi », « tu l'as mis où ? », « je le vois pas » : on veut revoir le brouillon. */
export function veutLeVoir(texte) {
  const t = norm(texte).replace(/[’]/g, "'");
  if (!t || t.length > 70) return false;
  return /\b(montre|montres|remontre|affiche|fais voir|redonne|renvoie[- ]le moi ici)\b|\bou (est|il est|tu l'as|l'as[- ]tu|ca)\b|\b(mis|mise|mets?) ou\b|\b(le|la) vois pas\b|\bvois rien\b|\bmais ou\b|\bc'est ou\b/.test(t);
}
