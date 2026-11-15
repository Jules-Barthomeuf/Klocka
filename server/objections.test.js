import test from 'node:test';
import assert from 'node:assert/strict';
import { objectionEntendue } from '../src/lib/objections.js';

test('les objections des vrais appels de Maxime sont reconnues', () => {
  assert.equal(objectionEntendue("Ah ben, non. Ça ne sera pas possible, ça. Vous travaillez gratuitement, vous ?").cle, 'remuneration');
  assert.equal(objectionEntendue("Je ne peux pas vous dire, je ne connais pas toutes mes propriétés, là c'est le service client.").cle, 'mauvaise_personne');
  assert.equal(objectionEntendue("Vous avez bien de faire des interagences, mais quelles sont les conditions ?").cle, 'inter_agence');
  assert.equal(objectionEntendue("Je peux vous envoyer un mail... non, envoyez-moi un mail avec votre cahier des charges").cle, 'veut_mail');
  assert.equal(objectionEntendue("Je demande à M. Estep de vous appeler, il n'est pas là.").cle, 'mauvaise_personne');
});

test('anticipation : parler de mandat de recherche montre la carte de la rémunération', () => {
  assert.equal(objectionEntendue("on travaille via un mandat de recherche").cle, 'remuneration');
});

test('la plus récente l\'emporte, et une carte déjà montrée se tait', () => {
  const t = "Vous travaillez gratuitement ? ... Écoutez, on n'a rien en ce moment.";
  assert.equal(objectionEntendue(t).cle, 'pas_de_bien');
  assert.equal(objectionEntendue(t, new Set(['pas_de_bien'])).cle, 'remuneration');
  assert.equal(objectionEntendue("Bonjour, Maxime de Klocka, je vous appelle pour des murs loués."), null);
  assert.equal(objectionEntendue(""), null);
});

test('l\'extrait garde les accents du texte entendu', () => {
  assert.ok(objectionEntendue("Écoutez, envoyez-moi un mail, je regarderai.").extrait.includes('Écoutez, envoyez-moi un mail'));
});

