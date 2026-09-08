// Les grilles de critères : Bail (et ses quittances), Copropriété (PV d'AG
// et RCP), Diagnostics. Une ligne par critère, avec une valeur simple au
// format voulu — « 3/6/9 classique », « du 18/05/2021 au 17/05/2030 »,
// « 26 400 € / an », « OUI / NON » — mise en forme par le modèle à partir de
// ce que la matrice a lu, puis des warnings décidés par le code sur des
// champs structurés. La citation exacte reste derrière la source.

import { Records } from '../db.js';
import { lireFiche, lireMatrice } from './matrice.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';

const val = (c) => (c && c.absent === false ? c.valeur : c?.valeur ?? null);
const eur = (v) => (v == null ? null : `${Math.round(v).toLocaleString('fr-FR')} €`);
const ouiNon = (b) => (b === true ? 'OUI' : b === false ? 'NON' : null);
const GROS_TRAVAUX = /\b606\b|gros ?œuvre|gros ?oeuvre|toiture|charpente|ravalement|façade|facade|étanchéité|etancheite|ascenseur|structure|fondation|mur(s)? porteur|chaufferie|colonne(s)? montante/i;

// --- Les grilles ------------------------------------------------------------------------
export const GRILLES = {
  bail: {
    titre: 'Bail',
    categories: ['Bail commercial', 'Avenants'],
    criteres: [
      { id: 'type_bail', libelle: 'Type de bail', champs: ['type_bail', 'duree'], format: 'Texte naturel court : « 3/6/9 classique », « 6 ans ferme », « dérogatoire 2 ans »…', regle: 'Warning si bail précaire ou dérogatoire, ou si tacite reconduction.' },
      { id: 'echeance', libelle: 'Échéance du bail', champs: ['dates_bail', 'duree'], format: '« du JJ/MM/AAAA au JJ/MM/AAAA » + « Bail 3/6/9 » ou « 6 ans ferme », « 9 ans ferme »… Si le bail est arrivé à échéance : depuis combien de temps il est en tacite reconduction.', regle: 'Date de début et date de fin.' },
      { id: 'parties', libelle: 'Les parties', champs: ['parties', 'creation'], format: '« SARL TARTANPION » + préciser si le locataire actuel est bien celui indiqué sur le bail.', regle: 'Warning si le locataire est une personne physique.' },
      { id: 'loyer_signature', libelle: 'Conditions financières — loyer de signature', champs: ['loyer'], format: '« XXXXX € / an »', regle: 'Warning si incohérence entre le loyer de signature et le loyer de la fiche commerciale, indexation en vigueur comprise.' },
      { id: 'conditions_exceptionnelles', libelle: 'Conditions financières exceptionnelles', champs: ['conditions_exceptionnelles'], format: 'Si franchise : « X mois de franchise de loyer ». Si paliers : « XXXX € / an pendant X ans ». Sinon « Aucune ».', regle: 'Warning si nous sommes encore dans la période de franchise ou de loyer par palier.' },
      { id: 'mode_reglement', libelle: 'Mode de règlement des loyers', champs: ['mode_reglement', 'loyer'], format: 'Libre, court : « mensuel, d\'avance, par virement ».', regle: 'Warning si écart entre la fréquence des quittances et les conditions du bail.' },
      { id: 'tva', libelle: 'Loyer assujetti à TVA', champs: ['tva_loyer', 'loyer'], format: '« OUI » ou « NON »', regle: 'Warning si le loyer n\'est pas assujetti à la TVA.' },
      { id: 'destination', libelle: 'Destination du bail', champs: ['destination'], format: 'Copier-coller des activités mentionnées dans le bail, ex. « Toutes activités de restauration à l\'exception de la vente à emporter ».', regle: 'Warning si toute activité autorisée.' },
      { id: 'cession', libelle: 'Conditions de cession', champs: ['cession'], format: 'Copier-coller des conditions de cession et de sous-location mentionnées dans le bail.', regle: 'Warning si sous-location autorisée.' },
      { id: 'indexation', libelle: 'Indexation', champs: ['indexation'], format: '« ILC / ICC / ILAT » + « TRIMESTRE ANNÉE » de l\'indice de base, ex. « ILC 1T 2024 ».', regle: 'Warning si absence de clause d\'indexation, ou indexation sur l\'ICC.' },
      { id: 'depot', libelle: 'Dépôt de garantie', champs: ['depot', 'loyer'], format: '« XXXX € » + « soit X mois du loyer de signature », ex. « 3 000 € soit 3 mois du loyer de signature ».', regle: 'Warning si moins d\'un mois de loyer de signature inscrit dans le bail.' },
      { id: 'pas_de_porte', libelle: 'Pas-de-porte', champs: ['pas_de_porte', 'loyer'], format: 'Si pas-de-porte : « XXXX € soit X mois du loyer de signature ». Sinon rien (la ligne ne s\'affiche pas).', regle: 'Information.', masquer_si_absent: true },
      { id: 'charges', libelle: 'Charges refacturées', champs: ['charges', 'charges_copro'], format: '« OUI » ou « NON » ; si OUI, lister les charges refacturées au locataire et celles restant au bailleur.', regle: 'Warning si les charges de copropriété ne peuvent pas être refacturées au locataire.' },
      { id: 'taxes', libelle: 'Taxes refacturées', champs: ['taxe_fonciere', 'charges'], format: '« OUI » ou « NON » ; si OUI, lister les taxes refacturées au locataire et celles restant au bailleur.', regle: 'Warning si la taxe foncière ne peut pas être refacturée au locataire.' },
    ],
    schema: {
      type_bail: { type: 'object', properties: { texte: { type: 'string' }, precaire: { type: 'boolean' }, tacite_reconduction: { type: 'boolean' } } },
      echeance: { type: 'object', properties: { texte: { type: 'string' }, debut: { type: 'string', description: 'JJ/MM/AAAA' }, fin: { type: 'string', description: 'JJ/MM/AAAA' }, type: { type: 'string' }, tacite_depuis_mois: { type: 'number', description: '0 si le bail court encore' } } },
      parties: { type: 'object', properties: { texte: { type: 'string' }, locataire: { type: 'string' }, personne_physique: { type: 'boolean' }, locataire_actuel_identique: { type: 'boolean' } } },
      loyer_signature: { type: 'object', properties: { texte: { type: 'string' }, annuel_ht: { type: 'number' } } },
      conditions_exceptionnelles: { type: 'object', properties: { texte: { type: 'string' }, presentes: { type: 'boolean' }, en_cours: { type: 'boolean', description: 'true si la franchise ou le palier court encore aujourd\'hui' } } },
      mode_reglement: { type: 'object', properties: { texte: { type: 'string' }, periodicite: { type: 'string', enum: ['mensuel', 'trimestriel', 'annuel', 'inconnu'] } } },
      tva: { type: 'object', properties: { oui: { type: 'boolean' } } },
      destination: { type: 'object', properties: { texte: { type: 'string' }, toute_activite: { type: 'boolean' } } },
      cession: { type: 'object', properties: { texte: { type: 'string' }, sous_location_autorisee: { type: 'boolean' } } },
      indexation: { type: 'object', properties: { texte: { type: 'string' }, indice: { type: 'string', enum: ['ILC', 'ICC', 'ILAT', 'autre', 'aucun'] }, absente: { type: 'boolean' } } },
      depot: { type: 'object', properties: { texte: { type: 'string' }, montant: { type: 'number' }, mois: { type: 'number' } } },
      pas_de_porte: { type: 'object', properties: { texte: { type: 'string' }, present: { type: 'boolean' }, montant: { type: 'number' }, mois: { type: 'number' } } },
      charges: { type: 'object', properties: { texte: { type: 'string' }, oui: { type: 'boolean' }, copro_refacturee: { type: 'boolean' }, locataire: { type: 'array', items: { type: 'string' } }, bailleur: { type: 'array', items: { type: 'string' } } } },
      taxes: { type: 'object', properties: { texte: { type: 'string' }, oui: { type: 'boolean' }, taxe_fonciere_refacturee: { type: 'boolean' }, locataire: { type: 'array', items: { type: 'string' } }, bailleur: { type: 'array', items: { type: 'string' } } } },
    },
  },
  quittances: {
    titre: 'Quittances',
    categories: ['Quittances'],
    criteres: [
      { id: 'loyer_hc_ht', libelle: 'Prix du loyer HC HT', champs: ['loyer', 'paiements'], format: '« XXXX € » par mois (ou par trimestre si les quittances sont trimestrielles).', regle: 'Warning si différent de la fiche commerciale.' },
      { id: 'provision', libelle: 'Provision pour charges et taxes', champs: ['provision_charges', 'charges'], format: '« XXXX € » si mentionnée, sinon « Non mentionnée ».', regle: 'Warning si différent de la fiche commerciale ou de la provision mentionnée au bail.' },
      { id: 'tva', libelle: 'Loyers assujettis à la TVA', champs: ['tva_loyer', 'loyer'], format: '« OUI » ou « NON »', regle: 'Warning si différent du bail.' },
    ],
    schema: {
      loyer_hc_ht: { type: 'object', properties: { texte: { type: 'string' }, montant: { type: 'number' }, periodicite: { type: 'string', enum: ['mensuel', 'trimestriel', 'annuel', 'inconnu'] } } },
      provision: { type: 'object', properties: { texte: { type: 'string' }, montant: { type: 'number' }, mentionnee: { type: 'boolean' } } },
      tva: { type: 'object', properties: { oui: { type: 'boolean' } } },
    },
  },
  pv_ag: {
    titre: "PV d'AG",
    categories: ["PV d'AG copro", 'Appels de charges'],
    criteres: [
      { id: 'travaux_votes', libelle: 'Travaux votés', champs: ['travaux_votes'], format: 'Les travaux votés relevant de l\'article 606, ex. « Ravalement voté 2024 ». Sinon « Aucun ».', regle: 'Warning si gros travaux relevant de l\'article 606.' },
      { id: 'travaux_discussion', libelle: 'Travaux en discussion', champs: ['travaux_discussion'], format: 'Libre, court.', regle: 'Warning si gros travaux (article 606) non votés ou reportés.' },
      { id: 'resolutions_non_votees', libelle: 'Résolutions non votées', champs: ['resolutions_non_votees'], format: 'Dire si des travaux non votés reviennent chaque année, surtout ceux qui touchent la trésorerie du bailleur.', regle: 'Warning si des gros travaux (article 606) reviennent de manière récurrente sans être votés.' },
      { id: 'impayes', libelle: 'Impayés au sein de la copropriété', champs: ['impayes_copro', 'procedures'], format: '« OUI » ou « NON »', regle: 'Warning si impayés dans la copropriété.' },
    ],
    schema: {
      travaux_votes: { type: 'object', properties: { texte: { type: 'string' }, article_606: { type: 'boolean' } } },
      travaux_discussion: { type: 'object', properties: { texte: { type: 'string' }, article_606: { type: 'boolean' }, non_votes_ou_reportes: { type: 'boolean' } } },
      resolutions_non_votees: { type: 'object', properties: { texte: { type: 'string' }, recurrentes: { type: 'boolean' }, article_606: { type: 'boolean' } } },
      impayes: { type: 'object', properties: { texte: { type: 'string' }, oui: { type: 'boolean' } } },
    },
  },
  rcp: {
    titre: 'RCP',
    categories: ['Règlement de copropriété', 'EDD'],
    criteres: [
      { id: 'activites_autorisees', libelle: 'Activités autorisées', champs: ['activites_autorisees', 'restrictions'], format: 'Mention des activités autorisées, telles que le règlement les écrit.', regle: 'Information.' },
      { id: 'activites_interdites', libelle: 'Activités non autorisées', champs: ['activites_interdites', 'restrictions'], format: 'Mention des activités non autorisées, telles que le règlement les écrit. Sinon « Aucune ».', regle: 'S\'il y en a, il faut le savoir.' },
      { id: 'quote_part', libelle: 'Quote-part & tantièmes', champs: ['quote_part', 'tantiemes'], format: '« XX,X % » (la part du bailleur dans la copropriété) + les tantièmes, ex. « 8,97 % (910/10 150) ».', regle: 'Warning si supérieure à 20 %.' },
    ],
    schema: {
      activites_autorisees: { type: 'object', properties: { texte: { type: 'string' } } },
      activites_interdites: { type: 'object', properties: { texte: { type: 'string' }, presentes: { type: 'boolean' } } },
      quote_part: { type: 'object', properties: { texte: { type: 'string' }, pct: { type: 'number' } } },
    },
  },
  diagnostics: {
    titre: 'Diagnostics',
    categories: ['Diagnostics'],
    criteres: [
      { id: 'dtg', libelle: 'DTG', champs: ['dtg', 'diagnostics'], format: 'Liste de l\'état des lieux du bâtiment et des travaux conseillés.', regle: 'Warning si travaux lourds relevant de l\'article 606 identifiés.' },
      { id: 'dpe', libelle: 'DPE', champs: ['dpe', 'diagnostics'], format: '« A / B / C… »', regle: 'Information.' },
      { id: 'amiante', libelle: 'Amiante', champs: ['amiante', 'diagnostics'], format: '« Présence d\'amiante dans … » + niveau « Évaluation périodique / Niveau 1 / Niveau 2 / Niveau 3 ». Sinon « Absence ».', regle: 'Warning si niveau 2 ou 3 de dégradation.' },
      { id: 'erp', libelle: 'ERP', champs: ['erp', 'diagnostics'], format: 'Les risques recensés, court.', regle: 'Information.' },
      { id: 'termites', libelle: 'Termites', champs: ['termites', 'diagnostics'], format: '« OUI » ou « NON » (présence)', regle: 'Warning si présence de termites.' },
      { id: 'plomb', libelle: 'Plomb', champs: ['plomb', 'diagnostics'], format: '« OUI » ou « NON » (présence)', regle: 'Warning si présence de plomb.' },
      { id: 'electricite', libelle: 'Électricité', champs: ['electricite', 'diagnostics'], format: '« Date du rapport de conformité » + conforme ou non.', regle: 'Warning si non-conformité détectée dans le document.' },
    ],
    schema: {
      dtg: { type: 'object', properties: { texte: { type: 'string' }, travaux_606: { type: 'boolean' } } },
      dpe: { type: 'object', properties: { texte: { type: 'string' }, classe: { type: 'string' } } },
      amiante: { type: 'object', properties: { texte: { type: 'string' }, presence: { type: 'boolean' }, niveau: { type: 'string', enum: ['evaluation_periodique', 'niveau_1', 'niveau_2', 'niveau_3', 'inconnu'] } } },
      erp: { type: 'object', properties: { texte: { type: 'string' } } },
      termites: { type: 'object', properties: { texte: { type: 'string' }, presence: { type: 'boolean' } } },
      plomb: { type: 'object', properties: { texte: { type: 'string' }, presence: { type: 'boolean' } } },
      electricite: { type: 'object', properties: { texte: { type: 'string' }, date: { type: 'string' }, non_conforme: { type: 'boolean' } } },
    },
  },
};

// --- Ce que la matrice a lu, champ par champ, pour les pièces d'une grille --------------
function matiere(m, f, grille) {
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const ids = [...new Set(grille.criteres.flatMap((c) => c.champs))];
  const lignes = m.lignes.filter((l) => !l.perime);
  const parChamp = {};
  for (const id of ids) {
    const reponses = lignes.filter((l) => l.cellules?.[id]?.reponse).map((l) => ({ document: l.document_nom, categorie: l.categorie, page: l.cellules[id].page, reponse: l.cellules[id].reponse }));
    // Les pièces de la grille d'abord, mais tout ce qui répond compte.
    reponses.sort((a, b) => (grille.categories.includes(b.categorie) ? 1 : 0) - (grille.categories.includes(a.categorie) ? 1 : 0));
    parChamp[id] = { question: champs.get(id)?.question || id, retenue: champs.get(id)?.valeur || null, reponses };
  }
  return { parChamp, lu: ids.filter((id) => lignes.some((l) => l.cellules && Object.prototype.hasOwnProperty.call(l.cellules, id))) };
}

function empreinte(m, brut, id) {
  return `${m.gabarit.version}|${brut.matrice?.rempli_le || ''}|${JSON.stringify(brut.matrice?.forcages || {})}|${id}|${m.lignes.length}`;
}

/** Les valeurs formatées d'une grille, mises en cache sur le dossier tant que la lecture ne change pas. */
export async function formaterGrille(dealId, id, { user, force = false } = {}) {
  const grille = GRILLES[id];
  if (!grille) return null;
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return null;
  const m = lireMatrice(dealId);
  const f = lireFiche(dealId);
  const cle = empreinte(m, brut, id);
  const cache = brut.grilles_formatees?.[id];
  if (!force && cache && cache.cle === cle) return cache.valeurs;
  const { parChamp, lu } = matiere(m, f, grille);
  if (!lu.length) return null;
  const lot = brut.lots?.[0]?.lot || {};
  const contexte = { loyer_fiche_commerciale_ht_an: val(lot.loyer_annuel_ht_hc), surface_fiche: val(lot.surface_m2), locataire_fiche: val(lot.locataire_nom), date_du_jour: new Date().toISOString().slice(0, 10) };
  const consigne = `Tu mets en forme, pour l'équipe Klocka, ce que la lecture des pièces a trouvé. Une valeur simple par critère, au format demandé, en français. Jamais de citation : ce qui est demandé est ce que c'est, pas le texte de la pièce. Si rien ne répond, texte vide et champs à null. Ne devine rien. Dates au format JJ/MM/AAAA. Aujourd'hui : ${contexte.date_du_jour}.`;
  const criteres = grille.criteres.map((c) => `- ${c.id} (${c.libelle}) — format : ${c.format}\n  champs lus : ${c.champs.map((ch) => `${ch} = ${JSON.stringify(parChamp[ch]?.retenue || null)}${parChamp[ch]?.reponses?.length > 1 ? ` ; autres pièces : ${JSON.stringify(parChamp[ch].reponses.slice(1, 4).map((r) => `${r.document} : ${r.reponse}`))}` : ''}`).join('\n  ')}`).join('\n');
  const schema = { type: 'object', properties: grille.schema, required: Object.keys(grille.schema) };
  const { resultat } = await mesurer({ operation: `grille ${grille.titre}`, par: user?.email || null, sur: dealId }, () => invokeLLM({
    prompt: `${consigne}\n\nContexte de la fiche commerciale : ${JSON.stringify(contexte)}\n\nCritères :\n${criteres}\n\nRéponds en JSON, une clé par critère.`,
    response_json_schema: schema,
  }));
  const valeurs = resultat && typeof resultat === 'object' ? resultat : {};
  Records.update('Deal', brut.id, { grilles_formatees: { ...(brut.grilles_formatees || {}), [id]: { cle, le: new Date().toISOString(), valeurs } } });
  return valeurs;
}

// --- Les warnings, décidés par le code -----------------------------------------------------
function warnings(id, cid, x, ctx) {
  const w = (motif) => ({ statut: 'warning', motif });
  if (!x) return null;
  switch (`${id}.${cid}`) {
    case 'bail.type_bail': if (x.precaire) return w('Bail précaire ou dérogatoire.'); if (x.tacite_reconduction) return w('Tacite reconduction prévue.'); return null;
    case 'bail.parties': if (x.personne_physique) return w('Le locataire est une personne physique.'); if (x.locataire_actuel_identique === false) return { statut: 'a_verifier', motif: 'Le locataire actuel n\'est pas celui du bail.' }; return null;
    case 'bail.loyer_signature': {
      const fiche = ctx.loyer_fiche; const bail = x.annuel_ht;
      if (fiche && bail) { const annees = ctx.debut ? Math.max(0, (Date.now() - ctx.debut) / (365.25 * 86400000)) : 0; const indexe = bail * Math.pow(1.02, annees); const ecart = Math.abs(fiche - indexe) / indexe; if (ecart > 0.05) return { ...w(`Écart de ${(ecart * 100).toFixed(0)} % avec la fiche commerciale (${eur(fiche)}), indexation ~2 %/an comprise.`), details: [{ libelle: 'Fiche commerciale', valeur: `${eur(fiche)} / an` }, { libelle: 'Loyer de signature (bail)', valeur: `${eur(bail)} / an` }, { libelle: `Loyer indexé (~2 %/an sur ${annees.toFixed(1)} an)`, valeur: `${eur(indexe)} / an` }] }; }
      return null;
    }
    case 'bail.conditions_exceptionnelles': if (x.presentes && x.en_cours) return w('Franchise ou paliers encore en cours.'); return null;
    case 'bail.mode_reglement': if (ctx.periodicite_quittances && x.periodicite && x.periodicite !== 'inconnu' && ctx.periodicite_quittances !== 'inconnu' && ctx.periodicite_quittances !== x.periodicite) return w(`Quittances ${ctx.periodicite_quittances}les, bail ${x.periodicite}.`); if (!ctx.a_quittances) return { statut: 'a_verifier', motif: 'Aucune quittance dans la data room pour vérifier la fréquence.' }; return null;
    case 'bail.tva': if (x.oui === false) return w('Loyer non assujetti à la TVA.'); return null;
    case 'bail.destination': if (x.toute_activite) return w('Toute activité autorisée.'); return null;
    case 'bail.cession': if (x.sous_location_autorisee) return w('Sous-location autorisée.'); return null;
    case 'bail.indexation': if (x.absente || x.indice === 'aucun') return w('Aucune clause d\'indexation.'); if (x.indice === 'ICC') return w('Indexation sur l\'ICC.'); return null;
    case 'bail.depot': if (x.mois != null && x.mois < 1) return w('Moins d\'un mois de loyer de signature.'); if (x.montant == null && x.texte === '') return null; return null;
    case 'bail.charges': if (x.copro_refacturee === false) return w('Les charges de copropriété ne sont pas refacturables au locataire.'); return null;
    case 'bail.taxes': if (x.taxe_fonciere_refacturee === false) return w('La taxe foncière n\'est pas refacturable au locataire.'); return null;
    case 'quittances.loyer_hc_ht': {
      const fiche = ctx.loyer_fiche; const mont = x.montant;
      if (fiche && mont) { const annuel = x.periodicite === 'trimestriel' ? mont * 4 : x.periodicite === 'annuel' ? mont : mont * 12; if (Math.abs(annuel - fiche) / fiche > 0.05) return { ...w(`${eur(annuel)}/an sur quittances contre ${eur(fiche)} sur la fiche commerciale.`), details: [{ libelle: 'Fiche commerciale', valeur: `${eur(fiche)} / an` }, { libelle: 'Quittances', valeur: `${eur(mont)} ${x.periodicite === 'trimestriel' ? 'par trimestre' : 'par mois'} · ${eur(annuel)} / an` }] }; }
      return null;
    }
    case 'quittances.provision': if (x.mentionnee && ctx.provision_bail && x.montant && Math.abs(x.montant - ctx.provision_bail) / ctx.provision_bail > 0.1) return { ...w(`Provision ${eur(x.montant)} contre ${eur(ctx.provision_bail)} au bail.`), details: [{ libelle: 'Bail', valeur: eur(ctx.provision_bail) }, { libelle: 'Quittances', valeur: eur(x.montant) }] }; return null;
    case 'quittances.tva': if (ctx.tva_bail != null && x.oui != null && x.oui !== ctx.tva_bail) return w(`Quittances ${x.oui ? 'avec' : 'sans'} TVA, bail ${ctx.tva_bail ? 'avec' : 'sans'}.`); return null;
    case 'pv_ag.travaux_votes': if (x.article_606) return w('Gros travaux votés relevant de l\'article 606.'); return null;
    case 'pv_ag.travaux_discussion': if (x.article_606 && (x.non_votes_ou_reportes ?? true)) return w('Gros travaux (article 606) non votés ou reportés.'); return null;
    case 'pv_ag.resolutions_non_votees': if (x.recurrentes && x.article_606) return w('Des gros travaux (article 606) reviennent sans être votés.'); if (x.recurrentes) return { statut: 'a_verifier', motif: 'Des résolutions reviennent d\'une assemblée à l\'autre.' }; return null;
    case 'pv_ag.impayes': if (x.oui) return w('Impayés au sein de la copropriété.'); return null;
    case 'rcp.activites_interdites': if (x.presentes) return { statut: 'a_verifier', motif: 'Des activités sont interdites : à confronter à celle du preneur.' }; return null;
    case 'rcp.quote_part': if (x.pct != null && x.pct > 20) return w('Le bailleur détient plus de 20 % de la copropriété.'); return null;
    case 'diagnostics.dtg': if (x.travaux_606) return w('Travaux lourds relevant de l\'article 606 identifiés.'); return null;
    case 'diagnostics.amiante': if (x.presence && (x.niveau === 'niveau_2' || x.niveau === 'niveau_3')) return w(`Amiante en ${x.niveau.replace('_', ' ')} de dégradation.`); return null;
    case 'diagnostics.termites': if (x.presence) return w('Présence de termites.'); return null;
    case 'diagnostics.plomb': if (x.presence) return w('Présence de plomb.'); return null;
    case 'diagnostics.electricite': if (x.non_conforme) return w('Non-conformité électrique relevée.'); return null;
    default: return null;
  }
}

function texteDe(id, cid, x) {
  if (!x) return null;
  const t = (x.texte || '').trim();
  switch (`${id}.${cid}`) {
    case 'bail.tva': case 'quittances.tva': return ouiNon(x.oui) || t || null;
    case 'pv_ag.impayes': return ouiNon(x.oui) || t || null;
    case 'diagnostics.termites': case 'diagnostics.plomb': return x.presence == null ? (t || null) : `${ouiNon(x.presence)}${t ? ` — ${t}` : ''}`;
    case 'diagnostics.dpe': return x.classe || t || null;
    case 'bail.charges': case 'bail.taxes': {
      if (x.oui == null && !t) return null;
      const o = ouiNon(x.oui);
      const liste = (titre, items) => ((items || []).length ? `${titre} :\n${items.map((i) => `- ${String(i).trim()}`).join('\n')}` : '');
      const l = liste('Locataire', x.locataire);
      const b = liste('Bailleur', x.bailleur);
      return [o ? `${o}${l ? ' · ' : ''}` : '', l, b].filter(Boolean).join(o && l ? '' : '\n').replace(/ · \n?Locataire/, ' · Locataire') || t;
    }
    case 'bail.depot': return t || (x.montant != null ? `${eur(x.montant)}${x.mois != null ? ` soit ${Number(x.mois).toFixed(x.mois % 1 ? 1 : 0)} mois du loyer de signature` : ''}` : null);
    case 'bail.pas_de_porte': if (x.present === false) return null; return t || (x.montant != null ? `${eur(x.montant)}${x.mois != null ? ` soit ${x.mois} mois du loyer de signature` : ''}` : null);
    case 'bail.loyer_signature': return t || (x.annuel_ht != null ? `${eur(x.annuel_ht)} / an` : null);
    case 'rcp.quote_part': return t || (x.pct != null ? `${Number(x.pct).toFixed(1).replace('.', ',')} %` : null);
    default: return t || null;
  }
}

/** Une grille lue : lignes formatées, statuts, sources, résumé. */
export async function lireGrilleFormatee(dealId, id, { user, force = false } = {}) {
  const grille = GRILLES[id];
  if (!grille) return null;
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return null;
  const m = lireMatrice(dealId);
  const f = lireFiche(dealId);
  const { parChamp, lu } = matiere(m, f, grille);
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const preuvesDe = (ids) => ids.flatMap((x) => (champs.get(x)?.preuves || []).map((p) => ({ champ: x, document_id: p.document_id, document_nom: p.document_nom, document_url: p.document_url, page: p.page, citation: p.citation, reponse: p.reponse })));
  const valeurs = lu.length ? (await formaterGrille(dealId, id, { user, force })) || {} : {};
  // Le contexte des règles : fiche commerciale, bail, quittances.
  const lot = brut.lots?.[0]?.lot || {};
  const bailValeurs = id === 'quittances' ? ((await formaterGrille(dealId, 'bail', { user })) || {}) : valeurs;
  const quittancesLignes = m.lignes.filter((l) => !l.perime && /quittance/i.test(l.categorie || ''));
  const texteQ = quittancesLignes.map((l) => `${l.cellules?.paiements?.reponse || ''} ${l.cellules?.loyer?.reponse || ''} ${l.cellules?.mode_reglement?.reponse || ''}`).join(' ');
  const periodiciteQ = !quittancesLignes.length ? null : /trimestr/i.test(texteQ) ? 'trimestriel' : /mensuel|mois|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre/i.test(texteQ) ? 'mensuel' : 'inconnu';
  const debutBail = bailValeurs?.echeance?.debut ? Date.parse(bailValeurs.echeance.debut.split('/').reverse().join('-')) : null;
  const ctx = { loyer_fiche: val(lot.loyer_annuel_ht_hc), debut: debutBail, a_quittances: quittancesLignes.length > 0, periodicite_quittances: periodiciteQ, tva_bail: bailValeurs?.tva?.oui ?? null, provision_bail: null };
  const cache = brut.grilles_formatees?.[id];

  const lignes = grille.criteres.map((c) => {
    const x = valeurs[c.id];
    const estLu = c.champs.some((ch) => lu.includes(ch));
    const valeur = texteDe(id, c.id, x);
    let statut = !estLu ? 'non_lu' : valeur ? 'ok' : 'vide';
    let motif = null;
    let details = null;
    if (estLu && valeur) { const r = warnings(id, c.id, x, ctx); if (r) { statut = r.statut; motif = r.motif; details = r.details || null; } }
    if (statut === 'vide') motif = 'Aucune pièce ne répond.';
    if (statut === 'non_lu') motif = 'Question pas encore lue.';
    const correction = brut.grilles_valeurs?.[`${id}.${c.id}`] || null;
    if (correction?.valeur) { valeur = correction.valeur; if (statut === 'vide' || statut === 'non_lu') { statut = 'ok'; motif = null; } }
    const statutCalcule = statut;
    const decision = brut.grilles_statuts?.[`${id}.${c.id}`] || null;
    if (decision?.statut) statut = decision.statut;
    const masquee = c.masquer_si_absent && (!x || x.present === false || !valeur);
    return { id: c.id, libelle: c.libelle, regle: c.regle, format: c.format, valeur, valeur_lue: texteDe(id, c.id, x), correction, statut, statut_calcule: statutCalcule, decision, motif, details, masquee, preuves: preuvesDe(c.champs).slice(0, 6) };
  }).filter((l) => !l.masquee);
  const nb = (s) => lignes.filter((l) => l.statut === s).length;
  return { id, titre: grille.titre, lignes, resume: { ok: nb('ok'), warning: nb('warning'), a_verifier: nb('a_verifier'), no_go: nb('no_go'), vide: nb('vide'), non_lu: nb('non_lu') }, formatee_le: cache?.le || null, remplissage: m.remplissage, non_lues: grille.criteres.flatMap((c) => c.champs).filter((ch) => !lu.includes(ch)).length };
}

/** Les questions du gabarit jamais lues sur ce dossier. */
export function colonnesNonLues(dealId) {
  const m = lireMatrice(dealId);
  if (!m || !m.lignes.length) return [];
  return m.colonnes.filter((c) => !m.lignes.some((l) => l.cellules && Object.prototype.hasOwnProperty.call(l.cellules, c.id))).map((c) => c.id);
}

/** Le statut décidé à la main sur un critère : ok, a_verifier, no_go, ou rien (retour au calcul). */
export function deciderStatut(dealId, grilleId, critereId, statut, user) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  if (statut && !['ok', 'a_verifier', 'no_go'].includes(statut)) return { ok: false, error: 'Statut inconnu' };
  const cle = `${grilleId}.${critereId}`;
  const statuts = { ...(brut.grilles_statuts || {}) };
  if (statut) statuts[cle] = { statut, par: user?.email || null, le: new Date().toISOString() };
  else delete statuts[cle];
  Records.update('Deal', brut.id, { grilles_statuts: statuts });
  return { ok: true };
}

/** La valeur corrigée à la main d'un critère ; vide pour revenir à la valeur lue. */
export function corrigerValeur(dealId, grilleId, critereId, valeur, user) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const cle = `${grilleId}.${critereId}`;
  const valeurs = { ...(brut.grilles_valeurs || {}) };
  const v = String(valeur || '').trim().slice(0, 2000);
  if (v) valeurs[cle] = { valeur: v, par: user?.email || null, le: new Date().toISOString() };
  else delete valeurs[cle];
  Records.update('Deal', brut.id, { grilles_valeurs: valeurs });
  return { ok: true };
}
