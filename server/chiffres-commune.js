// Les chiffres sourcés d'une commune, lus en même temps : population (API Géo),
// revenu médian par UC et chômage de la zone d'emploi (INSEE), prix médian du
// logement (Le Figaro Immobilier). Servent à l'outil donnees_commune d'AK et à
// la diapositive Ville des présentations. Une source qui ne répond pas laisse
// sa case vide, avec sa raison dans `manquants` ; rien n'est deviné.

import { revenuMedianUC, chomageZoneEmploi } from './insee.js';
import { prixResidentiel } from './figaro.js';

/** La commune d'après son nom : { code, nom, population, surface, departement, region } ou null. */
export async function communeParNom(nom) {
  const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}&fields=nom,code,population,surface,departement,region&boost=population&limit=1`, { signal: AbortSignal.timeout(10000) });
  return r.ok ? (await r.json())[0] || null : null;
}

/** Les trois chiffres sourcés d'une commune déjà identifiée ({ code, nom }). */
export async function chiffresSources(c, { user = null } = {}) {
  const [revenu, chomage, figaro] = await Promise.allSettled([revenuMedianUC(c.code), chomageZoneEmploi(c.code), prixResidentiel(c.nom, { user, commune: { code: c.code, nom: c.nom } })]);
  const sortie = { manquants: [] };
  if (revenu.status === 'fulfilled' && revenu.value) sortie.revenu_median_uc = revenu.value;
  else sortie.manquants.push(`revenu médian par UC : ${revenu.reason?.message || "l'INSEE ne le publie pas pour cette commune (secret statistique)"}`);
  if (chomage.status === 'fulfilled' && chomage.value) sortie.chomage_zone_emploi = chomage.value;
  else sortie.manquants.push(`chômage de la zone d'emploi : ${chomage.reason?.message || 'zone ou taux introuvable'}`);
  const fig = figaro.status === 'fulfilled' && figaro.value?.ok && figaro.value.resultat.code_insee === c.code ? figaro.value.resultat : null;
  if (fig?.commune?.prix?.median) {
    sortie.logement = {
      prix_median_m2: fig.commune.prix.median, prix_bas_m2: fig.commune.prix.bas ?? null, prix_haut_m2: fig.commune.prix.haut ?? null,
      loyer_median_m2: fig.commune.loyer?.median ?? null,
      source: 'Le Figaro Immobilier, prix médian des logements (appartements et maisons) de la commune',
      lien: fig.lien,
    };
  } else sortie.manquants.push(`prix du logement : ${figaro.value?.error || figaro.reason?.message || "Le Figaro n'a pas rendu cette commune"}`);
  return sortie;
}
