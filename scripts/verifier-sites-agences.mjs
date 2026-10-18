// Vérifie les sites des agences d'un département avant toute collecte (lot 3, 18 oct. 2026) :
// robots.txt, conditions et mentions légales, logiciel du site. Rien n'est collecté.
// `npm run annonces:verifier -- 06` ; `--refaire` revérifie aussi les sites vus il y a moins de 31 jours.
const dep = process.argv.slice(2).find((a) => /^\d{2}$/.test(a)) || '06';
const refaire = process.argv.includes('--refaire');
const { Records } = await import('../server/db.js');
const { verifierSite, origineDe, sitesVerifies } = await import('../server/annonces/verification.js');

const parOrigine = new Map();
for (const a of Records.list('AgenceProspect')) {
  if (!String(a.code_postal || '').startsWith(dep) || !a.site) continue;
  const o = origineDe(a.site);
  if (!o) continue;
  if (!parOrigine.has(o)) parOrigine.set(o, []);
  parOrigine.get(o).push(a.nom || a.raison_sociale || '?');
}
const deja = new Map(sitesVerifies().map((s) => [s.origine, s]));
const file = [...parOrigine].filter(([o]) => refaire || !deja.has(o) || Date.now() - Date.parse(deja.get(o).verifie_le) > 31 * 86400000);
console.log(`${parOrigine.size} sites d'agences dans le ${dep} ; ${file.length} à vérifier.`);
// Au rythme d'un serveur, pas d'un site (18 oct. 2026) : plus de cent sites d'agences partagent le même
// hébergeur, qui a fermé la porte après une rafale. Une file par adresse IP, une requête à la fois, 4 s entre deux sites.
const dns = await import('node:dns/promises');
const parIp = new Map();
for (const [origine, agences] of file) {
  let ip = 'inconnue';
  try { ip = (await dns.lookup(new URL(origine).hostname)).address; } catch { /* résolution ratée : file à part */ }
  if (!parIp.has(ip)) parIp.set(ip, []);
  parIp.get(ip).push([origine, agences]);
}
let faits = 0;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const travailleur = async (liste) => {
  for (const [origine, agences] of liste) {
    try { await verifierSite(origine, { agences: [...new Set(agences)], pause: 2000 }); } catch (e) { console.log(`  ${origine} : ${e.message}`); }
    if (++faits % 25 === 0) console.log(`  ${faits} vérifiés`);
    await attendre(4000);
  }
};
// Six serveurs à la fois au plus.
const files = [...parIp.values()];
await Promise.all(Array.from({ length: 6 }, async () => { for (;;) { const l = files.shift(); if (!l) return; await travailleur(l); } }));
const tous = sitesVerifies().filter((s) => parOrigine.has(s.origine));
const c = (k) => tous.filter((s) => s.categorie === k).length;
console.log(`FIN autorisés ${c('autorise')} · douteux ${c('douteux')} · interdits ${c('interdit')} · injoignables ${c('injoignable')}`);
process.exit(0);
