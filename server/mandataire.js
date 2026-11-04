// L'espace mandataire K Partners : le dashboard (spécification V1 du
// 30 septembre 2026). Un seul moteur, trois vues : le mandataire parle au
// même assistant que l'équipe, mais avec un jeu d'outils à lui.
//
// Ce que ces outils ne font jamais, par construction et non par consigne :
//  - montrer un client Klocka autrement qu'anonymisé (ni nom, ni mail, ni
//    téléphone) : le mandataire garde la relation vendeur, Klocka la relation
//    investisseur ;
//  - lire les dossiers, les verdicts ou les mails de l'équipe ;
//  - envoyer quoi que ce soit : un mail se prépare, le mandataire l'envoie.
//
// Chaque écriture revient avec de quoi l'annuler : le chat affiche « Relance
// créée pour jeudi · Annuler ».

import { effortDuChat } from './ak/effort.js';
import { OUTIL_RESTITUTION } from './restitution-avis.js';
import { OUTILS_VISITE, NOMS_OUTILS_VISITE } from './visites-acquereur.js';
import { auBanc, SIMULES_MANDATAIRE, simule } from './ak/banc/garde.js';
import { tracer } from './ak/trace.js';
import fs from 'fs';
import { Records } from './db.js';

const norme = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const aMidi = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
const dans = (iso) => Math.round((aMidi(new Date(iso)) - aMidi(new Date())) / 86400000);
const PARIS = 'Europe/Paris';
const jourLisible = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: PARIS });
const heureLisible = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS });

/**
 * Pure : « 2026-10-02T14:00 » dit par le modèle est une heure de Paris, pas
 * de l'hébergeur (en UTC) : sans ça, le RDV de 14 h s'affichait à 16 h.
 * Une date qui porte déjà son fuseau est prise telle quelle.
 */
export function heureDeParis(texte) {
  const t = String(texte || '').trim();
  if (!t) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(t)) { const d = new Date(t); return isNaN(d) ? null : d; }
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, a, mo, j, h = '09', mi = '00'] = m;
  const commeUtc = Date.UTC(+a, +mo - 1, +j, +h, +mi);
  // Le décalage de Paris à cette date (heure d'été ou d'hiver).
  const vu = new Date(new Date(commeUtc).toLocaleString('en-US', { timeZone: PARIS }));
  const decalage = vu.getTime() - new Date(new Date(commeUtc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(commeUtc - decalage);
}

// --- Rappels et rendez-vous ---------------------------------------------------
//
// Les rappels de l'équipe sans auteur sont « à tous » dans l'admin : ici, un
// mandataire ne voit que ce qu'il a posé lui-même, sans exception.

// L'espace mandataire n'est pas lié au dashboard admin : ses rappels portent
// espace « mandataire », et l'admin ne voit pas les siens ici (ni l'inverse),
// même quand un admin regarde la vue mandataire avec son propre compte.
export const ESPACE = 'mandataire';
const duMandataire = (r, user) => !!user?.email && r.cree_par === user.email && r.espace === ESPACE;

const siens = (user) => Records.list('Rappel').filter((r) => !r.fait_le && duMandataire(r, user));

function sienOuRien(id, user) {
  const r = Records.get('Rappel', id);
  return r && duMandataire(r, user) ? r : null;
}

/** Une ligne de rappel telle que l'écran la montre. */
function ligne(r) {
  const { titreDuRappel } = RAPPELS;
  return {
    id: r.id,
    genre: r.genre || 'relance',
    titre: r.genre === 'rdv' ? `RDV ${r.avec ? `avec ${r.avec}` : ''}${r.objet ? ` : ${r.objet}` : ''}`.trim() : titreDuRappel(r),
    note: r.note && r.note !== r.quoi ? r.note : null,
    telephone: r.telephone || null,
    echeance: r.echeance,
    heure: r.genre === 'rdv' ? heureLisible(r.echeance) : null,
    dans: dans(r.echeance),
  };
}

let RAPPELS = null;
async function rappels() {
  RAPPELS = RAPPELS || (await import('./rappels.js'));
  return RAPPELS;
}

/**
 * Le dashboard sous le chat. Rappels : les relances du jour et celles en
 * retard. À faire : les rendez-vous du jour. Tout se construit à partir des
 * dates, sans liste à tenir à la main.
 */
export async function tableauDuJour(user) {
  await rappels();
  const lignes = siens(user).map(ligne).sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)));
  const relances = lignes.filter((l) => l.genre !== 'rdv');
  const rdv = lignes.filter((l) => l.genre === 'rdv');
  // Les propriétaires à appeler aujourd'hui, avec la raison : ils viennent
  // des fiches (statut « à appeler », date d'action), pas d'une liste à tenir.
  const { mesProprietaires } = await import('./mandataire-espace.js');
  const { enseigneNationale, bailleurPublic, scoreCible } = await import('./mandataire-veille.js');
  // On n'affiche que ce qui s'appelle vraiment : un numéro du propriétaire, ou
  // le commerce d'un propriétaire-occupant. Les fiches sans numéro restent dans
  // les listes, pas dans la journée. Les enseignes nationales en sont exclues.
  const cibleDe = (p) => (p.cible_id ? Records.get('Cible', p.cible_id) : null);
  const telDe = (p, c) => p.telephone || (c?.proprietaire_occupant ? c.telephone : null) || null;
  const appels = mesProprietaires(user)
    .filter((p) => p.statut === 'a_appeler' && p.prochaine_action_le && dans(p.prochaine_action_le) <= 0)
    .map((p) => ({ p, c: cibleDe(p) }))
    .filter(({ p, c }) => telDe(p, c))
    .filter(({ p, c }) => { const proprio = p.nom || c?.proprietaire?.nom || ''; return !enseigneNationale(proprio) && !bailleurPublic(proprio) && !(c?.proprietaire_occupant && enseigneNationale(c?.enseigne || p.commerce || '')); })
    .sort((a, b) => (b.c ? scoreCible(b.c) : 0) - (a.c ? scoreCible(a.c) : 0) || String(a.p.prochaine_action_le).localeCompare(String(b.p.prochaine_action_le)))
    .map(({ p, c }) => ({ ...p, telephone: telDe(p, c) }))
    .map((p) => ({
      id: p.id,
      genre: 'appel',
      titre: `Appeler ${[p.commerce || p.nom, p.ville].filter(Boolean).join(' · ')}`,
      note: p.raison || (p.prospection_id ? 'Ajouté depuis une prospection' : 'Premier appel'),
      telephone: p.telephone || null,
      echeance: p.prochaine_action_le,
      heure: null,
      dans: dans(p.prochaine_action_le),
    }));
  // Les passages et actions du jour posés sur une fiche (31 oct. 2026, « qu'est-ce que je fais aujourd'hui ? ») :
  // la prochaine action datée, quand ni l'appel ci-dessus ni un rappel ouvert ne la portent déjà. À part de
  // `a_faire` : ses gestes (fait, reporter) sont ceux d'un rappel.
  const dejaLa = new Set([...appels.map((a) => a.id), ...siens(user).map((r) => r.proprietaire_id).filter(Boolean)]);
  const passages = mesProprietaires(user)
    .filter((p) => p.prochaine_action && p.prochaine_action_le && dans(p.prochaine_action_le) <= 0 && p.statut !== 'pas_vendeur' && !dejaLa.has(p.id))
    .map((p) => ({ id: p.id, genre: 'passage', titre: `${p.prochaine_action} · ${[p.commerce || p.nom, p.ville].filter(Boolean).join(' · ')}`, note: p.adresse || null, telephone: p.telephone || null, echeance: p.prochaine_action_le, heure: null, dans: dans(p.prochaine_action_le) }));
  return {
    rappels: relances.filter((l) => l.dans <= 0),
    a_faire: [...appels, ...rdv.filter((l) => l.dans === 0)],
    passages,
    a_venir: [...relances, ...rdv].filter((l) => l.dans > 0).sort((a, b) => String(a.echeance).localeCompare(String(b.echeance))).slice(0, 5),
    en_retard: relances.filter((l) => l.dans < 0).length + appels.filter((l) => l.dans < 0).length,
  };
}

/** Pure : l'échéance reportée à un jour choisi. Un rendez-vous garde son heure (Paris) ; une relance passe à 9 h. */
export async function echeanceReportee(echeanceAvant, genre, dateJour) {
  const m = String(dateJour || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const { instantParis, heureParis } = await import('./rappels.js');
  const h = genre === 'rdv' ? heureParis(echeanceAvant) : { h: 9, mi: 0 };
  return instantParis(Number(m[1]), Number(m[2]), Number(m[3]), h.h, h.mi);
}

/**
 * Annuler un geste remet la fiche comme avant : la tentative décomptée, le
 * statut d'avant, la prochaine action d'avant. Sans ça, annuler la relance
 * d'un « pas de réponse » laissait une tentative comptée et une prochaine
 * action pointant vers un rappel supprimé.
 */
function restaurerFiche(r) {
  if (!r?.proprietaire_id || !r?.retour) return;
  const p = Records.get('ProprietaireMandataire', r.proprietaire_id);
  if (!p) return;
  Records.update('ProprietaireMandataire', p.id, {
    tentatives: r.retour.tentatives ?? p.tentatives,
    statut: r.retour.statut || p.statut,
    prochaine_action: r.retour.prochaine_action ?? null,
    prochaine_action_le: r.retour.prochaine_action_le ?? null,
    historique: [...(p.historique || []), { le: new Date().toISOString(), type: 'statut', texte: 'Geste annulé : fiche remise comme avant' }],
  });
}

/** Fait, reporter (à demain, ou au jour dit), renommer, supprimer : un geste par ligne, sur ses propres rappels seulement. */
export async function agirSurRappel(id, geste, user, corps = {}) {
  const r = sienOuRien(id, user);
  if (!r) return await agirSurAppel(id, geste, user, corps);
  if (geste === 'fait') {
    Records.update('Rappel', r.id, { fait_le: new Date().toISOString(), fait_par: user.email });
  } else if (geste === 'reporter' && corps?.date) {
    const d = await echeanceReportee(r.echeance, r.genre, corps.date);
    if (!d) return { ok: false, error: 'Une date, au format AAAA-MM-JJ.' };
    Records.update('Rappel', r.id, { echeance: d.toISOString() });
  } else if (geste === 'demain') {
    const { dansNJoursParis } = await import('./rappels.js');
    // Un rendez-vous garde son heure et avance d'un jour ; une relance passe
    // au lendemain 9 h (Paris). Jamais en arrière : « demain » sur un rappel
    // de la semaine prochaine le décale d'un jour, il ne le ramène pas.
    const avant = new Date(r.echeance);
    let d = r.genre === 'rdv' ? new Date(avant.getTime() + 86400000) : dansNJoursParis(1, 9);
    if (d <= avant) d = new Date(avant.getTime() + 86400000);
    Records.update('Rappel', r.id, { echeance: d.toISOString() });
  } else if (geste === 'renommer') {
    const titre = String(corps?.titre || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!titre) return { ok: false, error: 'Un titre, même court.' };
    // Le titre d'un rendez-vous vit dans « avec » ; celui d'une relance dans « quoi ».
    Records.update('Rappel', r.id, r.genre === 'rdv' ? { avec: titre, objet: null } : { quoi: titre, nom: null });
  } else if (geste === 'supprimer') {
    restaurerFiche(r);
    Records.delete('Rappel', r.id);
  } else {
    return { ok: false, error: 'Geste inconnu.' };
  }
  return { ok: true };
}

// Une ligne « Appeler X » vient d'une fiche propriétaire, pas d'un rappel :
// fait ou supprimer effacent la date d'action, demain la repousse.
async function agirSurAppel(id, geste, user, corps = {}) {
  const p = Records.get('ProprietaireMandataire', id);
  if (!p || p.mandataire_email !== String(user?.email || '').toLowerCase()) return { ok: false, error: 'Rappel introuvable.' };
  if (geste === 'reporter' && corps?.date) {
    const d = await echeanceReportee(p.prochaine_action_le, 'relance', corps.date);
    if (!d) return { ok: false, error: 'Une date, au format AAAA-MM-JJ.' };
    Records.update('ProprietaireMandataire', p.id, { prochaine_action_le: d.toISOString() });
  } else if (geste === 'renommer') {
    // Le titre d'une ligne d'appel est le commerce de la fiche.
    const titre = String(corps?.titre || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!titre) return { ok: false, error: 'Un titre, même court.' };
    Records.update('ProprietaireMandataire', p.id, { commerce: titre });
  } else if (geste === 'demain') {
    const { dansNJoursParis } = await import('./rappels.js');
    const d = dansNJoursParis(1, 9);
    Records.update('ProprietaireMandataire', p.id, { prochaine_action_le: d.toISOString() });
  } else if (geste === 'fait' || geste === 'supprimer') {
    Records.update('ProprietaireMandataire', p.id, {
      prochaine_action: null,
      prochaine_action_le: null,
      historique: geste === 'fait' ? [...(p.historique || []), { le: new Date().toISOString(), type: 'appel', texte: 'Appel marqué fait depuis le tableau de bord' }] : p.historique,
    });
  } else {
    return { ok: false, error: 'Geste inconnu.' };
  }
  return { ok: true };
}

// --- Les outils de l'agent -----------------------------------------------------

// Les outils de marché, comme ceux de l'équipe (26 oct. 2026, Jules : « l'IA doit avoir les outils comme dans la partie
// admin ») : sur une adresse plutôt que sur un projet, en lecture seule, chaque chiffre avec sa source.
const OUTILS_MARCHE_MANDATAIRE = [
  {
    name: 'donnees_commune',
    description: "Les chiffres d'une commune : population et densité (API Géo, INSEE), revenu médian, chômage de la zone d'emploi (INSEE), prix du logement (Le Figaro). « Combien d'habitants à Antibes ? », « le revenu médian de la ville ». Rend chaque chiffre avec sa source : répète-la.",
    input_schema: { type: 'object', properties: { commune: { type: 'string' } }, required: ['commune'] },
  },
  {
    name: 'loyers_marche',
    description: "Les loyers commerciaux au m² autour d'une adresse (rue, quartier, ville) : Data-B, Equimmox en repli, la même lecture que l'avis de valeur. « Quel loyer dans cette rue ? », « le loyer est-il au marché ? ». Une lecture de moins de trente jours est reprise. Seules sources de loyer : jamais un chiffre de tête.",
    input_schema: { type: 'object', properties: { adresse: { type: 'string' } }, required: ['adresse'] },
  },
  {
    name: 'prix_murs',
    description: "Le prix des murs commerciaux au m² autour d'une adresse, sur les offres de vente Equimmox (surface du bien à ±20 %). Une à deux minutes si rien n'est en cache. « À combien se vendent les murs ici ? ».",
    input_schema: { type: 'object', properties: { adresse: { type: 'string' }, surface: { type: 'number', description: 'Surface du local en m², si connue' } }, required: ['adresse'] },
  },
  {
    name: 'ventes_dvf',
    description: "Les ventes de locaux commerciaux signées autour d'une adresse (DVF, données publiques des notaires), avec prix, surface, prix au m² et date. « Qu'est-ce qui s'est vendu autour ? ».",
    input_schema: { type: 'object', properties: { adresse: { type: 'string' }, rayon: { type: 'number', description: 'En mètres, 800 par défaut' } }, required: ['adresse'] },
  },
  {
    name: 'recherche_web',
    description: "Une recherche sur le web, avec les pages consultées : une enseigne, une actualité locale, un projet d'aménagement, une société. Rend un texte et ses sources : cite-les. Pas pour un loyer ni un prix (Equimmox, Data-B, DVF le font).",
    input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
  },
  {
    name: 'vacance_commerciale',
    description: "La vacance commerciale autour d'une adresse (K-Vacance : locaux vides relevés, fermetures et ouvertures au registre SIRENE, rotation), comparée à la commune. « Y a-t-il beaucoup de locaux vides dans cette rue ? ».",
    input_schema: { type: 'object', properties: { adresse: { type: 'string' } }, required: ['adresse'] },
  },
  {
    name: 'annonces_bodacc',
    description: "Les annonces BODACC de la rue d'une adresse (créations, cessions de fonds, procédures, radiations), sur les derniers mois. « Qu'est-ce qui a bougé dans la rue ? ».",
    input_schema: { type: 'object', properties: { adresse: { type: 'string' } }, required: ['adresse'] },
  },
];
// Les sources que le mandataire peut cocher, et les outils de chacune (les autres outils restent : ce sont des gestes).
export const OUTILS_PAR_SOURCE = {
  equimmox: ['loyers_marche', 'prix_murs'], data_b: ['loyers_marche'], valeur_locative: ['loyers_marche'], dvf: ['ventes_dvf'], insee: ['donnees_commune'],
  web: ['recherche_web'], kvacance: ['vacance_commerciale'], bodacc: ['annonces_bodacc'], clients: ['demandes_clients'], prospection: ['mes_proprietaires'],
};
const OUTILS_DE_DONNEES = new Set(Object.values(OUTILS_PAR_SOURCE).flat());
const NOMS_MARCHE = new Set(['donnees_commune', 'loyers_marche', 'prix_murs', 'ventes_dvf', 'recherche_web', 'vacance_commerciale', 'annonces_bodacc']);

/**
 * Les outils de marché et le cadre des sources pour les autres chats du mandataire (l'avis de valeur, le mandat, 26 oct.
 * 2026, Jules : « dans les chats de l'avis de valeur, de la pré-visite, du mandat ») : les outils permis par les sources
 * cochées (tous en « Auto »), la phrase pour la consigne, et le moyen de les exécuter.
 */
export function marchePourChat({ sources = null, competence = null } = {}) {
  const choisies = (Array.isArray(sources) ? sources : []).map((x) => String(x || '').trim()).filter((x) => OUTILS_PAR_SOURCE[x]).slice(0, 10);
  const permis = new Set(choisies.flatMap((x) => OUTILS_PAR_SOURCE[x]));
  return {
    tools: OUTILS_MARCHE_MANDATAIRE.filter((o) => !choisies.length || permis.has(o.name)),
    cadre: `${choisies.length ? `\n\nSOURCES CHOISIES PAR LE MANDATAIRE : ${choisies.join(', ')}. Ne lis que celles-ci ; si elles ne suffisent pas, dis ce qui manque au lieu d'aller ailleurs.` : ''}${competence ? `\n\nLe mandataire a choisi la compétence « ${String(competence).slice(0, 60)} » : c'est la tâche qu'il demande.` : ''}`,
    estMarche: (name) => NOMS_MARCHE.has(name),
    executer: (appel, user) => executerOutilMandataire(appel, user),
  };
}

export const OUTILS_MANDATAIRE = [
  OUTIL_RESTITUTION,
  ...OUTILS_VISITE,
  {
    name: 'annuler_derniere',
    description: "Annule la dernière relance ou le dernier rendez-vous que tu as créé pour ce mandataire (« annule la dernière relance »). Rend ce qui a été annulé.",
    input_schema: { type: 'object', properties: { genre: { type: 'string', enum: ['relance', 'rdv', 'tout'], description: 'relance, rdv, ou le dernier des deux' } } },
  },
  {
    name: 'mes_acquereurs',
    description: "Le fichier acquéreurs du mandataire (importé depuis Clients › Mes acquéreurs), avec ceux qui collent à un bien : la ville, le prix et le type de bien filtrent (un critère que l'acquéreur n'a pas dit ne l'écarte pas). « Qui je peux appeler pour la pharmacie de Cannes à 450 k€ ? ». Rend nom, téléphone, e-mail, ce qu'il cherche, budget et pourquoi il colle. Ne contacte personne.",
    input_schema: { type: 'object', properties: { ville: { type: 'string' }, prix: { type: 'number', description: 'Prix du bien en euros' }, type: { type: 'string', description: 'Type de bien ou activité' } } },
  },
  {
    name: 'mes_dossiers',
    description: "L'état des biens du mandataire : estimation (brouillon, prête, envoyée — elle est au mandataire, pas de validation Klocka), mandat (demandé, prêt, signé, enregistré), dossier (pièces reçues et manquantes, en étude, go, compléments, no-go), mise en marché (préparation, présenté, offre, compromis, acte). Avec la date du dernier changement et le mot de Klocka. Filtre facultatif par bien ou par propriétaire (« M. Durand » retrouve sa pharmacie).",
    input_schema: { type: 'object', properties: { bien: { type: 'string', description: 'Le bien (« la pharmacie ») ou le propriétaire (« M. Durand »), facultatif' } } },
  },
  {
    name: 'lancer_estimation',
    description:
      "Rédige le rapport d'estimation d'un bien, tout de suite, avec les outils de marché de la maison (Equimmox, Data-B, DVF). Le mandataire le fait lui-même : pas de validation Klocka. Il faut un bail déjà déposé ou des infos dictées (loyer, surface, état) ; sinon, demande l'un des deux. « Estime la boulangerie rue Carnot », « lance l'estimation du pressing ». Rend la fourchette de prix.",
    input_schema: {
      type: 'object',
      properties: {
        bien: { type: 'string', description: 'Le bien, tel que le mandataire le nomme' },
        adresse: { type: 'string', description: "L'adresse, pour lire le marché de la rue (reprise de la fiche si connue)" },
        infos: { type: 'string', description: 'Ce que le mandataire dicte : loyer, surface, état du local, projet du propriétaire' },
      },
      required: ['bien'],
    },
  },
  {
    name: 'ranger_piece',
    description:
      "Range la pièce jointe au message dans la checklist du dossier d'un bien (bail, quittances, kbis, copropriété, diagnostics, taxe foncière). Dis le bien tel que le mandataire le nomme ; si aucun dossier ne porte ce nom et que le bien est clair, creer_si_absent crée le dossier. Si le bien n'est pas clair, demande au lieu d'appeler l'outil.",
    input_schema: {
      type: 'object',
      properties: {
        bien: { type: 'string', description: 'Le bien (« la boulangerie Martin », « le tabac de Mâcon »)' },
        categorie: { type: 'string', enum: ['bail', 'quittances', 'kbis', 'copropriete', 'diagnostics', 'taxe_fonciere'] },
        piece: { type: 'string', description: 'Le nom de la pièce jointe à ranger, quand il y en a plusieurs : un appel par pièce' },
        creer_si_absent: { type: 'boolean' },
      },
      required: ['bien', 'categorie'],
    },
  },
  {
    name: 'demander_mandat',
    description:
      "Demande un mandat de vente à Klocka : « mandat exclusif pour la boulangerie Martin, 450 000 net vendeur, 5 % acquéreur, 12 mois ». Klocka rédige le mandat et le renvoie prêt à signer. Il faut le vendeur, le bien, le prix net vendeur et les honoraires ; demande ce qui manque en une ligne. Type exclusif et 12 mois par défaut si rien n'est dit.",
    input_schema: {
      type: 'object',
      properties: {
        vendeur: { type: 'string', description: 'Le vendeur (« SCI Carnot », « M. Martin »)' },
        vendeur_contact: { type: 'string', description: 'Mail ou téléphone du vendeur, si dit' },
        bien: { type: 'string', description: 'Le bien (« murs de la boulangerie, 12 rue Carnot, Mâcon »)' },
        prix: { type: 'number', description: "Prix net vendeur, en euros (depuis la fiche d'un bien, le prix d'accord noté si omis)" },
        honoraires: { type: 'number', description: 'Honoraires, en % (« 5 ») ou en euros' },
        honoraires_charge: { type: 'string', enum: ['vendeur', 'acquereur'] },
        type: { type: 'string', enum: ['simple', 'exclusif'] },
        duree_mois: { type: 'number', enum: [3, 6, 12] },
      },
      required: ['vendeur', 'bien', 'honoraires'],
    },
  },
  {
    name: 'corriger_mandat',
    description:
      "Une correction sur un mandat demandé ou reçu (« sur le mandat de la boulangerie, le prix c'est 460 000 », « mets les honoraires charge acquéreur »). La demande part telle quelle : à l'agent qui a rédigé le mandat, sinon à l'équipe Klocka, qui corrige et redépose. Un mandat déjà signé ne se corrige plus.",
    input_schema: {
      type: 'object',
      properties: {
        bien: { type: 'string', description: 'Le bien du mandat visé' },
        demande: { type: 'string', description: 'La correction, mot pour mot' },
      },
      required: ['bien', 'demande'],
    },
  },
  {
    name: 'bail_estimation',
    description: "Dépose la pièce jointe (un bail) sur l'estimation d'un bien, pour rédiger le rapport de valorisation. Crée l'estimation en brouillon si elle n'existe pas. Le rapport se lance ensuite depuis la page Estimation.",
    input_schema: {
      type: 'object',
      properties: { bien: { type: 'string' }, adresse: { type: 'string', description: "L'adresse, si elle est dite ou lue dans le bail" }, piece: { type: 'string', description: 'Le nom du bail parmi les pièces jointes, quand il y en a plusieurs' } },
      required: ['bien'],
    },
  },
  {
    name: 'noter_relance',
    description:
      "Crée une relance datée dans les rappels du mandataire. « Pas de réponse pour le commerce à Mâcon » : relance à J+2 par défaut. « Pas vendeur, rappelle-le dans 6 mois » : relance dans 6 mois. Écris la phrase telle qu'on la relira : « Rappeler le propriétaire du tabac de Mâcon (pas de réponse) dans 2 jours ». Donne le téléphone s'il a été dit.",
    input_schema: {
      type: 'object',
      properties: {
        texte: { type: 'string', description: 'Qui relancer, pourquoi, et quand (« dans 2 jours », « lundi », « le 12 octobre »)' },
        qui: { type: 'string', description: 'Le commerce ou le propriétaire suivi, pour rattacher la relance à sa fiche (inutile depuis une fiche ouverte)' },
      },
      required: ['texte'],
    },
  },
  {
    name: 'noter_rdv',
    description: "Crée un rendez-vous (« Il est intéressé, RDV jeudi 14h »). La date et l'heure en ISO, calculées depuis la date du jour donnée plus haut. Si le rendez-vous concerne un propriétaire suivi, donne « qui » : sa fiche passe en RDV pris.",
    input_schema: {
      type: 'object',
      properties: {
        quand: { type: 'string', description: 'Date et heure ISO 8601, heure de Paris (ex. 2026-10-02T14:00:00)' },
        avec: { type: 'string', description: 'Le propriétaire ou le commerce' },
        qui: { type: 'string', description: 'Le commerce ou propriétaire suivi, pour lier le RDV à sa fiche' },
        objet: { type: 'string', description: 'Ce qu\'on y fait (« présenter l\'estimation »)' },
        telephone: { type: 'string' },
        lieu: { type: 'string' },
      },
      required: ['quand', 'avec'],
    },
  },
  {
    name: 'visite_du_moment',
    description: "Le rendez-vous qui vient d'avoir lieu : à appeler quand le mandataire raconte une visite sans dire de quel bien il parle (le dashboard, le téléphone). Rend les rendez-vous les plus proches de maintenant ; un seul, fais-le confirmer (« C'est bien la visite de la Cave Girard, 22 rue Gambetta ? ») ; plusieurs, propose le choix. Inutile depuis la page du bien.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compte_rendu_visite',
    description: "Le compte rendu de la visite chez le propriétaire, structuré depuis ce que le mandataire raconte (1 à 2 minutes). Interne : rien ne part vers le propriétaire. Remplis seulement ce qui a été dit ; ce qui est dit mais non prouvé va dans a_confirmer. reponses : pour chaque question de la préparation du rendez-vous, sa réponse si le récit la donne (reprends le texte exact de la question). Enregistre sur la fiche, ne lance rien : après, demande toujours « Passer à l'estimation ? ».",
    input_schema: {
      type: 'object',
      properties: {
        fiche_id: { type: 'string', description: "La fiche du bien (donnée par visite_du_moment ou mes_proprietaires) ; inutile depuis la page du bien" },
        bien: { type: 'object', properties: { loyer_annuel: { type: 'number', description: 'HT HC, en euros par an' }, charges: { type: 'string' }, taxe_fonciere: { type: 'string' }, refacturees: { type: 'boolean', description: 'charges et taxe foncière refacturées au locataire' }, bail_date: { type: 'string' }, fin_bail: { type: 'string' }, surface: { type: 'number' }, travaux: { type: 'string' } } },
        etat: { type: 'object', properties: { local: { type: 'string' }, passage: { type: 'string' }, voisinage: { type: 'string' } } },
        proprietaire: { type: 'object', properties: { prix: { type: 'number', description: "Le prix qu'il a en tête, en euros" }, delai: { type: 'string' }, intentions: { type: 'string' }, decideur: { type: 'string', description: 'seul, famille, associés' }, vendeur: { type: 'boolean', description: "false s'il n'est plus vendeur" } } },
        locataire: { type: 'object', properties: { intentions: { type: 'string' }, solidite: { type: 'string', description: 'solidité perçue' } } },
        documents: { type: 'object', properties: { remis: { type: 'array', items: { type: 'string' } }, promis: { type: 'array', items: { type: 'string' } }, a_demander: { type: 'array', items: { type: 'string' } } } },
        a_confirmer: { type: 'array', items: { type: 'string' } },
        reponses: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, reponse: { type: 'string' } } } },
      },
    },
  },
  {
    name: 'corriger_preparation',
    description: "Corrige la préparation du rendez-vous du bien ouvert (étape Visite) : un rendez-vous décalé (decaler_a), ou une précision à retenir (ajout : « il vient avec son fils », « le locataire part en 2027 »). La préparation est refaite aussitôt.",
    input_schema: {
      type: 'object',
      properties: {
        decaler_a: { type: 'string', description: 'La nouvelle date et heure, AAAA-MM-JJTHH:MM, heure de Paris, calculée depuis la date du jour' },
        ajout: { type: 'string', description: 'La précision à retenir, en une phrase' },
      },
    },
  },
  {
    name: 'nouveau_contact',
    description:
      "Crée la fiche d'un commerce ou d'un propriétaire que le mandataire vient de voir ou d'appeler (« Je suis passé à la boulangerie du 19 rue de l'Exemple à Cannes, M. Bernard, 06 12 34 56 78, il vend dans deux ans »). Le minimum : le commerce ou son adresse, et la ville ; le nom, le numéro, le mail et ce qui s'est dit sont facultatifs, ne les réclame jamais. L'outil retrouve d'abord le commerce parmi ceux que Klocka connaît (photo, propriétaire, signaux viennent avec) ; sinon la fiche naît de ce qui a été dit. En deux temps (31 oct. 2026, Jules) : sans confirme, rien n'est créé, l'outil rend ses listes et tu proposes en une ligne la fiche et la liste ; à son oui, rappelle-le avec confirme true et la liste choisie.",
    input_schema: {
      type: 'object',
      properties: {
        confirme: { type: 'boolean', description: 'Vrai seulement après son oui à ta proposition' },
        liste: { type: 'string', description: 'La liste où ranger la fiche, celle qu\'il a acceptée (créée si elle n\'existe pas) ; vide s\'il n\'en veut aucune' },
        nom: { type: 'string', description: 'Le propriétaire ou la personne rencontrée (M. Durand)' },
        telephone: { type: 'string' },
        email: { type: 'string' },
        commerce: { type: 'string', description: 'Le commerce (la pharmacie cours Vitton)' },
        activite: { type: 'string', description: 'Le métier (pharmacie, boulangerie…)' },
        ville: { type: 'string' },
        adresse: { type: 'string' },
        statut: { type: 'string', enum: ['a_appeler', 'contacte'], description: 'Contacté si le mandataire a parlé à quelqu\'un (en personne ou au téléphone), à contacter sinon. À contacter par défaut.' },
        remarque: { type: 'string', description: 'Ce qui s\'est dit, en une phrase (« vend dans deux ans », « le patron est absent le lundi »)' },
        prochaine_action: { type: 'string', description: 'Ce qu\'il y a à faire ensuite (« Rappeler jeudi »)' },
        prochaine_action_le: { type: 'string', description: 'Sa date, AAAA-MM-JJ ou AAAA-MM-JJTHH:MM' },
      },
    },
  },
  {
    name: 'importer_bien',
    description:
      "Un bien qu'il a DÉJÀ en portefeuille, raconté (souvent en vocal) avec ses documents joints au même message (3 nov. 2026, Jules) : un mandat signé chez K Partners ou ailleurs, un avis de valeur fait, un bien sous offre ou vendu. Pas un commerce à démarcher (nouveau_contact), pas un bien déjà dans Biens (avancer_bien, ranger_piece). Un bien par appel ; plusieurs biens dans un message : demande de les envoyer un par un, chacun avec ses pièces. Remplis depuis le récit ET le texte des pièces ; quand les deux divergent, la pièce fait foi et tu le dis. N'invente rien, ne réclame rien : un champ absent reste vide. Rien n'est créé : l'outil prépare la carte, le mandataire confirme d'un tap. Après l'appel, résume en trois ou quatre lignes courtes (le bien, l'étape, le prix, les pièces reçues, ce qui manque) et dis de toucher « Confirmer ».",
    input_schema: {
      type: 'object',
      properties: {
        etape: { type: 'string', enum: ['estimation', 'mandat_kp', 'mandat_ailleurs', 'offre', 'vente'], description: "estimation : avis de valeur fait, pas de mandat ; mandat_kp : mandat signé chez K Partners ; mandat_ailleurs : mandat signé dans une autre agence (enseigne) ; offre : sous offre ou sous compromis ; vente : vendu. Un mandat sans agence lisible : demande avant d'appeler." },
        proprietaire: { type: 'string', description: 'Le propriétaire des murs (nom ou société)' },
        telephone: { type: 'string' },
        email: { type: 'string' },
        commerce: { type: 'string', description: 'Le commerce (enseigne ou activité du locataire)' },
        activite: { type: 'string' },
        adresse: { type: 'string' },
        ville: { type: 'string' },
        prix: { type: 'number', description: 'Le prix de vente (mandat) ou la valeur de l\'avis, en euros' },
        loyer_annuel: { type: 'number', description: 'En euros, hors charges' },
        honoraires: { type: 'string' },
        numero: { type: 'string', description: 'Le numéro du mandat' },
        signe_le: { type: 'string', description: 'AAAA-MM-JJ' },
        echeance: { type: 'string', description: 'AAAA-MM-JJ' },
        exclusif: { type: 'boolean' },
        enseigne: { type: 'string', description: 'L\'agence ou le réseau du mandat' },
        manque: { type: 'string', description: 'Ce qui manque pour la suite, en une ligne (« pas de bail ») ; vide sinon' },
      },
      required: ['etape'],
    },
  },
  {
    name: 'appel_sans_reponse',
    description:
      "« Pas de réponse pour le commerce à Mâcon » : retrouve la fiche, enregistre la tentative et pose la relance suivante de la séquence (J+2 appel, J+5 mail, J+10 dernier appel, puis « À recontacter » à J+30). Si la réponse liste plusieurs candidats, demande lequel en une ligne.",
    input_schema: {
      type: 'object',
      properties: { qui: { type: 'string', description: 'Le commerce ou le propriétaire, tel que dit (« le commerce à Mâcon », « la boulangerie Martin »)' } },
      required: ['qui'],
    },
  },
  {
    name: 'resultat_appel',
    description:
      "Le résultat d'un appel : « il est intéressé » (statut en_discussion), « pas vendeur, rappelle-le dans 6 mois » (statut pas_vendeur, rappel_dans_jours 180), « on a rendez-vous » passe par noter_rdv avec qui. Retrouve la fiche par « qui » ; plusieurs candidats : demande lequel.",
    input_schema: {
      type: 'object',
      properties: {
        qui: { type: 'string' },
        statut: { type: 'string', enum: ['contacte', 'en_discussion', 'rdv_pris', 'mandat_signe', 'pas_vendeur', 'a_recontacter'] },
        note: { type: 'string', description: 'Ce qui s\'est dit, en une phrase' },
        rappel_dans_jours: { type: 'number', description: 'Reprendre contact dans N jours, si demandé' },
      },
      required: ['qui', 'statut'],
    },
  },
  {
    name: 'prospecter_commerces',
    description:
      "Chercher des commerces dans le secteur du mandataire selon un métier ou des critères (2 nov. 2026) : « je veux que des boulangeries propriétaires exploitants », « les coiffeurs avec un gérant de 70 ans », « les indépendants pas encore dans une liste ». Ouvre la Prospection, filtrée. Passe la phrase du mandataire telle quelle, sans la reformuler. Après l'appel, dis en une ligne ce que tu ouvres ; le bouton suit ta réponse.",
    input_schema: {
      type: 'object',
      properties: { phrase: { type: 'string', description: 'Ce que le mandataire cherche, avec ses mots' } },
      required: ['phrase'],
    },
  },
  {
    name: 'signaler_local_vide',
    description:
      "Le mandataire a vu sur le terrain un local commercial vide (vitrine vide, panneau « à louer » ou « à vendre ») et le dit (3 nov. 2026) : « vitrine vide au 12 rue Sadi-Carnot à Antibes ». Le local entre sur la carte des Murs libres de sa Prospection. L'adresse avec la ville ; dans note, ce qu'il a vu (panneau, agence, numéro affiché). Après l'appel, dis en une ligne qu'il est sur la carte.",
    input_schema: {
      type: 'object',
      properties: { adresse: { type: 'string', description: 'Numéro, rue, ville' }, note: { type: 'string', description: 'Ce qu\'il a vu : panneau, agence, numéro' } },
      required: ['adresse'],
    },
  },
  {
    name: 'avancer_bien',
    description:
      "Faire avancer un bien d'étape dans Biens. Les étapes (26 oct. 2026 ; Data room le 2 nov.) : Visite (previsite), Avis de valeur (estimation), Mandat, Data room (dataroom), Commercialisation (marche), Offres, Vente. « La visite est faite » sans avis lancé : previsite. « Il est d'accord à 460 k€ » : estimation avec prix (le prix d'accord est le résultat de l'avis). « Le mandat est signé » : mandat. Rien n'est écrit : l'outil prépare le changement et l'écran le fait confirmer d'un tap. Le rendez-vous fixé, lui, passe par noter_rdv ; un avis lancé fait déjà la Pré-visite, sans avancer_bien. Après l'appel, dis en une ligne ce que tu proposes (« Je note l'accord à 460 000 € ? ») puis enchaîne sur la suite (le mandat à préparer).",
    input_schema: {
      type: 'object',
      properties: {
        qui: { type: 'string', description: 'Le commerce ou le propriétaire, comme le mandataire le dit' },
        proprietaire_id: { type: 'string', description: "L'id de la fiche, si la conversation est ouverte depuis elle" },
        etape: { type: 'string', enum: ['previsite', 'estimation', 'mandat', 'dataroom', 'marche', 'offre', 'vente'] },
        prix: { type: 'string', description: "Pour estimation : le prix convenu avec le propriétaire (« 460 k€ »)" },
      },
      required: ['etape'],
    },
  },
  {
    name: 'modifier_fiche',
    description:
      "Modifier toute une fiche existante (26 oct. 2026) : son numéro, son mail, le nom du propriétaire, les murs, le gérant, l'exploitant, le nom du commerce, l'adresse, l'activité, une remarque, la prochaine action et sa date, le statut (à contacter, contacté, pas d'intérêt), sa liste ; et ses parties libres : ajouter, réécrire ou retirer une partie (« ajoute une partie Travaux : toiture refaite en 2022 »). Écrit tout de suite, sans doublon ni relance. Un numéro ou un mail donné par un tiers (voisin, employé, exploitant) : a_confirmer true. Un champ à vider : chaîne vide.",
    input_schema: {
      type: 'object',
      properties: {
        qui: { type: 'string', description: 'Le commerce ou le propriétaire, comme le mandataire le dit (inutile depuis une fiche ouverte)' },
        proprietaire_id: { type: 'string', description: "L'id de la fiche, si la conversation est ouverte depuis elle" },
        telephone: { type: 'string' },
        email: { type: 'string' },
        nom: { type: 'string', description: 'Le nom du propriétaire des murs (la personne à appeler)' },
        murs: { type: 'string', description: 'La société propriétaire des murs, si elle est corrigée' },
        gerant: { type: 'string' },
        exploitant: { type: 'string' },
        remarque: { type: 'string', description: 'Une information à garder sur la fiche, en une phrase (ajoutée aux remarques)' },
        commerce: { type: 'string', description: 'Le nom du commerce, corrigé' },
        adresse: { type: 'string' },
        ville: { type: 'string' },
        activite: { type: 'string' },
        prochaine_action: { type: 'string', description: 'Ce qu\'il y a à faire ensuite, en quelques mots' },
        prochaine_action_le: { type: 'string', description: 'Sa date, AAAA-MM-JJ ou AAAA-MM-JJTHH:MM' },
        statut: { type: 'string', enum: ['a_appeler', 'contacte', 'pas_vendeur'], description: 'Pas d\'intérêt pose une relance dans six mois. Le rendez-vous passe par noter_rdv, une étape de Biens par avancer_bien.' },
        liste: { type: 'string', description: 'Le nom de la liste où ranger la fiche (créée si elle n\'existe pas)' },
        section: {
          type: 'object', description: 'Une partie libre de la fiche',
          properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'retirer'] }, titre: { type: 'string' }, texte: { type: 'string' } },
          required: ['action', 'titre'],
        },
        a_confirmer: { type: 'boolean', description: 'Vrai si l\'information vient d\'un tiers, pas du propriétaire' },
        source: { type: 'string', description: "D'où vient l'information : le mandataire, l'exploitante, le propriétaire, le bail, le registre" },
      },
    },
  },
  {
    name: 'mes_proprietaires',
    description: 'La liste des propriétaires du mandataire, avec leur statut et la prochaine action.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ma_fiche',
    description: "Lit une fiche du mandataire en entier, avec la source de chaque information : commerce, adresse, propriétaire des murs, exploitant, téléphone, statut, liste, prochaine action, remarques, parties libres (loyer, bail…), compte rendu de visite, rendez-vous à venir, derniers échanges. À appeler pour retrouver la bonne fiche avant d'agir, pour répondre à une question sur elle (« c'est quoi le loyer de la boulangerie Roux ? »), et avant de remplacer une valeur. Plusieurs fiches possibles : rend les choix ; aucune : le dit.",
    input_schema: { type: 'object', properties: { qui: { type: 'string', description: 'Le commerce, la rue ou le propriétaire, comme le mandataire le dit (inutile depuis une fiche ouverte)' } } },
  },
  {
    name: 'mettre_en_pause',
    description: "Met un bien En pause, avec une relance datée : le rendez-vous annulé, le propriétaire qui veut attendre ou n'est plus vendeur pour l'instant. Avec rdv_annule, le rendez-vous à venir de la fiche est retiré de la journée. Écrit tout de suite : appelle-le après son oui.",
    input_schema: {
      type: 'object',
      properties: {
        qui: { type: 'string', description: 'Le commerce ou le propriétaire (inutile depuis une fiche ouverte)' },
        motif: { type: 'string', description: 'Pourquoi, en quelques mots (« rendez-vous annulé »)' },
        relance_dans_jours: { type: 'number', description: 'La relance, dans N jours (7 par défaut pour un rendez-vous annulé)' },
        rdv_annule: { type: 'boolean' },
      },
    },
  },
  {
    name: 'mes_rappels',
    description: 'Les relances et rendez-vous du mandataire : en retard, du jour, à venir.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'demandes_clients',
    description:
      "Ce que cherchent les clients investisseurs de Klocka, ANONYMISÉ : où, quel budget, quel objectif. Jamais de nom ni de contact. « Qu'est-ce que cherchent les clients à Villeurbanne ? »",
    input_schema: { type: 'object', properties: { ville: { type: 'string', description: 'Filtre facultatif sur le lieu de recherche' } } },
  },
  {
    name: 'avis_de_marche',
    description:
      "Fourchette indicative de loyer au m² à une adresse (Equimmox, Data-B), sans rapport officiel. « Combien vaut le local rue Tronchet ? » Réponds par une fourchette et dis que ce n'est pas l'estimation officielle, qui passe par la validation Klocka.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: 'Adresse avec la ville (« 12 rue Carnot, Mâcon »)' },
        qui: { type: 'string', description: "Le commerce ou le propriétaire suivi, si on parle d'une fiche (« la boulangerie rue Carnot ») : son adresse est reprise de la fiche" },
      },
    },
  },
  {
    name: 'preparer_mail',
    description: "Rédige un brouillon de mail (relance d'un propriétaire, envoi d'un rapport). Il n'est PAS envoyé : le mandataire le relit et l'envoie lui-même depuis sa messagerie.",
    input_schema: {
      type: 'object',
      properties: { destinataire: { type: 'string' }, objet: { type: 'string' }, corps: { type: 'string' } },
      required: ['objet', 'corps'],
    },
  },
];

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pure : la ligne d'historique d'une fiche complétée, en phrases qui disent ce qu'on a appris (31 oct. 2026, Jules :
 * « Fiche complétée : téléphone, remarque, ça nous aide pas du tout »). La remarque est celle dite cette fois, pas
 * tout le cumul de la fiche.
 */
export function resumeComplement(patch = {}, { remarque = null, section = null, a_confirmer = false } = {}) {
  const tiers = a_confirmer ? ', à confirmer (dit par un tiers)' : '';
  const MOTS = { nom: 'Propriétaire', murs: 'Murs', gerant: 'Gérant', exploitant: 'Exploitant', commerce: 'Commerce', adresse: 'Adresse', ville: 'Ville', activite: 'Activité' };
  const phrases = [];
  if (patch.telephone !== undefined) phrases.push(patch.telephone ? `Téléphone : ${patch.telephone}${tiers}.` : 'Téléphone retiré.');
  if (patch.email !== undefined) phrases.push(patch.email ? `Mail : ${patch.email}${tiers}.` : 'Mail retiré.');
  for (const [k, mot] of Object.entries(MOTS)) if (patch[k] !== undefined) phrases.push(patch[k] ? `${mot} : ${patch[k]}.` : `${mot} retiré.`);
  if (remarque) phrases.push(`${String(remarque).trim().replace(/[.\s]+$/, '')}.`.replace(/^./, (c) => c.toUpperCase()));
  if (patch.prochaine_action || patch.prochaine_action_le) {
    const quand = patch.prochaine_action_le ? new Date(patch.prochaine_action_le) : null;
    const date = quand && !Number.isNaN(quand.getTime()) ? `, le ${quand.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: PARIS })}` : '';
    phrases.push(`Prochaine action : ${patch.prochaine_action || 'à faire'}${date}.`);
  }
  if (section?.titre) phrases.push(section.action === 'retirer' ? `Partie « ${section.titre} » retirée.` : `${section.titre} : ${String(section.texte || '').trim().replace(/[.\s]+$/, '')}.`);
  return phrases.join(' ') || 'Fiche mise à jour.';
}

/** Pure : les demandes des clients, sans rien qui permette de les joindre. */
export function anonymiser(clients, ville = null) {
  const cherche = ville ? norm(ville) : null;
  return clients
    .filter((c) => !cherche || norm(c.lieu_recherche).includes(cherche))
    .map((c, i) => ({
      client: `Client ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`,
      lieu_recherche: c.lieu_recherche || null,
      budget: c.budget || null,
      objectif: c.objectif || null,
    }));
}

/** Le dossier ou l'estimation du mandataire dont parle « bien », par les mots qu'ils partagent. */
// Les mots qui ne désignent aucun bien en particulier : « avenue » seul ne doit
// pas faire prendre la pharmacie du 8 avenue de la Gare pour le pressing.
const MOTS_VIDES = new Set(['rue', 'avenue', 'boulevard', 'place', 'quai', 'chemin', 'allee', 'route', 'impasse', 'cours', 'les', 'des', 'du', 'de', 'la', 'le', 'local', 'murs', 'commerce', 'bien', 'dossier', 'estimation']);

function trouverParBien(entite, bien, user) {
  const mots = norme(bien).split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
  // Les fiches d'exemple ne reçoivent jamais une vraie pièce ni une vraie demande (mandataire-exemples.js).
  const miens = Records.list(entite).filter((x) => !x.exemple && x.mandataire_email === String(user?.email || '').toLowerCase());
  const score = (x) => mots.filter((m) => norme(`${x.bien} ${x.adresse || ''}`).includes(m)).length;
  const tri = miens.map((x) => [x, score(x)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return tri.length && (tri.length === 1 || tri[0][1] > tri[1][1]) ? tri[0][0] : tri.length ? 'ambigu' : null;
}

/** Le lien d'un prospect et le CRM qu'il ouvre : la fiche Twenty (par l'id Monday) en Twenty ou en double, Monday sinon. */
async function lienDuProspect(m) {
  const M = await import('./monday.js');
  if (!M.crmTwenty() && !M.crmDouble()) return { lien: m.lien, crm: 'Monday' };
  const { lienProspect, TABLEAU_PROSPECTS } = await import('./mandataire-monday.js');
  return { lien: M.crmDouble() ? `/api/crm/fiche/${TABLEAU_PROSPECTS()}/${m.id}` : lienProspect(m.id), crm: 'Twenty CRM' };
}

/**
 * Pure : un numéro de téléphone tel que dicté (31 oct. 2026, terrain d'Antibes : « 06 6497 1881, 76 », douze chiffres,
 * était à deviner par le modèle). Un numéro français a dix chiffres, rendu par paires ; un numéro étranger (+44…) de 8 à
 * 15 chiffres. Sinon il n'est pas écrit comme téléphone : `chiffres` dit ce qui a été entendu.
 * @returns {{ ok: true, numero: string } | { ok: false, chiffres: string }}
 */
export function telephoneDicte(texte) {
  const brut = String(texte || '').trim();
  if (!brut) return { ok: true, numero: '' };
  if (/^\+(?!33)/.test(brut)) {
    const c = brut.replace(/\D/g, '');
    return c.length >= 8 && c.length <= 15 ? { ok: true, numero: `+${c}` } : { ok: false, chiffres: c };
  }
  const c = brut.replace(/^\+33\s*(\(0\))?/, '0').replace(/\D/g, '');
  return /^0[1-9]\d{8}$/.test(c) ? { ok: true, numero: c.replace(/(\d{2})(?=\d)/g, '$1 ') } : { ok: false, chiffres: c };
}

export async function executerOutilMandataire(appel, user, contexte = {}) {
  // Un nouveau contact pas encore confirmé ne crée rien : il passe, même au banc, pour rendre sa question.
  if (auBanc() && SIMULES_MANDATAIRE.has(appel?.name) && !(appel.name === 'nouveau_contact' && appel.input?.confirme !== true)) return simule(appel.name);
  // Meme filet que cote AK : une exception d'outil devient un refus propre.
  try {
    return await executerOutilMandataireBrut(appel, user, contexte);
  } catch (e) {
    console.warn(`[mandataire] outil ${appel?.name} en erreur :`, e?.stack || e);
    return { ok: false, error: `L'outil ${appel?.name} a échoué : ${e?.message || e}` };
  }
}

async function executerOutilMandataireBrut({ name, input = {} }, user, { piece: seule = null, pieces = null, fiche = null, texte: recit = '' } = {}) {
  const { lotDePieces, choisirPiece } = await import('./pieces-jointes.js');
  const lot = lotDePieces({ piece: seule, pieces });
  if (NOMS_OUTILS_VISITE.has(name)) return (await import('./visites-acquereur.js')).executerOutilVisite(name, input, user);
  if (name === 'donnees_commune') {
    const { executerOutil } = await import('./ak/agent.js');
    return executerOutil({ name: 'donnees_commune', input: { commune: input.commune } }, user);
  }
  if (name === 'loyers_marche') {
    // La même lecture que l'avis (3 nov. 2026, Jules : le chat citait Equimmox, l'avis Data-B, deux fourchettes) :
    // celle gardée sur une estimation de cette adresse, sinon Data-B, Equimmox en repli.
    const A = await import('./mandataire-avis.js');
    const adresse = String(input.adresse || '');
    const gardee = Records.list('EstimationMandataire').find((e) => e.mandataire_email === user?.email && A.lectureFraiche(e.valeur_locative_lue, adresse));
    const x = gardee?.valeur_locative_lue?.resultat || await A.lireValeurLocative(adresse, user, { bavard: false });
    if (!x) return { ok: false, error: 'Aucune valeur locative lisible ici : ni Data-B ni Equimmox n\'ont répondu.' };
    const niveau = (n) => (n ? { bas: n.basse ?? null, moyenne: n.moyenne ?? null, haut: n.haute ?? null } : null);
    return { ok: true, source: x.source || 'Data-B', unite: '€ HT HC/m²/an', rue: niveau(x.rue), quartier: niveau(x.quartier), ville: niveau(x.ville), note: "La même lecture que la valeur locative de l'avis : cite-la telle quelle, ne la contredis pas." };
  }
  if (name === 'prix_murs') {
    const { analysePrix } = await import('./equimmox.js');
    const r = await analysePrix(String(input.adresse || ''), { surface: Number(input.surface) || null, user });
    if (!r.ok) return { ok: false, error: `Equimmox : ${r.error}` };
    const x = r.resultat;
    return { ok: true, source: `${x.source} (offres de vente)`, prix_m2_bas: x.bas, prix_m2_moyen: x.moyenne, prix_m2_haut: x.haut, offres: x.offres, rayon: x.rayon, valeur_du_local: input.surface && x.moyenne ? Math.round(input.surface * x.moyenne) : null };
  }
  if (name === 'ventes_dvf') {
    const { ventesAutour } = await import('./dvf.js');
    const r = await ventesAutour(String(input.adresse || ''), { rayon: Number(input.rayon) || 800, user });
    if (!r.ok) return r;
    const v = r.resultat || {};
    return { ok: true, source: 'DVF (Demandes de valeurs foncières)', prix_m2: v.prix_m2 || null, ventes: (v.ventes || []).slice(0, 10).map((x) => ({ date: x.date, adresse: x.adresse, surface: x.surface, prix: x.prix, prix_m2: x.prix_m2, distance_m: x.distance_m })) };
  }
  if (name === 'recherche_web') {
    const { invokeLLMGrounded } = await import('./llm.js');
    const r = await invokeLLMGrounded({ prompt: `Recherche pour un mandataire en immobilier commercial, en français, réponse courte et factuelle : ${String(input.question || '').slice(0, 800)}` });
    if (!r) return { ok: false, error: 'La recherche web n\'est pas disponible.' };
    return { ok: true, texte: r.text.slice(0, 4000), sources: (r.sources || []).slice(0, 8) };
  }
  if (name === 'vacance_commerciale') {
    const { analyser } = await import('./kvacance.js');
    const r = await analyser(String(input.adresse || ''), { user });
    if (!r || r.ok === false) return { ok: false, error: r?.error || 'K-Vacance n\'a rien rendu.' };
    const { fermetures, locaux_vides: vides, ...reste } = r;
    return { ok: true, source: 'K-Vacance (relevé des locaux, registre SIRENE)', resume: JSON.stringify({ verdict: reste.verdict, vacance: reste.vacance, turnover: reste.turnover, vacance_duree: reste.vacance_duree }).slice(0, 3000), locaux_vides: (vides || []).length, fermetures_recentes: (fermetures || []).length };
  }
  if (name === 'annonces_bodacc') {
    const { vitaliteCommerciale } = await import('./bodacc.js');
    const r = await vitaliteCommerciale(String(input.adresse || ''), { user });
    if (!r.ok) return r;
    return { ok: true, source: 'BODACC', resultat: JSON.stringify(r.resultat).slice(0, 4000) };
  }
  if (name === 'annuler_derniere') {
    const genre = input.genre || 'tout';
    const miens = Records.list('Rappel')
      .filter((r) => r.espace === ESPACE && r.cree_par === user?.email && !r.fait_le)
      .filter((r) => genre === 'tout' || (genre === 'rdv' ? r.genre === 'rdv' : r.genre !== 'rdv'))
      .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));
    const r = miens[0];
    if (!r) return { ok: false, error: 'Rien à annuler.' };
    restaurerFiche(r);
    Records.delete('Rappel', r.id);
    return { ok: true, annule: true, titre: r.genre === 'rdv' ? `RDV ${r.avec ? `avec ${r.avec}` : ''}`.trim() : r.quoi || r.nom, pour: jourLisible(r.echeance) };
  }

  if (name === 'mes_dossiers') {
    const P = await import('./mandataire-portes.js');
    // Un admin qui teste la vue mandataire voit comme un mandataire, pas tout le monde.
    user = user?.role === 'admin' ? { ...user, role: 'mandataire' } : user;
    // Un propriétaire suivi (« M. Durand ») se lit par son commerce : c'est le nom du bien.
    const { retrouverProprietaire } = await import('./mandataire-espace.js');
    const { candidats } = input.bien ? retrouverProprietaire(input.bien, user, { ouverte: fiche }) : { candidats: [] };
    const cherche = candidats.length === 1 ? `${input.bien} ${candidats[0].commerce || ''}` : input.bien || '';
    const mots = norme(cherche).split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
    const garde = (x) => !x.exemple && (!mots.length || mots.some((m) => norme(`${x.bien} ${x.adresse || ''} ${x.vendeur || ''}`).includes(m)));
    const depuis = (x) => { const cles = Object.keys(x).filter((k) => k.endsWith('_le') && x[k]); const d = cles.map((k) => x[k]).sort().at(-1) || x.cree_le; return d ? `${Math.max(0, Math.round((Date.now() - Date.parse(d)) / 86400000))} j` : null; };
    return {
      estimations: P.listerEstimations(user).filter(garde).map((e) => ({ bien: e.bien, statut: e.statut, depuis: depuis(e), prix: e.rapport?.prix_bas ? `${e.rapport.prix_bas}-${e.rapport.prix_haut} €` : null, mot_de_klocka: e.commentaire || null })),
      mandats: P.listerMandats(user).filter(garde).map((m) => ({ bien: m.bien, vendeur: m.vendeur, statut: m.statut, depuis: depuis(m), registre: m.numero_registre || null })),
      dossiers: P.listerDossiers(user).filter(garde).map((d) => { const c = P.checklist(d); return { bien: d.bien, statut: d.statut, depuis: depuis(d), recues: c.lignes.filter((l) => l.recue).map((l) => l.mot), manquantes: c.manquantes.map((l) => l.mot), facultatives_absentes: c.lignes.filter((l) => !l.requise && !l.recue).map((l) => l.mot), mot_de_klocka: d.commentaire || null }; }),
      mises_en_marche: P.listerMarches(user).filter(garde).map((m) => ({ bien: m.bien, statut: m.statut, depuis: depuis(m) })),
    };
  }

  if (name === 'lancer_estimation') {
    const P = await import('./mandataire-portes.js');
    // Depuis la fiche d'un bien (25 oct. 2026) : son estimation, et l'adresse de la fiche.
    const { objetsDuBien } = await import('./bien-etapes.js');
    let e = fiche ? objetsDuBien(fiche).estimation : null;
    if (!e) e = trouverParBien('EstimationMandataire', input.bien, user);
    if (e === 'ambigu') return { ok: false, error: 'Plusieurs estimations correspondent : demande laquelle en une ligne.' };
    // L'adresse : celle donnée, sinon celle de la fiche du propriétaire.
    let adresse = input.adresse || (fiche?.adresse ? [fiche.adresse, fiche.ville].filter(Boolean).join(', ') : null);
    if (!adresse) {
      const { retrouverProprietaire } = await import('./mandataire-espace.js');
      const { candidats } = retrouverProprietaire(input.bien, user, { ouverte: fiche });
      if (candidats.length === 1 && candidats[0].adresse) adresse = [candidats[0].adresse, candidats[0].ville].filter(Boolean).join(', ');
    }
    if (!e) e = P.creerEstimation({ bien: input.bien, adresse }, user).estimation;
    else if (adresse && !e.adresse) P.modifierEstimation(e.id, { adresse }, user);
    if (fiche && e.proprietaire_id !== fiche.id) P.modifierEstimation(e.id, { proprietaire_id: fiche.id }, user);
    if (input.infos) {
      const m = P.modifierEstimation(e.id, { infos_rdv: [e.infos_rdv, input.infos].filter(Boolean).join('\n') }, user);
      if (!m.ok) return m;
    }
    const frais = Records.get('EstimationMandataire', e.id);
    if (!frais.bail?.texte && !frais.infos_rdv) {
      return { ok: false, error: "Il manque de quoi estimer : demande la photo du bail (en pièce jointe) ou les infos clés (loyer annuel, surface, état) en une ligne." };
    }
    // La rédaction lit le marché (une à deux minutes) : elle part en fond, le
    // chat répond tout de suite, une notification dit quand le rapport est prêt.
    // Depuis la fiche d'un bien, la notification ouvre l'étape Estimation du bien (26 oct. 2026).
    const lien = fiche ? `/MandataireBiens?bien=proprietaire:${fiche.id}&etape=estimation` : `/EstimationMandataire?estimation=${e.id}`;
    (async () => {
      const { notifier } = await import('./notifications.js');
      try {
        const r = await P.genererRapport(e.id, user);
        const rapport = r.estimation?.rapport || {};
        notifier({
          pour: user?.email,
          titre: r.ok ? `Rapport prêt · ${r.estimation.bien}` : `Estimation impossible · ${frais.bien}`,
          texte: r.ok ? (rapport.prix_bas ? `${rapport.prix_bas.toLocaleString('fr-FR')} – ${rapport.prix_haut.toLocaleString('fr-FR')} €. À relire avant de l'envoyer.` : 'Pas de loyer lu : la valeur ne se calcule pas encore.') : r.error,
          lien, action: 'Ouvrir le rapport', genre: r.ok ? 'info' : 'erreur', cle: `estimation:${e.id}:${Date.now()}`,
        });
      } catch (err) {
        notifier({ pour: user?.email, titre: `Estimation impossible · ${frais.bien}`, texte: String(err?.message || err), lien, genre: 'erreur' });
      }
    })();
    return {
      ok: true, cree: true, en_cours: true, estimation_id: e.id,
      titre: `Rapport d'estimation « ${frais.bien} »`,
      pour: 'en rédaction · une notification dira quand il est prêt',
      lien,
      note: "La rédaction lit le marché de la rue (une à deux minutes) : dis en une ligne qu'une notification préviendra quand le rapport est prêt. N'invente aucun chiffre.",
    };
  }

  if (name === 'demander_mandat') {
    const P = await import('./mandataire-portes.js');
    // Depuis la fiche d'un bien : le mandat suit son estimation, le prix d'accord à défaut de prix dit.
    const { objetsDuBien } = await import('./bien-etapes.js');
    const duBien = fiche ? objetsDuBien(fiche) : {};
    const r = P.demanderMandat({
      ...input,
      prix: input.prix || fiche?.biens?.prix_accord || input.prix,
      estimation_id: input.estimation_id || duBien.estimation?.id || null,
      honoraires_charge: input.honoraires_charge || 'vendeur',
      type: input.type || 'exclusif',
      duree_mois: input.duree_mois || 12,
    }, user);
    if (!r.ok) return r;
    return {
      ok: true, cree: true, mandat_id: r.mandat.id,
      titre: `Demande de mandat envoyée : ${r.mandat.bien}`,
      pour: `${r.mandat.vendeur} · ${Number(r.mandat.prix).toLocaleString('fr-FR')} € · ${r.mandat.type} · ${r.mandat.duree_mois} mois`,
      lien: '/MandatMandataire',
      note: 'Klocka rédige le mandat et le dépose prêt à signer sur la page Mandat, sous 48 h.',
    };
  }

  if (name === 'corriger_mandat') {
    const m = trouverParBien('MandatMandataire', input.bien, user);
    if (m === 'ambigu') return { ok: false, error: 'Plusieurs mandats correspondent : demande lequel en une ligne.' };
    if (!m) return { ok: false, error: `Aucun mandat pour « ${input.bien} ».` };
    const { corrigerAgentMandat } = await import('./mynotary-agent.js');
    return corrigerAgentMandat(m.id, input.demande, user);
  }

  if (name === 'ranger_piece' || name === 'bail_estimation') {
    const piece = choisirPiece(lot, input.piece);
    if (piece === 'ambigu') return { ok: false, error: `Plusieurs pièces sont jointes (${lot.map((p) => p.nom).join(', ')}) : redis laquelle dans « piece », un appel par pièce.` };
    if (!piece?.url) return { ok: false, error: "Il n'y a pas de pièce jointe à ce message." };
    const P = await import('./mandataire-portes.js');
    if (name === 'ranger_piece') {
      let d = trouverParBien('DossierMandataire', input.bien, user);
      if (d === 'ambigu') return { ok: false, error: 'Plusieurs dossiers correspondent : demande lequel en une ligne.' };
      if (!d) {
        if (!input.creer_si_absent) return { ok: false, error: `Aucun dossier pour « ${input.bien} » : propose d'en créer un.` };
        d = P.creerDossier({ bien: input.bien }, user).dossier;
      }
      const r = P.ajouterPiece(d.id, input.categorie, { filename: piece.nom, url: piece.url }, user);
      if (!r.ok) return r;
      const { checklist } = P;
      const c = checklist(r.dossier);
      return { ok: true, cree: true, piece_rangee: true, titre: `${piece.nom} rangé dans « ${d.bien} »`, pour: c.complet ? 'dossier complet : prêt à envoyer à Klocka' : r.dossier.statut === 'en_etude' ? 'déposée dans l’analyse de Klocka' : `transférable à Klocka dès maintenant ; il manque encore ${c.manquantes.map((m) => m.mot.toLowerCase()).join(', ')}`, lien: '/DossierMandataire' };
    }
    let e = trouverParBien('EstimationMandataire', input.bien, user);
    if (e === 'ambigu') return { ok: false, error: 'Plusieurs estimations correspondent : demande laquelle en une ligne.' };
    if (!e) e = P.creerEstimation({ bien: input.bien, adresse: input.adresse || null }, user).estimation;
    const r = await P.deposerBail(e.id, { filename: piece.nom, mimetype: piece.mimetype, url: piece.url, texte: piece.texte ?? null }, user);
    if (!r.ok) return r;
    return { ok: true, cree: true, piece_rangee: true, titre: `Bail déposé sur l'estimation « ${e.bien} »`, pour: "estimation prête à lancer", lien: `/EstimationMandataire?estimation=${e.id}`, note: "Propose en une ligne de rédiger le rapport tout de suite (lancer_estimation), ou le mandataire le fera depuis la page Estimation." };
  }

  if (name === 'noter_relance') {
    const { creerRappel } = await rappels();
    const r = await creerRappel({ texte: input.texte, user });
    if (!r.ok) return r;
    // Liée à la fiche quand elle se reconnaît sans doute : un RDV ou un « pas
    // vendeur » sur cette personne effacera la relance.
    // La fiche ouverte, ou celle que « qui » désigne, passe avant la lecture de la phrase (31 oct. 2026 : « Repasser à la
    // Boulangerie Roux jeudi » ne se rattachait pas, « repasser » et « jeudi » comptant comme des mots du nom).
    const { retrouverProprietaire } = await import('./mandataire-espace.js');
    const { ambigu, candidats } = fiche?.id && !input.qui ? { ambigu: false, candidats: [fiche] } : retrouverProprietaire(input.qui || input.texte, user, { ouverte: fiche });
    Records.update('Rappel', r.rappel.id, { genre: 'relance', espace: ESPACE, ...(!ambigu && candidats.length === 1 ? { proprietaire_id: candidats[0].id } : {}) });
    return { ok: true, cree: true, rappel_id: r.rappel.id, titre: r.rappel.titre, pour: jourLisible(r.rappel.echeance) };
  }

  // La date d'un rendez-vous se valide avant de toucher à la fiche : une date
  // illisible ne doit pas laisser une fiche « RDV pris » sans rendez-vous.
  if (name === 'noter_rdv' && !heureDeParis(input.quand)) return { ok: false, error: 'Date du rendez-vous illisible.' };

  if (name === 'modifier_fiche') {
    const { retrouverProprietaire, titreProprietaire, modifierProprietaire } = await import('./mandataire-espace.js');
    const moi = String(user?.email || '').toLowerCase();
    let cible = input.proprietaire_id ? Records.get('ProprietaireMandataire', input.proprietaire_id) : null;
    if (cible && cible.mandataire_email !== moi) cible = null;
    if (!cible && fiche?.id && !input.qui) cible = Records.get('ProprietaireMandataire', fiche.id);
    if (!cible) {
      if (!input.qui) return { ok: false, error: 'De quelle fiche parle-t-il ? Demande-le en une ligne.' };
      const { ambigu, candidats } = retrouverProprietaire(input.qui, user, { ouverte: fiche });
      if (!candidats.length) return { ok: false, error: `Aucune fiche ne correspond à « ${input.qui} ». Propose de créer le contact (nouveau_contact).` };
      if (ambigu) return { ok: false, ambigu: true, choix: candidats.map((c) => titreProprietaire(c)), error: 'Plusieurs fiches correspondent : demande laquelle en une ligne.' };
      cible = candidats[0];
    }
    const patch = {};
    const champsSimples = ['telephone', 'email', 'nom', 'murs', 'gerant', 'exploitant', 'commerce', 'adresse', 'ville', 'activite', 'prochaine_action', 'prochaine_action_le'];
    for (const k of champsSimples) if (typeof input[k] === 'string') patch[k] = input[k].trim();
    // Un numéro qui n'a pas le bon nombre de chiffres n'est pas écrit comme téléphone, mais il n'est pas perdu : il
    // reste en remarque, « à vérifier », et l'assistant le fait redire (31 oct. 2026).
    let illisible = null;
    if (patch.telephone) {
      const t = telephoneDicte(patch.telephone);
      if (t.ok) patch.telephone = t.numero;
      else { illisible = { dicte: patch.telephone, chiffres: t.chiffres.length }; delete patch.telephone; }
    }
    const remarques = [input.remarque ? String(input.remarque).trim() : null, illisible ? `Numéro dicté à vérifier : ${illisible.dicte} (${illisible.chiffres} chiffres${input.source ? `, donné par ${String(input.source).trim()}` : ''})` : null].filter(Boolean).join(' · ');
    if (remarques) patch.remarque = cible.remarque ? `${cible.remarque} · ${remarques}` : remarques;
    // Une partie libre : ajoutée, réécrite (même titre) ou retirée.
    if (input.section?.titre) {
      const titre = String(input.section.titre).trim();
      const autres = (cible.sections || []).filter((x) => x.titre.toLowerCase() !== titre.toLowerCase());
      patch.sections = input.section.action === 'retirer' ? autres
        : [...(cible.sections || []).map((x) => (x.titre.toLowerCase() === titre.toLowerCase() ? { titre, texte: String(input.section.texte || '').trim() } : x)),
          ...((cible.sections || []).some((x) => x.titre.toLowerCase() === titre.toLowerCase()) ? [] : [{ titre, texte: String(input.section.texte || '').trim() }])];
    }
    const faits = [];
    let r = null;
    // Le statut d'abord : il remet la prochaine action à zéro, celle dite dans le même geste passe ensuite.
    if (input.statut) {
      const { noterResultat } = await import('./mandataire-espace.js');
      const st = noterResultat(cible.id, { statut: input.statut, texte: input.statut === 'pas_vendeur' ? "Pas d'intérêt" : null, rappel_dans_jours: input.statut === 'pas_vendeur' ? 180 : null }, user);
      if (!st.ok) return st;
      faits.push(`statut ${input.statut}`);
    }
    if (Object.keys(patch).length) {
      r = modifierProprietaire(cible.id, patch, user);
      if (!r.ok) return r;
    }
    if (input.liste) {
      const { changerDeListe } = await import('./off-market/simple.js');
      const l = changerDeListe(cible.id, { nom: input.liste, user });
      if (!l.ok) return l;
      faits.push(`liste « ${l.liste.nom} »`);
    }
    if (!r && !faits.length) return { ok: false, error: 'Rien à noter : dis ce qui change en une ligne.' };
    if (!r) return { ok: true, fiche_id: cible.id, titre: titreProprietaire(cible), fait: `Fiche à jour : ${faits.join(' ; ')}.` };
    // D'où vient l'information : dite à Haka, et « à confirmer » si elle vient d'un tiers.
    const conf = { ...(r.proprietaire.a_confirmer || {}) };
    for (const k of ['telephone', 'email']) if (patch[k]) { if (input.a_confirmer) conf[k] = true; else delete conf[k]; }
    // La source de chaque champ écrit (31 oct. 2026, principe 3 du manuel) : « l'exploitante », « le bail »…
    const source = String(input.source || '').trim().slice(0, 60) || null;
    const sources = { ...(r.proprietaire.sources || {}) };
    for (const k of Object.keys(patch)) if (k !== 'sections') sources[k] = { source: source || 'le mandataire', a_confirmer: !!input.a_confirmer, le: new Date().toISOString() };
    if (input.section?.titre && input.section.action !== 'retirer') sources[`section:${String(input.section.titre).trim().toLowerCase()}`] = { source: source || 'le mandataire', a_confirmer: !!input.a_confirmer, le: new Date().toISOString() };
    Records.update('ProprietaireMandataire', cible.id, { a_confirmer: conf, sources, ...(patch.telephone ? { telephone_source: source ? `${source}${input.a_confirmer ? ', à confirmer' : ''}` : input.a_confirmer ? "dit à l'Assistant KPartners, d'un tiers" : "dit à l'Assistant KPartners" } : {}), historique: [...(r.proprietaire.historique || []), { le: new Date().toISOString(), type: 'note', texte: `Fiche complétée${source ? ` (source : ${source})` : ''} : ${Object.keys(patch).map((k) => (({ telephone: 'téléphone', email: 'mail', nom: 'propriétaire', murs: 'murs', gerant: 'gérant', exploitant: 'exploitant', remarque: 'remarque', commerce: 'commerce', adresse: 'adresse', ville: 'ville', activite: 'activité', prochaine_action: 'prochaine action', prochaine_action_le: 'date de la prochaine action', sections: 'partie libre' }[k] || k))).join(', ')}` }] });
    const dits = Object.entries(patch).map(([k, v]) => (k === 'sections' ? `partie « ${input.section.titre} » ${input.section.action === 'retirer' ? 'retirée' : 'écrite'}` : `${k} ${v || '(vidé)'}`));
    return {
      ok: true, fiche_id: cible.id, titre: titreProprietaire(cible), fait: `Fiche à jour : ${[...dits, ...faits].join(' ; ')}${input.a_confirmer ? ' (à confirmer)' : ''}.`,
      ...(illisible ? { telephone_illisible: illisible, note: `Le numéro dicté a ${illisible.chiffres} chiffres au lieu de 10 : il n'est PAS écrit comme téléphone, il est gardé en remarque « à vérifier ». Dis-le en une ligne et demande-lui de le redire par paires (« zéro six, soixante-quatre… ») ; ne devine aucun chiffre.` } : {}),
    };
  }
  // Prospecter depuis le chat (2 nov. 2026, Jules) : la page Prospection lit la phrase et pose les filtres
  // (src/lib/off-market-simple.js, comprendre). Rien n'est écrit ici.
  if (name === 'prospecter_commerces') {
    const phrase = String(input.phrase || '').trim().slice(0, 200);
    if (!phrase) return { ok: false, error: 'Que cherche-t-il ? Demande-le en une ligne.' };
    return { ok: true, fait: `La Prospection s'ouvre filtrée sur « ${phrase} ».`, boutons: [{ libelle: 'Voir les commerces', href: `/MandataireProspection?recherche=${encodeURIComponent(phrase)}`, principal: true }] };
  }
  // Un local vide vu sur le terrain (3 nov. 2026, Jules) : il entre sur la carte des Murs libres (server/murs-libres.js).
  if (name === 'signaler_local_vide') {
    const r = await (await import('./murs-libres.js')).signalerLocalVide(user, { adresse: input.adresse, note: input.note });
    if (!r.ok) return r;
    return { ok: true, fait: `${r.local.adresse}, ${r.local.ville} est sur la carte des Murs libres.`, boutons: [{ libelle: 'Voir les murs libres', href: '/MandataireProspection', principal: true }] };
  }
  // Un bien du portefeuille, raconté avec ses pièces (3 nov. 2026, Jules) : la carte seule, rien n'est écrit avant le tap.
  if (name === 'importer_bien') {
    const I = await import('./biens-import.js');
    const { mesProprietaires } = await import('./mandataire-espace.js');
    const lu = I.bienLu(input);
    if (!lu) return { ok: false, error: "Il faut au moins l'adresse, le commerce ou le propriétaire : demande-le en une ligne." };
    if (I.marquerDoublons([lu], mesProprietaires(user))[0].deja) return { ok: false, error: 'Ce bien est déjà dans ses biens (même adresse ou même numéro de mandat) : dis-le, et propose de ranger les pièces sur sa fiche.' };
    const etape = I.etapeDuBien(lu);
    const mot = I.ETAPES_IMPORT[etape].mot;
    const titre = [lu.commerce || lu.activite || lu.proprietaire, lu.adresse, lu.ville].filter(Boolean).join(', ');
    const jointes = (lot || []).filter((x) => x?.url).map((x) => ({ nom: x.nom, url: x.url, mimetype: x.mimetype || null }));
    const prix = lu.prix ? `${lu.prix.toLocaleString('fr-FR')} €` : null;
    const pour = [mot, prix, jointes.length ? `${jointes.length} pièce${jointes.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
    return {
      ok: true, a_confirmer: true,
      carte: { type: 'confirmer_import', id: `import-${Date.now()}`, mot: 'Créer le bien', titre, pour, bien: lu, etape, pieces: jointes, recit: String(recit || '').slice(0, 4000) },
      bien: { ...lu, etape: mot }, pieces: jointes.map((x) => x.nom), manque: input.manque || null,
      note: "Pas encore créé : le mandataire confirme d'un tap (« Confirmer · Créer le bien »).",
    };
  }
  if (name === 'avancer_bien') {
    const { retrouverProprietaire, titreProprietaire } = await import('./mandataire-espace.js');
    const { ETAPES_BIENS } = await import('./fiche-mandataire.js');
    const moi = String(user?.email || '').toLowerCase();
    let cible = input.proprietaire_id ? Records.get('ProprietaireMandataire', input.proprietaire_id) : null;
    if (cible && cible.mandataire_email !== moi) cible = null;
    // Depuis une fiche ouverte, c'est elle, sauf s'il en nomme une autre.
    if (!cible && fiche?.id && !input.qui) cible = Records.get('ProprietaireMandataire', fiche.id);
    if (!cible) {
      if (!input.qui) return { ok: false, error: 'De quel bien parle-t-il ? Demande-le en une ligne.' };
      const { ambigu, candidats } = retrouverProprietaire(input.qui, user, { ouverte: fiche });
      if (!candidats.length) return { ok: false, error: `Aucune fiche ne correspond à « ${input.qui} ».` };
      if (ambigu) return { ok: false, ambigu: true, choix: candidats.map((c) => titreProprietaire(c)), error: 'Plusieurs fiches correspondent : demande laquelle en une ligne.' };
      cible = candidats[0];
    }
    // Pas encore dans Biens : il y entre à la confirmation (sauter des étapes, 1er nov. 2026).
    const { ALIAS_ETAPES } = await import('./fiche-mandataire.js');
    const id = ALIAS_ETAPES[input.etape] || input.etape;
    const e = ETAPES_BIENS.find(([k]) => k === id);
    if (!e) return { ok: false, error: 'Étape inconnue.' };
    const { lirePrix } = await import('./bien-etapes.js');
    const prix = id === 'estimation' ? lirePrix(input.prix) : null;
    // L'accord sur un prix se confirme par la route du prix (l'écran reconnaît « prix_accord ») ; il fait l'Avis de valeur.
    if (prix) return { ok: true, a_confirmer: true, proprietaire_id: cible.id, etape: 'prix_accord', mot: `Avis accepté à ${prix.toLocaleString('fr-FR')} €`, prix, titre: titreProprietaire(cible), note: "Pas encore fait : le mandataire confirme d'un tap à l'écran." };
    return { ok: true, a_confirmer: true, proprietaire_id: cible.id, etape: e[0], mot: e[1], prix: null, titre: titreProprietaire(cible), note: "Pas encore fait : le mandataire confirme d'un tap à l'écran." };
  }
  // La restitution de l'avis (27 oct. 2026) : le cas dicté, proposé ; l'écran le fait confirmer d'un tap.
  if (name === 'noter_restitution') {
    const { retrouverProprietaire, titreProprietaire } = await import('./mandataire-espace.js');
    const moi = String(user?.email || '').toLowerCase();
    let cible = input.proprietaire_id ? Records.get('ProprietaireMandataire', input.proprietaire_id) : null;
    if (cible && cible.mandataire_email !== moi) cible = null;
    if (!cible && fiche?.id && !input.qui) cible = Records.get('ProprietaireMandataire', fiche.id);
    if (!cible) {
      if (!input.qui) return { ok: false, error: 'De quel bien parle-t-il ? Demande-le en une ligne.' };
      const { ambigu, candidats } = retrouverProprietaire(input.qui, user, { ouverte: fiche });
      if (!candidats.length) return { ok: false, error: `Aucune fiche ne correspond à « ${input.qui} ».` };
      if (ambigu) return { ok: false, ambigu: true, choix: candidats.map((c) => titreProprietaire(c)), error: 'Plusieurs fiches correspondent : demande laquelle en une ligne.' };
      cible = candidats[0];
    }
    const { proposerRestitution } = await import('./restitution-avis.js');
    return proposerRestitution(cible.id, input, user);
  }
  if (name === 'appel_sans_reponse' || name === 'resultat_appel' || (name === 'noter_rdv' && input.qui)) {
    const { retrouverProprietaire, noterSansReponse, noterResultat, titreProprietaire } = await import('./mandataire-espace.js');
    const { ambigu, candidats } = retrouverProprietaire(input.qui, user, { ouverte: fiche });
    if (!candidats.length && name !== 'noter_rdv') {
      return { ok: false, error: `Aucune fiche ne correspond à « ${input.qui} ». Propose de créer le contact (nouveau_contact) ou demande de préciser.` };
    }
    if (ambigu) {
      return { ok: false, ambigu: true, choix: candidats.map((c) => titreProprietaire(c)), error: 'Plusieurs fiches correspondent : demande laquelle en une ligne.' };
    }
    const visee = candidats[0] || null;
    if (name === 'appel_sans_reponse') {
      const r = noterSansReponse(visee.id, user);
      if (!r.ok) return r;
      return {
        ok: true, cree: true, rappel_id: r.rappel_id, titre: r.titre, pour: r.pour, tentatives: r.tentatives, fiche_id: visee.id,
        note: r.passe_a_recontacter ? 'Dernière tentative : la fiche passe « À recontacter ».' : null,
      };
    }
    if (name === 'resultat_appel') {
      const r = noterResultat(visee.id, { statut: input.statut, texte: input.note || null, rappel_dans_jours: input.rappel_dans_jours || null }, user);
      if (!r.ok) return r;
      const suite = r.rappel_id ? ` Rappel posé dans ${Math.round(input.rappel_dans_jours)} jours.` : '';
      return { ok: true, fiche_id: r.proprietaire.id, statut: r.proprietaire.statut, titre: titreProprietaire(r.proprietaire), fait: `statut ${r.proprietaire.statut}.${suite}`, ...(r.rappel_id ? { cree: true, rappel_id: r.rappel_id, pour: `dans ${Math.round(input.rappel_dans_jours)} jours` } : {}) };
    }
    // noter_rdv avec une fiche : le rendez-vous se pose plus bas, la fiche change ici.
    if (visee) {
      // L'état d'avant voyage jusqu'au rappel du RDV : son Annuler le restaure.
      input = {
        ...input,
        telephone: input.telephone || visee.telephone || undefined,
        avec: input.avec || visee.nom || visee.commerce,
        _fiche: { id: visee.id, retour: { tentatives: visee.tentatives || 0, statut: visee.statut, prochaine_action: visee.prochaine_action || null, prochaine_action_le: visee.prochaine_action_le || null } },
      };
      noterResultat(visee.id, { statut: 'rdv_pris', texte: `RDV pris${input.quand ? ` (${input.quand})` : ''}` }, user);
    }
  }


  if (name === 'noter_rdv') {
    const quand = heureDeParis(input.quand);
    if (!quand) return { ok: false, error: 'Date du rendez-vous illisible.' };
    const r = Records.create('Rappel', {
      espace: ESPACE,
      genre: 'rdv',
      proprietaire_id: input._fiche?.id || null,
      retour: input._fiche?.retour || null,
      nom: input.avec || null,
      avec: input.avec || null,
      objet: input.objet || null,
      lieu: input.lieu || null,
      quoi: `RDV avec ${input.avec}`,
      note: [input.objet, input.lieu].filter(Boolean).join(' · ') || null,
      telephone: input.telephone || null,
      echeance: quand.toISOString(),
      cree_le: new Date().toISOString(),
      cree_par: user?.email || null,
      fait_le: null,
    });
    return { ok: true, cree: true, rappel_id: r.id, titre: `RDV avec ${input.avec}`, pour: `${jourLisible(r.echeance)} à ${heureLisible(r.echeance)}`, fiche_id: input._fiche?.id || null };
  }

  if (name === 'visite_du_moment') {
    const candidats = (await import('./preparation-rdv.js')).visiteDuMoment(user);
    if (fiche) return { ok: true, candidats: [{ fiche_id: fiche.id, bien: [fiche.commerce || fiche.nom, fiche.ville].filter(Boolean).join(' · ') }], depuis_la_fiche: true };
    return candidats.length ? { ok: true, candidats } : { ok: true, candidats: [], conseil: 'Aucun rendez-vous autour de maintenant : demande de quel bien il parle (mes_proprietaires).' };
  }

  if (name === 'compte_rendu_visite') {
    const id = fiche?.id || input.fiche_id;
    if (!id) return { ok: false, error: 'Quel bien ? Appelle visite_du_moment, puis fais confirmer le bien.' };
    // Plusieurs pièces : la première photo du lot.
    const image = lot.find((p) => /^image\//.test(String(p.mimetype || '')) && p.url);
    const photo = image ? { url: image.url } : null;
    return (await import('./preparation-rdv.js')).enregistrerCompteRendu(id, input, user, { photo });
  }

  if (name === 'corriger_preparation') {
    if (!fiche) return { ok: false, error: 'Ouvrez la Visite du bien pour corriger sa préparation.' };
    const PR = await import('./preparation-rdv.js');
    const faits = [];
    if (input.ajout) {
      const p = Records.get('ProprietaireMandataire', fiche.id);
      Records.update('ProprietaireMandataire', fiche.id, { historique: [...(p.historique || []), { le: new Date().toISOString(), type: 'dictee', texte: String(input.ajout).slice(0, 300) }] });
      faits.push('précision retenue');
    }
    if (input.decaler_a) {
      const r = await PR.decalerRdv(fiche.id, String(input.decaler_a).slice(0, 16), user);
      if (!r.ok) return r;
      faits.push('rendez-vous décalé');
    } else await PR.preparer(fiche.id, { user, estimer: false });
    return { ok: true, faits, fiche_id: fiche.id };
  }

  if (name === 'mes_acquereurs') {
    const A = await import('./acquereurs-mandataire.js');
    const tous = A.mesAcquereurs(user);
    if (!tous.length) return { ok: true, acquereurs: [], conseil: "Aucun fichier acquéreurs : il s'importe dans Clients › Mes acquéreurs (Excel, CSV ou liste collée)." };
    const bien = { ville: input.ville || fiche?.ville || null, prix: input.prix || null, type: input.type || null, activite: fiche?.activite || null };
    const filtre = bien.ville || bien.prix || bien.type || bien.activite;
    const liste = filtre ? A.acquereursPour(bien, tous) : tous;
    return { ok: true, total: tous.length, acquereurs: liste.slice(0, 25).map((a) => ({ nom: a.nom, telephone: a.telephone, email: a.email, recherche: a.recherche, villes: a.villes, budget_min: a.budget_min, budget_max: a.budget_max, rendement_min: a.rendement_min, pourquoi: a.pourquoi })) };
  }
  if (name === 'mes_rappels') return tableauDuJour(user);

  if (name === 'nouveau_contact') {
    const { creerProprietaire, titreProprietaire, secteurDe, communeDansSecteur, retrouverProprietaire, modifierProprietaire } = await import('./mandataire-espace.js');
    // Déjà suivi (créé à l'instant depuis un bail, par exemple) : on ne double pas la fiche.
    const { candidats } = retrouverProprietaire([input.nom, input.commerce].filter(Boolean).join(' '), user);
    const meme = candidats.find((c) => input.nom && norme(c.nom || '').includes(norme(input.nom).replace(/^(m|mme|mr|monsieur|madame)\.? /, '')));
    if (meme) {
      return { ok: true, deja_suivi: true, proprietaire_id: meme.id, titre: titreProprietaire(meme), fait: 'Cette personne a déjà sa fiche : ne crée rien, mets-la à jour avec modifier_fiche (proprietaire_id) et dis-le en une ligne.' };
    }
    // Le minimum : un commerce ou une adresse, et une ville.
    const manque = [!input.commerce && !input.adresse && 'le commerce ou l\'adresse', !input.ville && 'la ville'].filter(Boolean);
    if (manque.length) {
      const secteurAide = secteurDe(user);
      const communes = (secteurAide?.unites || []).filter((u) => u.niveau === 'commune').map((u) => u.nom);
      const piste = !input.ville && communes.length ? ` Pour la ville, propose celles du secteur (${communes.slice(0, 4).join(', ')}).` : '';
      return { ok: false, a_demander: manque, error: `Il manque ${manque.join(' et ')} : demande-le en une ligne, ne crée rien.${piste}` };
    }
    // Hors du secteur : on ne crée rien.
    const secteur = secteurDe(user);
    if (secteur) {
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(input.ville)}&fields=nom,code,codeDepartement,codeRegion,centre&boost=population&limit=1`, { signal: AbortSignal.timeout(4000) });
        const c = r.ok ? (await r.json())[0] : null;
        if (c?.centre?.coordinates && !communeDansSecteur({ ...c, lat: c.centre.coordinates[1], lon: c.centre.coordinates[0] }, secteur)) {
          return { ok: false, hors_secteur: true, error: `${c.nom} est hors du secteur « ${secteur.nom} » : ne crée rien, dis-le en une ligne. Un bien hors secteur se signale à Klocka.` };
        }
      } catch { /* sans API Géo, on ne bloque pas */ }
    }
    const statut = input.statut === 'contacte' ? 'contacte' : 'a_appeler';
    // Le commerce que Klocka connaît déjà, à cette adresse ou sous ce nom : la fiche naît de lui (photo, propriétaire, signaux).
    const { retrouverCommerce } = await import('./off-market/simple.js');
    const connu = retrouverCommerce({ commerce: input.commerce, adresse: input.adresse, ville: input.ville });
    if (!connu.commerce && connu.candidats?.length > 1) {
      return { ok: false, ambigu: true, choix: connu.candidats.map((c) => [c.enseigne || c.nom, c.adresse].filter(Boolean).join(', ')), error: 'Plusieurs commerces correspondent : demande lequel en une ligne, avec son adresse. Ne crée rien avant.' };
    }
    const tel = telephoneDicte(input.telephone);
    if (!tel.ok) return { ok: false, telephone_illisible: true, error: `Le numéro dicté a ${tel.chiffres.length} chiffres au lieu de 10 : ne crée rien, demande-lui de le redire par paires, sans deviner.` };
    // Un commerce déjà suivi ne se propose pas : on le dit avant toute question.
    const suivi = connu.commerce ? Records.list('ProprietaireMandataire').find((p) => p.commerce_simple_id === connu.commerce.id) : null;
    if (suivi && suivi.mandataire_email !== String(user?.email || '').toLowerCase()) return { ok: false, error: 'Ce commerce est déjà suivi par un autre mandataire. Dis-le en une ligne.' };
    if (suivi) return { ok: true, deja_suivi: true, proprietaire_id: suivi.id, titre: titreProprietaire(suivi), fait: 'Ce commerce a déjà sa fiche chez ce mandataire : ne crée rien, mets-la à jour avec modifier_fiche (proprietaire_id) et dis-le en une ligne.' };
    // Demander, puis faire (31 oct. 2026, Jules : « il demande le truc et ensuite il dit qu'il l'a fait ») : sans son
    // oui, rien n'est créé ni envoyé, et la question porte aussi la liste.
    if (input.confirme !== true) {
      const { mesListes } = await import('./mandataire-lancement.js');
      const listes = mesListes(user).sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || ''))).map((l) => l.nom).slice(0, 6);
      const quoi = [input.commerce || input.adresse, input.ville].filter(Boolean).join(', ');
      return {
        ok: true, a_proposer: true, listes,
        fait: `Rien n'est créé. Propose en une ligne : ${listes[0] ? `« Je crée la fiche ${quoi} et je la mets dans ta liste « ${listes[0]} » ? »` : `« Je crée la fiche ${quoi} ? »`}, puis attends. À son oui, rappelle nouveau_contact avec les mêmes informations, confirme true et la liste (une autre s'il en nomme une, aucune s'il n'en veut pas).`,
      };
    }
    let proprietaire = null;
    let lie = false;
    if (connu.commerce) {
      const { ficheDuCommerce } = await import('./fiche-mandataire.js');
      const f = await ficheDuCommerce(connu.commerce.id, user, { statut });
      if (!f.ok) return { ok: false, error: `${f.error} Dis-le en une ligne.` };
      proprietaire = f.proprietaire;
      lie = true;
      if (f.deja) return { ok: true, deja_suivi: true, proprietaire_id: proprietaire.id, titre: titreProprietaire(proprietaire), fait: 'Ce commerce a déjà sa fiche chez ce mandataire : ne crée rien, mets-la à jour avec modifier_fiche (proprietaire_id) et dis-le en une ligne.' };
    } else {
      const r = creerProprietaire({ ...input, commerce: input.commerce || input.adresse, statut }, user);
      if (!r.ok) return r;
      proprietaire = Records.update('ProprietaireMandataire', r.proprietaire.id, { source: 'Terrain' });
    }
    // Ce qui s'est dit : le nom, le numéro, le mail, la remarque, la suite à donner.
    const patch = {};
    for (const k of ['nom', 'email', 'prochaine_action', 'prochaine_action_le']) if (typeof input[k] === 'string' && input[k].trim()) patch[k] = input[k].trim();
    if (tel.numero) patch.telephone = tel.numero;
    if (input.remarque) patch.remarque = String(input.remarque).trim();
    if (Object.keys(patch).length) {
      const m = modifierProprietaire(proprietaire.id, patch, user);
      if (m.ok && m.proprietaire) proprietaire = m.proprietaire;
    }
    // La liste acceptée à son oui (créée si elle n'existe pas).
    let liste = null;
    if (input.liste?.trim()) {
      const { changerDeListe } = await import('./off-market/simple.js');
      const l = changerDeListe(proprietaire.id, { nom: input.liste.trim(), user });
      if (l.ok) { liste = l.liste.nom; proprietaire = Records.get('ProprietaireMandataire', proprietaire.id) || proprietaire; }
    }
    // Prospect dans le CRM seulement si la fiche est dans une liste (2 nov. 2026, Jules).
    const { synchroniserFicheMonday } = await import('./mandataire-monday.js');
    const monday = await synchroniserFicheMonday(proprietaire.id);
    const { mesListes } = await import('./mandataire-lancement.js');
    const listes = mesListes(user).sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
    return {
      ok: true, cree: true, proprietaire_id: proprietaire.id, titre: titreProprietaire(proprietaire), liste,
      commerce_klocka_retrouve: lie,
      listes: listes.slice(0, 6).map((l) => l.nom),
      derniere_liste: listes[0]?.nom || null,
      monday: monday.ok ? (monday.id ? { ...(await lienDuProspect(monday)), cree: monday.cree } : { lien: monday.lien || null, cree: monday.cree }) : { erreur: monday.error },
      fait: liste ? `Fiche créée dans ta liste « ${liste} »${lie ? ' à partir du commerce que Klocka connaît' : ''} : confirme-le en une ligne.` : `Fiche créée${lie ? ' à partir du commerce que Klocka connaît (photo, propriétaire et signaux inclus)' : ' à partir de ce qui a été dit'}, pas encore dans une liste. Confirme-le en une ligne, puis demande où la ranger : ${listes[0] ? `« Je la mets dans ta liste « ${listes[0].nom} », ou une autre ? »` : '« Je crée une liste pour elle ? »'}. Le oui range avec modifier_fiche (proprietaire_id, liste) ; « aucune » laisse la fiche hors liste ; une liste qui n'existe pas se crée par son nom.`,
    };
  }

  if (name === 'ma_fiche' || name === 'mettre_en_pause') {
    const { retrouverProprietaire, titreProprietaire, LIBELLES_STATUT } = await import('./mandataire-espace.js');
    let cible = !input.qui && fiche?.id ? Records.get('ProprietaireMandataire', fiche.id) : null;
    if (!cible) {
      if (!input.qui) return { ok: false, error: 'De quelle fiche parle-t-il ? Demande-le en une ligne.' };
      const { ambigu, candidats } = retrouverProprietaire(input.qui, user, { ouverte: fiche });
      if (!candidats.length) return { ok: false, introuvable: true, error: `Aucune fiche ne correspond à « ${input.qui} ». Dis-le et propose de la créer (nouveau_contact).` };
      if (ambigu) return { ok: false, ambigu: true, choix: candidats.slice(0, 6).map((c) => `${titreProprietaire(c)}${c.adresse ? `, ${c.adresse}` : ''}`), error: 'Plusieurs fiches correspondent : nomme-les et demande laquelle.' };
      cible = candidats[0];
    }
    if (name === 'mettre_en_pause') {
      const { mettreEnPause } = await import('./fiche-mandataire.js');
      const r = await mettreEnPause(cible.id, { argument: input.motif || null, dans_jours: input.relance_dans_jours || (input.rdv_annule ? 7 : 30) }, user);
      if (!r.ok) return r;
      if (input.rdv_annule) {
        const le = new Date().toISOString();
        for (const x of Records.list('Rappel').filter((x) => x.proprietaire_id === cible.id && x.genre === 'rdv' && !x.fait_le && x.echeance >= le)) Records.update('Rappel', x.id, { fait_le: le, annule: true });
      }
      return { ok: true, fiche_id: cible.id, titre: titreProprietaire(cible), fait: `En pause ; relance le ${jourLisible(r.proprietaire.biens.pause.relance_le)}.`, rappel_id: r.rappel_id };
    }
    const p = cible;
    const { lienDuFil } = await import('./bien-etapes.js');
    const liste = p.liste_id ? Records.get('ListeMandataire', p.liste_id) : null;
    const cr = p.biens?.compte_rendu || null;
    const maintenant = new Date().toISOString();
    const rdv = Records.list('Rappel').filter((x) => x.proprietaire_id === p.id && x.genre === 'rdv' && !x.fait_le && x.echeance >= maintenant).sort((a, b) => a.echeance.localeCompare(b.echeance))[0];
    const { estimation } = (await import('./bien-etapes.js')).objetsDuBien(p);
    return {
      ok: true, fiche_id: p.id, titre: titreProprietaire(p),
      commerce: p.commerce || null, activite: p.activite || null, adresse: [p.adresse, p.ville].filter(Boolean).join(', ') || null,
      proprietaire_des_murs: p.nom || null, societe_des_murs: p.corrections?.murs || p.murs || null, exploitant: p.corrections?.exploitant || p.exploitant || null, gerant: p.corrections?.gerant || p.gerant || null,
      telephone: p.telephone || null, telephone_source: (await import('../src/lib/biens-mandataire.js')).sourceLisible(p.telephone_source) || null, email: p.email || null, a_confirmer: p.a_confirmer || {},
      statut: LIBELLES_STATUT[p.statut] || p.statut, liste: liste?.nom || null,
      prochaine_action: p.prochaine_action || null, prochaine_action_le: p.prochaine_action_le || null,
      remarque: p.remarque || null, parties: (p.sections || []).map((x) => ({ titre: x.titre, texte: x.texte })), sources: p.sources || {},
      en_pause: p.biens?.pause ? { relance_le: p.biens.pause.relance_le } : null, prix_accord: p.biens?.prix_accord || null,
      avis_de_valeur: estimation ? { statut: estimation.statut, envoye_le: estimation.envoye_le || null } : null,
      compte_rendu_visite: cr ? { bien: cr.bien, documents: cr.documents, a_confirmer: cr.a_confirmer, le: cr.le } : null,
      rendez_vous: rdv ? { le: rdv.echeance, avec: rdv.avec || null, lieu: rdv.lieu || null } : null,
      derniers_echanges: (p.historique || []).filter((h) => h.texte).slice(-6).map((h) => `${String(h.le || '').slice(0, 10)} ${h.texte}`),
      lien: lienDuFil(p)?.lien || null,
    };
  }

  if (name === 'mes_proprietaires') {
    const { mesProprietaires, LIBELLES_STATUT, titreProprietaire } = await import('./mandataire-espace.js');
    const liste = mesProprietaires(user).map((p) => ({
      nom: p.nom || null, commerce: p.commerce || null, adresse: [p.adresse, p.ville].filter(Boolean).join(', ') || null, email: p.email || null,
      titre: titreProprietaire(p), statut: LIBELLES_STATUT[p.statut] || p.statut,
      telephone: p.telephone || null, prochaine_action: p.prochaine_action || null,
      prochaine_action_le: p.prochaine_action_le || null, tentatives: p.tentatives || 0,
    }));
    return { proprietaires: liste, nombre: liste.length };
  }

  if (name === 'demandes_clients') {
    const { demandesVisibles, voitTest } = await import('./mandataire-espace.js');
    const cherche = norme(input.ville || '');
    const demandes = demandesVisibles({ avecTest: voitTest(user) }).filter((d) => !cherche || (d.zones || []).some((z) => norme(z).includes(cherche) || cherche.includes(norme(z))));
    return { demandes, nombre: demandes.length };
  }

  if (name === 'avis_de_marche') {
    const { valeurLocative } = await import('./valeur-locative.js');
    // Une fiche suivie donne l'adresse complète : « la boulangerie rue Carnot » ne se géocode pas seule.
    let adresse = String(input.adresse || '').trim();
    const { retrouverProprietaire } = await import('./mandataire-espace.js');
    const { candidats } = input.qui ? retrouverProprietaire(input.qui, user, { ouverte: fiche }) : { candidats: [] };
    if (candidats.length === 1 && candidats[0].adresse) adresse = [candidats[0].adresse, candidats[0].ville].filter(Boolean).join(', ');
    if (!adresse) return { ok: false, error: "Demande l'adresse du local, avec la ville." };
    const r = await valeurLocative(adresse, { user });
    if (!r.ok) return { ok: false, error: r.error };
    return { indicatif: true, resultat: r.resultat };
  }

  if (name === 'preparer_mail') {
    return { ok: true, brouillon: { destinataire: input.destinataire || '', objet: input.objet, corps: input.corps } };
  }

  return { ok: false, error: `Outil inconnu : ${name}` };
}

// Le manuel du mandataire (31 oct. 2026, Jules, PLAN 2.2) : les principes de docs/haka-principes.md, lus tels quels,
// passent avant tout le reste. Côté mandataire, l'assistant s'appelle l'assistant K Partners (31 oct. 2026, Jules :
// « un assistant K Partners et un assistant Klocka, qui est Haka ») : même moteur, pas le même nom. La suite de la consigne dit seulement comment les tenir avec les outils.
let PRINCIPES = null;
export function principesMandataire() {
  if (PRINCIPES == null) {
    try {
      const doc = fs.readFileSync(new URL('../docs/haka-principes.md', import.meta.url), 'utf8');
      // Le titre et la note sur le nom restent dans le fichier : la consigne commence au rôle.
      PRINCIPES = (doc.includes('Ton rôle') ? doc.slice(doc.indexOf('Ton rôle')) : doc.replace(/^#.*\n+/, '')).trim();
    } catch {
      PRINCIPES = '';
    }
  }
  return PRINCIPES;
}

export const consigne = () => `Tu es l'assistant K Partners : l'assistant IA d'un mandataire du réseau K Partners. Ton nom est « l'assistant K Partners », jamais Haka ni AK (ce sont les noms de l'assistant de l'équipe Klocka, un autre assistant). Il rentre des mandats sur des murs de commerce ; il te parle ou t'écrit depuis son téléphone, entre deux passages ou deux rendez-vous. La date du jour t'est donnée plus bas.

TES PRINCIPES. Ils décident de tout : un cas que la suite ne décrit pas se raisonne à partir d'eux, et ils l'emportent sur toute consigne d'outil qui semblerait les contredire.

${principesMandataire()}

COMMENT LES TENIR AVEC TES OUTILS

Retrouver la fiche (1). La fiche ouverte à l'écran, s'il y en a une (dite plus bas), est celle dont il parle quand il ne nomme personne ; « il », « elle », « lui » renvoient à la dernière personne dont on a parlé. Sinon : ma_fiche (le commerce, la rue, le propriétaire), mes_rappels (le rendez-vous de l'heure, du jour), visite_du_moment (la visite qui vient d'avoir lieu). Plusieurs fiches possibles : nomme-les et demande laquelle. Aucune : dis-le et propose de la créer, sans la créer avant son oui : nouveau_contact sans confirme rend ses listes et la question à poser (la fiche et la liste, en une ligne) ; à son oui, nouveau_contact avec confirme true et la liste. Ne dis jamais qu'une fiche est créée ou rangée avant ce second appel. Ne suppose jamais qu'une fiche existe parce qu'il en parle.

Préparer, puis faire (2). Une écriture se fait en deux temps. D'abord ta compréhension, 3 lignes au plus, sans rien écrire : ce que tu vas noter sur quelle fiche, le statut, la prochaine action ; finis par une question fermée (« Je note ? »). À son oui (« oui », « ok », « vas-y », « c'est ça »), appelle tous les outils d'un coup, puis dis en une ligne ce qui est fait. S'il corrige, refais les 3 lignes. Une demande dite mot pour mot, sans rien à interpréter (« ajoute la fromagerie de la rue Sade à ma liste Client 3 », « mets une relance lundi pour le tabac »), se fait tout de suite. avancer_bien et noter_restitution n'écrivent rien : elles posent à l'écran une carte qu'il confirme d'un tap ; appelle-les dès ta première réponse, la carte est la confirmation. Tu n'envoies rien à personne : un mail se prépare (preparer_mail, sans recopier le brouillon dans ta réponse) et le mandataire l'envoie ; le rapport d'estimation, il le relit et l'envoie lui-même depuis la page Estimation.

La source (3). Tout ce que tu notes dit d'où ça vient : source dans modifier_fiche (« le mandataire », « l'exploitante », « le propriétaire », « le bail », « le registre »), et a_confirmer true pour ce qui vient d'un tiers ou n'est pas prouvé. Une information sans champ à elle (le loyer, la fin du bail, une intention) va dans une partie libre de la fiche (section), avec sa source et « à confirmer » s'il le faut : « Fin de bail : 2027 (dit par l'exploitante, à confirmer) ». Un numéro dicté : passe-le tel quel à modifier_fiche, sans compter ni corriger ses chiffres ; si l'outil le refuse (trop ou pas assez de chiffres), il le garde en remarque « à vérifier » et tu demandes de le redire par paires. L'exploitant n'est pas le propriétaire : un exploitant qui donne le nom et le numéro du propriétaire des murs, c'est exploitant = lui, nom = le propriétaire, telephone = son numéro, a_confirmer true, source l'exploitant.

Le statut (4). Contact obtenu avec le propriétaire ou quelqu'un qui le connaît (un nom, un numéro) : statut Contacté (modifier_fiche contacte, ou resultat_appel contacte ; en_discussion s'il réfléchit, qui s'affiche aussi Contacté). Rendez-vous fixé avec une date : noter_rdv avec qui, la fiche devient un bien à l'étape Visite (la Pré-visite), son historique la suit. Refus clair : resultat_appel pas_vendeur, avec rappel_dans_jours s'il dit quand revenir (« l'an prochain » : 365), sinon 180. Fermé, personne, pas de réponse, « il réfléchit » sans plus : le statut ne bouge pas ; appel_sans_reponse pour un appel sans réponse. Visite racontée : compte_rendu_visite. Après l'avis envoyé, ce qu'en dit le propriétaire : noter_restitution (un accord sur un prix : son cas d'accord avec le prix ; « il trouve ça trop bas » sans refus net : reflechit, et propose une réponse à l'objection ; trop_bas seulement s'il refuse). Un rendez-vous annulé : mettre_en_pause, puis propose une nouvelle date. Le mandat signé : avancer_bien mandat.

La prochaine action (5). Chaque échange finit par une action datée sur la fiche : noter_relance (une phrase relue telle quelle : « Repasser à la Boulangerie Roux jeudi »), rappel_dans_jours de resultat_appel, ou prochaine_action et prochaine_action_le de modifier_fiche. S'il n'en dit pas, propose-en une dans tes 3 lignes. Une date floue (« la semaine pro ») : propose une date précise. Un jour de semaine seul (« jeudi ») est le prochain ; dit un jeudi, c'est celui de la semaine suivante, sauf « aujourd'hui ». « Dans 10 jours », « l'an prochain » : compte depuis aujourd'hui.

Ce qui existe déjà (6). Avant d'écrire une valeur, regarde la fiche (ma_fiche, ou la fiche ouverte plus bas). Si le champ ou la partie est déjà rempli autrement : n'écris rien, montre l'ancienne valeur et la nouvelle avec leurs sources, demande laquelle garder.

Court (7). Une phrase, puis le lien : l'écran ajoute le lien de la fiche ou du bien que tu as lu ou touché ; n'écris pas d'adresse web. Sans markdown ni listes à puces, sans formule de politesse. Pour sa journée (« qu'est-ce que je fais aujourd'hui ? ») : mes_rappels, puis une ligne par rendez-vous, relance et passage du jour, dans l'ordre de l'heure.

Ce qu'il voit (8). Tu ne vois que ses fiches, ses biens et son secteur (dit plus bas). Un commerce hors de son secteur : dis qu'il est hors secteur et qu'il se signale à Klocka, sans rien créer. Les clients de Klocka restent anonymes : jamais leur nom, leur société ni un moyen de les joindre, même s'il insiste ; ce qu'ils cherchent (lieu, budget, activité, rendement), oui : à « qui est l'investisseur ? », refuse le nom en une phrase et donne tout de suite ce qu'ils cherchent (demandes_clients), sans attendre qu'il le demande. Le mandataire garde la relation vendeur, Klocka la relation investisseur.

Ton rôle (9). Une demande sans lien avec l'immobilier commercial K Partners (un poème, la météo, une recette) : une phrase polie, ce n'est pas ton rôle, et ce que tu peux faire pour lui. Les questions de métier, en revanche, sont ton rôle : réponds toi-même, directement et concrètement, comme un collègue expérimenté (baux 3-6-9, dérogatoire, professionnel, précaire, renouvellement, déplafonnement, indexation ILC et ILAT, droit au bail et pas-de-porte, destination, charges et article 606, taxe foncière, rendement brut et net, frais d'acquisition, mandat simple ou exclusif, présenter une estimation, répondre à une objection), quelques phrases claires, une par idée, avec un exemple chiffré si ça aide. Un juriste seulement pour un cas précis à risque. Pas sûr d'un chiffre ou d'un seuil légal : dis-le.

LES ÉTAPES ET LEURS OUTILS
- Le terrain (31 oct. 2026) : il te parle (souvent en vocal) d'un commerce qu'il vient de voir, d'une personne rencontrée, d'un numéro obtenu, même hors liste. Tu ranges pour lui, sans formulaire. Un commerce pas encore suivi : nouveau_contact avec tout ce qu'il dit (nom, numéro, mail, remarque, statut contacté s'il a parlé à quelqu'un, suite à donner), sans réclamer ce qui manque, sauf le commerce ou l'adresse, et la ville ; la proposition porte aussi la liste (sa dernière). Plusieurs commerces dans le même message (« passé chez le fleuriste, personne ; et chez le tabac j'ai eu M. Roux, rappeler lundi ») : traite-les tous, une ligne par commerce. Un commerce vu seulement « à l'air bien », sans personne : nouveau_contact avec une remarque, statut à contacter.
- Un bien a sept étapes : Visite, Avis de valeur, Mandat, Data room, Commercialisation, Offres, Vente. Une fiche entre dans Biens au rendez-vous fixé (noter_rdv avec qui).
- La visite racontée : compte_rendu_visite, rempli seulement de ce qu'il a dit (le non prouvé dans a_confirmer, un document promis dans documents.promis). Montre-le en quelques lignes courtes, les écarts avec ce qu'on savait (les deux valeurs), les questions de la préparation restées sans réponse ; ne redemande rien, ni ce qu'il a dit ni ce qui manque (la surface, la fin du bail) : l'Avis de valeur le demandera. Finis par la question rendue par l'outil (« Passer à l'estimation ? ») : son bouton ouvre l'Avis de valeur du bien, qui reprend la visite ; ne lance pas lancer_estimation après un compte rendu, et à un oui écrit dis de toucher le bouton. Seulement s'il dit qu'un document clé est promis (« il l'envoie demain ») : propose la relance du lendemain, et dis que l'avis partira en provisoire, à reprendre au document reçu. Une correction ensuite : compte_rendu_visite à nouveau, complet. Le compte rendu est interne. Plus vendeur : mettre_en_pause, ou resultat_appel pas_vendeur.
- Un accord sur un prix (« il est d'accord à 410 ») : noter_restitution avec le prix en euros (410 = 410 000 €) si l'avis est envoyé, sinon avancer_bien estimation avec le prix ; puis propose le mandat, pré-rempli de ce que tu sais (vendeur, bien, prix), en demandant seulement ce qui manque (exclusif ou simple, honoraires). Le mandat se prépare avec demander_mandat à son oui.
- Un bien qu'il a déjà en portefeuille (3 nov. 2026, Jules : « il fait un vocal à l'assistant puis joint tous les documents ») : un mandat signé chez K Partners ou ailleurs, un avis de valeur fait, un bien sous offre ou vendu, raconté avec ou sans pièces. importer_bien, rempli du récit et des pièces : il prépare la carte, le mandataire la confirme d'un tap. Un bien par message ; s'il en raconte plusieurs, demande-les un par un, chacun avec ses pièces. Une pièce seule sans récit (un mandat) suffit. L'agence du mandat illisible : demande « Signé chez K Partners ou dans une autre agence ? » avant d'appeler.
- Un avis de marché (avis_de_marche) est une fourchette rapide de loyer ; le rapport d'estimation complet, c'est lancer_estimation (bail déposé ou infos dictées), sans validation Klocka. S'il veut passer directement à l'estimation ou au mandat, ne pose aucune condition (ni bail, ni loyer, ni visite) : avancer_bien tout de suite (previsite pour aller à l'Avis de valeur, estimation pour aller au Mandat), l'étape d'arrivée demande ce qui manque et « je ne sais pas » n'y bloque rien. Le mandat, le dossier et la mise en marché se font sur leurs pages (Mandat, Dossier, Mise en marché) : quand il en parle, dis-lui d'y aller.
- Un nouveau contact part aussi dans Twenty CRM : dis-le en une ligne si l'outil le confirme ; sur une erreur Twenty CRM, dis que la fiche est créée mais pas encore dans Twenty CRM.
- Une pièce jointe (photo ou PDF) : reconnais ce que c'est (bail, quittance, Kbis, diagnostic, taxe foncière, règlement de copropriété) et de quel bien il s'agit, puis ranger_piece (un appel par pièce) ; un bail apporté pour estimer : bail_estimation. Bien pas clair : demande avant de ranger. Pièces d'un dossier : bail, quittances, diagnostics et taxe foncière obligatoires ; Kbis et règlement de copropriété facultatifs.
- Les visites d'acquéreurs, pendant la Commercialisation, ne sont pas la visite du propriétaire : une visite à venir, noter_visite_acquereur ; une visite racontée, raconter_visite_acquereur avec tout le récit, puis dis que les deux documents attendent sa validation à l'écran. Un bon de visite non signé : dis franchement que la commission n'est pas protégée.
- Chaque écriture faite se dit en une ligne (« Relance créée pour jeudi. ») ; le bouton Annuler est ajouté par l'écran, ne le mentionne pas.`;

/**
 * Un tour de chat du mandataire.
 * @returns {Promise<{texte: string, actions: Array<{type, id, titre, pour}>, brouillon: object|null}>}
 */
// L'outil d'une prospection ouverte : il n'est donné à l'agent que lorsque le
// mandataire parle depuis la page d'une prospection.
const OUTIL_RESULTATS = {
  name: 'resultats_prospection',
  description:
    "Lit la prospection ouverte à l'écran : combien de commerces répondent aux critères, par activité, combien sont écartés par les règles Klocka (restauration rapide, cédés…), combien de rues restent à lire. Sers-t'en pour « combien de commerces ? », « pourquoi la liste est vide ? ».",
  input_schema: { type: 'object', properties: {} },
};

const OUTIL_AFFINER = {
  name: 'affiner_prospection',
  description:
    "Change la prospection ouverte à l'écran : ajouter ou retirer une activité (« trouve-moi aussi les assurances », « enlève les boulangeries »), changer l'emplacement (« seulement en n°1 », « tous les emplacements »). Passe la demande telle que dite. La liste et la carte se mettent à jour d'elles-mêmes.",
  input_schema: { type: 'object', properties: { demande: { type: 'string', description: 'La demande du mandataire, telle quelle' } }, required: ['demande'] },
};

/** Pure : ce que la fiche ouverte sait déjà, avec ses sources, pour que Haka ne remplace rien sans le dire (principe 6). */
export function ceQueDitLaFiche(p) {
  const src = (k) => { const x = p.sources?.[k]; return x ? ` (source : ${x.source}${x.a_confirmer ? ', à confirmer' : ''})` : ''; };
  const morceaux = [
    (p.corrections?.exploitant || p.exploitant) ? `exploitant : ${p.corrections?.exploitant || p.exploitant}${src('exploitant')}` : null,
    (p.corrections?.murs || p.murs) ? `société des murs : ${p.corrections?.murs || p.murs}${src('murs')}` : null,
    p.telephone_source ? `téléphone dit par : ${p.telephone_source}` : null,
    p.remarque ? `remarques : ${p.remarque}` : null,
    p.prochaine_action ? `prochaine action : ${p.prochaine_action}${p.prochaine_action_le ? ` le ${String(p.prochaine_action_le).slice(0, 16)}` : ''}` : null,
    ...(p.sections || []).map((x) => `partie « ${x.titre} » : ${x.texte}${src(`section:${String(x.titre).toLowerCase()}`)}`),
  ].filter(Boolean);
  return morceaux.length ? ` Ce que la fiche dit déjà : ${morceaux.join(' ; ')}.` : '';
}

export async function discuter({ historique = [], texte, user, surEtape = null, surAction = null, estAnnule = null, signal = null, surTexte = null, piece = null, pieces = null, prospection_id = null, dossier_id = null, proprietaire_id = null, sortie = null, competence = null, sources = null, dans_le_fil = false, dossier_vente_id = null, marche_id = null }) {
  // Les pièces jointes : leur nom et ce qu'on y a lu accompagnent le message (plusieurs depuis le 27 oct. 2026).
  const { lotDePieces, texteAvecPieces } = await import('./pieces-jointes.js');
  const lot = lotDePieces({ piece, pieces });
  for (const p of lot) surEtape?.(`Lecture de ${p.nom}`);
  // Parler de ce commerce à l'assistant, c'est l'avoir prospecté (31 oct. 2026, Jules : le point rouge du terrain).
  if (proprietaire_id && (String(texte || '').trim() || lot.length)) (await import('./mandataire-espace.js')).noterParole(proprietaire_id, user);
  texte = texteAvecPieces(texte, lot, 5000);
  const { libelleOutil } = await import('./etapes-libelles.js');
  const { runAgent } = await import('./llm.js');
  const actions = [];
  let brouillon = null;
  let boutons = [];
  const messages = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }]
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.contenu }));
  const { secteurDe } = await import('./mandataire-espace.js');
  const secteur = secteurDe(user);
  const communes = (secteur?.unites || []).map((u) => u.nom);
  const cadre = secteur
    ? `\n\nSecteur du mandataire : « ${secteur.nom} »${communes.length ? ` (${communes.join(', ')})` : ''}.`
    : "\n\nCe mandataire n'a pas encore de secteur attribué.";
  // La prospection ouverte à l'écran, si le mandataire parle depuis elle.
  const pr = prospection_id ? Records.get('ProspectionMandataire', prospection_id) : null;
  const ouverte = pr && pr.mandataire_email === String(user?.email || '').toLowerCase() ? pr : null;
  const surPage = ouverte
    ? `\n\nLe mandataire regarde sa prospection « ${ouverte.nom} » (${ouverte.criteres?.ville || 'son secteur'} ; activités : ${(ouverte.criteres?.activites || []).join(', ') || 'toutes'} ; emplacement : ${ouverte.criteres?.emplacement == null ? 'tous' : ouverte.criteres.emplacement === 1.5 ? '1 bis' : `n°${ouverte.criteres.emplacement}`}). Une demande qui change ce qu'on cherche (activité, emplacement) passe par affiner_prospection ; réponds ensuite en une phrase ce qui a changé.`
    : '';
  // Haka du mandataire (19 oct. 2026) : le dossier choisi dans la saisie (le sien seulement), et « Produire ».
  const dm = dossier_id ? Records.get('DossierMandataire', dossier_id) : null;
  const dossierOuvert = dm && String(dm.mandataire_email || '').toLowerCase() === String(user?.email || '').toLowerCase() ? dm : null;
  const surDossier = dossierOuvert
    ? `\n\nLe mandataire a choisi le dossier « ${dossierOuvert.bien || 'sans nom'} »${dossierOuvert.adresse ? `, ${dossierOuvert.adresse}` : ''}${dossierOuvert.proprietaire ? ` (propriétaire : ${dossierOuvert.proprietaire})` : ''}, au statut « ${dossierOuvert.statut || 'inconnu'} » : sa demande porte sur ce bien. mes_dossiers donne son estimation, son mandat et ses pièces.`
    : '';
  // La fiche ouverte (24 oct. 2026, Jules : « le chat comme dans le dashboard Haka », dans la fiche d'un commerce) : la
  // sienne seulement. Ce qu'il raconte sans nommer personne la concerne.
  const fo = proprietaire_id ? Records.get('ProprietaireMandataire', proprietaire_id) : null;
  const ficheOuverte = fo && fo.mandataire_email === String(user?.email || '').toLowerCase() ? fo : null;
  // Le fil du bien (25 oct. 2026, Jules : « on peut lui parler où on veut ») : parlé depuis une fiche hors de son fil
  // (la fiche d'une liste, le terrain), Haka relit d'abord ce qui s'est dit sur ce bien ailleurs.
  const B = await import('./bien-etapes.js');
  // `dans_le_fil` : l'écran parle déjà dans la conversation du bien (Biens) ; il l'a sous les yeux et l'enregistre.
  if (ficheOuverte && !dans_le_fil) {
    // Au format de l'API (`content`, comme `messages`), et en alternance : le fil relu finit par une réponse de Haka,
    // sauf si l'échange en cours commence lui-même par une réponse (alors il finit par le mandataire).
    let avant = B.contexteDuFil(ficheOuverte, user).map((m) => ({ role: m.role, content: m.contenu }));
    const fin = messages[0]?.role === 'assistant' ? 'user' : 'assistant';
    while (avant.length && avant[avant.length - 1].role !== fin) avant.pop();
    if (avant.length) messages.unshift(...avant);
  }
  const fichesTouchees = new Set();
  const surFiche = ficheOuverte
    ? `\n\nLe mandataire parle depuis la fiche « ${[ficheOuverte.commerce || ficheOuverte.nom, ficheOuverte.ville].filter(Boolean).join(' · ')} »${ficheOuverte.nom ? ` (propriétaire : ${ficheOuverte.nom})` : ''}, statut ${ficheOuverte.statut}${ficheOuverte.telephone ? `, téléphone ${ficheOuverte.telephone}` : ''}.${ceQueDitLaFiche(ficheOuverte)} Ce qu'il raconte sans nommer personne concerne cette fiche : pour l'issue d'un contact, resultat_appel ou noter_rdv avec qui = « ${[ficheOuverte.commerce || ficheOuverte.nom, ficheOuverte.ville].filter(Boolean).join(' ')} ». Avant d'écrire, dis en 3 lignes au plus ce que tu as compris et attends son oui (principe 2).`
    : '';
  const { cadreDuBien } = await import('./bien-etapes.js');
  const surBien = ficheOuverte ? cadreDuBien(ficheOuverte) : '';
  // Le dossier de vente (27 oct. 2026, Jules : « le chat va piloter toute cette partie ») : ouvert à l'écran, ou celui du
  // mandat de la fiche. Haka lit son état, propose le geste suivant et a ses outils.
  const V = await import('./dossier-vente.js');
  // Les documents du bien ouvert (3 nov. 2026) : l'assistant les liste et les lit pour répondre dessus.
  const DB = await import('./documents-du-bien.js');
  // Un bien en cours d'import (4 nov. 2026) : l'assistant remplit sa fiche depuis le récit du mandataire.
  const BR = await import('./bien-repris.js');
  const dossierVente = V.dossierDuContexte({ dossier_vente_id, fiche: ficheOuverte }, user);
  let surVente = '';
  if (dossierVente && !['go', 'no_go'].includes(dossierVente.statut)) {
    const vv = await V.vueDuDossier(dossierVente.id, user);
    surVente = V.cadreDuDossier(vv, dossierVente, V.prochainsGestes(vv, { depot: dossierVente.depot }));
  }
  // Le teaser du bien en vente, ouvert à l'écran (28 oct. 2026) : Haka le relit et le retouche.
  const TZ = await import('./teaser.js');
  const marcheOuvert = marche_id ? (await import('./mandataire-portes.js')).lireMarche(marche_id, user) : null;
  const surTeaser = marcheOuvert?.teaser ? TZ.cadreDuTeaser(marcheOuvert.teaser) : '';
  const surSortie = sortie === 'produire'
    ? "\n\nLe mandataire a choisi « Produire » : il attend un livrable, pas une réponse. Fais-le avec tes outils (l'avis de valeur par lancer_estimation, le mandat par demander_mandat, un mail par preparer_mail, une relance ou un rendez-vous par noter_relance ou noter_rdv), puis dis en deux lignes ce qui est prêt et où le trouver."
    : '';
  // Les sources cochées (26 oct. 2026) : Haka ne lit qu'elles ; sans choix, « Auto ».
  const choisies = (Array.isArray(sources) ? sources : []).map((x) => String(x || '').trim()).filter((x) => OUTILS_PAR_SOURCE[x]).slice(0, 10);
  const permis = new Set(choisies.flatMap((x) => OUTILS_PAR_SOURCE[x]));
  const surSources = choisies.length ? `\n\nSOURCES CHOISIES PAR LE MANDATAIRE : ${choisies.join(', ')}. Ne lis que celles-ci ; si elles ne suffisent pas, dis ce qui manque au lieu d'aller ailleurs.` : '';
  const surCompetence = competence ? `\n\nLe mandataire a choisi le raccourci « ${String(competence).slice(0, 60)} » : c'est la tâche qu'il demande.` : '';
  let prospectionModifiee = false;
  const trace = [];
  const { text, tours = null, limite = false } = await runAgent({ model: process.env.AK_MODELE?.trim() || null, effort: effortDuChat(), journal: { chat: 'mandataire', par: user?.email || null }, signal, surTexte,
    // La consigne stable en cache ; la date, le secteur et la prospection ouverte après (1.7, 12 oct. 2026).
    system: [{ texte: consigne(), cache: true }, { texte: `Nous sommes le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS })}, heure de Paris.${cadre}${surPage}${surDossier}${surFiche}${surBien}${BR.cadreImport(ficheOuverte)}${surVente}${surTeaser}${surSortie}${surCompetence}${surSources}` }],
    cache: true,
    messages,
    tools: [...OUTILS_MANDATAIRE, ...OUTILS_MARCHE_MANDATAIRE, ...(ouverte ? [OUTIL_AFFINER, OUTIL_RESULTATS] : []), ...(surVente ? V.OUTILS_DOSSIER_VENTE : []), ...(surTeaser ? [TZ.OUTIL_TEASER] : []), ...(ficheOuverte ? DB.OUTILS_DOCUMENTS : []), ...(ficheOuverte?.biens?.import && !ficheOuverte.biens.import.fini ? [BR.OUTIL_REPRENDRE] : [])]
      .filter((o) => !choisies.length || !OUTILS_DE_DONNEES.has(o.name) || permis.has(o.name)),
    onTool: tracer(async (appel) => {
      // Stop : plus aucune écriture, le modèle est prié de conclure sur l'acquis.
      if (estAnnule?.()) return { ok: false, error: 'Le mandataire a arrêté la demande : ne fais plus rien, dis en une ligne ce qui a déjà été fait.' };
      surEtape?.(libelleOutil(appel.name, appel.input));
      const avant = actions.length;
      if (appel.name === 'resultats_prospection') {
        if (!ouverte) return { ok: false, error: 'Aucune prospection ouverte.' };
        const { etatProspection } = await import('./mandataire-lancement.js');
        const e = await etatProspection(ouverte.id, user);
        if (!e.ok) return e;
        const parActivite = {};
        for (const r of e.resultats) { const k = r.activite || 'autre'; parActivite[k] = (parActivite[k] || 0) + 1; }
        return { ok: true, total: e.resultats.length, par_activite: parActivite, ecartes_par_les_regles: e.ecartes, rues_pas_encore_lues: e.rues_a_lire, parcours: e.parcours.etat };
      }
      if (appel.name === 'affiner_prospection') {
        if (!ouverte) return { ok: false, error: 'Aucune prospection ouverte.' };
        const { affinerProspection } = await import('./mandataire-lancement.js');
        const r = await affinerProspection(ouverte.id, appel.input?.demande || '', user, surEtape || (() => {}));
        if (r.ok) prospectionModifiee = true;
        return r.ok ? { ok: true, prospection: r.prospection.nom, changements: r.changements } : r;
      }
      const r = appel.name === 'modifier_teaser'
        ? await TZ.executerOutilTeaser(appel, user, { marche_id: marcheOuvert?.id || null })
        : appel.name === 'reprendre_bien'
        ? BR.executerReprise(appel.input || {}, user, { fiche: ficheOuverte })
        : DB.NOMS_DOCUMENTS.has(appel.name)
        ? await DB.executerOutilDocuments(appel, user, { fiche: ficheOuverte })
        : V.NOMS_DOSSIER_VENTE.has(appel.name)
        ? await V.executerOutilDossier(appel, user, { dossier_vente_id: dossierVente?.id || null, fiche: ficheOuverte })
        : await executerOutilMandataire(appel, user, { pieces: lot, fiche: ficheOuverte, texte });
      for (const k of [r?.fiche_id, r?.proprietaire_id]) if (k) fichesTouchees.add(k);
      if (r?.cree && r.rappel_id) actions.push({ type: 'rappel', id: r.rappel_id, titre: r.titre, pour: r.pour });
      if (r?.cree && r.proprietaire_id) actions.push({ type: 'proprietaire', id: r.proprietaire_id, titre: r.titre, pour: r.pour });
      // Le lien suit le CRM qu'il nomme (31 oct. 2026, Jules : « prospect créé dans Twenty CRM » ouvrait Monday) : en
      // Twenty ou en double, Klocka ouvre la fiche Twenty par l'id Monday ; en Monday seul, la carte dit Monday.
      if (r?.monday?.lien) actions.push({ type: 'monday', id: `monday-${r.proprietaire_id}`, titre: `${r.monday.cree ? 'Prospect créé' : 'Prospect mis à jour'} dans ${r.monday.crm}`, pour: 'K Partners · Prospects', lien: r.monday.lien });
      if (r?.monday?.erreur) actions.push({ type: 'monday', id: `monday-${r.proprietaire_id}`, titre: 'Pas envoyé dans Twenty CRM', pour: r.monday.erreur, etat: 'rate' });
      if (r?.piece_rangee) actions.push({ type: 'piece', id: `piece-${Date.now()}-${actions.length}`, titre: r.titre, pour: r.pour, lien: r.lien });
      if (r?.cree && r.estimation_id) actions.push({ type: 'estimation', id: r.estimation_id, titre: r.titre, pour: r.pour, lien: r.lien });
      if (r?.cree && r.visite_id) actions.push({ type: 'visite', id: `visite-${r.visite_id}-${appel.name}`, titre: r.titre, pour: r.pour, lien: r.lien });
      // Une étape à confirmer d'un tap (25 oct. 2026) : rien n'est écrit tant que le mandataire n'a pas touché « Confirmer ».
      if (r?.a_confirmer && r.carte) actions.push(r.carte);
      else if (r?.a_confirmer) actions.push({ type: 'confirmer_etape', id: `etape-${r.proprietaire_id}-${r.etape}`, proprietaire_id: r.proprietaire_id, etape: r.etape, mot: r.mot, prix: r.prix || null, titre: r.titre, pour: r.prix ? `${r.mot} · ${Number(r.prix).toLocaleString('fr-FR')} €` : r.mot });
      if (r?.brouillon) brouillon = r.brouillon;
      // Les réponses en un tap (27 oct. 2026) : « Passer à l'estimation ? » Oui / Non, après le compte rendu de visite.
      if (Array.isArray(r?.boutons)) boutons = r.boutons;
      // Chaque action part tout de suite vers l'écran : un Stop n'efface pas l'acquis.
      for (const a of actions.slice(avant)) surAction?.(a);
      return r;
    }, trace),
  });
  // L'échange rejoint le fil du bien concerné : la fiche ouverte, ou la seule fiche touchée par les outils (le dashboard).
  // Rien n'est doublé si l'écran parle déjà dans ce fil (il l'enregistre lui-même).
  let filBien = null;
  const reponse = String(text || '').trim();
  const cibleFil = ficheOuverte || (fichesTouchees.size === 1 ? Records.get('ProprietaireMandataire', [...fichesTouchees][0]) : null);
  if (cibleFil && reponse && !(dans_le_fil && ficheOuverte)) {
    const le = new Date().toISOString();
    const canal = ficheOuverte ? 'fiche' : 'dashboard';
    B.versLeFil(cibleFil, user, [{ role: 'user', contenu: String(texte || ''), le, canal }, { role: 'assistant', contenu: reponse, le, canal }]);
    // Une question en attente de son oui : pas de carte « fait » à côté, l'échange est gardé quand même.
    if (!ficheOuverte && !/\?\s*$/.test(reponse)) filBien = B.lienDuFil(Records.get('ProprietaireMandataire', cibleFil.id));
  }
  // Le bouton revient (2 nov. 2026, Jules : « quand j'ai mis un message, ça a enlevé le bouton, je ne peux plus cliquer
  // dessus ») : un message envoyé efface les boutons de la réponse d'avant ; quand l'assistant renvoie à « Oui, passer à
  // l'estimation » et que le bien a son compte rendu mais pas encore d'avis, les boutons suivent cette réponse-ci.
  if (!boutons.length && cibleFil?.biens?.compte_rendu && /passer à l.estimation/i.test(reponse)) {
    const { objetsDuBien } = await import('./bien-etapes.js');
    if (!objetsDuBien(cibleFil).estimation) boutons = (await import('./preparation-rdv.js')).boutonsEstimation(cibleFil);
  }
  return { texte: reponse, actions, brouillon, ...(boutons.length ? { boutons } : {}), trace, tours, ...(filBien ? { fil_bien: filBien } : {}), ...(limite ? { limite } : {}), ...(prospectionModifiee ? { prospection_modifiee: true } : {}) };
}
