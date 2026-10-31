// Haka, compétence « demande de l'équipe » (17 oct. 2026, Jules) : sourcing@
// est l'adresse où l'équipe écrit à Haka. Un mail d'un membre de l'équipe
// (une adresse @klocka.immo connue) est une demande : Haka la traite avec ses
// outils (le même moteur que le chat), dépose la réponse et son livrable dans
// « À valider », et répond par mail depuis sourcing@ avec le livrable et un
// lien vers la file. Cette réponse à un collègue part seule : elle ne sort pas
// de l'équipe. Le livrable lui-même (une LOI, un mail à un agent) ne part
// jamais vers l'extérieur sans un clic. Un expéditeur extérieur qui écrit à
// sourcing@ n'a jamais de réponse automatique : son mail va dans le Commun.

import { Records } from '../../db.js';
import { SIMULER, BOITES_COMMUNES } from '../drapeaux.js';
import * as taches from '../taches.js';
import * as file from '../file.js';
import { sourceMail, source } from '../sources.js';

export const COMPETENCE = 'demande_equipe';
export const VERSION = '1';
const norm = (e) => String(e || '').trim().toLowerCase();

let repondeur = null;
/** Pour les tests : remplace le moteur d'AK. */
export function _brancherRepondeur(fn) { repondeur = fn; }

const lienFile = (id) => `${(process.env.URL_PUBLIQUE || 'https://app.klocka.immo').replace(/\/$/, '')}/AValider?id=${id}`;

/** Le membre de l'équipe qui a écrit, s'il est connu (un admin à cette adresse), sinon null. */
export function membreDeLEquipe(email) {
  const e = norm(email);
  if (!e) return null;
  const u = Records.list('User').find((x) => norm(x.email) === e && x.role === 'admin');
  return u || null;
}

taches.enregistrer(COMPETENCE, {
  version: VERSION,
  etapes: [
    {
      nom: 'repondre',
      async run({ tache, charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        if (!mail) throw new Error('Mail introuvable');
        const membre = membreDeLEquipe(mail.de_email);
        if (!membre) return { fin: true, ignore: 'expéditeur hors équipe' };
        const demande = `${mail.objet ? `${mail.objet}\n\n` : ''}${String(mail.texte || '').trim()}`.trim();
        const repondre = repondeur || (await import('../../ak/app.js')).repondreApp;
        const r = await repondre({ texte: demande, historique: [], user: membre, contexte: { page: 'sourcing', mail_id: mail.id }, pieces: [] });
        const texte = String(r?.texte || '').trim() || "Je n'ai pas su répondre à cette demande.";
        const actions = (r?.actions || []).map((a) => (typeof a === 'string' ? a : a?.libelle || a?.outil || a?.name)).filter(Boolean);
        const p = await file.proposer({
          type: 'reponse_equipe', titre: `Réponse à ${membre.full_name || membre.email} : ${String(mail.objet || 'votre demande').slice(0, 60)}`,
          resume: actions.length ? `Fait : ${actions.slice(0, 4).join(', ')}.` : null,
          charge: { demande, reponse: texte, actions, brouillon: r?.brouillon || null },
          sources: [sourceMail(mail), ...(r?.sources || []).slice(0, 5)],
          pour: norm(membre.email), dossier: null, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: null, cout_usd: tache.cout_usd,
          cle: `reponse:${mail.id}`, actions: ['vu'],
        });
        return { proposition_id: p.id, texte, actions, pour: norm(membre.email), a: norm(membre.email), objet: mail.objet || null, mail_id: mail.id };
      },
    },
    {
      // Interne (une réponse à un collègue) mais garde-fou d'idempotence : jamais deux fois le même mail.
      nom: 'repondre_par_mail',
      async run({ resultats }) {
        const r = resultats.repondre;
        if (!r?.a) return { ignore: true };
        return ecrireDepuisSourcing({ a: r.a, objet: `Re: ${r.objet || 'votre demande'}`, corps: `${r.texte}\n\nÀ valider : ${lienFile(r.proposition_id)}\n\nHaka`, template_id: `haka-reponse:${r.mail_id}` });
      },
    },
  ],
});

/**
 * Haka écrit à un collègue depuis sourcing@ (une réponse interne, qui part seule). Jamais deux fois le même
 * `template_id`. Sans boîte sourcing@ connectée, ou en simulation, le mail est noté sans partir.
 */
export async function ecrireDepuisSourcing({ a, objet, corps, template_id }) {
  if (Records.filter('EmailLog', { template_id }).some((e) => e.statut === 'envoye' || e.statut === 'simule')) return { deja: true, a };
  const compte = [...BOITES_COMMUNES][0] || 'sourcing@klocka.immo';
  const account = Records.filter('MailAccount', { email: compte })[0] || null;
  if (SIMULER || !account) {
    const { logEmail } = await import('../../email.js');
    logEmail({ from: compte, expediteur: compte, to: a, destinataire: a, subject: objet, sujet: objet, body: corps, contenu: corps, template_id, direction: 'sortant', statut: 'simule', error: SIMULER ? 'Simulation Assistant KPartners' : 'Boîte sourcing@ non connectée', sent_at: new Date().toISOString() });
    return { simule: true, a };
  }
  const { sendEmail } = await import('../../email.js');
  const envoi = await sendEmail({ from: compte, owner: account.owner_email || account.email, to: a, subject: objet, body: corps, template_id });
  return { envoye: !!envoi?.success, simule: !!envoi?.simulated, a, message_id: envoi?.messageId || null };
}

/** Un extérieur écrit à sourcing@ : rien ne part, le mail est dans le Commun, à regarder. */
export async function signalerExterieur(mail) {
  const p = await file.proposer({
    type: 'mail_exterieur', titre: `Mail reçu sur sourcing@ : ${String(mail.objet || 'sans objet').slice(0, 80)}`,
    resume: `${String(mail.de || mail.de_email || '?').replace(/<[^>]*>/g, '').trim()} a écrit. L'Assistant KPartners ne répond jamais seul à l'extérieur : à vous de voir.`,
    charge: { mail_id: mail.id, de: mail.de_email || null, objet: mail.objet || null, extrait: String(mail.texte || '').slice(0, 600) },
    sources: [sourceMail(mail), source({ outil: 'gmail', libelle: 'Ouvrir dans la boîte', lien: '/Dashboard' })],
    pour: null, dossier: mail.deal_id || null, competence: COMPETENCE, version: VERSION, tache_id: null, etape: null,
    cle: `exterieur:${mail.id}`, actions: ['vu'],
  });
  Records.update('MailRecu', mail.id, { haka_vu: p.id });
  return p;
}
