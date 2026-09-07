// L'analyse de la data room en trois étapes de lecture.
//
// Étape 1 — Bail et locataire : bail, avenants, quittances, Kbis sont lus
// d'abord. L'écran dit ce qu'est le bien en dix lignes, la rentabilité réelle
// calculée par le code, les écarts avec le teaser, les deal-breakers, les
// points notables, et les pièces qu'il faudra pour l'étape 2.
// Étape 2 — Immeuble et copropriété. Étape 3 — Prix et négociation.

import { Records } from '../db.js';
import { lireMatrice, lireFiche, lancerRemplissage, livrables } from './matrice.js';
import { montants, surfaces, dates, loyerAnnuel } from './dossier-lecture.js';
import { calculerAEM } from './aem.js';
import { REGLES } from './enrich.js';

export const ETAPES = [
  { n: 1, titre: 'Bail et locataire', categories: ['Bail commercial', 'Avenants', 'Quittances', 'Kbis', "PV d'AG preneur"] },
  { n: 2, titre: 'Immeuble et copropriété', categories: ['Règlement de copropriété', 'EDD', "PV d'AG copro", 'Appels de charges', 'Diagnostics', 'Plans & Carrez', 'Taxe foncière', 'Acte', 'Autre'] },
  { n: 3, titre: 'Risques, prix, décision', categories: [] },
  { n: 4, titre: 'Présentation et closing', categories: [] },
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
  if (etape.n >= 3) photographierFiche(dealId);
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
  // Le simulateur reprend le bail : loyer, surface, TVA, charges de copro et
  // taxe foncière selon qui les paie, article 606 pour le bailleur.
  const texteTVA = `${v('loyer') || ''} ${v('charges') || ''}`;
  const soumisTVA = /soumis(e)? à la TVA|assujetti|option (pour la|à la) TVA|TVA en sus|\+ ?TVA|HT et TVA/i.test(texteTVA) && !/non soumis|exonér|sans TVA/i.test(texteTVA);
  const chargesCopro = montants(v('charges_copro') || '')[0]?.valeur ?? 0;
  const coproRefacturee = /preneur|locataire/i.test(String(v('charges') || '')) && /copropri|charges communes|charges générales/i.test(String(v('charges') || ''));
  const taxeMontant = montants(v('taxe_fonciere') || '')[0]?.valeur ?? 0;
  const simulateur = {
    ...(lot?.simulateur || {}),
    prixBienFAI: prixFai ?? lot?.simulateur?.prixBienFAI ?? 0,
    prixBienNegocie: prixFai ?? lot?.simulateur?.prixBienNegocie ?? 0,
    loyerInitialHTHC: loyer ? Math.round(loyer) : lot?.simulateur?.loyerInitialHTHC ?? 0,
    surface: surfaces(v('surface') || '')[0]?.valeur ?? lot?.simulateur?.surface ?? 0,
    loyerSoumisTVA: soumisTVA,
    tauxTVA: 20,
    chargesCoproRefacturables: coproRefacturee || !chargesCopro ? true : false,
    chargesCopropriete: Math.round(chargesCopro),
    taxeFonciereRefacturable: taxeRefacturee,
    taxeFonciere: Math.round(taxeMontant),
    chargesDiverses: Math.round(chargesNonRecup || 0),
  };
  const hypotheses = [
    loyer ? `Loyer ${eur(loyer)} HT/an, du bail.` : 'Loyer : non trouvé dans le bail.',
    soumisTVA ? 'Loyer soumis à TVA : la TVA est facturée au preneur.' : 'Loyer hors champ ou sans mention de TVA : pas de TVA sur le loyer.',
    coproRefacturee ? `Charges de copropriété refacturées au preneur${chargesCopro ? ` (${eur(chargesCopro)}/an)` : ''}.` : chargesCopro ? `Charges de copropriété ${eur(chargesCopro)}/an, à la charge du bailleur.` : 'Charges de copropriété : montant non trouvé.',
    taxeRefacturee ? `Taxe foncière refacturée au preneur${taxeMontant ? ` (${eur(taxeMontant)})` : ''}.` : taxeMontant ? `Taxe foncière ${eur(taxeMontant)} à la charge du bailleur.` : 'Taxe foncière : à la charge du bailleur par défaut, montant inconnu.',
    chargesNonRecup ? `Charges non récupérables (art. 606) estimées à ${eur(chargesNonRecup)}/an.` : 'Article 606 (grosses réparations) : au bailleur, sans montant.',
  ];
  const rentabilite = {
    simulateur, hypotheses,
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

  // Le bandeau : loyer, revenu net, net AEM, écart teaser. Puis les anomalies, triées par gravité.
  const revenuNet = loyer ? loyer - (chargesNonRecup || 0) - (taxe || 0) - (coproRefacturee ? 0 : chargesCopro || 0) : null;
  const bandeau = {
    loyer, revenu_net: revenuNet != null ? Math.round(revenuNet) : null,
    net_aem: rentabilite.rendement_net_aem, brut_aem: rentabilite.rendement_brut_aem,
    ecart_teaser_pt: aem && aemTeaser ? Number((aem.rendement_aem - aemTeaser.rendement_aem).toFixed(2)) : null,
    rendement_teaser: aemTeaser?.rendement_aem ?? null,
  };
  const anomalies = [
    ...db.filter((x) => !x.ok).map((x) => ({ gravite: x.gravite === 'dur' ? 0 : 1, statut: x.gravite === 'dur' ? 'ko' : 'a_verifier', titre: x.libelle, detail: x.detail || '', source: x.source, action: x.action || null })),
    ...ecartsSignificatifs.map((x) => ({ gravite: 2, statut: 'a_verifier', titre: `${x.libelle} : teaser ${x.teaser ?? '—'} → bail ${x.bail}`, detail: x.commentaire, source: null })),
    ...notables.map((n) => ({ gravite: /favorable/i.test(n.renvoi) ? 4 : 3, statut: /favorable/i.test(n.renvoi) ? 'ok' : 'a_verifier', titre: n.titre, detail: n.detail, source: n.source, action: n.renvoi })),
  ].sort((a, b) => a.gravite - b.gravite);

  return {
    etape: etapeCourante,
    etapes: ETAPES.map((e) => ({ n: e.n, titre: e.titre })),
    bandeau, anomalies,
    progression: { lus: docs.filter((d) => d.lu).length, total: docs.length, lus_etape: lusEtape1, presents_etape: presentsEtape1 },
    remplissage: m.remplissage,
    lue,
    fiche, rentabilite, ecarts, ecarts_significatifs: ecartsSignificatifs.length, deal_breakers: db, recommandation, notables, documents_etape2: documentsEtape2,
    demandes_texte: demandes,
    motif_passer: durs.map((x) => x.libelle).join(' ; ') || null,
  };
}

// Les grilles d'extraction par catégorie : les pièces d'une même famille
// répondent aux mêmes questions, la contradiction se voit sur la ligne.
const GRILLES = [
  { id: 'baux', titre: 'Baux', categories: ['Bail commercial', 'Avenants'], colonnes: ['parties', 'destination', 'dates_bail', 'duree', 'loyer', 'indexation', 'charges', 'depot', 'caution', 'cession', 'resiliation', 'travaux_conformite'] },
  { id: 'copro', titre: 'Copropriété', categories: ['Règlement de copropriété', 'EDD', "PV d'AG copro", 'Appels de charges'], colonnes: ['destination', 'restrictions', 'tantiemes', 'travaux_votes', 'procedures', 'charges_copro'] },
  { id: 'diagnostics', titre: 'Diagnostics', categories: ['Diagnostics', 'Plans & Carrez'], colonnes: ['diagnostics', 'surface', 'travaux_conformite'] },
  { id: 'quittances', titre: 'Quittances', categories: ['Quittances'], colonnes: ['loyer', 'paiements', 'charges'] },
];
export function grillesParCategorie(m) {
  return GRILLES.map((g) => {
    const colonnes = g.colonnes.map((id) => m.colonnes.find((c) => c.id === id)).filter(Boolean);
    const lignes = m.lignes.filter((l) => g.categories.includes(l.categorie || 'Autre')).map((l) => ({
      document_id: l.document_id, document_nom: l.document_nom, document_url: l.document_url, categorie: l.categorie, date_document: l.date_document || null, perime: !!l.perime,
      cellules: Object.fromEntries(colonnes.map((c) => [c.id, l.cellules?.[c.id] || null])),
    }));
    return { id: g.id, titre: g.titre, colonnes: colonnes.map((c) => ({ id: c.id, libelle: c.libelle, question: c.question })), lignes };
  }).filter((g) => g.lignes.length);
}

// Étape 2 — Immeuble et copropriété. Le bail tient ; le bien physique et son
// environnement méritent-ils qu'on y mette de l'argent ?
const SUJETS_DIAG = [
  ['Amiante', /amiante/i], ['DPE', /\bDPE\b|performance énergétique|classe énergétique/i], ['ERP', /\bERP\b|risques et pollutions|PPRN|PPRI|sismi/i],
  ['Électricité', /électri|electri/i], ['Gaz', /\bgaz\b/i], ['Parasites', /termite|parasit|mérule/i], ['Plomb', /plomb|CREP/i],
];
const phrasesSur = (texte, motif) => String(texte || '').split(/(?<=[.;])\s+|\s+—\s+/).filter((ph) => motif.test(ph));

export function lireEtape2(dealId) {
  const e1 = lireEtape1(dealId);
  if (!e1) return null;
  const m = lireMatrice(dealId);
  const f = lireFiche(dealId);
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  const lot = brut.lots?.[0] || null;
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const ch = (id) => champs.get(id);
  const v = (id) => ch(id)?.valeur || null;
  const src = (id) => { const p = ch(id)?.preuves?.[0]; return p ? { document_id: p.document_id, document_nom: p.document_nom, document_url: p.document_url, page: p.page, citation: p.citation } : null; };
  const vivantes = m.lignes.filter((l) => !l.perime);
  const etape2 = ETAPES[1];
  const lusEtape2 = vivantes.filter((l) => etape2.categories.includes(l.categorie || 'Autre')).length;
  const lue = lusEtape2 > 0;
  const loyer = e1.rentabilite.loyer_bail;

  // --- Bloc 1 : copropriété -----------------------------------------------------------------
  const restrictions = v('restrictions');
  const destination = v('destination') || '';
  const GENERIQUES = new Set(['commerce', 'commerces', 'vente', 'produits', 'activité', 'activités', 'exclusive', 'destination', 'exercice', 'exploitation', 'local', 'locaux', 'usage', 'titre', 'accessoire', 'toute', 'toutes', 'autres', 'sous', 'réserve']);
  const motsActivite = (destination.toLowerCase().match(/[a-zéèêàç]{5,}/g) || []).filter((w) => !GENERIQUES.has(w));
  const interdit = /interdit|prohib|exclu|ne (peut|pourra|sont) (pas|être)|défense/i.test(restrictions || '');
  const restrictionTouche = restrictions && !negation(restrictions) && interdit && motsActivite.some((w) => restrictions.toLowerCase().includes(w));
  const conformite = !restrictions ? { statut: 'inconnu', texte: 'Règlement de copropriété non lu : conformité de l\'activité à vérifier.' }
    : negation(restrictions) ? { statut: 'ok', texte: 'Le règlement ne restreint pas l\'activité du preneur.' }
    : restrictionTouche ? { statut: 'ko', texte: `Le règlement vise l\'activité exercée : ${court(restrictions, 140)}` }
    : { statut: 'a_verifier', texte: `Le règlement pose des restrictions, sans viser l\'activité en termes exprès : ${court(restrictions, 120)}` };
  const travaux = v('travaux_votes');
  const montantTravaux = montants(travaux || '')[0]?.valeur ?? null;
  const travauxLourds = travaux && !negation(travaux) && (montantTravaux != null ? montantTravaux > Math.max(10000, (loyer || 0) * 0.2) : /ravalement|toiture|ascenseur|structure|façade/i.test(travaux));
  const litige = v('procedures');
  const litigePositif = litige && !negation(litige) && /procédure|contentieux|litige|impayé|redressement|liquidation|sauvegarde/i.test(litige) && !/aucun/i.test(litige);
  const chargesCopro = montants(v('charges_copro') || '')[0]?.valeur ?? null;
  const copro = {
    conformite: { ...conformite, source: src('restrictions') },
    travaux: { statut: !travaux ? 'inconnu' : negation(travaux) ? 'ok' : travauxLourds ? 'ko' : 'a_verifier', texte: !travaux ? 'Aucun PV d\'AG lu : travaux votés inconnus.' : negation(travaux) ? 'Aucun travaux voté ni en discussion.' : `${court(travaux, 160)}${montantTravaux ? ` — ${eur(montantTravaux)}` : ''}`, source: src('travaux_votes') },
    litiges: { statut: !litige ? 'inconnu' : litigePositif ? 'ko' : 'ok', texte: !litige ? 'Procédures : rien de lu.' : litigePositif ? court(litige, 160) : 'Aucune procédure ni contentieux mentionné.', source: src('procedures') },
    cout: { statut: chargesCopro != null ? 'ok' : 'inconnu', texte: chargesCopro != null ? `${eur(chargesCopro)}/an de charges de copropriété${loyer ? ` (${((chargesCopro / loyer) * 100).toFixed(0)} % du loyer)` : ''}${/preneur|locataire/i.test(String(v('charges') || '')) ? ', refacturées au preneur' : ''}.` : 'Coût de la copropriété : aucun appel de charges ni budget lu.', source: src('charges_copro') },
    tantiemes: v('tantiemes') ? { texte: court(v('tantiemes'), 120), source: src('tantiemes') } : null,
  };

  // --- Bloc 2 : état du bien, une réponse par sujet ------------------------------------------
  const textesDiag = (ch('diagnostics')?.preuves || []).map((p) => ({ texte: p.reponse, source: { document_id: p.document_id, document_nom: p.document_nom, document_url: p.document_url, page: p.page } }));
  const etatBien = SUJETS_DIAG.map(([sujet, motif]) => {
    const trouves = textesDiag.flatMap((t) => phrasesSur(t.texte, motif).map((ph) => ({ ph, source: t.source })));
    if (!trouves.length) return { sujet, statut: 'absent', resultat: 'Aucun diagnostic lu sur ce sujet.', action: null, source: null };
    const texte = trouves.map((x) => x.ph).join(' ');
    const negatif = /absence|aucun|néant|non détect|pas de|conforme|sans anomalie|négatif|vierge/i.test(texte) && !/non conforme|présence|détecté|positif|anomalie/i.test(texte);
    const action = /travaux|à réaliser|non conforme|présence|anomalie|mise en sécurité|retrait|obligation|à refaire|expir|périmé/i.test(texte) ? court(texte.match(/[^.;]*(travaux|à réaliser|non conforme|présence|anomalie|mise en sécurité|retrait|obligation|à refaire|expir|périmé)[^.;]*/i)?.[0] || texte, 120) : null;
    const validite = dates(texte).map((d) => d.iso).sort().pop() || null;
    const cout = montants(texte)[0]?.valeur ?? null;
    return { sujet, statut: action ? 'action' : negatif ? 'ok' : 'a_lire', resultat: court(texte, 160), action, cout, validite, source: trouves[0].source };
  });

  // --- Bloc 3 : surfaces, toutes les sources -----------------------------------------------
  const sourcesSurface = [];
  for (const l of vivantes) {
    const cel = l.cellules?.surface;
    if (!cel?.reponse) continue;
    for (const sf of surfaces(cel.reponse).slice(0, 1)) sourcesSurface.push({ source: l.document_nom, categorie: l.categorie || 'Autre', valeur: sf.valeur, extrait: court(sf.extrait || cel.reponse, 60), document_id: l.document_id, document_url: l.document_url, page: cel.page || null });
  }
  const teaserSurface = val(lot?.lot?.surface_m2);
  if (teaserSurface) sourcesSurface.push({ source: 'Teaser (pré-analyse)', categorie: 'Annonce', valeur: teaserSurface, extrait: null });
  const valeurs = sourcesSurface.map((x) => x.valeur);
  const minS = valeurs.length ? Math.min(...valeurs) : null;
  const maxS = valeurs.length ? Math.max(...valeurs) : null;
  const incoherence = minS && maxS && (maxS - minS) / maxS > 0.03;
  const bailSurf = sourcesSurface.filter((x) => /^bail/i.test(x.categorie)).map((x) => x.valeur);
  const autresSurf = sourcesSurface.filter((x) => !/^bail/i.test(x.categorie) && x.categorie !== 'Annonce').map((x) => x.valeur);
  const pieceMultiLots = bailSurf.length && autresSurf.length && Math.max(...bailSurf) < Math.max(...autresSurf) * 0.85;
  const surfacesBloc = {
    sources: sourcesSurface, min: minS, max: maxS, incoherence: !!incoherence,
    lecture: !sourcesSurface.length ? 'Aucune surface lue.' : !incoherence ? `Toutes les sources concordent autour de ${maxS} m².` : pieceMultiLots ? `Le bail porte sur ${Math.max(...bailSurf)} m² quand les autres pièces décrivent jusqu'à ${Math.max(...autresSurf)} m² : le bail couvre une partie seulement, le périmètre du deal est à clarifier.` : `Les sources vont de ${minS} à ${maxS} m² : périmètre à clarifier (Carrez, utile, au sol).`,
  };

  // --- Bloc 4 : marché ----------------------------------------------------------------------
  const enr = lot?.enrichissement || {};
  const surfaceRef = surfacesBloc.max || teaserSurface || null;
  const loyerM2 = loyer && surfaceRef ? Math.round(loyer / surfaceRef) : null;
  const marche = {
    commune: enr.commune ? `${enr.commune.nom}${enr.commune.population ? ` · ${enr.commune.population.toLocaleString('fr-FR')} habitants` : ''}${enr.typologie_ville ? ` · ${String(enr.typologie_ville).replace('_', ' ')}` : ''}` : null,
    revenu_median: enr.revenu_median ?? null,
    loyer_m2: loyerM2,
    contexte: lot?.contexte_marche ? { resume: lot.contexte_marche.resume, sources: lot.contexte_marche.sources || [] } : null,
    indisponibles: ['Flux piéton', 'Enseignes présentes', 'Vacance commerciale', 'Comparables de loyer au m²', 'Projets urbains'].filter((x) => !(lot?.contexte_marche?.resume || '').toLowerCase().includes(x.toLowerCase().split(' ')[0])),
    question: loyerM2 ? `Une relocation au même loyer suppose de retrouver un preneur à ${loyerM2} €/m²/an : à confronter aux comparables du secteur.` : 'Sans loyer ni surface fiables, la relocation ne peut pas être appréciée.',
  };

  // --- Bloc 5 : synthèse en quatre lignes ------------------------------------------------------
  const statutCopro = [copro.conformite.statut, copro.travaux.statut, copro.litiges.statut].includes('ko') ? 'ko' : [copro.conformite.statut, copro.travaux.statut, copro.litiges.statut].includes('a_verifier') ? 'a_verifier' : [copro.conformite.statut, copro.travaux.statut, copro.litiges.statut].every((x) => x === 'inconnu') ? 'inconnu' : 'ok';
  const statutBien = etatBien.some((x) => x.statut === 'action') ? 'a_verifier' : etatBien.every((x) => x.statut === 'absent') ? 'inconnu' : 'ok';
  const statutSurfaces = !sourcesSurface.length ? 'inconnu' : incoherence ? (pieceMultiLots ? 'ko' : 'a_verifier') : 'ok';
  const statutMarche = marche.contexte ? 'a_verifier' : 'inconnu';
  const mot = { ok: 'OK', ko: 'non', a_verifier: 'à clarifier', inconnu: 'non lu' };
  const synthese = [
    { sujet: 'Copropriété', statut: statutCopro, texte: statutCopro === 'ok' ? 'Copropriété OK : activité admise, pas de travaux lourds, pas de litige.' : statutCopro === 'ko' ? 'Copropriété : un point bloquant (activité, travaux ou litige).' : statutCopro === 'inconnu' ? 'Copropriété non lue.' : 'Copropriété à clarifier.' },
    { sujet: 'Bien', statut: statutBien, texte: statutBien === 'ok' ? 'Bien OK : diagnostics sans action requise.' : statutBien === 'inconnu' ? 'Aucun diagnostic lu.' : `Bien : ${etatBien.filter((x) => x.statut === 'action').map((x) => x.sujet).join(', ')} avec action requise.` },
    { sujet: 'Surfaces', statut: statutSurfaces, texte: statutSurfaces === 'ok' ? 'Surfaces claires.' : statutSurfaces === 'inconnu' ? 'Surfaces non lues.' : 'Surfaces à clarifier : les sources ne concordent pas.' },
    { sujet: 'Marché', statut: statutMarche, texte: statutMarche === 'a_verifier' ? 'Marché : contexte web disponible, comparables à confronter.' : 'Marché : données externes non disponibles.' },
  ].map((x) => ({ ...x, mot: mot[x.statut] }));

  // --- Deal-breakers de l'étape, recommandation, demandes cumulées -------------------------------
  const db = [];
  if (copro.litiges.statut === 'ko') db.push({ ok: false, gravite: 'dur', libelle: 'Litige ou procédure dans la copropriété', detail: copro.litiges.texte, source: copro.litiges.source });
  else db.push({ ok: true, libelle: 'Pas de litige dans la copropriété' });
  if (copro.travaux.statut === 'ko') db.push({ ok: false, gravite: 'clarifier', libelle: 'Travaux lourds votés ou en discussion', detail: copro.travaux.texte, source: copro.travaux.source, action: 'Répartition et échéance à clarifier avant de poursuivre.' });
  else if (copro.travaux.statut === 'ok') db.push({ ok: true, libelle: 'Pas de travaux lourds votés' });
  if (copro.conformite.statut === 'ko') db.push({ ok: false, gravite: 'dur', libelle: 'Activité non conforme au règlement de copropriété', detail: copro.conformite.texte, source: copro.conformite.source });
  else if (copro.conformite.statut === 'ok') db.push({ ok: true, libelle: 'Activité conforme au règlement de copropriété' });
  if (pieceMultiLots) db.push({ ok: false, gravite: 'clarifier', libelle: 'Périmètre du deal incertain', detail: surfacesBloc.lecture, action: 'Le bail ne couvre pas l\'ensemble : à clarifier.' });
  const diagAction = etatBien.filter((x) => x.statut === 'action');
  if (diagAction.length) db.push({ ok: false, gravite: 'clarifier', libelle: `Diagnostics avec action requise : ${diagAction.map((x) => x.sujet).join(', ')}`, detail: diagAction.map((x) => x.action).join(' · '), source: diagAction[0].source });
  else if (etatBien.some((x) => x.statut === 'ok')) db.push({ ok: true, libelle: 'Diagnostics sans action requise' });
  const durs = db.filter((x) => !x.ok && x.gravite === 'dur');
  const aClarifier = db.filter((x) => !x.ok && x.gravite === 'clarifier');
  const recommandation = durs.length ? 'passer' : aClarifier.length ? 'complements' : 'continuer';
  const demandesEtape2 = [
    ...aClarifier.map((x) => `${x.libelle} : ${x.detail}`),
    ...(copro.conformite.statut === 'inconnu' ? ['Règlement de copropriété — conformité de l\'activité à confirmer.'] : []),
    ...(!v('etat_lieux') || negation(v('etat_lieux')) ? ['État des lieux d\'entrée — absent de la data room.'] : []),
  ];
  const demandes = [e1.demandes_texte, ...demandesEtape2].filter(Boolean).join('\n');

  return {
    etape: e1.etape, etapes: e1.etapes, remplissage: m.remplissage,
    progression: { ...e1.progression, lus_etape: lusEtape2, presents_etape: (brut.documents_espace || []).filter((d) => etape2.categories.includes(d.categorie || 'Autre')).length },
    lue,
    copro, etat_bien: etatBien, surfaces: surfacesBloc, marche, synthese,
    deal_breakers: db, recommandation, demandes_texte: demandes, motif_passer: durs.map((x) => x.libelle).join(' ; ') || null,
    grilles: grillesParCategorie(m),
  };
}

// ---------------------------------------------------------------------------
// Étape 3 — Risques, prix, décision. Aucune lecture : de l'assemblage.
// Cinq risques, chacun avec son raisonnement, ses sources et ce dont il se
// nourrit. L'analyste confirme, ajuste ou écarte : la décote, le prix ajusté,
// le rendement et le score bougent en direct. Trois leviers de négociation,
// plafonnés au prix demandé. Le match investisseur suit.
// ---------------------------------------------------------------------------
const NIVEAU_DECOTE = { fort: 8, moyen: 4, faible: 0 };
const FACTEUR_VERDICT = { confirme: 1, ajuste: 0.5, ecarte: 0 };

function evaluerRisques(e1, e2) {
  const r = e1.rentabilite;
  const restant = (() => { const x = e1.deal_breakers.find((d) => /Durée .*restante/i.test(d.libelle)); const m = x?.libelle.match(/(\d+)\s*an/); return m ? Number(m[1]) : null; })();
  const locataireFragile = e1.notables.find((n) => /fragile/i.test(n.titre));
  const sansCaution = e1.fiche.lignes.find((l) => l.id === 'caution')?.valeur === 'Aucune';
  const marcheInconnu = !e2?.marche?.contexte;
  const risques = [];

  // 1. Vacance
  {
    const facteurs = [];
    if (restant != null && restant < 3) facteurs.push(`bail à moins de trois ans (${restant})`);
    if (locataireFragile) facteurs.push('locataire fragile');
    if (sansCaution) facteurs.push('aucune caution');
    if (marcheInconnu) facteurs.push('marché non documenté');
    if (e2?.surfaces?.incoherence) facteurs.push('périmètre de surface incertain');
    const niveau = facteurs.length >= 3 ? 'fort' : facteurs.length >= 1 ? 'moyen' : 'faible';
    risques.push({ id: 'vacance', titre: 'Vacance', niveau, raisonnement: facteurs.length ? `Si le preneur part, la relocation dépend de : ${facteurs.join(', ')}.` : 'Bail long, preneur solide, marché lisible : la vacance est un risque ordinaire.', sources: [e1.fiche.lignes.find((l) => l.id === 'bail')?.source, e1.fiche.lignes.find((l) => l.id === 'caution')?.source].filter(Boolean), nourri_de: ['Étape 1 · bail et locataire', 'Étape 2 · marché'] });
  }
  // 2. Rendement
  {
    const net = r.rendement_net_aem;
    const niveau = net == null ? 'moyen' : net < r.seuil - 1 ? 'fort' : net < r.seuil ? 'moyen' : 'faible';
    risques.push({ id: 'rendement', titre: 'Rendement', niveau, raisonnement: net == null ? 'Rentabilité non calculable : prix ou loyer manquant.' : `${net.toFixed(2)} % net AEM contre un seuil de ${r.seuil.toFixed(2)} %${e1.bandeau.ecart_teaser_pt != null ? `, ${e1.bandeau.ecart_teaser_pt >= 0 ? '+' : ''}${e1.bandeau.ecart_teaser_pt} pt par rapport au teaser` : ''}.`, sources: [e1.fiche.lignes.find((l) => l.id === 'loyer')?.source].filter(Boolean), nourri_de: ['Étape 1 · rentabilité réelle', 'Étape 1 · écarts avec le teaser'] });
  }
  // 3. Juridique
  {
    const pts = e1.deal_breakers.filter((d) => !d.ok);
    if (e2?.copro?.conformite?.statut === 'ko') pts.push({ libelle: 'Activité non conforme au RCP', gravite: 'dur' });
    const niveau = pts.some((x) => x.gravite === 'dur') ? 'fort' : pts.length ? 'moyen' : 'faible';
    risques.push({ id: 'juridique', titre: 'Juridique', niveau, raisonnement: pts.length ? pts.map((x) => x.libelle).join(' ; ') + '.' : 'Bail classique, pas de clause de sortie libre, pas de litige, activité admise.', sources: pts.map((x) => x.source).filter(Boolean), nourri_de: ['Étape 1 · deal-breakers', 'Étape 2 · copropriété'] });
  }
  // 4. Technique
  {
    const actions = (e2?.etat_bien || []).filter((x) => x.statut === 'action');
    const absents = (e2?.etat_bien || []).filter((x) => x.statut === 'absent').length;
    const niveau = actions.length >= 2 ? 'fort' : actions.length === 1 || absents >= 5 ? 'moyen' : 'faible';
    risques.push({ id: 'technique', titre: 'Technique', niveau, raisonnement: actions.length ? `Action requise : ${actions.map((x) => `${x.sujet} (${x.action})`).join(' ; ')}.` : absents >= 5 ? 'Diagnostics largement absents : l\'état du bien n\'est pas documenté.' : 'Diagnostics sans action requise.', sources: actions.map((x) => x.source).filter(Boolean), nourri_de: ['Étape 2 · état du bien'] });
  }
  // 5. Copropriété
  {
    const c = e2?.copro;
    const statuts = c ? [c.travaux.statut, c.litiges.statut, c.cout.statut] : [];
    const niveau = statuts.includes('ko') ? 'fort' : statuts.includes('a_verifier') || statuts.every((x) => x === 'inconnu') ? 'moyen' : 'faible';
    risques.push({ id: 'copropriete', titre: 'Copropriété', niveau, raisonnement: c ? [c.travaux.texte, c.litiges.texte, c.cout.texte].join(' ') : 'Copropriété non lue.', sources: c ? [c.travaux.source, c.litiges.source].filter(Boolean) : [], nourri_de: ['Étape 2 · copropriété'] });
  }
  return risques.map((x) => ({ ...x, decote_pct: NIVEAU_DECOTE[x.niveau] }));
}

const LEVIERS = [
  { id: 'prix', titre: 'Baisse du prix', detail: 'Ramener le prix au seuil de rendement.', effet: 'prix' },
  { id: 'garanties', titre: 'Garanties du bail', detail: 'Caution ou dépôt renforcé, avenant signé avant la vente.', effet: 'risque:vacance' },
  { id: 'travaux', titre: 'Travaux et charges au vendeur', detail: 'Diagnostics à action et travaux votés pris en charge par le vendeur.', effet: 'risque:technique' },
];

export async function lireEtape3(dealId) {
  const e1 = lireEtape1(dealId);
  if (!e1) return null;
  const e2 = lireEtape2(dealId);
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  const revue = brut.risques_revue || {};
  const leviersCoches = new Set(brut.negociation?.leviers || []);
  const r = e1.rentabilite;
  const prix = r.prix_fai || null;

  const risques = evaluerRisques(e1, e2).map((x) => {
    let verdict = revue[x.id] || 'confirme';
    // Un levier coché neutralise le risque qu'il adresse.
    const levier = LEVIERS.find((l) => l.effet === `risque:${x.id}` && leviersCoches.has(l.id));
    const facteur = levier ? 0 : FACTEUR_VERDICT[verdict] ?? 1;
    return { ...x, verdict, decote_retenue_pct: Number((x.decote_pct * facteur).toFixed(1)), neutralise_par: levier?.titre || null, replie: x.niveau === 'faible' };
  });
  const decoteTotale = Number(risques.reduce((n, x) => n + x.decote_retenue_pct, 0).toFixed(1));
  // Le levier prix vise le seuil ; jamais au-dessus du prix demandé.
  const prixSeuil = r.cible?.prix_fai || null;
  let prixAjuste = prix ? Math.round(prix * (1 - decoteTotale / 100)) : null;
  if (leviersCoches.has('prix') && prixSeuil && prixAjuste && prixSeuil < prixAjuste) prixAjuste = prixSeuil;
  if (prix && prixAjuste > prix) prixAjuste = prix;
  const aemAjuste = prix && r.loyer_bail && prixAjuste ? calculerAEM({ prixFai: prix, prixNegocie: prixAjuste, loyerAnnuel: r.loyer_bail }) : null;
  const loyerNet = r.loyer_bail ? r.loyer_bail - (r.charges_non_recup || 0) - (r.taxe_fonciere_bailleur || 0) : null;
  const rendementNetAjuste = aemAjuste && loyerNet ? Number(((loyerNet / aemAjuste.prix_aem) * 100).toFixed(2)) : null;
  const poids = { fort: 30, moyen: 15, faible: 5 };
  const score = Math.max(0, Math.min(100, Math.round(100 - risques.reduce((n, x) => n + poids[x.niveau] * (x.neutralise_par ? 0 : FACTEUR_VERDICT[x.verdict] ?? 1), 0))));

  // Le match investisseur : prêts au prix ajusté, possibles avec les leviers, hors budget.
  let match = { configure: false, prets: [], possibles: [], hors: [] };
  try {
    const { mondayConfigure } = await import('../monday.js');
    if (mondayConfigure() && prix) {
      const { investisseursPourBien } = await import('./monday-sync.js');
      const ville = e1.fiche.titre.split(' — ').pop() || '';
      const auPrix = await investisseursPourBien({ cout: prixAjuste || prix, ville });
      const auSeuil = prixSeuil && prixSeuil < (prixAjuste || prix) ? await investisseursPourBien({ cout: prixSeuil, ville }) : [];
      const cle = (c) => c.client?.email || c.client?.nom;
      const prets = auPrix.map((c) => ({ nom: c.client.nom, email: c.client.email, raisons: c.raisons }));
      const dejaPrets = new Set(prets.map((x) => x.email || x.nom));
      const possibles = auSeuil.filter((c) => !dejaPrets.has(cle(c))).map((c) => ({ nom: c.client.nom, email: c.client.email, raisons: c.raisons, si: 'baisse du prix au seuil' }));
      match = { configure: true, prets, possibles, hors: [] };
    }
  } catch { /* sans Monday, pas de rapprochement */ }

  const liv = livrables(dealId) || { demandes_texte: '', note: '' };
  return {
    etape: e1.etape, etapes: e1.etapes, progression: e1.progression,
    risques, leviers: LEVIERS.map((l) => ({ ...l, coche: leviersCoches.has(l.id) })),
    prix: { demande: prix, seuil: prixSeuil, ajuste: prixAjuste, decote_pct: decoteTotale, rendement_net_ajuste: rendementNetAjuste, rendement_brut_ajuste: aemAjuste?.rendement_aem ?? null, seuil_rendement: r.seuil, score },
    match,
    demandes_texte: [e1.demandes_texte, e2?.demandes_texte].filter(Boolean).join('\n'),
    note: liv.note,
    motif_passer: [e1.motif_passer, e2?.motif_passer].filter(Boolean).join(' ; ') || risques.filter((x) => x.niveau === 'fort' && x.verdict === 'confirme').map((x) => x.titre).join(', ') || null,
  };
}

export function reviserRisque(dealId, id, verdict) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  if (!['confirme', 'ajuste', 'ecarte'].includes(verdict)) return { ok: false, error: 'Verdict inconnu' };
  Records.update('Deal', brut.id, { risques_revue: { ...(brut.risques_revue || {}), [id]: verdict } });
  return { ok: true };
}
export function cocherLeviers(dealId, ids) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const valides = LEVIERS.map((l) => l.id);
  Records.update('Deal', brut.id, { negociation: { ...(brut.negociation || {}), leviers: (ids || []).filter((x) => valides.includes(x)) } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Étape 4 — Présentation et closing.
// ---------------------------------------------------------------------------
const PROFILS = [
  { id: 'pere_de_famille', titre: 'Père de famille', accent: 'la sécurité du flux : bail, garanties, locataire, copropriété saine.' },
  { id: 'equilibre', titre: 'Équilibré', accent: 'le rapport rendement / risque : net AEM, décote négociée, points levés.' },
  { id: 'opportuniste', titre: 'Opportuniste', accent: 'le potentiel : loyer de marché, revalorisation, leviers de négociation.' },
];

export async function lireEtape4(dealId) {
  const e3 = await lireEtape3(dealId);
  if (!e3) return null;
  const e1 = lireEtape1(dealId);
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  const f = lireFiche(dealId);
  const m = lireMatrice(dealId);
  const eurs = (v) => (v == null ? '—' : `${Math.round(v).toLocaleString('fr-FR')} €`);
  const lignes = Object.fromEntries(e1.fiche.lignes.map((l) => [l.id, l.valeur]));

  // La présentation, par profil, en trois formats : pitch, mail, fiche.
  const faits = [
    lignes.bail && `Bail : ${lignes.bail}`, lignes.loyer && `Loyer : ${lignes.loyer}`, lignes.locataire && `Locataire : ${lignes.locataire}`,
    e3.prix.demande && `Prix demandé : ${eurs(e3.prix.demande)}${e3.prix.ajuste && e3.prix.ajuste < e3.prix.demande ? ` · prix cible ${eurs(e3.prix.ajuste)} (décote ${e3.prix.decote_pct} %)` : ''}`,
    e3.prix.rendement_net_ajuste != null && `Rendement net AEM au prix cible : ${e3.prix.rendement_net_ajuste} %`,
  ].filter(Boolean);
  const risquesForts = e3.risques.filter((x) => x.niveau !== 'faible' && x.verdict !== 'ecarte');
  const presentations = PROFILS.map((p) => {
    const angle = p.id === 'pere_de_famille'
      ? [lignes.bail && `Un bail ${lignes.bail.toLowerCase()}`, lignes.caution === 'Aucune' ? 'Point à sécuriser : aucune caution — garantie à négocier.' : lignes.caution && `Garantie : ${lignes.caution}`, lignes.charges && `Charges : ${lignes.charges}`]
      : p.id === 'equilibre'
        ? [e3.prix.rendement_net_ajuste != null && `${e3.prix.rendement_net_ajuste} % net AEM au prix cible, seuil ${e3.prix.seuil_rendement.toFixed(2)} %`, `Score de risque ${e3.prix.score}/100`, risquesForts.length ? `Risques traités : ${risquesForts.map((x) => x.titre.toLowerCase()).join(', ')}` : 'Aucun risque fort']
        : [e1.rentabilite.loyer_bail && f ? `Loyer en place ${eurs(e1.rentabilite.loyer_bail)}/an` : null, e3.leviers.filter((l) => l.coche).length ? `Leviers : ${e3.leviers.filter((l) => l.coche).map((l) => l.titre.toLowerCase()).join(', ')}` : 'Leviers de négociation ouverts', lignes.indexation && `Indexation : ${lignes.indexation}`];
    const points = angle.filter(Boolean);
    const pitch = [e1.fiche.titre, ...points.slice(0, 3), faits.find((x) => x.startsWith('Prix'))].filter(Boolean);
    const mail = `Bonjour,\n\nNous avons analysé pour vous ${e1.fiche.titre}.\n\n${points.map((x) => `– ${x}`).join('\n')}\n\n${faits.map((x) => `– ${x}`).join('\n')}\n\nNous restons à votre disposition pour en parler.\n\nL'équipe Klocka`;
    const fiche = `# ${e1.fiche.titre}\n\n## Pour un profil ${p.titre.toLowerCase()}\nCe qui compte : ${p.accent}\n\n${points.map((x) => `- ${x}`).join('\n')}\n\n## Les faits\n${faits.map((x) => `- ${x}`).join('\n')}\n\n## Les risques\n${e3.risques.map((x) => `- ${x.titre} (${x.niveau}${x.verdict !== 'confirme' ? `, ${x.verdict}` : ''}) : ${x.raisonnement}`).join('\n')}`;
    return { ...p, pitch, mail, fiche };
  });

  // La timeline : le journal du dossier, les compléments, les mails — chaque ligne dit qui a agi.
  const evenements = [];
  for (const s of brut.suivi || []) evenements.push({ date: s.le, libelle: s.detail || s.type, acteur: s.type === 'etape' ? 'systeme' : s.par ? 'analyste' : 'automatique', type: s.type });
  for (const d of brut.documents_espace || []) evenements.push({ date: d.ajoute_le, libelle: `Pièce reçue : ${d.nom}`, acteur: 'analyste', type: 'piece' });
  if (brut.matrice?.rempli_le) evenements.push({ date: brut.matrice.rempli_le, libelle: 'Data room lue', acteur: 'automatique', type: 'lecture' });
  if (brut.conclusion?.le) evenements.push({ date: brut.conclusion.le, libelle: `Conclusion : ${brut.conclusion.etat}${brut.conclusion.motif ? ` — ${brut.conclusion.motif}` : ''}`, acteur: 'analyste', type: 'conclusion' });
  const timeline = evenements.filter((x) => x.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Les compléments reçus depuis le passage à l'étape 3 : impact ligne par ligne, ancienne valeur.
  const instantane = brut.fiche_instantane || null;
  const complements = [];
  if (instantane) {
    const apres = Object.fromEntries(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, { valeur: c.valeur, source: c.source }]));
    const depuis = instantane.le;
    const nouvelles = (brut.documents_espace || []).filter((d) => d.ajoute_le > depuis);
    for (const c of f.blocs.flatMap((b) => b.champs)) {
      const avant = instantane.valeurs?.[c.id] ?? null;
      const maintenant = apres[c.id]?.valeur ?? null;
      if ((avant || maintenant) && avant !== maintenant) complements.push({ champ: c.id, libelle: c.libelle, avant, apres: maintenant, source: apres[c.id]?.source || null });
    }
    complements.nouvelles = nouvelles.length;
    return {
      etape: e1.etape, etapes: e1.etapes, progression: e1.progression,
      presentations, timeline, complements: { depuis, pieces: nouvelles.map((d) => d.nom), lignes: complements },
      conclusion: brut.conclusion || null, titre: e1.fiche.titre,
    };
  }
  return { etape: e1.etape, etapes: e1.etapes, progression: e1.progression, presentations, timeline, complements: { depuis: null, pieces: [], lignes: [] }, conclusion: brut.conclusion || null, titre: e1.fiche.titre };
}

/** En passant à l'étape 3, la fiche est photographiée : les compléments se mesurent contre elle. */
export function photographierFiche(dealId) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut || brut.fiche_instantane) return;
  const f = lireFiche(dealId);
  if (!f) return;
  Records.update('Deal', brut.id, { fiche_instantane: { le: new Date().toISOString(), valeurs: Object.fromEntries(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c.valeur])) } });
}

export async function conclure(dealId, { etat, motif, user }) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  if (!['signe', 'perdu', 'abandonne'].includes(etat)) return { ok: false, error: 'Conclusion inconnue' };
  const conclusion = { etat, motif: motif || null, par: user?.email || null, le: new Date().toISOString() };
  Records.update('Deal', brut.id, { conclusion });
  const { changerStatut } = await import('./lifecycle.js');
  const libelle = { signe: 'Signé', perdu: 'Perdu', abandonne: 'Abandonné' }[etat];
  if (etat !== 'signe') changerStatut({ ...brut, conclusion }, 'abandonne', { user, note: `${libelle}${motif ? ` — ${motif}` : ''}` });
  else changerStatut({ ...brut, conclusion }, brut.projet_id ? 'projet_cree' : 'depouille', { user, note: `Signé${motif ? ` — ${motif}` : ''}` });
  return { ok: true, conclusion, destination: etat === 'signe' ? 'Dossiers signés — le projet vit sur la plateforme.' : etat === 'perdu' ? 'Archives — perdu ; le prix et le loyer alimentent la base marché.' : 'Archives — abandonné ; le motif alimente la base marché.' };
}
