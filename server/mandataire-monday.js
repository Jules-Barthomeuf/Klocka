// Le propriétaire qu'un mandataire ajoute devient un prospect dans Monday :
// espace KPARTNERS, tableau « Prospects ». Type « Vendeur » (c'est un
// propriétaire de murs), bien « Local commercial », mandat « Non proposé » ;
// le mandataire est posé dans « Personnes » s'il a un compte Monday.
//
// Pas de doublon : une fiche du même email (à défaut, du même numéro) est
// mise à jour plutôt que recréée.

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

/** Pure : les colonnes Monday d'un propriétaire. */
export function colonnesProspect(p, { personneId = null, aujourdhui = new Date() } = {}) {
  const criteres = [
    p.commerce ? `Propriétaire des murs : ${p.commerce}` : null,
    p.activite && p.activite !== p.commerce ? `Activité : ${p.activite}` : null,
    p.adresse || p.ville ? `Adresse : ${[p.adresse, p.ville].filter(Boolean).join(', ')}` : null,
    `Ajouté par le mandataire ${p.mandataire_email} depuis Klocka.`,
  ].filter(Boolean).join('\n');
  const c = {
    [COL.mandat]: { label: 'Non proposé' },
    [COL.type]: { labels: ['Vendeur'] },
    [COL.bien]: { label: 'Local commercial' },
    [COL.criteres]: { text: criteres },
    [COL.date]: { date: aujourdhui.toISOString().slice(0, 10) },
  };
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
    const cle = p.email ? { colonne: COL.email, valeur: p.email } : p.telephone ? { colonne: COL.numero, valeur: p.telephone } : null;
    const r = await poserElement(TABLEAU(), { nom, colonnes: colonnesProspect(p, { personneId }), cle });
    if (!r?.id) return { ok: false, error: 'Monday n’a pas rendu d’identifiant' };
    const { Records } = await import('./db.js');
    if (p.id && Records.get('ProprietaireMandataire', p.id)) Records.update('ProprietaireMandataire', p.id, { monday_id: String(r.id) });
    return { ok: true, id: String(r.id), cree: r.cree, lien: lienProspect(r.id) };
  } catch (e) {
    console.warn(`[mandataire] prospect Monday non posé : ${e?.message || e}`);
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}
