// Off-market, mode Simple (11 oct. 2026) : les filtres de la carte et du
// tableau, et la phrase de la barre du bas qui devient des filtres. Tout est
// pur, partagé par l'écran et les tests.

export const estExploitant = (c) => c.lien === "exploitant_certain" || c.lien === "exploitant_probable";

// Les filtres du mode Simple : cumulables, ils s'appliquent à la carte et au tableau.
export const FILTRES_SIMPLE = Object.freeze({ texte: "", rue: "", emplacement: "centre", zones: [], liens: [], activites: [], drapeaux: [], proprietaires: [], anciennete: null, chaine: null, liste: null, exploitants: false, signal: false });
export const OPTIONS_LIEN = [["exploitant", "Exploitant propriétaire"], ["tiers", "Bailleur tiers"], ["inconnu", "Propriétaire inconnu"], ["en_cours", "Recherche en cours"]];
export const OPTIONS_PROPRIETAIRE = [["sci", "SCI"], ["societe", "Société"], ["particulier", "Particulier"], ["inconnu", "Inconnu"]];
export const OPTIONS_EMPLACEMENT = [["centre", "Zones commerçantes"], ["partout", "Toute la ville"]];
export const OPTIONS_ANCIENNETE = [["5", "5 ans et plus"], ["10", "10 ans et plus"], ["20", "20 ans et plus"], ["30", "30 ans et plus"]];
export const cleLien = (c) => (estExploitant(c) ? "exploitant" : c.lien || "en_cours");
export const depuisAuMoins = (c, ans) => !!c.depuis && (Date.now() - Date.parse(c.depuis)) / (365.25 * 86400000) >= ans;
export const compteDe = (liste, f) => liste.reduce((n, c) => n + (f(c) ? 1 : 0), 0);
export const basculer = (liste, v) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
export const nbFiltres = (f) => f.liens.length + f.activites.length + f.drapeaux.length + f.proprietaires.length + (f.anciennete ? 1 : 0) + (f.chaine ? 1 : 0) + (f.liste ? 1 : 0) + (f.exploitants ? 1 : 0) + (f.signal ? 1 : 0) + (f.texte.trim() ? 1 : 0) + (f.rue ? 1 : 0) + (f.emplacement === "partout" ? 1 : 0) + (f.zones?.length || 0);
/** Pure : un commerce passe-t-il les filtres ? */
export function passeSimple(c, f) {
  if (f.exploitants && !estExploitant(c)) return false;
  if (f.signal && !c.drapeaux.length) return false;
  if (f.liens.length && !f.liens.includes(cleLien(c))) return false;
  if (f.activites.length && !f.activites.includes(c.activite)) return false;
  if (f.drapeaux.length && !f.drapeaux.some((d) => c.drapeaux.includes(d))) return false;
  if (f.proprietaires.length && !f.proprietaires.includes(c.proprietaire_type || "inconnu")) return false;
  if (f.anciennete && !depuisAuMoins(c, Number(f.anciennete))) return false;
  if (f.chaine === "chaine" && !c.chaine) return false;
  if (f.chaine === "independant" && c.chaine) return false;
  if (f.liste === "libres" && c.liste) return false;
  if (f.liste === "en_liste" && !c.liste) return false;
  if (f.rue && !sansAccents(c.adresse).includes(sansAccents(f.rue))) return false;
  // Le centre-ville par défaut (11 oct. 2026) ; « Partout » montre aussi les quartiers et les zones.
  if (f.emplacement === "centre" && c.centre === false) return false;
  if (f.zones?.length && !f.zones.includes(c.zone)) return false;
  return true;
}

const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MOTS_GENERIQUES = new Set(["commerce", "specialise", "magasin", "autres", "autre", "detail", "vente", "services", "service", "produits", "articles", "salon", "assise", "rapide"]);

/**
 * Pure : une phrase (« boulangerie, propriétaire exploitant ») devient des
 * filtres. Les activités se reconnaissent par le début des mots
 * (« coiffeur » trouve « Coiffure, salon de beauté »). Rend aussi ce qui a été
 * compris, pour le dire.
 */
export function comprendre(phrase, activites = []) {
  const t = sansAccents(phrase);
  const f = { ...FILTRES_SIMPLE, liens: [], activites: [], drapeaux: [], proprietaires: [] };
  const compris = [];
  if (/exploitant[s]? propri|propri\w* exploitant|propri\w* de (ses|leurs) murs|possede (ses|les) murs|proprio exploitant/.test(t)) { f.liens.push("exploitant"); compris.push("l'exploitant possède les murs"); }
  if (/bailleur|tiers|locataire/.test(t)) { f.liens.push("tiers"); compris.push("bailleur tiers"); }
  if (/inconnu/.test(t)) { f.liens.push("inconnu"); compris.push("propriétaire inconnu"); }
  if (/\b70\b|\bages?\b|vieux|retraite|ancien gerant|senior/.test(t)) { f.drapeaux.push("gerant_age"); compris.push("gérant de 70 ans et plus"); }
  if (/ferme/.test(t)) { f.drapeaux.push("ferme"); compris.push("fermé"); }
  if (/cession|cede|vendu/.test(t)) { f.drapeaux.push("fonds_cede"); compris.push("fonds cédé"); }
  if (/transmission|succession|deces|dissolution|liquidation/.test(t)) { f.drapeaux.push("transmission"); compris.push("transmission en cours"); }
  if (/30 ans/.test(t)) { f.drapeaux.push("detention_30"); compris.push("détenu depuis 30 ans"); }
  else if (/22 ans|plus.value/.test(t)) { f.drapeaux.push("detention_22"); compris.push("détenu depuis 22 ans"); }
  if (/signal|raison de vendre|vendeur|motive/.test(t)) { f.signal = true; compris.push("avec une raison de vendre"); }
  if (/\bsci\b/.test(t)) { f.proprietaires.push("sci"); compris.push("propriétaire en SCI"); }
  if (/particulier/.test(t)) { f.proprietaires.push("particulier"); compris.push("propriétaire particulier"); }
  if (/independant/.test(t)) { f.chaine = "independant"; compris.push("indépendants"); }
  else if (/chaine|franchise/.test(t)) { f.chaine = "chaine"; compris.push("chaînes"); }
  if (/pas (encore )?dans une liste|jamais|nouveau/.test(t)) { f.liste = "libres"; compris.push("pas encore dans une liste"); }
  // Une rue : « rue de la République », « avenue Charles de Gaulle », « place Carnot ».
  const voie = t.match(/\b(rue|avenue|av|boulevard|bd|place|cours|quai|allee|chemin|route|impasse|promenade|esplanade)\s+((?:d[eu']?\s*|des\s+|la\s+|l'|le\s+|les\s+)?[a-z0-9'-]+(?:\s+(?!proprietaire|exploitant|independant|avec|sans|dans|pas|qui|et\b)[a-z0-9'-]+){0,3})/);
  if (voie) { f.rue = `${voie[1] === 'av' ? 'avenue' : voie[1] === 'bd' ? 'boulevard' : voie[1]} ${voie[2]}`.replace(/\s+/g, ' ').trim(); compris.push(f.rue); }
  const ans = t.match(/(?:installe|depuis|ouvert)\D{0,12}(\d{1,2})\s*ans/);
  if (ans) { const n = Number(ans[1]); const choix = [30, 20, 10, 5].find((x) => n >= x) || 5; f.anciennete = String(choix); compris.push(`installé depuis ${choix} ans et plus`); }
  // Les activités : un mot de la phrase qui commence comme un mot de l'activité.
  const mots = t.split(/[^a-z0-9]+/).filter((m) => m.length >= 4);
  for (const a of activites) {
    const motsA = sansAccents(a.v).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !MOTS_GENERIQUES.has(m));
    if (motsA.some((ma) => mots.some((m) => m.slice(0, 5) === ma.slice(0, 5)))) f.activites.push(a.v);
  }
  if (f.activites.length) compris.unshift(f.activites.length > 3 ? `${f.activites.length} activités` : f.activites.join(", ").toLowerCase());
  return { filtres: f, compris };
}

