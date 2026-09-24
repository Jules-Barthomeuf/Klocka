// Situer un bien dont la fiche ne donne pas l'adresse, mais un repère.
//
// « Le Groupe POINT DE VENTE vous propose, à proximité du métro Rambuteau… » :
// pas de numéro ni de rue, donc la Street View tombait au centre de Paris.
// Le repère (une station, une place, une rue sans numéro) situe pourtant le
// local à cent mètres près : on le lit dans la fiche, on le cherche dans
// OpenStreetMap (Nominatim, sans clé), et les vues s'y posent.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const AGENT = 'Klocka/1.0 (sourcing@klocka.immo)';

// Un nom propre : une majuscule, puis des mots liés (« Saint-Charles »,
// « de la République », « Hôtel de Ville »).
const NOM = "[A-ZÉÈÊÀÂÎÔÛÇ][\\p{L}'’\\-]+(?:\\s+(?:de\\s+la|de\\s+l['’]|du|des|de|d['’]|la|le|les|et|sur|[A-ZÉÈÊÀÂÎÔÛÇ][\\p{L}'’\\-]*)(?:\\s*[A-ZÉÈÊÀÂÎÔÛÇ][\\p{L}'’\\-]*)?){0,4}";
const TYPES_TRANSPORT = "m[ée]tro|station|gare|RER|tram(?:way)?";
const TYPES_LIEU = "place|parvis|square|esplanade|boulevard|bd|avenue|av\\.|rue|quai|cours|passage|all[ée]e|halles?|march[ée]|centre commercial|galerie";
const PROCHE = /(?:proximit[ée]|pr[èe]s|face|deux pas|quelques (?:pas|m[èe]tres|minutes)|angle|c[œo]eur|situ[ée]|donnant sur|en bordure|au pied|[àa] c[ôo]t[ée])[^.;\n]{0,25}$/i;

/**
 * Pure : le repère le plus parlant d'un texte de fiche, ou null. Un repère
 * annoncé par « à proximité de », « face à », « au pied de » passe devant un
 * nom de rue cité en passant.
 */
export function repereDuTexte(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ');
  if (!t) return null;
  const motif = new RegExp(`\\b(${TYPES_TRANSPORT}|${TYPES_LIEU})\\s+(?:de\\s+la\\s+|de\\s+l['’]|du\\s+|des\\s+|de\\s+|d['’])?(${NOM})`, 'giu');
  const trouves = [];
  for (const m of t.matchAll(motif)) {
    const avant = t.slice(Math.max(0, m.index - 60), m.index);
    const type = m[1].toLowerCase();
    // « rue » sans numéro seulement : avec un numéro, c'est une adresse, que
    // l'extraction a déjà.
    if (/^\d/.test(t.slice(Math.max(0, m.index - 6), m.index).trim().split(' ').pop() || '')) continue;
    const nom = m[2].replace(/\s+(?:de\s+la|de\s+l['’]|du|des|de|d['’]|la|le|les|et|sur)$/iu, '').trim();
    if (nom.length < 3) continue;
    const score = (PROCHE.test(avant) ? 10 : 0) + (new RegExp(`^(?:${TYPES_TRANSPORT})$`, 'i').test(type) ? 3 : 0);
    trouves.push({ repere: `${m[0].slice(0, m[0].length - m[2].length)}${nom}`.replace(/\s+/g, ' ').trim(), score, rang: m.index });
  }
  if (!trouves.length) return null;
  trouves.sort((a, b) => b.score - a.score || a.rang - b.rang);
  return trouves[0].repere;
}

/**
 * Pure : le repère sans ses mots de liaison. L'extraction rend parfois la
 * phrase entière (« à proximité du métro Rambuteau ») : on garde le lieu.
 */
export function repereNet(repere) {
  const r = String(repere || '').replace(/\s+/g, ' ').trim();
  if (!r) return null;
  return repereDuTexte(r) || r.replace(/^(?:[àa]\s+)?(?:proximit[ée]|pr[èe]s|face|deux pas|c[ôo]t[ée]|l['’]angle|au pied|au c[œo]eur)\s*(?:imm[ée]diate\s+)?(?:de\s+la|de\s+l['’]|du|des|de|d['’]|[àa]\s+la|[àa]u|[àa])?\s*/iu, '').trim() || null;
}

/** Pure : la ville pour une recherche : « PARIS 4E », « Lyon 3ème » → « Paris », « Lyon ». */
export function villeDeRecherche(ville) {
  return String(ville || '')
    .replace(/\b\d{5}\b/g, '')
    .replace(/\s+(?:\d{1,2}|[IVX]{1,5})\s*(?:e|er|ème|eme|è)?(?:\s+arr(?:ondissement|\.)?)?\s*$/iu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

/**
 * Pure : les requêtes à essayer, dans l'ordre. OpenStreetMap connaît
 * « station Rambuteau » et « Rambuteau », pas « métro Rambuteau ».
 */
export function requetesPour(repere, ville) {
  const r = repereNet(repere) || '';
  if (!r) return [];
  const v = villeDeRecherche(ville);
  const avec = (q) => (v ? `${q}, ${v}` : q);
  const transport = r.match(new RegExp(`^(?:${TYPES_TRANSPORT})\\s+(.+)$`, 'iu'));
  const liste = transport ? [avec(`station ${transport[1]}`), avec(transport[1])] : [avec(r)];
  return [...new Set(liste)];
}

/** Le repère dans OpenStreetMap : { lat, lon, libelle } ou null. */
export async function localiserRepere(repere, ville) {
  for (const q of requetesPour(repere, ville)) {
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=fr&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { 'User-Agent': AGENT, 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const f = (await r.json())[0];
      if (f) return { lat: Number(f.lat), lon: Number(f.lon), libelle: f.display_name?.split(',').slice(0, 2).join(',') || q };
    } catch { /* Nominatim injoignable : la requête suivante, puis la commune */ }
  }
  return null;
}
