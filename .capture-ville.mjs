import 'dotenv/config';
const S = process.argv[2];
const { ouvrirBacASable } = await import('./server/testeur/bac-a-sable.js');
const { lancerNavigateur } = await import('./server/marche/navigateur.js');
const bac = await ouvrirBacASable({ user: { email: 'jules.b@klocka.immo', role: 'admin' } });
const nav = await lancerNavigateur('capture');
try {
  const ctx = await nav.newContext({ locale: 'fr-FR', viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'klocka_session', value: bac.jeton, url: bac.base }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('klocka.installer-app', JSON.stringify({ etat: 'fini', le: Date.now() })); localStorage.setItem('klocka.presentations.largeur-chat', '300'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(bac.base + '/Presentations', { waitUntil: 'networkidle' });
  await p.getByText('Chocolaterie', { exact: false }).first().click();
  await p.waitForSelector('.pb-scene', { timeout: 20000 });
  await p.waitForTimeout(1000);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(1800);
  await p.locator('.pb-scene').screenshot({ path: `${S}/ville-edition.png` });
  await p.getByRole('button', { name: 'Lecture' }).click();
  await p.waitForTimeout(2500);
  await p.locator('.pb-scene').screenshot({ path: `${S}/ville-lecture.png` });
  await ctx.close();
} finally { await nav.close().catch(() => {}); await bac.fermer(); }
console.log('ok');
