// Tri des mails relevés : ce qui concerne un dossier, et ce qui n'y est pour rien.
//
// Une boîte professionnelle mélange les fiches d'agents et tout le reste —
// échanges internes, factures, newsletters, conversations sans rapport. Tout
// remonter noierait le plan de travail ; tout filtrer ferait rater des fiches.
//
// Le tri est déterministe et se fonde sur ce qu'on sait déjà, dans cet ordre :
//
//   1. Un expéditeur interne (l'équipe elle-même) n'est jamais un dossier.
//   2. Un expéditeur déjà connu comme agent — parce qu'il a apporté un dossier
//      ou qu'il est fiché au CRM — est toujours pertinent.
//   3. Une pièce jointe exploitable (PDF, bureautique, image) rend le mail
//      candidat : c'est le geste d'un agent qui transmet.
//   4. À défaut, le vocabulaire du métier dans l'objet.
//
// Chaque mail retenu porte la raison de sa sélection : elle s'affiche, et se
// discute. Un mail écarté n'est pas stocké — la boîte de réception de
// l'application reste le reflet des dossiers, pas une copie de Gmail.

import { Records } from '../db.js';

// Domaines de l'équipe : un mail interne parle d'autre chose qu'un dossier.
const DOMAINES_INTERNES = (process.env.MAIL_DOMAINES_INTERNES || '')
  .split(',')
  .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

// Expéditeurs à ignorer quoi qu'il arrive (notifications, facturation…).
const EXPEDITEURS_IGNORES = (process.env.MAIL_EXPEDITEURS_IGNORES || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Le vocabulaire d'une fiche commerciale de murs commerciaux.
const MOTS_METIER = [
  'bail', 'local commercial', 'locaux commerciaux', 'murs', 'fonds de commerce',
  'rendement', 'loyer', 'fiche', 'annonce', 'investissement', 'copropriété',
  "assemblée générale", 'pv ag', 'diagnostic', 'quittance', 'mandat', 'offre',
  'acquisition', 'cession', 'preneur', 'bailleur', 'taxe foncière', 'lot',
];

// Ce qu'un agent transmet réellement.
const PIECES_UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp|eml)$/i;
const PIECES_INUTILES = /^(image\d+|logo|signature|banniere|banner|icon)/i;

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const domaineDe = (email) => String(email || '').toLowerCase().split('@')[1] || '';

/** Adresses de l'équipe : comptes connectés et utilisateurs administrateurs. */
function adressesInternes() {
  const comptes = Records.list('MailAccount').map((a) => String(a.email || '').toLowerCase());
  const admins = Records.filter('User', { role: 'admin' }).map((u) => String(u.email || '').toLowerCase());
  return new Set([...comptes, ...admins].filter(Boolean));
}

/** Adresses déjà identifiées comme agents : dossiers apportés et fiches CRM. */
function adressesAgents() {
  const deals = Records.list('Deal')
    .map((d) => String(d.contact_agent_email || '').toLowerCase())
    .filter(Boolean);
  const contacts = Records.list('Contact')
    .map((c) => String(c.email || '').toLowerCase())
    .filter(Boolean);
  return new Set([...deals, ...contacts]);
}

/** Le référentiel, chargé une fois par relève plutôt qu'une fois par mail. */
export function referentielTri() {
  const internes = adressesInternes();
  // Le domaine de l'équipe se déduit des comptes connectés si rien n'est déclaré.
  const domaines = new Set(DOMAINES_INTERNES);
  if (!domaines.size) {
    for (const email of internes) {
      const d = domaineDe(email);
      // Les boîtes grand public ne définissent pas un domaine d'équipe.
      if (d && !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.fr', 'yahoo.com'].includes(d)) {
        domaines.add(d);
      }
    }
  }
  return { internes, domaines, agents: adressesAgents(), ignores: new Set(EXPEDITEURS_IGNORES) };
}

/**
 * Ce mail concerne-t-il un dossier ?
 * @param {{de_email, objet, extrait, pieces_jointes}} mail
 * @param {object} ref - referentielTri()
 * @returns {{ garder: boolean, raison: string }}
 */
export function trierMail(mail, ref) {
  const email = String(mail.de_email || '').toLowerCase();
  const domaine = domaineDe(email);

  if (!email) return { garder: false, raison: 'expéditeur illisible' };
  if (ref.ignores.has(email)) return { garder: false, raison: 'expéditeur ignoré' };
  if (ref.internes.has(email)) return { garder: false, raison: 'échange interne' };
  if (domaine && ref.domaines.has(domaine)) return { garder: false, raison: 'échange interne' };

  // Un agent connu passe toujours : c'est peut-être la réponse qu'on attend.
  if (ref.agents.has(email)) return { garder: true, raison: 'agent connu' };

  const pieces = (mail.pieces_jointes || []).filter(
    (p) => PIECES_UTILES.test(p.nom || '') && !PIECES_INUTILES.test(p.nom || '')
  );
  if (pieces.length) return { garder: true, raison: `pièce jointe (${pieces[0].nom})` };

  const texte = norm(`${mail.objet || ''} ${mail.extrait || ''}`);
  const mot = MOTS_METIER.find((m) => texte.includes(norm(m)));
  if (mot) return { garder: true, raison: `objet : « ${mot} »` };

  return { garder: false, raison: 'sans rapport apparent' };
}
