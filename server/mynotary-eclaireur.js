// L'éclaireur MyNotary : UNE passe de reconnaissance sur app.mynotary.fr pour
// poser les repères d'écran du parcours (server/mynotary-agent.js). Il se
// connecte, inventorie les boutons visibles, clique « Nouveau dossier » et
// s'arrête là où il ne reconnaît plus l'écran. Il n'ouvre JAMAIS un dossier ou
// un contrat existant : le gardien de l'agent borde chaque requête, et une URL
// qui porte un identifiant étranger arrête tout.
//
//   node server/mynotary-eclaireur.js            # étape A : connexion + état des lieux
//   node server/mynotary-eclaireur.js dossier    # étape B : « Nouveau dossier », inventaire du choix
//
// Captures et inventaires dans server/data/mynotary-eclairage/.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Lancé seul (hors serveur), le script charge le .env lui-même — AVANT
// d'importer l'agent, qui lit ses identifiants à l'import.
try { process.loadEnvFile(path.join(RACINE, '.env')); } catch { /* pas de .env : le contrôle suit */ }
const { requeteAutorisee } = await import('./mynotary-agent.js');
const { poserChemin } = await import('./chromium.js');
const SORTIE = path.join(RACINE, 'server', 'data', 'mynotary-eclairage');
fs.mkdirSync(SORTIE, { recursive: true });

const EMAIL = (process.env.MYNOTARY_EMAIL || '').trim();
const MDP = (process.env.MYNOTARY_MOT_DE_PASSE || '').trim();
if (!EMAIL || !MDP) {
  console.error('MYNOTARY_EMAIL et MYNOTARY_MOT_DE_PASSE manquent dans le .env.');
  process.exit(1);
}

poserChemin();
const { chromium } = await import('playwright-core');
const CHROMIUM = (process.env.CHROMIUM_PATH || '').trim() || undefined;
const etape = process.argv[2] || 'connexion';

const navigateur = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-first-run'] });
// Une connexion neuve à chaque passage : MyNotary expire les sessions, et
// une session gardée d'un passage à l'autre finissait sur « Vous avez été
// déconnecté(e) », une fenêtre qui recouvre tout l'écran.
try { fs.rmSync(path.join(SORTIE, 'session.json'), { force: true }); } catch { /* rien à effacer */ }
const contexte = await navigateur.newContext({ locale: 'fr-FR', viewport: { width: 1440, height: 900 } });
const page = await contexte.newPage();

// Le gardien, dès l'éclairage : une URL qui porte un identifiant étranger
// coupe la requête. Comme rien n'a été créé, TOUT identifiant est étranger.
const FICHIER_DOSSIER = path.join(SORTIE, 'dossier-test.txt');
const dossierTest = fs.existsSync(FICHIER_DOSSIER) ? fs.readFileSync(FICHIER_DOSSIER, 'utf8').trim() : null;
const FICHIER_CONTRAT = path.join(SORTIE, 'contrat-test.txt');
const contratTest = fs.existsSync(FICHIER_CONTRAT) ? fs.readFileSync(FICHIER_CONTRAT, 'utf8').trim() : null;
const etat = { ids: new Set([dossierTest, contratTest].filter(Boolean)) };
const alertes = [];
const journal = fs.createWriteStream(path.join(SORTIE, 'requetes.log'), { flags: 'a' });
await contexte.route('**/*', (route) => {
  const req = { url: route.request().url(), methode: route.request().method() };
  // Mode éclairage : lecture libre, écriture sur l'existant interdite, et
  // chaque requête notée — c'est ce journal qui fera la liste blanche.
  const r = requeteAutorisee(req, etat, { mode: 'eclairage' });
  journal.write(`${new Date().toISOString()} ${r.ok ? 'ok   ' : 'COUPE'} ${req.methode} ${req.url}\n`);
  if (r.ok) return route.continue();
  alertes.push(`${req.methode} ${req.url} — ${r.raison}`);
  return route.abort();
});

const photo = (nom) => page.screenshot({ path: path.join(SORTIE, `${nom}.png`) }).catch(() => {});
/** MyNotary a coupé la session : on le dit, et on s'arrête net. */
const verifierSession = async (ou) => {
  const coupe = await page.getByText(/Vous avez été déconnecté/i).first().isVisible().catch(() => false);
  if (coupe) {
    await photo(`z-deconnecte-${ou}`);
    throw new Error(`MyNotary a fermé la session (${ou}) : relancer la commande, la connexion se refera.`);
  }
};
// L'inventaire d'un écran : boutons, et champs de saisie avec leur valeur par
// défaut. Quand une fenêtre (dialog) est ouverte, on ne lit qu'elle : pas
// besoin de recopier la liste des dossiers existants derrière.
const inventaire = () => page.evaluate(() => {
  const racine = document.querySelector('[role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]') || document;
  const boutons = [];
  for (const el of racine.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], input[type="submit"]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 90);
    if (t) boutons.push(t);
  }
  const champs = [];
  for (const el of racine.querySelectorAll('input:not([type=hidden]), textarea, select')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    champs.push({ balise: el.tagName.toLowerCase(), type: el.type || null, nom: el.name || el.id || null, placeholder: el.placeholder || null, valeur: String(el.value || '').slice(0, 80), libelle: (el.labels?.[0]?.innerText || el.closest('label')?.innerText || '').trim().slice(0, 80) || null });
  }
  return { dialogue: racine !== document, boutons: [...new Set(boutons)].slice(0, 100), champs: champs.slice(0, 60) };
});
const clicDansDialogue = async (libelles) => {
  for (const l of libelles) {
    const b = page.locator(`[role="dialog"] button:has-text("${l}"), .modal button:has-text("${l}"), [class*="dialog" i] button:has-text("${l}"), [class*="modal" i] button:has-text("${l}"), button:has-text("${l}")`).first();
    if (await b.count()) { await b.click({ timeout: 8000 }); return l; }
  }
  return null;
};

try {
  await page.goto('https://app.mynotary.fr', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);

  const connecte = !(await page.locator('input[type="password"]').count());
  if (!connecte) {
    await page.locator('input[type="email"], input[name*="mail" i], input[placeholder*="mail" i]').first().fill(EMAIL, { timeout: 15000 });
    await page.locator('input[type="password"]').first().fill(MDP, { timeout: 15000 });
    await photo('a1-identifiants');
    await page.locator('button[type="submit"], button:has-text("Se connecter"), button:has-text("Connexion")').first().click({ timeout: 15000 });
    await page.waitForTimeout(7000);
  }
  await photo('a2-apres-connexion');
  console.log('URL :', page.url());
  const corps = (await page.evaluate(() => document.body.innerText)).slice(0, 800);
  if (/code de vérification|authentification à deux|double authentification/i.test(corps)) {
    console.log('MFA détectée : on s’arrête là. Écran :', corps.slice(0, 300));
  } else if (/connexion|login/i.test(page.url()) && (await page.locator('input[type="password"]').count())) {
    console.log('Connexion non aboutie : toujours sur l\u2019écran de connexion. Vérifier l\u2019identifiant ou le mot de passe.');
  } else {
    await contexte.storageState({ path: path.join(SORTIE, 'session.json') });
    console.log('Boutons visibles :', JSON.stringify(await inventaire()));

    if (etape === 'creer') {
      await page.locator('button:has-text("Nouveau dossier"), a:has-text("Nouveau dossier")').first().click({ timeout: 15000 });
      await page.waitForTimeout(2500);
      // Le type de la maison : celui de tous les dossiers Klocka.
      const ligne = page.locator('[role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]').locator('div, li, tr').filter({ hasText: 'Vente - Bien Commercial / Professionnel' }).getByRole('button', { name: 'Créer' }).first();
      if (await ligne.count()) await ligne.click({ timeout: 10000 });
      else await page.locator('button:has-text("Créer")').first().click({ timeout: 10000 });
      await page.waitForTimeout(2500);
      await photo('c1-choix-du-nom');
      console.log('Étape 2 (nom) :', JSON.stringify(await inventaire()));
      // Le nom proposé ne se touche pas (règle de Jules) : on valide tel quel.
      const valide = await clicDansDialogue(['Créer le dossier', 'Créer', 'Valider', 'Suivant', 'Terminer', 'Confirmer']);
      console.log('Bouton de validation cliqué :', valide || 'AUCUN TROUVÉ — on s\u2019arrête là');
      if (valide) {
        await page.waitForTimeout(6000);
        await photo('c2-dossier-cree');
        console.log('DOSSIER CRÉÉ — URL :', page.url());
        const idCree = (page.url().match(/operations?\/(\d+)/) || [])[1] || null;
        if (idCree) { etat.ids.add(idCree); fs.writeFileSync(FICHIER_DOSSIER, idCree); console.log('Dossier de test retenu :', idCree); }
        console.log('Page du dossier :', JSON.stringify(await inventaire()));
        const contrat = await clicDansDialogue(['Nouveau contrat', 'Ajouter un contrat', 'Créer un contrat']);
        console.log('Bouton contrat cliqué :', contrat || 'AUCUN TROUVÉ');
        if (contrat) {
          await page.waitForTimeout(3000);
          await photo('c3-choix-du-contrat');
          console.log('Choix des contrats :', JSON.stringify(await inventaire()));
        }
      }
    }

    if (etape === 'contrat') {
      if (!dossierTest) { console.log('Pas de dossier de test retenu : lancer d\u2019abord « creer ».'); }
      else {
        await page.goto(`https://app.mynotary.fr/operation/${dossierTest}/contrats`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(4000);
        await page.locator('button:has-text("Nouveau contrat"), a:has-text("Nouveau contrat")').first().click({ timeout: 15000 });
        await page.waitForTimeout(2500);
        const champ = page.locator('input[placeholder*="nom du contrat" i]').first();
        await champ.fill('mandat', { timeout: 10000 });
        await page.waitForTimeout(2500);
        await photo('d1-contrats-mandat');
        // La liste filtrée : chaque ligne de résultat, texte complet.
        const lignes = await page.evaluate(() => {
          const racine = document.querySelector('[role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]') || document;
          return [...racine.querySelectorAll('li, tr, [class*="row" i], [class*="item" i], [class*="card" i]')]
            .map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160))
            .filter((t) => /mandat/i.test(t))
            .filter((t, i, l) => l.indexOf(t) === i)
            .slice(0, 30);
        });
        console.log('Contrats « mandat » proposés :', JSON.stringify(lignes, null, 1));
        console.log('Boutons :', JSON.stringify((await inventaire()).boutons));
      }
    }

    if (etape === 'mandat') {
      if (!dossierTest) { console.log('Pas de dossier de test retenu : lancer d\u2019abord « creer ».'); }
      else {
        await page.goto(`https://app.mynotary.fr/operation/${dossierTest}/contrats`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(4000);
        await page.locator('button:has-text("Nouveau contrat"), a:has-text("Nouveau contrat")').first().click({ timeout: 15000 });
        await page.waitForTimeout(2500);
        await page.locator('input[placeholder*="nom du contrat" i]').first().fill('Mandat de vente', { timeout: 10000 });
        await page.waitForTimeout(2500);
        // La ligne « Mandat de vente » exactement (pas l'avenant, pas le co-mandat).
        const bouton = page.locator('[role="dialog"], .modal, [class*="dialog" i], [class*="modal" i]')
          .locator('div').filter({ hasText: /Mandat de vente\s/ }).filter({ hasNotText: /Avenant|Co Mandat|Interactive|Recherche/ })
          .getByRole('button', { name: 'Créer' }).first();
        if (await bouton.count()) await bouton.click({ timeout: 10000 });
        else await page.locator('button:has-text("Créer")').first().click({ timeout: 10000 });
        // L'écran « Créer le contrat » : on ATTEND le champ du nom (l'animation
        // prend quelques secondes), on n'y touche pas, on valide.
        await page.waitForSelector('input#label, input[name="label"]', { timeout: 20000 }).catch(() => {});
        if (await page.locator('input#label, input[name="label"]').count()) {
          await photo('e0-nom-du-contrat');
          // L'état réel des boutons « Créer » : combien, lequel est actif.
          console.log('Boutons Créer :', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button')]
            .filter((b) => /^\s*Créer\s*$/.test(b.innerText))
            .map((b) => ({ disabled: b.disabled, type: b.type, visible: b.getBoundingClientRect().width > 0, classes: String(b.className).slice(0, 60) })))));
          // 1. Clic DOM direct sur le dernier « Créer » visible.
          await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].filter((x) => /^\s*Créer\s*$/.test(x.innerText) && x.getBoundingClientRect().width > 0).pop();
            b?.click();
          });
          await page.waitForTimeout(5000);
          // 2. Toujours là : Entrée dans le champ du nom.
          if (await page.locator('input#label, input[name="label"]').count()) {
            console.log('Le clic DOM n\u2019a pas suffi : essai par la touche Entrée.');
            await page.locator('input#label, input[name="label"]').press('Enter');
          }
          // On attend que l'écran du nom s'en aille, puis que l'éditeur se pose.
          await page.waitForSelector('input#label, input[name="label"]', { state: 'detached', timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(8000);
        }
        await photo('e1-contrat-cree');
        console.log('CONTRAT CRÉÉ — URL :', page.url());
        const idContrat = (page.url().match(/contrats?\/(\d+)/) || [])[1] || null;
        if (idContrat) { etat.ids.add(idContrat); console.log('Contrat de test :', idContrat); }
        // Le panneau de gauche : chaque champ, son libellé, sa valeur, et les
        // titres de sections — c'est lui que l'agent devra remplir.
        const formulaire = await page.evaluate(() => {
          const champs = [];
          for (const el of document.querySelectorAll('input:not([type=hidden]), textarea, select')) {
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            champs.push({
              x: Math.round(r.x), y: Math.round(r.y),
              balise: el.tagName.toLowerCase(), type: el.type || null,
              nom: el.name || el.id || null, placeholder: el.placeholder || null,
              valeur: String(el.value || '').slice(0, 60),
              libelle: (el.labels?.[0]?.innerText || el.closest('label')?.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 90) || null,
              options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.text).slice(0, 12) : undefined,
            });
          }
          const titres = [...document.querySelectorAll('h1, h2, h3, h4, [class*="section" i] [class*="title" i], [class*="step" i]')]
            .map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90)).filter(Boolean);
          return { champs: champs.slice(0, 80), titres: [...new Set(titres)].slice(0, 40) };
        });
        console.log('Titres de sections :', JSON.stringify(formulaire.titres));
        console.log('Champs (' + formulaire.champs.length + ') :', JSON.stringify(formulaire.champs, null, 0));
        console.log('Boutons :', JSON.stringify((await inventaire()).boutons));
      }
    }

    if (etape === 'formulaire') {
      if (!dossierTest || !contratTest) { console.log('Pas de contrat de test retenu.'); }
      else {
        await page.goto(`https://app.mynotary.fr/operation/${dossierTest}/contrats/redaction/${contratTest}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('text=Informations sur le Mandat', { timeout: 30000 });
        await page.waitForTimeout(2000);
        await verifierSession('ouverture du contrat');
        // Une rubrique ouverte (#root-popin) : chaque question, son libellé,
        // son type (champ, boutons à choix, liste) et sa valeur actuelle.
        const questions = () => page.evaluate(() => {
          const racine = document.querySelector('#root-popin') || document;
          const HORS = /^(Fermer|Précédent|Suivant|Filtrer|Sommaire|Valider|Annuler|Ajouter.*)$/i;
          const groupes = new Map();
          const ctrls = racine.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea, select, button, [role="radio"], [role="option"], [contenteditable="true"]');
          for (const el of ctrls) {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const t = (el.innerText || el.value || '').trim();
            if (el.tagName === 'BUTTON' && HORS.test(t)) continue;
            if (el.closest('header, [class*="header" i], [class*="footer" i]')) continue;
            const bloc = el.closest('[class*="form-question"]:not([class*="input"])') || el.closest('[class*="question" i]') || el.parentElement?.parentElement;
            if (!bloc) continue;
            const g = groupes.get(bloc) || { libelle: '', controles: [] };
            const lab = bloc.querySelector('[class*="label" i], label');
            g.libelle = g.libelle || (lab?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 140);
            g.controles.push({
              balise: el.tagName.toLowerCase(),
              type: el.type || el.getAttribute('role') || null,
              placeholder: el.placeholder || null,
              texte: t.slice(0, 40),
              valeur: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? String(el.value || '').slice(0, 60) : undefined,
              actif: /active|selected|checked|primary|is-on/i.test(String(el.className)) || el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || undefined,
              options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.text).slice(0, 15) : undefined,
            });
            groupes.set(bloc, g);
          }
          const titres = [...racine.querySelectorAll('[class*="fh-label"], h1, h2, h3, h4')].map((x) => (x.innerText || '').trim()).filter(Boolean);
          return { titres: [...new Set(titres)].slice(0, 20), questions: [...groupes.values()] };
        });
        const fermerRubrique = async () => {
          const f = page.locator('#root-popin').getByText('Fermer', { exact: false }).first();
          if (await f.count()) await f.click({ timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(1500);
        };
        // Une tuile de rubrique change de texte au survol (« Ouvrir la
        // rubrique ») : on clique son conteneur, en forçant.
        const ouvrirRubrique = async (section) => {
          const tuile = page.locator(`[data-testid="record-label-tile"]:has-text("${section}")`).first();
          await tuile.locator('xpath=ancestor::*[contains(@class,"tile") or contains(@class,"record")][1]').first()
            .click({ force: true, timeout: 10000 })
            .catch(() => tuile.click({ force: true, timeout: 10000 }));
        };
        for (const section of ['Informations sur la Vente', 'Informations sur le Mandat']) {
          await ouvrirRubrique(section);
          await page.waitForTimeout(3000);
          console.log(`(rubrique « ${section} » ouverte — URL ${page.url()})`);
          // Toutes les pages de la rubrique (Suivant), chacune relevée. On LIT :
          // aucun champ n'est rempli, aucune réponse n'est cliquée.
          for (let pageN = 1; pageN <= 8; pageN += 1) {
            await photo(`f-${section.replace(/\s+/g, '-').toLowerCase()}-${pageN}`);
            const q = await questions();
            console.log(`\n=== ${section} · page ${pageN} · ${q.titres.join(' | ')} ===`);
            for (const x of q.questions) console.log(JSON.stringify(x));
            const suivant = page.locator('#root-popin').getByRole('button', { name: /Suivant/ }).first();
            if (!(await suivant.count()) || !(await suivant.isEnabled().catch(() => false))) break;
            const avant = JSON.stringify(q.titres);
            await suivant.click({ timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(2000);
            if (JSON.stringify((await questions()).titres) === avant) break;
          }
          await fermerRubrique();
        }
        // « Ajouter un vendeur / un bien » : on REGARDE, on ne valide rien, on ferme.
        for (const ajout of ['Ajouter un vendeur', 'Ajouter un bien à vendre']) {
          await page.locator(`text=${ajout}`).first().click({ force: true, timeout: 10000 });
          await page.waitForTimeout(3000);
          await photo(`g-${ajout.replace(/\s+/g, '-').toLowerCase()}`);
          const q = await questions();
          console.log(`\n=== ${ajout} · ${q.titres.join(' | ')} ===`);
          for (const x of q.questions) console.log(JSON.stringify(x));
          console.log('Boutons visibles :', JSON.stringify((await inventaire()).boutons));
          await fermerRubrique();
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      }
    }

    // Le téléchargement à part : il peut consommer un crédit MyNotary.
    // Étape explicite, lancée seulement quand Jules le décide.
    if (etape === 'telecharger') {
      if (!dossierTest || !contratTest) { console.log('Pas de contrat de test retenu.'); }
      else {
        await page.goto(`https://app.mynotary.fr/operation/${dossierTest}/contrats/redaction/${contratTest}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('text=Télécharger', { timeout: 30000 });
        await page.waitForTimeout(2000);
        await verifierSession('ouverture du contrat');
        // « Télécharger » : ce qu'il propose (menu ou téléchargement direct).
        const telechargement = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await page.locator('text=Télécharger').first().click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        await photo('h-telecharger');
        console.log('\n=== Télécharger ===', JSON.stringify((await inventaire()).boutons));
        const fichier = await telechargement;
        if (fichier) {
          const cible = path.join(SORTIE, `mandat-test-${contratTest}.pdf`);
          await fichier.saveAs(cible);
          console.log('PDF TÉLÉCHARGÉ :', cible, fs.statSync(cible).size, 'octets');
        } else {
          console.log('Pas de téléchargement direct : un menu ou une confirmation s\u2019ouvre (voir h-telecharger.png).');
        }
      }
    }

    if (etape === 'dossier') {
      const bouton = page.locator('button:has-text("Nouveau dossier"), a:has-text("Nouveau dossier"), [role="button"]:has-text("Nouveau dossier")').first();
      await bouton.click({ timeout: 15000 });
      await page.waitForTimeout(4000);
      await photo('b1-nouveau-dossier');
      console.log('URL après « Nouveau dossier » :', page.url());
      console.log('Choix proposés :', JSON.stringify(await inventaire()));
    }
  }
} catch (e) {
  await photo('z-erreur');
  console.log('ARRÊT :', e?.message || e);
} finally {
  for (const a of alertes.slice(0, 5)) console.log('GARDIEN — requête coupée :', a);
  await navigateur.close();
}
