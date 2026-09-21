// L'étude d'implantation, en interne. Ce qu'un service payant rendait en une
// étude, avec les mêmes blocs et la même forme, à partir de sources
// ouvertes : Base Adresse Nationale, Sirene, OpenStreetMap, IGN, INSEE
// (Filosofi et recensement à l'IRIS). Trente jours de cache par adresse et
// activité, sous la même clé que les anciennes études : les dossiers qui
// cherchaient une étude en base la retrouvent.
//
// Ce qu'on ne sait pas, on le dit : le flux est une estimation (`estime`), les
// évolutions à trois, cinq et dix ans attendent un second millésime du
// recensement (null), les propriétaires sont ceux des ménages Filosofi.

import { Records } from '../db.js';
import { resoudreAdresse } from '../adresse-ban.js';
import { etablissementsDeLaCommune, sireneConfigure, MESSAGE_SANS_CLE } from '../insee-sirene.js';
import { releveDe, rangDe } from '../alx/emplacement.js';
import { cleRue } from '../alx/commerces.js';
import { zonesDeChalandise } from './zones.js';
import { PREFIXES, familleDe, FAMILLES_COMMERCE } from './familles.js';
import { etablissementsDeLaRue, lireRue, lireTroncon } from './rue.js';
import { fluxPieton, fluxVoiture } from './flux.js';
import { contient } from './geo.js';

export const ENTITE = 'EtudeImplantation';
export const SOURCE = 'Klocka · sources ouvertes';
export const SOURCES = ['Base Adresse Nationale', 'Sirene', 'OpenStreetMap', 'IGN', 'INSEE Filosofi', 'INSEE recensement'];
const CACHE_JOURS = 30;
// Le niveau de vie médian en France, INSEE, Filosofi 2021 : la référence de « FR : +13 % ».
export const NIVEAU_DE_VIE_FRANCE = 23160;

/** La clé d'adresse, la même que celle des anciennes études (voir projet-secteur.js). */
export const cleAdresse = (a) => `${a.numero} ${a.rue} ${a.code_postal} ${a.ville}`.toLowerCase().replace(/\s+/g, ' ').trim();
const cleCache = (a, activite) => `${cleAdresse(a)}|${String(activite || '').toLowerCase().trim()}`;

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * Assemble l'étude à partir des lectures. Pure : testée sans réseau.
 * @param {object} o
 * @param {object} o.adresse la réponse de resoudreAdresse
 * @param {Array} o.etablissements ceux de la commune, avec leurs familles
 * @param {{rues:Array}|null} o.releve les rues OpenStreetMap de la commune
 * @param {Array} o.zones les trois zones lues
 * @param {Array} o.generateurs ceux de kexpertise, à trois cents mètres
 */
export function assembler({ adresse, etablissements, releve, zones, generateurs = [], aujourdhui = new Date() }) {
  const point = { lat: adresse.lat, lon: adresse.lon };
  const cle = cleRue(adresse.rue);
  const osm = (releve?.rues || []).find((r) => cleRue(r.nom || r.cle) === cle) || null;
  const rang = releve?.rues ? rangDe(releve.rues, cle) : null;
  const deLaRue = etablissementsDeLaRue(etablissements, adresse.rue);
  const rue = lireRue(deLaRue, adresse.rue, osm, aujourdhui);
  const { troncon, commerces_troncon } = lireTroncon(deLaRue, point);

  const [z5, , z15] = zones;
  const dans = (g) => (etablissements || []).filter((e) => e.etat === 'A' && e.lat != null && g && contient(g, e.lon, e.lat));
  const actifs5 = dans(z5?.geometrie);
  const commerces5 = actifs5.filter((e) => FAMILLES_COMMERCE.has(e.famille || familleDe(e.activite)));

  const flux_pieton = fluxPieton({
    commerces_troncon: commerces_troncon.total,
    // Sans registre, les vitrines d'OpenStreetMap disent la rue.
    commerces_rue: etablissements?.length ? rue.commerces : osm?.vitrines || 0,
    longueur_rue_m: rue.longueur_m,
    type_voie: rue.type_voie,
    habitants_5min: z5?.insee?.population?.habitants ?? z5?.recensement?.population ?? 0,
    entreprises_5min: actifs5.length,
    generateurs,
  });
  const flux_voiture = fluxVoiture(rue.type_voie);

  const revenu5 = z5?.insee?.revenus?.niveau_de_vie_moyen ?? null;
  const r15 = z15?.recensement || null;
  // Les zones s'emboîtent : la troisième contient les deux autres.
  const habitants = z15?.insee?.population?.habitants ?? z15?.recensement?.population ?? null;
  return {
    en_tete: {
      revenu_annuel_quartier: revenu5,
      revenu_vs_france: revenu5 ? Math.round((revenu5 / NIVEAU_DE_VIE_FRANCE - 1) * 1000) / 10 : null,
      reference_france: { valeur: NIVEAU_DE_VIE_FRANCE, nature: 'niveau de vie médian, INSEE Filosofi 2021' },
      csp_majoritaire: z5?.recensement?.csp_majoritaire ?? null,
    },
    flux_pieton,
    flux_voiture,
    rue: { ...rue, rang, liste: undefined },
    troncon,
    commerces_troncon,
    demographie: { habitants, evolution: null },
    revenu: {
      revenu_moyen_annuel: z15?.insee?.revenus?.niveau_de_vie_moyen ?? null,
      revenu_evolution: null,
      taux_chomage: r15?.taux_chomage ?? null,
      csp_plus: r15?.csp_plus ?? null,
      csp_plus_part: r15 ? pct(r15.csp_plus, r15.population) : null,
      csp_plus_evolution: null,
      retraites: r15?.retraites ?? null,
    },
    zone_primaire: {
      logements: z5?.insee?.menages?.menages ?? null,
      maisons: z5?.insee?.menages?.menages != null && z5.insee.logement?.part_maisons != null ? Math.round((z5.insee.menages.menages * z5.insee.logement.part_maisons) / 100) : null,
      appartements: z5?.insee?.menages?.menages != null && z5.insee.logement?.part_collectif != null ? Math.round((z5.insee.menages.menages * z5.insee.logement.part_collectif) / 100) : null,
      proprietaires: z5?.insee?.menages?.menages != null && z5.insee.menages.part_proprietaires != null ? Math.round((z5.insee.menages.menages * z5.insee.menages.part_proprietaires) / 100) : null,
      commerces: commerces5.length,
      entreprises: actifs5.length,
      lecture: 'Ménages Filosofi pour les logements et les propriétaires ; établissements Sirene des familles de commerce pour les commerces et entreprises.',
    },
    zones: zones.map(({ geometrie, ...z }) => ({ ...z, iris: z.iris?.length ?? 0 })),
    estime: true,
  };
}

// Le registre refuse une adresse trop longue (414) : soixante préfixes ne
// tiennent pas dans une question, quinze oui. Chaque lot a son cache.
const LOT_PREFIXES = 15;
async function etablissementsDesFamilles(codeInsee, { forcer = false } = {}) {
  if (!sireneConfigure()) return { etablissements: [], erreur: MESSAGE_SANS_CLE };
  const etablissements = []; let erreur = null;
  for (let i = 0; i < PREFIXES.length; i += LOT_PREFIXES) {
    const r = await etablissementsDeLaCommune(codeInsee, { prefixes: PREFIXES.slice(i, i + LOT_PREFIXES), anneesFermeture: 4, forcer });
    if (r.ok) etablissements.push(...r.etablissements);
    else erreur = r.error;
  }
  return { etablissements, erreur };
}

/**
 * L'étude d'une adresse, gardée trente jours.
 * @returns {Promise<{ok:true, resultat:object}|{ok:false, error:string}>}
 */
export async function etudeImplantation(texteAdresse, { activite = null, forcer = false, journal = () => {} } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texteAdresse); } catch (e) { return { ok: false, error: e?.message || String(e) }; }
  if (!adresse?.lat) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };
  if (!adresse.rue) return { ok: false, error: `Il faut une rue : « ${adresse.label} » n'en a pas.` };
  const cle = cleCache(adresse, activite);
  if (!forcer) {
    const recent = Records.filter(ENTITE, { cle })
      .filter((r) => Date.now() - Date.parse(r.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  journal('Sirene : les établissements de la commune…');
  const manques = [];
  const sirene = await etablissementsDesFamilles(adresse.code_insee, { forcer });
  const etablissements = sirene.etablissements.map((e) => ({ ...e, famille: familleDe(e.activite) }));
  if (sirene.erreur) manques.push(`Sirene : ${sirene.erreur}`);

  journal('OpenStreetMap : les rues de la commune…');
  const releve = await releveDe({ code_insee: adresse.code_insee, nom: adresse.ville, lat: adresse.lat, lon: adresse.lon }).catch((e) => { manques.push(`OpenStreetMap : ${e.message}`); return null; });

  journal('IGN et INSEE : les zones de chalandise…');
  const { zones, approximation } = await zonesDeChalandise(adresse.lat, adresse.lon, { journal: (m) => manques.push(m) });
  if (approximation) manques.push(`IGN : ${approximation}`);

  journal('OpenStreetMap : les générateurs de flux…');
  const { generateursAutour } = await import('../kexpertise.js');
  const generateurs = await generateursAutour(adresse.lat, adresse.lon).catch((e) => { manques.push(`générateurs : ${e.message}`); return []; });

  const le = new Date().toISOString();
  const resultat = {
    source: SOURCE,
    sources: SOURCES,
    adresse: adresse.label,
    activite: activite || null,
    lien: null,
    le,
    manques,
    ...assembler({ adresse, etablissements, releve, zones, generateurs }),
  };
  Records.create(ENTITE, { cle, adresse: adresse.label, activite: activite || null, resultat, le });
  return { ok: true, resultat };
}
