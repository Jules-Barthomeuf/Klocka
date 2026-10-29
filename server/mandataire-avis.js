// L'avis de valeur du mandataire, mené par le chat.
//
// Le mandataire dit le bien ; l'assistant pose les questions qu'il faut, et
// seulement celles-là : un local commercial occupé n'appelle pas les mêmes
// que des bureaux libres ou un immeuble de rapport. Un bail joint en pièce
// répond à la moitié d'un coup. Quand l'essentiel est là, l'avis se rédige :
// le marché de la rue (Data-B, Equimmox), les ventes alentour (DVF), les deux
// méthodes, la fourchette. Les CHIFFRES se calculent ici (loyer ÷ taux,
// surface × prix, sensibilité, valeur libre, honoraires) ; le modèle écrit les
// phrases et choisit le taux dans une fourchette qu'il doit justifier.
//
// L'avis s'ouvre ensuite dans un éditeur au format du modèle K Partners : le
// mandataire retouche ce qu'il veut, puis l'imprime en PDF. Ses mentions
// légales (RSAC, carte T, signature, photo) viennent de sa fiche, tenue par
// l'admin : il ne les ressaisit jamais.

import { effortDuChat } from './ak/effort.js';
import { Records } from './db.js';

const ENTITE = 'EstimationMandataire';
const moi = (user) => String(user?.email || '').toLowerCase();
const PARIS = 'Europe/Paris';

export const TYPES_BIEN = {
  murs_commerce: 'Murs commerciaux',
  bureaux: 'Bureaux',
  local_activite: "Local d'activité ou entrepôt",
  immeuble: 'Immeuble de rapport',
  autre: 'Autre bien professionnel',
};

// Ce qu'il faut savoir, par type et par situation (occupé ou libre). Les clés
// optionnelles se demandent, mais « je ne sais pas » laisse « [à compléter] ».
const COMMUNS = ['type_bien', 'occupe', 'adresse', 'demandeur', 'surface_utile', 'etat', 'date_visite'];
// Les murs commerciaux s'estiment par Data-B : ses critères ajustent le taux.
// « nc » (on ne sait pas) est une réponse : elle ne bloque rien.
const CRITERES_DATA_B = ['etat_immeuble', 'etat_local', 'angle', 'extraction', 'parking', 'pmr'];
const CRITERES_DATA_B_OCCUPE = ['franchise', 'anciennete_locataire', 'retards_paiement', 'licence_4'];
const PAR_TYPE = {
  murs_commerce: ['facade', 'emplacement', ...CRITERES_DATA_B],
  bureaux: ['etage', 'stationnement'],
  local_activite: ['hauteur', 'acces_poids_lourds'],
  immeuble: ['nb_lots', 'composition'],
  autre: ['description'],
};
const OCCUPE = ['locataire', 'activite_locataire', 'bail_type', 'date_effet', 'echeance', 'loyer_annuel_hc', 'indexation', 'taxe_fonciere', 'charges'];
const OPTIONNELS = ['reserve', 'zones', 'configuration', 'equipements', 'copropriete', 'travaux_votes', 'urbanisme', 'diagnostics', 'servitudes', 'depot_garantie', 'paiements', 'ca_locataire', 'travaux_locataire', 'environnement', 'flux', 'acces', 'vacance'];

/** Pure : ce qui manque encore pour rédiger, selon le type et l'occupation. */
export function manquants(q) {
  const requis = [...COMMUNS, ...(PAR_TYPE[q.type_bien] || []), ...(q.occupe === true ? OCCUPE : []),
    ...(q.type_bien === 'murs_commerce' && q.occupe === true ? CRITERES_DATA_B_OCCUPE : [])];
  return requis.filter((k) => q[k] == null || q[k] === '');
}

/**
 * Pure : le premier nombre d'un texte, milliers espacés compris :
 * « 21 600 € » → 21600, « 85 m² au rdc, réserve 25 m² » → 85, « 5,9 % » → 5.9.
 * Jamais tous les chiffres collés bout à bout.
 */
export function premierNombre(t) {
  if (typeof t === 'number') return t;
  const m = String(t || '').match(/\d{1,3}(?:[ \u00a0\u202f.]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const brut = m[0];
  const n = /[ \u00a0\u202f]/.test(brut) || /\.\d{3}(?!\d)/.test(brut) && !/,/.test(brut)
    ? Number(brut.replace(/[ \u00a0\u202f.]/g, '').replace(',', '.'))
    : Number(brut.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// --- Le questionnaire en cours ----------------------------------------------

function enCours(user, conversationId = null) {
  // Une conversation tient son avis, en cours ou déjà rédigé.
  if (conversationId) {
    const lie = Records.list(ENTITE)
      .filter((e) => e.mandataire_email === moi(user) && e.conversation_id === conversationId)
      .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0];
    if (lie) return lie.questionnaire_en_cours ? lie : null;
  }
  return Records.list(ENTITE)
    .filter((e) => e.mandataire_email === moi(user) && e.questionnaire_en_cours && (!conversationId || orphelinRecent(e)))
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0] || null;
}

/** Un avis commencé au premier message, avant que la conversation ait son identifiant. */
const orphelinRecent = (e) => !e.conversation_id && Date.now() - Date.parse(e.cree_le) < 10 * 60000;

/** Le dernier avis rédigé de la conversation (deux heures) : il reste corrigeable par le chat. */
function dernierRedige(user, conversationId = null) {
  // L'avis rédigé de cette conversation, quel que soit son âge ; sans
  // conversation connue, le dernier des deux dernières heures.
  if (conversationId) {
    const lie = Records.list(ENTITE)
      .filter((e) => e.mandataire_email === moi(user) && e.conversation_id === conversationId && e.avis)
      .sort((a, b) => String(b.prete_le || '').localeCompare(String(a.prete_le || '')))[0];
    if (lie) return lie;
  }
  return Records.list(ENTITE)
    .filter((e) => e.mandataire_email === moi(user) && e.avis && e.prete_le && Date.now() - Date.parse(e.prete_le) < 2 * 3600000 && !conversationId)
    .sort((a, b) => String(b.prete_le).localeCompare(String(a.prete_le)))[0] || null;
}

const titreDe = (q) => [TYPES_BIEN[q.type_bien] || 'Bien', q.adresse].filter(Boolean).join(' · ');

export function commencer({ type_bien, adresse = null, demandeur = null }, user, conversationId = null) {
  for (const e of Records.list(ENTITE).filter((x) => x.mandataire_email === moi(user) && x.questionnaire_en_cours && (!conversationId || !x.conversation_id || x.conversation_id === conversationId))) {
    Records.update(ENTITE, e.id, { questionnaire_en_cours: false });
  }
  const q = { type_bien: TYPES_BIEN[type_bien] ? type_bien : 'autre', adresse, demandeur };
  const e = Records.create(ENTITE, {
    mandataire_email: moi(user), conversation_id: conversationId, bien: titreDe(q), adresse, statut: 'brouillon', questionnaire_en_cours: true, questionnaire: q,
    cree_le: new Date().toISOString(), historique: [{ le: new Date().toISOString(), par: user?.email || null, action: 'avis commencé par le chat' }],
  });
  return { ok: true, estimation_id: e.id, manquants: manquants(q) };
}

export function noter(reponses, user, conversationId = null) {
  // Une correction après la rédaction rouvre le dernier avis (il se rédigera de nouveau).
  let e = enCours(user, conversationId);
  if (!e) {
    const d = dernierRedige(user, conversationId);
    if (d) { Records.update(ENTITE, d.id, { questionnaire_en_cours: true }); e = Records.get(ENTITE, d.id); }
  }
  if (!e) return { ok: false, error: 'Aucun avis en cours : commence par commencer_avis.' };
  const q = { ...(e.questionnaire || {}) };
  for (const [k, v] of Object.entries(reponses || {})) {
    if (v === undefined) continue;
    q[k] = typeof v === 'string' ? v.trim() : v;
  }
  for (const k of ['loyer_annuel_hc', 'surface_utile']) if (q[k] != null && typeof q[k] !== 'number') q[k] = premierNombre(q[k]) ?? q[k];
  // Ce que le chat vient d'apprendre l'emporte sur une retouche à la main du même champ.
  const surcouche = sansChampsRepondus(e.surcouche, Object.keys(reponses || {}));
  Records.update(ENTITE, e.id, { questionnaire: q, ...(e.nom_choisi ? {} : { bien: titreDe(q) }), adresse: q.adresse || e.adresse, ...(surcouche !== e.surcouche ? { surcouche } : {}) });
  return { ok: true, manquants: manquants(q), optionnels_non_renseignes: OPTIONNELS.filter((k) => q[k] == null) };
}

// --- La rédaction ------------------------------------------------------------

const arrondi = (v, pas = 5000) => Math.round(v / pas) * pas;
const pct = (n) => Math.round(n * 1000) / 10;

/** Pure : les chiffres de l'avis, depuis le questionnaire et les choix de taux et de prix. */
export function chiffrer(q, { taux, prix_m2, loyer_marche_m2 = null, taux_libre = null, remise_en_etat = 15000, honoraires = 0.05, frais = 0.075, dataB = null }) {
  const surface = Number(q.surface_utile) || null;
  const loyer = q.occupe ? Number(q.loyer_annuel_hc) || null : null;
  const cap = loyer && taux ? loyer / (taux / 100) : null;
  const comp = surface && prix_m2 ? surface * prix_m2 : null;
  // Comme dans le modèle : occupé, la capitalisation du loyer fait la valeur
  // (méthode principale) et la comparaison la recoupe ; libre, la comparaison
  // seule. La fourchette vient de la sensibilité au taux, autour de la valeur.
  // L'estimation de Data-B, quand elle est là, fait la valeur et la fourchette.
  const brute = dataB?.moyenne || cap || comp;
  if (!brute) return null;
  const valeur = dataB?.moyenne || arrondi(brute, brute > 1e6 ? 10000 : 5000);
  const bas = dataB?.basse || (cap ? arrondi(loyer / ((taux + 0.2) / 100)) : arrondi(valeur * 0.96));
  const haut = dataB?.haute || (cap ? arrondi(loyer / ((taux - 0.15) / 100)) : arrondi(valeur * 1.03));
  const ecart = cap && comp ? Math.round(((comp - cap) / cap) * 100) : null;
  const rendement = loyer ? pct(loyer / valeur) : null;
  const loyerMarche = loyer_marche_m2 && surface ? loyer_marche_m2 * surface : null;
  let valeurLibre = null;
  if (q.occupe && loyerMarche) {
    const t = (taux_libre || taux + 0.6) / 100;
    valeurLibre = arrondi(loyerMarche / t - loyerMarche - remise_en_etat, 10000);
  }
  const prixAffiche = Math.round(valeur * (1 + honoraires) / 100) * 100;
  return {
    ecart_methodes: ecart,
    capitalisation: cap ? Math.round(cap / 1000) * 1000 : dataB?.moyenne || null,
    comparaison: comp ? Math.round(comp / 100) * 100 : null,
    sensibilite: loyer && taux ? { taux_bas: taux - 0.15, valeur_basse_taux: Math.round(loyer / ((taux - 0.15) / 100) / 100) * 100, taux_haut: taux + 0.2, valeur_haute_taux: Math.round(loyer / ((taux + 0.2) / 100) / 100) * 100 } : null,
    valeur, bas: Math.min(bas, valeur), haut: Math.max(haut, valeur), rendement,
    loyer_marche: loyerMarche ? Math.round(loyerMarche / 100) * 100 : null,
    valeur_libre: valeurLibre,
    honoraires_pct: honoraires * 100,
    prix_affiche: prixAffiche,
    rendement_affiche: loyer ? pct(loyer / prixAffiche) : null,
    cout_total: Math.round(prixAffiche * (1 + frais) / 1000) * 1000,
    rendement_total: loyer ? pct(loyer / (prixAffiche * (1 + frais))) : null,
    frais_pct: frais * 100,
  };
}

const SCHEMA_AVIS = {
  type: 'object',
  properties: {
    taux: { type: 'number', description: 'Taux de rendement brut retenu (%), ex. 5.9' },
    justification_taux: { type: 'string', description: 'Pourquoi ce taux, en comparant aux références (2 à 3 phrases)' },
    prix_m2: { type: 'number', description: 'Prix retenu en € par m² utile, pour la méthode par comparaison' },
    justification_prix: { type: 'string' },
    resume_bien: { type: 'string', description: 'Une phrase qui décrit le bien (surface, niveau, réserve)' },
    description: {
      type: 'object',
      properties: { designation: { type: 'string' }, configuration: { type: 'string' }, facade: { type: 'string' }, equipements: { type: 'string' }, etat: { type: 'string' } },
    },
    emplacement: {
      type: 'object',
      properties: { synthese: { type: 'string' }, flux: { type: 'string' }, environnement: { type: 'string' }, vacance: { type: 'string' }, acces: { type: 'string' }, vigilance: { type: 'string' } },
    },
    locatif: {
      type: 'object',
      properties: { synthese: { type: 'string' }, solidite: { type: 'string' }, valeur_locative: { type: 'string' } },
    },
    juridique: {
      type: 'object',
      properties: { synthese: { type: 'string' }, copropriete: { type: 'string' }, travaux: { type: 'string' }, urbanisme: { type: 'string' }, diagnostics: { type: 'string' }, technique: { type: 'string' }, servitudes: { type: 'string' } },
    },
    lecture_marche: { type: 'string', description: 'Ce que disent les références, 2 à 3 phrases' },
    synthese_methodes: { type: 'string' },
    points_a_traiter: { type: 'array', items: { type: 'string' }, description: 'Ce qu\'il faut régler avant la mise en vente' },
  },
  required: ['taux', 'prix_m2', 'justification_taux', 'description', 'emplacement', 'points_a_traiter'],
};

/** La fiche du mandataire : ce qui figure sur tous ses avis, tenu par l'admin. */
export function signataire(user) {
  const f = Records.list('FicheMandataire').find((x) => x.email === moi(user)) || {};
  const u = Records.list('User').find((x) => String(x.email).toLowerCase() === moi(user)) || {};
  return {
    nom: f.nom_avis || u.full_name || user?.full_name || null,
    qualite: f.qualite_avis || 'agent commercial',
    ville_rsac: f.ville_rsac || null,
    rsac: f.rsac || null,
    carte_t: f.carte_t || null,
    telephone: f.telephone || null,
    email: f.email_avis || moi(user),
    ville_signature: f.ville_signature || null,
    // La photo de la fiche (posée par l'admin ou par le mandataire sur sa
    // page Compte), sinon celle du compte (Google ou déposée).
    photo: f.photo_url || u.picture || null,
    signature: f.signature_url || null,
  };
}

const RESERVES = `Cet avis de valeur ne constitue pas une expertise au sens de la charte de l'expertise en évaluation immobilière. Il n'a pas de valeur opposable devant un tiers ou une juridiction. Il repose sur les documents remis par le demandeur et sur une visite non technique, sans vérification des surfaces par un géomètre. Il est valable 6 mois à compter de sa date, sous réserve d'une évolution significative du marché ou de la situation locative.`;

const jourLong = (d = new Date()) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS }).replace(/^1 /, '1er ');

/**
 * Rédige l'avis du questionnaire en cours : marché, ventes, deux méthodes,
 * chiffres, textes. Rend l'estimation avec son `avis` prêt à l'éditeur.
 */
export async function rediger(user, { surEtape = null, aLaMain = false, conversationId = null } = {}) {
  const e = enCours(user, conversationId);
  if (!e) return { ok: false, error: 'Aucun avis en cours.' };
  const q = e.questionnaire || {};
  const reste = manquants(q);
  // « À la main » : le mandataire complétera dans l'éditeur ce qui manque.
  if (reste.length && !aLaMain) return { ok: false, manquants: reste, error: `Il manque encore : ${reste.join(', ')}.` };
  // Des chiffres impossibles se signalent au lieu de produire un avis absurde.
  const surf = Number(q.surface_utile);
  if ((q.surface_utile != null || !aLaMain) && !(surf > 5 && surf < 50000)) return { ok: false, error: `La surface utile enregistrée (${q.surface_utile}) n'est pas plausible : demande-la de nouveau en une ligne, en m².` };
  if (q.occupe && (q.loyer_annuel_hc != null || !aLaMain) && !(Number(q.loyer_annuel_hc) > 500 && Number(q.loyer_annuel_hc) < 20000000)) return { ok: false, error: `Le loyer annuel enregistré (${q.loyer_annuel_hc}) n'est pas plausible : demande-le de nouveau, en € HT HC par an.` };

  // L'adresse précise (BAN) : pour le marché, les ventes, la photo de façade.
  let lieu = null;
  try {
    const { resoudreAdresse } = await import('./adresse-ban.js');
    lieu = await resoudreAdresse(q.adresse);
    if (lieu) surEtape?.(`Adresse reconnue : ${[lieu.numero, lieu.rue].filter(Boolean).join(' ')}, ${lieu.ville || ''}`.trim());
  } catch { /* le marché se lira quand même sur le texte */ }

  surEtape?.('Lecture du marché locatif de la rue (Equimmox, Data-B)');
  let marche = null;
  try {
    const { valeurLocative } = await import('./valeur-locative.js');
    const r = await valeurLocative(q.adresse, { user });
    if (r.ok) marche = r.resultat;
  } catch (err) { console.warn(`[avis] marché : ${err?.message || err}`); }

  surEtape?.('Les ventes de locaux autour (DVF)');
  let ventes = null;
  try {
    const { ventesAutour } = await import('./dvf.js');
    const r = await ventesAutour(q.adresse, { rayon: 800, user });
    if (r.ok) ventes = r.resultat;
  } catch (err) { console.warn(`[avis] DVF : ${err?.message || err}`); }
  const references = (ventes?.ventes || [])
    .filter((v) => v.prix && v.surface)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5)
    .map((v) => ({ date: String(v.date || '').slice(0, 4), bien: v.nature || 'Local commercial', adresse: v.adresse || null, surface: Math.round(v.surface), prix: v.prix, prix_m2: v.prix_m2, distance_m: v.distance_m ?? null }));

  const niveau = marche?.rue || marche?.quartier || marche?.ville || null;
  const loyerMarcheM2 = niveau?.moyenne ?? (niveau?.basse != null && niveau?.haute != null ? (niveau.basse + niveau.haute) / 2 : null);

  // Les murs commerciaux : l'estimation de Data-B (taux du secteur pour
  // l'activité, ajusté par ses critères). Libre, sur le loyer de marché.
  let dataB = null;
  if (q.type_bien === 'murs_commerce') {
    surEtape?.('Data-B : taux de rendement des murs pour ce secteur et cette activité');
    try {
      const { rendementDeBase, estimerMurs } = await import('./data-b-murs.js');
      const r = await rendementDeBase(q.adresse, { activite: q.activite_data_b || q.activite_locataire || q.activite || null, user });
      const loyerRetenu = q.occupe ? Number(q.loyer_annuel_hc) || null : (loyerMarcheM2 && Number(q.surface_utile) ? loyerMarcheM2 * Number(q.surface_utile) : null);
      if (r.ok) {
        const criteres = { ...Object.fromEntries(['etat_immeuble', 'etat_local', 'angle', 'extraction', 'parking', 'pmr', 'franchise', 'anciennete_locataire', 'retards_paiement', 'licence_4'].map((k) => [k, q[k]])), date_renouvellement: q.echeance || null };
        const est = estimerMurs({ base: r.resultat.taux_base, loyer: loyerRetenu, criteres });
        if (est) {
          dataB = { ...est, activite: r.resultat.activite, source: r.resultat.source, loyer: loyerRetenu, loyer_de_marche: !q.occupe };
          surEtape?.(`Data-B : ${String(est.taux_base).replace('.', ',')} % pour ${r.resultat.activite}, ajusté à ${String(est.taux).replace('.', ',')} %`);
        } else surEtape?.('Data-B : pas de loyer pour calculer, la comparaison prend le relais');
      } else {
        console.warn(`[avis] Data-B murs : ${r.error}`);
        surEtape?.('Data-B indisponible : le taux se choisit sur les références');
      }
    } catch (err) { console.warn(`[avis] Data-B murs : ${err?.message || err}`); }
  }
  // L'estimation multicritères d'Equimmox (26 oct. 2026, Jules) : offres actuelles, offres anciennes, transactions DVF
  // et capitalisation, pondérées 2-1-1-2 ; son rapport fait la valeur, la fourchette et les comparables de l'avis (et
  // donc du deck). Sans Equimmox (pas configuré, pas de réponse, type non estimable), la méthode d'avant prend le relais.
  let equimmox = null;
  {
    const X = await import('./equimmox-estimation.js');
    const { equimmoxConfigure } = await import('./equimmox.js');
    const classe = X.CLASSE_DU_TYPE[q.type_bien] || null;
    if (classe && equimmoxConfigure()) {
      const params = {
        classe, adresse: q.adresse, surface: Number(q.surface_utile) || null, etat: X.etatEquimmox(q),
        annee: Number(q.annee_construction) || null, occupe: !!q.occupe, loyer: q.occupe ? Number(q.loyer_annuel_hc) || null : null,
        // Le taux moyen du secteur : celui de Data-B pour l'activité, avant les ajustements du bien (Jules, 26 oct. 2026).
        taux: dataB?.taux_base || null, investissement: Number(q.investissement_a_prevoir) || null,
      };
      surEtape?.('Equimmox : estimation multicritères (offres, transactions, capitalisation)');
      const r = await X.estimerSurEquimmox(e.id, params, { surEtape, user });
      if (r.ok) equimmox = r.equimmox;
      else surEtape?.(r.manque ? `Equimmox : il manque ${r.manque.join(', ')}, méthode d'avant` : `Equimmox indisponible (${r.error}) : méthode d'avant`);
    }
  }
  surEtape?.(niveau?.basse != null && niveau?.haute != null
    ? `Loyers de marché : ${Math.round(niveau.basse)} à ${Math.round(niveau.haute)} €/m²/an`
    : 'Marché locatif indisponible : l\u2019avis le dira');
  surEtape?.(references.length
    ? `${references.length} vente${references.length > 1 ? 's' : ''} comparable${references.length > 1 ? 's' : ''} retenue${references.length > 1 ? 's' : ''} (DVF, 800 m)`
    : 'Aucune vente comparable exploitable autour');

  surEtape?.('Choix du taux de rendement et rédaction des analyses');
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const { resultat: brut } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invokeLLM({
    prompt:
      `Tu rédiges, pour un mandataire du réseau K Partners, un AVIS DE VALEUR de ${TYPES_BIEN[q.type_bien] || 'bien professionnel'}${q.occupe ? ' occupé' : ' libre'}. Ton ton : celui d'un professionnel de l'immobilier d'entreprise, phrases courtes, concrètes, sans emphase. N'invente AUCUN fait : ce qui n'est pas dans le questionnaire ou les données reste « [à compléter] ». Le taux et le prix au m² se justifient par les références ; les chiffres finaux sont calculés par le serveur, tu ne les écris pas.\n\n` +
      `Nous sommes le ${jourLong()}.\n\n` +
      `QUESTIONNAIRE (réponses du mandataire) :\n${JSON.stringify(q, null, 1).slice(0, 6000)}\n\n` +
      `MARCHÉ LOCATIF (€/m²/an, Equimmox / Data-B) :\n${marche ? JSON.stringify({ rue: marche.rue, quartier: marche.quartier, ville: marche.ville, source: marche.source }).slice(0, 2500) : '(indisponible)'}\n\n` +
      `VENTES DE LOCAUX AUTOUR (DVF, 800 m) :\n${references.length ? JSON.stringify(references) : '(aucune vente exploitable)'}${ventes?.prix_m2 ? `\nPrix au m² des ventes : bas ${ventes.prix_m2.bas}, médian ${ventes.prix_m2.median}, haut ${ventes.prix_m2.haut}` : ''}\n\n` +
      (equimmox
        ? `VALEUR IMPOSÉE PAR EQUIMMOX (estimation multicritères, ${equimmox.rapport.methodes.map((m) => `${m.nom} ${m.valeur?.toLocaleString('fr-FR')} € coef. ${m.coefficient}`).join(' ; ')}) : ${equimmox.rapport.valeur.toLocaleString('fr-FR')} €.${equimmox.rapport.capitalisation ? ` Taux de capitalisation moyen du secteur : ${equimmox.rapport.capitalisation.taux} % (Data-B). Rends taux = ${equimmox.rapport.capitalisation.taux}.` : ''} Rends prix_m2 = ${equimmox.rapport.valeur_m2}. Justifie le taux et le prix en citant Equimmox et ses comparables, sans réécrire les chiffres. ENVIRONNEMENT (Equimmox) : ${equimmox.rapport.environnement.join(' ; ').slice(0, 1500)}`
        : dataB
        ? `TAUX IMPOSÉ PAR DATA-B : ${dataB.taux} % (taux du secteur pour l'activité « ${dataB.activite} » : ${dataB.taux_base} %, ajusté : ${dataB.ajustements.map((a) => `${a.motif} ${a.delta > 0 ? '+' : ''}${a.delta}`).join(', ') || 'aucun ajustement'}). Rends taux = ${dataB.taux} et justifie-le en citant Data-B et ces ajustements. Choisis seulement un prix au m² utile cohérent avec les ventes.`
        : `Choisis un taux de rendement brut cohérent (murs commerciaux en France : 5 à 9 % le plus souvent ; bureaux et activité un peu plus haut) et un prix au m² utile cohérent avec les ventes.`),
    response_json_schema: SCHEMA_AVIS,
  }));
  if (!brut || typeof brut !== 'object') return { ok: false, error: 'La rédaction n\'a rien rendu : réessayez.' };

  const taux = equimmox?.rapport.capitalisation?.taux || (dataB ? dataB.taux : Math.min(12, Math.max(3.5, Number(brut.taux) || 6.5)));
  surEtape?.(`Taux retenu : ${String(taux).replace('.', ',')} % · calcul des valeurs`);
  const prixM2 = equimmox?.rapport.valeur_m2 || Number(brut.prix_m2) || ventes?.prix_m2?.median || null;
  // Equimmox fait la valeur (arrondie au millier) et la fourchette ; chiffrer en tire le reste (rendement, prix affiché…).
  const parEquimmox = equimmox ? { moyenne: Math.round(equimmox.rapport.valeur / 1000) * 1000, basse: equimmox.fourchette?.bas || null, haute: equimmox.fourchette?.haut || null } : null;
  // Sans loyer ni surface, la valeur reste à poser dans l'éditeur, qui recalcule le reste.
  const chiffres = chiffrer(q, { taux, prix_m2: prixM2, loyer_marche_m2: loyerMarcheM2, dataB: parEquimmox || dataB })
    || (aLaMain ? { valeur: null, bas: null, haut: null, rendement: null, ecart_methodes: null, honoraires_pct: 5, frais_pct: 7.5, prix_affiche: null, cout_total: null } : null);
  if (!chiffres) return { ok: false, error: 'Impossible de chiffrer : il faut un loyer (bien occupé) ou une surface et des ventes comparables.' };

  surEtape?.(chiffres.valeur
    ? `Valeur : ${chiffres.valeur.toLocaleString('fr-FR')} € (fourchette ${chiffres.bas?.toLocaleString('fr-FR')} – ${chiffres.haut?.toLocaleString('fr-FR')} €)`
    : 'Chiffres incomplets : la valeur se posera dans l\u2019éditeur');
  surEtape?.('Mise en page de l\u2019avis dans l\u2019éditeur');
  const s = signataire(user);
  const loyerM2 = q.occupe && q.loyer_annuel_hc && q.surface_utile ? Math.round(q.loyer_annuel_hc / q.surface_utile) : null;
  const avis = {
    version: 1,
    type_bien: q.type_bien,
    type_libelle: TYPES_BIEN[q.type_bien] || 'Bien professionnel',
    occupe: !!q.occupe,
    date: jourLong(),
    bien: {
      rue: lieu ? [lieu.numero, lieu.rue].filter(Boolean).join(' ') : q.adresse,
      ville: lieu ? `${lieu.code_postal || ''} ${lieu.ville || ''}`.trim() : '',
      adresse: q.adresse,
      lat: lieu?.lat ?? null,
      lon: lieu?.lon ?? null,
    },
    demandeur: q.demandeur || '[à compléter]',
    signataire: s,
    cadre: {
      objet: `Estimer la valeur vénale ${q.type_bien === 'murs_commerce' ? 'des murs' : 'du bien'} en vue d'une éventuelle cession`,
      bien: `${TYPES_BIEN[q.type_bien] || 'Bien'}${q.occupe ? ' occupé' : ' libre'}, ${q.adresse}`,
      visite: q.date_visite ? `Réalisée le ${q.date_visite}${q.visite_avec ? ` en présence ${q.visite_avec}` : ''}` : '[à compléter]',
    },
    description: {
      resume: brut.resume_bien || `${q.surface_utile} m² utiles.`,
      lignes: [
        ['Désignation', brut.description?.designation],
        ['Configuration', brut.description?.configuration],
        ...(q.type_bien === 'murs_commerce' ? [['Façade', brut.description?.facade]] : []),
        ['Équipements', brut.description?.equipements],
        ['État', brut.description?.etat],
      ].filter(([, v]) => v).map(([mot, texte]) => ({ mot, texte })),
      surfaces: surfacesDe(q),
    },
    emplacement: {
      synthese: brut.emplacement?.synthese || '',
      lignes: [['Flux', brut.emplacement?.flux], ['Environnement', brut.emplacement?.environnement], ['Vacance', brut.emplacement?.vacance], ['Accès', brut.emplacement?.acces], ['Points de vigilance', brut.emplacement?.vigilance, true]]
        .filter(([, v]) => v).map(([mot, texte, alerte]) => ({ mot, texte, alerte: !!alerte })),
    },
    locatif: q.occupe ? {
      synthese: brut.locatif?.synthese || '',
      lignes: [
        ['Locataire', [q.locataire, q.activite_locataire].filter(Boolean).join(', ')],
        ['Bail', [q.bail_type, q.date_effet ? `à effet du ${q.date_effet}` : null].filter(Boolean).join(', ')],
        ['Échéance', q.echeance],
        ['Loyer', q.loyer_annuel_hc ? `${Number(q.loyer_annuel_hc).toLocaleString('fr-FR')} € HT HC par an${loyerM2 ? `, soit ${loyerM2} €/m²` : ''}` : null],
        ['Indexation', q.indexation],
        ['Taxe foncière', q.taxe_fonciere],
        ['Charges', q.charges],
        ['Dépôt de garantie', q.depot_garantie],
        ['Paiements', q.paiements],
      ].filter(([, v]) => v).map(([mot, texte]) => ({ mot, texte: String(texte) })),
      solidite: brut.locatif?.solidite || '',
      valeur_locative: brut.locatif?.valeur_locative || '',
    } : null,
    juridique: {
      synthese: brut.juridique?.synthese || '',
      lignes: [['Copropriété', brut.juridique?.copropriete], ['Travaux votés', brut.juridique?.travaux, true], ['Urbanisme', brut.juridique?.urbanisme], ['Diagnostics', brut.juridique?.diagnostics], ['Technique', brut.juridique?.technique, true], ['Servitudes', brut.juridique?.servitudes]]
        .filter(([, v]) => v).map(([mot, texte, alerte]) => ({ mot, texte, alerte: !!alerte && !/aucun/i.test(texte) })),
    },
    marche: equimmox ? {
      synthese: `${equimmox.rapport.methodes.filter((m) => m.moyenne_m2).map((m) => `${m.nom} : ${m.bas_m2.toLocaleString('fr-FR')} à ${m.haut_m2.toLocaleString('fr-FR')} € par m², moyenne ${m.moyenne_m2.toLocaleString('fr-FR')} €`).join('. ')}.`,
      // Les ventes DVF d'abord (ce sont des ventes signées), puis les offres actuelles et anciennes.
      references: [['transactions', 'Vente DVF'], ['offres_actuelles', 'Offre actuelle'], ['offres_anciennes', 'Offre ancienne']].flatMap(([cle, mot]) => (equimmox.comparables[cle]?.retenus || []).map((c) => ({
        date: String(c.date || '').slice(0, 4), bien: mot, adresse: c.adresse, surface: c.surface, prix: c.prix, prix_m2: c.prix_m2, distance_m: c.distance_m, raison: c.raison,
      }))),
      source: `Source : Equimmox, estimation multicritères du ${new Date(equimmox.le).toLocaleDateString('fr-FR')} (offres actuelles, offres anciennes, transactions DVF${equimmox.rapport.capitalisation ? ', capitalisation' : ''}).`,
      loyers: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, source: marche?.source || null } : null,
      lecture: brut.lecture_marche || '',
    } : {
      synthese: ventes?.prix_m2 ? `Les locaux vendus autour se sont échangés entre ${ventes.prix_m2.bas.toLocaleString('fr-FR')} et ${ventes.prix_m2.haut.toLocaleString('fr-FR')} € par m², médiane ${ventes.prix_m2.median.toLocaleString('fr-FR')} €.` : 'Peu de ventes de locaux comparables ont été publiées autour du bien.',
      references,
      source: references.length ? `Sources : DVF (Demandes de valeurs foncières), ${ventes?.annees?.join(', ') || ''}, rayon de 800 m.` : '',
      loyers: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, source: marche?.source || null } : null,
      lecture: brut.lecture_marche || '',
    },
    methodes: {
      synthese: brut.synthese_methodes || '',
      taux, justification_taux: brut.justification_taux,
      source_taux: equimmox?.rapport.capitalisation ? `Taux moyen du secteur${dataB ? ` (${dataB.source} · ${dataB.activite})` : ''}, retenu par Equimmox` : dataB ? `${dataB.source} · ${dataB.activite}` : null,
      // Les quatre méthodes d'Equimmox et leur poids : la page « Le calcul » du deck les montre.
      equimmox: equimmox ? { valeur_brute: equimmox.rapport.valeur, methodes: equimmox.rapport.methodes, fourchette: equimmox.fourchette, le: equimmox.le } : null,
      prix_m2: prixM2, justification_prix: brut.justification_prix || '',
      loyer: q.occupe ? Number(q.loyer_annuel_hc) || null : dataB?.loyer ? Math.round(dataB.loyer) : null,
      surface: Number(q.surface_utile) || null,
    },
    chiffres,
    conclusion: {
      points: [
        ...(chiffres.ecart_methodes != null && Math.abs(chiffres.ecart_methodes) > 20
          ? [`Les deux méthodes s'écartent de ${Math.abs(chiffres.ecart_methodes)} % : vérifier les ventes comparables retenues avant de présenter la valeur`]
          : []),
        ...(brut.points_a_traiter || []),
      ].slice(0, 6),
      reserves: RESERVES,
      fait_a: s.ville_signature || (lieu?.ville || '[ville]'),
    },
    photos: { couverture: null, emplacement: null },
  };

  // Les chiffres de la commune pour la page « La ville » du deck (26 oct. 2026) : données publiques, gardés avec l'avis.
  try {
    const commune = lieu?.ville || null;
    if (commune) {
      surEtape?.(`Les chiffres de ${commune} (INSEE, Le Figaro)`);
      const { executerOutil } = await import('./ak/agent.js');
      const ville = villeDepuisCommune(await executerOutil({ name: 'donnees_commune', input: { commune } }, user));
      if (ville) avis.ville = ville;
    }
  } catch (err) { console.warn(`[avis] commune : ${err?.message || err}`); }
  // Les retouches faites à la main pendant les questions se reposent sur l'avis rédigé.
  const avisFinal = appliquerSurcouche(avis, Records.get(ENTITE, e.id)?.surcouche);
  Records.update(ENTITE, e.id, {
    avis: avisFinal, questionnaire_en_cours: false, statut: 'prete', prete_le: new Date().toISOString(),
    rapport: { prix_bas: chiffres.bas, prix_haut: chiffres.haut, synthese: chiffres.valeur ? `Valeur estimée ${chiffres.valeur.toLocaleString('fr-FR')} € net vendeur hors droits.` : 'Valeur à compléter dans l\'avis.', rendement: chiffres.rendement ? { bas: taux - 0.15, haut: taux + 0.2 } : null, genere_le: new Date().toISOString() },
    historique: [...(e.historique || []), { le: new Date().toISOString(), par: user?.email || null, action: 'avis de valeur rédigé' }],
  });
  return { ok: true, estimation_id: e.id, valeur: chiffres.valeur, bas: chiffres.bas, haut: chiffres.haut, rendement: chiffres.rendement, a_completer: reste };
}

/** Pure : le tableau des surfaces (pondérées quand on a les zones). */
export function surfacesDe(q) {
  const lignes = [];
  if (Array.isArray(q.zones) && q.zones.length) {
    for (const z of q.zones) lignes.push({ zone: z.zone || z.nom, utile: Number(z.surface) || 0, coef: Number(z.coef) || 1 });
  } else if (q.surface_utile) {
    lignes.push({ zone: q.type_bien === 'murs_commerce' ? 'Boutique' : 'Surface principale', utile: Number(q.surface_utile), coef: 1 });
  }
  if (q.reserve) lignes.push({ zone: 'Réserve', utile: premierNombre(q.reserve) || 0, coef: 0.2 });
  return lignes.map((l) => ({ ...l, ponderee: Math.round(l.utile * l.coef) }));
}

// --- Le chat de l'estimation --------------------------------------------------

const OUTILS = [
  {
    name: 'commencer_avis',
    description: "Ouvre un nouvel avis de valeur dès que le type de bien est connu. type_bien : murs_commerce, bureaux, local_activite, immeuble, autre. Rend ce qui manque.",
    input_schema: { type: 'object', properties: { type_bien: { type: 'string', enum: Object.keys(TYPES_BIEN) }, adresse: { type: 'string' }, demandeur: { type: 'string' } }, required: ['type_bien'] },
  },
  {
    name: 'noter_reponses',
    description:
      "Enregistre les réponses du mandataire (et ce qu'on lit dans une pièce jointe, un bail par exemple). Clés possibles : occupe (booléen), adresse, demandeur (le propriétaire des murs : le BAILLEUR du bail, souvent une SCI), surface_utile (m²), reserve, zones ([{zone, surface, coef}]), etat (texte libre), date_visite (« 28 septembre 2026 »), visite_avec, " +
      "les critères Data-B des murs, une valeur parmi la liste, « nc » si on ne sait pas : etat_immeuble (parfait | usage | travaux | renover | grosoeuvre), etat_local (parfait | usage | travaux | brut), angle, extraction, parking, franchise (locataire sous enseigne), retards_paiement, licence_4 (oui | non | nc), pmr (locaux_aux_normes | adap_en_cours | travaux_a_realiser | local_sans_public), anciennete_locataire (moins1an | de1a3ans | de3a6ans | de6a9ans | plus9ans) ; activite_data_b (le métier du locataire en un ou deux mots, « boulangerie », « assurance », « pharmacie ») ; " +
      "annee_construction, investissement_a_prevoir (€, travaux à la charge de l'acquéreur, presque toujours vide), puis facade, emplacement, flux, environnement, vacance, acces, configuration, equipements, etage, stationnement, hauteur, acces_poids_lourds, nb_lots, composition, description, locataire, activite_locataire, bail_type, date_effet, echeance, loyer_annuel_hc (€), indexation, taxe_fonciere, charges, depot_garantie, paiements, ca_locataire, travaux_locataire, copropriete, travaux_votes, urbanisme, diagnostics, servitudes. « Je ne sais pas » : n'enregistre rien. Rend ce qui manque encore.",
    input_schema: { type: 'object', properties: { reponses: { type: 'object' } }, required: ['reponses'] },
  },
  {
    name: 'retoucher_avis',
    description: "Modifie l'avis affiché à côté du chat, tel qu'il est : reformuler, raccourcir ou réécrire un texte, enlever ou ajouter une ligne d'un tableau, mise en forme (taille, couleur, gras, police, fond…), déplacer un élément, réordonner ou masquer une page, poser l'image jointe à la place d'une photo. Passe la demande du mandataire telle quelle dans instruction. Marche avant comme après la rédaction.",
    input_schema: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
  },
  {
    name: 'rediger_avis',
    description: "Rédige l'avis : l'estimation Equimmox (offres, transactions, capitalisation, une à deux minutes), le marché, la fourchette. L'éditeur s'ouvre ensuite tout seul. Normalement quand plus rien d'obligatoire ne manque ; avec a_la_main: true, il se rédige tout de suite et ce qui manque reste « [à compléter] » dans l'éditeur.",
    input_schema: { type: 'object', properties: { a_la_main: { type: 'boolean', description: 'Rédiger malgré les manques, que le mandataire complétera dans l\'éditeur' } } },
  },
];

const CONSIGNE = `Tu mènes, pour un mandataire K Partners, un AVIS DE VALEUR dans le chat. Court, en français, sans markdown.
La valeur vient d'Equimmox (26 oct. 2026) : son estimation multicritères pondère les offres actuelles (2), les offres anciennes (1), les transactions DVF (1) et la capitalisation du loyer au taux moyen du secteur (2, taux de Data-B). Tu ne la choisis pas : tu rassembles ce qu'il lui faut, l'adresse, la surface, l'état du local et, s'il est occupé, le loyer annuel ; l'année de construction et un investissement à prévoir seulement si le mandataire les donne. Sans Equimmox, Data-B prend le relais.

1. Lis tout : ce que dit le mandataire et les pièces (bail surtout). Déduis le type de bien et commence l'avis (commencer_avis), puis enregistre EN UNE FOIS tout ce que tu as lu (noter_reponses). Dans un bail : le demandeur est le BAILLEUR (propriétaire des murs), sauf si le mandataire dit autre chose ; le locataire, son activité (et activite_data_b), le loyer annuel HT HC, la date d'effet, l'échéance, l'indexation, la taxe foncière et les charges (qui paie), la surface, le dépôt de garantie.
2. Ce qu'il dit en passant s'enregistre aussi : une date de visite (« je l'ai visité hier », « visite le 28 ») devient date_visite en toutes lettres, calculée depuis la date du jour ; un état, un angle, une extraction, un parking, une enseigne, l'ancienneté du locataire, des retards de paiement…
3. Puis pose, EN UN SEUL MESSAGE, toutes les questions sur ce qui manque encore (l'outil le dit) : une liste numérotée, une question courte par ligne, avec les choix quand il y en a (« état du local : parfait, d'usage, travaux, brut ? »). Jamais au compte-gouttes, jamais une question déjà répondue.
4. À chaque réponse : noter_reponses, puis s'il manque encore quelque chose, une nouvelle liste groupée. « Je ne sais pas » vaut « nc » pour un critère Data-B : ça ne bloque pas.
5. Quand plus rien ne manque : rediger_avis. Seulement si le mandataire demande expressément de générer malgré les manques (« génère quand même ») : rediger_avis avec a_la_main: true.
6. MODIFIER L'AVIS (il est affiché à côté du chat) : une demande sur le document lui-même — reformuler, raccourcir, enlever une ligne, changer une taille, une couleur, mettre en gras, déplacer, masquer, poser une image jointe — c'est retoucher_avis, avec la demande telle quelle, avant comme après la rédaction ; pas noter_reponses ni rediger_avis. Une INFORMATION sur le bien (« la surface c'est 85 m² », « le loyer est de 20 000 € ») : noter_reponses, puis rediger_avis si l'avis est déjà rédigé. Après une retouche : une ligne qui dit ce qui a changé.
7. Après la rédaction : une seule ligne avec la valeur et la fourchette, et la source (Equimmox, ou Data-B s'il a pris le relais). L'avis s'affiche déjà à côté du chat : ne dis pas de l'ouvrir, de le relire ni de télécharger le PDF. Une correction ensuite (« j'ai oublié, la surface c'est 85 m² ») : noter_reponses puis rediger_avis, et préviens que les retouches faites à la main dans l'avis seront remplacées.
8. La présentation (le deck) se remplit depuis l'avis : ses chiffres ne viennent que de tes outils. La page « La ville » se remplit quand tu appelles donnees_commune. Ne dis JAMAIS qu'une case ou une page est remplie si l'outil ne te l'a pas confirmé (« pose ») ; sinon dis ce qui manque.
9. QUAND TOUT EST FINI (l'avis rédigé, plus de question ni de retouche en cours) : propose d'écrire le mail au propriétaire et de l'envoyer avec l'avis en PDF, en une question (« Je prépare le mail au propriétaire, avec l'avis en PDF ? »). À son oui : preparer_envoi_avis. Ne le propose qu'une fois ; pas si l'avis est déjà envoyé.
10. L'AVIS ENVOYÉ, tu suis la relation avec le propriétaire (27 oct. 2026) : on reste ici, et tu reprends le fil (il est plus bas). Le mandataire raconte : « je l'ai appelé, on a fixé un rendez-vous lundi », « la présentation s'est bien passée, il réfléchit et revient vers moi ». À chaque récit : noter_echange avec un résumé court et la relance qui convient à la situation (le rendez-vous à sa date et son heure, une semaine pour reprendre des nouvelles, la date qu'il a donnée). Rien de fixe : tu adaptes. Puis une ligne : ce qui est noté et la prochaine action datée, et au besoin une question utile (l'heure du rendez-vous, ce qui le fait hésiter). Une réponse qui tranche — d'accord sur un prix, pause, refus, autre agent, plus vendeur — c'est noter_restitution (avec relance_le et relance_quoi si la situation en demande une autre que celle du cas) : le mandataire confirme d'un tap. D'accord sur un prix : le prix va sur la fiche du bien et le bien passe au Mandat au tap ; dis-le en une ligne. Le bail reçu change la valeur : noter_restitution bail_change, puis noter_reponses et rediger_avis pour l'avis corrigé. Les documents (l'avis, la présentation, les sources) restent à côté : n'en parle que si on te les demande.
On n'invente rien.`;

/** Un tour du chat de l'estimation. */
/** Pure : l'étape montrée quand une réponse est notée, avec sa valeur lisible. */
export function etapeDeReponse(cle, valeur) {
  const mot = String(cle).replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
  const brut = typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
  const n = Number(brut.replace(/[\s\u202f€]/g, '').replace(',', '.'));
  let lisible = brut;
  if (Number.isFinite(n) && /^[\d\s\u202f.,€]+$/.test(brut.trim())) {
    const nombre = n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/\u202f/g, ' ');
    lisible = /surface|m2|m²/i.test(cle) ? `${nombre} m²` : /loyer|prix|valeur|charges|taxe|depot|dépôt|montant|honoraires|droit/i.test(cle) ? `${nombre} €` : nombre;
  } else if (valeur === true || brut === 'true') lisible = 'oui';
  else if (valeur === false || brut === 'false') lisible = 'non';
  return `${mot} : ${lisible.length > 60 ? `${lisible.slice(0, 59)}…` : lisible}`;
}

/**
 * Pure : les quatre chiffres de la commune pour la page « La ville » du deck (26 oct. 2026), depuis la réponse de
 * donnees_commune, chacun avec sa source. null s'il n'y a rien.
 */
export function villeDepuisCommune(r) {
  if (!r || r.ok === false) return null;
  const v = {
    commune: r.commune || null,
    population: r.population != null ? { valeur: r.population, source: r.source || 'API Géo (INSEE)' } : null,
    revenu: r.revenu_median_uc?.valeur_euros_an ? { valeur: r.revenu_median_uc.valeur_euros_an, source: r.revenu_median_uc.source } : null,
    chomage: r.chomage_zone_emploi?.taux_pct != null ? { valeur: r.chomage_zone_emploi.taux_pct, source: r.chomage_zone_emploi.source } : null,
    logement: r.logement?.prix_median_m2 ? { valeur: r.logement.prix_median_m2, source: r.logement.source } : null,
    le: new Date().toISOString(),
  };
  return v.population || v.revenu || v.chomage || v.logement ? v : null;
}

/** Les chiffres de la commune, gardés sur l'estimation et dans son avis (la page « La ville » du deck les lit). */
export function poserVille(estimationId, ville) {
  const e = estimationId ? Records.get(ENTITE, estimationId) : null;
  if (!e || !ville) return false;
  Records.update(ENTITE, e.id, { ville_chiffres: ville, ...(e.avis ? { avis: { ...e.avis, ville } } : {}) });
  return true;
}

// Les pages du deck et ce qui les remplit (26 oct. 2026, Jules : « complète la page 05 » parlait du deck, Haka a
// complété la page 5 de l'avis). Envoyé à Haka quand la Présentation est ouverte.
const PAGES_DECK = [
  [1, 'Couverture', "la valeur, la fourchette, le loyer, le taux et le bail restant : tout vient des chiffres de l'avis (rediger_avis)"],
  [2, 'Sommaire', 'rien à remplir'],
  [3, 'Le bilan locatif', "les lignes du bail (locataire, paiements, bail, loyer, charges, garantie) : noter_reponses puis rediger_avis, ou retoucher_avis sur les lignes de la situation locative"],
  [4, 'La ville', 'donnees_commune (les quatre cases se remplissent seules)'],
  [5, 'Le quartier', "les lignes « Emplacement et commercialité » de l'avis (type d'emplacement, flux piéton, commerces voisins, transports, vacance de la rue) : cherche avec recherche_web, vacance_commerciale, annonces_bodacc, puis écris-les avec retoucher_avis (une ligne par rubrique, sourcée)"],
  [6, 'Le local', "les surfaces et la description du bien de l'avis : noter_reponses (surface, zones, état…) ou retoucher_avis"],
  [7, 'Les usages', "les activités autorisées (bail, copropriété, PLU) : lignes juridiques de l'avis par retoucher_avis ; la valeur locative : loyers_marche"],
  [8, 'Le taux', "la justification du taux de l'avis"],
  [9, 'Le calcul', "les méthodes d'Equimmox : rediger_avis"],
  [10, 'Les comparables', "les comparables d'Equimmox : rediger_avis"],
  [11, 'La valeur', "les chiffres de l'avis"],
  [12, 'Votre mandataire', "la fiche du mandataire, tenue par l'équipe Klocka : rien à écrire ici"],
];
/** Pure : ce que Haka doit savoir de ce que le mandataire regarde à droite (l'avis, le deck et sa page, le rapport). */
export function cadreDeLaVue(vue) {
  if (!vue?.document) return '';
  if (vue.document === 'presentation') {
    const p = vue.page || {};
    return `\n\nLE MANDATAIRE REGARDE LA PRÉSENTATION (le deck de 12 pages)${p.n ? `, page ${String(p.n).padStart(2, '0')} « ${p.titre || p.section || ''} »` : ''}. « La page N », « cette page », « ici » désignent une page DU DECK, jamais une page de l'avis. Les pages du deck et ce qui les remplit : ${PAGES_DECK.map(([n, t, quoi]) => `${String(n).padStart(2, '0')} ${t} : ${quoi}`).join(' ; ')}. Le deck se recompose seul depuis l'avis : pour compléter une page, remplis ce qui la nourrit, puis dis ce qui a changé sur cette page du deck. Si tu ne peux pas la compléter, dis ce qui manque et d'où ça viendrait. Retirer une page du deck : le mandataire le fait en mode Édition (« Supprimer la page »), les suivantes reprennent son numéro ; dis-le-lui plutôt que de vider la page.`;
  }
  if (vue.document === 'suivi') return "\n\nLe mandataire regarde le Suivi du bien : son statut, le prix d'accord, les relances à faire et l'historique. Ce que tu notes (noter_echange, noter_restitution) s'y affiche aussitôt.";
  if (vue.document === 'sources') return "\n\nLe mandataire regarde les Sources de l'avis (lecture seule) : ce qu'il a dit, l'estimation Equimmox et ses comparables, les ventes DVF, les loyers, le taux, la commune. Elles se refont en rédigeant l'avis de nouveau.";
  return "\n\nLe mandataire regarde l'avis de valeur : « la page N » désigne une page de l'avis.";
}

export async function discuterEstimation({ historique = [], texte, user, surEtape = null, piece = null, pieces = null, mode = null, conversation_id = null, selection = null, sources = null, competence = null, vue = null }) {
  // Les outils de marché et les sources cochées (26 oct. 2026), comme le chat Haka du mandataire.
  const marche = (await import('./mandataire.js')).marchePourChat({ sources, competence });
  const conv = conversation_id ? String(conversation_id) : null;
  // L'avis commencé au premier message, avant que la conversation ait son
  // identifiant, s'y rattache au message suivant.
  if (conv) {
    const orphelin = Records.list(ENTITE).find((x) => x.mandataire_email === moi(user) && x.questionnaire_en_cours && orphelinRecent(x));
    if (orphelin && !Records.list(ENTITE).some((x) => x.conversation_id === conv)) Records.update(ENTITE, orphelin.id, { conversation_id: conv });
  }
  // Plusieurs pièces jointes depuis le 27 oct. 2026 : une ligne chacune.
  const { lotDePieces, texteAvecPieces } = await import('./pieces-jointes.js');
  const lot = lotDePieces({ piece, pieces });
  for (const p of lot) surEtape?.(p.texte ? `Je lis le document : ${p.nom}` : `${p.nom} : illisible, je fais sans`);
  texte = texteAvecPieces(texte, lot, 12000);
  const { runAgent } = await import('./llm.js');
  const R = await import('./restitution-avis.js');
  const actuel = enCours(user, conv);
  const redige = !actuel ? dernierRedige(user, conv) : null;
  // Le oui à « De ce que je sais » (29 oct. 2026) : sans modèle.
  const aConfirmer = actuel?.de_la_visite && !actuel.de_la_visite.confirme_le ? actuel : null;
  if (aConfirmer && !lot.length && /^\s*(oui|ok|d'accord|c'est (juste|bon)|parfait|exact|confirm)/i.test(texte || '') && String(texte).trim().length < 40) {
    surEtape?.('Les réponses de la visite entrent dans l\u2019avis');
    const r = confirmerLaVisite(aConfirmer, user, conv);
    return { texte: r.texte, avis: null, avis_retouche: true, estimation_id: aConfirmer.id, envoi: null, actions: [] };
  }
  const contexte = actuel
    ? `\n\nAvis en cours : ${actuel.bien}. Déjà renseigné : ${JSON.stringify(actuel.questionnaire || {}).slice(0, 3000)}. Encore obligatoire : ${manquants(actuel.questionnaire || {}).join(', ') || 'rien'}.` +
      (aConfirmer ? `\nCE QUE LA VISITE DIT, montré au mandataire et PAS ENCORE dans l'avis : ${JSON.stringify(aConfirmer.de_la_visite.reponses || {}).slice(0, 2000)}${aConfirmer.de_la_visite.recit ? ` ; récit : ${String(aConfirmer.de_la_visite.recit).slice(0, 600)}` : ''}. Il corrige ou complète : noter_reponses avec TOUTES ces réponses, corrigées de ce qu'il dit, puis la liste des questions qui manquent encore.` : '')
    : redige
      ? `\n\nL'avis de ${redige.bien} est rédigé (valeur ${redige.avis?.chiffres?.valeur?.toLocaleString('fr-FR')} €) et se trouve dans cette conversation${redige.statut === 'envoye' ? `, ENVOYÉ au propriétaire le ${new Date(redige.envoye_le || Date.now()).toLocaleDateString('fr-FR', { timeZone: PARIS })} (la suite : la relation avec le propriétaire, règle 10).\n${R.filDeLaRelation(redige.proprietaire_id ? Records.get('ProprietaireMandataire', redige.proprietaire_id) : null)}\n` : redige.envoi?.prepare_le ? ', son mail d\'envoi est déjà préparé (à l\'écran)' : ', pas encore envoyé'}. Déjà renseigné : ${JSON.stringify(redige.questionnaire || {}).slice(0, 3000)}. NE commence PAS un nouvel avis sauf si le mandataire parle d'un AUTRE bien. Une correction ou un ajout : noter_reponses puis rediger_avis, et préviens que les retouches faites à la main dans l'avis seront remplacées.`
      : '\n\nAucun avis en cours.';
  const choisi = selection?.chemin ? `\n\nÉLÉMENT SÉLECTIONNÉ dans l'avis par le mandataire (« ça », « ce texte », « cette photo » le désignent) : ${selection.chemin}${selection.texte ? ` — « ${String(selection.texte).slice(0, 300)} »` : ''}. Une demande qui le vise : retoucher_avis.` : '';
  const facon = choisi + cadreDeLaVue(vue) + `\n\nNous sommes le ${jourLong()}.` + (mode === 'sans_document'
    ? '\nMode : SANS DOCUMENT. Pas de pièce : enregistre ce qui est dit, puis toutes les questions restantes en un seul message (le loyer, la surface, le bail, les critères Data-B).'
    : mode === 'document' ? '\nMode : AVEC LE BAIL. Lis tout, puis toutes les questions restantes en un seul message.' : '');
  let avisPret = null;
  let avisRetouche = false;
  let envoi = null;
  const actions = [];
  const messages = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }]
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.contenu }));
  const { text } = await runAgent({ model: process.env.AK_MODELE?.trim() || null, effort: effortDuChat(), journal: { chat: 'mandataire-estimation', par: user?.email || null },
    system: CONSIGNE + facon + contexte + marche.cadre,
    messages,
    tools: [...OUTILS, R.OUTIL_ENVOI, R.OUTIL_RESTITUTION, R.OUTIL_ECHANGE, ...marche.tools],
    onTool: async ({ name, input = {} }) => {
      if (marche.estMarche(name)) {
        surEtape?.(`Je lis ${name === 'ventes_dvf' ? 'les ventes DVF' : name === 'prix_murs' ? 'le prix des murs (Equimmox)' : name === 'loyers_marche' ? 'les loyers de marché' : name === 'donnees_commune' ? 'les chiffres de la commune' : 'la source demandée'}`);
        const r = await marche.executer({ name, input }, user);
        // Les chiffres de la commune remplissent les cases de « La ville » du deck : c'est le serveur qui les pose, pas un texte.
        if (name === 'donnees_commune') {
          const cible = enCours(user, conv) || dernierRedige(user, conv);
          const ville = villeDepuisCommune(r);
          if (cible && ville && poserVille(cible.id, ville)) { avisRetouche = true; return { ...r, pose: "Les cases de la page « La ville » du deck sont remplies avec ces chiffres (habitants, niveau de vie médian, chômage, prix du logement)." }; }
        }
        return r;
      }
      if (name === 'preparer_envoi_avis') {
        const cible = dernierRedige(user, conv) || enCours(user, conv);
        if (!cible?.avis) return { ok: false, error: "L'avis n'est pas encore rédigé." };
        if (cible.statut === 'envoye') return { ok: false, error: `Cet avis est déjà envoyé (le ${new Date(cible.envoye_le).toLocaleDateString('fr-FR', { timeZone: PARIS })}).` };
        surEtape?.('J\u2019écris le mail au propriétaire');
        const r = await R.preparerEnvoi(cible.id, { objet: input.objet, texte: input.texte }, user);
        if (r.ok) envoi = { estimation_id: cible.id, ...r.envoi };
        return r.ok ? { ok: true, pret: "Le mail s'ouvre à l'écran avec l'avis en PDF joint : le mandataire le relit et l'envoie de sa messagerie.", destinataire: r.envoi.a || 'à compléter' } : r;
      }
      if (name === 'noter_restitution') {
        const cible = dernierRedige(user, conv) || enCours(user, conv);
        const pid = input.proprietaire_id || cible?.proprietaire_id;
        if (!pid) return { ok: false, error: "Cet avis n'est rattaché à aucun bien de Biens : la restitution se note depuis la fiche du bien." };
        const r = R.proposerRestitution(pid, input, user);
        if (r.ok) actions.push(r.carte);
        return r;
      }
      if (name === 'noter_echange') {
        const cible = dernierRedige(user, conv) || enCours(user, conv);
        if (!cible?.proprietaire_id) return { ok: false, error: "Cet avis n'est rattaché à aucun bien de Biens." };
        surEtape?.('Je note l\u2019échange');
        return R.noterEchange(cible.proprietaire_id, input, user);
      }
      if (name === 'commencer_avis') { surEtape?.('Nouvel avis de valeur'); return commencer(input, user, conv); }
      if (name === 'noter_reponses') {
        // Une étape par valeur notée, avec la valeur : « Loyer annuel hc : 50 000 € ».
        const notees = Object.entries(input.reponses || {}).filter(([, v]) => v != null && String(v).trim() !== '');
        for (const [k, v] of notees.slice(0, 6)) surEtape?.(etapeDeReponse(k, v));
        if (notees.length > 6) surEtape?.(`Et ${notees.length - 6} autre${notees.length - 6 > 1 ? 's' : ''} réponse${notees.length - 6 > 1 ? 's' : ''}`);
        if (!notees.length) surEtape?.('Réponses enregistrées');
        const fait = noter(input.reponses, user, conv);
        if (fait.ok && aConfirmer) Records.update(ENTITE, aConfirmer.id, { de_la_visite: { ...aConfirmer.de_la_visite, confirme_le: new Date().toISOString() } });
        if (fait.ok) avisRetouche = true;
        return fait;
      }
      if (name === 'retoucher_avis') {
        const cible = enCours(user, conv) || dernierRedige(user, conv);
        if (!cible) return { ok: false, error: 'Aucun avis dans cette conversation : commence par commencer_avis.' };
        surEtape?.('Je retouche l\u2019avis');
        // Plusieurs pièces : la première image du lot se pose.
        const img = lot.find((p) => p?.url && /^image\//.test(p.mimetype || ''));
        const image = img ? { url: img.url, nom: img.nom } : null;
        const r = await retoucherAvis(cible.id, { instruction: input.instruction, selection, historique: [], piece: image }, user);
        if (!r.ok) return r;
        const faits = (r.faits || []).filter((f) => !f.refus).length;
        if (faits) { avisRetouche = true; surEtape?.(`${faits} retouche${faits > 1 ? 's' : ''} dans l\u2019avis`); }
        return { ok: true, retouches: faits, reponse: r.reponse };
      }
      if (name === 'rediger_avis') {
        const r = await rediger(user, { surEtape, aLaMain: input.a_la_main === true, conversationId: conv });
        if (r.ok) avisPret = { estimation_id: r.estimation_id, valeur: r.valeur, bas: r.bas, haut: r.haut };
        return r;
      }
      return { ok: false, error: `Outil inconnu : ${name}` };
    },
  });
  // L'estimation de cette conversation, pour l'aperçu qui se construit à côté du chat.
  const courante = enCours(user, conv) || dernierRedige(user, conv);
  return { texte: String(text || '').trim(), avis: avisPret, avis_retouche: avisRetouche, estimation_id: avisPret?.estimation_id || courante?.id || null, envoi, actions };
}

// --- Les retouches de l'avis par le chat -------------------------------------
//
// L'avis est un document JSON : chaque texte a son chemin (« description.resume »,
// « locatif.lignes.2.texte », « libre.redige »), les pages ont un ordre et
// peuvent se masquer. Le mandataire dit ce qu'il veut (« raccourcis la
// synthèse », « mets la section marché avant les méthodes », « supprime la
// ligne charges ») ; le modèle répond par des opérations, appliquées ici,
// jamais par un document entier réécrit. Chaque retouche garde une version.

export const SECTIONS_AVIS = ['cadre', 'description', 'emplacement', 'locatif', 'juridique', 'marche', 'methodes', 'conclusion'];
// La mise en forme d'un élément (avis.styles[chemin]) : taille en points,
// couleur de la palette du document (ou #rrggbb), gras, italique, souligné,
// alignement. Les tailles du modèle, pour « plus grand » et « plus petit ».
export const PALETTE_AVIS = ['encre', 'sauge', 'sauge-fonce', 'menthe', 'ocre', 'gris', 'blanc'];
const TAILLES_BASE = [
  [/^chiffres\.valeur$/, 36],
  [/^(demandeur|date|libre\.redige|type_libelle)$/, 9],
  [/^bien\.rue$/, 34], [/^bien\.ville$/, 13],
  [/^libre\.titre_(cadre|description|emplacement|locatif|juridique|marche|methodes)$/, 20],
  [/\.(synthese|resume)$|^libre\.c_(resume|conclusion)$/, 10.5],
  [/\.lignes\.\d+\.(mot|texte)$|^demandeur$|^cadre\./, 9],
  [/^marche\.references\.|^description\.surfaces\./, 8.5],
  [/^chiffres\.(capitalisation|comparaison)$/, 15],
  [/^conclusion\.points\./, 9.5],
];
const tailleBase = (chemin) => (TAILLES_BASE.find(([re]) => re.test(chemin)) || [null, 9.5])[1];
const tailleValide = (t) => (t >= 5 && t <= 80 ? Math.round(t * 2) / 2 : null);

const couleurValide = (c) => PALETTE_AVIS.includes(c) || /^#[0-9a-f]{6}$/i.test(String(c));
// Les réglages chiffrés d'un style : [clé, minimum, maximum, pas d'arrondi].
const BORNES_STYLE = [['interligne', 0.8, 3, 0.05], ['espacement', -0.1, 0.5, 0.01], ['opacite', 5, 100, 1], ['arrondi', 0, 20, 0.5], ['marge', 0, 30, 0.5], ['largeur', 10, 100, 1], ['hauteur_mm', 5, 280, 1], ['rotation', -180, 180, 1]];

/** Pure : le style d'un élément après une demande, ou null pour revenir au modèle. */
export function stylerElement(actuel = {}, chemin, s = {}) {
  const suivant = { ...(actuel || {}) };
  if (s.taille != null) { const t = tailleValide(Number(s.taille)); if (t) suivant.taille = t; }
  if (s.taille_delta != null) { const t = tailleValide((suivant.taille ?? tailleBase(chemin)) + Number(s.taille_delta)); if (t) suivant.taille = t; }
  for (const k of ['couleur', 'surlignage', 'fond', 'bordure_couleur']) {
    if (s[k] === undefined) continue;
    if (!s[k]) delete suivant[k]; else if (couleurValide(s[k])) suivant[k] = s[k];
  }
  for (const k of ['gras', 'italique', 'souligne', 'barre', 'majuscules', 'ombre', 'masque']) if (typeof s[k] === 'boolean') { if (s[k]) suivant[k] = true; else delete suivant[k]; }
  if (s.aligner !== undefined) { if (['left', 'center', 'right'].includes(s.aligner)) suivant.aligner = s.aligner; else delete suivant.aligner; }
  if (s.police !== undefined) { if (['serif', 'sans', 'mono'].includes(s.police)) suivant.police = s.police; else delete suivant.police; }
  if (s.bordure !== undefined) { if (['fine', 'epaisse'].includes(s.bordure)) suivant.bordure = s.bordure; else delete suivant.bordure; }
  for (const [k, min, max, pas] of BORNES_STYLE) {
    if (s[k] === undefined) continue;
    if (s[k] === null) { delete suivant[k]; continue; }
    const v = Number(s[k]);
    if (Number.isFinite(v) && v >= min && v <= max) suivant[k] = Math.round(v / pas) * pas;
  }
  return Object.keys(suivant).length ? suivant : null;
}
const CHEMINS_NOMBRES = /^(chiffres\.|methodes\.(taux|prix_m2|loyer|surface)$|description\.surfaces\.\d+\.(utile|coef)$|marche\.references\.\d+\.(surface|prix|prix_m2|distance_m)$|mise_en_page\.)/;

const nombreDe = (t) => {
  if (typeof t === 'number') return t;
  const n = Number(String(t ?? '').replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Pure : pose une valeur à un chemin, sans muter. */
export function poserChemin(objet, chemin, valeur) {
  const cles = String(chemin).split('.');
  const copie = Array.isArray(objet) ? [...objet] : { ...(objet || {}) };
  let ici = copie;
  for (let i = 0; i < cles.length - 1; i++) {
    const k = cles[i];
    ici[k] = Array.isArray(ici[k]) ? [...ici[k]] : { ...(ici[k] || {}) };
    ici = ici[k];
  }
  ici[cles.at(-1)] = valeur;
  return copie;
}

const lireChemin = (objet, chemin) => String(chemin).split('.').reduce((o, k) => (o == null ? undefined : o[k]), objet);
// « Taxe foncière », « taxe fonciere », « TAXE FONCIÈRE » : la même ligne.
const normIntitule = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const memeIntitule = (a, b) => { const x = normIntitule(a); const y = normIntitule(b); return !!x && !!y && (x === y || x.startsWith(y)); };

/** Pure : les chiffres qui découlent de la valeur retenue, comme dans l'éditeur. */
export function recalculerChiffres(avis) {
  const c = { ...(avis.chiffres || {}) };
  if (!(c.valeur > 0)) return avis;
  const loyer = avis.methodes?.loyer || null;
  const hon = Number(c.honoraires_pct ?? 5) / 100;
  const frais = Number(c.frais_pct ?? 7.5) / 100;
  c.prix_affiche = Math.round((c.valeur * (1 + hon)) / 100) * 100;
  c.cout_total = Math.round((c.prix_affiche * (1 + frais)) / 1000) * 1000;
  c.rendement = loyer ? Math.round((loyer / c.valeur) * 1000) / 10 : null;
  c.rendement_affiche = loyer ? Math.round((loyer / c.prix_affiche) * 1000) / 10 : null;
  c.rendement_total = loyer ? Math.round((loyer / (c.prix_affiche * (1 + frais))) * 1000) / 10 : null;
  // Les phrases qui citent les chiffres (clés « c_ ») se réécrivent avec eux.
  const libre = Object.fromEntries(Object.entries(avis.libre || {}).filter(([k]) => !k.startsWith('c_')));
  return { ...avis, chiffres: c, libre };
}

/**
 * Pure : applique les opérations à l'avis. Rend l'avis et la liste de ce qui
 * a été fait (ou refusé, avec le motif), sans jamais lever.
 */
export function appliquerOperations(avis, operations = []) {
  let a = avis;
  const faits = [];
  for (const op of Array.isArray(operations) ? operations : []) {
    try {
      if (op.op === 'poser') {
        if (!op.chemin || /(^|\.)(signataire|photos|version|type_bien|bien\.(lat|lon))(\.|$)/.test(op.chemin)) { faits.push({ ...op, refus: 'chemin protégé' }); continue; }
        const nombre = CHEMINS_NOMBRES.test(op.chemin);
        const valeur = nombre ? nombreDe(op.valeur) : (op.valeur_objet ?? op.valeur ?? '');
        // Une section entière (chiffres, methodes, locatif...) ne se remplace
        // pas par un texte : seuls ses champs se posent un à un.
        const actuel = lireChemin(a, op.chemin);
        if (actuel && typeof actuel === 'object' && (typeof valeur !== 'object' || valeur === null)) { faits.push({ ...op, refus: 'ce chemin est une section, pas un texte : vise un champ dedans' }); continue; }
        a = poserChemin(a, op.chemin, valeur);
        if (op.chemin.startsWith('chiffres.')) a = recalculerChiffres(a);
        faits.push({ op: 'poser', chemin: op.chemin });
      } else if (op.op === 'supprimer') {
        if (!op.chemin) { faits.push({ ...op, refus: 'il faut le chemin d\u2019un élément de liste, ou celui de la liste avec l\u2019intitulé (mot)' }); continue; }
        let parent = String(op.chemin);
        let index = -1;
        const direct = lireChemin(a, parent);
        if (Array.isArray(direct) && op.mot) {
          // La ligne par son intitulé : « enlève taxe foncière ».
          index = direct.findIndex((l) => memeIntitule(typeof l === 'string' ? l : l?.mot, op.mot));
          if (index < 0) { faits.push({ ...op, refus: `aucune ligne « ${op.mot} » dans ${parent}` }); continue; }
        } else {
          if (!parent.includes('.')) { faits.push({ ...op, refus: 'il faut le chemin d\u2019un élément de liste' }); continue; }
          index = Number(parent.split('.').at(-1));
          parent = parent.split('.').slice(0, -1).join('.');
        }
        const liste = lireChemin(a, parent);
        if (!Array.isArray(liste) || !(index >= 0 && index < liste.length)) { faits.push({ ...op, refus: 'pas de liste à cet endroit' }); continue; }
        a = poserChemin(a, parent, liste.filter((_, i) => i !== index));
        faits.push({ op: 'supprimer', chemin: `${parent}.${index}` });
      } else if (op.op === 'photo') {
        const cle = ['couverture', 'emplacement', 'portrait'].includes(op.cle) ? op.cle : null;
        if (!cle) { faits.push({ ...op, refus: 'cle : couverture, emplacement ou portrait' }); continue; }
        if (op.retirer) { a = { ...a, photos: { ...(a.photos || {}), [cle]: null } }; faits.push({ op: 'photo', cle, retiree: true }); continue; }
        if (!op.url || !/^(\/uploads\/|https?:\/\/)/.test(op.url)) { faits.push({ ...op, refus: 'il faut une image jointe' }); continue; }
        a = { ...a, photos: { ...(a.photos || {}), [cle]: op.url } };
        faits.push({ op: 'photo', cle });
      } else if (op.op === 'inserer') {
        const liste = lireChemin(a, op.chemin);
        if (!Array.isArray(liste)) { faits.push({ ...op, refus: 'pas de liste à cet endroit' }); continue; }
        const valeur = op.valeur_objet ?? op.valeur;
        const index = Number.isInteger(op.index) ? Math.max(0, Math.min(liste.length, op.index)) : liste.length;
        a = poserChemin(a, op.chemin, [...liste.slice(0, index), valeur, ...liste.slice(index)]);
        faits.push({ op: 'inserer', chemin: `${op.chemin}.${index}` });
      } else if (op.op === 'deplacer') {
        const liste = lireChemin(a, op.chemin);
        const de = Number(op.de);
        const vers = Number(op.vers);
        if (!Array.isArray(liste) || !(de >= 0 && de < liste.length) || !(vers >= 0 && vers < liste.length)) { faits.push({ ...op, refus: 'indices hors de la liste' }); continue; }
        const copie = [...liste];
        const [x] = copie.splice(de, 1);
        copie.splice(vers, 0, x);
        a = poserChemin(a, op.chemin, copie);
        faits.push({ op: 'deplacer', chemin: op.chemin, de, vers });
      } else if (op.op === 'styler') {
        if (!op.chemin || op.chemin.startsWith('section.')) { faits.push({ ...op, refus: 'il faut le chemin d\'un élément' }); continue; }
        const styles = { ...(a.styles || {}) };
        const suivant = op.reinitialiser || op.style === null ? null : stylerElement(styles[op.chemin], op.chemin, op.style || {});
        if (suivant) styles[op.chemin] = suivant; else delete styles[op.chemin];
        a = { ...a, styles };
        faits.push({ op: 'styler', chemin: op.chemin, style: suivant });
      } else if (op.op === 'positionner') {
        if (!op.cle || typeof op.cle !== 'string' || !op.cle.includes(':')) { faits.push({ ...op, refus: 'il faut la clé « page:chemin » de l\'élément' }); continue; }
        const positions = { ...(a.positions || {}) };
        if (op.reinitialiser) delete positions[op.cle];
        else {
          const p = positions[op.cle] || { x: 0, y: 0 };
          const x = op.x_mm != null ? Number(op.x_mm) : p.x + Number(op.dx_mm || 0);
          const y = op.y_mm != null ? Number(op.y_mm) : p.y + Number(op.dy_mm || 0);
          if (!Number.isFinite(x) || !Number.isFinite(y)) { faits.push({ ...op, refus: 'déplacement illisible' }); continue; }
          const borne = (v) => Math.max(-250, Math.min(250, Math.round(v * 2) / 2));
          if (borne(x) || borne(y)) positions[op.cle] = { x: borne(x), y: borne(y) }; else delete positions[op.cle];
        }
        a = { ...a, positions };
        faits.push({ op: 'positionner', cle: op.cle, position: positions[op.cle] || null });
      } else if (op.op === 'ordre_sections') {
        const voulu = (op.sections || []).filter((x) => SECTIONS_AVIS.includes(x));
        const ordre = [...new Set([...voulu, ...(a.ordre || SECTIONS_AVIS)])].filter((x) => SECTIONS_AVIS.includes(x));
        a = { ...a, ordre };
        faits.push({ op: 'ordre_sections', sections: ordre });
      } else if (op.op === 'masquer_section') {
        if (!SECTIONS_AVIS.includes(op.section) || op.section === 'conclusion') { faits.push({ ...op, refus: 'section inconnue ou indispensable' }); continue; }
        const masquees = new Set(a.masquees || []);
        if (op.masquee === false) masquees.delete(op.section); else masquees.add(op.section);
        a = { ...a, masquees: [...masquees] };
        faits.push({ op: 'masquer_section', section: op.section, masquee: op.masquee !== false });
      } else {
        faits.push({ ...op, refus: 'opération inconnue' });
      }
    } catch (e) {
      faits.push({ ...op, refus: e?.message || String(e) });
    }
  }
  return { avis: a, faits };
}

const SCHEMA_RETOUCHES = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: 'Une ou deux phrases au mandataire : ce qui a été changé, ou pourquoi rien' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['poser', 'supprimer', 'inserer', 'deplacer', 'styler', 'positionner', 'photo', 'ordre_sections', 'masquer_section'] },
          chemin: { type: 'string', description: 'Le chemin visé (poser, supprimer : la ligne « x.lignes.2 » ; inserer, deplacer : la liste « x.lignes »)' },
          valeur: { type: 'string', description: 'poser : le nouveau texte (ou le nombre, en chiffres)' },
          valeur_objet: { type: 'object', description: 'inserer dans des lignes : { mot, texte, alerte? } ; dans les points : non, utiliser valeur', properties: { mot: { type: 'string' }, texte: { type: 'string' }, alerte: { type: 'boolean' } } },
          style: {
            type: 'object',
            description: 'styler : la mise en forme à poser (ce qui n\'est pas donné ne change pas)',
            properties: {
              taille: { type: 'number', description: 'Taille en points' },
              taille_delta: { type: 'number', description: 'Variation en points (+2 pour « plus grand », -2 pour « plus petit »)' },
              couleur: { type: 'string', description: 'encre, sauge, sauge-fonce, menthe, ocre, gris, blanc, ou #rrggbb' },
              surlignage: { type: 'string', description: 'Couleur de fond derrière un texte (même palette), vide pour aucune' },
              gras: { type: 'boolean' },
              italique: { type: 'boolean' },
              souligne: { type: 'boolean' },
              barre: { type: 'boolean' },
              majuscules: { type: 'boolean' },
              police: { type: 'string', enum: ['modele', 'serif', 'sans', 'mono'] },
              interligne: { type: 'number', description: '1 à 2,2 (1,6 par défaut dans les textes)' },
              espacement: { type: 'number', description: 'Espacement des lettres en em (0,05 : un peu aéré)' },
              opacite: { type: 'number', description: '5 à 100 (%)' },
              aligner: { type: 'string', enum: ['left', 'center', 'right'] },
              fond: { type: 'string', description: 'Bloc : couleur de fond (palette ou #rrggbb)' },
              bordure: { type: 'string', enum: ['aucune', 'fine', 'epaisse'] },
              bordure_couleur: { type: 'string' },
              arrondi: { type: 'number', description: 'Bloc : coins arrondis en mm (0 à 20)' },
              marge: { type: 'number', description: 'Bloc : marge intérieure en mm (0 à 30)' },
              largeur: { type: 'number', description: 'Bloc : largeur en % (10 à 100)' },
              hauteur_mm: { type: 'number', description: 'Photo ou bloc : hauteur en mm' },
              rotation: { type: 'number', description: 'Degrés, -180 à 180' },
              ombre: { type: 'boolean' },
              masque: { type: 'boolean', description: 'true cache l\'élément, false le remontre' },
            },
          },
          reinitialiser: { type: 'boolean', description: 'styler : revenir à la mise en forme du modèle ; positionner : remettre en place' },
          cle: { type: 'string', description: 'positionner : « page:chemin » (page parmi couverture, cadre, description, emplacement, locatif, juridique, marche, methodes, conclusion) ; photo : couverture (la grande photo du bien en haut de la page de garde), emplacement (la photo de la page Emplacement), portrait (la photo du mandataire sur la page de garde, à cheval sur le bandeau)' },
          mot: { type: 'string', description: 'supprimer : l\'intitulé de la ligne à enlever, avec chemin = la liste (« locatif.lignes » + « Taxe foncière »)' },
          retirer: { type: 'boolean', description: 'photo : enlever la photo posée (retour à la vue de la rue)' },
          dx_mm: { type: 'number', description: 'positionner : décalage horizontal en mm (positif vers la droite)' },
          dy_mm: { type: 'number', description: 'positionner : décalage vertical en mm (positif vers le bas)' },
          x_mm: { type: 'number' },
          y_mm: { type: 'number' },
          index: { type: 'integer' },
          de: { type: 'integer' },
          vers: { type: 'integer' },
          sections: { type: 'array', items: { type: 'string' } },
          section: { type: 'string' },
          masquee: { type: 'boolean' },
        },
        required: ['op'],
      },
    },
  },
  required: ['reponse', 'operations'],
};

/** L'avis tel que le modèle le lit : sans les coordonnées ni la signature, avec ses chemins. */
function avisPourLeModele(avis) {
  const { signataire, photos, bien, ...reste } = avis;
  return { ...reste, bien: { rue: bien?.rue, ville: bien?.ville, adresse: bien?.adresse }, ordre: avis.ordre || SECTIONS_AVIS, masquees: avis.masquees || [] };
}

/**
 * Une retouche demandée dans le chat de l'éditeur. L'avis d'avant part dans
 * les versions ; l'avis d'après est enregistré et rendu.
 */
export async function retoucherAvis(id, { instruction, selection = null, historique = [], piece = null }, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  // Pas encore rédigé : on retouche l'avis qui se construit, et la retouche se garde pour la rédaction.
  const provisoire = !e.avis;
  const base = e.avis || apercuEstimation(e.id, user).avis;
  const demande = String(instruction || '').trim() || (piece ? `Pose l'image jointe (${piece.nom}).` : '');
  if (!demande) return { ok: false, error: 'Dites ce que vous voulez changer.' };

  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const fil = (Array.isArray(historique) ? historique : []).slice(-8).map((m) => `${m.role === 'user' ? 'Mandataire' : 'Assistant'} : ${String(m.contenu || '').slice(0, 600)}`).join('\n');
  const { resultat: brut } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invokeLLM({
    prompt:
      `Tu retouches l'AVIS DE VALEUR d'un mandataire K Partners, un document JSON dont chaque texte a un chemin. Tu réponds par des OPÉRATIONS précises, jamais par le document entier.\n` +
      `Opérations : poser (chemin + valeur : remplace un texte ou un nombre ; les textes fixes du modèle sont sous « libre.<clé> », les phrases qui citent les chiffres sous « libre.c_… ») ; supprimer (chemin d'un élément de liste, ex. « locatif.lignes.3 » ou « conclusion.points.0 ») ; inserer (chemin de la liste + index + valeur_objet {mot, texte} pour des lignes, ou valeur pour les points) ; deplacer (chemin de la liste, de, vers) ; styler (chemin + style : taille en points ou taille_delta (+2 « plus grand », -2 « plus petit »), couleur parmi encre, sauge, sauge-fonce, menthe, ocre, gris, blanc ou #rrggbb, gras, italique, souligne, aligner left|center|right ; reinitialiser: true remet le modèle) ; ordre_sections (sections dans le nouvel ordre, parmi ${SECTIONS_AVIS.join(', ')}) ; masquer_section (section, masquee). Les pages s'appellent par ces mêmes noms. Les chemins protégés (signataire, photos) ne se touchent pas : dis-le.\n` +
      `ENLEVER UNE LIGNE d'un tableau par son intitulé : supprimer avec chemin = la liste et mot = l'intitulé (« enlève la taxe foncière » dans la situation locative → chemin « locatif.lignes », mot « Taxe foncière » ; les listes : description.lignes, emplacement.lignes, locatif.lignes, juridique.lignes, conclusion.points, marche.references, description.surfaces). Une IMAGE JOINTE se pose par photo : cle couverture = la grande photo du BIEN en haut de la page de garde ; emplacement = la photo de la page Emplacement ; portrait = la photo du MANDATAIRE (« ma photo », « ma tête », « moi », une personne) sur la page de garde, à cheval entre la page blanche et le bandeau ; retirer: true l'enlève. Le portrait se déplace et se met en forme par sa clé « couverture:bloc.photo.portrait ».\n` +
      `DÉPLACER un élément : positionner, avec la clé « page:chemin » (page parmi couverture, cadre, description, emplacement, locatif, juridique, marche, methodes, conclusion ; un texte par son chemin, un bloc par « bloc.<nom> » : photo.couverture, photo.emplacement, logo, bande, couverture_texte, resume, cadre_table, surfaces, references, encadre_marche, formule_1, formule_2, valeur_libre, grille_prix, points, signature, curseur, locatif_colonnes, <section>.lignes) et dx_mm / dy_mm (« monte un peu » : dy_mm -8 ; « vers la droite » : dx_mm 15), ou reinitialiser pour remettre en place.\n` +
      `styler accepte aussi : surlignage (fond derrière un texte), barre, majuscules, police (serif, sans, mono, modele), interligne, espacement (em), opacite (%), et pour un bloc (bloc.<nom>, photo.couverture, photo.emplacement) : fond, bordure (fine, epaisse, aucune) + bordure_couleur, arrondi (mm), marge (mm), largeur (%), hauteur_mm, rotation (degrés), ombre, masque (true cache l'élément : « enlève le logo », « cache la signature » ; false le remontre).\n` +
      `La MISE EN FORME se fait donc ici, par styler : ne dis jamais que c'est impossible. Chemins fréquents : la valeur « chiffres.valeur » (couverture du résumé et conclusion), le demandeur « demandeur », la date « date », « rédigé par » « libre.redige », l'adresse de couverture « bien.rue » et sa ville « bien.ville », le type de bien « type_libelle », les titres de pages « libre.titre_<section> » (titre_cadre, titre_description, titre_emplacement, titre_locatif, titre_juridique, titre_marche, titre_methodes), les textes « <section>.synthese », « description.resume », les lignes « <section>.lignes.<n>.texte ». Plusieurs éléments : une opération styler par chemin. La mise en page (taille de la photo « mise_en_page.photo_emplacement_mm », taille de la valeur « mise_en_page.taille_valeur_pt ») se pose par poser.\n` +
      `Pour reformuler, raccourcir, rendre plus vendeur : poser le nouveau texte au même chemin. Pour « enlève ça » sur une ligne : supprimer. Garde le ton du document (professionnel, phrases courtes). Les nombres s'écrivent en chiffres sans unité. Si la demande est floue, fais le plus probable et dis ce que tu as fait. Si elle demande autre chose qu'une retouche du document, réponds sans opération.\n\n` +
      `Nous sommes le ${jourLong()}.\n\n` +
      (selection?.chemin ? `ÉLÉMENT SÉLECTIONNÉ par le mandataire (« ça », « ce texte » le désignent) : chemin « ${selection.chemin} », texte actuel : « ${String(selection.texte ?? lireChemin(base, selection.chemin) ?? '').slice(0, 1200)} »\n\n` : '') +
      (piece ? `IMAGE JOINTE : « ${piece.nom} ». Pose-la avec l'opération photo : cle « portrait » si la demande parle du mandataire (« ma photo », « ma tête », « moi », un visage, une personne) ou si l'élément sélectionné est bloc.photo.portrait ; « emplacement » si elle parle de l'emplacement, de la rue ou de la façade, ou si l'élément sélectionné est bloc.photo.emplacement ; « couverture » pour une photo du bien en page de garde. Ne déplace pas une photo existante pour y loger l'image : pose-la à sa place.\n\n` : '') +
      (fil ? `DERNIERS ÉCHANGES :\n${fil}\n\n` : '') +
      `DEMANDE : ${demande}\n\n` +
      `AVIS (JSON) :\n${JSON.stringify(avisPourLeModele(base)).slice(0, 60000)}`,
    response_json_schema: SCHEMA_RETOUCHES,
  }));
  if (!brut || typeof brut !== 'object') return { ok: false, error: 'La retouche n\'a rien rendu : réessayez.' };

  let operations = (brut.operations || []).map((o) => (o.op === 'photo' && !o.retirer && piece?.url ? { ...o, url: piece.url } : o));
  // Une image jointe finit toujours quelque part : à défaut, là où le mandataire a cliqué, sinon en couverture.
  if (piece?.url && !operations.some((o) => o.op === 'photo')) {
    const cle = selection?.chemin === 'bloc.photo.emplacement' ? 'emplacement' : selection?.chemin === 'bloc.photo.portrait' || /\b(ma (photo|t[eê]te)|moi|portrait|visage)\b/i.test(demande) ? 'portrait' : 'couverture';
    operations = [...operations, { op: 'photo', cle, url: piece.url }];
  }
  const { avis, faits } = appliquerOperations(base, operations);
  const appliquees = faits.filter((f) => !f.refus);
  if (appliquees.length && provisoire) {
    // Une opération par fait, dans l'ordre : on garde celles qui ont pris.
    const prises = operations.filter((_, i) => !faits[i]?.refus);
    const sc = e.surcouche || {};
    Records.update(ENTITE, e.id, { surcouche: { ...sc, operations: [...(sc.operations || []), ...prises].slice(-200) } });
  } else if (appliquees.length) {
    Records.create('AvisVersion', { estimation_id: e.id, le: new Date().toISOString(), par: user?.email || null, motif: demande.slice(0, 160), avis: e.avis });
    Records.update(ENTITE, e.id, { avis, avis_retouche_le: new Date().toISOString() });
  }
  const refus = faits.filter((f) => f.refus);
  const reponse = String(brut.reponse || '').trim() + (refus.length && !appliquees.length ? ` (${refus.map((r) => r.refus).join(' ; ')})` : '');
  const apres = appliquees.length ? Records.get(ENTITE, e.id) : e;
  return { ok: true, reponse, faits, estimation: apres, avis: provisoire ? appliquerSurcouche(avisProvisoire(apres, signataire({ email: apres.mandataire_email })), apres.surcouche) : apres.avis };
}

/** Les versions d'un avis, la plus récente d'abord, sans leur contenu. */
export function versionsAvis(id, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const versions = Records.list('AvisVersion').filter((v) => v.estimation_id === e.id)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map(({ id: vid, le, par, motif }) => ({ id: vid, le, par, motif }));
  return { ok: true, versions };
}

/** Revenir à une version : l'avis courant part lui-même dans les versions. */
export function restaurerVersion(id, versionId, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const v = Records.get('AvisVersion', versionId);
  if (!v || v.estimation_id !== e.id) return { ok: false, error: 'Version introuvable.' };
  Records.create('AvisVersion', { estimation_id: e.id, le: new Date().toISOString(), par: user?.email || null, motif: `Avant retour à la version du ${new Date(v.le).toLocaleString('fr-FR', { timeZone: PARIS })}`, avis: e.avis });
  return { ok: true, estimation: Records.update(ENTITE, e.id, { avis: v.avis, avis_retouche_le: new Date().toISOString() }) };
}

/** Une version posée par l'éditeur lui-même (avant une retouche à la main importante). */
export function poserVersion(id, { motif = 'Retouche à la main' } = {}, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  if (!e.avis) return { ok: false, error: 'Pas d\'avis.' };
  const toutes = Records.list('AvisVersion').filter((v) => v.estimation_id === e.id).sort((a, b) => String(a.le).localeCompare(String(b.le)));
  // Trente versions au plus par avis : les plus anciennes s'effacent.
  for (const v of toutes.slice(0, Math.max(0, toutes.length - 29))) Records.delete('AvisVersion', v.id);
  Records.create('AvisVersion', { estimation_id: e.id, le: new Date().toISOString(), par: user?.email || null, motif: String(motif).slice(0, 160), avis: e.avis });
  return { ok: true };
}

// --- La conversation d'une estimation -----------------------------------------

const ESPACE_CHAT = 'mandataire-estimation';
const LIBELLES_QUESTIONNAIRE = {
  adresse: 'Adresse', demandeur: 'Demandeur', surface_utile: 'Surface utile', occupe: 'Occupé', locataire: 'Locataire',
  activite_locataire: 'Activité', loyer_annuel_hc: 'Loyer annuel HT HC', bail_type: 'Bail', echeance: 'Échéance', date_visite: 'Visite',
};

// Les questions de la reprise, dans l'ordre du questionnaire (les critères Data-B ont leurs choix).
const QUESTIONS_REPRISE = {
  type_bien: 'Le type de bien : murs de commerce, bureaux, local d\'activité ?',
  occupe: 'Le local est-il loué ?',
  adresse: 'L\'adresse exacte',
  demandeur: 'Le propriétaire des murs (le demandeur de l\'avis)',
  surface_utile: 'La surface utile, en m²',
  etat: 'L\'état général du local',
  date_visite: 'La date de la visite',
  locataire: 'Le locataire (sa société)',
  activite_locataire: 'Son activité',
  bail_type: 'Le type de bail : 3-6-9, dérogatoire, professionnel ?',
  date_effet: 'La date d\'effet du bail',
  echeance: 'L\'échéance du bail',
  loyer_annuel_hc: 'Le loyer annuel HT HC',
  indexation: 'L\'indexation (ILC, ILAT)',
  taxe_fonciere: 'La taxe foncière : son montant, et qui la paie',
  charges: 'Les charges : refacturées au locataire ?',
  facade: 'La façade (linéaire, vitrine)',
  emplacement: 'L\'emplacement : n° 1, n° 1 bis, secondaire ?',
  etat_local: 'L\'état du local : parfait, d\'usage, travaux, brut ?',
  etat_immeuble: 'L\'état de l\'immeuble : parfait, d\'usage, travaux, à rénover ?',
  angle: 'Est-il en angle ?',
  extraction: 'Y a-t-il une extraction ?',
  parking: 'Un parking à proximité ?',
  pmr: 'L\'accessibilité PMR : aux normes, travaux à faire ?',
  franchise: 'Le locataire est-il sous enseigne ?',
  anciennete_locataire: 'Depuis combien de temps est-il dans les lieux ?',
  retards_paiement: 'Des retards de paiement ?',
  licence_4: 'Une licence IV ?',
};

/** Pure : le message qui rouvre une estimation dans le chat — ce qu'on sait, ce qui reste. */
export function messageDeReprise(e) {
  const q = e.questionnaire || {};
  const connu = Object.entries(LIBELLES_QUESTIONNAIRE)
    .map(([k, mot]) => [mot, k === 'occupe' ? (q.occupe === true ? 'oui' : q.occupe === false ? 'non' : null) : k === 'loyer_annuel_hc' && q[k] ? `${Number(q[k]).toLocaleString('fr-FR')} €` : k === 'surface_utile' && q[k] ? `${q[k]} m²` : q[k]])
    .filter(([, v]) => v != null && v !== '')
    .map(([mot, v]) => { const t = String(v).replace(/\s+/g, ' ').trim(); return `${mot} : ${t.length > 90 ? `${t.slice(0, 88).replace(/[\s,;(]+\S*$/, '')}…` : t}`; });
  if (!connu.length && e.adresse) connu.push(`Adresse : ${e.adresse}`);
  if (e.avis) {
    const c = e.avis.chiffres || {};
    return `L'avis de valeur de ${e.bien} est rédigé${c.valeur ? ` : ${c.valeur.toLocaleString('fr-FR')} € (fourchette ${c.bas?.toLocaleString('fr-FR')} – ${c.haut?.toLocaleString('fr-FR')} €)` : ''}. Dites-moi ce qu'il faut corriger ou compléter : je le rédigerai de nouveau.`;
  }
  if (e.de_la_visite && !e.de_la_visite.confirme_le) return messageDeLaVisite(e);
  // À l'arrivée sur l'Avis de valeur (27 oct. 2026, Jules) : la conversation montre déjà ce que Haka a repris de la visite
  // et les questions qui restent, numérotées, au lieu d'une invitation à tout redire.
  const ordre = Object.keys(QUESTIONS_REPRISE);
  const reste = manquants({ type_bien: 'murs_commerce', ...q }).filter((k) => QUESTIONS_REPRISE[k]).sort((x, y) => ordre.indexOf(x) - ordre.indexOf(y));
  const visite = e.infos_rdv ? '\nJ\'ai repris le compte rendu de la visite.' : '';
  const questions = reste.slice(0, 12).map((k, i) => `${i + 1}. ${QUESTIONS_REPRISE[k]}`);
  return `Reprenons l'estimation de ${e.bien}.${visite}${connu.length ? `\nCe que j'ai déjà : ${connu.join(' · ')}.` : ''}\n${questions.length ? `Pour rédiger l'avis, il me manque :\n${questions.join('\n')}\nRépondez en vrac, au micro si vous voulez, ou joignez le bail avec « + ». « Je ne sais pas » ne bloque rien.` : 'Dites « rédige l\'avis » et je m\'y mets, ou ajoutez ce que vous savez encore.'}`;
}

// --- De la visite à l'avis (29 oct. 2026, Jules) -------------------------------
//
// « Oui, passer à l'estimation » mène à l'Avis de valeur du bien : l'avis à droite n'est pas encore rempli ; à gauche,
// Haka dit ce qu'il sait déjà (la fiche, le compte rendu de visite) et demande de le confirmer. Au oui, ces réponses
// entrent dans l'avis (il se remplit pour la première fois), puis viennent les questions qui manquent. Sans modèle.

const LIBELLES_VISITE = {
  adresse: 'Adresse', demandeur: 'Propriétaire des murs', occupe: 'Loué', locataire: 'Locataire', activite_locataire: 'Activité',
  surface_utile: 'Surface utile', loyer_annuel_hc: 'Loyer annuel HT HC', date_effet: 'Bail depuis', echeance: 'Fin du bail',
  taxe_fonciere: 'Taxe foncière', charges: 'Charges', etat: 'État du local', flux: 'Passage', environnement: 'Voisinage', date_visite: 'Visite',
};
export const OUI_VISITE = "Oui, c'est juste.";

/** Pure : ce que la fiche et le compte rendu de visite disent déjà, en réponses du questionnaire de l'avis. */
export function reponsesDeLaVisite(p = {}) {
  const cr = p.biens?.compte_rendu || {};
  const b = cr.bien || {}; const e = cr.etat || {};
  const faite = p.biens?.visite?.faite_le || cr.le || null;
  const charges = [b.charges, b.refacturees === true ? 'refacturées au locataire' : b.refacturees === false ? 'non refacturées' : null].filter(Boolean).join(', ');
  const r = {
    type_bien: 'murs_commerce',
    adresse: [p.adresse, p.ville].filter(Boolean).join(', ') || null,
    demandeur: p.nom || null,
    occupe: p.commerce || b.loyer_annuel ? true : null,
    locataire: p.commerce || null,
    activite_locataire: p.activite || null,
    surface_utile: b.surface || null,
    loyer_annuel_hc: b.loyer_annuel || null,
    date_effet: b.bail_date || null,
    echeance: b.fin_bail || null,
    taxe_fonciere: b.taxe_fonciere || null,
    charges: charges || null,
    etat: [e.local, b.travaux ? `travaux : ${b.travaux}` : null].filter(Boolean).join(' ; ') || null,
    flux: e.passage || null,
    environnement: e.voisinage || null,
    date_visite: faite && Number.isFinite(Date.parse(faite)) ? jourLong(new Date(faite)) : null,
  };
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== ''));
}

/** Pure : le message « De ce que je sais… », à confirmer d'un tap. */
export function messageDeLaVisite(e) {
  const r = e.de_la_visite?.reponses || {};
  const lignes = Object.entries(LIBELLES_VISITE).filter(([k]) => r[k] != null && r[k] !== '').map(([k, mot]) => {
    const v = k === 'occupe' ? (r[k] ? 'oui' : 'non') : k === 'loyer_annuel_hc' ? `${Number(r[k]).toLocaleString('fr-FR')} €` : k === 'surface_utile' ? `${r[k]} m²` : String(r[k]).replace(/\s+/g, ' ').trim();
    return `- ${mot} : ${v}`;
  });
  const recit = e.de_la_visite?.recit ? `\nDu récit de la visite : ${String(e.de_la_visite.recit).slice(0, 400)}` : '';
  if (!lignes.length && !recit) return `Commençons l'avis de valeur de ${e.bien}. Que savez-vous du bien : la surface, le loyer, le bail, l'état ?`;
  return `Commençons l'avis de valeur de ${e.bien}. De ce que je sais :\n${lignes.join('\n')}${recit}\nVous me le confirmez ? Corrigez ce qui est faux, ou dites oui : l'avis commence.`;
}

/**
 * L'Avis de valeur ouvert depuis la visite : l'estimation du bien (créée au besoin, rattachée à la fiche), avec ce que
 * la visite dit, gardé à part jusqu'au oui. Rien ne s'écrit dans l'avis avant.
 */
export async function avisDepuisLaVisite(ficheId, user) {
  const p = Records.get('ProprietaireMandataire', ficheId);
  if (!p || String(p.mandataire_email || '').toLowerCase() !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Bien introuvable.' };
  const { objetsDuBien } = await import('./bien-etapes.js');
  let e = objetsDuBien(p).estimation;
  if (e?.avis || e?.de_la_visite) return { ok: true, estimation_id: e.id };
  const reponses = reponsesDeLaVisite(p);
  const recit = !p.biens?.compte_rendu?.bien && p.biens?.compte_rendu?.texte ? p.biens.compte_rendu.texte : null;
  const de_la_visite = { reponses, ...(recit ? { recit } : {}), le: new Date().toISOString() };
  const bien = [p.commerce || p.nom, p.ville].filter(Boolean).join(' · ') || reponses.adresse || 'Bien';
  if (!e) {
    e = Records.create(ENTITE, {
      mandataire_email: String(p.mandataire_email || user?.email || '').toLowerCase(), proprietaire_id: p.id, bien, adresse: reponses.adresse || null,
      statut: 'brouillon', questionnaire: { type_bien: 'murs_commerce', adresse: reponses.adresse || null }, de_la_visite,
      cree_le: new Date().toISOString(), historique: [{ le: new Date().toISOString(), par: user?.email || null, action: 'avis commencé depuis la visite' }],
    });
  } else {
    e = Records.update(ENTITE, e.id, { de_la_visite, ...(e.questionnaire ? {} : { questionnaire: { type_bien: 'murs_commerce', adresse: reponses.adresse || e.adresse || null } }) });
  }
  return { ok: true, estimation_id: e.id, cree: true };
}

/** Le oui à « De ce que je sais » : les réponses de la visite entrent dans l'avis, puis les questions qui restent. */
export function confirmerLaVisite(e, user, conversationId = null) {
  const r = e.de_la_visite?.reponses || {};
  Records.update(ENTITE, e.id, { de_la_visite: { ...e.de_la_visite, confirme_le: new Date().toISOString() }, ...(e.de_la_visite?.recit && !e.infos_rdv ? { infos_rdv: e.de_la_visite.recit } : {}) });
  const n = noter(r, user, conversationId);
  if (!n.ok) return { texte: n.error };
  const ordre = Object.keys(QUESTIONS_REPRISE);
  const reste = (n.manquants || []).filter((k) => QUESTIONS_REPRISE[k]).sort((x, y) => ordre.indexOf(x) - ordre.indexOf(y));
  if (!reste.length) return { texte: "C'est noté dans l'avis. Plus rien ne manque : dites « rédige l'avis » et je m'y mets." };
  return { texte: `C'est noté dans l'avis. Pour l'estimer, il me manque :\n${reste.slice(0, 12).map((k, i) => `${i + 1}. ${QUESTIONS_REPRISE[k]}`).join('\n')}\nRépondez en vrac, au micro si vous voulez, ou joignez le bail avec « + ». « Je ne sais pas » ne bloque rien.` };
}

/**
 * La conversation d'une estimation, toujours valable : la sienne si elle
 * existe encore, sinon une nouvelle qui reprend où on en était. L'estimation
 * y est rattachée, et redevient l'avis en cours de cette conversation.
 */
export async function conversationDeLEstimation(id, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const C = await import('./assistant-conversations.js');
  if (e.conversation_id && C.lireConversation(user, e.conversation_id, { espace: ESPACE_CHAT })) return { ok: true, conversation_id: e.conversation_id };
  const messages = [
    { role: 'user', contenu: `Estimation · ${e.bien}` },
    {
      role: 'assistant', contenu: messageDeReprise(e),
      ...(!e.avis && e.de_la_visite && !e.de_la_visite.confirme_le ? { boutons: [{ libelle: "Oui, c'est juste", texte: OUI_VISITE, principal: true }] } : {}),
      ...(e.avis ? { cartes: [{ titre: 'Avis de valeur', detail: e.avis.chiffres?.valeur ? `${e.avis.chiffres.valeur.toLocaleString('fr-FR')} € · fourchette ${e.avis.chiffres.bas?.toLocaleString('fr-FR')} – ${e.avis.chiffres.haut?.toLocaleString('fr-FR')} €` : 'À compléter dans l’éditeur', etat: 'fait', lien: `avis:${e.id}`, action: 'Ouvrir l’avis' }] } : {}),
    },
  ];
  const r = C.enregistrerConversation(user, { messages, espace: ESPACE_CHAT });
  if (!r.ok) return r;
  // Sans avis rédigé, le questionnaire reprend : c'est l'avis en cours de cette conversation.
  const maj = { conversation_id: r.id };
  if (!e.avis) {
    for (const x of Records.list(ENTITE).filter((y) => y.mandataire_email === e.mandataire_email && y.questionnaire_en_cours && y.id !== e.id && !y.conversation_id)) {
      Records.update(ENTITE, x.id, { questionnaire_en_cours: false });
    }
    maj.questionnaire_en_cours = true;
    if (!e.questionnaire) maj.questionnaire = { adresse: e.adresse || null, ...(e.infos_rdv ? { etat: String(e.infos_rdv).slice(0, 2000) } : {}) };
  }
  Records.update(ENTITE, e.id, maj);
  return { ok: true, conversation_id: r.id, cree: true };
}

// --- L'aperçu : l'avis qui se construit pendant les questions -----------------

const lignesDe = (paires) => paires.filter(([, v]) => v != null && v !== '').map(([mot, texte, alerte]) => ({ mot, texte: String(texte), ...(alerte ? { alerte: true } : {}) }));

/**
 * Pure : l'avis tel qu'on peut déjà l'écrire avec les réponses du
 * questionnaire, avant la rédaction. Les chiffres, le marché et les analyses
 * attendent ; tout le reste se remplit à mesure.
 */
export function avisProvisoire(e, signataireAvis = {}) {
  const q = e.questionnaire || {};
  const occupe = q.occupe === true;
  const loyer = Number(q.loyer_annuel_hc) || null;
  const surface = Number(q.surface_utile) || null;
  return {
    version: 1,
    provisoire: true,
    type_bien: q.type_bien || 'murs_commerce',
    type_libelle: TYPES_BIEN[q.type_bien] || 'Avis de valeur',
    occupe,
    date: jourLong(),
    bien: { rue: q.adresse || e.adresse || null, ville: '', adresse: q.adresse || e.adresse || null, lat: null, lon: null },
    demandeur: q.demandeur || null,
    signataire: signataireAvis,
    cadre: {
      objet: `Estimer la valeur vénale ${q.type_bien === 'murs_commerce' || !q.type_bien ? 'des murs' : 'du bien'} en vue d'une éventuelle cession`,
      bien: q.type_bien ? `${TYPES_BIEN[q.type_bien]}${q.occupe === true ? ' occupé' : q.occupe === false ? ' libre' : ''}${q.adresse ? `, ${q.adresse}` : ''}` : null,
      visite: q.date_visite ? `Réalisée le ${q.date_visite}${q.visite_avec ? ` en présence ${q.visite_avec}` : ''}` : null,
    },
    description: {
      resume: surface ? `${surface} m² utiles${q.reserve ? `, réserve ${q.reserve}` : ''}.` : null,
      lignes: lignesDe([['Désignation', q.description], ['Configuration', q.configuration], ['Façade', q.facade], ['Équipements', q.equipements], ['État', q.etat]]),
      surfaces: surfacesDe(q),
    },
    emplacement: {
      synthese: q.emplacement || '',
      lignes: lignesDe([['Flux', q.flux], ['Environnement', q.environnement], ['Vacance', q.vacance], ['Accès', q.acces]]),
    },
    locatif: occupe ? {
      synthese: '',
      lignes: lignesDe([
        ['Locataire', [q.locataire, q.activite_locataire].filter(Boolean).join(', ') || null],
        ['Bail', [q.bail_type, q.date_effet ? `à effet du ${q.date_effet}` : null].filter(Boolean).join(', ') || null],
        ['Échéance', q.echeance],
        ['Loyer', loyer ? `${loyer.toLocaleString('fr-FR')} € HT HC par an${surface ? `, soit ${Math.round(loyer / surface)} €/m²` : ''}` : null],
        ['Indexation', q.indexation], ['Taxe foncière', q.taxe_fonciere], ['Charges', q.charges],
        ['Dépôt de garantie', q.depot_garantie], ['Paiements', q.paiements],
      ]),
      solidite: '',
      valeur_locative: '',
    } : null,
    juridique: {
      synthese: '',
      lignes: lignesDe([['Copropriété', q.copropriete], ['Travaux votés', q.travaux_votes, true], ['Urbanisme', q.urbanisme], ['Diagnostics', q.diagnostics], ['Servitudes', q.servitudes]]),
    },
    marche: { synthese: 'Le marché de la rue (Data-B, Equimmox) et les ventes alentour (DVF) se lisent à la rédaction.', references: [], source: '', loyers: null, lecture: '' },
    methodes: { synthese: 'Le taux de rendement vient de Data-B à la rédaction.', taux: null, justification_taux: '', prix_m2: null, justification_prix: '', loyer: occupe ? loyer : null, surface },
    chiffres: { valeur: null, bas: null, haut: null, rendement: null, honoraires_pct: 5, frais_pct: 7.5, prix_affiche: null, cout_total: null },
    conclusion: { points: [], reserves: RESERVES, fait_a: signataireAvis.ville_signature || '[ville]' },
    photos: { couverture: null, emplacement: null, portrait: null },
  };
}

/** L'aperçu d'une estimation : l'avis rédigé, sinon celui qui se construit. */
export function apercuEstimation(id, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const manque = e.questionnaire ? manquants(e.questionnaire) : [];
  return {
    ok: true,
    estimation: e,
    provisoire: !e.avis,
    avis: e.avis || appliquerSurcouche(avisProvisoire(e, signataire({ email: e.mandataire_email })), e.surcouche),
    manquants: manque,
  };
}

// --- La surcouche : les retouches à la main avant la rédaction ----------------
//
// Pendant les questions, l'avis à droite du chat se modifie déjà. Ces
// retouches ne vivent pas dans l'avis (il n'existe pas encore) : elles se
// gardent à part, chemin par chemin, avec les styles, les positions, l'ordre
// des pages et les photos, et se reposent sur l'avis à chaque rédaction. Une
// ligne de tableau se désigne par son intitulé (« locatif.lignes.@Loyer.texte »),
// pas par sa place, qui change à mesure que les réponses arrivent.

const CHAMPS_DU_QUESTIONNAIRE = {
  demandeur: ['demandeur'],
  adresse: ['bien.rue', 'bien.adresse', 'cadre.bien'],
  date_visite: ['cadre.visite'], visite_avec: ['cadre.visite'],
  surface_utile: ['description.resume'], reserve: ['description.resume'],
  emplacement: ['emplacement.synthese'],
};

/** Pure : la surcouche sans les champs que le chat vient de renseigner. */
export function sansChampsRepondus(sc, cles = []) {
  if (!sc?.chemins) return sc;
  const visés = new Set(cles.flatMap((k) => CHAMPS_DU_QUESTIONNAIRE[k] || []));
  if (!visés.size || !Object.keys(sc.chemins).some((c) => visés.has(c))) return sc;
  return { ...sc, chemins: Object.fromEntries(Object.entries(sc.chemins).filter(([c]) => !visés.has(c))) };
}

/** Pure : l'avis, retouches à la main reposées dessus. */
export function appliquerSurcouche(avis, sc) {
  if (!avis || !sc) return avis;
  let a = avis;
  for (const [chemin, valeur] of Object.entries(sc.chemins || {})) {
    const ligne = chemin.match(/^(.*\.lignes)\.@([^.]+)\.(mot|texte)$/);
    if (ligne) {
      const liste = lireChemin(a, ligne[1]);
      const i = Array.isArray(liste) ? liste.findIndex((l) => memeIntitule(l?.mot, ligne[2])) : -1;
      if (i >= 0) a = poserChemin(a, `${ligne[1]}.${i}.${ligne[3]}`, valeur);
      continue;
    }
    if (/(^|\.)(signataire|__proto__|constructor|prototype)(\.|$)/.test(chemin)) continue;
    a = poserChemin(a, chemin, valeur);
  }
  if (sc.styles) a = { ...a, styles: { ...(a.styles || {}), ...sc.styles } };
  if (sc.positions) a = { ...a, positions: { ...(a.positions || {}), ...sc.positions } };
  if (sc.photos) a = { ...a, photos: { ...(a.photos || {}), ...sc.photos } };
  if (Object.keys(sc.chemins || {}).some((c) => c.startsWith('chiffres.'))) a = recalculerChiffres(a);
  // Les retouches demandées à l'atelier avant la rédaction se rejouent, dans l'ordre.
  if (Array.isArray(sc.operations) && sc.operations.length) a = appliquerOperations(a, sc.operations).avis;
  return a;
}

/** Les retouches à la main d'un avis pas encore rédigé : elles s'ajoutent à la surcouche. */
export function enregistrerSurcouche(id, patch = {}, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const avant = e.surcouche || {};
  // « remplacer » : l'éditeur envoie l'état entier (une annulation retire une retouche).
  const chemins = patch.remplacer ? {} : { ...(avant.chemins || {}) };
  for (const [c, v] of Object.entries(patch.chemins || {})) {
    if (typeof c !== 'string' || c.length > 200 || /(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(c)) continue;
    chemins[c] = v;
  }
  const garde = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : undefined);
  const surcouche = {
    chemins,
    ...(garde(patch.styles) ? { styles: patch.styles } : avant.styles ? { styles: avant.styles } : {}),
    ...(garde(patch.positions) ? { positions: patch.positions } : avant.positions ? { positions: avant.positions } : {}),
    ...(avant.photos ? { photos: avant.photos } : {}),
    // L'éditeur renvoie les retouches du chat qu'il garde : une annulation en retire.
    ...(Array.isArray(patch.operations) ? { operations: patch.operations.slice(-200) } : avant.operations ? { operations: avant.operations } : {}),
  };
  Records.update(ENTITE, e.id, { surcouche });
  return { ok: true, surcouche };
}
