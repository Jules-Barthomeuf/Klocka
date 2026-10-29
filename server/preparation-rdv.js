// La préparation du rendez-vous (26 oct. 2026, Jules) : au rendez-vous fixé, Haka prépare en fond ce que le mandataire
// doit savoir et demander, une section de la fiche du bien : la pré-estimation (interne, jamais annoncée), les murs
// (SCI, gérant, âge), le locataire, la rue, le signal, les clients compatibles, et ce qu'il faut demander. La veille du
// rendez-vous à 18 h, elle est mise à jour (nouveau signal, nouvelle recherche client) et une notification le dit.
// Après la visite, Haka lance l'avis de valeur avec ce qu'elle contient et ce que la visite a appris.

import { Records } from './db.js';

const PARIS = 'Europe/Paris';
const maintenant = () => new Date().toISOString();

/** Ce qu'il faut demander au rendez-vous, dans l'ordre où ça se demande. */
export const A_DEMANDER = [
  'Le bail : date de signature, durée (3-6-9 ?), loyer actuel et indexation',
  'Les charges et la taxe foncière : refacturées au locataire ?',
  'La fin du bail, et ce que le locataire compte faire',
  'Les travaux faits ou à prévoir',
  'Le prix qu’il a en tête, et son délai',
  'Les documents à récupérer : bail, dernier avis de taxe foncière, diagnostics',
];

// La Pré-visite refaite (26 oct. 2026, spécification de Jules) : la préparation est le contenu de la page, le chat une
// aide. Chaque information dit d'où elle vient (registre, dictée, appel, estimation, Data-B, DVF, recherches clients,
// agenda) et ce qui est déduit porte « à confirmer » : rien d'incertain n'est présenté comme sûr. Tout est calculé ici,
// par règles, sans modèle de langue : la préparation se refait en quelques secondes.

const k = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n) >= 1e6 ? `${(Number(n) / 1e6).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} M€` : `${Math.round(Number(n) / 1000).toLocaleString('fr-FR')} k€`);
const nbFr = (n) => Math.round(Number(n)).toLocaleString('fr-FR');

/** Pure : bailleur (les murs sont loués à un exploitant) ou exploitant (le propriétaire occupe ses murs). */
export const profilDe = (courte = {}) => (/^l'exploitant/i.test(String(courte.proprietaire || '')) ? 'exploitant' : 'bailleur');

// Les notes posées par l'application elle-même ne disent rien de la personne.
const AUTOMATIQUE = /^(rendez-vous (fixé|décalé|annulé)|rdv pris|local visité|avis de valeur envoyé|fiche (créée|ajoutée)|statut|en pause|reprise|(appel )?sans réponse|étape )/i;
const SOURCE_HISTORIQUE = { appel: 'appel', note: 'note', dictee: 'dictée' };

/** Pure : ce qu'il a déjà dit, les trois dernières choses entendues ou notées (appels, dictées, notes), les plus récentes d'abord. */
export function dejaDit(historique = []) {
  return (historique || [])
    .filter((h) => SOURCE_HISTORIQUE[h.type] && String(h.texte || '').trim().length > 12 && !AUTOMATIQUE.test(String(h.texte).trim()))
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')))
    .slice(0, 3)
    .map((h) => ({ texte: String(h.texte).replace(/\s+/g, ' ').trim().slice(0, 160), source: SOURCE_HISTORIQUE[h.type], le: h.le || null }));
}

/** Pure : ce qui, dans l'historique, parle d'une raison de vendre (appris au téléphone ou sur le terrain). */
export function apprisSurLeTerrain(historique = []) {
  const MOTS = /(vend|cession|céder|retraite|succession|héritage|divorce|déménag|partir|projet|fin de bail|travaux|associ|besoin de liquidit|rachat)/i;
  return (historique || [])
    .filter((h) => SOURCE_HISTORIQUE[h.type] && MOTS.test(String(h.texte || '')) && !AUTOMATIQUE.test(String(h.texte || '').trim()))
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')))
    .slice(0, 2)
    .map((h) => ({ texte: String(h.texte).replace(/\s+/g, ' ').trim().slice(0, 160), source: SOURCE_HISTORIQUE[h.type] }));
}

/** Pure : comment l'aborder, en une phrase, selon son profil. */
export function approche({ profil, courte = {} }) {
  const age = String(courte.gerant?.age || '');
  if (profil === 'exploitant') return "Parlez d'abord de son activité : il vend son outil de travail ; la vente occupée lui permet de rester dans ses murs.";
  if (/70|soixante-dix|plus/.test(age) && /\d/.test(age)) return 'Abordez la transmission : à cet âge, un gérant pense souvent à la suite et à simplifier son patrimoine.';
  if (/sci/i.test(String(courte.forme || ''))) return "Une SCI raisonne en rendement : parlez loyer, taux et ce que la vente lui laisse net, chiffres à l'appui.";
  return "Écoutez d'abord ce qu'il attend de ses murs, puis montrez que des acheteurs cherchent déjà ce bien.";
}

/** Pure : la fin de bail estimée (bail 3-6-9 supposé, depuis l'arrivée de l'exploitant), toujours « à confirmer ». */
export function finDeBailEstimee(depuis, annee = new Date().getFullYear()) {
  const d = Number(depuis);
  if (!d || d < 1950 || d > annee) return null;
  let fin = d + 9;
  while (fin < annee) fin += 9;
  return { annee: fin, depuis: d, a_confirmer: true };
}

/** Les questions, selon le profil : les trois indispensables d'abord, puis les autres, puis celles nées du « à confirmer ». */
export function questionsDe({ profil, a_confirmer = [], forme = null }) {
  const indispensables = profil === 'exploitant'
    ? ['Ses projets : continuer, céder le fonds, partir à la retraite ?', 'Vendre les murs en restant dans les lieux (vente occupée, avec un bail à signer) : est-ce envisageable ?', 'Les charges et la taxe foncière : leur montant, et la copropriété']
    : ['Le bail et le loyer : date de signature, durée (3-6-9 ?), loyer actuel, indexation', 'Les charges et la taxe foncière : refacturées au locataire ?', 'La fin du bail, et ce que le locataire compte faire'];
  const autres = ['Les travaux faits ou à prévoir', 'Le prix qu’il a en tête, et son délai'];
  if (/sci|sarl|sas/i.test(String(forme || ''))) autres.push('Qui décide de la vente : le gérant seul, ou les associés ?');
  const nees = [];
  if (a_confirmer.includes('surface')) nees.push('La surface exacte (plan, bail ou titre)');
  if (a_confirmer.includes('fin_bail') && profil !== 'exploitant') nees.push('La date exacte de fin du bail (nous l’avons déduite)');
  if (a_confirmer.includes('gerant')) nees.push('Le gérant du registre est-il toujours le bon interlocuteur ?');
  return { indispensables, autres, a_confirmer: nees };
}

/** Les objections probables, deux ou trois, choisies selon le profil, avec la réponse. */
export function objectionsDe({ profil, forme = null, plafond = null, clients = 0 }) {
  const acheteurs = clients ? `${clients} client${clients > 1 ? 's' : ''} cherche${clients > 1 ? 'nt' : ''} déjà ce type de murs` : 'des investisseurs cherchent déjà ce type de murs';
  const liste = profil === 'exploitant'
    ? [
      { objection: 'Je ne veux pas quitter mes murs.', reponse: 'Vous n’avez pas à les quitter : on vend les murs occupés, vous signez un bail et vous restez chez vous, avec le prix de vente en poche.' },
      { objection: 'Je verrai à la retraite.', reponse: 'Vendre les murs avant de céder le fonds sépare les deux ventes : chacune se négocie mieux, et rien ne vous oblige à partir.' },
    ]
    : [
      { objection: 'Je ne suis pas pressé de vendre.', reponse: `Rien n’oblige à vendre aujourd’hui ; l’avis de valeur vous dit ce que valent vos murs, et ${acheteurs}.` },
      { objection: 'Mon locataire paie bien, pourquoi vendre ?', reponse: 'C’est justement ce qui fait la valeur : un bien loué et bien payé se vend au meilleur prix, au taux du marché.' },
      { objection: 'Votre prix est trop bas.', reponse: plafond ? `Le prix suit le loyer et le taux de la rue ; au-delà de ${k(plafond)}, plus aucun de nos clients ne suit. Regardons ensemble le loyer réel.` : 'Le prix suit le loyer et le taux de la rue : regardons ensemble le loyer réel et le bail, ce sont eux qui le font monter.' },
    ];
  if (/sci/i.test(String(forme || '')) && profil !== 'exploitant') liste.splice(1, 0, { objection: 'Je dois en parler à mes associés.', reponse: 'Bien sûr : je vous laisse l’avis de valeur écrit, pour qu’ils aient les mêmes chiffres que vous.' });
  return liste.slice(0, 3);
}

/** Les documents à demander, en liste à cocher. */
export function documentsDe(profil) {
  return profil === 'exploitant'
    ? ['Titre de propriété', 'Dernier avis de taxe foncière', 'Diagnostics (DPE, amiante)', 'Règlement de copropriété et 3 derniers PV d’AG', 'Kbis de la société']
    : ['Bail commercial et avenants', 'Dernier avis de taxe foncière', 'Dernier appel de charges', 'Diagnostics (DPE, amiante)', 'Règlement de copropriété et 3 derniers PV d’AG', 'Quittances ou état locatif'];
}

/** Pure : le mail qui envoie la liste des documents au propriétaire, préparé pour après le rendez-vous. */
export function mailDocuments({ nom = null, commerce = null, documents = [], recus = [] }) {
  const reste = documents.filter((d) => !recus.includes(d));
  return {
    objet: `Les documents pour l’avis de valeur${commerce ? ` · ${commerce}` : ''}`,
    texte: `Bonjour${nom ? ` ${nom}` : ''},\n\nMerci pour notre rendez-vous. Pour finaliser l’avis de valeur de vos murs, pourriez-vous me transmettre :\n${reste.map((d) => `- ${d}`).join('\n')}\n\nUne photo ou un scan suffit. Je reste à votre disposition.\n\nBien cordialement,`,
  };
}

/**
 * Pure : la préparation, depuis la fiche, son commerce (Off-market) ou sa cible (Prospection par rue), la fiche très
 * courte, les recherches clients compatibles, les ventes autour (DVF) et le rendez-vous. Les champs d'avant (murs,
 * locataire, rue, signal, clients, a_demander) restent : la notification de la veille et les tests les lisent.
 */
export function composerPreparation({ p = {}, commerce: cs = null, courte = {}, investisseurs = [], rdv = null, ventes = [], annee = new Date().getFullYear() } = {}) {
  const e = cs?.estimation || {};
  const prix = e.prix || null;
  const profil = profilDe(courte);
  const rue = [cs?.numero, cs?.rue].filter(Boolean).join(' ') || p.adresse || null;
  const ville = cs?.ville || p.ville || null;
  const fin = profil === 'bailleur' ? finDeBailEstimee(courte.depuis, annee) : null;
  const surfaceEstimee = Array.isArray(e.surface) && !e.surface_saisie;
  const a_confirmer = [surfaceEstimee ? 'surface' : null, fin ? 'fin_bail' : null, courte.gerant ? 'gerant' : null].filter(Boolean);
  const budgets = (investisseurs || []).map((x) => Number(x.budget_max) || 0).filter((n) => n > 0);
  const plafond = budgets.length ? Math.max(...budgets) : null;
  const taux = Number(e.taux) || null;
  const loyer = e.loyer_an || null;
  const sensibilite = [];
  if (taux && loyer?.haute && prix?.haute) sensibilite.push(`Si le loyer dépasse ${k(loyer.haute)} par an, la valeur passe au-dessus de ${k(prix.haute)}.`);
  if (taux && loyer?.basse && prix?.basse) sensibilite.push(`S’il est sous ${k(loyer.basse)}, elle descend sous ${k(prix.basse)}.`);
  if (taux) sensibilite.push(`Chaque 1 000 € de loyer en plus ajoute environ ${k((1000 / taux) * 100)}.`);
  return {
    v: 2,
    profil,
    // Les champs d'avant.
    pre_estimation: prix ? { basse: prix.basse ?? null, haute: prix.haute ?? null, moyenne: prix.moyenne ?? null, source: e.loyer_m2 ? 'loyer de marché ÷ taux de la ville' : null } : null,
    murs: { proprietaire: courte.proprietaire || p.nom || null, forme: courte.forme || null, gerant: courte.gerant ? [courte.gerant.nom, courte.gerant.age].filter(Boolean).join(', ') : null },
    locataire: [courte.exploitant || p.commerce || null, courte.depuis ? `depuis ${courte.depuis}` : null, cs?.activite || p.activite || null].filter(Boolean).join(' · ') || null,
    rue,
    signal: courte.signal || null,
    clients: (investisseurs || []).slice(0, 5).map((x) => [x.reference, x.budget].filter(Boolean).join(' · ')),
    a_demander: A_DEMANDER,
    rdv_le: rdv?.echeance || null,
    // 1. Le rendez-vous.
    rdv: rdv ? { le: rdv.echeance || null, adresse: [rue, ville && !String(rue || '').toLowerCase().includes(String(ville).toLowerCase()) ? ville : null].filter(Boolean).join(', ') || rdv.lieu || null, avec: rdv.avec || courte.gerant?.nom || p.nom || null, telephone: rdv.telephone || p.telephone || null, rappel_id: rdv.id || null, source: 'agenda' } : null,
    // 2. La personne.
    personne: {
      proprietaire: courte.proprietaire || p.nom || null, forme: courte.forme || null,
      gerant: courte.gerant?.nom || null, age: courte.gerant?.age || null, source: courte.proprietaire ? 'registre' : p.nom ? 'fiche' : null,
      deja_dit: dejaDit(p.historique), approche: approche({ profil, courte }),
    },
    // 3. Pourquoi il pourrait vendre.
    vendre: { signal: courte.signal || null, source: courte.signal ? 'registre et signaux' : null, accroche: courte.accroche || null, terrain: apprisSurLeTerrain(p.historique) },
    // 4. Le bien et le locataire.
    bien: {
      exploitant: courte.exploitant || p.commerce || null, depuis: courte.depuis || null, activite: cs?.activite || p.activite || null, rue, source: 'registre',
      surface: Array.isArray(e.surface) ? { basse: e.surface[0], haute: e.surface[1], source: e.surface_source ? 'estimation (OpenStreetMap)' : 'estimation', a_confirmer: surfaceEstimee } : null,
      loyer: loyer ? { basse: loyer.basse ?? null, haute: loyer.haute ?? null, connu: false, source: e.loyer_m2?.source ? 'Data-B, valeur locative de la rue' : 'estimation', a_confirmer: true } : null,
      fin_bail: fin,
    },
    // 5. La pré-estimation, interne.
    estimation: prix ? {
      basse: prix.basse ?? null, haute: prix.haute ?? null, moyenne: prix.moyenne ?? null,
      calcul: e.loyer_m2 && taux ? `Loyer de marché ${nbFr(e.loyer_m2.basse)} à ${nbFr(e.loyer_m2.haute)} €/m²${Array.isArray(e.surface) ? ` × ${e.surface[0]} à ${e.surface[1]} m²` : ''}, soit ${k(loyer?.basse)} à ${k(loyer?.haute)} par an, ÷ taux de ${String(taux).replace('.', ',')} %` : null,
      sources: [e.loyer_m2?.source || null, e.taux_source || null].filter(Boolean),
      sensibilite,
      comparables: (ventes || []).slice(0, 3).map((v) => ({ texte: [v.date ? String(v.date).slice(0, 4) : null, v.adresse || null, v.surface ? `${Math.round(v.surface)} m²` : null, v.prix ? k(v.prix) : null, v.prix_m2 ? `${nbFr(v.prix_m2)} €/m²` : null].filter(Boolean).join(' · '), source: 'DVF' })),
      source: 'estimation',
    } : null,
    // 6. Les clients compatibles.
    clients_compatibles: { liste: (investisseurs || []).slice(0, 5).map((x) => ({ reference: x.reference, budget: x.budget || null, pourquoi: x.pourquoi || null })), plafond, source: 'recherches clients' },
    // 7. Les questions à poser.
    questions: questionsDe({ profil, a_confirmer, forme: courte.forme }),
    // 8. Les objections probables.
    objections: objectionsDe({ profil, forme: courte.forme, plafond, clients: (investisseurs || []).length }),
    // 9. Les documents à demander.
    documents: documentsDe(profil),
  };
}

/** Le prochain rendez-vous d'une fiche (à venir, pas fait). */
export function rdvDe(id, { apres = Date.now() } = {}) {
  return Records.list('Rappel')
    .filter((r) => r.genre === 'rdv' && r.proprietaire_id === id && !r.fait_le && Date.parse(r.echeance || '') >= apres - 2 * 3600000)
    .sort((a, b) => String(a.echeance).localeCompare(String(b.echeance)))[0] || null;
}

/**
 * Prépare (ou met à jour) la préparation d'une fiche. `estimer` : sans prix estimé, l'estimation du commerce est lancée
 * d'abord (la même que dans Tous les commerces). Rend la fiche à jour.
 */
export async function preparer(id, { user = null, estimer = true } = {}) {
  let p = Records.get('ProprietaireMandataire', id);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  let cs = p.commerce_simple_id ? Records.get('CommerceSimple', p.commerce_simple_id) : null;
  if (estimer && cs && !cs.estimation?.prix) {
    try { await (await import('./off-market/simple.js')).estimerPrix(cs.id, { user }); } catch { /* sans prix, la préparation part quand même */ }
    cs = Records.get('CommerceSimple', cs.id);
  }
  const cible = p.cible_id ? Records.get('Cible', p.cible_id) : null;
  const { ficheCourte } = await import('./mandataire-matin.js');
  const { drapeauxDe } = await import('./off-market/simple.js');
  const courte = ficheCourte({ p, commerce: cs, cible, drapeaux: drapeauxDe });
  let investisseurs = [];
  try {
    const { matcheurInvestisseurs } = await import('./mandataire-agent.js');
    investisseurs = await (await matcheurInvestisseurs())({ ...(cible || {}), ...p, activite: p.activite || cs?.activite || cible?.activite, ville: p.ville || cs?.ville || cible?.ville });
  } catch { /* sans clients, la préparation part quand même */ }
  // Les ventes de locaux autour (DVF, 800 m), comme l'avis de valeur : deux ou trois comparables pour la pré-estimation.
  let ventes = [];
  const adresse = [cs?.numero, cs?.rue, cs?.code_postal, cs?.ville || p.ville].filter(Boolean).join(' ') || p.adresse || null;
  if (adresse && !process.env.NODE_TEST_CONTEXT) {
    try {
      const r = await (await import('./dvf.js')).ventesAutour(adresse, { rayon: 800, user });
      if (r.ok) ventes = (r.resultat?.ventes || []).filter((v) => v.prix && v.surface).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    } catch { /* sans ventes, la préparation part quand même */ }
  }
  const prep = composerPreparation({ p, commerce: cs, courte, investisseurs, rdv: rdvDe(p.id), ventes });
  p = Records.get('ProprietaireMandataire', id);
  // Ce que le mandataire a coché ou noté sur la page (documents reçus) survit à la mise à jour.
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', id, { preparation: { ...prep, documents_recus: p.preparation?.documents_recus || [], le: p.preparation?.le || maintenant(), maj_le: maintenant() } }) };
}

/** Lance la préparation en fond, sans faire attendre l'écran (au rendez-vous fixé). */
export function lancerPreparation(id, user) {
  if (process.env.NODE_TEST_CONTEXT) return;
  setTimeout(() => { preparer(id, { user }).catch((e) => console.error('[preparation] :', e?.message || e)); }, 0);
}

const jourParis = (d) => new Date(d).toLocaleDateString('fr-CA', { timeZone: PARIS });
const heureParis = (d) => Number(new Date(d).toLocaleString('fr-FR', { timeZone: PARIS, hour: '2-digit', hour12: false }).slice(0, 2));

/**
 * La veille à 18 h : chaque rendez-vous de demain voit sa préparation mise à jour, et son mandataire une notification
 * (une seule par rendez-vous). Rend le nombre de notifications posées.
 */
export async function tourDeLaVeille(quand = new Date()) {
  if (heureParis(quand) < 18) return 0;
  const demain = jourParis(new Date(quand.getTime() + 86400000));
  const { notifier } = await import('./notifications.js');
  let n = 0;
  for (const r of Records.list('Rappel').filter((x) => x.genre === 'rdv' && x.proprietaire_id && !x.fait_le && !x.preparation_notifiee && x.echeance && jourParis(x.echeance) === demain)) {
    const p = Records.get('ProprietaireMandataire', r.proprietaire_id);
    if (!p || p.exemple) continue;
    const fait = await preparer(p.id, { user: { email: p.mandataire_email } }).catch(() => null);
    const prep = fait?.proprietaire?.preparation || p.preparation || {};
    const heure = new Date(r.echeance).toLocaleTimeString('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    const prix = prep.pre_estimation?.basse ? `Pré-estimation ${Math.round(prep.pre_estimation.basse / 1000)} à ${Math.round(prep.pre_estimation.haute / 1000)} k€. ` : '';
    notifier({
      pour: p.mandataire_email,
      titre: `Demain ${heure}, ${p.commerce || p.nom || 'votre rendez-vous'} : votre préparation est prête`,
      texte: `${prix}${prep.signal ? `${prep.signal}. ` : ''}${(prep.clients || []).length ? `${prep.clients.length} client${prep.clients.length > 1 ? 's' : ''} compatible${prep.clients.length > 1 ? 's' : ''}.` : ''}`.trim() || null,
      lien: `/MandataireBiens?bien=proprietaire:${p.id}&etape=rdv`, action: 'Voir la préparation', genre: 'rdv', cle: `preparation-veille:${r.id}`,
    });
    Records.update('Rappel', r.id, { preparation_notifiee: maintenant() });
    n += 1;
  }
  return n;
}

/** Toutes les quinze minutes, sur Render (ou PREPARATION_RDV=1 en local) ; PREPARATION_RDV=0 l'arrête. */
export function planifier() {
  const actif = process.env.PREPARATION_RDV === '1' || (!!process.env.RENDER && process.env.PREPARATION_RDV !== '0');
  if (!actif) return null;
  const tour = () => {
    tourDeLaVeille().catch((e) => console.error('[preparation] veille :', e?.message || e));
    tourDeLHeure().catch((e) => console.error('[preparation] une heure avant :', e?.message || e));
  };
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  return t;
}

// ---------------------------------------------------------------------------
// Les gestes de la Pré-visite (26 oct. 2026) : décaler, annuler, cocher les documents, la visite et ses photos.
// ---------------------------------------------------------------------------

const sienne = (id, user) => {
  const p = Records.get('ProprietaireMandataire', id);
  return p && String(p.mandataire_email || '').toLowerCase() === String(user?.email || '').toLowerCase() ? p : null;
};
const noter = (p, texte, type = 'note') => [...(p.historique || []), { le: maintenant(), type, texte }];

/** « 2026-10-27T15:00 » (heure de Paris) → la date. Pure. */
export function depuisHeureParis(texte) {
  const m = String(texte || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, a, mo, j, h, mi] = m.map(Number);
  // L'écart de Paris ce jour-là (heure d'été ou d'hiver), lu sur la date elle-même.
  const utc = Date.UTC(a, mo - 1, j, h, mi);
  const paris = new Date(new Date(utc).toLocaleString('en-US', { timeZone: PARIS }));
  const ecart = paris.getTime() - new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - ecart);
}

/** Le rendez-vous décalé : nouvelle date, la préparation reste à jour, les notifications repartent pour la nouvelle date. */
export async function decalerRdv(id, quand, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const d = depuisHeureParis(quand);
  if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'Une date et une heure, au format AAAA-MM-JJTHH:MM.' };
  const r = rdvDe(p.id, { apres: 0 });
  if (r) Records.update('Rappel', r.id, { echeance: d.toISOString(), preparation_notifiee: null, heure_notifiee: null });
  else Records.create('Rappel', { espace: 'mandataire', genre: 'rdv', proprietaire_id: p.id, nom: p.commerce || p.nom || null, avec: p.nom || p.commerce || null, quoi: `RDV avec ${p.nom || p.commerce || 'le propriétaire'}`, telephone: p.telephone || null, echeance: d.toISOString(), cree_le: maintenant(), cree_par: user?.email || null, fait_le: null });
  const dit = d.toLocaleString('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  Records.update('ProprietaireMandataire', p.id, { historique: noter(p, `Rendez-vous décalé au ${dit}.`) });
  return preparer(p.id, { user, estimer: false });
}

/** Le rendez-vous annulé : l'affaire passe En pause, avec une relance. */
export async function annulerRdv(id, { motif = null, dans_jours = 30 } = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const r = rdvDe(p.id, { apres: 0 });
  if (r) Records.update('Rappel', r.id, { fait_le: maintenant(), annule: true, fait_par: user?.email || null });
  Records.update('ProprietaireMandataire', p.id, { historique: noter(p, `Rendez-vous annulé${motif ? ` : ${String(motif).slice(0, 200)}` : ''}.`) });
  const { mettreEnPause } = await import('./fiche-mandataire.js');
  return mettreEnPause(p.id, { argument: null, dans_jours }, user);
}

/** Les documents cochés (reçus ou promis), gardés sur la préparation. */
export function cocherDocuments(id, recus = [], user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const propres = [...new Set((recus || []).map((x) => String(x).slice(0, 120)))].slice(0, 30);
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, { preparation: { ...(p.preparation || {}), documents_recus: propres } }) };
}

/** Le mail qui demande les documents restants, préparé pour après le rendez-vous. */
export function mailDesDocuments(id, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const prep = p.preparation || {};
  return { ok: true, email: p.email || null, ...mailDocuments({ nom: prep.rdv?.avec || p.nom || null, commerce: p.commerce || null, documents: prep.documents || documentsDe(prep.profil), recus: prep.documents_recus || [] }) };
}

/**
 * La visite (« Démarrer la visite ») : les trois réponses clés, les documents récupérés et les photos, gardés sur la
 * fiche au fil du rendez-vous. À la sortie, le récit part au chat du bien, qui lance l'avis de valeur.
 */
export function noterVisite(id, { reponses = null, photo = null } = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const v = p.biens?.visite || { commencee_le: maintenant(), reponses: {}, photos: [] };
  const propres = Object.fromEntries(Object.entries(reponses || {}).filter(([cle]) => ['loyer', 'charges', 'fin_bail', 'projets', 'vente_occupee'].includes(cle)).map(([cle, x]) => [cle, String(x ?? '').slice(0, 400)]));
  const suite = { ...v, reponses: { ...(v.reponses || {}), ...propres }, photos: photo ? [...(v.photos || []), { url: photo.url, quoi: String(photo.quoi || 'photo').slice(0, 40), le: maintenant() }].slice(-20) : v.photos || [] };
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), visite: suite } }) };
}

/**
 * Une heure avant le rendez-vous : un rappel avec l'adresse et l'itinéraire (une seule fois par rendez-vous). Rend le
 * nombre de notifications posées. Tourne avec le tour de la veille.
 */
export async function tourDeLHeure(quand = new Date()) {
  const { notifier } = await import('./notifications.js');
  const t = quand.getTime();
  let n = 0;
  for (const r of Records.list('Rappel').filter((x) => x.genre === 'rdv' && x.proprietaire_id && !x.fait_le && !x.heure_notifiee && x.echeance)) {
    const dans = Date.parse(r.echeance) - t;
    if (dans <= 0 || dans > 75 * 60000) continue;
    const p = Records.get('ProprietaireMandataire', r.proprietaire_id);
    if (!p || p.exemple) continue;
    const prep = p.preparation || {};
    const adresse = prep.rdv?.adresse || prep.rue || p.adresse || r.lieu || null;
    const heure = new Date(r.echeance).toLocaleTimeString('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    notifier({
      pour: p.mandataire_email,
      titre: `À ${heure}, ${p.commerce || p.nom || 'votre rendez-vous'}`,
      texte: adresse ? `${adresse}. L'itinéraire et votre préparation sont dans la Visite du bien.` : 'Votre préparation est dans la Visite du bien.',
      lien: `/MandataireBiens?bien=proprietaire:${p.id}&etape=previsite`, action: 'Itinéraire et préparation', genre: 'rdv', cle: `preparation-heure:${r.id}`,
    });
    Records.update('Rappel', r.id, { heure_notifiee: maintenant() });
    n += 1;
  }
  return n;
}

/**
 * La préparation allégée d'un bien hors Prospection (26 oct. 2026) : à partir de l'adresse seule, la rue, les ventes
 * autour (DVF), les clients compatibles, les questions, les objections et les documents. Rien n'est gardé : elle se
 * compose à l'ouverture ; les blocs sans données ne s'affichent pas. Le propriétaire n'est pas cherché au registre.
 */
export async function preparationLegere({ adresse = null, ville = null, activite = null } = {}, user = null) {
  if (!adresse && !ville) return { ok: false, error: 'Il faut au moins une adresse.' };
  let investisseurs = [];
  try {
    const { matcheurInvestisseurs } = await import('./mandataire-agent.js');
    investisseurs = await (await matcheurInvestisseurs())({ ville: ville || String(adresse || '').split(',').pop()?.replace(/\d{5}/, '').trim(), activite });
  } catch { /* sans clients */ }
  let ventes = [];
  if (adresse && !process.env.NODE_TEST_CONTEXT) {
    try {
      const r = await (await import('./dvf.js')).ventesAutour([adresse, ville].filter(Boolean).join(' '), { rayon: 800, user });
      if (r.ok) ventes = (r.resultat?.ventes || []).filter((v) => v.prix && v.surface).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    } catch { /* sans ventes */ }
  }
  const prep = composerPreparation({ p: { adresse, ville, activite, historique: [] }, investisseurs, ventes });
  return { ok: true, preparation: { ...prep, legere: true, personne: null, vendre: null } };
}

// ---------------------------------------------------------------------------
// Le compte rendu de visite (27 oct. 2026, spécification de Jules) : à la sortie du rendez-vous, le mandataire parle à
// son assistant ; Haka retrouve le rendez-vous, fait confirmer le bien, structure le récit, met la fiche à jour (source
// « visite ») et DEMANDE toujours « Passer à l'estimation ? » : l'estimation n'est jamais lancée sans son oui. Interne :
// rien ne part vers le propriétaire. Rien n'est écrasé sans le dire : un chiffre dicté qui diffère de ce que la fiche ou
// la préparation savait est montré avec l'ancien.
// ---------------------------------------------------------------------------

/**
 * Le rendez-vous qui vient d'avoir lieu (ou qui a lieu) : les rendez-vous de ce mandataire entre 12 h avant et 2 h
 * après maintenant, le plus proche d'abord. Rend les candidats ; un seul, Haka le fait confirmer, plusieurs, il propose
 * le choix.
 */
export function visiteDuMoment(user, quand = new Date()) {
  const moi = String(user?.email || '').toLowerCase();
  const t = quand.getTime();
  return Records.list('Rappel')
    .filter((r) => r.genre === 'rdv' && r.proprietaire_id && r.echeance && !r.annule)
    .map((r) => ({ r, p: Records.get('ProprietaireMandataire', r.proprietaire_id), ecart: Date.parse(r.echeance) - t }))
    .filter(({ p, ecart }) => p && String(p.mandataire_email || '').toLowerCase() === moi && ecart <= 2 * 3600000 && ecart >= -12 * 3600000)
    .sort((a, b) => Math.abs(a.ecart) - Math.abs(b.ecart))
    .slice(0, 3)
    .map(({ r, p }) => ({ fiche_id: p.id, bien: [p.commerce || p.nom, p.ville].filter(Boolean).join(' · '), adresse: p.preparation?.rdv?.adresse || p.adresse || null, rdv_le: r.echeance, heure: new Date(r.echeance).toLocaleTimeString('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }) }));
}

const texteCourt = (x, n = 300) => (x == null || x === '' ? null : String(x).replace(/\s+/g, ' ').trim().slice(0, n));
const liste = (l, n = 12) => (Array.isArray(l) ? l.map((x) => texteCourt(x, 160)).filter(Boolean).slice(0, n) : []);
const nombre = (x) => { const v = Number(String(x ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure : le compte rendu propre, depuis ce que Haka a structuré du récit. */
export function nettoyerCompteRendu(cr = {}) {
  const b = cr.bien || {}; const e = cr.etat || {}; const pr = cr.proprietaire || {}; const lo = cr.locataire || {}; const d = cr.documents || {};
  return {
    bien: {
      loyer_annuel: nombre(b.loyer_annuel), charges: texteCourt(b.charges), taxe_fonciere: texteCourt(b.taxe_fonciere),
      refacturees: typeof b.refacturees === 'boolean' ? b.refacturees : null, bail_date: texteCourt(b.bail_date, 40), fin_bail: texteCourt(b.fin_bail, 40),
      surface: nombre(b.surface), travaux: texteCourt(b.travaux),
    },
    etat: { local: texteCourt(e.local), passage: texteCourt(e.passage), voisinage: texteCourt(e.voisinage) },
    proprietaire: { prix: nombre(pr.prix), delai: texteCourt(pr.delai, 120), intentions: texteCourt(pr.intentions), decideur: texteCourt(pr.decideur, 120), vendeur: typeof pr.vendeur === 'boolean' ? pr.vendeur : null },
    locataire: { intentions: texteCourt(lo.intentions), solidite: texteCourt(lo.solidite) },
    documents: { remis: liste(d.remis), promis: liste(d.promis), a_demander: liste(d.a_demander) },
    a_confirmer: liste(cr.a_confirmer),
    reponses: (Array.isArray(cr.reponses) ? cr.reponses : []).map((x) => ({ question: texteCourt(x?.question, 200), reponse: texteCourt(x?.reponse) })).filter((x) => x.question).slice(0, 20),
  };
}

/** Pure : les questions de la préparation, chacune marquée répondue ou non d'après le compte rendu. */
export function questionsReprises(prep = {}, cr = {}) {
  const q = prep?.questions || {};
  const toutes = [...(q.indispensables || []), ...(q.autres || []), ...(q.a_confirmer || [])];
  const reps = (cr.reponses || []).filter((x) => x.reponse);
  return toutes.map((question) => {
    const n = normaliser(question);
    const r = reps.find((x) => { const m = normaliser(x.question); return m && (m === n || n.startsWith(m.slice(0, 24)) || m.startsWith(n.slice(0, 24))); });
    return { question, repondue: !!r, reponse: r?.reponse || null };
  });
}

/** Pure : ce que le récit dit autrement que la fiche, la préparation ou un compte rendu d'avant (les deux sont montrés). */
export function ecartsCompteRendu({ cr = {}, prep = {}, avant = null }) {
  const ecarts = [];
  const k = (n) => `${Math.round(n / 1000).toLocaleString('fr-FR')} k€`;
  const loyer = cr.bien?.loyer_annuel;
  const probable = prep?.bien?.loyer;
  if (loyer && probable?.basse && probable?.haute && (loyer < probable.basse * 0.85 || loyer > probable.haute * 1.15)) ecarts.push({ champ: 'loyer', dit: `${k(loyer)} par an`, connu: `${k(probable.basse)} à ${k(probable.haute)} (loyer probable, ${probable.source || 'estimation'})` });
  const surface = cr.bien?.surface;
  const s = prep?.bien?.surface;
  if (surface && s?.basse && s?.haute && (surface < s.basse * 0.85 || surface > s.haute * 1.15)) ecarts.push({ champ: 'surface', dit: `${surface} m²`, connu: `${s.basse} à ${s.haute} m² (${s.source || 'estimation'})` });
  const fin = cr.bien?.fin_bail;
  const finEst = prep?.bien?.fin_bail?.annee;
  if (fin && finEst && !String(fin).includes(String(finEst))) ecarts.push({ champ: 'fin_bail', dit: fin, connu: `${finEst} (déduite)` });
  if (avant) {
    for (const [champ, dit, connu] of [['loyer', cr.bien?.loyer_annuel, avant.bien?.loyer_annuel], ['surface', cr.bien?.surface, avant.bien?.surface], ['prix', cr.proprietaire?.prix, avant.proprietaire?.prix]]) {
      if (dit && connu && dit !== connu && !ecarts.some((x) => x.champ === champ)) ecarts.push({ champ, dit: String(dit), connu: `${connu} (compte rendu précédent)` });
    }
  }
  return ecarts;
}

/** Pure : le compte rendu en une ligne, pour l'historique de l'affaire. */
export function resumeCompteRendu(cr) {
  const k = (n) => `${Math.round(n / 1000).toLocaleString('fr-FR')} k€`;
  return [
    'Compte rendu de visite',
    cr.bien.loyer_annuel ? `loyer ${k(cr.bien.loyer_annuel)}/an` : null,
    cr.bien.surface ? `${cr.bien.surface} m²` : null,
    cr.bien.fin_bail ? `fin de bail ${cr.bien.fin_bail}` : null,
    cr.proprietaire.prix ? `prix en tête ${k(cr.proprietaire.prix)}` : null,
    cr.proprietaire.delai ? `délai ${cr.proprietaire.delai}` : null,
    cr.proprietaire.vendeur === false ? "n'est plus vendeur" : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Enregistre le compte rendu sur la fiche (source « visite ») et l'historique, coche les documents remis, prépare le
 * mail des documents. Rend le compte rendu, les écarts, les questions sans réponse et les boutons : « Passer à
 * l'estimation ? » Oui / Non, ou, s'il n'est plus vendeur, En pause / Perdu. Ne lance rien.
 */
export function enregistrerCompteRendu(id, brut = {}, user, { photo = null } = {}) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const cr = nettoyerCompteRendu(brut);
  const prep = p.preparation || {};
  const avant = p.biens?.compte_rendu || null;
  const ecarts = ecartsCompteRendu({ cr, prep, avant });
  const questions = questionsReprises(prep, cr);
  // Un document remis coche celui de la liste qui lui ressemble (un mot de cinq lettres en commun : « bail », « taxe »…).
  const pareil = (x) => (prep.documents || []).find((d) => normaliser(x).split(' ').some((m) => m.length >= 4 && normaliser(d).includes(m))) || x;
  const recus = [...new Set([...(prep.documents_recus || []), ...cr.documents.remis.map(pareil)])];
  const visite = p.biens?.visite || { photos: [] };
  const photos = photo ? [...(visite.photos || []), { url: photo.url, quoi: 'visite', le: maintenant() }].slice(-20) : visite.photos || [];
  const compteRendu = { ...cr, source: 'visite', le: maintenant(), ecarts, questions };
  Records.update('ProprietaireMandataire', p.id, {
    biens: { ...(p.biens || {}), compte_rendu: compteRendu, visite: { ...visite, photos, faite_le: visite.faite_le || maintenant() } },
    preparation: { ...prep, documents_recus: recus },
    historique: [...(p.historique || []), { le: maintenant(), type: 'visite', texte: resumeCompteRendu(cr) }],
  });
  const mail = mailDocuments({ nom: prep.rdv?.avec || p.nom || null, commerce: p.commerce || null, documents: [...new Set([...(prep.documents || documentsDe(prep.profil)), ...cr.documents.a_demander])], recus });
  const plusVendeur = cr.proprietaire.vendeur === false;
  return {
    ok: true,
    fiche_id: p.id,
    compte_rendu: compteRendu,
    ecarts,
    sans_reponse: questions.filter((x) => !x.repondue).map((x) => x.question),
    documents_a_demander: mail.texte.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)),
    mail_documents: mail,
    question: plusVendeur ? "Il n'est plus vendeur : mettre le bien en pause, ou le passer en Perdu ?" : "Passer à l'estimation ?",
    boutons: plusVendeur
      ? [{ libelle: 'Mettre en pause', texte: 'Mets le bien en pause, avec une relance.', principal: true }, { libelle: 'Perdu', texte: "Passe le bien en Perdu : il n'est plus vendeur." }]
      : [{ libelle: "Oui, passer à l'estimation", texte: "Oui, passe à l'estimation avec le compte rendu.", href: `/MandataireBiens?bien=proprietaire:${p.id}&etape=estimation`, principal: true }, { libelle: 'Non, pas maintenant', texte: "Non, pas d'estimation pour l'instant." }],
  };
}
