// AK, l'agent : une phrase du chat devient une action sur la plateforme.
//
// Le fond est celui de l'assistant de commande (assistant-commande.js) : les
// mêmes outils, le même principe — le modèle traduit, le code agit. AK y
// ajoute ce que l'équipe lui demande dans le groupe : créer le projet d'un
// dossier, lancer K-Data et ranger le résultat dans le dossier, sortir la
// préz bancaire d'un projet. Et sa personnalité, qui est celle du document
// écrit par Jules (consigne.md), pris tel quel.
//
// Ce qu'AK ne fait pas : envoyer un mail. Il en prépare le texte, quelqu'un
// l'envoie. C'est une décision de l'équipe, pas une limite technique.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, Conversations, CHEMIN_UPLOADS } from '../db.js';
import { runAgent } from '../llm.js';
import { OUTILS as OUTILS_ASSISTANT, executerOutil as executerOutilAssistant } from '../assistant-commande.js';
import { journaliser } from '../assistant-journal.js';
import { APP_URL_PROD } from '../contexte.js';
import { QUESTIONS, valeursParDefaut } from '../kdata-questions.js';
import { CLES_OUTILS, lancerAnalyses, ranger, lienDe } from '../kdata.js';
import { COMPTE } from './chat.js';

const AGENT = 'ak';
const MAX_MESSAGES = 30;
const ici = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = APP_URL_PROD || 'http://localhost:5173';

/** Le document de Jules, mot pour mot. */
export const CONSIGNE = fs.readFileSync(path.join(ici, 'consigne.md'), 'utf8');

// Les outils de l'assistant qu'AK reprend. Pas l'envoi de mail : décidé. Pas
// non plus son creer_dossier, qui enchaîne CRM, Monday et promesse de
// documents : dans le chat, « crée un dossier » crée un dossier, rien d'autre.
const EXCLUS = new Set(['envoyer_mail', 'preparer_mail', 'creer_dossier']);
const NOMS_KDATA = { kzoning: 'K-Zoning', kexpertise: 'K-Expertise', kestimation: 'Estimation', kprospective: 'K-Prospective', kfoncier: 'K-Foncier', 'valeur-locative': 'Valeur locative', kvacance: 'K-Vacance', ktransactions: 'K-Transactions' };

const OUTILS_AK = [
  {
    name: 'creer_dossier',
    description: "Crée un dossier de préanalyse, et rien d'autre : pas de Monday, pas de CRM, pas de promesse. Ce qu'on sait du bien va dans l'aperçu ; tout est facultatif sauf le nom.",
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'nom du dossier, ex: « Ben », « Local commercial — Lyon 3e »' },
        ville: { type: 'string' }, rue: { type: 'string' },
        prix: { type: 'number', description: 'prix FAI en euros, si donné' },
        surface: { type: 'number', description: 'surface en m², si donnée' },
        loyer: { type: 'number', description: 'loyer annuel HT HC en euros, si donné' },
        activite: { type: 'string' },
        agent_nom: { type: 'string' }, agent_email: { type: 'string' }, agent_telephone: { type: 'string' }, agence: { type: 'string' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'analyser_fiche',
    description: "Crée un dossier de préanalyse à partir d'une fiche commerciale, d'un teaser ou d'un investment memorandum (« crée ce dossier », « fais la pré-analyse ») : lecture, extraction du bien, synthèse. La fiche est soit une pièce jointe (donner son chemin tel qu'il est donné dans le message), soit collée dans le message lui-même (mettre texte_du_message à vrai : le texte complet du message est pris, inutile de le recopier). Une minute environ.",
    input_schema: { type: 'object', properties: { chemin: { type: 'string', description: 'le chemin de la pièce jointe, tel que donné' }, texte_du_message: { type: 'boolean', description: 'vrai quand la fiche est le texte du message' } } },
  },
  {
    name: 'ajouter_document',
    description: "Dépose une pièce jointe (bail, PV d'AG, RCP, diagnostics, quittances…) sur un dossier existant : lecture, classement, synthèse des points à vérifier. Chercher le dossier d'abord.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, chemin: { type: 'string', description: 'le chemin de la pièce jointe, tel que donné' } }, required: ['deal_id', 'chemin'] },
  },
  {
    name: 'creer_projet_depuis_dossier',
    description: "Crée la fiche projet d'un dossier de préanalyse déjà là (« crée le projet pour Devred de Firminy »). Chercher le dossier d'abord avec chercher_dossier ; s'il n'existe pas, le dire, ne rien créer de vide.",
    input_schema: { type: 'object', properties: { deal_id: { type: 'string' }, lot_index: { type: 'number', description: 'index du lot, 0 sauf dossier multi-lots' } }, required: ['deal_id'] },
  },
  {
    name: 'outils_kdata',
    description: "La liste des outils K-Data et les réglages que chacun demande. À appeler avant lancer_kdata pour demander à la personne lesquels elle veut et avec quels réglages.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'lancer_kdata',
    description: "Lance des analyses K-Data sur une adresse et les range dans un dossier. L'adresse est celle du projet ou du dossier (la prendre d'etat_projet ou etat_dossier). Les analyses tournent en tâche de fond : AK préviendra dans le chat quand c'est fini, il ne faut pas attendre ni inventer un résultat.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: 'numéro, rue, ville' },
        outils: { type: 'array', items: { type: 'string', enum: CLES_OUTILS }, description: 'les outils choisis par la personne' },
        reglages: { type: 'object', description: 'par outil, les réponses aux questions : { kzoning: { rayon_m: 500 }, kexpertise: { activite: "boulangerie" } }' },
        deal_id: { type: 'string', description: 'le dossier où ranger les analyses, si connu' },
      },
      required: ['adresse', 'outils'],
    },
  },
  {
    name: 'generer_prez_bancaire',
    description: "Génère la préz bancaire (projet de financement, PPTX) d'un projet de la plateforme et la dépose sur le Drive partagé en Google Slides. Nécessite l'identifiant rendu par chercher_projet. Tâche de fond : AK donnera le lien dans le chat quand c'est prêt.",
    input_schema: { type: 'object', properties: { projet_id: { type: 'string' } }, required: ['projet_id'] },
  },
  {
    name: 'taches_en_cours',
    description: "Ce qu'AK est en train de faire en tâche de fond (analyses K-Data, préz), pour répondre « je suis en train de faire autre chose » ou dire où ça en est.",
    input_schema: { type: 'object', properties: {} },
  },
];

export const OUTILS = [...OUTILS_ASSISTANT.filter((o) => !EXCLUS.has(o.name)), ...OUTILS_AK];

const lien = (chemin) => `${APP_URL}${chemin}`;

/** Ce que chaque outil K-Data demande, lisible par le modèle et par la personne. Pure. */
export function decrireOutilsKdata() {
  return CLES_OUTILS.map((cle) => ({
    outil: cle,
    nom: NOMS_KDATA[cle] || cle,
    questions: (QUESTIONS[cle] || []).filter((q) => !q.groupe).map((q) => ({
      cle: q.cle, libelle: q.libelle, type: q.type, defaut: q.defaut ?? null,
      options: q.options ? q.options.map((o) => o.valeur ?? o.value ?? o).slice(0, 12) : undefined,
    })),
    defauts: valeursParDefaut(cle),
  }));
}

/**
 * Exécute un outil d'AK, ou passe la main à l'assistant. `fond` reçoit les
 * tâches qui continuent après la réponse : c'est la veille qui les suit.
 */
export async function executerOutil({ name, input }, user, { fond = () => {}, message = null } = {}) {
  if (name === 'analyser_fiche' && input.texte_du_message && !input.chemin) {
    const texte = String(message?.texte || '').trim();
    if (texte.length < 80) return { ok: false, error: 'Le message ne contient pas de fiche à lire.' };
    const { analyserFiche } = await import('../deal/index.js');
    const d = await analyserFiche({ texte }, { user });
    const lot = d.lots?.[0];
    return { ok: true, cree: true, deal_id: d.deal_id, titre: lot?.synthese?.titre || 'fiche collée', verdict: lot?.synthese?.verdict || null, lien: lien(`/Analyse?deal_id=${d.deal_id}`) };
  }
  if (name === 'creer_dossier') {
    const { creerCoquille } = await import('../deal/index.js');
    const dossier = creerCoquille({
      nom: input.nom,
      responsables: user?.full_name ? [user.full_name] : [],
      user,
      contact_agent_email: input.agent_email ? String(input.agent_email).trim().toLowerCase() : null,
      apercu: {
        ville: input.ville || null, rue: input.rue || null, prix: input.prix || null,
        surface: input.surface || null, loyer: input.loyer || null, activite: input.activite || null,
        agent_nom: input.agent_nom || null, agent_telephone: input.agent_telephone || null, agence: input.agence || null,
      },
    });
    return { ok: true, cree: true, deal_id: dossier.deal_id, nom: input.nom, lien: lien(`/Analyse?deal_id=${dossier.deal_id}`) };
  }
  if (name === 'analyser_fiche' || name === 'ajouter_document') {
    const chemin = String(input.chemin || '');
    if (!chemin.startsWith(CHEMIN_UPLOADS) || !fs.existsSync(chemin)) return { ok: false, error: 'Pièce jointe introuvable : elle doit venir du message.' };
    const fichier = { buffer: fs.readFileSync(chemin), filename: path.basename(chemin).replace(/^ak-\d+-/, ''), mimetype: /\.pdf$/i.test(chemin) ? 'application/pdf' : undefined, url: `/uploads/${path.basename(chemin)}` };
    if (name === 'analyser_fiche') {
      const { analyserFiche } = await import('../deal/index.js');
      const d = await analyserFiche({ buffer: fichier.buffer, filename: fichier.filename, mimetype: fichier.mimetype, sourceUrl: fichier.url }, { user });
      const lot = d.lots?.[0];
      return { ok: true, cree: true, deal_id: d.deal_id, titre: lot?.synthese?.titre || fichier.filename, verdict: lot?.synthese?.verdict || null, lien: lien(`/Analyse?deal_id=${d.deal_id}`) };
    }
    const { deposerDocument } = await import('../deal/deposer-document.js');
    const r = await deposerDocument(input.deal_id, fichier, { user });
    if (!r.ok) return r;
    return { ok: true, type: r.type || null, statut: r.deal?.statut || null, lien: lien(`/Analyse?deal_id=${input.deal_id}`) };
  }
  if (name === 'creer_projet_depuis_dossier') {
    const { creerProjetDepuisDeal, completerAvantProjet } = await import('../deal/projet.js');
    try { await completerAvantProjet(input.deal_id, Number(input.lot_index) || 0); } catch { /* la fiche naît de ce qu'on a */ }
    const r = creerProjetDepuisDeal(input.deal_id, Number(input.lot_index) || 0, user);
    if (!r.ok) return { ok: false, error: r.error, lien: r.project_id ? lien(`/projet/${r.project_id}`) : null };
    return { ok: true, projet_id: r.project.id, titre: r.project.titre, lien: lien(`/projet/${r.project.id}`), champs_remplis: r.champs_remplis };
  }
  if (name === 'outils_kdata') return { outils: decrireOutilsKdata() };
  if (name === 'lancer_kdata') {
    const r = lancerAnalyses({ adresse: input.adresse, outils: input.outils, reglages: input.reglages || {} }, user);
    if (!r.ok) return r;
    if (input.deal_id) ranger(r.ids, input.deal_id);
    fond({ genre: 'kdata', libelle: `K-Data sur ${input.adresse} : ${input.outils.map((o) => NOMS_KDATA[o] || o).join(', ')}`, ids: r.ids, deal_id: input.deal_id || null });
    return { ok: true, lancees: input.outils.length, lot: r.lot, note: 'Les analyses tournent ; AK préviendra dans le chat quand elles seront finies.' };
  }
  if (name === 'generer_prez_bancaire') {
    const projet = Records.get('Project', input.projet_id);
    if (!projet) return { ok: false, error: 'Projet introuvable.' };
    fond({ genre: 'prez', libelle: `préz bancaire de ${projet.titre || projet.adresse_complete || projet.id}`, projet_id: projet.id });
    return { ok: true, note: 'La préz part en génération ; AK donnera le lien dans le chat quand elle sera sur le Drive.' };
  }
  if (name === 'taches_en_cours') {
    const { tachesEnCours } = await import('./veille.js');
    return { taches: tachesEnCours() };
  }
  return executerOutilAssistant({ name, input }, user);
}

/**
 * Génère la préz d'un projet et la dépose sur le Drive en Slides. Rend le lien
 * Slides, ou celui du PPTX sur la plateforme si le Drive refuse.
 */
export async function produirePrez(projetId) {
  const projet = Records.get('Project', projetId);
  if (!projet) throw new Error('Projet introuvable.');
  const reglages = Records.filter('AppSettings', { setting_key: 'global' })[0];
  const photos = { conditions: reglages?.presentation_conditions_photo || null };
  const { genererPresentationProjet } = await import('../presentation-projet.js');
  const buffer = await genererPresentationProjet(projet, photos);
  const nomFichier = `presentation-projet-${String(projet.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
  const dossierPres = path.join(CHEMIN_UPLOADS, 'presentations');
  fs.mkdirSync(dossierPres, { recursive: true });
  fs.writeFileSync(path.join(dossierPres, nomFichier), buffer);
  const pptx = lien(`/uploads/presentations/${nomFichier}`);
  try {
    const { uploaderEnSlides } = await import('../google-drive.js');
    const r = await uploaderEnSlides(COMPTE, { nom: `Projet de financement — ${projet.titre || projet.adresse_complete || projet.id}`, buffer });
    return { slides: r.slides_url, pptx };
  } catch (e) {
    return { slides: null, pptx, erreur_drive: e?.message || String(e) };
  }
}

/** Le résumé d'une tâche finie, tel qu'AK le postera. Pure. */
export function texteDeFin(tache) {
  if (tache.genre === 'kdata') {
    const lignes = (tache.analyses || []).map((a) => {
      const l = lienDe(a);
      return a.etat === 'terminee' ? `- ${a.nom_outil} : ${a.resume || 'prête'}${l ? ` ${lien(l)}` : ''}` : `- ${a.nom_outil} : raté (${a.erreur || 'sans détail'})`;
    });
    const ou = tache.deal_id ? ' rangé dans le dossier' : '';
    return `c'est bon, ${tache.libelle}${ou} :\n${lignes.join('\n')}`;
  }
  if (tache.genre === 'prez') {
    if (tache.resultat?.slides) return `📁 c'est fait, ${tache.libelle} est sur le Drive : ${tache.resultat.slides}`;
    return `${tache.libelle} est prête ici : ${tache.resultat?.pptx}${tache.resultat?.erreur_drive ? ` (le Drive a refusé : ${tache.resultat.erreur_drive})` : ''}`;
  }
  return `${tache.libelle} : fini.`;
}

const CADRE = `

---

CE QUE TU SAIS FAIRE SUR LA PLATEFORME KLOCKA (${APP_URL})

Tu as des outils. Le modèle ne décide de rien sur le fond : il traduit une phrase en appel d'outil, et le code agit. « Dossier » désigne un dossier de préanalyse (les documents reçus d'un agent) ; « projet » une fiche projet de la plateforme, créée à partir d'un dossier.

RÈGLES :
1. Cherche toujours avant d'agir (chercher_dossier, chercher_projet) : il te faut l'identifiant. Plusieurs résultats : liste-les et demande lequel. Aucun : dis-le, n'invente rien.
2bis. Une pièce jointe (PDF) avec « crée ce dossier », « fais la pré-analyse », « mets ça sur la plateforme » : analyser_fiche avec le chemin donné, jamais creer_dossier à vide. Une fiche COLLÉE dans le message (un mémorandum, une annonce, des lignes de description du bien) avec la même demande : analyser_fiche avec texte_du_message, jamais creer_dossier. Une pièce jointe pour un dossier déjà là (bail, PV, RCP…) : ajouter_document. Sans pièce jointe, dis que tu n'as rien reçu.
2. « Crée le projet pour X » : chercher_dossier puis creer_projet_depuis_dossier. Sans dossier, dis qu'il faut d'abord mettre le dossier sur la plateforme. « Crée un dossier X » : creer_dossier, et c'est tout ; Monday ou le CRM seulement si on te le demande.
3. « Fais l'analyse K-Data » : demande TOUJOURS d'abord quels outils (outils_kdata donne la liste et leurs réglages), en une ligne courte avec les noms. Ne lance rien tant que la personne n'a pas choisi. Puis lancer_kdata avec l'adresse du projet ou du dossier et le deal_id pour ranger dans le dossier.
4. Une tâche de fond (K-Data, préz) : dis que c'est parti, sans annoncer de résultat. Tu préviendras toi-même dans le chat quand ce sera fini.
5. Un mail : tu proposes le texte dans le chat, tu ne l'envoies jamais. Personne ne t'a donné ce droit.
6. N'invente jamais un chiffre sur un bien : ce que tu n'as pas reçu d'un outil, tu ne l'as pas.
7. Une action faite : UNE ligne, comme un collègue qui répond sur son téléphone. « C bon le dossier est créé et tout est dans monday bg ». Pas d'identifiant, pas de numéro d'item Monday, pas de date « par défaut », pas de rappel de ce que tu n'as pas fait, pas de « dis-moi si tu veux que… ». Le lien seulement si la personne en a besoin pour ouvrir un truc. Les réserves, les manques, les détails : uniquement si on te les demande.
8. Si quelqu'un d'autre est mentionné dans la demande (« @Nora tu as fini ? »), tu peux le mentionner en écrivant son identifiant entre chevrons tel qu'il t'est donné : <users/123>. Ne mentionne pas la personne qui te parle : c'est déjà fait devant ta réponse.
9. Tu parles sur Google Chat : texte brut, pas de markdown, pas de titres, pas d'astérisques. Une à deux phrases, jamais de paragraphes, jamais de liste sauf quand on te demande une liste. Tu écris comme l'équipe écrit (voir le document au-dessus) : « c bon », « dcp », « bg », minuscules, pas de ponctuation soignée. Tu n'es pas un service client, tu es un collègue.

CE QU'IL NE FAUT PAS ÉCRIRE (trop corporate) :
« Dossier Ben créé : /Analyse?deal_id=18bd… Comme l'autre : posé dans Monday (item 3236289125) + promesse de docs au 24/09/2026 par défaut. Pas d'agent ni de mail, dcp la veille ne rattachera rien automatiquement. Tu me files l'adresse/agent quand tu l'as et je complète. »
CE QU'IL FAUT ÉCRIRE À LA PLACE :
« c bon le dossier Ben est créé et tout est dans monday bg »`;

/** La consigne complète : le document de Jules, puis le cadre technique. */
export const consigne = () => CONSIGNE + CADRE;

function fil(espace) {
  return Conversations.list(AGENT).find((c) => c.metadata?.espace === espace) || Conversations.create({ agent_name: AGENT, metadata: { espace } });
}

const sansAccent = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Le compte Klocka de la personne qui parle : ce qu'AK crée est signé d'elle,
 * pas du premier administrateur venu. Google ne donne que le nom affiché
 * (« Jules Barthomeuf ») ; on le rapproche des comptes de l'équipe par le
 * nom complet, puis par « prénom.initiale » dans l'adresse (jules.b@), puis
 * par le prénom seul. Pure sur `utilisateurs` : testée sans réseau.
 */
export function utilisateurPour(auteur, utilisateurs = Records.filter('User', { role: 'admin' })) {
  const affiche = sansAccent(auteur?.affiche);
  const equipe = utilisateurs.filter((u) => /@klocka\.immo$/i.test(u.email || ''));
  const candidats = [...equipe, ...utilisateurs.filter((u) => !equipe.includes(u))];
  if (!affiche) return null;
  const mots = affiche.split(' ');
  const [prenom, nom] = [mots[0], mots[mots.length - 1]];
  const memeNom = (u) => { const m = sansAccent(u.full_name).split(' '); return m.length >= 2 && ((m[0] === prenom && m[m.length - 1] === nom) || (m[0] === nom && m[m.length - 1] === prenom)); };
  const local = (u) => sansAccent(String(u.email || '').split('@')[0].replace(/\./g, ' '));
  return candidats.find(memeNom)
    || (nom && candidats.find((u) => local(u) === `${prenom} ${nom[0]}`))
    || candidats.find((u) => local(u).split(' ')[0] === prenom && equipe.includes(u))
    || null;
}

/** À défaut : le compte AK_COMPTE, puis un administrateur. */
export function utilisateurAk() {
  return Records.filter('User', { email: COMPTE })[0] || Records.filter('User', { role: 'admin' })[0] || { email: COMPTE, role: 'admin', full_name: 'AK' };
}

/**
 * Répond à un message du chat. Le fil de l'espace fait la mémoire ; les
 * tâches de fond sont rendues à part pour que la veille les suive.
 * @param {{texte:string, auteur:{nom,affiche}, espace:string, mentions:Array}} message
 */
export async function repondre(message) {
  const user = utilisateurPour(message.auteur) || utilisateurAk();
  const conversation = fil(message.espace);
  const prenom = (message.auteur.affiche || 'Quelqu\'un').split(' ')[0];
  const autres = (message.mentions || []).filter((m) => m.affiche).map((m) => `${m.affiche} = ${m.nom}`);
  const pieces = (message.pieces || []).map((p) => (p.chemin ? `${p.nom} (${p.type || 'type inconnu'}, chemin : ${p.chemin})` : `${p.nom} (impossible à télécharger : ${p.erreur})`));
  const entree = `${prenom} (${message.auteur.nom || '?'}) : ${message.texte}${autres.length ? `\n(mentionnés : ${autres.join(', ')})` : ''}${pieces.length ? `\n(pièces jointes : ${pieces.join(' ; ')})` : ''}`;
  const historique = [...conversation.messages, { role: 'user', content: entree }].slice(-MAX_MESSAGES);

  const fond = [];
  const actions = [];
  const outils = [];
  const { text } = await runAgent({
    system: consigne(),
    messages: historique,
    tools: OUTILS,
    onTool: async (appel) => {
      outils.push(appel.name);
      const resultat = await executerOutil(appel, user, { fond: (t) => fond.push(t), message });
      const agissant = !['chercher_dossier', 'chercher_projet', 'etat_dossier', 'etat_projet', 'verifier', 'outils_kdata', 'taches_en_cours', 'historique_actions', 'plan_du_jour', 'registre_engagements', 'interroger_documents', 'marche_ville'].includes(appel.name);
      if (agissant) {
        if (resultat?.ok !== false) actions.push({ ...appel, resultat });
        try { journaliser({ outil: appel.name, args: appel.input, resultat, user: { ...user, email: `${user.email} (AK pour ${prenom})` } }); } catch (e) { console.warn('[ak] journalisation impossible :', e?.message || e); }
      }
      return resultat;
    },
  });
  const texte = String(text || '').trim() || 'rav, je n\'ai rien à répondre là-dessus.';
  Conversations.setMessages(conversation.id, [...historique, { role: 'assistant', content: texte }].slice(-MAX_MESSAGES));
  return { texte, actions, outils, fond };
}
