// Le format commun sur les vrais résultats (18 oct. 2026, lot 1) : pour chaque outil, le dernier résultat gardé
// en base passe par son adaptateur et doit en sortir complet. Lecture seule. `npm run socle:format`.
// Les Signaux de vacance n'ont pas de résultat gardé (ils se lisent en direct) : on lit une commune chargée.

const args = new Set(process.argv.slice(2));
if (args.has('--data-b-coupe')) process.env.SOURCES_COUPEES = [process.env.SOURCES_COUPEES, 'data_b'].filter(Boolean).join(',');
const { Records } = await import('../server/db.js');
const { versFormatCommun } = await import('../server/socle/format-commun.js');

const ENTITES = {
  kexpertise: 'ExpertiseKData', kestimation: 'EstimationMurs', kprospective: 'Prospection', kvacance: 'RechercheVacance',
  kfoncier: 'RechercheFoncier', valeur_locative: 'ValeurLocativeRecherche', ktransactions: 'RechercheTransactions', kzoning: 'DossierKData',
};
let ok = 0; const ko = [];
for (const [outil, entite] of Object.entries(ENTITES)) {
  const rec = Records.list(entite).sort((a, b) => String(b.updated_date || b.created_date).localeCompare(String(a.updated_date || a.created_date)))[0];
  if (!rec) { ko.push(`${outil} : aucun résultat gardé`); continue; }
  for (const brut of [rec.resultat, rec].filter(Boolean)) {
    try {
      const r = versFormatCommun(outil, brut, { adresse: rec.adresse || rec.resultat?.adresse || null, date: rec.le || rec.updated_date || null });
      const manque = ['valeur', 'confiance', 'sources', 'detail', 'date'].filter((k) => r[k] === undefined);
      if (manque.length) throw new Error(`champs absents : ${manque.join(', ')}`);
      console.log(`  ${outil.padEnd(16)} ${r.confiance.padEnd(8)} ${String(JSON.stringify(r.valeur)).slice(0, 70)}  sources: ${r.sources.map((s) => s.cle).join(', ') || '—'}`);
      ok++;
      break;
    } catch (e) {
      if (brut === rec) ko.push(`${outil} : ${e.message}`);
    }
  }
}
try {
  const vacance = await import('../server/outils/vacance.js');
  const zone = (vacance.etat()?.zones || []).find((z) => z.etat === 'pret' || z.chargee_le);
  if (!zone) throw new Error('aucune commune chargée');
  const brut = vacance.rechercher({ commune: zone.code_commune, lon: zone.lon, lat: zone.lat, rayon_m: 500 });
  const r = versFormatCommun('signaux_vacance', brut, { adresse: zone.nom });
  console.log(`  signaux_vacance  ${r.confiance.padEnd(8)} ${String(JSON.stringify(r.valeur)).slice(0, 70)}`);
  ok++;
} catch (e) { ko.push(`signaux_vacance : ${e.message}`); }
console.log(`\n${ok} outil(s) sur 9 rendent le format commun sur leurs vrais résultats.`);
for (const k of ko) console.log(`  ÉCART  ${k}`);
process.exit(0);
