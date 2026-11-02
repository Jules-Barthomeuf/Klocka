import test from 'node:test';
import assert from 'node:assert/strict';
import { messageMandatSigne } from './mandat-signe.js';

const prio = { cle: 'quittances', mot: 'Trois dernières quittances', raison: 'elles prouvent que le loyer est bien payé' };

test("au mandat signé : le travail est fait, aucune question qu'on sait déjà (2 nov. 2026, Jules)", () => {
  const m = messageMandatSigne({ occupe: true, deja: [{ cle: 'bail', mot: 'Bail commercial' }], manquantes: ['Trois dernières quittances', 'Dernière taxe foncière'], priorite: prio });
  assert.match(m, /^Mandat signé, bien joué ! J'ai préparé un mail au propriétaire pour lui donner accès à la Data room/);
  assert.match(m, /La priorité, c'est les trois dernières quittances : elles prouvent que le loyer est bien payé\./);
  assert.match(m, /On a déjà le bail, je l'ai mis dans la Data room\./);
  assert.match(m, /Le mail est écrit dans l’écran de droite/);
  assert.match(m, /Sans documents d'ici 3 jours, je vous prépare la relance\./);
  assert.match(m, /Le locataire a un droit de préférence.*un mois pour répondre/);
  assert.doesNotMatch(m, /Quels documents|€|registre|\*\*/);
});

test("sans l'adresse du propriétaire : c'est la seule question", () => {
  const m = messageMandatSigne({ occupe: false, manquantes: ['Bail commercial'], priorite: { cle: 'bail', mot: 'Bail commercial', raison: 'x' }, email: false });
  assert.match(m, /Il me manque son adresse e-mail : vous me la donnez \?/);
  assert.doesNotMatch(m, /écran de droite/);
});

test('vendu libre ou exception notée : pas de locataire ; dossier complet : les photos, puis le teaser', () => {
  const m = messageMandatSigne({ occupe: false, manquantes: [], photos: 2 });
  assert.doesNotMatch(m, /locataire/);
  assert.match(m, /toutes là[\s\S]*six à huit photos.*\(vous en avez 2\)/);
  assert.match(messageMandatSigne({ occupe: false, manquantes: [], photos: 8 }), /On prépare le teaser \?$/);
  assert.doesNotMatch(messageMandatSigne({ occupe: true, exception: true, manquantes: ['Le bail'] }), /locataire/);
  assert.match(messageMandatSigne({ occupe: null, manquantes: ['Le bail'] }), /locataire/, 'inconnu : on le rappelle par prudence');
});
