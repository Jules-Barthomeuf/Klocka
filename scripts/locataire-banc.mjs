// Le banc de l'outil Locataire (12 nov. 2026, Jules : « des petits commerçants au hasard, pas les grandes enseignes »).
//   npm run locataire:banc                 30 commerces de Lyon tirés au hasard dans le registre local
//   npm run locataire:banc -- 50 33063     50 commerces de Bordeaux (code commune, ou préfixe : 6938 = Lyon entier)
// Chaque commerce passe par l'outil Locataire comme depuis un dossier (nom et adresse seulement). Le banc dit si la
// bonne société est trouvée, ce que disent les procédures, et combien publient des comptes utilisables. Lecture des
// sources publiques ; rien n'est écrit hors des lancements de l'outil (gardés comme lancements libres, sans dossier).
import 'dotenv/config';

const n = Number(process.argv[2]) || 30;
const commune = process.argv[3] || '6938';
const { default: db, Records } = await import('../server/db.js');
const { lancerOutil, ENTITE } = await import('../server/outils/lancements.js');
const { marqueDuNom } = await import('../server/outils/rue.js');
const { indexDesMarques } = await import('../server/enseignes-autour.js');

const index = indexDesMarques();
const adresse = (r) => `${r.numero}${r.indice ? ` ${r.indice}` : ''} ${r.type_voie || ''} ${r.voie}, ${r.code_postal} ${r.libelle_commune}`.replace(/\s+/g, ' ');
// Commerces de proximité : alimentation, restauration, coiffure et beauté, commerce de détail ; les enseignes nationales écartées.
const tirage = db.prepare(`SELECT * FROM entrepot_sirene WHERE commune LIKE ? AND etat = 'A' AND numero IS NOT NULL AND voie IS NOT NULL
  AND (naf LIKE '47%' OR naf LIKE '56%' OR naf LIKE '96.02%' OR naf LIKE '10.71%') AND date_creation <= date('now', '-1 year')
  ORDER BY random() LIMIT ?`).all(`${commune}%`, n * 4)
  .filter((r) => !marqueDuNom(r.enseigne || r.denomination || '', index) && (r.enseigne || r.denomination))
  .slice(0, n);

const lignes = [];
for (const [i, r] of tirage.entries()) {
  // Un bail nomme d'ordinaire la société ; une fois sur deux on donne l'enseigne, comme une fiche d'agence.
  const nom = i % 2 && r.enseigne ? r.enseigne : r.denomination || r.enseigne;
  const t0 = Date.now();
  const { lancement } = lancerOutil('locataire', { adresse: adresse(r), locataire: nom, loyer: 24000 }, {});
  let l;
  for (let k = 0; k < 60; k++) { await new Promise((ok) => setTimeout(ok, 1500)); l = Records.get(ENTITE, lancement.id); if (l.statut !== 'en_cours') break; }
  const pts = Object.fromEntries((l.resultat?.points || []).map((p) => [p.cle, p]));
  const trouve = pts.societe?.detail?.siren || null;
  const c = pts.comptes;
  // Sans comptes utilisables, l'outil ne montre pas de ligne (12 nov. 2026).
  const comptes = !trouve ? 'sans société' : !c ? 'pas de ligne' : /non publié en/.test(c.resultat) ? 'CA confidentiel' : 'CA publié';
  const ligne = { nom, adresse: adresse(r), ei: r.categorie_juridique === '1000', attendu: r.siren, trouve, juste: trouve === r.siren, procedures: pts.procedures?.resultat || '—', comptes, s: Math.round((Date.now() - t0) / 1000) };
  lignes.push(ligne);
  console.log(`${ligne.juste ? 'ok ' : 'NON'} ${String(ligne.s).padStart(2)} s  ${ligne.ei ? 'EI ' : '   '} ${nom.slice(0, 34).padEnd(34)} ${comptes.padEnd(15)} ${ligne.procedures.slice(0, 60)}${ligne.juste ? '' : `  (trouvé ${trouve || 'rien'}, attendu ${r.siren} ; ${pts.societe?.resultat?.slice(0, 80) || ''})`}`);
}

const pct = (k) => `${Math.round((k / lignes.length) * 100)} %`;
const compte = (f) => lignes.filter(f).length;
console.log(`\n${lignes.length} commerces · bonne société ${pct(compte((x) => x.juste))} · dont ${compte((x) => x.ei)} entreprises individuelles`);
for (const k of ['CA publié', 'CA confidentiel', 'pas de ligne', 'sans société']) console.log(`  comptes ${k.padEnd(16)} ${String(compte((x) => x.comptes === k)).padStart(3)}  ${pct(compte((x) => x.comptes === k))}`);
console.log(`  une procédure collective en 5 ans : ${compte((x) => x.trouve && !/^Aucune|^—|non trouvée/.test(x.procedures))}`);
process.exit(0);
