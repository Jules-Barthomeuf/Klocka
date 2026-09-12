import { chromium } from 'playwright-core';
const dossier = process.argv[2];
const nav = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'klocka_session', value: 'JETONADMIN', domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
for (const [chemin, nom] of [['/Dashboard','dashboard'],['/Analyse','analyse'],['/Monitoring','monitoring'],['/Ressources','ressources'],['/MesProjets','projets'],['/Vision','vision']]) {
  await page.goto('http://localhost:3999' + chemin, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${dossier}/${nom}.png` });
}
console.log('  6 captures dans ' + dossier.split('/').pop());
await nav.close();
