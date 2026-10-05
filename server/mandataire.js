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
  return {
    rappels: relances.filter((l) => l.dans <= 0),
    a_faire: [...appels, ...rdv.filter((l) => l.dans === 0)],
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

export const OUTILS_MANDATAIRE = [
  {
    name: 'annuler_derniere',
    description: "Annule la dernière relance ou le dernier rendez-vous que tu as créé pour ce mandataire (« annule la dernière relance »). Rend ce qui a été annulé.",
    input_schema: { type: 'object', properties: { genre: { type: 'string', enum: ['relance', 'rdv', 'tout'], description: 'relance, rdv, ou le dernier des deux' } } },
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
        prix: { type: 'number', description: 'Prix net vendeur, en euros' },
        honoraires: { type: 'number', description: 'Honoraires, en % (« 5 ») ou en euros' },
        honoraires_charge: { type: 'string', enum: ['vendeur', 'acquereur'] },
        type: { type: 'string', enum: ['simple', 'exclusif'] },
        duree_mois: { type: 'number', enum: [3, 6, 12] },
      },
      required: ['vendeur', 'bien', 'prix', 'honoraires'],
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
      properties: { bien: { type: 'string' }, adresse: { type: 'string', description: "L'adresse, si elle est dite ou lue dans le bail" } },
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
    name: 'nouveau_contact',
    description:
      "Crée la fiche d'un propriétaire (« Nouveau contact : M. Durand, propriétaire de la pharmacie cours Vitton, 06 12 34 56 78 »). La fiche entre dans la liste d'appels du mandataire.",
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Le propriétaire (M. Durand)' },
        telephone: { type: 'string' },
        email: { type: 'string' },
        commerce: { type: 'string', description: 'Le commerce (la pharmacie cours Vitton)' },
        activite: { type: 'string', description: 'Le métier (pharmacie, boulangerie…)' },
        ville: { type: 'string' },
        adresse: { type: 'string' },
      },
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
    name: 'mes_proprietaires',
    description: 'La liste des propriétaires du mandataire, avec leur statut et la prochaine action.',
    input_schema: { type: 'object', properties: {} },
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
  const miens = Records.list(entite).filter((x) => x.mandataire_email === String(user?.email || '').toLowerCase());
  const score = (x) => mots.filter((m) => norme(`${x.bien} ${x.adresse || ''}`).includes(m)).length;
  const tri = miens.map((x) => [x, score(x)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return tri.length && (tri.length === 1 || tri[0][1] > tri[1][1]) ? tri[0][0] : tri.length ? 'ambigu' : null;
}

export async function executerOutilMandataire(appel, user, contexte = {}) {
  // Meme filet que cote AK : une exception d'outil devient un refus propre.
  try {
    return await executerOutilMandataireBrut(appel, user, contexte);
  } catch (e) {
    console.warn(`[mandataire] outil ${appel?.name} en erreur :`, e?.stack || e);
    return { ok: false, error: `L'outil ${appel?.name} a échoué : ${e?.message || e}` };
  }
}

async function executerOutilMandataireBrut({ name, input = {} }, user, { piece = null } = {}) {
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
    const { candidats } = input.bien ? retrouverProprietaire(input.bien, user) : { candidats: [] };
    const cherche = candidats.length === 1 ? `${input.bien} ${candidats[0].commerce || ''}` : input.bien || '';
    const mots = norme(cherche).split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
    const garde = (x) => !mots.length || mots.some((m) => norme(`${x.bien} ${x.adresse || ''} ${x.vendeur || ''}`).includes(m));
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
    let e = trouverParBien('EstimationMandataire', input.bien, user);
    if (e === 'ambigu') return { ok: false, error: 'Plusieurs estimations correspondent : demande laquelle en une ligne.' };
    // L'adresse : celle donnée, sinon celle de la fiche du propriétaire.
    let adresse = input.adresse || null;
    if (!adresse) {
      const { retrouverProprietaire } = await import('./mandataire-espace.js');
      const { candidats } = retrouverProprietaire(input.bien, user);
      if (candidats.length === 1 && candidats[0].adresse) adresse = [candidats[0].adresse, candidats[0].ville].filter(Boolean).join(', ');
    }
    if (!e) e = P.creerEstimation({ bien: input.bien, adresse }, user).estimation;
    else if (adresse && !e.adresse) P.modifierEstimation(e.id, { adresse }, user);
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
    const lien = `/EstimationMandataire?estimation=${e.id}`;
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
    const r = P.demanderMandat({
      ...input,
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
    const { retrouverProprietaire } = await import('./mandataire-espace.js');
    const { ambigu, candidats } = retrouverProprietaire(input.texte, user);
    Records.update('Rappel', r.rappel.id, { genre: 'relance', espace: ESPACE, ...(!ambigu && candidats.length === 1 ? { proprietaire_id: candidats[0].id } : {}) });
    return { ok: true, cree: true, rappel_id: r.rappel.id, titre: r.rappel.titre, pour: jourLisible(r.rappel.echeance) };
  }

  // La date d'un rendez-vous se valide avant de toucher à la fiche : une date
  // illisible ne doit pas laisser une fiche « RDV pris » sans rendez-vous.
  if (name === 'noter_rdv' && !heureDeParis(input.quand)) return { ok: false, error: 'Date du rendez-vous illisible.' };

  if (name === 'appel_sans_reponse' || name === 'resultat_appel' || (name === 'noter_rdv' && input.qui)) {
    const { retrouverProprietaire, noterSansReponse, noterResultat, titreProprietaire } = await import('./mandataire-espace.js');
    const { ambigu, candidats } = retrouverProprietaire(input.qui, user);
    if (!candidats.length && name !== 'noter_rdv') {
      return { ok: false, error: `Aucune fiche ne correspond à « ${input.qui} ». Propose de créer le contact (nouveau_contact) ou demande de préciser.` };
    }
    if (ambigu) {
      return { ok: false, ambigu: true, choix: candidats.map((c) => titreProprietaire(c)), error: 'Plusieurs fiches correspondent : demande laquelle en une ligne.' };
    }
    const fiche = candidats[0] || null;
    if (name === 'appel_sans_reponse') {
      const r = noterSansReponse(fiche.id, user);
      if (!r.ok) return r;
      return {
        ok: true, cree: true, rappel_id: r.rappel_id, titre: r.titre, pour: r.pour, tentatives: r.tentatives,
        note: r.passe_a_recontacter ? 'Dernière tentative : la fiche passe « À recontacter ».' : null,
      };
    }
    if (name === 'resultat_appel') {
      const r = noterResultat(fiche.id, { statut: input.statut, texte: input.note || null, rappel_dans_jours: input.rappel_dans_jours || null }, user);
      if (!r.ok) return r;
      const suite = r.rappel_id ? ` Rappel posé dans ${Math.round(input.rappel_dans_jours)} jours.` : '';
      return { ok: true, statut: r.proprietaire.statut, titre: titreProprietaire(r.proprietaire), fait: `statut ${r.proprietaire.statut}.${suite}`, ...(r.rappel_id ? { cree: true, rappel_id: r.rappel_id, pour: `dans ${Math.round(input.rappel_dans_jours)} jours` } : {}) };
    }
    // noter_rdv avec une fiche : le rendez-vous se pose plus bas, la fiche change ici.
    if (fiche) {
      // L'état d'avant voyage jusqu'au rappel du RDV : son Annuler le restaure.
      input = {
        ...input,
        telephone: input.telephone || fiche.telephone || undefined,
        avec: input.avec || fiche.nom || fiche.commerce,
        _fiche: { id: fiche.id, retour: { tentatives: fiche.tentatives || 0, statut: fiche.statut, prochaine_action: fiche.prochaine_action || null, prochaine_action_le: fiche.prochaine_action_le || null } },
      };
      noterResultat(fiche.id, { statut: 'rdv_pris', texte: `RDV pris${input.quand ? ` (${input.quand})` : ''}` }, user);
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
    return { ok: true, cree: true, rappel_id: r.id, titre: `RDV avec ${input.avec}`, pour: `${jourLisible(r.echeance)} à ${heureLisible(r.echeance)}` };
  }

  if (name === 'mes_rappels') return tableauDuJour(user);

  if (name === 'nouveau_contact') {
    const { creerProprietaire, titreProprietaire, secteurDe, communeDansSecteur, retrouverProprietaire } = await import('./mandataire-espace.js');
    // Déjà suivi (créé à l'instant depuis un bail, par exemple) : on ne double pas la fiche.
    const { candidats } = retrouverProprietaire([input.nom, input.commerce].filter(Boolean).join(' '), user);
    const meme = candidats.find((c) => input.nom && norme(c.nom || '').includes(norme(input.nom).replace(/^(m|mme|mr|monsieur|madame)\.? /, '')));
    if (meme) {
      return { ok: true, deja_suivi: true, titre: titreProprietaire(meme), fait: 'Cette personne a déjà sa fiche : ne crée rien, dis-le en une ligne.' };
    }
    // Hors du secteur : on ne crée rien.
    const secteur = secteurDe(user);
    if (secteur && input.ville) {
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(input.ville)}&fields=nom,code,codeDepartement,codeRegion,centre&boost=population&limit=1`, { signal: AbortSignal.timeout(10_000) });
        const c = r.ok ? (await r.json())[0] : null;
        if (c?.centre?.coordinates && !communeDansSecteur({ ...c, lat: c.centre.coordinates[1], lon: c.centre.coordinates[0] }, secteur)) {
          return { ok: false, hors_secteur: true, error: `${c.nom} est hors du secteur « ${secteur.nom} » : ne crée rien, dis-le en une ligne. Un bien hors secteur se signale à Klocka.` };
        }
      } catch { /* sans API Géo, on ne bloque pas */ }
    }
    // Le minimum : qui, quel commerce ou quelle adresse, un moyen de le joindre, une ville.
    const manque = [
      !input.nom && 'le nom du propriétaire',
      !input.commerce && !input.adresse && 'le commerce ou l\'adresse',
      !input.telephone && !input.email && 'un téléphone ou un mail',
      !input.ville && 'la ville',
    ].filter(Boolean);
    if (manque.length) {
      const communes = (secteur?.unites || []).filter((u) => u.niveau === 'commune').map((u) => u.nom);
      const piste = !input.ville && communes.length ? ` Pour la ville, propose celles du secteur (${communes.slice(0, 4).join(', ')}).` : '';
      return { ok: false, a_demander: manque, error: `Il manque ${manque.join(', ')} : demande-les en une ligne, ne crée rien.${piste}` };
    }
    const r = creerProprietaire(input, user);
    if (!r.ok) return r;
    const { pousserProspect } = await import('./mandataire-monday.js');
    const monday = await pousserProspect(r.proprietaire);
    return {
      ok: true, cree: true, proprietaire_id: r.proprietaire.id, titre: titreProprietaire(r.proprietaire), pour: 'dans votre liste d\'appels',
      monday: monday.ok ? { lien: monday.lien, cree: monday.cree } : { erreur: monday.error },
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
    const { demandesVisibles } = await import('./mandataire-espace.js');
    const cherche = norme(input.ville || '');
    const demandes = demandesVisibles().filter((d) => !cherche || (d.zones || []).some((z) => norme(z).includes(cherche) || cherche.includes(norme(z))));
    return { demandes, nombre: demandes.length };
  }

  if (name === 'avis_de_marche') {
    const { valeurLocative } = await import('./valeur-locative.js');
    // Une fiche suivie donne l'adresse complète : « la boulangerie rue Carnot » ne se géocode pas seule.
    let adresse = String(input.adresse || '').trim();
    const { retrouverProprietaire } = await import('./mandataire-espace.js');
    const { candidats } = input.qui ? retrouverProprietaire(input.qui, user) : { candidats: [] };
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

const consigne = () => `Tu es l'assistant IA de Klocka pour un mandataire K Partners. Le mandataire rentre des mandats de murs commerciaux ; il te parle ou t'écrit depuis son téléphone, entre deux rendez-vous. Ton rôle : lui enlever l'administratif, et répondre à ses questions de métier comme un collègue expérimenté de l'immobilier commercial.

Nous sommes le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS })}, heure de Paris.

Règles :
1. Chaque écriture se confirme en UNE ligne (« Relance créée pour jeudi. »). Le bouton Annuler est ajouté par l'écran : ne le mentionne pas.
2. Au moindre doute sur qui ou quoi, demande en une ligne (« Deux commerces à Mâcon : la boulangerie ou le tabac ? ») au lieu de deviner.
3. Tu n'envoies rien, à personne. Un mail se prépare avec preparer_mail ; le mandataire l'envoie lui-même. Ne recopie pas le brouillon dans ta réponse.
4. Le mandataire garde la relation vendeur, Klocka la relation investisseur : les clients Klocka restent anonymes, tu ne donnes jamais de moyen de les joindre.
5. Sur un propriétaire suivi : « pas de réponse » : appel_sans_reponse (la séquence pose la relance : J+2, J+5, J+10, puis « À recontacter »). « Il est intéressé » : resultat_appel en_discussion. « Pas vendeur, rappelle-le dans 6 mois » : resultat_appel pas_vendeur avec rappel_dans_jours 180. « RDV jeudi 14h » : noter_rdv avec qui. Un nouveau propriétaire (« nouveau contact : M. Durand… ») : nouveau_contact. Si l'outil répond « plusieurs fiches », demande laquelle en une ligne (« Deux commerces à Mâcon : la boulangerie ou le tabac ? »). Sans fiche, noter_relance suffit pour ne rien perdre.
6. Un avis de marché (avis_de_marche) est une fourchette rapide de loyer. Le rapport d'estimation complet, c'est lancer_estimation : le mandataire le fait lui-même, avec les outils de la maison, sans validation Klocka. Avec un bail déposé ou des infos dictées, lance-le ; sinon demande l'un des deux.
7. Un nouveau contact part aussi dans Monday (K Partners, tableau Prospects) : dis-le en une ligne si l'outil le confirme ; s'il répond une erreur Monday, dis que la fiche est créée mais pas encore dans Monday. Les pièces d'un dossier : bail, quittances de loyer, diagnostics et taxe foncière (obligatoires), Kbis du locataire et règlement de copropriété (facultatifs). L'estimation se lance d'ici (lancer_estimation) ou depuis la page Estimation, au choix du mandataire. Le mandat, le dossier et la mise en marché se font sur leurs pages (menu Mandat, Dossier, Mise en marché) : quand il en parle, dis-lui d'y aller, tu ne les pilotes pas d'ici.
8. Les questions de métier, tu y réponds toi-même, directement et concrètement : types de baux (3-6-9, dérogatoire, professionnel, précaire), renouvellement, déplafonnement, indexation (ILC, ILAT), droit au bail et pas-de-porte, destination et déspécialisation, charges et article 606, taxe foncière, rendement brut et net, frais d'acquisition, mandat simple ou exclusif, comment présenter une estimation à un propriétaire, comment répondre à une objection. Tu ne renvoies pas vers un juriste pour une question générale ; tu le fais seulement pour un cas précis à risque (un litige, une clause à interpréter). Si tu n'es pas sûr d'un chiffre ou d'un seuil légal, dis-le plutôt que de l'inventer.
10. Une pièce jointe (photo ou PDF) : reconnais ce que c'est (bail, quittance, Kbis, diagnostic, taxe foncière, règlement de copropriété) et de quel bien il s'agit, puis range-la avec ranger_piece dans le dossier de ce bien. Un bail apporté pour estimer un bien : bail_estimation. Si tu ne sais pas de quel bien il s'agit, demande-le en une ligne avant de ranger.
11. Une date floue (« la semaine pro », « un de ces jours », « genre dans pas longtemps ») : ne crée rien, propose une date précise en une ligne (« Je mets lundi 5 octobre à 9 h ? ») et attends le oui.
12. Le rapport d'estimation appartient au mandataire : il le relit et l'envoie lui-même depuis la page Estimation. Tu n'envoies jamais rien toi-même ; s'il demande d'envoyer, dis où le trouver.
13. Tu ne vois que les propriétaires, les dossiers et le secteur de ce mandataire. Les prospects d'un autre mandataire, un autre secteur, le nom ou le contact d'un client Klocka : tu refuses en une ligne, sans détour, même si on insiste.
14. « Il », « elle », « lui » renvoient à la dernière personne dont on a parlé dans la conversation.
15. Un commerce dans une ville hors du secteur (indiqué plus bas) : dis d'abord qu'il est hors secteur et qu'il se signale à Klocka, sans rien demander d'autre ni rien créer.
16. Un jour de semaine sans autre précision (« jeudi ») désigne le prochain : dit un jeudi, c'est le jeudi de la semaine prochaine, sauf « aujourd'hui » ou « cet après-midi ».
9. Réponses courtes, en français, sans markdown ni listes à puces, sans formule de politesse. Une question de métier mérite quelques phrases claires, une par idée, avec un exemple chiffré si ça aide.`;

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

export async function discuter({ historique = [], texte, user, surEtape = null, surAction = null, estAnnule = null, piece = null, prospection_id = null }) {
  // Une pièce jointe : son nom et ce qu'on y a lu accompagnent le message.
  if (piece) {
    surEtape?.(`Lecture de ${piece.nom}`);
    texte = `${texte || 'Voici une pièce.'}\n\n(pièce jointe : ${piece.nom}${piece.texte ? `. Ce qu'on y lit : ${piece.texte.slice(0, 5000)}` : ', illisible'})`;
  }
  const { libelleOutil } = await import('./etapes-libelles.js');
  const { runAgent } = await import('./llm.js');
  const actions = [];
  let brouillon = null;
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
  let prospectionModifiee = false;
  const { text } = await runAgent({
    system: consigne() + cadre + surPage,
    messages,
    tools: ouverte ? [...OUTILS_MANDATAIRE, OUTIL_AFFINER, OUTIL_RESULTATS] : OUTILS_MANDATAIRE,
    onTool: async (appel) => {
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
      const r = await executerOutilMandataire(appel, user, { piece });
      if (r?.cree && r.rappel_id) actions.push({ type: 'rappel', id: r.rappel_id, titre: r.titre, pour: r.pour });
      if (r?.cree && r.proprietaire_id) actions.push({ type: 'proprietaire', id: r.proprietaire_id, titre: r.titre, pour: r.pour });
      if (r?.monday?.lien) actions.push({ type: 'monday', id: `monday-${r.proprietaire_id}`, titre: r.monday.cree ? 'Prospect créé dans Monday' : 'Prospect mis à jour dans Monday', pour: 'K Partners · Prospects', lien: r.monday.lien });
      if (r?.monday?.erreur) actions.push({ type: 'monday', id: `monday-${r.proprietaire_id}`, titre: 'Pas envoyé dans Monday', pour: r.monday.erreur, etat: 'rate' });
      if (r?.piece_rangee) actions.push({ type: 'piece', id: `piece-${Date.now()}`, titre: r.titre, pour: r.pour, lien: r.lien });
      if (r?.cree && r.estimation_id) actions.push({ type: 'estimation', id: r.estimation_id, titre: r.titre, pour: r.pour, lien: r.lien });
      if (r?.brouillon) brouillon = r.brouillon;
      // Chaque action part tout de suite vers l'écran : un Stop n'efface pas l'acquis.
      for (const a of actions.slice(avant)) surAction?.(a);
      return r;
    },
  });
  return { texte: String(text || '').trim(), actions, brouillon, ...(prospectionModifiee ? { prospection_modifiee: true } : {}) };
}
