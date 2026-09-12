// Le contrôle d'accès du CRUD générique, verrouillé par un test.
//
// Une entité qui s'ouvre par erreur ne casse aucun écran, ne lève aucune
// exception et n'apparaît dans aucun journal : elle répond simplement à qui
// demande. C'est la seule régression de cette application qui soit silencieuse.
// Ces assertions sont écrites contre ce qui s'est réellement produit — cinq
// entités de marché ajoutées après coup, ouvertes à soixante-quinze comptes
// clients parce que la liste énumérait ce qu'il fallait fermer.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verdictAcces, visiblePar, filtrerListe, ENTITES_CLIENT, ENTITES_INTERDITES,
} from './acces-entites.js';

const CLIENT = { id: 'u1', email: 'client@exemple.fr', role: 'user' };
const ADMIN = { id: 'a1', email: 'admin@klocka.immo', role: 'admin' };
const MANDATAIRE = { id: 'm1', email: 'mandataire@exemple.fr', role: 'mandataire' };

test('ce qui n’est pas ouvert explicitement est fermé', () => {
  // Le cœur de la règle : une entité inconnue du serveur est refusée, pas
  // servie. C'est ce qui protège celles qu'on ajoutera demain.
  assert.equal(verdictAcces(CLIENT, 'EntiteInventeeDemain').ok, false);
  assert.equal(verdictAcces(CLIENT, 'EntiteInventeeDemain').statut, 403);

  // Les cinq qui avaient manqué à la liste noire.
  for (const e of ['MarcheJournal', 'DataBImplantation', 'BodaccRecherche', 'DvfRecherche', 'DossierDoc']) {
    assert.equal(verdictAcces(CLIENT, e).ok, false, `${e} ne doit pas être lisible par un client`);
  }
  // Le CRM : noms, téléphones, patrimoine et budget des clients.
  for (const e of ['Contact', 'Prospect', 'Transaction', 'Propriete', 'ClientCRM', 'Note']) {
    assert.equal(verdictAcces(CLIENT, e).ok, false, `${e} ne doit pas être lisible par un client`);
  }
});

test('les entités à jetons sont fermées même à un administrateur', () => {
  // Une session volée par l'API vaut le mot de passe : personne n'y touche,
  // quel que soit le rôle.
  for (const e of ENTITES_INTERDITES) {
    assert.equal(verdictAcces(ADMIN, e).ok, false, `${e} doit rester hors de l'API`);
    assert.equal(verdictAcces(CLIENT, e).ok, false);
  }
});

test('l’équipe garde accès à tout le reste', () => {
  for (const e of ['Deal', 'MarcheJournal', 'Contact', 'Project', 'EntiteInventeeDemain']) {
    assert.equal(verdictAcces(ADMIN, e).ok, true, `${e} doit rester lisible par l'équipe`);
  }
});

test('sans compte, rien — et un 401, pas un 403', () => {
  // La distinction compte : un 403 dirait « ça existe, mais pas pour vous ».
  assert.deepEqual(verdictAcces(null, 'Project'), {
    ok: false, statut: 401, erreur: 'Not authenticated',
  });
  // Le piège d'origine : `currentUser(req) || {}` faisait d'un visiteur sans
  // compte un utilisateur vide, que le contrôle laissait passer.
  assert.equal(verdictAcces({}, 'Project').ok, true, 'un objet vide reste un utilisateur');
  assert.equal(verdictAcces(undefined, 'Project').statut, 401);
});

test('lecture seule veut dire lecture seule', () => {
  assert.equal(verdictAcces(CLIENT, 'Resource').ok, true);
  assert.equal(verdictAcces(CLIENT, 'Resource', { ecriture: true }).ok, false);
  // Les réglages d'affichage pilotent ce que voient tous les autres comptes.
  assert.equal(verdictAcces(CLIENT, 'AppSettings', { ecriture: true }).ok, false);
  // Ce qu'un client écrit légitimement.
  assert.equal(verdictAcces(CLIENT, 'Suggestion', { ecriture: true }).ok, true);
  // L'équipe n'est pas concernée par la lecture seule.
  assert.equal(verdictAcces(ADMIN, 'Resource', { ecriture: true }).ok, true);
});

test('toute entité ouverte à un client est soit filtrée, soit commune à tous', () => {
  // Le garde-fou de la liste elle-même : ouvrir une entité sans dire à qui
  // appartient chaque ligne, c'est l'ouvrir en entier. Ces deux-là sont
  // délibérément communes ; toute autre doit porter un filtre.
  const COMMUNES = new Set(['Resource', 'AppSettings']);
  for (const [entite] of ENTITES_CLIENT) {
    if (COMMUNES.has(entite)) continue;
    assert.ok(
      visiblePar(CLIENT, entite),
      `${entite} est ouverte à un client sans filtre : ajoutez-la à VISIBILITE_CLIENT, ou à COMMUNES si elle est vraiment publique`
    );
  }
});

test('une adresse vide n’appartient à personne', () => {
  // Le bug de la route analyse-bail : deux chaînes vides comparées à l'identique
  // faisaient d'un visiteur sans compte le client d'un projet sans adresse.
  const sansEmail = { id: 'x', email: '', role: 'user' };
  const visible = visiblePar(sansEmail, 'Suggestion');
  assert.equal(visible({ client_email: '' }), false);
  assert.equal(visible({ client_email: null }), false);
  assert.equal(visible({}), false);
});

test('la casse d’une adresse ne change pas les droits', () => {
  // Une adresse saisie à la main dans l'admin ne s'écrit pas toujours comme
  // celle du compte.
  const visible = visiblePar(CLIENT, 'Strategy');
  assert.equal(visible({ client_email: 'Client@Exemple.fr' }), true);
  assert.equal(visible({ client_email: '  client@exemple.fr  ' }), true);
  assert.equal(visible({ client_email: 'autre@exemple.fr' }), false);
});

test('un client ne voit que les projets où il figure, jamais les archivés', () => {
  const projets = [
    { id: 1, client_email: 'client@exemple.fr' },
    { id: 2, client_emails: ['client@exemple.fr', 'autre@exemple.fr'] },
    { id: 3, created_by: 'client@exemple.fr' },
    { id: 4, client_email: 'autre@exemple.fr' },
    { id: 5, client_email: 'client@exemple.fr', archived: true },
  ];
  assert.deepEqual(filtrerListe(CLIENT, 'Project', projets).map((p) => p.id), [1, 2, 3]);
  assert.equal(filtrerListe(ADMIN, 'Project', projets).length, 5);
});

test('les comptes : l’équipe et les mandataires voient la liste, un client lui-même', () => {
  const comptes = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
  assert.deepEqual(filtrerListe(CLIENT, 'User', comptes).map((u) => u.id), ['u1']);
  assert.equal(filtrerListe(MANDATAIRE, 'User', comptes).length, 3);
  assert.equal(filtrerListe(ADMIN, 'User', comptes).length, 3);
});

test('la lecture unitaire et la lecture en liste disent la même chose', () => {
  // Elles divergeaient : la liste filtrait Project, User et Suggestion, la
  // lecture par identifiant ne connaissait pas Strategy ni PresentationBancaire.
  const lignes = [
    { id: 'a', client_email: 'client@exemple.fr' },
    { id: 'b', client_email: 'autre@exemple.fr' },
  ];
  for (const entite of ENTITES_CLIENT.keys()) {
    const visible = visiblePar(CLIENT, entite);
    if (!visible) continue;
    const parListe = filtrerListe(CLIENT, entite, lignes).map((l) => l.id);
    const parUnite = lignes.filter(visible).map((l) => l.id);
    assert.deepEqual(parUnite, parListe, `${entite} : les deux chemins divergent`);
  }
});
