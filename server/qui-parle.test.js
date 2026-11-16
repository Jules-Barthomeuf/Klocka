// Qui parle pendant l'appel : la séparation des deux voix au niveau du son, la voix de chaque phrase, les blocs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { enBlocs, niveauDePlage, niveauEntre, phrasesAvecPlages, seuilDeuxVoix, voixDe, voixParLesMots } from '../src/lib/qui-parle.js';
import { enPhrases } from '../src/lib/transcription-directe.js';

test('deux voix nettement séparées donnent un seuil entre elles ; une seule voix, aucun', () => {
  const fort = Array.from({ length: 60 }, (_, i) => 0.08 + (i % 5) * 0.004);
  const faible = Array.from({ length: 40 }, (_, i) => 0.02 + (i % 5) * 0.001);
  const s = seuilDeuxVoix([...fort, ...faible]);
  assert.ok(s > 0.024 && s < 0.08, `seuil ${s}`);
  assert.equal(voixDe(0.09, s), 'vous');
  assert.equal(voixDe(0.021, s), 'autre');
  assert.equal(seuilDeuxVoix(fort.concat(fort)), null);
  assert.equal(seuilDeuxVoix(fort.slice(0, 10)), null);
  // Quelques éclats forts ne font pas une seconde personne.
  assert.equal(seuilDeuxVoix([...faible, ...faible, 0.3, 0.3]), null);
  assert.equal(voixDe(null, s), null);
  assert.equal(voixDe(0.05, null), null);
});

test('la voix d\'une phrase : le niveau entendu pendant que ses mots arrivaient', () => {
  const historique = [];
  for (let t = 0; t < 4000; t += 50) historique.push({ t, n: t < 2000 ? 0.1 : 0.02 });
  assert.equal(niveauEntre(historique, 0, 1900), 0.1);
  assert.equal(niveauEntre(historique, 2500, 3900), 0.02);
  assert.equal(niveauEntre(historique, 5000, 6000), null);
  const texte = 'Bonjour, nous avons des clients. Oui, on fait du commerce. Et ';
  const { phrases, enCours } = phrasesAvecPlages(texte);
  assert.deepEqual(phrases.map((p) => p.texte), enPhrases(texte).phrases);
  assert.equal(enCours.texte, enPhrases(texte).enCours);
  // Les mots de la 1re phrase arrivent à 1,2 s puis 1,8 s ; ceux de la 2e à 3,4 s et 3,9 s.
  const arrivees = [{ fin: 15, t: 1200 }, { fin: 33, t: 1800 }, { fin: 50, t: 3400 }, { fin: 59, t: 3900 }];
  assert.equal(niveauDePlage(arrivees, historique, phrases[0].debut, phrases[0].fin), 0.1);
  assert.equal(niveauDePlage(arrivees, historique, phrases[1].debut, phrases[1].fin), 0.02);
  assert.equal(niveauDePlage([], historique, 0, 10), null);
});

test('les phrases d\'une même voix forment un bloc ; en essai, la voix se devine aux mots', () => {
  const blocs = enBlocs([{ cle: 0, qui: 'vous', texte: 'A.' }, { cle: 1, qui: 'vous', texte: 'B.' }, { cle: 2, qui: 'autre', texte: 'C.' }, { cle: 3, qui: null, texte: 'D.' }]);
  assert.deepEqual(blocs, [{ qui: 'vous', textes: ['A.', 'B.'], cles: [0, 1] }, { qui: 'autre', textes: ['C.'], cles: [2] }, { qui: null, textes: ['D.'], cles: [3] }]);
  assert.equal(voixParLesMots("Bonjour, c'est Jules de Klocka, nous achetons des murs."), 'vous');
  assert.equal(voixParLesMots('Ah non, ici c\'est un cabinet dentaire.'), 'autre');
});

test('l\'analyste qui se présente est toujours « Vous » ; sans seuil, le niveau se compare au sien', async () => {
  const { voixDeLaPhrase, ditParVous } = await import('../src/lib/qui-parle.js');
  assert.ok(ditParVous('Bonjour, c\'est Maxime de Klocka.'));
  assert.ok(ditParVous('Je suis Coralie, je vous appelle pour nos clients.'));
  assert.ok(!ditParVous('Oui, on fait du commerce.'));
  assert.equal(voixDeLaPhrase('Bonjour, Maxime de Klocka.', 0.01, 0.05), 'vous');
  assert.equal(voixDeLaPhrase('Oui bien sûr.', 0.02, null, 0.1), 'autre');
  assert.equal(voixDeLaPhrase('Très bien.', 0.09, null, 0.1), 'vous');
  assert.equal(voixDeLaPhrase('Très bien.', 0.09, null, null), null);
});
