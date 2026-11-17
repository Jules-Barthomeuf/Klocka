// L'équipe d'une agence chez Apollo pour la carte d'appel : sans la location, rangée, sans rien révéler.

import test from 'node:test';
import assert from 'node:assert/strict';
import { equipeRangee, nomCourt, posteFrancais, rangPoste } from './agences-apollo.js';

test('la location et la gestion écartées ; le commerce, la transaction, la direction puis l\'administratif', () => {
  assert.equal(rangPoste('Rental Management Officer'), null);
  assert.equal(rangPoste('Gestionnaire locatif'), null);
  assert.equal(rangPoste('Responsable gestion locative'), null);
  assert.equal(rangPoste('Négociateur immobilier d\'entreprise et commerce'), 0);
  assert.equal(rangPoste('Conseillère en transaction'), 1);
  assert.equal(rangPoste('Founder'), 2);
  assert.equal(rangPoste('Responsable administrative'), 3);
  assert.equal(rangPoste('Assistante Commerciale'), 3);
  assert.equal(rangPoste('Assistante de direction'), 3);
  assert.equal(rangPoste('Conseillère en Immobilier d\'entreprise'), 0);
  assert.equal(rangPoste('Business and Marketing Director'), null);
  assert.equal(rangPoste('Responsable E-commerce & Croissance'), null);
  assert.equal(rangPoste('Coordinateur Travaux et Logistique d Entreprise'), null);
  assert.equal(rangPoste('Community Manager'), null);
  assert.equal(rangPoste('Négociateur location et transaction'), 1);
  assert.equal(rangPoste('Negociatrice en Immobilier'), 1);
  assert.equal(posteFrancais('Founder'), 'Fondateur');
  assert.equal(posteFrancais('Chargée de Projets Immobiliers'), 'Chargée de Projets Immobiliers');
  assert.equal(nomCourt('Maxime', 'Do***e'), 'Maxime D.');
  const e = equipeRangee([
    { id: '1', first_name: 'Maxime', last_name_obfuscated: 'Do***e', title: 'Founder' },
    { id: '2', first_name: 'Clara', last_name_obfuscated: 'Au***u', title: 'Chargée de Projets Immobiliers' },
    { id: '3', first_name: 'Faiza', last_name_obfuscated: 'Fr***a', title: 'Rental Management Officer' },
  ]);
  assert.deepEqual(e.map((x) => x.nom), ['Clara A.', 'Maxime D.']);
  assert.equal(e[1].poste, 'Fondateur');
  assert.ok(e.every((x) => !('email' in x) && !('telephone' in x)));
});

test('les interlocuteurs : les connus d\'abord, puis rangés par poste, sans la location ; le standard en dernier', async () => {
  const { rangerInterlocuteurs } = await import('../../src/lib/interlocuteurs.js');
  const r = rangerInterlocuteurs([
    { id: 'g', nom: 'Patrick De Mersseman', source: 'Registre du commerce', fonction: 'Gérant' },
    { id: 'd', nom: 'Alexandre Lanfranco', source: 'Site de l\'agence', fonction: 'Directeur d\'agence' },
    { id: 'l', nom: 'Orlane Rodriguez', source: 'Site de l\'agence', fonction: 'Responsable gestion locative' },
    { id: 'n', nom: 'Melissa K.', source: 'Apollo', fonction: 'Négociatrice' },
    { id: 's', nom: 'Standard', source: 'Standard', standard: true, telephone: '04 93 00 00 00' },
  ]);
  assert.deepEqual(r.map((x) => x.id), ['n', 'g', 'd', 's']);
  assert.equal(r[0].probable, true);
  const avecConnu = rangerInterlocuteurs([{ id: 'n', nom: 'Melissa K.', source: 'Apollo', fonction: 'Négociatrice' }, { id: 't', nom: 'Paul Martin', source: 'Contact Twenty CRM' }]);
  assert.deepEqual(avecConnu.map((x) => x.id), ['t', 'n']);
  assert.ok(!avecConnu.some((x) => x.probable));
  assert.equal(rangerInterlocuteurs([{ id: 'e', nom: 'Jean Dupont', source: 'Site de l\'agence', fonction: 'Expert immobilier' }]).length, 1);
});

test('le nom court d\'Apollo se fond dans le nom complet du site ; la photo de la page équipe se pose sur la personne', async () => {
  const { fusionnerNoms, avecPhotos, rangerInterlocuteurs } = await import('../../src/lib/interlocuteurs.js');
  const f = fusionnerNoms([
    { id: 'ap0', nom: 'Benjamin C.', source: 'Apollo', fonction: 'Agent immobilier' },
    { id: 'c1', nom: 'Benjamin CASENOBE', source: 'Site de l\'agence', fonction: null },
    { id: 'ap1', nom: 'Elena L.', source: 'Apollo', fonction: 'Agent immobilier' },
  ]);
  assert.deepEqual(f.map((x) => x.nom), ['Benjamin CASENOBE', 'Elena L.']);
  assert.equal(f[0].fonction, 'Agent immobilier');
  const p = avecPhotos(f, { 'benjamin casenobe': 'https://x/b.jpg' });
  assert.equal(p[0].photo, 'https://x/b.jpg');
  assert.equal(p[1].photo, undefined);
  assert.equal(rangerInterlocuteurs([{ id: 'a', nom: 'Benjamin C.', source: 'Apollo', fonction: 'Négociateur' }, { id: 'b', nom: 'Benjamin Casenobe', source: 'Site de l\'agence', fonction: 'Conseiller' }]).length, 1);
  // La particule passée : « Claire C. » est « Claire de Chambure » (17 nov. 2026).
  assert.deepEqual(fusionnerNoms([{ id: 'a', nom: 'Claire C.', source: 'Apollo' }, { id: 'b', nom: 'Claire de Chambure', source: 'Site de l\'agence' }]).map((x) => x.nom), ['Claire de Chambure']);
  assert.equal(fusionnerNoms([{ id: 'a', nom: 'Claire D.', source: 'Apollo' }, { id: 'b', nom: 'Claire de Chambure', source: 'Site de l\'agence' }]).length, 2);
});

test('le standard n\'est jamais le portable d\'une personne nommée', async () => {
  const { contactsDe } = await import('./mode-appel.js');
  const c = contactsDe({ nom: 'Nice Homes', agents: [{ nom: 'Simon Crann', telephone: '06 13 87 26 69', source: 'Apollo' }] });
  assert.equal(c.some((x) => x.standard), false);
  assert.equal(c.find((x) => x.nom === 'Simon Crann').telephone, '06 13 87 26 69');
});

test('les photos d\'une page équipe : le nom dans l\'image, sinon la dernière image avant le nom', async () => {
  const { photosDansHtml, pagesEquipe } = await import('./photos-equipe.js');
  const html = '<img src="/logo.png" alt="Logo"><div><img src="/media/a1.jpg" alt="Benjamin CASENOBE"><b>Benjamin CASENOBE</b></div>'
    + '<div><img src="/media/z9.jpg"><b>Léa Battistelli</b><span>Assistante</span></div><div><b>Paul Sans Photo</b></div>';
  const r = photosDansHtml(html, ['Benjamin CASENOBE', 'Léa BATTISTELLI', 'Paul Sans Photo'], 'https://agence.fr/equipe');
  assert.equal(r['benjamin casenobe'], 'https://agence.fr/media/a1.jpg');
  assert.equal(r['lea battistelli'], 'https://agence.fr/media/z9.jpg');
  assert.equal(r['paul sans photo'], undefined);
  assert.deepEqual(pagesEquipe(['https://a.fr/', 'https://a.fr/l-equipe', 'https://a.fr/contact']), ['https://a.fr/l-equipe']);
});

test('le nom complet, sans crédit : collé au nom masqué d\'Apollo, par les mails ou la recherche web', async () => {
  const { colleAuMasque, nomParLesMails, nomsDeLaReponse } = await import('./agences-apollo.js');
  assert.ok(colleAuMasque('Douce', 'Do***e'));
  assert.ok(colleAuMasque('Kaça', 'Ka***a'));
  assert.ok(!colleAuMasque('Dupont', 'Do***e'));
  assert.ok(!colleAuMasque('De', 'Do***e'));
  const maxime = { prenom: 'Maxime', masque: 'Do***e', apollo_id: 'm' };
  assert.equal(nomParLesMails(maxime, ['contact@luckymmo.com', 'maxime.douce@luckymmo.com']), 'Maxime Douce');
  assert.equal(nomParLesMails(maxime, ['maxime.dupont@x.fr']), null);
  const clara = { prenom: 'Clara', masque: 'Au***u', apollo_id: 'c' };
  const r = nomsDeLaReponse('1. **Maxime Douce** (fondateur)\n2. inconnu', [maxime, clara]);
  assert.deepEqual(r, { m: 'Maxime Douce' });
  assert.deepEqual(nomsDeLaReponse('1. Maxime Durand', [maxime]), {});
});

test('un prénom seul ou suivi d\'une initiale ne s\'affiche plus ; le même nom à l\'envers est la même personne', async () => {
  const { contactsDe } = await import('./mode-appel.js');
  const c = contactsDe({
    nom: 'Agence', telephone: '04 93 00 00 00',
    apollo_equipe: { gens: [{ nom: 'Sandrine R.', poste: 'Négociatrice' }, { nom: 'Alfredo', poste: 'Agent' }, { nom: 'Oliel David', poste: 'Agent' }] },
    agents: [{ nom: 'David Oliel', telephone: '06 11 22 33 44', source: 'page équipe du site' }],
    prioritaire: { nom: 'Marc' },
  }, null, 0);
  const noms = c.filter((x) => !x.standard).map((x) => x.nom);
  assert.deepEqual(noms, ['Marc', 'Oliel David'], 'un prénom donné pendant un appel reste ; Sandrine R. et Alfredo non');
  assert.equal(c.find((x) => x.nom === 'Oliel David').telephone, '06 11 22 33 44');
});
