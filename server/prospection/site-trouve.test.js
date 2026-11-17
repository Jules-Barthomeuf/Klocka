// Le site d'une agence qui n'en a pas (17 nov. 2026) : retrouvé chez Klocka d'abord, sinon cherché une seule fois.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-site-trouve-'));
const { Records } = await import('../db.js');
const S = await import('./site-agence.js');

test('le site connu : une autre fiche de la même agence, ou le domaine d\'un e-mail pro, jamais un gmail', () => {
  const autres = [{ id: 'b', nom: 'AZUREA COMMERCES & ENTREPRISES', site: 'https://www.azurea-immo-entreprise.com/' }];
  assert.equal(S.siteConnu({ id: 'a', nom: 'Azurea Commerces' }, autres).site, 'https://www.azurea-immo-entreprise.com/');
  assert.equal(S.siteConnu({ id: 'a', nom: 'Autre', telephone: '04 93 00 00 00' }, [{ id: 'c', nom: 'X', telephone: '+33 4 93 00 00 00', site: 'x.fr' }]).site, 'x.fr');
  assert.equal(S.siteConnu({ id: 'a', nom: 'Cabinet Guerry', email: 'contact@cabinet-guerry.com' }, []).site, 'https://cabinet-guerry.com');
  assert.equal(S.siteConnu({ id: 'a', nom: 'Jean', email: 'jean@gmail.com' }, []), null);
});

test('la réponse de la recherche : l\'adresse du site, jamais un annuaire ni « aucune »', () => {
  assert.equal(S.siteDeLaReponse('https://www.agence-du-port.fr/nous-contacter.'), 'https://www.agence-du-port.fr/');
  assert.equal(S.siteDeLaReponse('https://www.pagesjaunes.fr/pros/123'), null);
  assert.equal(S.siteDeLaReponse('aucune'), null);
});

test('la recherche web part une seule fois par agence, jamais pour un mandataire', async () => {
  const a = Records.create('AgenceProspect', { nom: 'Agence du Port', telephone: '04 93 11 22 33' });
  let n = 0;
  const chercher = async () => { n += 1; return 'https://www.agence-du-port.fr'; };
  assert.equal(await S.trouverSite(a.id, { chercher }), 'https://www.agence-du-port.fr/');
  assert.equal(Records.get('AgenceProspect', a.id).site_source, 'recherche web');
  const b = Records.create('AgenceProspect', { nom: 'Agence Introuvable', adresse: '1 rue Introuvable' });
  const c = Records.create('AgenceProspect', { nom: 'Agence Sans Rien' });
  assert.equal(await S.trouverSite(c.id, { chercher }), null, 'ni numéro ni adresse : pas de recherche à l\'aveugle');
  const rien = async () => { n += 1; return 'aucune'; };
  assert.equal(await S.trouverSite(b.id, { chercher: rien }), null);
  assert.equal(await S.trouverSite(b.id, { chercher: rien }), null);
  const m = Records.create('AgenceProspect', { nom: 'Christian Arione', genre: 'mandataire' });
  assert.equal(await S.trouverSite(m.id, { chercher }), null);
  assert.equal(n, 2, 'une recherche pour le Port, une pour l\'introuvable, aucune de plus');
});

test('un site trouvé ne vaut que s\'il parle de l\'agence : son numéro ou les mots propres de son nom', () => {
  assert.equal(S.siteCorrespond('Le Prince Realty, desktop, Nice, commerces', { nom: 'dësk® immobilier commercial' }), false);
  assert.equal(S.siteCorrespond('dësk immobilier commercial, Nice', { nom: 'dësk® immobilier commercial' }), true);
  assert.equal(S.siteCorrespond('ACR Monaco, location', { nom: 'ACR IMMOBILIER' }), true, 'le nom seul ne départage pas un homonyme…');
  assert.equal(S.siteCorrespond('Contact : +33 4 93 11 22 33', { nom: 'Agence du Port', telephone: '04 93 11 22 33' }), true, '…le numéro, si');
  assert.equal(S.siteCorrespond('Agence immobilière à Nice', { nom: 'Agence Immobilière Nice' }), false, 'un nom sans mot propre ne se vérifie pas');
});
