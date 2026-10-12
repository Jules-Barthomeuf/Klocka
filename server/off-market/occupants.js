// Off-market, mode Simple (11 oct. 2026, Jules : « dans Data-B, une parcelle
// peut avoir zéro propriétaire, mais l'onglet Occupants montre une SCI qui
// loue : c'est elle la propriétaire ; et les occupants donnent tous les
// commerces de la parcelle »). On lit le bâtiment qui porte la vitrine (le
// plus proche, qu'il ait un propriétaire publié ou non), sa fiche, puis ses
// occupants, que Data-B charge à part (company/occupant, pages de 50).

import { postDataB, postDataBCorps, dataBConfigure } from '../data-b.js';
import { lireFiche } from '../alx/foncier.js';

const BATIMENTS = 'https://data-b.com/api/batimentV2';
const FICHE = 'https://data-b.com/company/foncier';
const OCCUPANTS = 'https://data-b.com/company/occupant';

const decoder = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const distanceM = (a, b) => 6371000 * Math.hypot(((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * Math.PI) / 180, ((b.lat - a.lat) * Math.PI) / 180);

/** Pure : les occupants d'une réponse de company/occupant. */
export function lireOccupants(html) {
  const cartes = String(html || '').split(/<div class="foncierCard check_save"/).slice(1);
  return cartes.map((c) => {
    const siret = (c.match(/^\s*entreprise_id="(\d{14})"/) || [])[1] || null;
    const nom = decoder((c.match(/class="company-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
    const siren = (c.match(/siren="(\d{9})"/) || [])[1] || (siret ? siret.slice(0, 9) : null);
    const lignes = Object.fromEntries([...c.matchAll(/<div class="k">([\s\S]*?)<\/div>\s*<div class="v">([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => [decoder(m[1]).toLowerCase(), decoder(m[2])]));
    const gerants = [...c.matchAll(/<div class="person foncierPerson[\s\S]*?class="company_mapping[^"]*"[^>]*>([\s\S]*?)<\/span>([\s\S]*?)<div class="p-meta">([\s\S]*?)<\/div>/g)].map((m) => {
      const age = Number((decoder(m[2]).match(/(\d{2,3})\s*ans/) || [])[1]) || null;
      return { nom: decoder(m[1]), age, tranche_age: age == null ? null : age >= 70 ? '70+' : age >= 50 ? '50-70' : '-50', qualite: decoder(m[3]) || null };
    });
    return { siret, siren, nom: nom || null, adresse: lignes.adresse || null, activite: lignes['activité'] || lignes.activite || null, effectif: lignes.effectif || null, gerants };
  }).filter((o) => o.nom);
}

/** Pure : cet occupant loue-t-il des biens immobiliers (logements compris) ? Il n'est alors pas un commerce. */
export const estBailleur = (o) => /location de terrains|location de logements|autres biens immobiliers|gestion de biens immobiliers|marchands de biens/i.test(String(o?.activite || '')) || /^sci\b|soci[ée]t[ée] civile immobili/i.test(String(o?.nom || ''));
/** Pure : est-il le propriétaire probable des murs ? Une SCI, ou « location de terrains et d'autres biens immobiliers » ; pas une société qui ne loue que des logements. */
export const estBailleurDesMurs = (o) => /location de terrains|autres biens immobiliers/i.test(String(o?.activite || '')) || /^sci\b|soci[ée]t[ée] civile immobili/i.test(String(o?.nom || ''));

// Ce qui fait un commerce de pied d'immeuble, d'après le libellé d'activité de Data-B.
const COMMERCE = /(restauration|restaurant|caf[ée]|d[ée]bit de boissons|bar\b|boulangerie|p[âa]tisserie|boucherie|charcuterie|poissonnerie|traiteur|glacier|commerce de d[ée]tail|vente|magasin|[ée]picerie|supermarch|sup[ée]rette|pharmacie|optique|coiffure|soins de beaut[ée]|esth[ée]tique|parfumerie|bijouterie|horlogerie|fleur|tabac|presse|librairie|v[êe]tement|habillement|chaussure|maroquinerie|agence immobili|agences immobili|banque|interm[ée]diation mon[ée]taire|assurance|agences de voyage|blanchisserie|teinturerie|pressing|cordonnerie|photographie|auto-[ée]cole|enseignement de la conduite)/i;
const PAS_COMMERCE = /(association|club|location de logements|location de terrains|sièges sociaux|si[èe]ges sociaux|administration|syndic|holding|activit[ée]s des soci[ée]t[ée]s holding|enseignement(?! de la conduite)|sant[ée] humaine|m[ée]decin|infirmier|avocat|expert-comptable|architecte|programmation|conseil)/i;

/** Pure : cet occupant est-il un commerce à prospecter ? */
export const estCommerceOccupant = (o) => !estBailleur(o) && COMMERCE.test(String(o?.activite || '')) && !PAS_COMMERCE.test(String(o?.activite || ''));

/**
 * Le bâtiment qui porte un point, sa fiche et ses occupants. Rend
 * { parcelle, batiment_id, proprietaires, occupants, surface_batiment } ou null.
 * `post` et `postCorps` se remplacent dans les tests.
 */
export async function lireParcelleEtOccupants(point, { post = postDataB, postCorps = postDataBCorps, rayon = 25 } = {}) {
  if (!dataBConfigure() && post === postDataB) return null;
  if (!Number.isFinite(point?.lat)) return null;
  const brut = await post(BATIMENTS, { lat: point.lat, lng: point.lon, area: rayon, has_owner: '1', has_occupant: '1' });
  let batiments = [];
  try { batiments = JSON.parse(brut || '[]'); } catch { return null; }
  // Le plus proche, propriétaire publié ou non : c'est celui de la vitrine.
  const b = (Array.isArray(batiments) ? batiments : []).filter((x) => x?.id && x.parcelle_id)
    .map((x) => ({ ...x, d: distanceM(point, { lat: Number(x.lat), lon: Number(x.lng) }) })).sort((x, y) => x.d - y.d)[0];
  if (!b) return null;
  const html = await post(FICHE, { load: 'ajax', batiment_id: b.id, id_ODbL: b.id_ODbL || '', parcelle_id: b.parcelle_id, onglet: '' });
  const fiche = html ? lireFiche(html) : { proprietaires: [] };
  let ids = [];
  try { ids = JSON.parse(decoder((String(html || '').match(/data-id-odbls="([^"]*)"/) || [])[1] || '[]').replace(/&quot;/g, '"')); } catch { ids = []; }
  let occupants = [];
  if (ids.length) {
    const corps = [...ids.map((i) => `id_ODbLs%5B%5D=${encodeURIComponent(i)}`), 'page=0', 'limit=50'].join('&');
    occupants = lireOccupants(await postCorps(OCCUPANTS, corps));
  }
  return { parcelle: b.parcelle_id, batiment_id: b.id, distance_m: Math.round(b.d), lat: Number(b.lat), lon: Number(b.lng), surface_batiment: fiche.surface_batiment || null, proprietaires: (fiche.proprietaires || []).filter((p) => p.proprietaire), occupants, source: 'Data-B · Foncier et occupants', lu_le: new Date().toISOString() };
}
