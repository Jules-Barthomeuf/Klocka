// L'analyse de la data room en trois étapes de lecture.
//
// Étape 1 — Bail et locataire : bail, avenants, quittances, Kbis sont lus
// d'abord. L'écran dit ce qu'est le bien en dix lignes, la rentabilité réelle
// calculée par le code, les écarts avec le teaser, les deal-breakers, les
// points notables, et les pièces qu'il faudra pour l'étape 2.
// Étape 2 — Immeuble et copropriété. Étape 3 — Prix et négociation.

import { Records } from '../db.js';
import { lireMatrice, lireFiche, lancerRemplissage } from './matrice.js';
import { montants, surfaces, dates, loyerAnnuel } from './dossier-lecture.js';
import { calculerAEM } from './aem.js';
import { REGLES } from './enrich.js';

export const ETAPES = [
  { n: 1, titre: 'Bail et locataire', categories: ['Bail commercial', 'Avenants', 'Quittances', 'Kbis', "PV d'AG preneur"] },
  { n: 2, titre: 'Immeuble et copropriété', categories: ['Règlement de copropriété', 'EDD', "PV d'AG copro", 'Appels de charges', 'Diagnostics', 'Plans & Carrez', 'Taxe foncière', 'Acte', 'Autre'] },
  { n: 3, titre: 'Prix et négociation', categories: [] },
];

const val = (c) => (c && c.absent === false ? c.valeur : c?.valeur ?? null);
const eur = (v) => (v == null ? null : `${Math.round(v).toLocaleString('fr-FR')} €`);
const court = (t, n = 110) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const coupe = s.slice(0, n); return `${coupe.slice(0, Math.max(coupe.lastIndexOf(' '), 60))}…`; };
const activite = (t) => court(String(t || '').replace(/^\s*destination\s*(exclusive|principale)?\s*[:—-]\s*/i, '').replace(/^\s*(commerce|activité)\s+de\s+/i, ''), 60);
const negation = (t) => /^\s*(non\b|aucun|pas de|néant|absent|sans )|non (etabli|établi|mentionn|précisé|renseigné)|ne figure pas|n'est pas (mentionn|précisé|indiqué)|aucune (caution|garantie)/i.test(String(t || ''));

/** Documents du dossier, lus ou non, par catégorie. */
function inventaire(brut, m) {
  const lus = new Set(m.lignes.map((l) => l.document_id));
  return (brut.documents_espace || []).map((d) => ({ id: d.id, nom: d.nom, categorie: d.categorie || 'Autre', lu: lus.has(d.id) }));
}

/** Lance la lecture des pièces de l'étape n (celles qui ne sont pas encore lues). */
export function lancerEtape(dealId, n, { user, uploadDir } = {}) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const m = lireMatrice(dealId);
  const etape = ETAPES.find((e) => e.n === Number(n)) || ETAPES[0];
  const docs = inventaire(brut, m).filter((d) => !d.lu && (etape.n >= 3 || etape.categories.includes(d.categorie)));
  Records.update('Deal', brut.id, { analyse_etape: etape.n });
  if (!docs.length) return { ok: true, etape: etape.n, rien_a_lire: true };
  const t = lancerRemplissage(dealId, { user, uploadDir, seulementDocuments: docs.map((d) => d.id) });
  return { ok: true, etape: etape.n, remplissage: t, documents: docs.length };
}

/** Le preneur, extrait de la ligne « Parties ». */
function preneurDe(texte) {
  const t = String(texte || '');
  const m = t.match(/preneur\s*[:—-]\s*(?:la\s+)?(?:société\s+)?([^,;.(]{3,60})/i);
  return m ? m[1].trim() : null;
}

export function lireEtape1(dealId) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return null;
  const m = lireMatrice(dealId);
  const f = lireFiche(dealId);
  const docs = inventaire(brut, m);
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const ch = (id) => champs.get(id);
  const v = (id) => ch(id)?.valeur || null;
  const src = (id) => { const p = ch(id)?.preuves?.[0]; return p ? { document_id: p.document_id, document_nom: p.document_nom, document_url: p.document_url, page: p.page, citation: p.citation } : null; };
  const lot = brut.lots?.[0] || null;
  const teaser = lot?.lot || {};
  const ville = lot?.enrichissement?.commune?.nom || val(teaser.adresse)?.ville || null;
  const etapeCourante = Number(brut.analyse_etape) || 1;
  const etape1 = ETAPES[0];
  const lusEtape1 = docs.filter((d) => d.lu && etape1.categories.includes(d.categorie)).length;
  const presentsEtape1 = docs.filter((d) => etape1.categories.includes(d.categorie)).length;
  const lue = m.lignes.length > 0;

  // --- Bloc 1 : le bien en dix lignes --------------------------------------------------
  const loyer = loyerAnnuel(v('loyer') || '') || null;
  const capital = montants(v('capital') || '')[0]?.valeur ?? null;
  const depot = montants(v('depot') || '')[0]?.valeur ?? null;
  const datesBail = dates(v('dates_bail') || '');
  const debutBail = datesBail[0]?.iso || null;
  const finBail = datesBail.length ? datesBail[datesBail.length - 1].iso : null;
  const dureeMatch = String(v('duree') || '').match(/(\d{1,2})\s*(?:\(\w+\)\s*)?an/i);
  const dureeAns = dureeMatch ? Number(dureeMatch[1]) : null;
  const ferme = /ferme|sans faculté|écartée|exclue/i.test(String(v('resiliation') || '') + String(v('duree') || ''));
  const preneur = preneurDe(v('parties')) || val(teaser.locataire_nom) || null;
  const creation = dates(v('creation') || '')[0] || null;
  const dirigeants = court(v('dirigeants'), 70);
  const cautionAbsente = !v('caution') || negation(v('caution'));
  const avenants = docs.some((d) => d.categorie === 'Avenants');
  const fr = (iso) => (iso ? iso.split('-').reverse().join('/') : null);

  const fiche = {
    titre: [preneur ? preneur.replace(/\s+(SAS|SARL|SA|SCI|EURL|SASU)\b.*$/i, '') : (lot?.synthese?.titre || brut.nom || 'Bien'), ville].filter(Boolean).join(' — '),
    adresse: { valeur: court(v('adresse'), 140) || [val(teaser.adresse)?.rue, val(teaser.adresse)?.code_postal, ville].filter(Boolean).join(', ') || null, source: src('adresse') },
    lignes: [
      { id: 'locataire', libelle: 'Locataire', valeur: [preneur, activite(v('destination'))].filter(Boolean).join(' · ') || null, detail: [creation ? `Créée le ${fr(creation.iso)}` : null, capital != null ? `capital ${eur(capital)}` : null, dirigeants || null].filter(Boolean).join(' · ') || null, source: src('parties') || src('creation') },
      { id: 'bail', libelle: 'Bail', valeur: [`Commercial`, dureeAns ? `${dureeAns} ans${ferme ? ' ferme' : ''}` : null, debutBail && finBail ? `du ${fr(debutBail)} au ${fr(finBail)}` : finBail ? `jusqu'au ${fr(finBail)}` : null].filter(Boolean).join(' · '), source: src('dates_bail') || src('duree') },
      { id: 'loyer', libelle: 'Loyer', valeur: loyer ? `${eur(loyer)} HT/an · ${eur(loyer / 12)}/mois` : court(v('loyer')), source: src('loyer') },
      { id: 'charges', libelle: 'Charges', valeur: court(v('charges'), 120), source: src('charges') },
      { id: 'depot', libelle: 'Dépôt', valeur: depot != null ? `${eur(depot)}${loyer ? ` · ${Math.round(depot / (loyer / 12))} mois de loyer HT` : ''}` : court(v('depot')), source: src('depot') },
      { id: 'caution', libelle: 'Caution', valeur: cautionAbsente ? 'Aucune' : court(v('caution')), source: src('caution') },
      { id: 'indexation', libelle: 'Indexation', valeur: court(v('indexation'), 120), source: src('indexation') },
    ].filter((l) => l.valeur),
  };

  // --- Bloc 2 : la rentabilité réelle ----------------------------------------------------
  const prixFai = val(teaser.prix_fai) ?? null;
  const chargesNonRecup = montants(v('charges_non_recup') || '')[0]?.valeur ?? 0;
  const taxeRefacturee = /preneur|locataire/i.test(String(v('taxe_fonciere') || '')) || /taxe fonci/i.test(String(v('charges') || ''));
  const taxe = taxeRefacturee ? 0 : montants(v('taxe_fonciere') || '')[0]?.valeur ?? 0;
  const aem = prixFai && loyer ? calculerAEM({ prixFai, loyerAnnuel: loyer }) : null;
  const rendementTeaser = val(teaser.rendement_annonce) ?? (lot?.evaluation?.aem?.rendement_aem ?? null);
  const aemTeaser = lot?.evaluation?.aem || null;
  const loyerNet = loyer ? loyer - chargesNonRecup - taxe : null;
  const rendementNet = aem && loyerNet ? (loyerNet / aem.prix_aem) * 100 : null;
  const seuil = lot?.evaluation?.profil?.criteres?.find?.((k) => k.champ === 'rendement_aem')?.valeur
    ?? (REGLES.profils?.liste || []).filter((p) => p.actif).map((p) => p.criteres?.find((k) => k.champ === 'rendement_aem')?.valeur).filter(Boolean).sort((a, b) => a - b)[0] ?? 6.5;
  let phrase = null;
  let cible = null;
  if (aem) {
    const brutAem = aem.rendement_aem;
    const delta = aemTeaser ? (brutAem - aemTeaser.rendement_aem) : null;
    const net = rendementNet != null ? Number(rendementNet.toFixed(2)) : brutAem;
    const dansCriteres = net >= Number(seuil);
    if (dansCriteres) {
      phrase = `Le rendement brut AEM est de ${brutAem.toFixed(2)} %${delta != null ? `, soit ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)} pt par rapport au teaser (${aemTeaser.rendement_aem.toFixed(2)} %)` : ''}. ${rendementNet != null ? `Le rendement net AEM après charges non récupérables est de ${net.toFixed(2)} %. ` : ''}Le seuil minimum est de ${Number(seuil).toFixed(2)} %. Le deal reste dans les critères.`;
    } else {
      const prixAemCible = (loyerNet || loyer) / (Number(seuil) / 100);
      const prixFaiCible = prixFai * (prixAemCible / aem.prix_aem);
      cible = { prix_aem: Math.round(prixAemCible), prix_fai: Math.round(prixFaiCible) };
      phrase = `Le rendement net AEM est de ${net.toFixed(2)} %. Le seuil minimum est de ${Number(seuil).toFixed(2)} %. Le deal sort des critères. Pour revenir au seuil, le prix AEM devrait baisser à ${eur(prixAemCible)}, soit un prix FAI d'environ ${eur(prixFaiCible)}.`;
    }
  } else if (loyer && !prixFai) {
    phrase = `Loyer du bail : ${eur(loyer)} HT/an. Le prix de vente n'est pas connu : la rentabilité se calculera dès qu'il sera renseigné.`;
  }
  const rentabilite = {
    prix_fai: prixFai, prix_aem: aem?.prix_aem ?? null, loyer_bail: loyer, charges_non_recup: chargesNonRecup || null, taxe_fonciere_bailleur: taxe || null,
    rendement_brut_aem: aem?.rendement_aem ?? null, rendement_net_aem: rendementNet != null ? Number(rendementNet.toFixed(2)) : null,
    rendement_teaser: rendementTeaser != null ? Number(Number(rendementTeaser).toFixed(2)) : null, seuil: Number(seuil), dans_criteres: aem ? (rendementNet ?? aem.rendement_aem) >= Number(seuil) : null,
    phrase, cible,
  };

  // --- Bloc 3 : écarts teaser → bail, seulement ce qui a bougé ----------------------------
  const ecarts = [];
  const surfaceBail = surfaces(v('surface') || '')[0]?.valeur ?? null;
  const surfaceTeaser = val(teaser.surface_m2);
  const pousser = (libelle, t, b, commentaire) => { if (b == null) return; if (t == null) ecarts.push({ libelle, teaser: null, bail: b, commentaire: 'Non annoncé dans le teaser. Maintenant connu.' }); else if (String(t) !== String(b)) ecarts.push({ libelle, teaser: t, bail: b, commentaire }); };
  if (surfaceBail != null) pousser('Surface', surfaceTeaser != null ? `${surfaceTeaser} m²` : null, `${surfaceBail} m²`, surfaceTeaser && Math.abs(surfaceBail - surfaceTeaser) / surfaceTeaser > 0.03 ? 'Écart significatif : le bail ne porte pas sur la même surface que le teaser.' : 'Écart mineur.');
  if (loyer) pousser('Loyer', val(teaser.loyer_annuel_ht_hc) != null ? `${eur(val(teaser.loyer_annuel_ht_hc))}/an` : null, `${eur(loyer)}/an`, Math.abs(loyer - (val(teaser.loyer_annuel_ht_hc) || loyer)) / loyer > 0.05 ? 'Écart significatif sur le loyer.' : 'Écart mineur (indexation).');
  if (preneur) pousser('Locataire', val(teaser.locataire_nom) || null, preneur, 'Le nom diffère du teaser.');
  if (finBail) { const annee = Number(finBail.slice(0, 4)); const t = Number(String(val(teaser.bail_echeance) || '').match(/\d{4}/)?.[0]) || null; pousser('Échéance du bail', t, annee, 'L\'échéance du bail diffère de celle annoncée.'); }
  if (v('destination')) pousser('Activité', val(teaser.locataire_activite) || null, activite(v('destination')), 'L\'activité au bail diffère de celle annoncée.');
  const ecartsSignificatifs = ecarts.filter((e) => e.teaser != null && /significatif|diffère/.test(e.commentaire));

  // --- Bloc 4 : deal-breakers -------------------------------------------------------------
  const db = [];
  const typeBail = `${v('duree') || ''} ${v('dates_bail') || ''} ${String(val(teaser.bail_type) || '')}`;
  const derogatoire = /dérogatoire|derogatoire|précaire|precaire|courte durée/i.test(typeBail);
  db.push(derogatoire ? { ok: false, gravite: 'dur', libelle: 'Bail dérogatoire ou précaire', detail: court(v('duree'), 140), source: src('duree') } : { ok: true, libelle: 'Bail commercial classique, pas dérogatoire' });
  const finAnnee = finBail ? Number(finBail.slice(0, 4)) : null;
  const restant = finAnnee ? finAnnee - new Date().getFullYear() : null;
  if (restant != null) db.push(restant < 2 ? { ok: false, gravite: 'dur', libelle: `Durée restante : ${restant} an${restant > 1 ? 's' : ''}`, detail: `Échéance ${fr(finBail)}.`, source: src('dates_bail') } : { ok: true, libelle: `Durée ${ferme ? 'ferme ' : ''}restante : ${restant} ans` });
  const echeances = [...new Set((ch('dates_bail')?.preuves || []).flatMap((p) => dates(p.reponse).map((d) => d.annee)).filter((a) => a >= new Date().getFullYear()))];
  const finsParDoc = new Map((ch('dates_bail')?.preuves || []).map((p) => [p.document_nom, Math.max(0, ...dates(p.reponse).map((d) => d.annee))]));
  const finsDistinctes = [...new Set([...finsParDoc.values()].filter(Boolean))];
  if (finsDistinctes.length > 1) {
    const lignes = [...finsParDoc.entries()].filter(([, a]) => a).map(([doc, a]) => `${doc} : ${a}`);
    db.push({ ok: false, gravite: 'clarifier', libelle: 'Durée du bail incohérente', detail: `${lignes.join(' · ')}. Écart de ${Math.max(...finsDistinctes) - Math.min(...finsDistinctes)} an(s) sur l'engagement.`, source: src('dates_bail'), action: 'À clarifier avant de poursuivre.' });
  }
  const texteResil = String(v('resiliation') || '');
  const sortieLibre = /à tout moment|sortie libre|résili(er|ation) (à|a) tout moment/i.test(texteResil) && !/triennal/i.test(texteResil);
  db.push(sortieLibre ? { ok: false, gravite: 'clarifier', libelle: 'Clause de sortie libre du locataire', detail: court(v('resiliation'), 140), source: src('resiliation'), action: 'À clarifier.' } : { ok: true, libelle: 'Pas de clause de sortie libre du locataire' });
  const litige = String(v('procedures') || '');
  const litigePositif = litige && !negation(litige) && /procédure|contentieux|litige|impayé|redressement|liquidation|sauvegarde/i.test(litige) && !/aucun|ne fai(t|re) l'objet d'aucun/i.test(litige);
  db.push(litigePositif ? { ok: false, gravite: 'clarifier', libelle: 'Litige ou procédure mentionné', detail: court(litige, 140), source: src('procedures'), action: 'À clarifier.' } : { ok: true, libelle: 'Pas de litige mentionné dans le bail' });
  if (v('destination')) db.push({ ok: true, libelle: `Activité : ${activite(v('destination'))} — à vérifier contre le RCP en étape 2` });
  const durs = db.filter((x) => !x.ok && x.gravite === 'dur');
  const aClarifier = db.filter((x) => !x.ok && x.gravite === 'clarifier');
  const recommandation = durs.length ? 'passer' : aClarifier.length ? 'complements' : 'continuer';

  // --- Bloc 5 : points notables ------------------------------------------------------------
  const notables = [];
  const recente = creation && (new Date().getFullYear() - creation.annee) <= 3;
  if (recente || (capital != null && capital < 20000)) notables.push({ titre: 'Locataire fragile', detail: [recente ? `Société créée en ${creation.iso.slice(0, 7).split('-').reverse().join('/')}` : null, capital != null ? `capital ${eur(capital)}` : null, v('origine_fonds') ? court(v('origine_fonds'), 90) : null, cautionAbsente ? 'Aucune caution ni garantie personnelle.' : null].filter(Boolean).join(', ').replace(', Aucune', '. Aucune'), renvoi: 'Impact sur la négociation du prix en étape 3.', source: src('creation') || src('capital') });
  if (v('indexation') && (avenants || /avenant|déplafonn|deplafonn/i.test(v('indexation')))) notables.push({ titre: 'Indexation modifiée par avenant', detail: court(v('indexation'), 160), renvoi: /déplafonn|supprim/i.test(v('indexation')) ? 'Favorable à l\'investisseur.' : 'À relire dans l\'avenant.', source: src('indexation') });
  else if (v('indexation') && /(plafonn|limit|cap)\w*[^.]{0,40}\d+(?:[.,]\d+)?\s?%/i.test(String(v('indexation')).replace(/[^.]*(L\.?\s?145-39|révision légale)[^.]*\./gi, ''))) notables.push({ titre: 'Indexation plafonnée', detail: court(v('indexation'), 160), renvoi: 'Pèse sur la progression du loyer : à intégrer en étape 3.', source: src('indexation') });
  if (/taxe fonci|606|copropri/i.test(String(v('charges') || ''))) notables.push({ titre: 'Charges quasi intégralement refacturées', detail: court(v('charges'), 160), renvoi: 'Montage favorable au bailleur.', source: src('charges') });
  if (v('pas_de_porte') && !negation(v('pas_de_porte'))) notables.push({ titre: 'Pas-de-porte ou droit d\'entrée', detail: court(v('pas_de_porte'), 140), renvoi: 'À intégrer dans la lecture du loyer.', source: src('pas_de_porte') });
  if (v('paiements') && /impay|retard|relance/i.test(v('paiements'))) notables.push({ titre: 'Paiements irréguliers', detail: court(v('paiements'), 140), renvoi: 'Risque locatif : à peser en étape 3.', source: src('paiements') });

  // --- Bloc 6 : les pièces pour l'étape 2 ---------------------------------------------------
  const etape2 = ETAPES[1];
  const parCategorie = {};
  for (const d of docs) if (etape2.categories.includes(d.categorie) && d.categorie !== 'Autre') parCategorie[d.categorie] = (parCategorie[d.categorie] || 0) + 1;
  const attendues = ['Règlement de copropriété', "PV d'AG copro", 'Diagnostics', 'Plans & Carrez', 'EDD', 'Appels de charges', 'Taxe foncière'];
  const manquants = attendues.filter((c) => !parCategorie[c]).map((c) => ({ piece: c, detail: c === 'Taxe foncière' && (v('taxe_fonciere') || taxeRefacturee) ? 'absent (le traitement a été extrait du bail)' : 'absent de la data room' }));
  if (!v('etat_lieux') || negation(v('etat_lieux'))) manquants.unshift({ piece: "État des lieux d'entrée", detail: 'absent de la data room' });
  const documentsEtape2 = { importes: Object.values(parCategorie).reduce((a, b) => a + b, 0), presents: Object.entries(parCategorie).map(([c, n]) => ({ categorie: c, n })), manquants };

  const demandes = [...aClarifier.map((x) => `${x.libelle} : ${x.detail}`), ...manquants.map((x) => `${x.piece} — ${x.detail}. Pouvez-vous nous le transmettre ?`)].join('\n');

  return {
    etape: etapeCourante,
    etapes: ETAPES.map((e) => ({ n: e.n, titre: e.titre })),
    progression: { lus: docs.filter((d) => d.lu).length, total: docs.length, lus_etape: lusEtape1, presents_etape: presentsEtape1 },
    remplissage: m.remplissage,
    lue,
    fiche, rentabilite, ecarts, ecarts_significatifs: ecartsSignificatifs.length, deal_breakers: db, recommandation, notables, documents_etape2: documentsEtape2,
    demandes_texte: demandes,
    motif_passer: durs.map((x) => x.libelle).join(' ; ') || null,
  };
}
