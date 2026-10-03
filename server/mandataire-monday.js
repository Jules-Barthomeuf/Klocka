// Le propriétaire qu'un mandataire ajoute devient un prospect dans Monday :
// espace KPARTNERS, tableau « Prospects ». Type « Vendeur » (c'est un
// propriétaire de murs), bien « Local commercial », mandat « Non proposé » ;
// le mandataire est posé dans « Personnes » s'il a un compte Monday.
//
// Pas de doublon : une fiche déjà posée (monday_id) se met à jour ; sinon le
// même email, à défaut le même numéro, à défaut le même nom, est repris.
// Seuls les propriétaires CONNUS partent : un commerce dont on ignore qui
// possède les murs n'est pas un prospect vendeur. Chaque changement de statut
// (contacté, RDV, pas vendeur, mandat) se reporte dans la colonne Mandat.

const TABLEAU = () => (process.env.MONDAY_BOARD_KPARTNERS_PROSPECTS || '5091573479').trim();
const COL = {
  email: 'text_mm0emb05',
  personnes: 'multiple_person_mm7pp3f0',
  numero: 'text_mm0ejhqn',
  mandat: 'color_mm0ekshq',
  type: 'dropdown_mm0n2ygh',
  bien: 'color_mm0f65qr',
  criteres: 'long_text_mm0e7nsh',
  entreprise: 'text_mm0ed4fq',
  date: 'date_mm0e7d4j',
};

// Le statut Klocka → l'étiquette Mandat de Monday (Non proposé, En cours, Signé).
const MANDAT = { en_discussion: 'En cours', rdv_pris: 'En cours', mandat_signe: 'Signé' };
const LIBELLES = { a_appeler: 'À appeler', contacte: 'Contacté', en_discussion: 'En discussion', rdv_pris: 'RDV pris', mandat_signe: 'Mandat signé', pas_vendeur: 'Pas vendeur', a_recontacter: 'À recontacter' };

/** Pure : les colonnes Monday d'un propriétaire. */
export function colonnesProspect(p, { personneId = null, aujourdhui = new Date(), miseAJour = false } = {}) {
  const criteres = [
    p.statut ? `Statut Klocka : ${LIBELLES[p.statut] || p.statut}${p.prochaine_action ? ` · ${p.prochaine_action}` : ''}` : null,
    p.commerce ? `Propriétaire des murs : ${p.commerce}` : null,
    p.activite && p.activite !== p.commerce ? `Activité : ${p.activite}` : null,
    p.adresse || p.ville ? `Adresse : ${[p.adresse, p.ville].filter(Boolean).join(', ')}` : null,
    `Ajouté par le mandataire ${p.mandataire_email} depuis Klocka.`,
  ].filter(Boolean).join('\n');
  const c = {
    [COL.mandat]: { label: MANDAT[p.statut] || 'Non proposé' },
    [COL.type]: { labels: ['Vendeur'] },
    [COL.bien]: { label: 'Local commercial' },
    [COL.criteres]: { text: criteres },
  };
  // La date est celle de l'entrée dans Monday : une mise à jour ne la touche pas.
  if (!miseAJour) c[COL.date] = { date: aujourdhui.toISOString().slice(0, 10) };
  if (p.email) c[COL.email] = p.email;
  if (p.telephone) c[COL.numero] = p.telephone;
  if (p.commerce) c[COL.entreprise] = p.commerce;
  if (personneId) c[COL.personnes] = { personsAndTeams: [{ id: Number(personneId), kind: 'person' }] };
  return c;
}

export const lienProspect = (id) => `https://klocka-company.monday.com/boards/${TABLEAU()}/pulses/${id}`;

/**
 * Pose le propriétaire dans K Partners › Prospects.
 * @returns {Promise<{ok: true, id, cree, lien} | {ok: false, error}>}
 */
export async function pousserProspect(p) {
  try {
    const { mondayConfigure, poserElement, personneMonday } = await import('./monday.js');
    if (!mondayConfigure()) return { ok: false, error: 'Monday non configuré' };
    let personneId = null;
    try { personneId = (await personneMonday({ email: p.mandataire_email }))?.id || null; } catch { /* sans personne, la fiche part quand même */ }
    const nom = p.nom || p.commerce || 'Propriétaire';
    const cle = p.email ? { colonne: COL.email, valeur: p.email } : p.telephone ? { colonne: COL.numero, valeur: p.telephone } : { colonne: 'name', valeur: nom };
    const miseAJour = !!p.monday_id;
    const r = await poserElement(TABLEAU(), { nom, colonnes: colonnesProspect(p, { personneId, miseAJour }), itemId: p.monday_id || null, cle: miseAJour ? null : cle });
    if (!r?.id) return { ok: false, error: 'Monday n’a pas rendu d’identifiant' };
    const { Records } = await import('./db.js');
    if (p.id && Records.get('ProprietaireMandataire', p.id)) Records.update('ProprietaireMandataire', p.id, { monday_id: String(r.id) });
    return { ok: true, id: String(r.id), cree: r.cree, lien: lienProspect(r.id) };
  } catch (e) {
    console.warn(`[mandataire] prospect Monday non posé : ${e?.message || e}`);
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * La fiche telle qu'elle est maintenant → Monday. Rien ne part tant que le
 * propriétaire des murs n'est pas connu, ni pour un bailleur public ou une
 * enseigne nationale. Appelée à la création, à chaque changement de statut,
 * et par la veille quand un propriétaire vient d'être trouvé.
 */
export async function synchroniserFicheMonday(ficheId) {
  const { Records } = await import('./db.js');
  const p = Records.get('ProprietaireMandataire', ficheId);
  if (!p) return { ok: false, error: 'Fiche introuvable' };
  const c = p.cible_id ? Records.get('Cible', p.cible_id) : null;
  const proprio = (p.nom || c?.proprietaire?.nom || '').trim();
  if (!proprio) return { ok: false, error: 'propriétaire des murs inconnu : pas encore de prospect' };
  const { bailleurPublic, enseigneNationale } = await import('./mandataire-veille.js');
  if (bailleurPublic(proprio) || enseigneNationale(proprio)) return { ok: false, error: 'bailleur public ou enseigne : pas un prospect' };
  const r = await pousserProspect({ ...p, nom: proprio });
  Records.update('ProprietaireMandataire', p.id, { monday_essai_le: new Date().toISOString(), ...(r.ok ? { monday_synchro_le: new Date().toISOString() } : {}) });
  return r;
}

/** Sans attendre : la page n'attend jamais Monday. */
export function synchroniserEnFond(ficheId) {
  synchroniserFicheMonday(ficheId).catch((e) => console.warn(`[mandataire] Monday : ${e?.message || e}`));
}
