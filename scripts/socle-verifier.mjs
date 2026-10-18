// Le critère de fin du lot 1 (18 oct. 2026) : toute adresse d'un dossier des Alpes-Maritimes se résout en un
// identifiant de local. Lancer sur Render : `npm run socle:verifier` (ajouter `-- --data-b-coupe` pour le
// faire Data-B coupé). Écrit seulement le cache des locaux (LocalKlocka) ; rien d'autre ne change.

const args = new Set(process.argv.slice(2));
if (args.has('--data-b-coupe')) process.env.SOURCES_COUPEES = [process.env.SOURCES_COUPEES, 'data_b'].filter(Boolean).join(',');

const { Records } = await import('../server/db.js');
const { adresseDuLot, departementDe } = await import('../server/loyers-klocka.js');
const { resoudreLocal } = await import('../server/socle/local.js');

const deals = Records.list('Deal').filter((d) => !d.test);
const cibles = [];
for (const d of deals) {
  (d.lots || []).forEach((entree) => {
    const a = adresseDuLot(entree);
    const dep = departementDe(a.code_postal) || (a.code_insee ? a.code_insee.slice(0, 2) : null);
    if (dep === '06' && a.ligne) cibles.push({ deal: d.nom || d.deal_id, ligne: a.ligne });
  });
}

let resolus = 0;
const echecs = [];
const incomplets = [];
for (const c of cibles) {
  const r = await resoudreLocal(c.ligne);
  if (!r.ok || !r.local?.id_local) { echecs.push({ ...c, erreur: r.error || 'pas d\'identifiant' }); continue; }
  resolus++;
  if (r.local.manques?.length) incomplets.push({ ...c, id: r.local.id_local, manques: r.local.manques.map((m) => `${m.cle} (${m.raison})`).join(', ') });
}

console.log(`Dossiers des Alpes-Maritimes : ${cibles.length} adresse(s) ; ${resolus} résolue(s) en identifiant de local${args.has('--data-b-coupe') ? ', Data-B coupé' : ''}.`);
for (const e of echecs) console.log(`  ÉCHEC  ${e.deal} — ${e.ligne} : ${e.erreur}`);
for (const i of incomplets) console.log(`  incomplet  ${i.deal} — ${i.id} : manque ${i.manques}`);
process.exit(echecs.length ? 1 : 0);
