// Les acquéreurs d'un bien en vente dans Twenty (8 nov. 2026, Jules : « le tableau des acquéreurs doit se mettre à jour
// en même temps dans Twenty ; on doit retrouver le statut de tous nos acquéreurs ; chaque mandataire a sa liste ; quand
// quelqu'un a signé il passe en client et sort des acquéreurs ; si le compromis capote, il y repasse »).
//
// Une ligne du tableau des acquéreurs (PisteAcquereur) = une fiche de Twenty :
//  - pas encore signé : dans KP · Prospects, Type Acquéreur (Locataire pour un bien à louer), son statut, son mandataire
//    (Personnes), son budget, le bien et la prochaine relance ;
//  - signé : dans KP · Clients, et la fiche des Prospects est supprimée ; revenu à un autre statut, l'inverse.
// Relu en fond toutes les 20 s (toute écriture d'une ligne avance son `maj_le`, d'où qu'elle vienne : l'écran, le chat,
// l'import). Une ligne retirée du tableau garde sa fiche dans Twenty. Jamais pendant les tests, ni sans CRM configuré.

import { Records } from './db.js';

const PISTE = 'PisteAcquereur';
/** Le statut d'une ligne, en option du champ Statut de Twenty (les options qui manquent sont ajoutées à l'écriture). */
export const STATUT_CRM = { contact: 'Contact', qualifie: 'Qualifié', visite: 'Visite faite', offre: 'Offre', signe: 'Signé', ecarte: 'Perdu' };
const jour = (v) => (String(v || '').match(/^\d{4}-\d{2}-\d{2}/) || [])[0] || null;

/** Pure : le tableau de Twenty d'une ligne : Clients une fois signée, Prospects sinon. */
export const tableauDeLaPiste = (x) => (x?.statut === 'signe' ? 'clients' : 'prospects');

/** Pure : la ligne vue comme contact de server/crm-bien.js (colonnesContact). */
export function contactDeLaPiste(x, { fiche = null, location = false, bien = null } = {}) {
  const budget = Number(x?.budget) || null;
  return {
    vendeur: false, location, nom: x.nom || 'Acquéreur', email: x.email || null, telephone: x.telephone || null, budget,
    ...(location ? { bien: 'Local commercial' } : {}),
    statut: STATUT_CRM[x.statut] || 'Contact',
    bien_texte: bien || [fiche?.adresse, fiche?.ville].filter(Boolean).join(', ') || null,
    remarque: [x.source ? `Source : ${x.source}.` : null, x.offre ? `Offre : ${Number(x.offre).toLocaleString('fr-FR')} €.` : null, x.prochaine ? `Prochaine action : ${x.prochaine}.` : null, x.note || null].filter(Boolean).join(' ') || null,
    mandataire_email: x.mandataire_email,
  };
}

/** La fiche de Twenty d'une ligne : posée dans le bon tableau, déplacée si son statut l'a fait changer de tableau. */
export async function synchroniserPiste(id, { crm = null } = {}) {
  const x = Records.get(PISTE, id);
  if (!x || x.test || x.exemple) return { ok: false, error: 'Ligne introuvable.' };
  if (/\(test\)/i.test(x.nom || '')) return { ok: false, error: 'Ligne de test : rien ne part dans le CRM.' };
  const m = x.marche_id ? Records.get('MiseEnMarche', x.marche_id) : null;
  if (!m || m.exemple) return { ok: false, error: 'Bien introuvable.' };
  const M = crm || await import('./monday.js');
  if (M.mondayConfigure && !M.mondayConfigure()) return { ok: false, error: 'Le CRM n’est pas configuré ici.' };
  const { TABLEAUX_KP, colonnesContact, poser } = await import('./crm-bien.js');
  const { estLocation } = await import('../src/lib/location.js');
  const d = m.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const fiche = d ? (await import('./mandataire-portes.js')).ficheDuDossier(d) : null;
  if (fiche?.test || fiche?.essai_bien) return { ok: false, error: 'Bien de test : rien ne part dans le CRM.' };
  const location = estLocation(fiche) || m.transaction === 'location';
  const c = contactDeLaPiste(x, { fiche, location, bien: m.bien || null });
  const qui = Records.list('User').find((u) => String(u.email || '').toLowerCase() === String(x.mandataire_email || '').toLowerCase());
  const cible = tableauDeLaPiste(x);
  const tableau = TABLEAUX_KP[cible]();
  const colonnes = colonnesContact(tableau, c, { relance: jour(x.prochaine_le), proprieteId: fiche?.crm?.propriete || null });
  // Le mandataire de la ligne : sa liste se lit dans Twenty par la colonne Personnes des Prospects (Critères le dit aussi).
  if (cible === 'prospects' && qui?.full_name) {
    const { colonnesDe } = await import('./crm-bien.js');
    const col = colonnesDe ? colonnesDe(tableau).Personnes : null;
    if (col) colonnes[col] = qui.full_name;
  }
  const avant = x.crm || {};
  const r = await poser(M, tableau, { id: avant.tableau === cible ? avant.id : null, nom: c.nom, colonnes });
  // Changé de tableau (signé, ou le compromis qui capote) : la fiche d'avant sort de son tableau.
  if (avant.id && avant.tableau && avant.tableau !== cible) await M.supprimerElement(avant.id).catch((e) => console.warn(`[crm] acquéreur, ancienne fiche : ${e?.message || e}`));
  const le = new Date().toISOString();
  Records.update(PISTE, x.id, { crm: { tableau: cible, id: r.id, le } });
  return { ok: true, tableau: cible, id: r.id, cree: r.cree, deplace: !!(avant.tableau && avant.tableau !== cible) };
}

/** Pure : les lignes à reporter dans Twenty : jamais parties, ou changées depuis. */
export const aSynchroniser = (pistes = []) => pistes.filter((x) => !x.test && !x.exemple && !/\(test\)/i.test(x.nom || '') && x.marche_id && (!x.crm?.le || String(x.maj_le || x.cree_le || '') > String(x.crm.le)));

let tourne = false;
/** Le rattrapage : les lignes changées depuis leur dernier passage (l'écran, le chat, l'import, une panne). */
export function demarrerRattrapage({ toutesLes = 60000 } = {}) {
  // Sur Render seulement (comme les mails automatiques) : le serveur local partage le même Twenty, ses essais n'y vont pas.
  if (process.env.NODE_TEST_CONTEXT || (!process.env.RENDER && process.env.CRM_ACQUEREURS_LOCAL !== '1')) return;
  const t = setInterval(async () => {
    if (tourne) return;
    tourne = true;
    try {
      const M = await import('./monday.js');
      if (M.mondayConfigure && !M.mondayConfigure()) return;
      for (const x of aSynchroniser(Records.list(PISTE)).slice(0, 25)) {
        await synchroniserPiste(x.id, { crm: M }).catch((e) => console.warn(`[crm] acquéreur ${x.id} : ${e?.message || e}`));
      }
    } finally { tourne = false; }
  }, toutesLes);
  t.unref?.();
}
