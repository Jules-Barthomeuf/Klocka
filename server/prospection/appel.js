// L'appel, et ce qu'AK propose après.
//
// La personne choisit un agent (il se verrouille à son nom), lance le micro,
// appelle. À la fin, l'enregistrement est transcrit (Gemini), puis AK lit la
// conversation avec la fiche de l'agent et nos critères : il rend un résumé,
// l'issue de l'appel, ce qu'il faut ajouter à la fiche, et une liste de
// propositions (le mail à envoyer, la prochaine relance, la relance du mail,
// le statut). La personne coche, corrige, valide. Sans enregistrement, elle
// raconte l'appel en une phrase (ou le dicte) et AK fait pareil.
//
// Rien ne part vers l'extérieur sans un clic : un mail proposé attend dans
// « À envoyer » tant qu'on ne l'a pas envoyé.

import { Records } from '../db.js';
import * as R from './regles.js';
import { agentDe, majAgent, journal, liberer, agents as tousLesAgents } from './carnet.js';
import { reglages } from './reglages.js';
import { mailDeCriteres, mailDemandeFiche, mailSansReponse, smsSansReponse, prenomDeLAgent } from './mails.js';

const ENTITE = 'AppelAgent';

// ---------------------------------------------------------------------------
// L'enregistrement
// ---------------------------------------------------------------------------

/** Pure : un WAV découpé en morceaux de `secondes` au plus, chacun avec son en-tête. */
export function decouperWav(buffer, secondes = 240) {
  const b = Buffer.from(buffer);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') return [b];
  // Le bloc « data » : 44 octets dans un WAV simple, mais on le cherche.
  let p = 12;
  let debut = 44;
  let taille = b.length - 44;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const t = b.readUInt32LE(p + 4);
    if (id === 'data') { debut = p + 8; taille = Math.min(t, b.length - debut); break; }
    p += 8 + t;
  }
  const octetsParSeconde = b.readUInt32LE(28) || 16000;
  const bloc = b.readUInt16LE(32) || 2;
  const parMorceau = Math.max(bloc, Math.floor((octetsParSeconde * secondes) / bloc) * bloc);
  const morceaux = [];
  for (let o = 0; o < taille; o += parMorceau) {
    const data = b.subarray(debut + o, debut + Math.min(taille, o + parMorceau));
    const entete = Buffer.from(b.subarray(0, 44));
    entete.write('data', 36, 'ascii');
    entete.writeUInt32LE(36 + data.length, 4);
    entete.writeUInt32LE(data.length, 40);
    morceaux.push(Buffer.concat([entete, data]));
  }
  return morceaux.length ? morceaux : [b];
}

/** Transcrit l'appel, morceau par morceau (quatre minutes chacun). */
export async function transcrire(buffer) {
  const { transcrireAudio } = await import('../llm.js');
  const textes = [];
  for (const m of decouperWav(buffer)) textes.push(await transcrireAudio({ buffer: m, mimetype: 'audio/wav' }));
  return textes.filter(Boolean).join('\n').trim();
}

// ---------------------------------------------------------------------------
// La lecture de l'appel
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: "Deux phrases au plus : ce que l'agent a, ce qu'il cherche, ce qu'il a promis." },
    issue: { type: 'string', enum: Object.keys(R.ISSUES) },
    date_dite: { type: 'string', description: "AAAA-MM-JJ : la date donnée par l'agent (mandat attendu, rappel demandé), vide sinon" },
    secteurs: { type: 'array', items: { type: 'string' }, description: 'villes ou quartiers où il travaille' },
    mandats: { type: 'array', items: { type: 'string' }, description: 'mandats à venir, avec leur date si dite' },
    biens: { type: 'array', items: { type: 'string' }, description: 'biens dont il a parlé : type, ville, prix, loyer' },
    demandes: { type: 'array', items: { type: 'string' }, description: 'ce qu\'il nous demande' },
    email_donne: { type: 'string', description: "une adresse mail donnée pendant l'appel, vide sinon" },
    autre_contact: { type: 'string', description: "un autre interlocuteur de l'agence cité (nom, numéro), vide sinon" },
    mail_objet: { type: 'string', description: "l'objet du mail à lui envoyer, vide si aucun mail n'a de sens" },
    mail_corps: { type: 'string', description: 'le corps du mail, vouvoiement, court, sans signature (elle est ajoutée)' },
  },
  required: ['resume', 'issue'],
};

const lignesJournal = (a) => (a.journal || []).slice(0, 6).map((j) => `${String(j.le).slice(0, 10)} ${j.type} : ${j.texte}`).join('\n') || 'aucun échange';

/** Lit l'appel (transcription ou récit) et rend ce qu'AK en retient. */
async function lire(a, texte, { par, maintenant }) {
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  if (!llmEnabled) return { resume: texte.slice(0, 300), issue: 'autre' };
  const r = reglages();
  const u = Records.filter('User', { email: par })[0];
  return invokeLLM({
    prompt: `Tu es l'alternant de Klocka (investissement en murs commerciaux). ${u?.full_name || par} vient d'appeler un agent immobilier. Lis l'appel et dis ce qu'il en ressort, en français, sans rien inventer.

L'issue, une seule :
- pas_de_reponse : personne n'a décroché, messagerie ;
- pas_de_murs : il n'a rien pour nous en ce moment ;
- a_des_murs : il a des murs qui peuvent nous intéresser ;
- veut_mail : il veut d'abord un mail avant d'aller plus loin ;
- pas_interesse : il ne veut pas travailler avec nous ;
- invalide : mauvais numéro, la personne n'est plus là ;
- autre.

Le mail, s'il a un sens : a_des_murs, lui demander la fiche des biens cités ; veut_mail ou pas_de_murs, nous présenter avec nos critères ; en rappelant ce qui s'est dit. Écrit comme ${u?.full_name?.split(' ')[0] || "l'analyste"} l'écrirait, vouvoiement, cinq à huit lignes, sans signature.

Nos critères (n'en invente aucun : cite seulement ceux-ci ; s'il n'y en a pas, dis seulement que nous achetons des murs commerciaux loués) :
${r.criteres || '(pas encore écrits)'}

L'agent : ${a.nom}${a.agence ? `, ${a.agence}` : ''}${a.ville ? `, ${a.ville}` : ''}. Secteurs connus : ${(a.secteurs || []).join(', ') || 'aucun'}. Ses annonces Equimmox : ${a.annonces || 0}.
Ce qu'on sait déjà :
${lignesJournal(a)}

Aujourd'hui : ${R.jourDe(maintenant)}.

L'appel :
${texte}`,
    response_json_schema: SCHEMA,
  });
}


/**
 * Pure : les propositions après l'appel, à partir de ce qu'AK a lu et des
 * règles. Chaque proposition est cochée d'avance ; la personne décoche.
 */
export function propositions(a, lu, { maintenant = new Date(), criteres = '', objet_criteres, autres_de_l_agence = [] } = {}) {
  const issue = lu.issue && R.ISSUES[lu.issue] ? lu.issue : 'autre';
  const suite = R.suiteDeLIssue(issue, { tentatives: a.tentatives || 0, maintenant, date_dite: lu.date_dite || null });
  const out = [];
  const a_email = R.normEmail(lu.email_donne) || a.emails?.[0] || null;
  out.push({ id: 'statut', type: 'statut', titre: `Noter l'appel : ${R.ISSUES[issue].toLowerCase()}${suite.statut !== a.statut ? `, statut « ${R.STATUTS[suite.statut]} »` : ''}`, issue, statut: suite.statut, tentatives: suite.tentatives });
  for (const genre of suite.mails) {
    let mail;
    if (lu.mail_objet && lu.mail_corps && genre !== 'sans_reponse') {
      const prenom = prenomDeLAgent(a.nom);
      mail = { objet: lu.mail_objet, corps: `${/^bonjour/i.test(lu.mail_corps.trim()) ? '' : `Bonjour${prenom ? ` ${prenom}` : ''},\n\n`}${lu.mail_corps.trim()}\n\nBien à vous,\n{signature}` };
    } else if (genre === 'presentation') mail = mailDeCriteres(a, { criteres, objet: objet_criteres });
    else if (genre === 'demande_fiche') mail = mailDemandeFiche(a, lu.biens || []);
    else mail = mailSansReponse(a);
    out.push({ id: 'mail', type: 'mail', titre: `Lui envoyer « ${mail.objet} »${a_email ? '' : ' (il manque son adresse)'}`, a: a_email, ...mail, genre, avec_relance: !!suite.relance_mail_jours });
    if (suite.relance_mail_jours) out.push({ id: 'relance_mail', type: 'relance_mail', titre: `Préparer la relance de ce mail, ${suite.relance_mail_jours} jours après l'envoi (tu la valideras)`, jours: suite.relance_mail_jours });
  }
  if (suite.sms && a.telephones?.length) out.push({ id: 'sms', type: 'sms', titre: `Préparer un SMS pour ${a.telephones[0]}`, a: a.telephones[0], corps: smsSansReponse(a) });
  if (suite.prochaine) out.push({ id: 'relance', type: 'relance', titre: `Le rappeler le ${R.dateCourte(suite.prochaine.le)} : ${suite.prochaine.quoi}`, prochaine: suite.prochaine });
  const infos = {
    secteurs: (lu.secteurs || []).filter((s) => !(a.secteurs || []).map(R.norm).includes(R.norm(s))),
    notes: [...(lu.mandats || []).map((m) => `mandat à venir : ${m}`), ...(lu.biens || []).map((b) => `bien : ${b}`), ...(lu.demandes || []).map((d) => `demande : ${d}`)],
    email: R.normEmail(lu.email_donne) && !(a.emails || []).includes(R.normEmail(lu.email_donne)) ? R.normEmail(lu.email_donne) : null,
  };
  if (infos.secteurs.length || infos.notes.length || infos.email) {
    out.push({ id: 'fiche', type: 'fiche', titre: `Ajouter à sa fiche : ${[infos.secteurs.length ? `secteurs ${infos.secteurs.join(', ')}` : null, infos.email ? `mail ${infos.email}` : null, ...infos.notes].filter(Boolean).join(' ; ')}`, infos });
  }
  if (suite.autre_contact) {
    if (lu.autre_contact) out.push({ id: 'autre_contact', type: 'note', titre: `Autre contact cité : ${lu.autre_contact}`, texte: `autre contact cité : ${lu.autre_contact}` });
    for (const x of autres_de_l_agence.slice(0, 2)) out.push({ id: `autre_${x.id}`, type: 'autre_agent', titre: `Appeler plutôt ${x.nom}, même agence (${x.telephones?.[0] || x.emails?.[0] || ''})`, agent_id: x.id });
  }
  return { issue, propositions: out };
}

/** Pure : le message d'AK après l'appel. */
export function messageDAK(a, lu, props) {
  const lignes = props.filter((p) => p.type !== 'statut').map((p, i) => `${i + 1}. ${p.titre}`);
  return [
    `Appel avec ${a.nom}${a.agence && a.agence !== a.nom ? ` (${a.agence})` : ''} : ${lu.resume || R.ISSUES[lu.issue] || 'noté'}`,
    lignes.length ? 'Voici ce que je te propose :' : null,
    ...lignes,
    lignes.length ? 'Réponds-moi « 1 2 3 », « tout », « tout sauf 2 » ou « rien ». Un mail, je te le montre en entier avant qu\'il parte.' : null,
  ].filter(Boolean).join('\n');
}

/**
 * L'appel terminé : transcription (ou récit), lecture par AK, propositions.
 * @param {{agent_id, audio?: Buffer, recit?: string, sans_reponse?: boolean, duree_s?: number, par: string}} x
 */
export async function analyserAppel({ agent_id, audio = null, recit = null, sans_reponse = false, duree_s = null, par, maintenant = new Date() }) {
  const a = agentDe(agent_id);
  if (!a) return { ok: false, error: 'Agent introuvable.' };
  let transcription = null;
  if (audio?.length) {
    try { transcription = await transcrire(audio); } catch (e) { return { ok: false, error: `Transcription impossible : ${e?.message || e}. Raconte l'appel en une phrase à la place.` }; }
  }
  const texte = [transcription ? `Transcription :\n${transcription}` : null, recit ? `Ce qu'en dit ${par} :\n${recit}` : null].filter(Boolean).join('\n\n');
  // Personne n'a décroché, ou l'enregistrement est vide : pas besoin du modèle.
  const lu = sans_reponse || !texte.trim() || (transcription != null && transcription.length < 40 && !recit)
    ? { resume: 'pas de réponse.', issue: 'pas_de_reponse' }
    : await lire(a, texte, { par, maintenant });
  const r = reglages();
  const autres = tousLesAgents().filter((x) => x.id !== a.id && a.agence && R.norm(x.agence) === R.norm(a.agence) && x.statut !== 'archive' && x.telephones?.length);
  const { issue, propositions: props } = propositions(a, lu, { maintenant, criteres: r.criteres, objet_criteres: r.objet_criteres, autres_de_l_agence: autres });
  const message = messageDAK(a, { ...lu, issue }, props);
  const appel = Records.create(ENTITE, {
    agent_id: a.id, agent: a.nom, par, le: new Date(maintenant).toISOString(), duree_s,
    transcription, recit, resume: lu.resume || null, issue, date_dite: lu.date_dite || null,
    propositions: props, message, etat: 'a_valider',
  });
  // Le message part aussi dans le chat privé de la personne : c'est un message
  // interne, AK l'y dépose au prochain passage.
  const { direEnPrive } = await import('./messages.js');
  direEnPrive(par, message, { appel_id: appel.id });
  return { ok: true, appel };
}

/**
 * Ce que la personne a choisi : la fiche mise à jour, la relance posée, le
 * mail mis dans « À envoyer » (ou envoyé tout de suite si elle a cliqué
 * Envoyer), le verrou rendu.
 * @param {{appel_id, choix: string[], mail?: {a, objet, corps}, envoyer?: boolean, user}} x
 */
export async function validerAppel({ appel_id, choix = [], mail = null, sms = null, envoyer = false, user, maintenant = new Date() }) {
  const appel = Records.get(ENTITE, appel_id);
  if (!appel || appel.etat !== 'a_valider') return { ok: false, error: 'Appel introuvable ou déjà validé.' };
  const a = agentDe(appel.agent_id);
  if (!a) return { ok: false, error: 'Agent introuvable.' };
  const par = user?.email || appel.par;
  const pris = new Set(choix);
  const props = appel.propositions.filter((p) => pris.has(p.id));
  const iso = new Date(maintenant).toISOString();
  const champs = { resume_dernier_appel: appel.resume, dernier_essai_le: iso };
  const faits = [];
  const statut = props.find((p) => p.type === 'statut');
  if (statut) {
    champs.statut = statut.statut;
    champs.tentatives = statut.tentatives;
    if (statut.issue !== 'pas_de_reponse') champs.dernier_contact_le = iso;
    // Le premier de l'équipe qui joint un agent en devient le référent.
    if (!a.referent && !['pas_de_reponse', 'invalide'].includes(statut.issue)) { champs.referent = par; faits.push('tu es son référent'); }
  }
  const relance = props.find((p) => p.type === 'relance');
  champs.prochaine = relance ? relance.prochaine : statut ? null : a.prochaine;
  if (relance) faits.push(`rappel le ${R.dateCourte(relance.prochaine.le)}`);
  const fiche = props.find((p) => p.type === 'fiche');
  if (fiche) {
    champs.secteurs = [...new Set([...(a.secteurs || []), ...fiche.infos.secteurs])];
    if (fiche.infos.email) champs.emails = [...new Set([...(a.emails || []), fiche.infos.email])];
    if (fiche.infos.notes.length) champs.remarques = [fiche.infos.notes.join(' ; '), a.remarques].filter(Boolean).join(' / ').slice(0, 2000);
    faits.push('fiche complétée');
  }
  majAgent(a.id, champs);
  journal(a.id, { type: 'appel', texte: `${R.ISSUES[appel.issue]}. ${appel.resume || ''}`, par, le: appel.le });
  for (const p of props.filter((x) => x.type === 'note')) journal(a.id, { type: 'note', texte: p.texte, par });
  for (const p of props.filter((x) => x.type === 'autre_agent')) {
    majAgent(p.agent_id, { prochaine: { quoi: `remplace ${a.nom} (mauvais numéro)`, le: R.jourDe(maintenant) } });
    faits.push('autre contact mis dans la liste');
  }

  const { mettreEnAttente, envoyerMails } = await import('./mails.js');
  const pm = props.find((p) => p.type === 'mail');
  let envoi = null;
  let mailId = null;
  let smsId = null;
  if (pm) {
    const m = { ...pm, ...(mail || {}) };
    const cree = mettreEnAttente({ genre: 'agent', sous_genre: pm.genre, agent_id: a.id, nom: a.nom, agence: a.agence, a: R.normEmail(m.a), objet: m.objet, corps: m.corps, avec_relance: pris.has('relance_mail') ? pm.avec_relance || true : false, appel_id });
    mailId = cree.id;
    if (envoyer && cree.a) {
      envoi = await envoyerMails([cree.id], user);
      faits.push(envoi.envoyes ? 'mail envoyé' : envoi.simules ? 'mail simulé (aucune boîte connectée)' : `mail non parti : ${envoi.resultats?.[0]?.error || 'erreur'}`);
    } else faits.push('mail prêt dans « À envoyer »');
  }
  const ps = props.find((p) => p.type === 'sms');
  if (ps) {
    smsId = mettreEnAttente({ genre: 'sms', agent_id: a.id, nom: a.nom, a: ps.a, objet: 'SMS', corps: sms?.corps || ps.corps, appel_id }).id;
    faits.push('SMS prêt dans « À envoyer »');
  }
  Records.update(ENTITE, appel.id, { etat: 'valide', choix: [...pris], valide_le: iso, valide_par: par });
  liberer(a.id);
  return { ok: true, faits, envoi, mail_id: mailId, sms_id: smsId, agent: agentDe(a.id) };
}

export const appels = () => Records.list(ENTITE);
export const appelAValider = (par) => Records.filter(ENTITE, { etat: 'a_valider', par }).sort((x, y) => String(y.le).localeCompare(String(x.le)));
