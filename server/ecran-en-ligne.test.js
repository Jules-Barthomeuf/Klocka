import test from 'node:test';
import assert from 'node:assert/strict';

// Les fonctions pures de l'écran d'appel (src/components/prospection/EcranEnLigne.jsx), relues sans React.
const src = (await import('node:fs')).readFileSync(new URL('../src/components/prospection/EcranEnLigne.jsx', import.meta.url), 'utf8');
const corps = (nom) => { const i = src.indexOf(`export function ${nom}(`); let p = src.indexOf('{', src.indexOf(')', i)); let n = 0; let j = p; for (; j < src.length; j += 1) { if (src[j] === '{') n += 1; if (src[j] === '}') { n -= 1; if (!n) break; } } return src.slice(i, j + 1).replace(/^export /, ''); };
const marques = src.slice(src.indexOf('const MARQUES'), src.indexOf('];', src.indexOf('const MARQUES')) + 2);
const { presentation, surligner } = new Function(`${marques}\n${corps('presentation')}\n${corps('surligner')}\nreturn { presentation, surligner };`)();

test("qui se présente : le nom et l'agence, avec ou sans majuscule à « agence »", () => {
  assert.deepEqual(presentation("Allô, bonjour, Sophie Essai de l'Agence Essai Commerces, vous m'avez appelée hier ?"), { nom: 'Sophie Essai', agence: 'Agence Essai Commerces' });
  assert.deepEqual(presentation("Oui, bonjour, Manon de l'agence Primo Immobilier. Vous avez tenté de nous joindre?"), { nom: 'Manon', agence: 'Primo Immobilier' });
  assert.deepEqual(presentation('Bonjour, Marc Démo, Riviera Test Immobilier, je vous rappelle.'), { nom: 'Marc Démo', agence: 'Riviera Test Immobilier' });
  assert.equal(presentation('Oui bonjour, vous avez des murs à vendre ?'), null);
});

test('ce qui compte est surligné : montants, voies, bail, bien', () => {
  const m = surligner("Justement, j'ai les murs d'une boulangerie, rue de France, loués 24 000 euros par an, bail renouvelé l'an dernier.").filter((x) => x.marque).map((x) => x.t);
  assert.ok(m.some((x) => /rue de France/.test(x)));
  assert.ok(m.some((x) => /24 000 euros par an/.test(x)));
  assert.ok(m.some((x) => /^bail renouvelé/.test(x)));
  assert.ok(m.some((x) => /murs d'une boulangerie/.test(x)));
  assert.equal(surligner('Bonjour, rien à signaler').filter((x) => x.marque).length, 0);
});
