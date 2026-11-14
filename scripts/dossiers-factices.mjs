// Des dossiers factices pour tester la partie Marché (13 nov. 2026, Jules : « importe des dossiers factices en local et
// on va tester la partie Marché »). Dix fiches inventées sur de vraies adresses, variées : grandes villes et petites,
// enseignes nationales et indépendants, un bail échu, un local vide, un loyer donné au mois. Chacune passe par la vraie
// pré-analyse (analyserFiche, comme une fiche collée dans l'app), qui lance seule les cinq outils du Marché ; le script
// les attend, et chaque résultat passe par le contrôle du banc du Marché (server/outils/controle.js).
//
//   npm run dossiers:factices            les dix, dans la base locale (jamais en ligne)
//   npm run dossiers:factices -- 3       les trois premiers
//
// Les dossiers portent « Essai Marché » dans leur nom et `essai_marche: true` : on les retrouve, on les garde.
// Coût : une pré-analyse et une note d'IA par outil, quelques centimes par dossier.
import 'dotenv/config';

const FICHES = [
  ['Bordeaux', `FICHE COMMERCIALE - MURS COMMERCIAUX OCCUPÉS (dossier factice, essai du Marché)
Adresse : 45 rue Sainte-Catherine, 33000 Bordeaux
Locataire en place : Jeff de Bruges (chocolaterie), enseigne nationale
Surface : 65 m² en rez-de-chaussée, vitrine sur rue piétonne
Bail commercial 3-6-9 signé le 1er juin 2019, échéance le 31 mai 2028
Loyer annuel : 42 000 € HT HC
Taxe foncière : 3 100 € par an, refacturée au locataire
Prix de vente : 780 000 € FAI`],
  ['Nantes', `FICHE - MURS DE BOUTIQUE LOUÉS (dossier factice, essai du Marché)
Adresse : 12 rue Crébillon, 44000 Nantes
Locataire : Maison Lune, prêt-à-porter féminin indépendant, SARL créée en 2016
Surface : 80 m² dont 60 m² de vente
Bail commercial du 1er mars 2021, 9 ans
Loyer : 3 000 € HT HC par mois
Prix : 600 000 € honoraires inclus`],
  ['Toulouse', `MURS COMMERCIAUX - CENTRE-VILLE (dossier factice, essai du Marché)
Adresse : 30 rue d'Alsace-Lorraine, 31000 Toulouse
Locataire en place : Rituals (cosmétiques), enseigne internationale
Surface : 90 m²
Bail commercial 3-6-9 du 15 septembre 2020 au 14 septembre 2029
Loyer annuel : 60 000 € HT HC
Prix de vente : 1 100 000 € FAI`],
  ['Lille', `FICHE COMMERCIALE (dossier factice, essai du Marché)
Adresse : 20 rue Esquermoise, 59800 Lille
Locataire : Paul, boulangerie-pâtisserie, enseigne nationale
Surface : 120 m² (rez-de-chaussée et réserve en sous-sol)
Bail 3-6-9 signé le 1er janvier 2018, échéance le 31 décembre 2026
Loyer actuel : 54 000 € HT HC par an
Prix : 950 000 € FAI`],
  ['Marseille', `MURS LOUÉS - OPTIQUE (dossier factice, essai du Marché)
Adresse : 15 rue Paradis, 13001 Marseille
Locataire : Optic 2000 (franchisé), en place depuis 2012
Surface : 70 m²
Bail renouvelé le 1er avril 2021 pour 9 ans
Loyer : 28 000 € HT HC annuel
Prix demandé : 450 000 € FAI`],
  ['Grenoble', `LOCAL COMMERCIAL LOUÉ (dossier factice, essai du Marché)
Adresse : 8 rue Félix Poulat, 38000 Grenoble
Locataire : Istanbul Grill, restauration rapide indépendante, SAS créée en 2023
Surface : 50 m²
Bail commercial du 1er février 2023, 3-6-9
Loyer : 1 500 € HT HC par mois
Prix : 260 000 € FAI`],
  ['Rennes', `FICHE COMMERCIALE (dossier factice, essai du Marché)
Adresse : 5 rue Le Bastard, 35000 Rennes
Locataire en place : Yves Rocher (cosmétiques), enseigne nationale
Surface : 75 m²
Bail 3-6-9 du 1er octobre 2022 au 30 septembre 2031
Loyer annuel : 39 000 € HT HC
Prix de vente : 690 000 € FAI`],
  ['Montbrison', `MURS DE BOULANGERIE (dossier factice, essai du Marché)
Adresse : 10 rue Tupinerie, 42600 Montbrison
Locataire : Au Pain Doré, boulangerie artisanale, en place depuis 2008
Surface : 80 m² avec fournil
Bail commercial arrivé à échéance le 30 juin 2023, en tacite prolongation
Loyer : 1 200 € HT HC par mois
Prix : 210 000 € FAI`],
  ['Saint-Étienne', `LOCAL COMMERCIAL LIBRE (dossier factice, essai du Marché)
Adresse : 12 rue Michel Rondet, 42000 Saint-Étienne
Local vide, ancienne boutique de prêt-à-porter fermée en 2024
Surface : 110 m² en rez-de-chaussée, vitrine de 8 m
Prix de vente : 240 000 € FAI
Loyer de marché estimé par l'agent : 18 000 € HT HC par an`],
  ['Paris', `MURS COMMERCIAUX - AGENCE BANCAIRE (dossier factice, essai du Marché)
Adresse : 48 rue de Rivoli, 75004 Paris
Locataire en place : LCL (agence bancaire)
Surface : 150 m²
Bail 3-6-9 du 1er juillet 2017, échéance le 30 juin 2026
Loyer annuel : 180 000 € HT HC
Prix de vente : 3 600 000 € FAI`],
];

const n = Number(process.argv[2]) || FICHES.length;
const { Records } = await import('../server/db.js');
const { analyserFiche } = await import('../server/deal/index.js');
const { lancerOutils, entreesDuLot, ENTITE } = await import('../server/outils/lancements.js');
const { controlerLancement } = await import('../server/outils/controle.js');
const user = { email: 'essai-marche@klocka.local', role: 'admin' };

const attendre = async (ids, max = 600) => {
  for (let k = 0; k < max; k += 1) {
    await new Promise((ok) => setTimeout(ok, 1000));
    const ls = ids.map((id) => Records.get(ENTITE, id));
    if (ls.every((l) => l.statut !== 'en_cours')) return ls;
  }
  return ids.map((id) => Records.get(ENTITE, id));
};

let defauts = 0; let echecs = 0; let lancements = 0;
for (const [ville, texte] of FICHES.slice(0, n)) {
  const t0 = Date.now();
  let dossier;
  try {
    dossier = await analyserFiche({ texte, filename: `dossier-factice-${ville.toLowerCase()}.txt` }, { user });
  } catch (e) { console.log(`✗ ${ville} : pré-analyse impossible : ${e?.message || e}`); continue; }
  const brut = Records.findBy('Deal', 'deal_id', dossier.deal_id);
  const locataire = brut.lots?.[0]?.lot?.locataire_nom?.valeur;
  Records.update('Deal', brut.id, { nom: `Essai Marché · ${ville}${locataire ? ` · ${locataire}` : ''}`, essai_marche: true });
  const frais = Records.findBy('Deal', 'deal_id', dossier.deal_id);
  const entrees = await entreesDuLot(frais, 0);
  console.log(`\n${ville} · ${entrees.adresse || 'sans adresse'}${entrees.locataire ? ` · ${entrees.locataire}` : ''} · loyer ${entrees.loyer ?? '∅'} · prix ${entrees.prix ?? '∅'} · surface ${entrees.surface ?? '∅'} (pré-analyse ${Math.round((Date.now() - t0) / 1000)} s)`);
  // Les cinq outils partent seuls à la création du dossier (analyserFiche) : on attend ceux-là, sans en relancer.
  let ids = [];
  for (let k = 0; k < 20 && !ids.length; k += 1) {
    ids = Records.filter(ENTITE, { deal_id: dossier.deal_id }).map((l) => l.id);
    if (!ids.length) await new Promise((ok) => setTimeout(ok, 500));
  }
  if (!ids.length) ids = lancerOutils(entrees, { dealId: dossier.deal_id, index: 0, user }).map((l) => l.id);
  const ls = await attendre(ids);
  for (const l of ls) {
    const d = controlerLancement(l);
    lancements += 1; defauts += d.length; if (l.statut !== 'fini') echecs += 1;
    const s = l.partage_de ? 0 : Math.round((Date.parse(l.fini_le || new Date().toISOString()) - Date.parse(l.lance_le)) / 1000);
    console.log(`  ${d.length ? 'KO' : 'ok'} ${String(s).padStart(3)} s ${l.outil.padEnd(12)} ${(l.resultat?.statut || l.statut).padEnd(7)} ${l.resultat?.conclusion ? String(l.resultat.conclusion).slice(0, 150) : l.erreur || ''}`);
    for (const x of d) console.log(`        - ${x}`);
  }
}
console.log(`\n${Math.min(n, FICHES.length)} dossiers factices · ${lancements} lancements · ${echecs} échecs · ${defauts} défauts`);
console.log('Dans l\'app locale : Dossiers, nom « Essai Marché · … », onglet Marché.');
process.exit(0);
