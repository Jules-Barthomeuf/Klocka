// La suite d'un appel, dans Google Chat. Après l'appel, l'assistant envoie en
// privé le résumé et ses propositions numérotées ; on lui répond « 1 2 3 »,
// « tout », « tout sauf 2 » ou « rien », et il le fait. Un mail choisi n'est
// pas envoyé : il est montré en entier, et il part sur un « envoie », comme
// les mails aux agents des dossiers.

import { Records, Meta } from '../db.js';

const CLE_ENVOI = 'prospection.envoi_attente';
const FRAIS_MS = 24 * 3600000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').trim();

// Les mots qui entourent un choix sans rien dire d'autre.
const LIANTS = new Set(['ok', 'oui', 'fais', 'fait', 'le', 'la', 'les', 'et', 'vas', 'y', 'vas-y', 'go', 'stp', 'svp', 'merci', 'seulement', 'juste', 'que', 'bien', 'parfait', 'nickel', 'top', 'alors', 'du', 'coup', 'numero', 'numeros', 'n', 'point', 'points', 'propositions', 'proposition', 'c', 'est', 'bon', 'moi', 'ca']);

/**
 * Pure : le choix lu dans une réponse, parmi `n` propositions numérotées de 1
 * à n. Rend la liste des numéros, [] pour « rien », ou null si le message
 * n'est pas un choix (il repart alors à l'assistant comme une demande).
 */
export function choixDansLeTexte(texte, n) {
  const t = norm(texte);
  if (!t || t.length > 80 || !n) return null;
  const mots = t.split(/[\s,;.!+&/]+/).filter(Boolean);
  const nombres = [];
  let tout = false;
  let rien = false;
  let sauf = false;
  const exclus = [];
  for (const m of mots) {
    if (/^\d+$/.test(m)) { const k = Number(m); if (k < 1 || k > n) return null; (sauf ? exclus : nombres).push(k); continue; }
    if (m === 'tout' || m === 'tous' || m === 'toutes') { tout = true; continue; }
    if (m === 'rien' || m === 'aucun' || m === 'aucune') { rien = true; continue; }
    if (m === 'sauf' || m === 'pas' || m === 'hors') { sauf = true; continue; }
    if (LIANTS.has(m)) continue;
    return null;
  }
  if (rien && !nombres.length && !tout) return [];
  if (tout) return Array.from({ length: n }, (_, i) => i + 1).filter((k) => !exclus.includes(k));
  if (nombres.length) return [...new Set(nombres)].sort((a, b) => a - b);
  return null;
}

/** L'appel dont la suite attend une réponse dans cet espace, s'il y en a un de moins d'un jour. */
export function appelEnAttente(espace, maintenant = Date.now()) {
  return Records.filter('AppelAgent', { espace, etat: 'a_valider' })
    .filter((a) => maintenant - Date.parse(a.le) < FRAIS_MS)
    .sort((x, y) => String(y.le).localeCompare(String(x.le)))[0] || null;
}

const lireEnvois = () => { try { return JSON.parse(Meta.get(CLE_ENVOI) || '{}'); } catch { return {}; } };

/** Le mail de prospection montré dans cet espace, qui attend un « envoie ». */
export function envoiEnAttente(espace, maintenant = Date.now()) {
  const e = lireEnvois()[espace];
  if (!e || maintenant - Date.parse(e.le) > FRAIS_MS) return null;
  const m = Records.get('ProspectionMail', e.mail_id);
  return m && ['pret', 'prevu'].includes(m.etat) ? { ...e, mail: m } : null;
}

/** Pure : un mail tel qu'il s'affiche dans le chat, signature comprise. */
export function afficherMail(m, signature) {
  return [`le mail pour ${m.nom} :`, `à : ${m.a || '(adresse manquante : donne-la moi)'}`, `objet : ${m.objet}`, '', String(m.corps).replace(/\{signature\}/g, signature), '', 'dis « envoie » et il part'].join('\n');
}

const SCHEMA_REPONSE = {
  type: 'object',
  properties: {
    concerne_l_appel: { type: 'boolean', description: "true si le message répond aux propositions sur cet appel, false s'il parle d'autre chose" },
    choix: { type: 'array', items: { type: 'integer' }, description: 'les numéros des propositions retenues' },
    retouche_mail: { type: 'string', description: 'ce qu\'il veut changer au mail (plus court, tutoyer, ajouter X), vide sinon' },
    relance_le: { type: 'string', description: 'AAAA-MM-JJ si une autre date de rappel est demandée, vide sinon' },
    note: { type: 'string', description: 'une information en plus à noter sur la fiche de l\'agent, vide sinon' },
  },
  required: ['concerne_l_appel', 'choix'],
};

/** Ce que la personne répond, en langage courant, lu par le modèle. */
async function lireLaReponse(texte, appel, numerotees) {
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  if (!llmEnabled || String(texte).length > 600) return null;
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  try {
    return await invokeLLM({
      prompt: `Tu as proposé à un collègue, après son appel avec ${appel.agent} :
${numerotees.map((p, i) => `${i + 1}. ${p.titre}`).join('\n')}

Il te répond : « ${texte} »

Quelles propositions garde-t-il ? « ok », « vas-y », « fais tout » : toutes. « pas la relance » : toutes sauf celle-là. Une demande de retouche du mail garde le mail. Une autre date de rappel (« rappelle-le lundi ») garde le rappel avec cette date (aujourd'hui : ${aujourdhui}). S'il parle d'autre chose que cet appel, concerne_l_appel = false.`,
      response_json_schema: SCHEMA_REPONSE,
      effort: 'low',
    });
  } catch (e) {
    console.warn(`[prospection] réponse illisible : ${e?.message || e}`);
    return null;
  }
}

/** Le mail retouché comme demandé, sans rien inventer. */
async function retoucher(mail, consigne) {
  const { invokeLLM } = await import('../llm.js');
  const r = await invokeLLM({
    prompt: `Réécris ce mail à un agent immobilier selon la consigne, sans rien inventer et sans en changer le fond : ce qu'il présente ou demande (nos critères, la fiche d'un bien) reste dedans. Garde {signature} à la fin.\n\nConsigne : ${consigne}\n\nObjet : ${mail.objet}\n\n${mail.corps}`,
    response_json_schema: { type: 'object', properties: { objet: { type: 'string' }, corps: { type: 'string' } }, required: ['objet', 'corps'] },
    effort: 'low',
  });
  return r?.corps ? { objet: r.objet || mail.objet, corps: /\{signature\}/.test(r.corps) ? r.corps : `${r.corps}\n\n{signature}` } : null;
}

/**
 * Une réponse aux propositions d'un appel : des numéros (« 1 3 »), ou une
 * phrase (« ok mais pas la relance », « envoie le mail en plus court »).
 * Rend le texte à poster, ou null si le message parle d'autre chose.
 */
export async function repondreAuChoix(message, user) {
  const appel = appelEnAttente(message.espace);
  if (!appel) return null;
  const numerotees = appel.propositions.filter((p) => p.type !== 'statut');
  let choix = choixDansLeTexte(message.texte, numerotees.length);
  let lu = null;
  if (choix === null) {
    lu = await lireLaReponse(message.texte, appel, numerotees);
    if (process.env.PROSPECTION_TRACE) console.log('[prospection] réponse lue', JSON.stringify(lu));
    if (!lu?.concerne_l_appel) return null;
    choix = [...new Set((lu.choix || []).filter((k) => k >= 1 && k <= numerotees.length))];
  }
  // Une autre date de rappel, une retouche du mail : posées avant de valider.
  const relance = numerotees.find((p) => p.type === 'relance');
  if (relance && /^\d{4}-\d{2}-\d{2}$/.test(lu?.relance_le || '')) {
    relance.prochaine = { ...relance.prochaine, le: lu.relance_le, quoi: relance.prochaine.quoi };
    const k = numerotees.indexOf(relance) + 1;
    if (!choix.includes(k)) choix.push(k);
    Records.update('AppelAgent', appel.id, { propositions: appel.propositions });
  }
  let mail = null;
  const pm = numerotees.find((p) => p.type === 'mail');
  if (pm && lu?.retouche_mail && choix.includes(numerotees.indexOf(pm) + 1)) mail = await retoucher(pm, lu.retouche_mail).catch(() => null);
  const { validerAppel } = await import('./appel.js');
  const { journal } = await import('./carnet.js');
  const ids = ['statut', ...choix.map((k) => numerotees[k - 1].id)];
  const r = await validerAppel({ appel_id: appel.id, choix: ids, mail, user });
  if (r.ok && lu?.note) journal(appel.agent_id, { type: 'note', texte: lu.note, par: user?.email });
  if (!r.ok) return `dsl, ça a raté : ${r.error}`;
  const signature = user?.full_name || String(user?.email || '').split('@')[0];
  const faits = r.faits.filter((f) => !/À envoyer/.test(f));
  const lignes = [faits.length ? `c'est noté pour ${appel.agent} : ${faits.join(', ')}.` : `ok, j'ai juste noté l'appel avec ${appel.agent}.`];
  if (r.mail_id) {
    const m = Records.get('ProspectionMail', r.mail_id);
    Meta.set(CLE_ENVOI, JSON.stringify({ ...lireEnvois(), [message.espace]: { mail_id: m.id, le: new Date().toISOString() } }));
    lignes.push('', afficherMail(m, signature));
  }
  if (r.sms_id) {
    const s = Records.get('ProspectionMail', r.sms_id);
    lignes.push('', `le SMS à envoyer depuis ton téléphone (${s.a}) :`, String(s.corps).replace(/\{signature\}/g, signature));
  }
  return lignes.join('\n');
}

/** « envoie » après un mail de prospection montré dans le chat. */
export async function envoyerDepuisLeChat(espace, user) {
  const e = envoiEnAttente(espace);
  if (!e) return null;
  const { envoyerMails } = await import('./mails.js');
  const r = await envoyerMails([e.mail.id], user);
  const envois = lireEnvois();
  delete envois[espace];
  Meta.set(CLE_ENVOI, JSON.stringify(envois));
  const x = r.resultats[0];
  if (!x?.ok) return `dsl, le mail n'est pas parti : ${x?.error || 'erreur'}. il attend dans « À envoyer » sur la page Prospection.`;
  if (x.simule) return 'rien n\'est parti : aucune boîte connectée pour toi. le mail attend dans « À envoyer ».';
  return `c'est parti, mail envoyé à ${e.mail.a}.${e.mail.avec_relance ? ' la relance est prête pour dans trois jours ouvrés, je te la montrerai, elle ne part pas seule.' : ''}`;
}
