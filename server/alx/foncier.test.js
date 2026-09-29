// L'analyseur de la fiche Data Foncier, contre un HTML de même forme que
// celui que Data-B rend (mêmes classes, mêmes blocs), avec des noms inventés.
//
// Ce qu'on vérifie : le propriétaire est lu avec ses lots, sa société, ses
// gérants ; l'âge devient une tranche et ne reste pas ; le choix retient le
// rez-de-chaussée, ou personne quand il faut trancher.

import test from 'node:test';
import assert from 'node:assert/strict';
import { lireFiche, choisirProprietaire, estRezDeChaussee, trancheAge } from './foncier.js';

const carte = ({ nom, siren, types = 'etage', lots, creation = '02/04/2019', gerants = [] }) => `
<div class="foncierCard check_save foncierOwnerCard" proprietaire_id="${siren}00011" data-owner-types="${types}" >
<header class="company-header company-header__small"><div class="header-top"><div>
<h1 class="company-title company_data text-underline pointer" siren="${siren}"> ${nom} </h1>
</div><div class="badges"><div class="foncierUsageBadges"><span class="foncierUsageBadge"> Propriétaire </span></div></div></div></header>
<div class="foncierCard__section foncierLotsSection"><div class="foncierCard__sectionTitle"><span>${lots.length}</span> lot concerné </div><div class="foncierLots">
${lots.map((l) => `<div class="foncierLot "><div class="foncierLot__type foncierLot__type--etage"> ${l} </div><div class="foncierLot__detail"><span><small>Bâtiment</small> A </span><span><small>Entrée</small> 01 </span><span><small>Porte</small> 01001 </span></div><div class="foncierLot__rights"> Propriétaire </div></div>`).join('')}
</div></div>
<div class="foncierCard__section"><div class="foncierCard__sectionTitle"> Informations sur l'entreprise </div><div class="listable foncierListable">
<div class="row"><div class="k"> SIREN </div><div class="v"><span class="company_data text-underline pointer" siren="${siren}"> ${siren} </span></div></div>
<div class="row"><div class="k"> Adresse </div><div class="v"> 72 CHEMIN DES OLIVIERS 06130 GRASSE </div></div>
<div class="row"><div class="k"> Activité </div><div class="v"> Location de terrains et d&#039;autres biens immobiliers </div></div>
<div class="row"><div class="k"> Création </div><div class="v"> ${creation} </div></div>
<div class="row"><div class="k"> Effectif </div><div class="v"> 0 salarié </div></div>
</div></div>
<div class="foncierCard__section foncierDirigeantsSection"><div class="foncierCard__sectionTitle"><span>${gerants.length}</span> gérant </div><div class="foncierDirigeants">
${gerants.map((g) => `<div class="person foncierPerson check_save " decideur_id="RL_x_1961-04"><div class="avatar"> XX </div><div style="min-width:0;flex:1;"><div class="p-title font-14"><span class="company_mapping text-underline pointer" key="x">${g.nom}${g.usage ? ` <small>(${g.usage})</small>` : ''}</span><span class="muted" style="font-weight:700;"> - ${g.age} ans</span></div><div class="p-meta"> ${g.qualite} </div></div><div class="actions actions__small m-t-8"><div class="dir-actions enrich-small"></div></div></div>`).join('')}
</div></div>
</div>`;

const fiche = (cartes) => `
<div id="foncier-list"><h2>12 RUE DES LICES 06600 ANTIBES</h2>
<div>Taille de la parcelle : 260 m2</div><div>Taille du bâtiment : 260 m2</div>
<div data-subtab="prop_all" id="prop_all">${cartes.join('\n')}</div>
<div id="prop_usage_proprietaires">${cartes.join('\n')}</div>
<div id="prop_occupant" data-occupants-loaded="0"></div></div>`;

test('un propriétaire se lit avec ses lots, sa société et ses gérants en tranches d’âge', () => {
  const f = lireFiche(fiche([carte({ nom: 'SCI DES LICES', siren: '123456789', types: 'etage sci', lots: ['Étage RDC', 'Étage 01'], gerants: [{ nom: 'Marie Durand', usage: 'Martin', age: 72, qualite: 'Gérant' }, { nom: 'Paul Durand', age: 45, qualite: 'Associé' }] })]));
  assert.equal(f.adresse, '12 RUE DES LICES 06600 ANTIBES');
  assert.equal(f.surface_parcelle, 260);
  assert.equal(f.proprietaires.length, 1, 'la carte répétée dans le second onglet ne compte pas deux fois');
  const p = f.proprietaires[0];
  assert.equal(p.nom, 'SCI DES LICES');
  assert.equal(p.siren, '123456789');
  assert.equal(p.forme, 'SCI');
  assert.deepEqual(p.lots.map((l) => l.etage), ['RDC', '01']);
  assert.equal(p.rez_de_chaussee, true);
  assert.equal(p.creation, '2019-04-02');
  assert.equal(p.activite, "Location de terrains et d'autres biens immobiliers");
  assert.deepEqual(p.gerants, [
    { nom: 'Marie Durand', nom_usage: 'Martin', tranche_age: '70+', qualite: 'Gérant' },
    { nom: 'Paul Durand', nom_usage: null, tranche_age: '-50', qualite: 'Associé' },
  ]);
  assert.ok(!JSON.stringify(f).includes('72 ans'), "l'âge exact ne sort pas");
  assert.ok(!JSON.stringify(f).includes('1961'), 'le mois de naissance non plus');
});

test('le choix retient le rez-de-chaussée, ou le seul propriétaire, sinon personne', () => {
  const rdc = { nom: 'A', proprietaire: true, rez_de_chaussee: true };
  const etage = { nom: 'B', proprietaire: true, rez_de_chaussee: false };
  assert.equal(choisirProprietaire([etage]).choix, etage, 'seul propriétaire de tout le bâtiment');
  assert.equal(choisirProprietaire([rdc, etage]).choix, rdc);
  assert.equal(choisirProprietaire([rdc, { ...rdc, nom: 'C' }]).choix, null, 'deux au rez-de-chaussée : à départager');
  assert.match(choisirProprietaire([rdc, { ...rdc, nom: 'C' }]).motif, /départager/);
  assert.equal(choisirProprietaire([etage, { ...etage, nom: 'D' }]).choix, null, 'aucun lot du bas identifié');
  assert.equal(choisirProprietaire([]).choix, null);
});

test('l’exploitant propriétaire de ses murs, ou la seule SCI du rez-de-chaussée, tranchent', () => {
  const sci = { nom: 'SCI DU PORT', siren: '111', forme: 'SCI', proprietaire: true, rez_de_chaussee: true };
  const sas = { nom: 'BOUTIQUE SAS', siren: '222', forme: null, activite: 'Commerce de détail', proprietaire: true, rez_de_chaussee: true };
  const sarl = { nom: 'AUTRE SARL', siren: '333', forme: null, activite: 'Restauration', proprietaire: true, rez_de_chaussee: true };
  const r = choisirProprietaire([sci, sas], { siren: '222', nom: 'BOUTIQUE SAS' });
  assert.equal(r.choix, sas, "l'exploitant prime sur la SCI");
  assert.equal(r.occupant_proprietaire, true);
  assert.equal(choisirProprietaire([sci, sas, sarl], { siren: '999', nom: 'X' }).choix, sci, 'une seule société immobilière parmi trois au rez-de-chaussée');
  assert.equal(choisirProprietaire([sas, sarl], null).choix, null, 'deux commerçants, personne ne tranche');
});

test('le lot du bas se reconnaît sous ses écritures, et Parcelle vaut tout', () => {
  for (const e of ['RDC', 'Rez-de-chaussée', '00', 'Étage 00', 'Parcelle']) assert.equal(estRezDeChaussee(e), true, e);
  for (const e of ['01', '02', 'Étage 03', '', null]) assert.equal(estRezDeChaussee(e), false, String(e));
});

test('l’âge devient une tranche', () => {
  assert.equal(trancheAge(72), '70+');
  assert.equal(trancheAge(55), '50-70');
  assert.equal(trancheAge(38), '-50');
  assert.equal(trancheAge(null), null);
  assert.equal(trancheAge('x'), null);
});

test('un HTML sans carte ne casse rien', () => {
  const f = lireFiche('<div id="prop_all"></div>');
  assert.deepEqual(f.proprietaires, []);
  assert.equal(lireFiche('').proprietaires.length, 0);
});

test('l’adresse du bâtiment vient du popover d’adresses, pas du siège du premier propriétaire', () => {
  const html = `
    <div><ul><li class="foncierAddressPopover__item"><i class="fa-solid fa-location-dot"></i><span>93 AVENUE MARCEAU 92400 COURBEVOIE</span></li>
    <li class="foncierAddressPopover__item"><i class="fa-solid fa-location-dot"></i><span>95 AVENUE MARCEAU 92400 COURBEVOIE</span></li></ul></div>
    <div id="prop_all">
      <div class="foncierCard check_save foncierOwnerCard">
        <h1 class="company-title" siren="337724561">LE PATRIMOINE DE LOCATION</h1>
        <div class="row"><div class="k">Adresse</div><div class="v">163 AVENUE CHARLES DE GAULLE 92200 NEUILLY-SUR-SEINE</div></div>
      </div>
    </div>`;
  const f = lireFiche(html);
  assert.equal(f.adresse, '93 AVENUE MARCEAU 92400 COURBEVOIE');
  assert.deepEqual(f.adresses, ['93 AVENUE MARCEAU 92400 COURBEVOIE', '95 AVENUE MARCEAU 92400 COURBEVOIE']);
  assert.equal(f.proprietaires[0].adresse, '163 AVENUE CHARLES DE GAULLE 92200 NEUILLY-SUR-SEINE', 'le siège reste sur la carte du propriétaire');
});
