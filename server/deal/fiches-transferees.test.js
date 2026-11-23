// Le banc d'essai du repérage des fiches (23 nov. 2026) : les transferts à sourcing@, ce que la machine en a fait, l'avis dessous.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listerTransferts, ajouterAvis, enTexte } from './fiches-transferees.js';

const equipe = (e) => /@klocka\.immo$/.test(e);
const lire = ({ objet }) => ({ objet_origine: String(objet).replace(/^TR:\s*/, ''), origine: { nom: 'Arnaud Briffault', email: 'a.briffault@aoimmobilier.com' }, note: 'Pas besoin de les rentrer' });

test('chaque transfert de l\'équipe à sourcing@ : ses pièces, les biens rentrés, le nombre compté, les avis', () => {
  const mails = [
    { id: 'm1', compte: 'sourcing@klocka.immo', de_email: 'maxime.p@klocka.immo', interne: true, date: '2026-11-23T09:00:00Z', objet: 'TR: 4 actifs Montpellier', texte: '…',
      pieces_jointes: [{ nom: 'AO Teaser.pdf', taille: 900 }], memoire_ids: ['b1', 'b2'], fiches_lues: [{ nom: 'AO Teaser.pdf', biens: 2, annonce: 4 }],
      haka_transfert: { intention: 'memoire' }, avis_fiche: [{ texte: 'Il y en a 4 dedans', par: 'jules.b@klocka.immo', le: '2026-11-23T10:00:00Z' }] },
    // Un mail d'un agent, pas un transfert de l'équipe : hors du banc.
    { id: 'm2', compte: 'sourcing@klocka.immo', de_email: 'agent@agence.fr', date: '2026-11-23T08:00:00Z', objet: 'Fiche', pieces_jointes: [{ nom: 'fiche.pdf' }] },
    // La boîte d'un analyste : hors du banc.
    { id: 'm3', compte: 'nora.l@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, date: '2026-11-23T08:00:00Z', objet: 'TR: x', pieces_jointes: [{ nom: 'f.pdf' }] },
  ];
  const biens = [
    { id: 'b1', mail_recu_id: 'm1', adresse: { rue: '1218 avenue du Père Soulas' }, code_postal: '34000', ville: 'Montpellier', prix: 1070000, fiche: { nom: 'AO Teaser.pdf', url: '/uploads/memoire/x.pdf' } },
    { id: 'b2', mail_recu_id: 'm1', adresse: { rue: '40 avenue du Pont Juvénal' }, ville: 'Montpellier', loyer_annuel: 44892 },
  ];
  const l = listerTransferts({ mails, biens, fiches: [{ id: 'mail:m1', biens: 2 }], estInterne: equipe, lire, prenom: () => 'Maxime' });
  assert.deepEqual(l.map((x) => x.id), ['m1']);
  const t = l[0];
  assert.equal(t.objet, '4 actifs Montpellier');
  assert.equal(t.agent, 'Arnaud Briffault');
  assert.equal(t.intention_libelle, 'Rentrée en Mémoire');
  assert.equal(t.compte, 2);
  assert.equal(t.biens.length, 2);
  assert.equal(t.biens[0].adresse, '1218 avenue du Père Soulas 34000 Montpellier');
  assert.deepEqual(t.pieces[0].lue, { nom: 'AO Teaser.pdf', biens: 2, annonce: 4 });
  assert.equal(t.avis[0].texte, 'Il y en a 4 dedans');
  // Le texte pour Claude dit ce que la machine a vu et ce qu'en dit l'équipe.
  const txt = enTexte(l);
  assert.match(txt, /AO Teaser\.pdf \(lue : 2 biens, annonce 4\)/);
  assert.match(txt, /Rentrée en Mémoire ; 2 fiches comptées/);
  assert.match(txt, /Avis \(jules\.b@klocka\.immo, 2026-11-23\) : Il y en a 4 dedans/);
});

test('un avis vide ne s\'ajoute pas ; les avis s\'empilent', () => {
  assert.deepEqual(ajouterAvis([], '  '), []);
  const a = ajouterAvis(ajouterAvis([], 'deux fiches', { par: 'j', le: '1' }), 'non, trois', { par: 'j', le: '2' });
  assert.deepEqual(a.map((x) => x.texte), ['deux fiches', 'non, trois']);
});
