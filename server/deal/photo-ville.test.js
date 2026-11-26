// La photo de la ville d'un dossier (26 nov. 2026, Jules : « des collages, c'est trop bizarre ») : la photo de Wikidata
// (P18), puis son bandeau (P948), jamais un montage, un blason ni une carte. Rien ne part sur le réseau.
import test from 'node:test';
import assert from 'node:assert/strict';

const { fichiersDeLEntite, PAS_UNE_PHOTO } = await import('./photos-auto.js');
const claim = (v) => ({ mainsnak: { datavalue: { value: v } } });

test('la photo de la ville, puis le bandeau ; jamais un montage', () => {
  assert.deepEqual(fichiersDeLEntite({ claims: { P18: [claim('Toulouse - View on Saint Sernin.jpg')], P948: [claim('Toulouse banner.jpg')] } }),
    ['Toulouse - View on Saint Sernin.jpg', 'Toulouse banner.jpg']);
  assert.deepEqual(fichiersDeLEntite({ claims: { P18: [claim('Montage Toulouse 3.jpg')], P948: [claim('Toulouse banner.jpg')] } }), ['Toulouse banner.jpg']);
  assert.deepEqual(fichiersDeLEntite(null), []);
  for (const f of ['Montage_Lille.jpg', 'Armoiries de Toulouse.svg', 'Blason Lyon.png', 'Carte de transport.png', 'Lille collage.jpg']) assert.ok(PAS_UNE_PHOTO.test(f), f);
  for (const f of ['Lille vue gd place.JPG', 'Port de Vannes quai Eric Tabarly.jpg', 'Antibes vieille ville mai 2014.JPG']) assert.ok(!PAS_UNE_PHOTO.test(f), f);
});
