// Haka, compétence « relances du matin » (17 oct. 2026, Jules) : chaque matin
// à 8 h (lundi-vendredi, sur Render), les relances dues qu'on peut faire par
// mail sont préparées et déposées dans la file : une par relance, pour
// l'analyste propriétaire de l'agent (celui qui l'a appelé en premier), le mail
// prêt dans SA boîte ; sans propriétaire, dans le Commun. Valider envoie et
// note la relance comme après un appel (contact, fiche, Monday, prochaine
// relance un mois plus tard) ; rejeter écarte le mail, la relance reste due.
//
// La préparation réutilise telle quelle celle de la page Relances
// (server/prospection/relances-mail.js) : un ProspectionMail « prêt » par
// relance, que la file porte ensuite.

import { Records, Meta } from '../../db.js';
import { MATIN } from '../drapeaux.js';
import * as taches from '../taches.js';
import * as file from '../file.js';
import { source } from '../sources.js';
import { boiteQuiEnvoie } from '../proprietaire.js';
import { enPause, ignorer } from '../automatismes.js';

export const COMPETENCE = 'relances_matin';
export const VERSION = '1';
const SOUS = 'relance_mail';
const norm = (e) => String(e || '').trim().toLowerCase();

/** Pure : l'analyste propriétaire d'un agent, celui qui l'a appelé en premier (un appel validé, pas un essai), s'il est de l'équipe. */
export function proprietaireDeLAgent(agentId, { appels = null, users = null } = {}) {
  if (!agentId) return null;
  const liste = (appels || Records.list('AppelAgent')).filter((a) => a.agent_id === agentId && a.etat === 'valide' && !a.essai && a.par).sort((x, y) => String(x.le || '').localeCompare(String(y.le || '')));
  const premier = liste[0];
  if (!premier) return null;
  const email = norm(premier.par);
  const admins = new Set((users || Records.list('User')).filter((u) => u.role === 'admin').map((u) => norm(u.email)));
  return admins.has(email) ? email : null;
}

const utilisateur = (email) => Records.list('User').find((u) => norm(u.email) === norm(email)) || null;

taches.enregistrer('relance_mail', {
  competence: 'mails-agents',
  version: VERSION,
  etapes: [
    {
      nom: 'proposer',
      async run({ tache, charge }) {
        const m = Records.get('ProspectionMail', charge.mail_id);
        if (!m) throw new Error('Mail de relance introuvable');
        if (m.etat !== 'pret') return { fin: true, deja: m.etat };
        const pour = tache.pour || null;
        const p = await file.proposer({
          type: 'relance_mail', titre: `Relancer ${m.nom || m.agence || m.a}${m.motif ? ` · ${m.motif}` : ''}`,
          resume: [m.agence && m.nom ? `${m.agence}${m.ville ? `, ${m.ville}` : ''}.` : null, m.ligne_le ? `Relance prévue le ${m.ligne_le}.` : null, !pour ? "Aucun analyste n'a encore appelé cet agent : à qui le veut." : null].filter(Boolean).join(' '),
          charge: { a: m.a, de: boiteQuiEnvoie(null, pour), objet: m.objet, corps: m.corps, mail_id: m.id, agent_id: m.agent_id || null },
          sources: [source({ outil: 'prospection', service: 'ProspectionMail', libelle: `Relance due${m.motif ? ` (${m.motif})` : ''}, préparée par l'Assistant KPartners`, lien: m.agent_id ? `/Agents?agent=${m.agent_id}` : '/Prospection?partie=listes' })],
          pour, dossier: null, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'envoyer', cout_usd: tache.cout_usd,
          cle: `relance_mail:${m.id}`, source_migration: { module: 'prospection', entite: 'ProspectionMail', id: m.id },
        });
        Records.update('ProspectionMail', m.id, { haka_proposition_id: p.id });
        return { attendre: 'validation', proposition_id: p.id };
      },
    },
    {
      // Externe : le mail part de la boîte du propriétaire (même si Jules valide), la relance se note comme après un appel.
      nom: 'envoyer', externe: true,
      async run({ tache, charge, user }) {
        const { validerRelanceMail } = await import('../../prospection/relances-mail.js');
        const expediteur = (tache.pour && utilisateur(tache.pour)) || user;
        const r = await validerRelanceMail(charge.mail_id, { objet: charge.objet ?? null, corps: charge.corps ?? null, a: charge.a ?? null }, expediteur);
        if (!r.ok) throw new Error(r.error || "Le mail n'est pas parti");
        return { envoye: true, relance_le: r.relance_le, recu: r.recu, par: norm(expediteur?.email) };
      },
    },
  ],
  // Rejeter dans la file écarte le mail : la relance reste due, à faire autrement.
  async surRejet(tache, proposition, user) {
    const { ignorerRelanceMail } = await import('../../prospection/relances-mail.js');
    if (proposition?.charge?.mail_id) ignorerRelanceMail(proposition.charge.mail_id, user);
  },
});

taches.enregistrer(COMPETENCE, {
  competence: 'mails-agents',
  version: VERSION,
  etapes: [
    {
      nom: 'preparer',
      async run({ charge }) {
        const { preparerRelancesMail } = await import('../../prospection/relances-mail.js');
        const maintenantD = charge.maintenant ? new Date(charge.maintenant) : new Date();
        const r = await preparerRelancesMail({ user: null, maintenantD, rediger: charge.rediger || null });
        // Tout mail prêt sans tâche entre en file, y compris ceux préparés à la main depuis la page.
        const prets = Records.list('ProspectionMail').filter((m) => !m.essai && m.etat === 'pret' && m.sous_genre === SOUS && !m.haka_tache_id);
        let enFile = 0;
        for (const m of prets) {
          const t = taches.enfiler('relance_mail', { mail_id: m.id }, { cle: `relance:${m.id}`, pour: proprietaireDeLAgent(m.agent_id), lancer: charge.lancer });
          Records.update('ProspectionMail', m.id, { haka_tache_id: t.id });
          enFile += 1;
        }
        return { prepares: r.prepares || 0, sans_adresse: r.sans_adresse || 0, en_file: enFile, fin: true };
      },
    },
  ],
});

const CLE_DERNIER = 'haka.matin.dernier';
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const heureParis = (d = new Date()) => Number(String(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(d)).replace(/\D/g, '')) % 24;
const jourSemaineParis = (d = new Date()) => new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d);

/** Pure : faut-il lancer le tour du matin maintenant ? Lundi à vendredi, à partir de 8 h, une fois par jour. */
export function aLancer({ maintenant = new Date(), dernier = null } = {}) {
  if (['Sat', 'Sun'].includes(jourSemaineParis(maintenant))) return false;
  if (heureParis(maintenant) < 8) return false;
  return dernier !== jourParis(maintenant);
}

/** Le tour du matin : lance la préparation une fois par jour ouvré. */
export function tourDuMatin({ maintenant = new Date() } = {}) {
  if (!aLancer({ maintenant, dernier: Meta.get(CLE_DERNIER) })) return null;
  const jour = jourParis(maintenant);
  Meta.set(CLE_DERNIER, jour);
  // L'automatisme en pause : le tour est noté « ignoré (en pause) », relançable après la reprise.
  if (enPause('mails-agents')) { ignorer('mails-agents', { declencheur: 'planifie', relance: { type: COMPETENCE, charge: { jour }, cle: `${COMPETENCE}:${jour}` } }); return null; }
  return taches.enfiler(COMPETENCE, { jour }, { cle: `${COMPETENCE}:${jour}` });
}

export function planifier() {
  if (!MATIN) return null;
  const t = setInterval(() => { try { tourDuMatin(); } catch (e) { console.error('[haka matin] :', e?.message || e); } }, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(() => { try { tourDuMatin(); } catch (e) { console.error('[haka matin] :', e?.message || e); } }, 120 * 1000).unref?.();
  return t;
}
