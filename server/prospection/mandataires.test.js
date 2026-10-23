// Les mandataires de la Prospection (23 oct. 2026) : reconnaître le réseau, la personne, le bon numéro, et ranger
// chacun à part des agences, sans doublon ; les listes d'avant se corrigent seules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mandataires-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('../db.js');
const M = await import('./mandataires.js');
const IA = await import('./agent-ia.js');
const MA = await import('./mode-appel.js');

test('pure : le réseau, la personne, le numéro le plus sûr', () => {
  assert.equal(M.reseauDe('IAD France')?.cle, 'iad');
  assert.equal(M.reseauDe('Capi France')?.cle, 'capifrance');
  assert.equal(M.reseauDe('Propriétés Privées')?.cle, 'proprietes_privees');
  assert.equal(M.reseauDe(null, 'vito.schiavone@iadfrance.fr')?.cle, 'iad', 'le domaine du mail suffit');
  assert.equal(M.reseauDe('Orpi Nice', 'jean@orpi.fr'), null);
  assert.equal(M.reseauDe('https://cedric-theveniaud.optimhome.com/')?.cle, 'optimhome', 'le site du conseiller');
  assert.equal(M.reseauDe('expfrance.fr')?.cle, 'exp');
  assert.equal(M.reseauDe('Tiad Immobilier'), null, 'pas un mot dans un autre');
  assert.equal(M.nomPersonne('Monsieur VITO SCHIAVONE'), 'Vito Schiavone');
  assert.equal(M.clePersonne('Schiavone Vito'), M.clePersonne('Monsieur Vito SCHIAVONE'));
  assert.equal(M.estEnNomPropre('Madame Claire Martin'), true);
  assert.equal(M.estEnNomPropre('Martin Immobilier'), false);
  assert.equal(M.estUnePersonne('Recup Email'), false, 'une adresse de service');
  assert.equal(M.estUnePersonne('Christian Arione'), true);
  assert.equal(M.estUnePersonne('Christian'), false, 'un prénom seul');
  assert.equal(M.telephoneAGarder({ telephone: '01', source: 'registre' }, { telephone: '06', source: 'annonce' }).telephone, '06', "l'annonce passe devant le registre");
  assert.equal(M.telephoneAGarder({ telephone: '06', source: 'annonce' }, { telephone: '07', source: 'apollo' }).telephone, '06', 'Apollo en dernier');
  assert.equal(M.telephoneAGarder(null, { telephone: '07', source: 'apollo' }).telephone, '07');
});

test('un mandataire du registre et le même dans les annonces : une seule ligne, le numéro de l’annonce', () => {
  const l = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const a = IA.rangerMandataire(l.id, { nom: 'Vito Schiavone', raison_sociale: 'Monsieur VITO SCHIAVONE', siren: '812345678', telephone: '04 93 11 11 11', telephone_source: 'registre', sources: ['Data-B'] });
  assert.equal(a.nouveau, true);
  const b = IA.rangerMandataire(l.id, { nom: 'Vito Schiavone', reseau: 'iad', reseau_nom: 'IAD', telephone: '06 12 34 56 78', telephone_source: 'annonce', annonces: 4, annonces_commerce: 2, sources: ['Equimmox'] });
  assert.equal(b.nouveau, false);
  const x = Records.get('AgenceProspect', a.mandataire.id);
  assert.equal(x.genre, 'mandataire');
  assert.equal(x.telephone, '06 12 34 56 78');
  assert.equal(x.telephone_source, 'annonce');
  assert.equal(x.reseau_nom, 'IAD');
  assert.equal(x.siren, '812345678');
  assert.equal(x.publie_commerce, true);
  assert.deepEqual(x.sources.sort(), ['Data-B', 'Equimmox']);
  // Un homonyme d'un autre réseau est une autre personne.
  assert.equal(IA.rangerMandataire(l.id, { nom: 'Vito Schiavone', reseau: 'safti', reseau_nom: 'SAFTI', telephone: '07 00 00 00 00', sources: ['Equimmox'] }).nouveau, true);
  assert.equal(MA.genreDe(x), 'mandataire');
  assert.equal(IA.contactMandataire(x).agence, 'IAD (mandataire)');
  assert.match(IA.contactMandataire(x).remarque, /Mandataire IAD · SIREN 812345678 · publie du commerce/);
});

test('une liste faite avant : « IAD France » rend ses agents, les « Monsieur X » deviennent des mandataires', () => {
  const l = Records.create('ListeAgences', { ville: 'Lyon', etat: 'fini', journal: [] });
  const iad = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Iad France', sources: ['Equimmox'], agents: [{ nom: 'Claire Martin', telephone: '06 11 11 11 11', annonces: 3, annonces_commerce: 1 }, { nom: 'Paul Roux', email: 'paul.roux@iadfrance.fr', telephone: '06 22 22 22 22' }] });
  const orpi = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Orpi Lyon 6', place_id: 'p1', telephone: '04 78 00 00 00', sources: ['Google Maps'], agents: [] });
  const nomPropre = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Madame Claire MARTIN', raison_sociale: 'Madame Claire MARTIN', siren: '900000001', sources: ['Data-B'], agents: [] });
  IA.reparerListe(l.id);
  assert.equal(Records.get('AgenceProspect', iad.id).hors_cible, true);
  assert.match(Records.get('AgenceProspect', iad.id).retiree_motif, /réseau de mandataires \(IAD\)/);
  assert.equal(Records.get('AgenceProspect', orpi.id).hors_cible, undefined, 'une vraie agence ne bouge pas');
  const mandataires = Records.list('AgenceProspect').filter((x) => x.liste_id === l.id && x.genre === 'mandataire' && !x.hors_cible);
  assert.deepEqual(mandataires.map((x) => x.nom).sort(), ['Claire Martin', 'Paul Roux']);
  const claire = mandataires.find((x) => x.nom === 'Claire Martin');
  assert.equal(claire.siren, '900000001', 'le registre et l’annonce se sont fondus');
  assert.equal(claire.telephone, '06 11 11 11 11');
  assert.equal(Records.get('AgenceProspect', nomPropre.id).genre, 'mandataire');
  const liste = IA.liste(l.id);
  assert.equal(liste.chiffres.mandataires, 2);
  assert.equal(liste.chiffres.mandataires_commerce, 1);
  assert.equal(liste.chiffres.agences, 1);
});

test('Apollo, au clic et en dernier : il complète un numéro manquant, jamais celui d’une annonce', async () => {
  const l = Records.create('ListeAgences', { ville: 'Rennes', etat: 'fini', journal: [] });
  const sans = IA.rangerMandataire(l.id, { nom: 'Lucie Bernard', reseau: 'safti', reseau_nom: 'SAFTI', sources: ['Equimmox'], email: 'lucie@exemple.fr' }).mandataire;
  const demandes = [];
  const chercher = async (q) => { demandes.push(q); return { telephone: '06 99 99 99 99', email: null }; };
  const r = await IA.numeroApollo(sans.id, { chercher });
  assert.equal(r.telephone, '06 99 99 99 99');
  assert.deepEqual(demandes[0], { prenom: 'Lucie', nom: 'Bernard', organisation: 'SAFTI', ville: 'Rennes' });
  assert.equal(Records.get('AgenceProspect', sans.id).telephone_source, 'apollo');
  const avec = IA.rangerMandataire(l.id, { nom: 'Marc Petit', reseau: 'iad', reseau_nom: 'IAD', telephone: '06 11 22 33 44', telephone_source: 'annonce', sources: ['Equimmox'] }).mandataire;
  await IA.numeroApollo(avec.id, { chercher });
  assert.equal(Records.get('AgenceProspect', avec.id).telephone, '06 11 22 33 44', "l'annonce reste");
});

test('une page d’annuaire collée : les noms, leurs numéros, sans les mots de la page', () => {
  const page = `Trouver un conseiller
Nice (06000)
90 résultats
Claire MARTIN
Conseillère immobilier
Nice
06 12 34 56 78
Voir le profil
Paul Roux
Conseiller immobilier · Nice Ouest
Afficher le numéro
DUPONT Jean-Marc
Mandataire immobilier
+33 7 11 22 33 44
Note 4,9 ★ (12 avis)
Claire Martin
06 12 34 56 78
Page suivante`;
  const gens = M.lireCollage(page);
  assert.deepEqual(gens, [
    { nom: 'Claire Martin', telephone: '06 12 34 56 78' },
    { nom: 'Paul Roux', telephone: null },
    { nom: 'Dupont Jean-Marc', telephone: '07 11 22 33 44' },
  ]);
  assert.equal(M.ligneNom('Conseillère immobilier'), null);
  assert.equal(M.ligneNom('Afficher le numéro'), null);
  assert.equal(M.telFrancais('+33 (0)6 12 34 56 78'), '06 12 34 56 78');
});

test('coller une page d’annuaire : chacun entre comme mandataire du réseau, numéro « annuaire », sans doublon', () => {
  const l = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  IA.rangerMandataire(l.id, { nom: 'Claire Martin', raison_sociale: 'Madame Claire MARTIN', siren: '900000002', telephone: '04 93 00 00 01', telephone_source: 'registre', sources: ['Data-B'] });
  const r = IA.collerMandataires(l.id, { texte: 'Claire MARTIN\n06 12 34 56 78\nPaul Roux\nAfficher le numéro', reseau: 'iad' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.lus, r.nouveaux, r.completes, r.avec_numero], [2, 1, 1, 1]);
  assert.deepEqual(r.sans_numero, ['Paul Roux']);
  const claire = Records.list('AgenceProspect').find((x) => x.liste_id === l.id && x.nom === 'Claire Martin');
  assert.equal(claire.telephone, '06 12 34 56 78', "l'annuaire passe devant le registre");
  assert.equal(claire.telephone_source, 'annuaire');
  assert.equal(claire.reseau_nom, 'IAD');
  assert.equal(claire.siren, '900000002');
  assert.equal(IA.collerMandataires(l.id, { texte: 'rien à lire ici 123', reseau: 'iad' }).ok, false);
  assert.equal(IA.collerMandataires(l.id, { texte: 'Claire Martin', reseau: 'inconnu' }).ok, false);
});

test('la vraie page IAD de Nice (sans numéros affichés) : les 15 conseillers, aucun libellé de la page', () => {
  const page = fs.readFileSync(new URL('./fixtures/annuaire-iad-nice.txt', import.meta.url), 'utf8');
  const gens = M.lireCollage(page);
  assert.equal(gens.length, 15);
  assert.deepEqual(gens.slice(0, 3), [{ nom: 'Claire Bourgeois', telephone: null, code_postal: '06000' }, { nom: 'Alix Verna', telephone: null, code_postal: '06000' }, { nom: 'Adrien Combes', telephone: null, code_postal: '06300' }]);
  assert.ok(gens.some((g) => g.nom === 'Marc-Henry Paturot'));
  assert.ok(!gens.some((g) => /compromis|mentions|cookies|g[ée]rer|unis|localisation/i.test(g.nom)));
});

test('un conseiller avec sa fiche Maps (« Olivier Trompette - immobilier - iad France ») devient un mandataire, ses agents aussi', () => {
  const l = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const a = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Olivier Trompette - immobilier - iad France', place_id: 'p9', telephone: '06 75 17 05 55', sources: ['Google Maps', 'Equimmox'], agents: [{ nom: 'Marc-Henry Paturot', telephone: '06 00 11 22 33', annonces: 5 }] });
  IA.reparerListe(l.id);
  const x = Records.get('AgenceProspect', a.id);
  assert.equal(x.genre, 'mandataire');
  assert.equal(x.nom, 'Olivier Trompette');
  assert.equal(x.reseau_nom, 'IAD');
  assert.equal(x.telephone_source, 'maps');
  assert.ok(Records.list('AgenceProspect').some((y) => y.liste_id === l.id && y.nom === 'Marc-Henry Paturot' && y.genre === 'mandataire' && y.reseau === 'iad'));
});


test('les liens des fiches IAD de Nice : un mandataire par lien, nommé par le lien, sa fiche à un clic', () => {
  const texte = fs.readFileSync(new URL('./fixtures/liens-iad-nice.txt', import.meta.url), 'utf8');
  const liens = M.lireLiens(texte);
  assert.equal(liens.length, 59);
  assert.deepEqual(liens[0], { nom: 'Claire Bourgeois', reseau: 'iad', reseau_nom: 'IAD', fiche_url: 'https://www.iadfrance.fr/conseiller-immobilier/claire.bourgeois', telephone: null });
  assert.ok(liens.some((x) => x.nom === 'Marc-Henry Paturot'));
  assert.ok(liens.some((x) => x.nom === 'Yann Le-Clech'));
  assert.ok(liens.some((x) => x.nom === 'Jean-Luc Marcelino'));
  assert.equal(M.nomDuLien('conseiller-immobilier'), null, 'un segment sans point n’est pas un nom');
  assert.deepEqual(M.lireLiens('https://www.orpi.com/agence/claire.martin'), [], 'pas un réseau de mandataires');

  const l = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  // Déjà connue par le registre, sans accent dans le lien : la même personne.
  IA.rangerMandataire(l.id, { nom: 'Valérie Ferrer', raison_sociale: 'Madame Valérie FERRER', siren: '900000003', sources: ['Data-B'] });
  const r = IA.collerMandataires(l.id, { texte, reseau: null });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.lus, r.nouveaux, r.completes], [59, 58, 1]);
  const valerie = Records.list('AgenceProspect').find((x) => x.liste_id === l.id && x.siren === '900000003');
  assert.equal(valerie.fiche_url, 'https://www.iadfrance.fr/conseiller-immobilier/valerie.ferrer');
  assert.equal(valerie.reseau_nom, 'IAD');
  // Le même collage une seconde fois ne double personne.
  assert.equal(IA.collerMandataires(l.id, { texte, reseau: null }).nouveaux, 0);
  // Le numéro vu sur la fiche, noté à la main.
  assert.equal(IA.noterNumero(valerie.id, '06 1').ok, false);
  assert.equal(IA.noterNumero(valerie.id, '+33 6 12 34 56 78').telephone, '06 12 34 56 78');
  assert.equal(Records.get('AgenceProspect', valerie.id).telephone_source, 'annuaire');
});
