// Un bien entré par l'assistant, recopié dans le CRM comme Jules le fait (4 nov. 2026, Jules : « je mets le propriétaire
// en contact, une ligne dans Propriétés KPartners, je remplis chaque case ; si j'ai des touches, je mets l'acquéreur
// potentiel, son statut, ses dates de relance, rattaché à la propriété qui l'intéresse le plus ») :
//   - KP · Propriétés KPartners : une ligne par bien, chaque case qu'on sait ;
//   - KP · Prospects : tous les contacts, le propriétaire en Vendeur, chaque touche en Acquéreur ;
//   - KP · Clients : les « commités » (vendeur à l'avis accepté ou au mandat signé, acquéreur à l'offre ou après une
//     visite avec un budget validé), proposés par l'assistant, recopiés au oui du mandataire. Ils restent dans Prospects.
// Rien ne part sans le oui du mandataire (l'assistant demande « je mets tout ça dans le CRM ? »). Les écritures passent
// par les verbes de server/monday.js (Monday, Twenty ou les deux). Une fiche de test ne part jamais.

import fs from 'fs';
import { Records } from './db.js';
import { rangValide } from '../src/lib/biens-mandataire.js';

const TABLEAUX = {
  proprietes: () => (process.env.MONDAY_BOARD_KPARTNERS_PROPRIETES || '5100528599').trim(),
  prospects: () => (process.env.MONDAY_BOARD_KPARTNERS_PROSPECTS || '5091573479').trim(),
  clients: () => (process.env.MONDAY_BOARD_KPARTNERS_CLIENTS || '5091576378').trim(),
};

// Les colonnes, lues dans crm/schema.json par leur titre : une colonne ajoutée (Statut, Prochaine relance) y est
// reprise dès qu'elle existe, sans toucher au code.
let schema = null;
function colonnesDe(tableau) {
  if (!schema) {
    try { schema = JSON.parse(fs.readFileSync(new URL('../crm/schema.json', import.meta.url), 'utf8')); } catch { schema = { objets: [] }; }
  }
  const o = (schema.objets || []).find((x) => x.mondayTableau === tableau);
  return Object.fromEntries((o?.champs || []).filter((c) => c.mondayColonne).map((c) => [c.label, c.mondayColonne]));
}
/** Pour les tests : relire crm/schema.json. */
export const oublierSchema = () => { schema = null; };

// L'étape du bien → le Statut de Propriétés KPartners (4 nov. 2026, Jules : « ajoute nos étapes »).
const STATUT_PROPRIETE = { previsite: 'Pré-visite', estimation: 'Avis de valeur', mandat: 'Avis de valeur', dataroom: 'Mandat signé', marche: 'En vente', offre: 'Sous offre', vente: 'Sous Promesse' };
const TYPE_PROPRIETE = { murs_commerce: 'Murs commerciaux', fonds_commerce: 'Fonds de commerce', bureaux: 'Bureaux', murs_et_fonds: 'Murs et fonds' };
const BIEN_CONTACT = { murs_commerce: 'Local commercial', fonds_commerce: 'Fond de commerce', bureaux: 'Bureaux', murs_et_fonds: 'Local commercial' };
const ETAPES = ['previsite', 'estimation', 'mandat', 'dataroom', 'marche', 'offre', 'vente'];
export const STATUTS_TOUCHE = { contact: 'Contact', visite: 'Visite faite', offre: 'Offre', perdu: 'Perdu' };
const STATUT_VENDEUR = { previsite: 'Pré-visite', estimation: 'Avis de valeur', mandat: 'Avis accepté', dataroom: 'Mandat signé', marche: 'En vente', offre: 'Sous offre', vente: 'Sous promesse' };

const jour = (v) => (String(v || '').match(/^\d{4}-\d{2}-\d{2}/) || [])[0] || null;

/** Pure : l'étape où en est le bien (celle qui suit la dernière franchie), en clé. */
export function etapeDe(p) {
  const r = rangValide(p?.biens?.validee);
  return ETAPES[Math.min(ETAPES.length - 1, r + 1)] || 'previsite';
}

/** La prochaine relance du bien : la plus proche des relances ouvertes, sinon sa prochaine action datée. */
export function prochaineRelance(p, rappels = Records.list('Rappel')) {
  const ouvertes = rappels.filter((r) => r.proprietaire_id === p.id && !r.fait && !r.fait_le && r.echeance).map((r) => jour(r.echeance)).filter(Boolean).sort();
  return ouvertes[0] || jour(p.prochaine_action_le);
}

/** Pure : le vendeur est-il « commité » (avis accepté ou mandat signé) ? */
export const vendeurCommite = (p) => rangValide(p?.biens?.validee) >= 1;
/** Pure : l'acquéreur est-il « commité » (une offre, ou une visite avec un budget validé) ? */
export const acquereurCommite = (a) => a?.statut_touche === 'offre' || (a?.statut_touche === 'visite' && !!a?.budget_valide);

const prixDe = (p) => p?.biens?.prix_accord || p?.mandat_importe?.prix || p?.biens?.repris?.prix || null;
const adresseDe = (p) => [p?.adresse, p?.ville].filter(Boolean).join(', ') || null;

/** Pure : les cases de la ligne du bien dans Propriétés KPartners. */
export function colonnesPropriete(p, { touches = [], relance = null, adresse = null } = {}) {
  const C = colonnesDe(TABLEAUX.proprietes());
  const out = {};
  const mettre = (titre, v) => { if (C[titre] && v != null && v !== '') out[C[titre]] = v; };
  const etape = etapeDe(p);
  const r = p?.biens?.repris || {};
  const m = p?.mandat_importe || {};
  mettre('Statut', { label: STATUT_PROPRIETE[etape] });
  if (p?.type_bien) mettre('Type de propriété', { label: TYPE_PROPRIETE[p.type_bien] });
  mettre('Type', { labels: ['Vente'] });
  mettre('Prix', prixDe(p));
  mettre('Loyer', r.loyer_annuel || m.loyer_annuel || null);
  mettre('M²', r.surface || null);
  mettre('Activité Locataire', p?.activite || (p?.commerce && p.commerce !== p.adresse ? p.commerce : null));
  if (m.signe_le) mettre('Date', { date: jour(m.signe_le) });
  if (relance) mettre('Prochaine étape de suivi', { date: relance });
  if (adresse) mettre('Adresse', adresse);
  const notes = [
    p?.nom ? `Propriétaire : ${p.nom}${p.telephone ? `, ${p.telephone}` : ''}${p.email ? `, ${p.email}` : ''}` : null,
    m.signe_le || m.echeance ? `Mandat${m.exclusif === true ? ' exclusif' : m.exclusif === false ? ' simple' : ''}${m.enseigne ? ` (${m.enseigne})` : ''}${m.signe_le ? ` signé le ${jour(m.signe_le).split('-').reverse().join('/')}` : ''}${m.echeance ? `, échéance le ${jour(m.echeance).split('-').reverse().join('/')}` : ''}${m.honoraires ? `, honoraires ${m.honoraires}` : ''}` : null,
    touches.length ? `Touches : ${touches.map((a) => `${a.nom} (${STATUTS_TOUCHE[a.statut_touche] || 'Contact'})`).join(', ')}` : null,
    ...(p?.biens?.jalons || []).map((j) => `${jour(j.le)} ${j.texte}`),
    `Mandataire : ${p?.mandataire_email}. Entré depuis Klocka.`,
  ].filter(Boolean);
  mettre('Notes', { text: notes.join('\n') });
  return out;
}

/** Pure : les cases d'un contact (le propriétaire en Vendeur, une touche en Acquéreur), dans Prospects ou Clients. */
export function colonnesContact(tableau, c, { relance = null, proprieteId = null } = {}) {
  const C = colonnesDe(tableau);
  const out = {};
  const mettre = (titre, v) => { if (C[titre] && v != null && v !== '') out[C[titre]] = v; };
  mettre('Email', c.email || null);
  mettre('Numéro', c.telephone || null);
  mettre('Type', { labels: [c.vendeur ? 'Vendeur' : 'Acquéreur'] });
  if (c.bien) mettre('Bien', { label: c.bien });
  if (c.mandat) mettre('Mandat', { label: c.mandat });
  mettre('Budget', c.budget || null);
  if (c.statut) mettre('Statut', { label: c.statut });
  if (relance) mettre('Prochaine relance', { date: relance });
  if (proprieteId) mettre('Propriétés', { item_ids: [Number(proprieteId)] });
  const criteres = [c.bien_texte ? `Bien : ${c.bien_texte}` : null, c.remarque || null, `Mandataire : ${c.mandataire_email}. Depuis Klocka.`].filter(Boolean).join('\n');
  // « Critères » est un texte long dans Prospects, un texte court dans Clients.
  mettre('Critères', tableau === TABLEAUX.prospects() ? { text: criteres } : criteres.slice(0, 250));
  return out;
}

/** Pure : le propriétaire vu comme contact. */
export function contactVendeur(p) {
  const etape = etapeDe(p);
  return {
    vendeur: true, nom: p.nom || p.commerce || 'Propriétaire', email: p.email || null, telephone: p.telephone || null,
    bien: BIEN_CONTACT[p.type_bien] || 'Local commercial', mandat: rangValide(p.biens?.validee) >= 2 ? 'Signé' : rangValide(p.biens?.validee) >= 0 ? 'En cours' : null,
    statut: STATUT_VENDEUR[etape], bien_texte: adresseDe(p), mandataire_email: p.mandataire_email,
  };
}

/** Pure : une touche vue comme contact. */
export function contactAcquereur(a, p) {
  return {
    vendeur: false, nom: a.nom, email: a.email || null, telephone: a.telephone || null, budget: a.budget_max || a.budget_min || null,
    statut: STATUTS_TOUCHE[a.statut_touche] || 'Contact', bien_texte: adresseDe(p), remarque: a.remarque || null, mandataire_email: a.mandataire_email,
  };
}

const ok = (x) => x && !x.test && !x.essai_bien;

/** Écrit une ligne : mise à jour si on a son id, sinon créée (les étiquettes qui manquent sont ajoutées). */
async function poser(crm, tableau, { id, nom, colonnes }) {
  if (id) {
    try { await crm.majElement(tableau, id, colonnes, { labels: true }); return { id: String(id), cree: false }; } catch (e) {
      if (!/not found|does not exist|invalid|inactive/i.test(e?.message || '')) throw e;
    }
  }
  const r = await crm.creerElement(tableau, nom, colonnes, { labels: true });
  if (!r?.id) throw new Error("Le CRM n'a pas rendu d'identifiant");
  return { id: String(r.id), cree: true };
}

/**
 * Le bien, son propriétaire et ses touches → le CRM. Rend ce qui est parti, et les contacts « commités » à proposer pour
 * Clients. `crm` : les verbes de server/monday.js (remplaçables en test).
 */
export async function mettreAuCrm(proprietaireId, user, { crm = null, geocoder = null } = {}) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  const moi = String(user?.email || '').toLowerCase();
  if (!p || p.mandataire_email !== moi) return { ok: false, error: 'Bien introuvable.' };
  if (!ok(p)) return { ok: false, error: 'Bien de test : rien ne part dans le CRM.' };
  const M = crm || await import('./monday.js');
  if (M.mondayConfigure && !M.mondayConfigure()) return { ok: false, error: 'Le CRM n’est pas configuré ici.' };
  const touches = Records.list('AcquereurMandataire').filter((a) => a.mandataire_email === moi && a.proprietaire_id === p.id && ok(a));
  const relance = prochaineRelance(p);
  const valeurAdresse = geocoder || (await import('./deal/monday-sync.js')).valeurAdresse;
  let adresse = null;
  try { adresse = p.adresse ? await valeurAdresse({ adresse: adresseDe(p), lat: p.lat ?? null, lon: p.lon ?? p.lng ?? null }) : null; } catch { adresse = null; }
  const crmIds = { ...(p.crm || {}) };
  const faits = [];
  const nomBien = p.nom_bien || adresseDe(p) || p.commerce || 'Bien';
  const propriete = await poser(M, TABLEAUX.proprietes(), { id: crmIds.propriete, nom: nomBien, colonnes: colonnesPropriete(p, { touches, relance, adresse }) });
  crmIds.propriete = propriete.id;
  faits.push(`${propriete.cree ? 'Bien créé' : 'Bien mis à jour'} dans Propriétés KPartners`);
  const vendeur = contactVendeur(p);
  const prospect = await poser(M, TABLEAUX.prospects(), { id: crmIds.prospect || p.monday_id, nom: vendeur.nom, colonnes: colonnesContact(TABLEAUX.prospects(), vendeur, { relance, proprieteId: propriete.id }) });
  crmIds.prospect = prospect.id;
  faits.push(`${vendeur.nom} ${prospect.cree ? 'ajouté' : 'mis à jour'} dans Prospects (vendeur)`);
  for (const a of touches) {
    const c = contactAcquereur(a, p);
    const r = await poser(M, TABLEAUX.prospects(), { id: a.crm?.prospect, nom: c.nom, colonnes: colonnesContact(TABLEAUX.prospects(), c, { relance: jour(a.prochaine_relance), proprieteId: propriete.id }) });
    Records.update('AcquereurMandataire', a.id, { crm: { ...(a.crm || {}), prospect: r.id } });
    faits.push(`${c.nom} ${r.cree ? 'ajouté' : 'mis à jour'} dans Prospects (acquéreur)`);
  }
  // Déjà dans Clients : mis à jour au même geste.
  if (crmIds.client) await poser(M, TABLEAUX.clients(), { id: crmIds.client, nom: vendeur.nom, colonnes: colonnesContact(TABLEAUX.clients(), vendeur, { relance, proprieteId: propriete.id }) });
  for (const a of touches.filter((x) => x.crm?.client)) {
    await poser(M, TABLEAUX.clients(), { id: a.crm.client, nom: a.nom, colonnes: colonnesContact(TABLEAUX.clients(), contactAcquereur(a, p), { relance: jour(a.prochaine_relance), proprieteId: propriete.id }) });
  }
  Records.update('ProprietaireMandataire', p.id, { crm: { ...crmIds, le: new Date().toISOString() }, monday_id: prospect.id, historique: [...(p.historique || []), { le: new Date().toISOString(), type: 'note', texte: `Mis au CRM : ${faits.join(' ; ')}` }] });
  const aProposer = [
    ...(vendeurCommite(p) && !crmIds.client ? [{ qui: 'proprietaire', nom: vendeur.nom, pourquoi: rangValide(p.biens?.validee) >= 2 ? 'mandat signé' : 'avis accepté' }] : []),
    ...touches.filter((a) => acquereurCommite(a) && !a.crm?.client).map((a) => ({ qui: a.id, nom: a.nom, pourquoi: a.statut_touche === 'offre' ? 'offre faite' : 'visite faite, budget validé' })),
  ];
  return { ok: true, faits, propriete_id: propriete.id, lien: M.lienMonday ? M.lienMonday(TABLEAUX.proprietes(), propriete.id) : null, a_proposer_en_clients: aProposer };
}

/** Recopie dans Clients les contacts dits (« proprietaire » ou l'id d'une touche), au oui du mandataire. */
export async function passerEnClients(proprietaireId, qui = [], user, { crm = null } = {}) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  const moi = String(user?.email || '').toLowerCase();
  if (!p || p.mandataire_email !== moi) return { ok: false, error: 'Bien introuvable.' };
  if (!ok(p)) return { ok: false, error: 'Bien de test : rien ne part dans le CRM.' };
  const M = crm || await import('./monday.js');
  const relance = prochaineRelance(p);
  const faits = [];
  const crmIds = { ...(p.crm || {}) };
  for (const q of Array.isArray(qui) ? qui : [qui]) {
    if (q === 'proprietaire') {
      const v = contactVendeur(p);
      const r = await poser(M, TABLEAUX.clients(), { id: crmIds.client, nom: v.nom, colonnes: colonnesContact(TABLEAUX.clients(), v, { relance, proprieteId: crmIds.propriete }) });
      crmIds.client = r.id;
      faits.push(`${v.nom} dans Clients (vendeur)`);
      continue;
    }
    const a = Records.get('AcquereurMandataire', q);
    if (!a || a.mandataire_email !== moi || a.proprietaire_id !== p.id) continue;
    const r = await poser(M, TABLEAUX.clients(), { id: a.crm?.client, nom: a.nom, colonnes: colonnesContact(TABLEAUX.clients(), contactAcquereur(a, p), { relance: jour(a.prochaine_relance), proprieteId: crmIds.propriete }) });
    Records.update('AcquereurMandataire', a.id, { crm: { ...(a.crm || {}), client: r.id } });
    faits.push(`${a.nom} dans Clients (acquéreur)`);
  }
  if (!faits.length) return { ok: false, error: 'Personne à passer en Clients.' };
  Records.update('ProprietaireMandataire', p.id, { crm: crmIds });
  return { ok: true, faits };
}
