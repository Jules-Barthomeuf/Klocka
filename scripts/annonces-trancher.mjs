// Applique les décisions de Jules sur les sites « douteux » déjà vérifiés, sans relire aucun site (18 oct. 2026).
// `npm run annonces:trancher` : met à jour SiteAgence et réécrit docs/plans/lot3-sites-agences-06.csv.
import fs from 'node:fs';
const { Records } = await import('../server/db.js');
const { trancherDouteux } = await import('../server/annonces/verification.js');

const sites = Records.list('SiteAgence');
let changes = 0;
for (const x of sites) {
  // Un site lu douteux (ou repris du premier passage) garde sa phrase : on la tranche.
  const luDouteux = x.categorie === 'douteux' || x.lu_douteux;
  if (!luDouteux || !x.phrase) continue;
  const d = trancherDouteux(x.phrase);
  const maj = d
    ? { categorie: d.categorie, motif: `douteux tranché : ${d.regle}`, lu_douteux: true, accord_a_demander: d.accord_a_demander, faits_seulement: !!d.faits_seulement, tranche_le: new Date().toISOString() }
    : { categorie: 'douteux', motif: 'la phrase nomme les données sans parler de leur exploitation : à trancher', lu_douteux: true };
  Records.update('SiteAgence', x.id, maj); changes++;
}
// Les sites bloqués au second passage reprennent le verdict du premier, tranché de la même façon.
const final = (x) => {
  if (x.categorie !== 'injoignable') return x;
  const avant = [...(x.historique || [])].reverse().find((h) => h.categorie && h.categorie !== 'injoignable');
  if (!avant) return x;
  if (avant.categorie === 'douteux' && x.phrase) { const d = trancherDouteux(x.phrase); if (d) return { ...x, categorie: d.categorie, accord_a_demander: d.accord_a_demander, note: 'verdict du 1er passage, serveur bloqué au 2e' }; }
  return { ...x, categorie: avant.categorie, note: 'verdict du 1er passage, serveur bloqué au 2e' };
};
const tous = Records.list('SiteAgence').filter((x) => (x.agences || []).length).map(final);
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;
const lignes = tous.map((x) => [x.agences.join(' / '), x.origine, x.categorie, x.accord_a_demander ? 'oui' : '', x.faits_seulement ? 'oui' : '', x.logiciel, x.motif, x.phrase || '', x.pages_legales?.[0]?.page || '', String(x.verifie_le).slice(0, 10), x.note || ''].map(esc).join(';')).sort();
fs.writeFileSync(new URL('../docs/plans/lot3-sites-agences-06.csv', import.meta.url), ['agences;site;categorie;accord a demander;faits seulement;logiciel;motif;phrase lue;page lue;verifie le;note', ...lignes].join('\n') + '\n');
const n = {}; for (const x of tous) n[x.categorie] = (n[x.categorie] || 0) + 1;
console.log(`${changes} site(s) tranché(s). Totaux : ${JSON.stringify(n)} ; accord à demander : ${tous.filter((x) => x.accord_a_demander).length}`);
for (const x of tous.filter((y) => y.categorie === 'douteux')) console.log(`DOUTEUX ${x.origine} | ${x.phrase}`);
process.exit(0);
