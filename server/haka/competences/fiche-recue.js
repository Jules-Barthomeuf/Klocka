// Haka, compétence « fiche reçue », version 1 (17 oct. 2026, Jules).
//
// Une fiche commerciale arrive dans la boîte d'un analyste :
//   0. proposer_preanalyse  (19 oct. 2026, Jules : « au lieu de faire la préanalyse tout seul, une notification
//                           qu'on accepte ou pas ») la fiche attend dans la file : « Pré-analyser » ou « Pas une fiche »
//      accepter_preanalyse  (externe) la réponse ; « Pas une fiche » clôt, le mail le garde (`fiche_refusee`)
//   1. creer_dossier        le dossier naît, attribué à l'analyste de la boîte, pré-analysé
//   2. preanalyse           la provenance « par Haka » est posée, la personne est prévenue
//   3. verifier_doublon     même adresse et même prix → rattaché au dossier existant, dit dans la file ;
//                           même adresse sans le prix, ou adresse proche → on demande (rattacher ou créer)
//   4. trancher_doublon     (externe) la réponse de la personne
//   5. proposer_demande_documents   le mail à l'agent, prêt, dans la file
//   6. envoyer_demande_documents    (externe) part de la boîte de l'analyste, au clic
//
// Rien ne part sans un clic ; tout ce qui précède est écrit sur le dossier,
// marqué « par Haka ». Plafond : HAKA_PLAFOND_JOUR dossiers par jour.

import fs from 'node:fs';
import { Records } from '../../db.js';
import { SIMULER, PLAFOND_JOUR } from '../drapeaux.js';
import * as taches from '../taches.js';
import * as file from '../file.js';
import { sourceMail, sourceFiche, sourceEvaluation, source } from '../sources.js';
import { bienDuDossier, chercherDoublons } from '../doublons.js';
// Le prix et l'agence du dossier qui arrive, pour la phrase « aujourd'hui 420 k€ chez Y » de la Mémoire.
const bienPrixAgence = (deal) => ({ prix: bienDuDossier(deal).prix, agent: { agence: deal?.apercu?.agence || null, nom: deal?.apercu?.agent_nom || null } });
import { proprietaireDeLaBoite, boiteQuiEnvoie } from '../proprietaire.js';
import { piecesFiche } from '../../deal/fiches-auto.js';

export const COMPETENCE = 'fiche_recue';
export const VERSION = '2';

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? (x.absent ? null : x.valeur) : x);
const lienDossier = (id) => `/Dossiers?deal_id=${id}`;
const demainSeptHeures = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return d.toISOString(); };

/** Le dossier naît du mail : par la voie habituelle (Gmail), ou depuis une pièce locale (bac à sable, tests). */
async function creerDepuisMail(mail, { user, uploadDir, contactEmail }) {
  const locale = (mail.pieces_jointes || []).find((p) => String(p?.piece_id || '').startsWith('local:'));
  if (locale || SIMULER) {
    if (!locale) throw new Error('Simulation : le mail n\'a pas de pièce locale à lire.');
    const chemin = String(locale.piece_id).slice('local:'.length);
    const { analyserFiche } = await import('../../deal/index.js');
    const dossier = await analyserFiche({ buffer: fs.readFileSync(chemin), filename: locale.nom, mimetype: locale.mime || undefined, contactEmail }, { user, uploadDir });
    Records.update('MailRecu', mail.id, { deal_id: dossier.deal_id });
    Records.update('Deal', Records.findBy('Deal', 'deal_id', dossier.deal_id).id, { source_mail: { mail_recu_id: mail.id, de: mail.de, objet: mail.objet, date: mail.date, piece: locale.nom } });
    return dossier;
  }
  const { preanalyserMail } = await import('../../deal/preanalyser-mail.js');
  return preanalyserMail(mail, { user, uploadDir, contactEmail, automatique: true });
}

taches.enregistrer(COMPETENCE, {
  competence: 'pre-analyse-fiche',
  version: VERSION,
  etapes: [
    {
      nom: 'proposer_preanalyse',
      async run({ tache, charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        if (!mail) throw new Error('Mail introuvable');
        // Déjà un dossier (un passage interrompu, ou un autre chemin) : rien à demander.
        if (mail.deal_id) return { sauter: ['accepter_preanalyse'] };
        const pour = proprietaireDeLaBoite(mail.compte)?.email || null;
        const de = String(mail.de || mail.de_email || 'un agent').replace(/<[^>]*>/g, '').trim() || mail.de_email;
        const pieces = piecesFiche(mail).map((p) => (typeof p === 'string' ? p : p?.nom)).filter(Boolean);
        const p = await file.proposer({
          // « Une nouvelle fiche commerciale est arrivée, je la rentre ? » (20 oct. 2026, Jules) : on l'ouvre (la fiche
          // ou le mail) avant de dire oui. Le mail et ses pièces se lisent par /api/haka/propositions/:id/mail et /piece/:n.
          type: 'preanalyser_fiche', titre: `Nouvelle fiche commerciale de ${de} : je la rentre ?`,
          resume: [mail.objet ? `« ${String(mail.objet).slice(0, 140)} »` : null, pieces.length ? `Pièce${pieces.length > 1 ? 's' : ''} : ${pieces.slice(0, 4).join(', ')}.` : null].filter(Boolean).join(' '),
          charge: { mail_id: mail.id, de, de_email: mail.de_email || null, compte: mail.compte || null, objet: mail.objet || '', pieces, extrait: String(mail.texte || '').replace(/\s+/g, ' ').trim().slice(0, 400) },
          sources: [sourceMail(mail)], pour, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'accepter_preanalyse',
          cle: `preanalyser:${mail.id}`, actions: ['choisir'], choix: [{ cle: 'preanalyser', libelle: 'Pré-analyser' }, { cle: 'ignorer', libelle: 'Pas une fiche' }],
        });
        return { attendre: 'validation', proposition_id: p.id, pour };
      },
    },
    {
      // Externe : la décision de la personne. « Pas une fiche » clôt sans rien créer ; « Pré-analyser » repart en fond.
      nom: 'accepter_preanalyse', externe: true,
      async run({ tache, charge, user }) {
        // Chaque réponse est gardée : Haka en apprend ce qu'est une fiche (haka/apprentissage-fiches.js). Un « Non »
        // sans raison n'est pas accepté (20 oct. 2026, Jules : « on est obligé de répondre »).
        const { enregistrer } = await import('../apprentissage-fiches.js');
        const mail = Records.get('MailRecu', tache.charge.mail_id);
        if (charge.choix === 'ignorer') {
          const motif = String(charge.motif || '').trim();
          if (motif.length < 3) throw new Error("Dites pourquoi vous ne la rentrez pas : c'est ce qui apprend à l'Assistant KPartners ce qu'est une fiche.");
          Records.update('MailRecu', tache.charge.mail_id, { fiche_refusee: { par: user?.email || null, le: new Date().toISOString(), categorie: charge.categorie || null, motif } });
          enregistrer(mail, { choix: 'ignorer', categorie: charge.categorie, motif, par: user?.email || null });
          return { choix: 'ignorer', categorie: charge.categorie || null, motif, fin: true };
        }
        enregistrer(mail, { choix: 'preanalyser', par: user?.email || null });
        return { choix: 'preanalyser', enFond: true };
      },
    },
    {
      nom: 'creer_dossier',
      async run({ tache, charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        if (!mail) throw new Error('Mail introuvable');
        const proprietaire = proprietaireDeLaBoite(mail.compte);
        const pour = proprietaire?.email || null;
        // Déjà un dossier (un passage interrompu, ou un autre chemin) : on continue avec lui.
        if (mail.deal_id) return { deal_id: mail.deal_id, deja: true, dossier: mail.deal_id, pour };
        // Le plafond du jour : la tâche attend demain, Jules est prévenu une fois.
        const jour = new Date().toISOString().slice(0, 10);
        if (taches.tachesDuJour(COMPETENCE, jour) > PLAFOND_JOUR) {
          const { notifier } = await import('../../notifications.js');
          const { SUPER_ADMINS } = await import('../../acces-pages.js');
          notifier({ pour: SUPER_ADMINS[0], titre: `Plafond Assistant KPartners atteint : ${PLAFOND_JOUR} dossiers aujourd'hui`, texte: 'Les fiches suivantes attendent demain 7 h. HAKA_PLAFOND_JOUR le relève.', lien: '/AValider', genre: 'haka', cle: `haka:plafond:${jour}` });
          return { differer: demainSeptHeures() };
        }
        const { referentielTri } = await import('../../deal/tri-mails.js');
        const ref = referentielTri();
        const de = String(mail.de_email || '').toLowerCase();
        const interne = !!mail.interne || ref.internes.has(de) || ref.domaines.has(de.split('@')[1] || '');
        const dossier = await creerDepuisMail(mail, { user: proprietaire?.user || null, uploadDir: charge.uploadDir || null, contactEmail: interne ? null : undefined });
        const rejoint = !!(dossier.repris_conversation || dossier.doublon);
        const deal = Records.findBy('Deal', 'deal_id', dossier.deal_id);
        if (deal && !rejoint) {
          const l = deal.lots?.[0]?.lot || {};
          const adresse = val(l.adresse) || {};
          const { titreDossier } = await import('../../deal/titre-dossier.js');
          const nom = titreDossier({ enseigne: val(l.locataire_nom), activite: val(l.locataire_activite), ville: (typeof adresse === 'object' && adresse.ville) || deal.lots?.[0]?.enrichissement?.commune?.nom || null });
          const apport = { de: mail.de_email || null, compte: mail.compte || null, mail_recu_id: mail.id, le: mail.date || new Date().toISOString() };
          Records.update('Deal', deal.id, {
            ...(nom ? { nom } : {}), cree_par_la_veille: true,
            ...(proprietaire ? { responsables: [proprietaire.nom], responsable_email: proprietaire.email } : {}),
            par_haka: { competence: COMPETENCE, version: VERSION, tache_id: tache.id, le: new Date().toISOString() },
            apports: [...(deal.apports || []), apport],
          });
          const { ajouterSuivi } = await import('../../deal/lifecycle.js');
          ajouterSuivi(Records.get('Deal', deal.id), { type: 'preanalyse_auto', detail: `Préanalysé par l'Assistant KPartners à l'arrivée du mail de ${mail.de_email || '?'} dans ${mail.compte}${proprietaire ? `, dossier attribué à ${proprietaire.nom}` : ''}` }, null);
        }
        return { deal_id: dossier.deal_id, rejoint, interne, dossier: dossier.deal_id, pour };
      },
    },
    {
      nom: 'preanalyse',
      async run({ resultats, charge }) {
        const { deal_id, rejoint, pour } = resultats.creer_dossier;
        const deal = Records.findBy('Deal', 'deal_id', deal_id);
        if (!deal) throw new Error('Dossier introuvable après création');
        if (rejoint) return { fin: true, rejoint: true };
        if (!deal.lots?.length) throw new Error('La pré-analyse n\'a pas produit de lot');
        const lots = deal.lots.map((l, i) => (i === 0 ? { ...l, par_haka: true } : l));
        Records.update('Deal', deal.id, { lots });
        const { notifier } = await import('../../notifications.js');
        const mail = Records.get('MailRecu', charge.mail_id);
        const l = deal.lots[0].lot || {};
        const prix = val(l.prix_fai);
        const verdict = deal.lots[0].evaluation?.verdict || null;
        notifier({
          pour, titre: `Nouvelle fiche : ${deal.nom || 'un bien'}`,
          texte: [`Reçue de ${String(mail?.de || mail?.de_email || 'un agent').replace(/<[^>]*>/g, '').trim()}.`, typeof prix === 'number' ? `${Math.round(prix).toLocaleString('fr-FR')} €.` : null, verdict ? `Pré-analyse : ${verdict}.` : null].filter(Boolean).join(' '),
          lien: lienDossier(deal_id), action: 'Voir la pré-analyse', genre: 'fiche', cle: `fiche:${deal_id}`,
        });
        return { verdict };
      },
    },
    {
      nom: 'verifier_doublon',
      async run({ tache, resultats, charge }) {
        const { deal_id, pour } = resultats.creer_dossier;
        const deal = Records.findBy('Deal', 'deal_id', deal_id);
        const bien = bienDuDossier(deal);
        const candidats = chercherDoublons(bien, Records.list('Deal').filter((d) => d.deal_id !== deal_id && !d.archived));
        // La Mémoire Klocka (30 oct. 2026, Jules) : le même bien déjà vu, chez qui et à quel prix ; la phrase reste
        // sur le dossier et s'ajoute à la proposition quand il y en a une.
        let historique = null;
        try {
          const M = await import('../../memoire/memoire.js');
          const cle = M.normaliserCle(bien);
          const biens = cle ? Records.filter('BienMemoire', { cle_adresse: cle }) : Records.list('BienMemoire');
          const prixDuBien = bienPrixAgence(deal);
          historique = M.phraseHistorique({ ...bien, ...prixDuBien }, M.chercherDansMemoire(bien, biens.filter((b) => b.deal_id !== deal_id)));
          if (historique) Records.update('Deal', deal.id, { memoire_historique: historique });
        } catch (e) { console.warn('[mémoire] historique :', e?.message || e); }
        if (!candidats.length) return { niveau: 'different', sauter: ['trancher_doublon'], historique };
        const mail = Records.get('MailRecu', charge.mail_id);
        if (candidats[0].niveau === 'identique') {
          await rattacher({ nouveau: deal, existantId: candidats[0].deal_id, mail, pour, tache });
          return { niveau: 'identique', rattache_a: candidats[0].deal_id, fin: true };
        }
        const p = await file.proposer({
          type: 'rattacher_ou_creer', titre: `Même adresse déjà en dossier : ${candidats[0].titre}`,
          resume: (historique ? `${historique} ` : '') + (candidats[0].niveau === 'meme_adresse' ? 'Même adresse, mais pas le même prix. Rattacher la fiche au dossier existant, ou créer un dossier à part ?' : 'Une adresse proche est déjà en dossier. Rattacher, ou créer un dossier à part ?'),
          charge: { nouveau_deal_id: deal_id, candidats }, sources: [sourceMail(mail, lienDossier(deal_id)), source({ outil: 'dossiers', libelle: `Dossier existant : ${candidats[0].titre}`, lien: lienDossier(candidats[0].deal_id) })],
          pour, dossier: deal_id, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'trancher_doublon', cout_usd: tache.cout_usd,
          cle: `doublon:${deal_id}`, actions: ['choisir', 'rejeter'], choix: [{ cle: 'rattacher', libelle: 'Rattacher au dossier existant' }, { cle: 'creer', libelle: 'Créer un dossier à part' }],
        });
        return { niveau: candidats[0].niveau, candidats, attendre: 'validation', proposition_id: p.id };
      },
    },
    {
      // Externe : la décision de la personne. « Rattacher » clôt ; « Créer » continue.
      nom: 'trancher_doublon', externe: true,
      async run({ tache, resultats, charge }) {
        const { deal_id, pour } = resultats.creer_dossier;
        if (charge.choix === 'rattacher') {
          const deal = Records.findBy('Deal', 'deal_id', deal_id);
          const mail = Records.get('MailRecu', tache.charge.mail_id);
          await rattacher({ nouveau: deal, existantId: resultats.verifier_doublon.candidats[0].deal_id, mail, pour, tache, prevenir: false });
          return { choix: 'rattacher', fin: true };
        }
        return { choix: 'creer' };
      },
    },
    {
      nom: 'proposer_demande_documents',
      async run({ tache, resultats, charge }) {
        const { deal_id, pour } = resultats.creer_dossier;
        const deal = Records.findBy('Deal', 'deal_id', deal_id);
        const mail = Records.get('MailRecu', charge.mail_id);
        const proprietaire = pour ? proprietaireDeLaBoite(mail?.compte) : null;
        const lot = deal.lots?.[0] || {};
        let texte = lot.mail_agent && lot.mail_agent.objet ? { objet: lot.mail_agent.objet, corps: lot.mail_agent.corps } : null;
        if (!texte) {
          const { redigerMailIntention } = await import('../../deal/mails-cycle.js');
          const { lotOuVide } = await import('../../deal/index.js');
          texte = await redigerMailIntention(lotOuVide(deal, 0), 'demande_documents', { signature: proprietaire?.nom, engagements: [], sansIA: !!deal.test });
        }
        const a = deal.contact_agent_email || null;
        const de = boiteQuiEnvoie(mail?.compte, pour);
        const manques = (lot.evaluation?.contexte?.informations_manquantes || lot.synthese?.informations_manquantes || []).slice(0, 5);
        const p = await file.proposer({
          type: 'demande_documents', titre: `Demander les documents à ${a || 'l\'agent'}`,
          resume: [lot.evaluation?.verdict ? `Verdict ${lot.evaluation.verdict}.` : null, manques.length ? `Il manque ${manques.join(', ')}.` : null, !a ? "L'adresse de l'agent n'est pas dans la fiche : à compléter." : null, !de ? `Aucune boîte connectée pour ${pour || 'cette fiche'} : rattachez-la dans Paramètres.` : null].filter(Boolean).join(' '),
          charge: { a, de, objet: texte?.objet || '', corps: texte?.corps || '', intention: 'demande_documents' },
          sources: [sourceMail(mail, lienDossier(deal_id)), sourceFiche(deal), sourceEvaluation(deal)],
          pour, dossier: deal_id, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'envoyer_demande_documents', cout_usd: tache.cout_usd,
          cle: `demande_documents:${deal_id}`,
        });
        return { attendre: 'validation', proposition_id: p.id };
      },
    },
    {
      // Externe : le mail part de la boîte de l'analyste, le dossier passe en « documents demandés ».
      nom: 'envoyer_demande_documents', externe: true,
      async run({ tache, resultats, charge, user }) {
        const { deal_id, pour } = resultats.creer_dossier;
        const deal = Records.findBy('Deal', 'deal_id', deal_id);
        if (!deal) throw new Error('Dossier introuvable');
        const a = String(charge.a || '').trim();
        if (!a) throw new Error("Pas de destinataire : complétez l'adresse de l'agent.");
        const template_id = `haka:${charge.proposition_id || tache.id}`;
        // Déjà parti (une coupure entre l'envoi et l'écriture du pas) : on ne renvoie pas.
        const deja = Records.filter('EmailLog', { template_id }).find((e) => e.statut === 'envoye');
        let envoi;
        if (deja) envoi = { success: true, deja: true, messageId: deja.message_id || null };
        else if (SIMULER || deal.test) {
          const { logEmail } = await import('../../email.js').catch(() => ({}));
          envoi = { success: true, simulated: true };
          if (typeof logEmail === 'function') logEmail({ from: charge.de, expediteur: charge.de, to: a, destinataire: a, subject: charge.objet, sujet: charge.objet, body: charge.corps, contenu: charge.corps, template_id, deal_id, intention: 'demande_documents', direction: 'sortant', statut: 'simule', error: 'Simulation Assistant KPartners', sent_at: new Date().toISOString() });
        } else {
          const { sendEmail } = await import('../../email.js');
          // `owner` : la boîte est celle de l'analyste, même quand c'est Jules qui valide.
          envoi = await sendEmail({ from: charge.de || undefined, owner: pour || user?.email, to: a, subject: charge.objet, body: charge.corps, deal_id, intention: 'demande_documents', template_id });
          if (!envoi?.success && !envoi?.simulated) throw new Error(envoi?.error || 'Envoi refusé');
        }
        const { avancerDealApresMail } = await import('../../functions.js');
        await avancerDealApresMail(deal_id, 'demande_documents', charge.objet, a, user);
        return { envoye: !!envoi.success && !envoi.simulated, simule: !!envoi.simulated, deja: !!envoi.deja, message_id: envoi.messageId || null, a, de: charge.de || null, le: new Date().toISOString() };
      },
    },
  ],
});

/** Le même bien existe : la nouvelle fiche devient un document du dossier existant, le nouveau dossier s'archive comme doublon. */
async function rattacher({ nouveau, existantId, mail, pour, tache, prevenir = true }) {
  const existant = Records.findBy('Deal', 'deal_id', existantId);
  if (!existant || !nouveau) return;
  const { ajouterDocument } = await import('../../deal/espace.js');
  if (nouveau.source?.url) ajouterDocument(existantId, { nom: nouveau.source.nom_fichier || 'Fiche reçue', url: nouveau.source.url, mime: nouveau.source.mime || 'application/pdf', taille: nouveau.source.taille || null }, null);
  const apport = { de: mail?.de_email || null, compte: mail?.compte || null, mail_recu_id: mail?.id || null, le: mail?.date || new Date().toISOString(), depuis_dossier: nouveau.deal_id };
  Records.update('Deal', existant.id, { apports: [...(existant.apports || []), apport] });
  if (mail) Records.update('MailRecu', mail.id, { deal_id: existantId });
  Records.update('Deal', nouveau.id, { archived: true, doublon_de: existantId });
  const { ajouterSuivi } = await import('../../deal/lifecycle.js');
  ajouterSuivi(Records.get('Deal', existant.id), { type: 'mail_recu', detail: `Le même bien est arrivé de ${mail?.de_email || '?'} dans ${mail?.compte || '?'} : fiche ajoutée aux documents (Assistant KPartners)` }, null);
  if (prevenir) {
    await file.proposer({
      type: 'meme_bien_recu', titre: `Même bien reçu d'un autre agent : ${existant.nom || existantId}`,
      resume: `${mail?.de_email || 'Un agent'} a envoyé un bien déjà en dossier (même adresse, même prix). Sa fiche est dans les documents du dossier.`,
      charge: { existant: existantId, depuis: nouveau.deal_id }, sources: [sourceMail(mail, lienDossier(existantId)), source({ outil: 'dossiers', libelle: `Dossier existant : ${existant.nom || existantId}`, lien: lienDossier(existantId) })],
      pour, dossier: existantId, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: null, cout_usd: tache.cout_usd,
      cle: `meme_bien:${existantId}:${mail?.id || nouveau.deal_id}`, actions: ['vu'],
    });
  }
}
