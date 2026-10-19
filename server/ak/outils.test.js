// Les outils d'AK : la recherche d'agents, pure sur ses listes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { chercherAgents, cleTelephone, garderPourLeBien, marqueursDuBien } from './outils.js';

test('cleTelephone : la même clé sous toute écriture', () => {
  assert.equal(cleTelephone('07 85 27 19 24'), '785271924');
  assert.equal(cleTelephone('+33 7 85 27 19 24'), '785271924');
  assert.equal(cleTelephone('07.85.27.19.24'), '785271924');
  assert.equal(cleTelephone('12345'), null);
});

test('chercherAgents retrouve un agent de la grille par son numéro, sous toute écriture', () => {
  const agentsImmo = [{ id: 'g1', nom: 'Sébastien ROBIC', agence: null, emails: ['srobic@pro.bzh'], telephones: ['07 85 27 19 24'], ville: 'Lorient', statut: 'envoie_des_fiches' }];
  for (const q of [{ telephone: '0785271924' }, { telephone: '+33 7 85 27 19 24' }, { recherche: '07.85.27.19.24' }]) {
    const r = chercherAgents(q, { contacts: [], deals: [], mails: [], agentsImmo });
    assert.equal(r.length, 1, JSON.stringify(q));
    assert.equal(r[0].nom, 'Sébastien ROBIC');
    assert.deepEqual(r[0].telephones, ['07 85 27 19 24']);
    assert.equal(r[0].villes.includes('Lorient'), true);
  }
  assert.equal(chercherAgents({ telephone: '0600000000' }, { contacts: [], deals: [], mails: [], agentsImmo }).length, 0, 'un numéro inconnu ne rend personne');
});

test('la grille complète le carnet sans doubler un agent au même mail', () => {
  const contacts = [{ email: 'srobic@pro.bzh', nom: 'S. Robic', fonction: 'agent immobilier', localisation: 'Lorient' }];
  const agentsImmo = [{ id: 'g1', nom: 'Sébastien ROBIC', emails: ['srobic@pro.bzh'], telephones: ['07 85 27 19 24'], ville: 'Lorient', statut: 'envoie_des_fiches' }];
  const r = chercherAgents({ recherche: 'robic' }, { contacts, deals: [], mails: [], agentsImmo });
  assert.equal(r.length, 1);
  assert.equal(r[0].telephones.length, 1, 'le numéro de la grille est là');
  assert.equal(r[0].statut_prospection, 'envoie_des_fiches');
});

// « Tous les documents du projet MACSF » (19 oct. 2026) : les autres fiches du même agent ne vont pas dans ce dossier.
const MACSF = { deal_id: 'd-macsf', nom: 'MACSF - Lorient', lots: [{ lot: { adresse: { valeur: { rue: '12 rue du Port', code_postal: '56100', ville: 'Lorient' } }, locataire_nom: { valeur: 'MACSF' } } }] };
const fiche = (x) => /fiche/i.test((x.pieces_jointes || []).map((p) => p.nom).join(' '));

test('marqueursDuBien : le nom de la rue, l\'enseigne, le nom du dossier', () => {
  assert.deepEqual(marqueursDuBien(MACSF), ['port', 'macsf']);
});

test('garderPourLeBien : la fiche d\'une autre adresse du même agent est laissée de côté', () => {
  const opts = { dealId: 'd-macsf', deal: MACSF, dossierExiste: (id) => id === 'd-nox', aUneFiche: fiche };
  // Des mots entiers : « rapport » ne nomme pas la rue du Port.
  assert.equal(garderPourLeBien({ objet: 'Rapport de visite', pieces_jointes: [{ nom: 'Fiche Vannes.pdf' }] }, opts).garde, false);
  // Une autre fiche, une autre adresse : dehors.
  assert.deepEqual(garderPourLeBien({ objet: 'Local 40 rue du Maréchal Foch', pieces_jointes: [{ nom: 'Fiche Foch.pdf' }] }, opts).garde, false);
  // Rattaché à un autre dossier : dehors, et lequel.
  const r = garderPourLeBien({ objet: 'Nox', deal_id: 'd-nox', pieces_jointes: [{ nom: 'bail.pdf' }] }, opts);
  assert.equal(r.garde, false); assert.equal(r.dossier, 'd-nox');
  // La fiche qui nomme MACSF, un mail rattaché, le même fil, un complément sans nom : dedans.
  assert.equal(garderPourLeBien({ objet: 'Fiche MACSF Lorient', pieces_jointes: [{ nom: 'Fiche.pdf' }] }, opts).garde, true);
  assert.equal(garderPourLeBien({ objet: 'x', deal_id: 'd-macsf', pieces_jointes: [{ nom: 'Fiche.pdf' }] }, opts).garde, true);
  assert.equal(garderPourLeBien({ objet: 'x', thread_id: 't1', pieces_jointes: [{ nom: 'Fiche.pdf' }] }, { ...opts, premier: { thread_id: 't1' } }).garde, true);
  assert.equal(garderPourLeBien({ objet: 'Voici le bail', pieces_jointes: [{ nom: 'bail.pdf' }] }, opts).garde, true);
});
