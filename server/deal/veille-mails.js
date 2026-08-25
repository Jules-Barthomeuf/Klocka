// Veille des boîtes mail.
//
// Relève périodique de toutes les boîtes connectées, puis rattachement des
// réponses au dossier concerné. Aujourd'hui la relève est déclenchée à la main
// depuis la page Mails et `deal_id` reste nul jusqu'à ce qu'un humain clique :
// l'assistant ne peut donc rien voir arriver. C'est ce que ce module corrige.
//
// Le rattachement est déterministe : l'adresse de l'expéditeur est comparée au
// contact agent des dossiers ouverts. Aucun modèle n'intervient — un mail mal
// rattaché coûterait plus cher que pas de rattachement du tout.

import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';
import { releverBoite } from '../gmail-inbox.js';
import { gmailReadDemande } from '../google-oauth.js';
import { statutDe, ajouterSuivi } from './lifecycle.js';
import { synchroniserAgents } from './crm-sync.js';
import { ingererEnAttente } from './pieces-mails.js';

// Un dossier clos ne reçoit plus de réponse : inutile d'y rattacher un mail.
const OUVERTS = ['analyse', 'documents_demandes', 'documents_recus', 'depouille'];

const MINUTES = Math.max(1, Number(process.env.MAIL_VEILLE_MINUTES || 5));

// La veille tourne sans requête HTTP : elle résout elle-même le dossier des
// uploads, plutôt que de dépendre d'un paramètre transmis.
const CHEMIN_UPLOADS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

let minuterie = null;
let enCours = false;
let dernier = { le: null, nouveaux: 0, rattaches: 0, erreurs: [] };

function comptesLisibles() {
  return Records.list('MailAccount').filter((a) => a.peut_lire && a.email);
}

/**
 * Rattache les mails encore orphelins au dossier dont ils sont la réponse.
 * Critère unique : l'expéditeur est le contact agent d'un dossier ouvert. À
 * égalité, le dossier le plus récemment actif l'emporte.
 * @returns {number} nombre de mails rattachés
 */
export function rattacherMailsOrphelins() {
  const orphelins = Records.list('MailRecu').filter((m) => !m.deal_id && m.de_email);
  if (!orphelins.length) return 0;

  const ouverts = Records.list('Deal')
    .filter((d) => !d.archived && d.contact_agent_email && OUVERTS.includes(statutDe(d)))
    .sort((a, b) => String(b.updated_date || '').localeCompare(String(a.updated_date || '')));
  if (!ouverts.length) return 0;

  let rattaches = 0;
  for (const mail of orphelins) {
    const expediteur = String(mail.de_email).toLowerCase();
    const deal = ouverts.find((d) => String(d.contact_agent_email).toLowerCase() === expediteur);
    if (!deal) continue;

    Records.update('MailRecu', mail.id, { deal_id: deal.deal_id });
    ajouterSuivi(
      Records.get('Deal', deal.id),
      {
        type: 'mail_recu',
        detail: [
          `Réponse de ${mail.de_email}`,
          mail.objet ? `« ${mail.objet} »` : null,
          (mail.pieces_jointes || []).length
            ? `${mail.pieces_jointes.length} pièce(s) jointe(s)`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      null
    );
    rattaches += 1;
  }
  return rattaches;
}

/**
 * Relève toutes les boîtes connectées, puis rattache ce qui peut l'être.
 * Une boîte en erreur n'empêche pas les autres.
 */
export async function relever(uploadDir = null) {
  if (enCours) return dernier;
  enCours = true;
  const erreurs = [];
  let nouveaux = 0;
  let ecartes = 0;
  try {
    for (const compte of comptesLisibles()) {
      try {
        const r = await releverBoite(compte.email, { max: 25 });
        nouveaux += r?.nouveaux || 0;
        ecartes += r?.ecartes || 0;
      } catch (e) {
        erreurs.push(`${compte.email} : ${e?.message || e}`);
      }
    }
    const rattaches = rattacherMailsOrphelins();

    // Les pièces jointes des réponses entrent dans leur dossier et partent au
    // dépouillement : quand l'analyste ouvre le dossier, les données sont là.
    let pieces = { mails: 0, documents: 0 };
    const dossier = uploadDir || CHEMIN_UPLOADS;
    if (dossier) {
      pieces = await ingererEnAttente(dossier);
      erreurs.push(...(pieces.erreurs || []));
    }

    // Les agents entrent au CRM tout seuls : l'information est déjà sur les
    // dossiers, personne n'a à la ressaisir.
    const crm = synchroniserAgents();
    dernier = { le: new Date().toISOString(), nouveaux, ecartes, rattaches, pieces, crm, erreurs };
  } finally {
    enCours = false;
  }
  return dernier;
}

/** Dernier passage de la veille, pour l'afficher sans la déclencher. */
export const etatVeille = () => ({ ...dernier, active: !!minuterie, minutes: MINUTES, lecture: gmailReadDemande });

/**
 * Démarre la veille périodique. Sans portée de lecture Gmail accordée, elle ne
 * démarre pas : il n'y aurait rien à relever.
 * @returns {boolean} true si la veille tourne
 */
export function demarrerVeille() {
  if (minuterie) return true;
  if (!gmailReadDemande) return false;
  // Premier passage immédiat, puis à intervalle régulier.
  relever().catch(() => {});
  minuterie = setInterval(() => relever().catch(() => {}), MINUTES * 60 * 1000);
  // La veille ne doit pas retenir le processus à l'arrêt.
  minuterie.unref?.();
  return true;
}

export function arreterVeille() {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
