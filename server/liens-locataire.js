// Les liens du locataire, dans l'onglet Locataire du projet (25 nov. 2026, Jules : « dans la partie locataire il faut les
// pages réseaux sociaux, site etc et Pappers du locataire aussi »).
//   - Pappers vient du SIREN du locataire : confirmé dans le dossier, sinon lu sur le Kbis de l'Analyse, sinon trouvé par
//     l'outil Locataire. Aucun appel : l'adresse Pappers se fait avec le SIREN.
//   - Le site et les réseaux se cherchent d'un clic dans l'éditeur (une recherche web) : seules les adresses que la
//     recherche a réellement vues sont gardées, chacune sur le domaine de son réseau. L'éditeur les enregistre comme ses
//     autres champs ; on retire celles qui ne vont pas.

import { Records } from './db.js';
import { sirenDuTexte } from './outils/lancements.js';

/** Les réseaux reconnus, par leur domaine. L'ordre est celui de l'écran. */
export const RESEAUX = [
  { type: 'site_web', label: 'Site web', domaine: null },
  { type: 'instagram', label: 'Instagram', domaine: /(^|\.)instagram\.com$/ },
  { type: 'facebook', label: 'Facebook', domaine: /(^|\.)facebook\.com$/ },
  { type: 'linkedin', label: 'LinkedIn', domaine: /(^|\.)linkedin\.com$/ },
  { type: 'google_avis', label: 'Avis Google', domaine: /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page)$/ },
  { type: 'tripadvisor', label: 'TripAdvisor', domaine: /(^|\.)tripadvisor\.[a-z.]+$/ },
  // Sans SIREN connu, la fiche Pappers de la société qui exploite le commerce, trouvée par la même recherche.
  { type: 'pappers', label: 'Pappers', domaine: /(^|\.)pappers\.fr$/ },
];
// Ce qui n'est jamais le site du commerce : annuaires, registres, réseaux, plateformes.
const PAS_UN_SITE = /(^|\.)(pappers|societe|infogreffe|annuaire-entreprises\.data\.gouv|verif|manageo|pagesjaunes|yelp|facebook|instagram|linkedin|google|tripadvisor|thefork|lafourchette|ubereats|deliveroo|justeat|tiktok|youtube|twitter|x|wikipedia|bodacc|data\.gouv|mappy|petitfute)\./i;

const hote = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };
const propre = (url) => { try { const u = new URL(String(url).trim()); u.hash = ''; return u.toString().replace(/\/$/, ''); } catch { return null; } };

/** Pure : l'adresse Pappers d'un SIREN, ou null. */
export const urlPappers = (siren) => (/^\d{9}$/.test(String(siren || '')) ? `https://www.pappers.fr/entreprise/${siren}` : null);

/**
 * Le SIREN du locataire d'un projet : le projet, le dossier (confirmé par l'analyste, puis le Kbis lu dans l'Analyse),
 * puis le dernier outil Locataire fini. `analyse` : l'Analyse du dossier déjà lue (lireAnalyse), si l'appelant l'a.
 */
export function sirenDuLocataire(projet, { deal = undefined, analyse = null } = {}) {
  if (/^\d{9}$/.test(String(projet?.siren_locataire || ''))) return projet.siren_locataire;
  // Une fiche Pappers posée dans la présence en ligne (cherchée ou collée) porte le SIREN dans son adresse.
  const pappers = (projet?.liens_locataire || []).find((l) => /pappers\.fr/i.test(String(l?.url || '')));
  const duLien = String(pappers?.url || '').match(/(\d{9})(?!\d)/)?.[1];
  if (duLien) return duLien;
  const d = deal !== undefined ? deal : projet?.deal_id ? Records.findBy('Deal', 'deal_id', projet.deal_id) : null;
  if (!d) return null;
  if (/^\d{9}$/.test(String(d.lots?.[0]?.locataire_siren || ''))) return d.lots[0].locataire_siren;
  const lignes = analyse?.grilles?.find((g) => g.id === 'kbis')?.lignes || [];
  const duKbis = sirenDuTexte(lignes.find((l) => l.id === 'immatriculation')?.valeur);
  if (duKbis) return duKbis;
  const dernier = Records.filter('LancementOutil', { deal_id: d.deal_id, outil: 'locataire', statut: 'fini' })
    .sort((x, y) => String(y.fini_le || '').localeCompare(String(x.fini_le || '')))[0];
  const s = dernier?.resultat?.points?.find((pt) => pt.cle === 'societe')?.detail?.siren;
  return /^\d{9}$/.test(String(s || '')) ? s : null;
}

/** Pure : la consigne de la recherche des liens. */
export function consigneLiens({ nom, activite, adresse, societe = null, avecPappers = false }) {
  return [
    `Trouve la présence en ligne du commerce « ${nom} »${activite ? ` (${activite})` : ''}${adresse ? `, ${adresse}` : ''}${societe ? `, exploité par la société ${societe}` : ''}.`,
    `Cherche : son site officiel, sa page Instagram, sa page Facebook, sa page LinkedIn, sa fiche Google Maps, sa page TripAdvisor${avecPappers ? ", et la fiche Pappers (pappers.fr) de la société qui l'exploite à cette adresse" : ''}. Seulement les pages de CE commerce à CETTE adresse (pour une enseigne nationale, la page du magasin si elle existe, sinon la page de l'enseigne).`,
    `Réponds par une ligne par page trouvée, au format exact « type : adresse », avec type parmi site_web, instagram, facebook, linkedin, google_avis, tripadvisor${avecPappers ? ', pappers' : ''}. Recopie les adresses telles que la recherche les a données. Une page non trouvée ne s'écrit pas. N'invente aucune adresse.`,
  ].join('\n');
}

/**
 * Pure : les liens d'une réponse, gardés seulement si la recherche les a vus (parmi ses sources, ou un lien du même
 * domaine) et si chacun est sur le domaine de son réseau. Un par réseau.
 */
export function liensDeLaReponse(texte, sources = []) {
  const vus = new Set(sources.map((s) => propre(s.url)).filter(Boolean));
  const hotesVus = new Set(sources.map((s) => hote(s.url)).filter(Boolean));
  const sortie = [];
  for (const ligne of String(texte || '').split('\n')) {
    const m = ligne.match(/\b(site_web|instagram|facebook|linkedin|google_avis|tripadvisor|pappers)\b\s*[:=-]\s*<?(https?:\/\/[^\s>)\]]+)/i);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const url = propre(m[2].replace(/[.,;]+$/, ''));
    const h = url && hote(url);
    if (!h || sortie.some((l) => l.type === type)) continue;
    const reseau = RESEAUX.find((r) => r.type === type);
    if (reseau.domaine ? !reseau.domaine.test(h) : PAS_UN_SITE.test(`${h}.`)) continue;
    // Une adresse vue telle quelle ; pour le site, le domaine vu suffit (la recherche cite souvent une page intérieure).
    if (!vus.has(url) && !(type === 'site_web' && hotesVus.has(h))) continue;
    sortie.push({ type, url, label: reseau.label });
  }
  return sortie.sort((a, b) => RESEAUX.findIndex((r) => r.type === a.type) - RESEAUX.findIndex((r) => r.type === b.type));
}

/** Cherche le site et les réseaux du locataire. `chercher` : la recherche web (remplacée dans les tests). */
export async function chercherLiens(projet, { chercher = null } = {}) {
  const nom = String(projet?.nom_locataire || '').trim();
  if (!nom) return { ok: false, error: 'Le projet n\'a pas de nom de locataire.' };
  let analyse = null;
  if (projet.deal_id) { try { analyse = (await import('./deal/analyse-pieces.js')).lireAnalyse(projet.deal_id); } catch { analyse = null; } }
  const siren = sirenDuLocataire(projet, { analyse });
  const consigne = consigneLiens({ nom, activite: projet.activite_locataire || null, adresse: projet.adresse_complete || null, avecPappers: !siren });
  const appeler = chercher || (async (prompt) => {
    const { invokeLLMGrounded } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    return (await mesurer({ operation: 'liens du locataire', sur: `projet:${projet.id || ''}` }, () => invokeLLMGrounded({ prompt, via: 'anthropic' }))).resultat;
  });
  const r = await appeler(consigne);
  if (!r) return { ok: false, error: 'La recherche web ne répond pas.' };
  // Le SIREN connu fait déjà la ligne Pappers : une fiche Pappers trouvée ne sert que sans lui.
  const liens = liensDeLaReponse(r.final || r.text, r.sources || []).filter((l) => l.type !== 'pappers' || !siren);
  return { ok: true, siren, liens };
}

/** Pure : les liens du projet complétés par ceux trouvés, sans doublon de réseau ni d'adresse. */
export function fusionnerLiens(actuels = [], trouves = []) {
  const sortie = [...(actuels || [])];
  for (const l of trouves) {
    if (sortie.some((x) => x.type === l.type && l.type !== 'autre') || sortie.some((x) => propre(x.url) === propre(l.url))) continue;
    sortie.push(l);
  }
  return sortie;
}

// --- La fiche de la société, pour l'aperçu Pappers de l'onglet Locataire (26 nov. 2026, Jules : « Pappers avec un
// aperçu comme ça, pas juste une icône et du texte moche ») -------------------------------------------------------------
// L'annuaire des entreprises (DINUM, sans clé) donne l'identité, le siège, l'activité, l'effectif et les dirigeants ; s'il
// ne répond pas, l'API Sirene de l'INSEE donne le nom, la forme, l'état et l'année. Le capital n'est dans aucune des deux :
// il n'apparaît pas. La fiche se garde sept jours (le cache de kzoning-societe.js), ce qui sert aussi au lien public.

const CACHE_SOCIETE = 'CacheSocieteKZoning';

/** Pure : la fiche telle que l'écran la montre, depuis la fiche de kzoning-societe.js (ou celle de l'INSEE). */
export function ficheDeSociete(s, { libelleActivite = () => null, tranches = {} } = {}) {
  if (!s?.siren) return null;
  const adresse = s.siege?.adresse || null;
  return {
    siren: s.siren,
    nom: s.nom || s.raison_sociale || null,
    forme: s.forme || null,
    active: s.active !== false,
    creation: s.creation || s.annee_creation || null,
    adresse,
    activite: libelleActivite(s.activite_code) || null,
    activite_code: s.activite_code || null,
    effectif: tranches[s.effectif_societe] || null,
    dirigeants: (s.dirigeants || []).map((d) => d.nom).filter(Boolean).slice(0, 4),
    pappers: urlPappers(s.siren),
  };
}

async function outilsFiche() {
  const { libelleActivite } = await import('./naf.js');
  const { TRANCHES_EFFECTIF } = await import('./outils/lancements.js');
  return { libelleActivite, tranches: TRANCHES_EFFECTIF };
}

/** La fiche gardée pour ce SIREN, sans appel (le lien public). */
export async function ficheGardee(siren) {
  if (!/^\d{9}$/.test(String(siren || ''))) return null;
  const g = Records.findBy(CACHE_SOCIETE, 'cle', `q:${siren}:leger`) || Records.findBy(CACHE_SOCIETE, 'cle', `q:${siren}`);
  return g?.societe ? ficheDeSociete(g.societe, await outilsFiche()) : null;
}

/** La fiche de la société du SIREN : l'annuaire, sinon l'INSEE. Rend { ok, fiche } ou { ok: false, error }. */
export async function ficheSociete(siren) {
  if (!/^\d{9}$/.test(String(siren || ''))) return { ok: false, error: 'Pas de SIREN.' };
  const outils = await outilsFiche();
  const { societe, FORMES } = await import('./kzoning-societe.js');
  const r = await societe({ siret: siren, leger: true }).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  if (r.ok && r.societe?.siren === siren) return { ok: true, fiche: ficheDeSociete(r.societe, outils) };
  try {
    const { uniteLegale, sireneConfigure } = await import('./insee-sirene.js');
    if (sireneConfigure()) {
      const u = await uniteLegale(siren);
      if (u) {
        const { siegeDuSiren } = await import('./insee-sirene.js');
        const siege = await siegeDuSiren(siren).catch(() => null);
        return { ok: true, fiche: ficheDeSociete({ ...u, forme: FORMES[Number(u.forme_code)] || null, siege: siege ? { adresse: siege.adresse } : null }, outils) };
      }
    }
  } catch { /* l'INSEE ne répond pas non plus */ }
  return { ok: false, error: r.error || 'La fiche de la société n\'a pas pu être lue.' };
}

// --- Les pages trouvées d'office (26 nov. 2026, Jules : « je veux que tu ailles chercher les autres trucs ; en dessous
// de Voir sur Pappers, on peut voir avis Google ») -------------------------------------------------------------------------
// À la première ouverture de l'onglet Locataire par l'équipe, la recherche web part une fois pour le projet (le nom du
// locataire et l'adresse), et son résultat se garde trente jours (LiensLocataireTrouves), même vide. Les pages trouvées
// vivent à part du projet : un enregistrement de l'éditeur ne peut pas les effacer ; on en retire une depuis l'éditeur
// (liens_masques du projet). Le client et le lien public lisent ce qui a été gardé, sans rien lancer.

const TROUVES = 'LiensLocataireTrouves';
const TROUVES_JOURS = 30;
const enRecherche = new Map();
const cleRecherche = (projet) => `${String(projet?.nom_locataire || '').trim().toLowerCase()}|${String(projet?.adresse_complete || '').trim().toLowerCase()}`;

/** Les pages trouvées gardées pour ce projet (son nom et son adresse actuels), ou null si rien n'a encore été cherché. */
export function liensTrouvesGardes(projet) {
  if (!projet?.id) return null;
  const g = Records.filter(TROUVES, { project_id: projet.id }).find((x) => x.cle === cleRecherche(projet));
  return g ? { liens: g.liens || [], siren: g.siren || null, le: g.le } : null;
}

/** Les pages trouvées : gardées, sinon cherchées une fois (`lancer` faux : seulement ce qui est gardé). */
export async function liensTrouves(projet, { lancer = true, chercher = null } = {}) {
  const garde = liensTrouvesGardes(projet);
  if (garde && Date.now() - Date.parse(garde.le) < TROUVES_JOURS * 86400000) return { ok: true, ...garde };
  if (!lancer || !String(projet?.nom_locataire || '').trim()) return { ok: true, liens: garde?.liens || [], siren: garde?.siren || null, le: garde?.le || null };
  const cle = `${projet.id}|${cleRecherche(projet)}`;
  if (enRecherche.has(cle)) return enRecherche.get(cle);
  const travail = (async () => {
    try {
      const r = await chercherLiens(projet, { chercher });
      if (!r.ok) return { ok: false, error: r.error, liens: garde?.liens || [] };
      const donnees = { project_id: projet.id, cle: cleRecherche(projet), liens: r.liens, siren: r.siren || null, le: new Date().toISOString() };
      const ancien = Records.filter(TROUVES, { project_id: projet.id }).find((x) => x.cle === donnees.cle);
      if (ancien) Records.update(TROUVES, ancien.id, donnees); else Records.create(TROUVES, donnees);
      return { ok: true, liens: r.liens, siren: r.siren || null, le: donnees.le };
    } finally { enRecherche.delete(cle); }
  })();
  enRecherche.set(cle, travail);
  return travail;
}

// --- Le résumé des avis Google (26 nov. 2026, Jules : « un design comme ça avec l'enseigne du projet ; tu vas chercher
// la vraie note des avis ») ------------------------------------------------------------------------------------------------
// La fiche Google Maps du commerce (le nom du locataire et l'adresse du projet), lue par le navigateur du serveur : la
// note, et le nombre d'avis par étoile tels que la fiche les écrit dans ses libellés (« 5 étoiles, 1 724 avis »). Gardé
// sept jours par projet et par adresse (AvisGoogleProjet), même introuvable ; seule l'équipe lance la lecture, le client
// et le lien public lisent ce qui est gardé.

const AVIS = 'AvisGoogleProjet';
const AVIS_JOURS = 7;
const enLectureAvis = new Map();
const nombreFr = (t) => Number(String(t || '').replace(/\s/g, '').replace(',', '.'));

/** Pure : la note et la répartition, depuis les libellés de la fiche Google Maps. */
export function lireAvisGoogle(libelles = []) {
  const repartition = {};
  let note = null;
  for (const brut of libelles) {
    const l = String(brut || '').replace(/\s+/g, ' ').trim();
    const r = l.match(/^([1-5]) étoiles?, ([\d\s]+) avis$/i);
    if (r) { if (repartition[r[1]] == null) repartition[r[1]] = nombreFr(r[2]); continue; }
    const n = l.match(/^(\d(?:,\d)?) étoiles?$/i);
    if (n && note == null && n[1].includes(',')) note = nombreFr(n[1]);
  }
  const total = Object.values(repartition).reduce((s, v) => s + v, 0);
  if (!total) return null;
  if (note == null) note = Math.round((Object.entries(repartition).reduce((s, [k, v]) => s + Number(k) * v, 0) / total) * 10) / 10;
  return { note, total, repartition: [5, 4, 3, 2, 1].map((e) => ({ etoiles: e, avis: repartition[e] || 0 })) };
}

const cleAvis = (projet) => `${String(projet?.nom_locataire || '').trim().toLowerCase()}|${String(projet?.adresse_complete || '').trim().toLowerCase()}`;

/** Le résumé gardé pour ce projet (nom et adresse actuels), ou null. Sans appel. */
export function avisGoogleGarde(projet) {
  if (!projet?.id) return null;
  return Records.filter(AVIS, { project_id: projet.id }).find((x) => x.cle === cleAvis(projet))?.avis || null;
}

/** Le résumé des avis Google : gardé, sinon lu (`lancer` faux : seulement ce qui est gardé). `lire` : remplacé en test. */
export async function avisGoogle(projet, { lancer = true, lire = null } = {}) {
  const nom = String(projet?.nom_locataire || '').trim();
  if (!nom || !projet?.adresse_complete) return { ok: false, error: 'Il faut le nom du locataire et l\'adresse.' };
  const garde = Records.filter(AVIS, { project_id: projet.id }).find((x) => x.cle === cleAvis(projet));
  if (garde && Date.now() - Date.parse(garde.le) < AVIS_JOURS * 86400000) return { ok: true, avis: garde.avis };
  if (!lancer) return { ok: true, avis: garde?.avis || null };
  const cle = `${projet.id}|${cleAvis(projet)}`;
  if (enLectureAvis.has(cle)) return enLectureAvis.get(cle);
  const requete = `${nom}, ${projet.adresse_complete}`;
  const travail = (async () => {
    try {
      const lecture = lire || (async (q) => {
        const { lancerNavigateur, contexteDiscret } = await import('./marche/navigateur.js');
        const b = await lancerNavigateur('Les avis Google');
        const ctx = await contexteDiscret(b, { viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
        try {
          const p = await ctx.newPage();
          await p.goto(`https://www.google.com/maps/search/?api=1&hl=fr&query=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await p.waitForTimeout(2000);
          // La page de consentement de Google, en Europe : on refuse, la fiche s'ouvre ensuite.
          if (/consent\.google/.test(p.url())) {
            const refuser = p.locator('button:has-text("Tout refuser"), button:has-text("Reject all")').first();
            if (await refuser.count()) { await refuser.click(); await p.waitForTimeout(3500); }
          }
          // Plusieurs résultats : le premier.
          if (!/\/maps\/place\//.test(p.url())) {
            const premier = p.locator('a[href*="/maps/place/"]').first();
            if (await premier.count()) { await premier.click(); await p.waitForTimeout(3500); }
          }
          await p.waitForTimeout(2500);
          const libelles = await p.$$eval('[aria-label*="étoile"]', (els) => els.map((e) => e.getAttribute('aria-label')));
          const titre = await p.$$eval('h1', (els) => els.map((e) => e.textContent).filter(Boolean)[0] || null);
          return { libelles, titre, url: /\/maps\/place\//.test(p.url()) ? p.url() : null };
        } finally { await ctx.close().catch(() => {}); }
      });
      const lu = await lecture(requete);
      const resume = lireAvisGoogle(lu?.libelles || []);
      const avis = resume ? { ...resume, nom: String(lu.titre || '').trim() || nom, url: lu.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(requete)}` } : null;
      const donnees = { project_id: projet.id, cle: cleAvis(projet), avis, le: new Date().toISOString() };
      if (garde) Records.update(AVIS, garde.id, donnees); else Records.create(AVIS, donnees);
      return { ok: true, avis };
    } catch (e) {
      return garde?.avis ? { ok: true, avis: garde.avis } : { ok: false, error: `Les avis Google n'ont pas pu être lus : ${e?.message || e}` };
    } finally { enLectureAvis.delete(cle); }
  })();
  enLectureAvis.set(cle, travail);
  return travail;
}
