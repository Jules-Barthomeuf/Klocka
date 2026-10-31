// Haka ambiant (22 oct. 2026, Jules : « Haka devient un agent ambiant : traiter les emails, poser une notification
// pour demander oui ou non ; toujours un humain dans la boucle »).
//
// Chaque mail retenu par la veille (hors fiche commerciale, qui a sa compétence, et hors demande à Haka sur
// sourcing@) devient une tâche `mail_ambiant` :
//   1. classer    une lecture courte : de quoi s'agit-il (réponse d'agent, documents, rendez-vous, demande de client,
//                 rien), la phrase qui le dit, la suite qui convient. Rien n'est écrit hors de Haka.
//   2. proposer   une question oui / non chez la seule personne concernée (le responsable du dossier, sinon la
//                 personne de la boîte ; une boîte commune : le Commun). Plusieurs mails du même dossier et de même
//                 nature dans l'heure : une seule question, qui s'enrichit.
//   3. executer   (externe) le geste, au oui seulement : ranger les pièces, poser un rappel daté, envoyer la réponse
//                 préparée de la boîte de la personne. Non exige un motif, gardé et redonné en exemple au classement.
// « Rien à faire » est noté sur le mail (Administration › Automatismes), sans notification. Une question dont le mail
// a été traité à la main (pièces déjà rangées, réponse déjà partie) se retire seule.
//
// Drapeaux : HAKA_AMBIANT (tout), HAKA_AMBIANT_TYPES (reponse, documents, rdv, client). Éteint par défaut.

import { Records, Meta, CHEMIN_UPLOADS } from '../db.js';
import * as taches from './taches.js';
import * as file from './file.js';
import { sourceMail, source } from './sources.js';
import { proprietaireDeLaBoite, boiteQuiEnvoie } from './proprietaire.js';
import { SIMULER, BOITES_COMMUNES, ambiantPour } from './drapeaux.js';

export const COMPETENCE = 'mail_ambiant';
export const VERSION = '1';
const CLE_DEPUIS = 'haka.ambiant.depuis';
const UNE_HEURE = 3600 * 1000;
const APPRIS = 'HakaApprentissage';

/** Les natures de mail, le type de drapeau qui les allume, et ce qu'on en dit. */
export const NATURES = {
  reponse_agent: { type: 'reponse', libelle: "Réponse d'un agent" },
  documents: { type: 'documents', libelle: 'Documents reçus' },
  rendez_vous: { type: 'rdv', libelle: 'Rendez-vous ou rappel demandé' },
  demande_client: { type: 'client', libelle: "Demande d'un client" },
  rien: { type: null, libelle: 'Rien à faire' },
};
const TYPES_PIECES = { bail: 'bail', taxe_fonciere: 'taxe foncière', plan: 'plan', releve: 'relevé', diagnostic: 'diagnostic', pv_ag: 'PV d’AG', reglement: 'règlement de copropriété', quittance: 'quittance', fiche: 'fiche', autre: 'document' };

const norm = (e) => String(e || '').trim().toLowerCase();
const court = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const nomDe = (mail) => String(mail?.de || mail?.de_email || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || mail?.de_email || 'un expéditeur';
const UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp)$/i;
const PARASITES = /^(image\d+|logo|signature|banniere|banner|icon|unnamed)/i;
export const piecesUtiles = (mail) => (mail?.pieces_jointes || []).filter((p) => UTILES.test(p?.nom || '') && !PARASITES.test(p?.nom || ''));

// ---------------------------------------------------------------------------
// Ce que Haka a appris des oui et des non
// ---------------------------------------------------------------------------

/** Garde une décision : la nature, l'expéditeur, l'objet, le motif d'un non. */
export function apprendre(mail, { nature, decision, motif = null, par = null }) {
  return Records.create(APPRIS, { nature, decision, motif: motif ? court(motif, 300) : null, de_email: norm(mail?.de_email), objet: court(mail?.objet, 160), par: norm(par) || null, le: new Date().toISOString() });
}

/** Les décisions récentes, en exemples pour le classement : un « non » avec son motif apprend le plus. */
export function exemplesAppris(limite = 10) {
  return Records.list(APPRIS)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .slice(0, limite)
    .map((x) => `« ${x.objet || '(sans objet)'} » de ${x.de_email || '?'} → ${NATURES[x.nature]?.libelle || x.nature} : ${x.decision === 'oui' ? 'OUI, bonne lecture' : `NON${x.motif ? ` (« ${x.motif} »)` : ''}`}`);
}

// ---------------------------------------------------------------------------
// 1. Classer
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    nature: { type: 'string', enum: Object.keys(NATURES) },
    resume: { type: 'string', description: 'Deux phrases au plus, en français : ce que dit le mail.' },
    phrase: { type: 'string', description: 'La phrase du mail qui le dit, recopiée telle quelle (200 signes au plus).' },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
    pieces: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, type: { type: 'string', enum: Object.keys(TYPES_PIECES) } } } },
    date: { type: 'string', description: "La date du rendez-vous ou du rappel demandé, AAAA-MM-JJ ; chaîne vide si aucune." },
    heure: { type: 'string', description: "HH:MM si dite, sinon chaîne vide." },
    suite: { type: 'string', enum: ['rappel', 'mail', 'rien'], description: "rappel : une relance ou un rendez-vous à noter ; mail : une réponse écrite s'impose ; rien." },
    quoi: { type: 'string', description: 'Le rappel en quelques mots (« Relancer Marc pour le bail »), si suite = rappel.' },
    reponse_objet: { type: 'string', description: 'Objet de la réponse, si suite = mail.' },
    reponse_corps: { type: 'string', description: 'La réponse, courte, polie, signée du prénom donné, si suite = mail. Ne promets rien que le mail ne justifie.' },
  },
  required: ['nature', 'resume', 'phrase', 'confiance', 'suite'],
};

/** Ce qu'on sait sans le modèle : le dossier rattaché, le client connu. */
export function indicesDuMail(mail, { clients = null } = {}) {
  const deal = mail?.deal_id ? Records.findBy('Deal', 'deal_id', mail.deal_id) : null;
  const liste = clients || Records.list('DemandeClient').filter((c) => c.client_email);
  const client = liste.find((c) => norm(c.client_email) === norm(mail?.de_email)) || null;
  return { deal, client, pieces: piecesUtiles(mail) };
}

/** La lecture du mail par le modèle (court, effort bas). `invoke` s'injecte dans les tests. */
export async function classerMail(mail, { indices = indicesDuMail(mail), signature = null, invoke = null } = {}) {
  const { invokeLLM } = await import('../llm.js');
  const exemples = exemplesAppris();
  const prompt = `Tu es l'Assistant KPartners, l'assistant de Klocka (investissement en murs commerciaux). Un mail vient d'arriver dans une boîte de l'équipe. Dis ce que c'est, sans rien inventer.

Natures possibles :
- reponse_agent : un agent immobilier répond sur un dossier en cours (sans document à ranger, ou avec un texte qui compte plus que les pièces).
- documents : des documents d'un bien sont joints (bail, taxe foncière, plans, relevés, diagnostics, PV d'AG…).
- rendez_vous : on fixe ou déplace un rendez-vous, ou l'on demande d'être rappelé à une date.
- demande_client : un client investisseur demande quelque chose (un bien, un point, une information).
- rien : tout le reste (publicité, notification, simple accusé de réception, facture, conversation sans suite).
Si tu hésites, mets confiance « basse » : un humain tranchera.

${indices.deal ? `Le mail est rattaché au dossier « ${indices.deal.nom || indices.deal.deal_id} » (statut ${indices.deal.statut || '?'}).` : "Le mail n'est rattaché à aucun dossier."}
${indices.client ? `L'expéditeur est un client connu : ${indices.client.client_nom || indices.client.client_email}.` : ''}
Signe une éventuelle réponse : ${signature || "l'équipe Klocka"}.

Expéditeur : ${mail.de || mail.de_email}
Objet : ${mail.objet || '(sans objet)'}
Pièces jointes : ${(mail.pieces_jointes || []).map((p) => p?.nom).filter(Boolean).join(', ') || 'aucune'}
Texte :
${String(mail.texte || mail.extrait || '').slice(0, 1500)}${exemples.length ? `\n\nCe que l'équipe a déjà répondu à tes lectures, à respecter :\n${exemples.join('\n')}` : ''}`;
  const { mesurer } = await import('../llm-couts.js');
  const { resultat } = await mesurer({ operation: 'haka lit un mail', sur: mail.deal_id || null }, () => (invoke || invokeLLM)({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 1200 }));
  return normaliser(resultat, mail, indices);
}

/** Pure : la lecture rendue propre (nature connue, pièces nommées, date valide, phrase recopiée). */
export function normaliser(r = {}, mail = {}, indices = {}) {
  let nature = NATURES[r?.nature] ? r.nature : 'rien';
  // Des documents sans dossier ne se rangent nulle part : c'est une réponse à regarder.
  if (nature === 'documents' && !indices.deal) nature = 'reponse_agent';
  if (nature === 'documents' && !(indices.pieces || []).length) nature = 'reponse_agent';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r?.date || '')) ? r.date : null;
  const heure = /^\d{1,2}:\d{2}$/.test(String(r?.heure || '')) ? r.heure : null;
  const lues = Array.isArray(r?.pieces) ? r.pieces : [];
  const pieces = (indices.pieces || []).map((p) => {
    const l = lues.find((x) => norm(x?.nom) === norm(p.nom));
    return { nom: p.nom, type: TYPES_PIECES[l?.type] ? l.type : 'autre' };
  });
  return {
    nature,
    resume: court(r?.resume, 300) || court(mail.objet, 160),
    phrase: court(r?.phrase, 220) || null,
    confiance: ['haute', 'moyenne', 'basse'].includes(r?.confiance) ? r.confiance : 'basse',
    pieces, date, heure,
    suite: ['rappel', 'mail', 'rien'].includes(r?.suite) ? r.suite : 'rien',
    quoi: court(r?.quoi, 140) || null,
    reponse: r?.reponse_corps ? { objet: court(r.reponse_objet, 160) || `Re: ${court(mail.objet, 140)}`, corps: String(r.reponse_corps).slice(0, 3000) } : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Proposer
// ---------------------------------------------------------------------------

/** À qui revient la question : le responsable du dossier, sinon la personne de la boîte, sinon le Commun. */
export function destinataire(mail, deal = null) {
  if (deal?.responsable_email) return norm(deal.responsable_email);
  if (BOITES_COMMUNES.has(norm(mail?.compte))) return null;
  return proprietaireDeLaBoite(mail?.compte)?.email ? norm(proprietaireDeLaBoite(mail.compte).email) : null;
}

const jourISO = (d) => d.toISOString().slice(0, 10);
/** Pure : l'instant où il est `h:mi` à Paris le jour `jour` (été comme hiver). */
export function heureDeParis(jour, h, mi = 0) {
  const essai = new Date(`${jour}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00Z`);
  const aParis = Number(essai.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
  return new Date(essai.getTime() - ((aParis - h + 24) % 24) * 3600 * 1000);
}
const plusJoursOuvres = (n, depuis = new Date()) => { const d = new Date(depuis); let k = 0; while (k < n) { d.setDate(d.getDate() + 1); if (![0, 6].includes(d.getDay())) k += 1; } return jourISO(d); };

/**
 * Pure : le geste qu'un oui exécutera, et la question qui le dit. `lecture` vient de `normaliser`.
 * Rend null quand il n'y a rien à proposer (« rien », ou un type éteint).
 */
export function gesteDe(lecture, mail, { deal = null, client = null, pour = null, de = null, aujourdhui = jourISO(new Date()) } = {}) {
  const qui = nomDe(mail);
  const bien = deal?.nom || null;
  const doute = lecture.confiance === 'basse' ? 'Je ne suis pas sûr de ma lecture : ' : '';
  if (lecture.nature === 'documents') {
    const n = lecture.pieces.length;
    const types = [...new Set(lecture.pieces.map((p) => TYPES_PIECES[p.type]))].join(', ');
    return { geste: 'ranger', titre: `${doute}${n} pièce${n > 1 ? 's' : ''} reçue${n > 1 ? 's' : ''} pour ${bien || 'le dossier'} : je ${n > 1 ? 'les' : 'la'} range ?`, detail: `${types}, de ${qui}. Elles iront dans la Data Room du dossier.`, mails: [mail.id], pieces: lecture.pieces };
  }
  if (lecture.nature === 'demande_client' || (lecture.nature === 'reponse_agent' && lecture.suite === 'mail' && lecture.reponse)) {
    if (!lecture.reponse) return { geste: 'rappel', titre: `${doute}${qui} attend une réponse : je vous le rappelle demain ?`, detail: lecture.resume, quoi: `Répondre à ${qui}${bien ? ` (${bien})` : ''}`, jour: plusJoursOuvres(1, new Date(`${aujourdhui}T12:00:00Z`)), heure: '09:00' };
    return { geste: 'mail', titre: `${doute}${lecture.nature === 'demande_client' ? `${client?.client_nom || qui} vous écrit` : `${qui} attend une réponse`} : j'envoie cette réponse ?`, detail: lecture.resume, a: norm(mail.de_email), de, objet: lecture.reponse.objet, corps: lecture.reponse.corps };
  }
  if (lecture.nature === 'rendez_vous') {
    const jour = lecture.date && lecture.date >= aujourdhui ? lecture.date : plusJoursOuvres(1, new Date(`${aujourdhui}T12:00:00Z`));
    return { geste: 'rappel', titre: `${doute}${lecture.date ? 'Rendez-vous' : 'Rappel demandé'} avec ${qui}${lecture.date ? ` le ${new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` : ''} : je le note ?`, detail: lecture.resume, quoi: lecture.quoi || `Rendez-vous avec ${qui}${bien ? ` (${bien})` : ''}`, jour, heure: lecture.heure || '09:00', decaler: false };
  }
  if (lecture.nature === 'reponse_agent') {
    const jour = lecture.date && lecture.date >= aujourdhui ? lecture.date : plusJoursOuvres(3, new Date(`${aujourdhui}T12:00:00Z`));
    return { geste: 'rappel', titre: `${doute}${qui} a répondu${bien ? ` sur ${bien}` : ''} : je pose la relance du ${new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })} ?`, detail: lecture.resume, quoi: lecture.quoi || `Relancer ${qui}${bien ? ` (${bien})` : ''}`, jour, heure: '09:00', decaler: true };
  }
  return null;
}

/** Une question ouverte du même dossier et de même nature, de moins d'une heure : on l'enrichit plutôt que d'en poser une autre. */
export function questionAEnrichir(groupe, maintenant = Date.now()) {
  if (!groupe) return null;
  return Records.list('HakaProposition').find((p) => p.type === 'mail_ambiant' && p.etat === 'proposee' && p.charge?.groupe === groupe && p.charge?.geste === 'ranger' && maintenant - Date.parse(p.cree_le) < UNE_HEURE) || null;
}

// ---------------------------------------------------------------------------
// 3. Exécuter (au oui)
// ---------------------------------------------------------------------------

async function poserRappel(charge, { pour, user, proposition_id }) {
  const deja = Records.list('Rappel').find((r) => r.haka_proposition === proposition_id);
  if (deja) return { rappel_id: deja.id, deja: true, echeance: deja.echeance };
  let jour = charge.jour;
  let absence = null;
  if (charge.decaler && pour) {
    try { const { premierJourPresent } = await import('../equipe-semaine.js'); const r = await premierJourPresent(pour, jour); jour = r.jour; absence = r.absence; } catch { /* l'agenda ne répond pas : la date reste */ }
  }
  const [h, mi] = String(charge.heure || '09:00').split(':').map(Number);
  const echeance = heureDeParis(jour, h, mi || 0).toISOString();
  const r = Records.create('Rappel', {
    nom: charge.nom || null, quoi: charge.quoi, telephone: null, note: [charge.detail, absence ? `Décalé au retour (${absence.libelle})` : null].filter(Boolean).join(' · '),
    echeance, cree_le: new Date().toISOString(), cree_par: norm(pour || user?.email) || null, fait_le: null, haka_proposition: proposition_id, deal_id: charge.dossier || null,
  });
  return { rappel_id: r.id, echeance, decale: !!absence };
}

async function envoyerReponse(charge, { pour, user, proposition_id, deal_id }) {
  const a = norm(charge.a);
  if (!a) throw new Error("Pas de destinataire pour la réponse.");
  const template_id = `haka:${proposition_id}`;
  const deja = Records.filter('EmailLog', { template_id }).find((e) => ['envoye', 'simule'].includes(e.statut));
  if (deja) return { deja: true, a };
  if (SIMULER) {
    const { logEmail } = await import('../email.js').catch(() => ({}));
    if (typeof logEmail === 'function') logEmail({ from: charge.de, expediteur: charge.de, to: a, destinataire: a, subject: charge.objet, sujet: charge.objet, body: charge.corps, contenu: charge.corps, template_id, deal_id, intention: 'reponse_haka', direction: 'sortant', statut: 'simule', error: 'Simulation Assistant KPartners', sent_at: new Date().toISOString() });
    return { simule: true, a };
  }
  const { sendEmail } = await import('../email.js');
  const envoi = await sendEmail({ from: charge.de || undefined, owner: pour || user?.email, to: a, subject: charge.objet, body: charge.corps, deal_id: deal_id || undefined, intention: 'reponse_haka', template_id });
  if (!envoi?.success && !envoi?.simulated) throw new Error(envoi?.error || 'Envoi refusé');
  return { envoye: !!envoi.success && !envoi.simulated, simule: !!envoi.simulated, a };
}

async function rangerPieces(charge, { user, uploadDir }) {
  const { ingererPiecesJointes } = await import('../deal/pieces-mails.js');
  const deposes = [];
  const erreurs = [];
  for (const id of charge.mails || []) {
    const mail = Records.get('MailRecu', id);
    if (!mail) continue;
    Records.update('MailRecu', id, { haka_attente_rangement: false });
    const r = await ingererPiecesJointes(Records.get('MailRecu', id), uploadDir || CHEMIN_UPLOADS, user || null, undefined, { ranger: !SIMULER });
    deposes.push(...(r.deposes || []));
    erreurs.push(...(r.erreurs || []));
  }
  if (!deposes.length && erreurs.length) throw new Error(erreurs[0]);
  return { deposes, erreurs };
}

taches.enregistrer(COMPETENCE, {
  competence: null,
  version: VERSION,
  etapes: [
    {
      nom: 'classer',
      async run({ charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        if (!mail) throw new Error('Mail introuvable');
        const indices = indicesDuMail(mail);
        const pour = destinataire(mail, indices.deal);
        const signature = pour ? (Records.list('User').find((u) => norm(u.email) === pour)?.full_name || '').split(' ')[0] || null : null;
        const lecture = charge.lecture || await classerMail(mail, { indices, signature });
        const type = NATURES[lecture.nature]?.type;
        // Un type éteint, ou rien à faire : noté sur le mail, sans question.
        if (!type || !ambiantPour(type)) {
          Records.update('MailRecu', mail.id, { haka_ambiant: { ...(mail.haka_ambiant || {}), nature: lecture.nature, resume: lecture.resume, raison: type ? `${NATURES[lecture.nature].libelle} : non traité (type éteint)` : 'Rien à faire', le: new Date().toISOString() }, haka_attente_rangement: false });
          return { lecture, fin: true };
        }
        if (lecture.nature !== 'documents') Records.update('MailRecu', mail.id, { haka_attente_rangement: false });
        return { lecture, pour, dossier: indices.deal?.deal_id || null };
      },
    },
    {
      nom: 'proposer',
      async run({ tache, charge, resultats }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        const { lecture, pour, dossier } = resultats.classer;
        const indices = indicesDuMail(mail);
        const de = boiteQuiEnvoie(mail.compte, pour);
        const g = gesteDe(lecture, mail, { deal: indices.deal, client: indices.client, pour, de });
        if (!g) {
          Records.update('MailRecu', mail.id, { haka_ambiant: { ...(mail.haka_ambiant || {}), nature: lecture.nature, resume: lecture.resume, raison: 'Rien à proposer', le: new Date().toISOString() } });
          return { fin: true };
        }
        const groupe = g.geste === 'ranger' && dossier ? `ranger:${dossier}` : null;
        // Regroupement : plusieurs envois de pièces pour le même dossier dans l'heure font une seule question.
        const ouverte = questionAEnrichir(groupe);
        if (ouverte) {
          const mails = [...new Set([...(ouverte.charge.mails || []), mail.id])];
          const pieces = [...(ouverte.charge.pieces || []), ...g.pieces.filter((p) => !(ouverte.charge.pieces || []).some((x) => norm(x.nom) === norm(p.nom)))];
          const n = pieces.length;
          Records.update('HakaProposition', ouverte.id, {
            titre: `${n} pièces reçues pour ${indices.deal?.nom || 'le dossier'} : je les range ?`,
            resume: `${[...new Set(pieces.map((p) => TYPES_PIECES[p.type]))].join(', ')}, en ${mails.length} mails.`,
            charge: { ...ouverte.charge, mails, pieces }, sources: [...(ouverte.sources || []), sourceMail(mail)],
          });
          Records.update('MailRecu', mail.id, { haka_ambiant: { ...(mail.haka_ambiant || {}), nature: lecture.nature, proposition_id: ouverte.id, regroupe: true, le: new Date().toISOString() } });
          return { regroupe: ouverte.id, fin: true };
        }
        const charge_p = { ...g, mail_id: mail.id, nature: lecture.nature, confiance: lecture.confiance, phrase: lecture.phrase, resume_mail: lecture.resume, de_mail: nomDe(mail), de_email: norm(mail.de_email), objet_mail: mail.objet || '', groupe, dossier, client_id: indices.client?.id || null };
        const sources = [sourceMail(mail, dossier ? `/Dossiers?deal_id=${dossier}` : null)];
        if (indices.client) sources.push(source({ outil: 'clients', libelle: `Fiche client : ${indices.client.client_nom || indices.client.client_email}`, lien: `/AdminClients?client=${indices.client.id}` }));
        const p = await file.proposer({
          type: 'mail_ambiant', titre: g.titre,
          resume: [lecture.phrase ? `« ${lecture.phrase} »` : null, g.detail].filter(Boolean).join(' '),
          charge: charge_p, sources, pour, dossier, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'executer',
          cle: `ambiant:${mail.id}`, actions: ['oui_non'],
        });
        Records.update('MailRecu', mail.id, { haka_ambiant: { ...(mail.haka_ambiant || {}), nature: lecture.nature, proposition_id: p.id, le: new Date().toISOString() } });
        return { attendre: 'validation', proposition_id: p.id, pour };
      },
    },
    {
      nom: 'executer', externe: true,
      async run({ tache, charge, resultats, user }) {
        const { pour, dossier } = resultats.classer || {};
        const mail = Records.get('MailRecu', tache.charge.mail_id);
        let r;
        if (charge.geste === 'ranger') r = await rangerPieces(charge, { user, uploadDir: tache.charge.uploadDir });
        else if (charge.geste === 'rappel') r = await poserRappel({ ...charge, dossier }, { pour, user, proposition_id: charge.proposition_id });
        else if (charge.geste === 'mail') r = await envoyerReponse(charge, { pour, user, proposition_id: charge.proposition_id, deal_id: dossier });
        else throw new Error(`Geste inconnu : ${charge.geste}`);
        apprendre(mail, { nature: charge.nature, decision: 'oui', par: user?.email });
        if (dossier) {
          const deal = Records.findBy('Deal', 'deal_id', dossier);
          if (deal) { const { ajouterSuivi } = await import('../deal/lifecycle.js'); ajouterSuivi(deal, { type: 'haka', detail: `L'Assistant KPartners, sur oui de ${user?.email || '?'} : ${charge.geste === 'ranger' ? `${(r.deposes || []).length} pièce(s) rangée(s)` : charge.geste === 'rappel' ? `rappel posé (${charge.quoi})` : `réponse envoyée à ${charge.a}`}` }, user); }
        }
        return { geste: charge.geste, ...r, le: new Date().toISOString() };
      },
    },
  ],
  // Non : le motif (obligatoire, vérifié par la file) apprend à Haka ; des pièces refusées ne se rangent pas.
  async surRejet(t, proposition, user) {
    // La file passe la proposition d'avant le rejet : son motif se relit.
    proposition = Records.get('HakaProposition', proposition.id) || proposition;
    const charge = proposition.charge || {};
    for (const id of charge.mails || [charge.mail_id]) {
      const mail = Records.get('MailRecu', id);
      if (!mail) continue;
      Records.update('MailRecu', id, { haka_ambiant: { ...(mail.haka_ambiant || {}), refuse: { par: norm(user?.email), motif: proposition.motif_rejet || null, le: new Date().toISOString() } } });
    }
    apprendre(Records.get('MailRecu', charge.mail_id), { nature: charge.nature, decision: 'non', motif: proposition.motif_rejet, par: user?.email });
  },
});

// ---------------------------------------------------------------------------
// Le déclencheur : après chaque relevé des boîtes
// ---------------------------------------------------------------------------

/** Pure : ce mail est-il pour Haka ambiant ? (Ni une fiche, ni une demande à Haka, ni un mail interne, ni déjà vu.) */
export function estPourAmbiant(m, { depuis = null, porteUneFiche = () => false } = {}) {
  if (!m || m.haka_ambiant || m.haka_tache_id || m.commande || m.interne || m.simule_fiche) return false;
  if (depuis && Date.parse(m.date || 0) < Date.parse(depuis)) return false;
  // Une fiche sans dossier a sa compétence (fiche reçue) ; rattachée à un dossier, ses pièces sont des documents.
  if (!m.deal_id && porteUneFiche(m)) return false;
  return true;
}

/** Un mail devient une tâche. `lecture` / `invoke` : pour les essais (sans modèle). */
export function surMail(mail, { uploadDir = null, lancer, lecture = null } = {}) {
  const t = taches.enfiler(COMPETENCE, { mail_id: mail.id, uploadDir, ...(lecture ? { lecture } : {}) }, { cle: `ambiant:${mail.id}`, pour: destinataire(mail, mail.deal_id ? Records.findBy('Deal', 'deal_id', mail.deal_id) : null), dossier: mail.deal_id || null, ...(lancer === undefined ? {} : { lancer }) });
  // Des pièces sur un dossier attendent le oui : l'ingestion automatique ne les prend pas avant.
  const attente = ambiantPour('documents') && !!mail.deal_id && piecesUtiles(mail).length > 0;
  Records.update('MailRecu', mail.id, { haka_ambiant: { tache_id: t.id, le: new Date().toISOString() }, ...(attente ? { haka_attente_rangement: true } : {}) });
  return t;
}

/** Après un relevé : chaque nouveau mail pour Haka entre en file ; les questions traitées à la main se retirent. */
export async function surReleveAmbiant({ uploadDir = null } = {}) {
  const bilan = { en_file: 0, retirees: 0, erreurs: [] };
  let depuis = Meta.get(CLE_DEPUIS);
  if (!depuis) { depuis = new Date().toISOString(); Meta.set(CLE_DEPUIS, depuis); }
  const { porteUneFiche } = await import('../deal/fiches-auto.js');
  for (const mail of Records.list('MailRecu').filter((m) => estPourAmbiant(m, { depuis, porteUneFiche })).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    try { surMail(mail, { uploadDir }); bilan.en_file += 1; } catch (e) { bilan.erreurs.push(`Mail « ${mail.objet || mail.id} » : ${e?.message || e}`); }
  }
  bilan.retirees = nettoyer();
  return bilan;
}

/**
 * Les questions dont le mail a été traité à la main se retirent : les pièces sont déjà rangées, ou une réponse est
 * partie vers l'expéditeur après l'arrivée du mail. Rend le nombre retiré.
 */
export function nettoyer() {
  let n = 0;
  for (const p of Records.list('HakaProposition').filter((x) => x.type === 'mail_ambiant' && x.etat === 'proposee')) {
    const c = p.charge || {};
    let raison = null;
    if (c.geste === 'ranger') {
      const deal = c.dossier ? Records.findBy('Deal', 'deal_id', c.dossier) : null;
      const noms = new Set((deal?.documents_espace || []).map((d) => norm(d.nom)));
      if ((c.pieces || []).length && c.pieces.every((x) => [...noms].some((d) => d.includes(norm(x.nom).replace(/[^a-z0-9._-]/g, '_')) || d.includes(norm(x.nom))))) raison = 'Pièces déjà rangées à la main.';
    } else if (c.de_email) {
      const recu = Records.get('MailRecu', c.mail_id);
      const apres = String(recu?.date || p.cree_le);
      const partie = Records.list('EmailLog').some((e) => e.direction !== 'entrant' && norm(e.to || e.destinataire) === c.de_email && String(e.sent_at || e.created_date || '') > apres && !String(e.template_id || '').startsWith('haka:'));
      if (partie) raison = 'Une réponse est déjà partie à la main.';
    }
    if (!raison) continue;
    file.retirer(p.id, raison);
    n += 1;
  }
  return n;
}

/** Pure : ce que Haka ambiant a fait d'un mail, pour Administration › Automatismes. */
export function verdictAmbiant(m) {
  const a = m?.haka_ambiant;
  if (!a) return null;
  if (a.refuse) return { verdict: 'ecartee', raison: `Vous avez répondu Non${a.refuse.motif ? ` : « ${a.refuse.motif} »` : ''}.` };
  if (a.regroupe) return { verdict: 'proposee', raison: 'Regroupé avec la question ouverte du même dossier.' };
  if (a.proposition_id) return { verdict: 'proposee', raison: `${NATURES[a.nature]?.libelle || 'Mail'} : une question oui / non attend dans la cloche.` };
  if (a.raison) return { verdict: 'ecartee', raison: `${a.raison}${a.resume ? ` (« ${court(a.resume, 120)} »)` : ''}.` };
  return { verdict: 'en_attente', raison: 'L\'Assistant KPartners le lit.' };
}
