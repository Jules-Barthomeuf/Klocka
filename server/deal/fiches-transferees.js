// Les fiches transférées à sourcing@, une par une, avec ce que la machine en a fait (23 nov. 2026, Jules : « fais
// d'abord un module avec les fiches en mémoire qu'on t'a transférées, je peux juste te dire en dessous ce que j'en
// pense à chaque fois »). C'est le banc d'essai du repérage des fiches : pour chaque transfert, le mail d'origine, ses
// pièces, ce que la lecture a rentré en Mémoire (ou en dossier), le nombre de fiches compté ; dessous, l'avis libre de
// l'équipe, gardé sur le mail (`avis_fiche`). Les avis servent à régler le repérage pour qu'il compte comme l'équipe.
//
// Pur : les listes viennent de la base, `lire` lit l'en-tête d'un transfert (haka/competences/transfert.js).

const boiteCommune = () => (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();
const min = (e) => String(e || '').trim().toLowerCase();
const nombre = (x) => { const n = Number(x && typeof x === 'object' && 'valeur' in x ? x.valeur : x); return Number.isFinite(n) && n > 0 ? n : null; };
const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);

export const INTENTIONS = {
  memoire: 'Rentrée en Mémoire',
  fiche: 'Pré-analysée en dossier',
  documents: 'Rangée dans la Data Room d\'un dossier',
  nouveau: 'Nouveau dossier créé',
  demande: 'Lue comme une question',
};

/** Pure : un bien de la Mémoire, tel qu'on le montre. */
const bienVu = (b) => ({
  id: b.id,
  adresse: [b.adresse?.rue, b.code_postal || b.adresse?.code_postal, b.ville || b.adresse?.ville].filter(Boolean).join(' ') || null,
  prix: b.prix || null,
  loyer: b.loyer_annuel || null,
  surface: b.surface_m2 || null,
  activite: b.locataire_activite || b.locataire_nom || b.type_actif || null,
  piece: b.fiche?.nom || null,
  fiche_url: b.fiche?.url || null,
});

/** Pure : un lot de dossier, tel qu'on le montre. */
const lotVu = (l) => {
  const lot = l?.lot || l || {};
  const a = val(lot.adresse);
  return {
    adresse: a && typeof a === 'object' ? [a.rue, a.code_postal, a.ville].filter(Boolean).join(' ') || null : a || null,
    prix: nombre(lot.prix_fai), loyer: nombre(lot.loyer_annuel_ht_hc), surface: nombre(lot.surface_m2),
    activite: val(lot.locataire_activite) || val(lot.locataire_nom) || null,
  };
};

/**
 * Pure : les transferts de l'équipe à sourcing@ depuis `depuis`, les plus récents d'abord.
 * @param {{ mails: object[], biens?: object[], deals?: object[], fiches?: object[], depuis?: string|null, estInterne?: Function, lire?: Function, prenom?: Function }} d
 *   fiches : les lignes de listerFiches (deal/fiches-stats.js), pour le nombre compté.
 */
export function listerTransferts({ mails = [], biens = [], deals = [], fiches = [], depuis = null, estInterne = () => false, lire = () => ({}), prenom = (e) => e.split('@')[0] }) {
  const biensParMail = new Map();
  for (const b of biens) {
    if (!b.mail_recu_id) continue;
    if (!biensParMail.has(b.mail_recu_id)) biensParMail.set(b.mail_recu_id, []);
    biensParMail.get(b.mail_recu_id).push(b);
  }
  const biensParId = new Map(biens.map((b) => [b.id, b]));
  const dealsParId = new Map(deals.map((d) => [d.deal_id, d]));
  const compteDe = new Map();
  for (const f of fiches) {
    const id = f.id.startsWith('mail:') ? f.id.slice(5) : (deals.find((d) => d.deal_id === f.id)?.source_mail?.mail_recu_id || null);
    if (id) compteDe.set(id, (compteDe.get(id) || 0) + (f.compte?.pas_fiche ? 0 : f.biens || 0));
  }
  return mails
    .filter((m) => min(m.compte) === boiteCommune() && (m.interne || estInterne(min(m.de_email))))
    .filter((m) => (m.pieces_jointes || []).length || (m.memoire_ids || []).length || m.haka_transfert || m.deal_id)
    .filter((m) => !depuis || String(m.date || '') >= depuis)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map((m) => {
      const lu = lire({ texte: m.texte, objet: m.objet }) || {};
      const rentres = [...new Set([...(m.memoire_ids || []), ...(biensParMail.get(m.id) || []).map((b) => b.id)])].map((id) => biensParId.get(id)).filter(Boolean);
      const deja = (m.memoire_deja_ids || []).map((id) => biensParId.get(id)).filter(Boolean);
      const dossiers = [...new Set([m.deal_id, ...(m.deal_ids || [])].filter(Boolean))].map((id) => dealsParId.get(id)).filter(Boolean);
      const lectures = new Map((m.fiches_lues || []).map((x) => [x.nom, x]));
      const intention = m.haka_transfert?.intention || null;
      return {
        id: m.id,
        le: m.date || null,
        par: prenom(min(m.de_email)),
        par_email: min(m.de_email),
        objet: lu.objet_origine || String(m.objet || '').replace(/^\s*((tr|fw|fwd|re)\s*:\s*)+/i, '').trim() || '(sans objet)',
        // L'agent d'origine, jamais quelqu'un de l'équipe (un collègue qui se transfère sa propre capture).
        agent: lu.origine?.email && estInterne(min(lu.origine.email)) ? null : lu.origine?.nom || lu.origine?.email || m.haka_transfert?.origine || null,
        consigne: String(lu.note || '').trim().slice(0, 500) || null,
        texte: String(m.texte || '').slice(0, 3000),
        pieces: (m.pieces_jointes || []).map((p) => ({ nom: p.nom, taille: p.taille || null, lue: lectures.get(p.nom) || null })),
        intention,
        intention_libelle: intention ? INTENTIONS[intention] || intention : 'Pas encore traitée',
        biens: rentres.map(bienVu),
        deja: deja.map(bienVu),
        dossiers: dossiers.map((d) => ({ deal_id: d.deal_id, nom: d.nom || d.lots?.[0]?.synthese?.titre || 'Dossier', lots: (d.lots || []).map(lotVu) })),
        compte: compteDe.get(m.id) ?? 0,
        avis: (m.avis_fiche || []).slice().sort((a, b) => String(b.le).localeCompare(String(a.le))),
      };
    });
}

/** Pure : un avis de plus sur un transfert (le texte libre de l'équipe), le plus récent en tête ; vide : rien. */
export function ajouterAvis(avis = [], texte, { par = null, le = new Date().toISOString() } = {}) {
  const t = String(texte || '').trim().slice(0, 2000);
  if (!t) return avis;
  return [...avis, { texte: t, par, le }];
}

/**
 * Pure : le banc d'essai en texte, pour Claude (le bouton « Copier pour Claude ») : chaque transfert avec ce que la
 * machine a vu et ce qu'en dit l'équipe.
 */
export function enTexte(lignes = []) {
  const k = (n) => (n ? `${Math.round(n / 1000)} k€` : null);
  return lignes.map((l, i) => [
    `${i + 1}. ${String(l.le || '').slice(0, 10)} · transférée par ${l.par} · « ${l.objet} »${l.agent ? ` · agent : ${l.agent}` : ''}`,
    l.consigne ? `   Message : ${l.consigne.replace(/\s+/g, ' ').slice(0, 200)}` : null,
    `   Pièces : ${l.pieces.map((p) => `${p.nom}${p.lue ? ` (lue : ${p.lue.biens} bien${p.lue.biens > 1 ? 's' : ''}${p.lue.annonce ? `, annonce ${p.lue.annonce}` : ''})` : ''}`).join(' ; ') || 'aucune'}`,
    `   Machine : ${l.intention_libelle} ; ${l.compte} fiche${l.compte > 1 ? 's' : ''} comptée${l.compte > 1 ? 's' : ''}`,
    ...l.biens.map((b) => `     - ${b.adresse || 'adresse ?'}${b.prix ? `, ${k(b.prix)}` : ''}${b.loyer ? `, loyer ${k(b.loyer)}` : ''}${b.piece ? ` [${b.piece}]` : ''}`),
    ...l.dossiers.map((d) => `     - dossier « ${d.nom} » (${d.lots.length} lot${d.lots.length > 1 ? 's' : ''})`),
    l.deja.length ? `     - déjà en Mémoire : ${l.deja.map((b) => b.adresse).filter(Boolean).join(' ; ')}` : null,
    ...(l.avis.length ? l.avis.map((a) => `   Avis (${a.par || '?'}, ${String(a.le).slice(0, 10)}) : ${a.texte}`) : ['   Avis : aucun']),
  ].filter(Boolean).join('\n')).join('\n\n');
}
