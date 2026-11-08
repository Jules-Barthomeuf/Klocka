// Le chat du Mandat : comme celui de l'Estimation, il pose les questions du
// mandat de vente — celles du modèle « Mandat de vente » de MyNotary —, le
// mandat se construit à droite à chaque réponse, et quand tout est là, il
// part dans le vrai MyNotary (server/mynotary-agent.js) : le PDF revient dans
// le chat, avec le lien pour finir l'envoi au client sur MyNotary.
//
// Ce que MyNotary remplit seul (la partie Klocka : société, carte T,
// garantie, assurance) ne se demande jamais. Le mandataire donne le mandant,
// le bien, le prix, les honoraires, la durée.
//
// Le mandat de location (6 nov. 2026, Jules : « adapte celui qui est actuellement utilisé pour la vente en location ») :
// le même chat, le même document, d'autres questions. Un bien à louer (`biens.transaction` de sa fiche, ou
// `questionnaire.transaction` dit dans le chat) demande le loyer annuel HT HC, les charges et la taxe foncière, le
// dépôt de garantie, la durée du bail, la destination et la disponibilité ; ni prix de vente, ni TVA du prix, ni
// locataire en place. Les honoraires sont à la charge du preneur, 15 % HT du loyer annuel, sauf ce qui est dit.

import { effortDuChat } from './ak/effort.js';
import { Records } from './db.js';
import { estLocation, HONORAIRES_LOCATION } from '../src/lib/location.js';

const ENTITE = 'MandatMandataire';
const ESPACE_CHAT = 'mandataire-mandat';
const moi = (user) => String(user?.email || '').toLowerCase();

export const TYPES = { simple: 'Simple', semi_exclusif: 'Semi-exclusif', exclusif: 'Exclusif' };

// Ce que le mandat ne peut pas ne pas dire. Le reste s'affiche « à compléter ».
const OBLIGATOIRES = [
  ['type_mandat', 'le type de mandat (simple, semi-exclusif, exclusif)'],
  ['mandant', 'le mandant (nom et prénom, ou la société)'],
  ['vendeur_adresse', "l'adresse du mandant"],
  ['bien_adresse', "l'adresse du bien"],
  ['bien_designation', 'la désignation du bien (ex. local commercial en rez-de-chaussée)'],
  ['prix', 'le prix de vente'],
  ['honoraires', 'les honoraires'],
  ['honoraires_charge', 'la charge des honoraires (vendeur ou acquéreur)'],
  ['duree_mois', 'la durée du mandat'],
];

// En location : le loyer et les conditions du bail à la place du prix. La durée du bail n'y est pas : 3-6-9 par défaut.
const OBLIGATOIRES_LOCATION = [
  ['type_mandat', 'le type de mandat (simple ou exclusif)'],
  ['mandant', 'le mandant, propriétaire bailleur (nom et prénom, ou la société)'],
  ['vendeur_adresse', "l'adresse du mandant"],
  ['bien_adresse', "l'adresse du bien"],
  ['bien_designation', 'la désignation du bien (ex. local commercial en rez-de-chaussée)'],
  ['loyer', 'le loyer annuel demandé (hors taxes, hors charges)'],
  ['depot_garantie', 'le dépôt de garantie'],
  ['destination', 'la destination autorisée (les activités permises dans le local)'],
  ['disponibilite', 'la date de disponibilité du local'],
  ['honoraires', 'les honoraires'],
  ['honoraires_charge', 'la charge des honoraires (preneur ou bailleur)'],
  ['duree_mois', 'la durée du mandat'],
];

/** Pure : les honoraires de location par défaut posés sur un questionnaire qui n'en dit rien. */
function defautsLocation(q) {
  if (q.honoraires == null) { q.honoraires = Math.round(HONORAIRES_LOCATION.taux * 100); q.honoraires_unite = '%'; }
  q.honoraires_charge = { acquereur: 'preneur', vendeur: 'bailleur' }[q.honoraires_charge] || q.honoraires_charge || HONORAIRES_LOCATION.charge;
  return q;
}

// Un nom de mandant qui est celui d'une société (« G Associés », « SCI du Pont », « Holding Martin »).
const NOM_DE_SOCIETE = /\b(sci|sarl|sas|sasu|eurl|snc|sa|scp|selarl|associ[ée]s|holding|groupe|soci[ée]t[ée]|cabinet|compagnie|immobili[èe]re|invest\w*|patrimoine)\b|&/i;

/**
 * Pure : ce qui manque encore, en clair. Les champs que le document affiche selon le cas comptent aussi (2 nov. 2026,
 * Jules : « il dit complet alors qu'il reste des champs ») : pour une société, son SIREN et son représentant ; si le
 * prix est ou non soumis à la TVA ; si le bien est libre ou loué, et loué, à qui.
 */
export function manquantsMandat(q = {}) {
  const location = estLocation(q.transaction);
  const rempli = (v) => v !== undefined && v !== null && v !== '';
  const ok = (cle) => (cle === 'mandant' ? !!(q.vendeur_societe || q.vendeur_nom) : rempli(q[cle]));
  const reste = (location ? OBLIGATOIRES_LOCATION : OBLIGATOIRES).filter(([cle]) => !ok(cle)).map(([, mot]) => mot);
  const societe = !!q.vendeur_societe || q.vendeur_genre === 'morale' || NOM_DE_SOCIETE.test(String(q.vendeur_nom || ''));
  if (societe && !q.vendeur_societe && q.vendeur_nom) reste.push(`la forme de « ${q.vendeur_nom} » (c'est une société : SCI, SARL, SAS…)`);
  if (societe && !rempli(q.vendeur_siren)) reste.push('le SIREN de la société mandante');
  if (societe && !rempli(q.vendeur_representant)) reste.push('le représentant de la société (la personne qui signe)');
  if (location) {
    if (typeof q.charges_refacturees !== 'boolean') reste.push('si les charges sont refacturées au locataire (oui ou non)');
    if (typeof q.taxe_fonciere_refacturee !== 'boolean') reste.push('si la taxe foncière est refacturée au locataire (oui ou non)');
    return reste;
  }
  if (typeof q.prix_tva !== 'boolean') reste.push('si le prix est soumis à la TVA (oui ou non)');
  if (typeof q.bien_occupe !== 'boolean') reste.push('si le bien est vendu libre ou loué');
  else if (q.bien_occupe && !rempli(q.bien_locataire)) reste.push('le locataire en place');
  return reste;
}

/** Pure : un nombre dit comme on le dit (« 450 000 € », « 5 % », « 12 mois »). */
export function nombreDit(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').replace(/\u00a0|\u202f/g, ' ').match(/\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const brut = m[0];
  const n = /[ ]/.test(brut) || (/\.\d{3}(?!\d)/.test(brut) && !/,/.test(brut))
    ? Number(brut.replace(/[ .]/g, '').replace(',', '.'))
    : Number(brut.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const CHAMPS = {
  type_mandat: (v) => {
    const t = String(v || '').toLowerCase();
    if (/semi/.test(t)) return 'semi_exclusif';
    if (/exclu/.test(t)) return 'exclusif';
    if (/simple/.test(t)) return 'simple';
    return undefined;
  },
  vendeur_genre: (v) => (/moral|soci|sci|sarl|sas/i.test(String(v)) ? 'morale' : /physi|personne|particulier/i.test(String(v)) ? 'physique' : undefined),
  vendeur_civilite: (v) => String(v).trim().slice(0, 20),
  vendeur_nom: (v) => String(v).trim().slice(0, 80),
  vendeur_prenom: (v) => String(v).trim().slice(0, 80),
  vendeur_societe: (v) => String(v).trim().slice(0, 120),
  vendeur_forme: (v) => String(v).trim().slice(0, 40),
  vendeur_siren: (v) => (String(v).replace(/\D/g, '').length === 9 ? String(v).replace(/\D/g, '') : String(v).trim().slice(0, 20)),
  vendeur_representant: (v) => String(v).trim().slice(0, 120),
  vendeur_adresse: (v) => String(v).trim().slice(0, 200),
  vendeur_email: (v) => String(v).trim().toLowerCase().slice(0, 120),
  vendeur_telephone: (v) => String(v).trim().slice(0, 30),
  bien_adresse: (v) => String(v).trim().slice(0, 200),
  bien_designation: (v) => String(v).trim().slice(0, 400),
  bien_surface: (v) => { const n = nombreDit(v); return n > 0 && n < 100000 ? n : undefined; },
  bien_occupe: (v) => (typeof v === 'boolean' ? v : /oui|occup|lou/i.test(String(v)) ? true : /non|libre|vide/i.test(String(v)) ? false : undefined),
  bien_locataire: (v) => String(v).trim().slice(0, 160),
  prix: (v) => { const n = nombreDit(v); return n > 1000 && n < 1e9 ? Math.round(n) : undefined; },
  prix_tva: (v) => (typeof v === 'boolean' ? v : /oui|tva/i.test(String(v)) ? true : /non/i.test(String(v)) ? false : undefined),
  mobilier: (v) => (typeof v === 'boolean' ? v : /oui/i.test(String(v)) ? true : /non/i.test(String(v)) ? false : undefined),
  honoraires: (v) => { const n = nombreDit(v); return n > 0 && n < 1e7 ? n : undefined; },
  honoraires_unite: (v) => (/€|eur/i.test(String(v)) ? '€' : '%'),
  // Le preneur et le bailleur de la location (6 nov. 2026) ; une vente ne les lit pas (nettoyerReponses).
  honoraires_charge: (v) => (/preneur|locataire/i.test(String(v)) ? 'preneur' : /bailleur/i.test(String(v)) ? 'bailleur' : /acqu/i.test(String(v)) ? 'acquereur' : /vend|mandant/i.test(String(v)) ? 'vendeur' : undefined),
  duree_mois: (v) => { const n = nombreDit(v); return n >= 1 && n <= 60 ? Math.round(n) : undefined; },
  date_effet: (v) => String(v).trim().slice(0, 40),
  observations: (v) => String(v).trim().slice(0, 1000),
  // La location (6 nov. 2026, Jules). Le loyer est annuel, hors taxes, hors charges ; dit « par mois », il passe à l'année.
  transaction: (v) => (/locat|louer|bail/i.test(String(v)) ? 'location' : /vent|vendre/i.test(String(v)) ? 'vente' : undefined),
  loyer: (v) => {
    const n = nombreDit(v);
    if (!(n > 0)) return undefined;
    const an = typeof v !== 'number' && /mois|mensuel/i.test(String(v)) ? n * 12 : n;
    return an >= 100 && an < 1e8 ? Math.round(an) : undefined;
  },
  loyer_tva: (v) => (typeof v === 'boolean' ? v : /oui|tva/i.test(String(v)) ? true : /non/i.test(String(v)) ? false : undefined),
  charges_refacturees: (v) => ouiNonLocataire(v),
  taxe_fonciere_refacturee: (v) => ouiNonLocataire(v),
  depot_garantie: (v) => (typeof v === 'number' ? (v > 0 ? `${Math.round(v).toLocaleString('fr-FR')} €` : undefined) : String(v).trim().slice(0, 80)),
  bail_duree: (v) => String(v).trim().slice(0, 80),
  destination: (v) => String(v).trim().slice(0, 300),
  disponibilite: (v) => String(v).trim().slice(0, 60),
};

/** Pure : refacturé au locataire (oui) ou gardé par le bailleur (non). « non refacturées » se lit non. */
function ouiNonLocataire(v) {
  if (typeof v === 'boolean') return v;
  const t = String(v);
  if (/\bnon\b|bailleur|propri/i.test(t)) return false;
  if (/oui|refactur|preneur|locataire/i.test(t)) return true;
  return undefined;
}

/** Le mandat de location ? Son questionnaire le dit, sinon la fiche de son bien (ou celle de son avis de valeur). */
export function mandatDeLocation(m) {
  if (!m) return false;
  if (m.questionnaire?.transaction) return estLocation(m.questionnaire.transaction);
  const pid = m.proprietaire_id || (m.estimation_id ? Records.get('EstimationMandataire', m.estimation_id)?.proprietaire_id : null);
  return pid ? estLocation(Records.get('ProprietaireMandataire', pid)) : false;
}

/** Le questionnaire d'un mandat, avec la transaction de sa fiche quand il ne la dit pas encore. */
function avecTransaction(m) {
  const q = { ...(m?.questionnaire || {}) };
  if (!q.transaction && mandatDeLocation(m)) q.transaction = 'location';
  return q;
}

/** Location ou non, pour des réponses à noter : ce qu'elles disent de la transaction, sinon le mandat. */
const enLocation = (m, reponses = {}) => {
  const dit = reponses?.transaction != null ? CHAMPS.transaction(reponses.transaction) : undefined;
  return dit ? dit === 'location' : mandatDeLocation(m);
};

/** Pure : les réponses dites, propres ; ce qui ne se lit pas est rendu à part. En location, vendeur et acquéreur deviennent bailleur et preneur. */
export function nettoyerReponses(reponses = {}, { location = false } = {}) {
  const propres = {};
  const illisibles = [];
  for (const [cle, brut] of Object.entries(reponses || {})) {
    const f = CHAMPS[cle];
    if (!f || brut === null || brut === undefined || brut === '') continue;
    const v = f(brut);
    if (v === undefined || v === '') illisibles.push(cle);
    else propres[cle] = v;
  }
  // Des honoraires dits « 5 % » ou « 15 000 € » portent leur unité.
  if (reponses?.honoraires != null && propres.honoraires != null && !reponses.honoraires_unite) {
    propres.honoraires_unite = /€|eur/i.test(String(reponses.honoraires)) || propres.honoraires > 100 ? '€' : '%';
  }
  const charge = propres.honoraires_charge;
  if (charge && location) propres.honoraires_charge = { acquereur: 'preneur', vendeur: 'bailleur' }[charge] || charge;
  else if (charge === 'preneur' || charge === 'bailleur') { delete propres.honoraires_charge; illisibles.push('honoraires_charge'); }
  return { propres, illisibles };
}

/** Pure : « SCI » + « SCI du Pont » ne fait pas « SCI SCI du Pont ». */
export function societeAvecForme(forme, societe) {
  const f = String(forme || '').trim();
  const n = String(societe || '').trim();
  if (!f || new RegExp(`^${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(n)) return n;
  return `${f} ${n}`;
}

/** Pure : le nom du mandant tel qu'il s'écrit sur le mandat. */
export function nomMandant(q = {}) {
  if (q.vendeur_societe) return societeAvecForme(q.vendeur_forme, q.vendeur_societe);
  return [q.vendeur_civilite, q.vendeur_prenom, q.vendeur_nom].filter(Boolean).join(' ') || null;
}

// --- Le mandat en cours de la conversation ---------------------------------

function enCours(user, conv) {
  const miens = Records.list(ENTITE).filter((m) => m.mandataire_email === moi(user) && m.questionnaire);
  if (conv) {
    const lie = miens.filter((m) => m.conversation_id === conv).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0];
    if (lie) return lie;
  }
  // Le mandat commencé au premier message, avant que la conversation ait son identifiant.
  return miens.filter((m) => !m.exemple && !m.conversation_id && m.statut === 'brouillon' && Date.now() - Date.parse(m.cree_le) < 10 * 60000)
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0] || null;
}

export function commencerMandat({ bien = null, transaction = null } = {}, user, conv = null) {
  const deja = enCours(user, conv);
  if (deja && deja.statut === 'brouillon') return { ok: true, mandat_id: deja.id, deja: true };
  const location = CHAMPS.transaction(transaction || '') === 'location';
  const m = Records.create(ENTITE, {
    mandataire_email: moi(user),
    bien: String(bien || (location ? 'Mandat de location' : 'Mandat de vente')).trim().slice(0, 160),
    vendeur: null, vendeur_contact: null, prix: null, honoraires: null, honoraires_charge: null, type: null, duree_mois: null,
    questionnaire: location ? defautsLocation({ transaction: 'location' }) : {},
    conversation_id: conv,
    statut: 'brouillon',
    reference_mynotary: null, document: null, document_signe: null, numero_registre: null, mynotary_url: null,
    cree_le: new Date().toISOString(),
    historique: [{ le: new Date().toISOString(), par: user?.email || null, action: 'mandat commencé dans le chat' }],
  });
  return { ok: true, mandat_id: m.id };
}

/**
 * Pure : le questionnaire du mandat tiré de ce que le bien sait déjà (27 oct. 2026, Jules : « lorsqu'on passe au
 * mandat ça doit déjà préparer le mandat automatiquement puis poser les questions ensuite »). L'avis de valeur donne
 * l'adresse, le bien, le locataire et les honoraires présentés ; la fiche donne le vendeur et le prix d'accord.
 * Rien d'inventé : ce qui n'est pas su reste à demander (le type de mandat, la durée, la charge des honoraires…).
 */
export function questionnaireDuBien({ estimation = null, proprietaire = null } = {}) {
  const e = estimation || {};
  const eq = e.questionnaire || {};
  const avis = e.avis || {};
  const p = proprietaire || {};
  const murs = p.preparation?.murs || {};
  const q = {};
  const pose = (cle, v) => { if (v !== undefined && v !== null && v !== '') q[cle] = v; };
  // Le vendeur : la société propriétaire des murs si on la connaît, sinon la personne de la fiche ou celle qui a demandé l'avis.
  const societe = murs.proprietaire && (murs.forme || /\b(sci|sarl|sas|sasu|eurl|sa|snc)\b/i.test(murs.proprietaire)) ? murs.proprietaire : null;
  if (societe) {
    q.vendeur_genre = 'morale';
    pose('vendeur_societe', societe);
    pose('vendeur_forme', murs.forme);
    pose('vendeur_representant', p.nom || eq.demandeur);
  } else {
    const nom = p.nom || murs.proprietaire || eq.demandeur;
    if (nom) { q.vendeur_genre = 'physique'; q.vendeur_nom = String(nom).trim(); }
  }
  pose('vendeur_email', p.email || e.envoi?.a);
  pose('vendeur_telephone', p.telephone);
  // Le bien.
  pose('bien_adresse', e.adresse || eq.adresse || [p.adresse, p.ville].filter(Boolean).join(', '));
  const surface = Number(eq.surface_utile || eq.surface) || null;
  // À louer (6 nov. 2026) : un local, sans locataire en place ni prix ; le loyer demandé se dit dans le chat.
  if (estLocation(p)) {
    q.transaction = 'location';
    pose('bien_designation', `Local commercial${surface ? ` d'environ ${surface} m²` : ''}`);
    pose('bien_surface', surface);
    // Le loyer : celui dont on est convenu, sinon celui de l'estimation du loyer (avis.chiffres.valeur, un loyer annuel).
    pose('loyer', Number(p.biens?.prix_accord || p.biens?.restitution?.prix || avis.chiffres?.valeur) || null);
    pose('destination', eq.destination);
    pose('disponibilite', eq.disponible_le);
    return defautsLocation(q);
  }
  const nature = avis.type_libelle || (eq.type_bien === 'murs_commerce' ? 'Murs commerciaux' : null);
  if (nature) pose('bien_designation', `${nature}${surface ? ` d'environ ${surface} m²` : ''}${eq.activite_locataire ? `, loués à usage de ${String(eq.activite_locataire).toLowerCase()}` : ''}`);
  pose('bien_surface', surface);
  if (typeof eq.occupe === 'boolean') q.bien_occupe = eq.occupe;
  pose('bien_locataire', eq.locataire || eq.activite_locataire);
  // Le prix : celui dont on est convenu, sinon la valeur de l'avis.
  pose('prix', Number(p.biens?.prix_accord || p.biens?.restitution?.prix || avis.chiffres?.valeur) || null);
  const pct = Number(avis.chiffres?.honoraires_pct);
  if (pct > 0) { q.honoraires = pct; q.honoraires_unite = '%'; }
  return q;
}

/** Les champs repris, dits en clair pour le premier message. */
function reprisDe(q) {
  const mots = [];
  if (nomMandant(q)) mots.push(`le vendeur (${nomMandant(q)})`);
  if (q.bien_adresse) mots.push(`l'adresse (${q.bien_adresse})`);
  if (q.bien_designation) mots.push('la désignation');
  if (estLocation(q.transaction)) {
    if (q.loyer) mots.push(`le loyer (${Number(q.loyer).toLocaleString('fr-FR')} € HT HC par an)`);
    if (q.honoraires) mots.push(`les honoraires de location (${q.honoraires} % HT du loyer annuel, à la charge du ${q.honoraires_charge === 'bailleur' ? 'bailleur' : 'preneur'})`);
    return mots;
  }
  if (q.prix) mots.push(`le prix (${Number(q.prix).toLocaleString('fr-FR')} €)`);
  if (q.honoraires) mots.push(`les honoraires de l'avis (${q.honoraires} %)`);
  return mots;
}

/** Le mandat du bien, préparé d'office à l'ouverture de l'étape Mandat ; le même s'il existe déjà. */
export function preparerMandat({ estimation_id }, user) {
  const e = Records.get('EstimationMandataire', estimation_id);
  if (!e || (e.mandataire_email !== moi(user) && user?.role !== 'admin')) return { ok: false, error: 'Avis de valeur introuvable.' };
  const deja = Records.list(ENTITE).filter((m) => m.estimation_id === e.id).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0];
  if (deja) return { ok: true, mandat_id: deja.id, deja: true };
  const p = e.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
  const q = questionnaireDuBien({ estimation: e, proprietaire: p });
  const titre = [q.bien_designation?.split(/[,.]/)[0], q.bien_adresse].filter(Boolean).join(' · ').slice(0, 160) || e.bien || (estLocation(q.transaction) ? 'Mandat de location' : 'Mandat de vente');
  const m = Records.create(ENTITE, {
    mandataire_email: e.mandataire_email,
    bien: titre,
    vendeur: null, vendeur_contact: null, prix: null, honoraires: null, honoraires_charge: null, type: null, duree_mois: null,
    questionnaire: q, prepare_depuis: reprisDe(q),
    estimation_id: e.id, conversation_id: null,
    statut: 'brouillon',
    reference_mynotary: null, document: null, document_signe: null, numero_registre: null, mynotary_url: null,
    ...(e.exemple ? { exemple: true } : {}),
    cree_le: new Date().toISOString(),
    historique: [{ le: new Date().toISOString(), par: user?.email || null, action: "mandat préparé avec l'avis de valeur et la fiche" }],
  });
  if (!e.proprietaire_id && !e.exemple) import('./fiche-du-bien.js').then((f) => f.ficheDuMandat(m.id, user)).catch((err) => console.warn(`[fiche] ${err?.message || err}`));
  return { ok: true, mandat_id: m.id, cree: true };
}

export function noterMandat(reponses, user, conv = null) {
  const m = enCours(user, conv);
  if (!m) return { ok: false, error: "Aucun mandat en cours : commence-le d'abord (commencer_mandat)." };
  if (m.statut !== 'brouillon') return { ok: false, error: `Ce mandat est déjà parti (« ${m.statut} ») : une correction passe par corriger_mandat.` };
  const location = enLocation(m, reponses);
  const { propres, illisibles } = nettoyerReponses(reponses, { location });
  const q = { ...avecTransaction(m), ...propres };
  // Devenu mandat de location dans le chat : les honoraires par défaut de la location, s'il n'en a pas dit d'autres.
  if (location && propres.transaction === 'location' && !estLocation(m.questionnaire?.transaction)) defautsLocation(q);
  const titre = q.bien_adresse || q.bien_designation ? [q.bien_designation?.split(/[,.]/)[0], q.bien_adresse].filter(Boolean).join(' · ').slice(0, 160) : m.bien;
  // L'état d'avant reste à portée des flèches de l'aperçu (trente pas au plus).
  const passe = [...(m.questionnaire_passe || []), { questionnaire: m.questionnaire || {}, bien: m.bien }].slice(-30);
  Records.update(ENTITE, m.id, { questionnaire: q, bien: titre, questionnaire_passe: passe, questionnaire_futur: [], ...(conv && !m.conversation_id ? { conversation_id: conv } : {}) });
  // Aucun mandat sans fiche (2 nov. 2026, server/fiche-du-bien.js) : dès que l'adresse du bien est connue.
  if (q.bien_adresse && !m.proprietaire_id && !m.estimation_id && !m.exemple) import('./fiche-du-bien.js').then((f) => f.ficheDuMandat(m.id, user)).catch((err) => console.warn(`[fiche] ${err?.message || err}`));
  const reste = manquantsMandat(q);
  return {
    ok: true, mandat_id: m.id, notes: Object.keys(propres),
    ...(illisibles.length ? { illisibles, note_illisibles: `Ces réponses ne se lisent pas : ${illisibles.join(', ')} — redemande-les.` } : {}),
    manquants: reste,
  };
}

/**
 * Tout est là : la demande devient un mandat « demande_envoyee » (la porte et
 * le registre le suivent comme avant), et l'agent MyNotary le crée s'il est
 * allumé. Sinon, ou s'il échoue, l'équipe Klocka le saisit — et on le dit.
 */
export async function envoyerMandat(user, conv = null, { surEtape = null } = {}) {
  const m = enCours(user, conv);
  if (!m) return { ok: false, error: 'Aucun mandat en cours.' };
  return envoyerCeMandat(m, user, { surEtape });
}

/** Le bouton « Envoyer le mandat » de l'aperçu (27 oct. 2026) : le même envoi, sans passer par le chat. */
export async function envoyerMandatParId(id, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  return envoyerCeMandat(m, user);
}

async function envoyerCeMandat(m, user, { surEtape = null } = {}) {
  // Le mandat d'exemple se remplit dans le chat, mais ne part pas chez MyNotary.
  if (m.exemple) return { ok: false, exemple: true, error: "C'est le mandat d'exemple : il montre comment ça marche, mais il ne part pas chez MyNotary. Dis-le en une ligne et propose de commencer un vrai mandat." };
  if (m.statut !== 'brouillon') return { ok: true, deja: true, mandat_id: m.id, statut: m.statut };
  const q = avecTransaction(m);
  const location = estLocation(q.transaction);
  const reste = manquantsMandat(q);
  if (reste.length) return { ok: false, manquants: reste, error: `Il manque encore : ${reste.join(', ')}.` };

  surEtape?.('Le mandat est complet : préparation de la saisie MyNotary');
  Records.update(ENTITE, m.id, {
    vendeur: nomMandant(q),
    vendeur_contact: [q.vendeur_email, q.vendeur_telephone].filter(Boolean).join(' · ') || null,
    // Un mandat de location n'a pas de prix : son loyer annuel HT HC (6 nov. 2026).
    prix: location ? null : q.prix,
    ...(location ? { transaction: 'location', loyer: q.loyer, questionnaire: q } : {}),
    honoraires: q.honoraires,
    honoraires_charge: q.honoraires_charge,
    type: q.type_mandat === 'simple' ? 'simple' : 'exclusif',
    duree_mois: q.duree_mois,
    statut: 'demande_envoyee',
    demande_envoyee_le: new Date().toISOString(),
    historique: [...(m.historique || []), { le: new Date().toISOString(), par: user?.email || null, action: 'mandat complété dans le chat, envoyé à Klocka' }],
  });
  const { etapeDuMandat } = await import('./mandataire-portes.js');
  etapeDuMandat(Records.get(ENTITE, m.id), 'demande_envoyee');

  const { agentMyNotaryActif, lancerAgentMandat } = await import('./mynotary-agent.js');
  if (!agentMyNotaryActif()) {
    return { ok: true, mandat_id: m.id, statut: 'demande_envoyee', en_file: true, note: "Réponds exactement, sans rien ajouter : « Le mandat est bien envoyé. L'équipe le remplit au plus vite et vous le renverra dans cette conversation. Relisez-le et dites-lui si c'est bon. »" };
  }
  surEtape?.('Connexion à MyNotary');
  const r = await lancerAgentMandat(m.id, { surEtape });
  if (!r.ok) {
    return { ok: true, mandat_id: m.id, statut: 'demande_envoyee', en_file: true, note: `La saisie automatique n'a pas abouti (${String(r.error || '').slice(0, 140)}) : l'équipe Klocka est prévenue et le saisit. Dis-le en une ligne, sans détail technique.` };
  }
  const frais = Records.get(ENTITE, m.id);
  return { ok: true, mandat_id: m.id, statut: frais.statut, document: frais.document || null, mynotary_url: frais.mynotary_url || null };
}

// --- Le chat ----------------------------------------------------------------

const OUTILS = [
  {
    name: 'commencer_mandat',
    description: 'Commence le mandat de cette conversation (une fois, au premier message qui parle d’un mandat).',
    input_schema: { type: 'object', properties: { bien: { type: 'string', description: 'Le bien, en quelques mots' }, transaction: { type: 'string', enum: ['vente', 'location'], description: 'location quand le mandataire veut louer le local (trouver un locataire) ; vente sinon' } } },
  },
  {
    name: 'noter_mandat',
    description: 'Enregistre les réponses du mandataire. Clés possibles : type_mandat (simple|semi_exclusif|exclusif), vendeur_genre (physique|morale), vendeur_civilite, vendeur_nom, vendeur_prenom, vendeur_societe, vendeur_forme, vendeur_siren, vendeur_representant, vendeur_adresse, vendeur_email, vendeur_telephone, bien_adresse, bien_designation, bien_surface, bien_occupe, bien_locataire, prix, prix_tva, mobilier, honoraires, honoraires_unite (%|€), honoraires_charge (vendeur|acquereur), duree_mois, date_effet, observations. En location (transaction : location) : loyer (annuel HT HC, en euros ; un loyer mensuel se note avec « par mois »), loyer_tva, charges_refacturees (oui|non), taxe_fonciere_refacturee (oui|non), depot_garantie, bail_duree, destination, disponibilite, et honoraires_charge (preneur|bailleur) ; ni prix, ni prix_tva, ni bien_occupe. Les valeurs telles que dites.',
    input_schema: { type: 'object', properties: { reponses: { type: 'object' } }, required: ['reponses'] },
  },
  {
    name: 'envoyer_mynotary',
    description: 'Le mandat est complet ET le mandataire a dit que c’est bon (« c’est tout bon », « envoie », « vas-y ») : il part dans MyNotary. Jamais avant son accord.',
    input_schema: { type: 'object', properties: {} },
  },
];

const CONSIGNE = `Tu prépares, avec un mandataire du réseau K Partners, un MANDAT DE VENTE qui sera saisi dans MyNotary. Le mandat se construit à droite de l'écran à chaque réponse : le mandataire le voit.

1. Au premier message : commencer_mandat, puis noter_mandat avec TOUT ce qui a été dit (rien n'est redemandé).
2. Puis TOUTES les questions restantes EN UN SEUL MESSAGE, en liste numérotée courte : le mandant (personne ou société : nom, adresse, contact ; pour une société, forme, SIREN, représentant), le bien (adresse, désignation, surface, occupé ou libre), le prix de vente, TVA ou non, mobilier ou non, le type de mandat, les honoraires (montant ou %, à la charge de qui), la durée. Ne demande pas ce que MyNotary remplit seul : la partie Klocka (société, carte T, garantie, assurance) est déjà dans le modèle.
3. À chaque réponse : noter_mandat. S'il reste des manques, redemande-les en un message.
4. Quand plus rien ne manque : résume le mandat en 3 lignes (mandant, bien et prix, honoraires et durée) et demande « Je l'envoie dans MyNotary ? ». À son accord seulement : envoyer_mynotary.
5. Après l'envoi : une ligne. Si le PDF est revenu, dis qu'il s'ouvre et qu'on peut le compléter sur MyNotary pour l'envoyer au client. S'il est parti en file, dis qu'il est saisi sur MyNotary et envoyé en signature, et que le mandat signé arrivera dans l'onglet Conversation (sans nommer Klocka).

On n'invente rien. Prix en euros, honoraires tels que dits. Phrases courtes, vouvoiement, pas de jargon technique.`;

// Le mandat de location (6 nov. 2026, Jules) : les mêmes temps, les questions du bail à la place du prix.
const CONSIGNE_LOCATION = `Tu prépares, avec un mandataire du réseau K Partners, un MANDAT DE LOCATION d'un local commercial qui sera saisi dans MyNotary : le mandant, propriétaire bailleur, charge l'agence de trouver un locataire et de négocier un bail commercial. Le mandat se construit à droite de l'écran à chaque réponse : le mandataire le voit.

1. Au premier message : commencer_mandat (transaction location), puis noter_mandat avec TOUT ce qui a été dit (rien n'est redemandé).
2. Puis TOUTES les questions restantes EN UN SEUL MESSAGE, en liste numérotée courte : le mandant (personne ou société : nom, adresse, contact ; pour une société, forme, SIREN, représentant), le bien (adresse, désignation, surface), le loyer annuel demandé hors taxes et hors charges (TVA sur le loyer ou non), les charges et la taxe foncière (refacturées au locataire ou non), le dépôt de garantie, la durée du bail (3-6-9 par défaut : propose-le), la destination autorisée (les activités permises), la date de disponibilité, le type de mandat (simple ou exclusif), les honoraires (par défaut 15 % HT du loyer annuel HT HC, à la charge du preneur : fais-les confirmer), la durée du mandat. Il n'y a ni prix de vente, ni prix net vendeur, ni honoraires vendeur, ni locataire en place. Ne demande pas ce que MyNotary remplit seul : la partie Klocka (société, carte T, garantie, assurance) est déjà dans le modèle.
3. À chaque réponse : noter_mandat. S'il reste des manques, redemande-les en un message.
4. Quand plus rien ne manque : résume le mandat en 3 lignes (mandant, bien et loyer, honoraires et durée) et demande « Je l'envoie dans MyNotary ? ». À son accord seulement : envoyer_mynotary.
5. Après l'envoi : une ligne. Si le PDF est revenu, dis qu'il s'ouvre et qu'on peut le compléter sur MyNotary pour l'envoyer au client. S'il est parti en file, dis qu'il est saisi sur MyNotary et envoyé en signature, et que le mandat signé arrivera dans l'onglet Conversation (sans nommer Klocka).

On n'invente rien. Loyer en euros par an, honoraires tels que dits. Phrases courtes, vouvoiement, pas de jargon technique.`;

/** Pure : la consigne du chat du Mandat, de vente ou de location. */
export const consigneMandat = (location = false) => (location ? CONSIGNE_LOCATION : CONSIGNE);

/** Un tour du chat du Mandat. */
export async function discuterMandat({ historique = [], texte, user, surEtape = null, piece = null, pieces = null, conversation_id = null, sources = null, competence = null }) {
  // Les outils de marché et les sources cochées (26 oct. 2026), comme le chat Haka du mandataire.
  const marche = (await import('./mandataire.js')).marchePourChat({ sources, competence });
  const conv = conversation_id ? String(conversation_id) : null;
  if (conv) {
    // Le mandat commencé avant que la conversation ait son identifiant s'y rattache.
    const orphelin = enCours(user, null);
    if (orphelin && !orphelin.conversation_id && !Records.list(ENTITE).some((x) => x.conversation_id === conv)) Records.update(ENTITE, orphelin.id, { conversation_id: conv });
  }
  // Plusieurs pièces jointes depuis le 27 oct. 2026 : une ligne chacune.
  const { lotDePieces, texteAvecPieces } = await import('./pieces-jointes.js');
  const lot = lotDePieces({ piece, pieces });
  for (const p of lot) surEtape?.(p.texte ? `Je lis le document : ${p.nom}` : `${p.nom} : illisible, je fais sans`);
  texte = texteAvecPieces(texte, lot, 12000);
  const actuel = enCours(user, conv);
  const location = actuel ? mandatDeLocation(actuel) : false;
  const contexte = actuel
    ? `\n\nMandat en cours (${actuel.statut}) : ${JSON.stringify(avecTransaction(actuel)).slice(0, 3000)}. Encore obligatoire : ${manquantsMandat(avecTransaction(actuel)).join(', ') || 'rien'}.`
    : "\n\nAucun mandat en cours. Si le mandataire veut louer le local (trouver un locataire), c'est un mandat de location : commencer_mandat avec transaction location, puis les questions de la location (loyer, charges, dépôt de garantie, durée du bail, destination, disponibilité).";
  const { runAgent } = await import('./llm.js');
  let envoi = null;
  let mandatId = actuel?.id || null;
  const messages = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }]
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.contenu }));
  const { text } = await runAgent({ model: process.env.AK_MODELE?.trim() || null, effort: effortDuChat(), journal: { chat: 'mandataire-mandat', par: user?.email || null },
    system: `${consigneMandat(location)}\n\nNous sommes le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })}.${contexte}${marche.cadre}`,
    messages,
    tools: [...OUTILS, ...marche.tools],
    onTool: async ({ name, input = {} }) => {
      if (marche.estMarche(name)) return marche.executer({ name, input }, user);
      try {
        if (name === 'commencer_mandat') {
          surEtape?.(location || input.transaction === 'location' ? 'Nouveau mandat de location' : 'Nouveau mandat de vente');
          const r = commencerMandat(input, user, conv);
          if (r.mandat_id) mandatId = r.mandat_id;
          return r;
        }
        if (name === 'noter_mandat') {
          const cles = Object.keys(input.reponses || {}).map((k) => k.replaceAll('_', ' '));
          surEtape?.(cles.length ? `Je note : ${cles.slice(0, 8).join(', ')}${cles.length > 8 ? '…' : ''}` : 'Réponses enregistrées');
          const r = noterMandat(input.reponses, user, conv);
          if (r.mandat_id) mandatId = r.mandat_id;
          return r;
        }
        if (name === 'envoyer_mynotary') {
          const r = await envoyerMandat(user, conv, { surEtape });
          if (r.ok) envoi = r;
          return r;
        }
        return { ok: false, error: `Outil inconnu : ${name}` };
      } catch (e) {
        console.warn(`[mandat chat] ${name} :`, e?.stack || e);
        return { ok: false, error: `L'outil ${name} a échoué : ${e?.message || e}` };
      }
    },
  });
  // Complet et pas encore parti : le bouton sous la réponse (4 nov. 2026, Jules : « comme celui qui va vers l'estimation »).
  const apres = mandatId ? Records.get(ENTITE, mandatId) : null;
  const boutons = !envoi && apres ? boutonsMandat(apres) : [];
  return { texte: String(text || '').trim(), mandat_id: mandatId, ...(envoi ? { mandat: envoi } : {}), ...(boutons.length ? { boutons } : {}) };
}

/** Pure : le bouton « Envoyer le mandat » d'un mandat complet encore en brouillon ; rien sinon. */
export function boutonsMandat(m) {
  if (!m || m.exemple || m.statut !== 'brouillon' || manquantsMandat(avecTransaction(m)).length) return [];
  return [{ libelle: 'Envoyer le mandat', texte: "C'est tout bon, envoie le mandat.", principal: true }];
}

// --- L'aperçu et la reprise --------------------------------------------------

const lire = (id, user) => {
  const m = Records.get(ENTITE, id);
  return m && (m.mandataire_email === moi(user) || user?.role === 'admin') ? m : null;
};

/** Le mandat tel qu'il s'affiche à droite du chat. */
export function apercuMandat(id, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  // La transaction de la fiche vient avec (6 nov. 2026) : l'aperçu montre le mandat de location d'un bien à louer.
  const q = m.questionnaire ? avecTransaction(m) : {
    // Un mandat d'avant le chat (formulaire) : ses champs, à l'aperçu.
    type_mandat: m.type, vendeur_nom: m.vendeur, bien_designation: m.bien, prix: m.prix,
    honoraires: m.honoraires, honoraires_unite: Number(m.honoraires) > 100 ? '€' : '%',
    honoraires_charge: m.honoraires_charge, duree_mois: m.duree_mois,
  };
  return { ok: true, mandat: m, questionnaire: q, manquants: manquantsMandat(q), mandant: nomMandant(q) };
}

/** La conversation d'un mandat : la sienne, ou une nouvelle qui reprend où on en était. */
export async function conversationDuMandat(id, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  const C = await import('./assistant-conversations.js');
  // Un mandat né d'un bien s'écrit dans le fil du bien (1er nov. 2026, Jules : « toujours un fil par bien »).
  const F = await import('./fil-du-bien.js');
  const pid = m.proprietaire_id || (m.estimation_id ? Records.get('EstimationMandataire', m.estimation_id)?.proprietaire_id : null) || null;
  if (pid && F.dansLeFil(user, pid, m.conversation_id)) return { ok: true, conversation_id: m.conversation_id, fil: pid };
  if (!pid && m.conversation_id && C.lireConversation(user, m.conversation_id, { espace: ESPACE_CHAT })) return { ok: true, conversation_id: m.conversation_id };
  const q = avecTransaction(m);
  const reste = manquantsMandat(q);
  const messages = [
    { role: 'user', contenu: `Mandat · ${m.bien}` },
    {
      role: 'assistant',
      contenu: m.statut === 'brouillon'
        ? m.prepare_depuis && !m.conversation_id
          // Le mandat préparé d'office : ce qui est repris, puis seulement ce qui manque.
          ? `J'ai préparé le mandat avec ce qu'on sait déjà${m.prepare_depuis.length ? ` : ${m.prepare_depuis.join(', ')}` : ''}. Vérifiez-le à droite, tout se corrige.${reste.length ? `\n\nPour le finir, il me manque : ${reste.join(', ')}.` : '\n\nIl est complet : je l’envoie ?'}`
          : (reste.length ? `On reprend le mandat. Il manque encore : ${reste.join(', ')}.` : 'Le mandat est complet. Je l’envoie ?')
        : `Mandat ${m.statut === 'demande_envoyee' ? (m.valide_le ? 'validé : il est en signature' : m.a_relire ? 'rempli : il est à relire dans la conversation' : 'envoyé : l’équipe le remplit au plus vite') : m.statut === 'pret' ? 'signé : il est dans la conversation' : m.statut}. Une correction ? Dites-la ici.`,
      ...(boutonsMandat(m).length ? { boutons: boutonsMandat(m) } : {}),
      ...(m.document || m.mynotary_url ? { cartes: [{ titre: 'Mandat MyNotary', detail: 'Le PDF et le lien pour le compléter', etat: 'fait', lien: `mandat:${m.id}`, action: 'Ouvrir' }] } : {}),
    },
  ];
  const r = pid ? F.rejoindreLeFil(user, pid, messages) : C.enregistrerConversation(user, { messages, espace: ESPACE_CHAT });
  if (!r.ok) return r;
  Records.update(ENTITE, m.id, { conversation_id: r.id });
  return { ok: true, conversation_id: r.id, cree: true, ...(pid ? { fil: pid } : {}) };
}

/**
 * Un champ du mandat modifié à la main, dans l'aperçu (25 oct. 2026, Jules : « on doit pouvoir modifier le mandat
 * comme on veut, juste les champs qu'on remplit »). Même lecture que les réponses du chat ; une valeur vide efface
 * le champ ; l'état d'avant reste à portée des flèches. Seulement tant que le mandat n'est pas parti.
 */
export function modifierChampMandat(id, champ, valeur, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (m.statut !== 'brouillon') return { ok: false, error: `Ce mandat est déjà parti (« ${m.statut} ») : une correction passe par le chat.` };
  if (!CHAMPS[champ]) return { ok: false, error: 'Ce champ ne se modifie pas ici.' };
  const q = avecTransaction(m);
  if (valeur === null || valeur === undefined || String(valeur).trim() === '') delete q[champ];
  else {
    const { propres, illisibles } = nettoyerReponses({ [champ]: valeur }, { location: enLocation(m, { [champ]: valeur }) });
    if (illisibles.length || !(champ in propres)) return { ok: false, error: `Je ne lis pas « ${String(valeur).slice(0, 60)} ».` };
    Object.assign(q, propres);
  }
  const titre = q.bien_adresse || q.bien_designation ? [q.bien_designation?.split(/[,.]/)[0], q.bien_adresse].filter(Boolean).join(' · ').slice(0, 160) : m.bien;
  const passe = [...(m.questionnaire_passe || []), { questionnaire: m.questionnaire || {}, bien: m.bien }].slice(-30);
  Records.update(ENTITE, m.id, { questionnaire: q, bien: titre, questionnaire_passe: passe, questionnaire_futur: [] });
  return apercuMandat(m.id, user);
}

/**
 * Les flèches de l'aperçu : revenir à la réponse d'avant, ou la rétablir.
 * Seulement tant que le mandat n'est pas parti dans MyNotary.
 */
export function naviguerMandat(id, sens, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (m.statut !== 'brouillon') return { ok: false, error: `Ce mandat est déjà parti (« ${m.statut} ») : il ne se défait plus d'ici.` };
  const passe = [...(m.questionnaire_passe || [])];
  const futur = [...(m.questionnaire_futur || [])];
  const ici = { questionnaire: m.questionnaire || {}, bien: m.bien };
  let cible;
  if (sens === 'annuler') {
    cible = passe.pop();
    if (!cible) return { ok: false, error: 'Rien à annuler.' };
    futur.push(ici);
  } else {
    cible = futur.pop();
    if (!cible) return { ok: false, error: 'Rien à rétablir.' };
    passe.push(ici);
  }
  Records.update(ENTITE, m.id, { questionnaire: cible.questionnaire, bien: cible.bien || m.bien, questionnaire_passe: passe.slice(-30), questionnaire_futur: futur.slice(-30) });
  return apercuMandat(m.id, user);
}
