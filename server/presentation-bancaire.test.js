// Les présentations bancaires : créées depuis un projet, gardées en
// diapositives éditables, retouchées par l'éditeur et par le chat d'AK, puis
// dessinées en PPTX telles qu'elles sont. Sans réseau ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-presentations-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const P = await import('./presentation-bancaire.js');
const { rendrePptx } = await import('./presentation-projet.js');
const { executerOutil } = await import('./ak/agent.js');

const JULES = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules B' };

// Un projet sans adresse : ni géocodage, ni enseignes, ni modèle à appeler.
const projet = Records.create('Project', {
  titre: 'Murs Boulangerie Dupont',
  nom_locataire: 'Dupont',
  activite_locataire: 'Boulangerie',
  sim_loyer_initial_ht: 24000,
  sim_prix_bien_negocie: 360000,
  surface_m2: 80,
  photos: ['/uploads/a.jpg', '/uploads/b.jpg'],
});

/** Les diapositives d'un PPTX, comptées dans le répertoire de l'archive. */
const diapositives = (buffer) => new Set(buffer.toString('latin1').match(/ppt\/slides\/slide\d+\.xml/g)).size;

test('poserChemin pose, ajoute, retire, et refuse un chemin inconnu', () => {
  const d = { id: 'sommaire', type: 'sommaire', titre: 'Sommaire', items: ['A', 'B', 'C'], photo: null };
  assert.equal(P.poserChemin(d, 'titre', 'Plan').diapo.titre, 'Plan');
  assert.deepEqual(P.poserChemin(d, 'items.+', 'D').diapo.items, ['A', 'B', 'C', 'D']);
  assert.deepEqual(P.poserChemin(d, 'items.1', null).diapo.items, ['A', 'C']);
  assert.deepEqual(P.poserChemin(d, 'items.0', 'Z').diapo.items, ['Z', 'B', 'C']);
  assert.equal(P.poserChemin(d, 'masquee', true).diapo.masquee, true);
  assert.equal(P.poserChemin(d, 'items.9', 'X').ok, false);
  assert.equal(P.poserChemin(d, 'inconnu', 'X').ok, false);
  assert.equal(P.poserChemin(d, 'id', 'autre').ok, false);
  assert.deepEqual(d.items, ['A', 'B', 'C'], "l'original ne bouge pas");
});

test('creer_presentation_bancaire : seize diapositives remplies depuis le projet', async () => {
  const r = await executerOutil({ name: 'creer_presentation_bancaire', input: { projet_id: projet.id } }, JULES);
  assert.equal(r.ok, true);
  const p = P.lirePresentation(r.presentation_id);
  assert.deepEqual(p.diapos.map((d) => d.id), ['couverture', 'sommaire', 'ville', 'emplacement', 'quartier', 'local', 'photos', 'bail', 'enseignes', 'marche', 'projection', 'revenus', 'conditions', 'porteur', 'structuration', 'merci']);
  const local = p.diapos.find((d) => d.id === 'local');
  assert.equal(local.heros.grand, '24\u202f000 €');
  assert.equal(local.stats[0].valeur, '300 €');
  assert.equal(p.diapos.find((d) => d.id === 'revenus').lignes.length, 20);
  assert.equal(p.diapos.find((d) => d.id === 'projection').barres.at(-1), 100);
  assert.equal(p.diapos.find((d) => d.id === 'couverture').photo, '/uploads/a.jpg');
  assert.equal(p.diapos.find((d) => d.id === 'couverture').heros.porteur, '[Prénom NOM]');
  assert.deepEqual(p.photos_projet, ['/uploads/a.jpg', '/uploads/b.jpg']);
});

test('modifier_presentation : les changements du chat, appliqués d\'un bloc ou pas du tout', async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const r = await executerOutil({ name: 'modifier_presentation', input: { presentation_id: id, changements: [
    { diapo: 'couverture', chemin: 'heros.porteur', valeur: 'Jules Barthomeuf' },
    { diapo: 'couverture', chemin: 'heros.banque', valeur: 'Crédit Agricole' },
    { diapo: 'sommaire', chemin: 'items.2', valeur: null },
    { diapo: 'enseignes', chemin: 'masquee', valeur: true },
  ] } }, JULES);
  assert.equal(r.ok, true);
  assert.equal(r.presentation_id, id);
  const p = P.lirePresentation(id);
  assert.equal(p.diapos[0].heros.porteur, 'Jules Barthomeuf');
  assert.equal(p.diapos[0].heros.banque, 'Crédit Agricole');
  assert.equal(p.diapos[1].items.length, 7);
  assert.equal(p.diapos.find((d) => d.id === 'enseignes').masquee, true);

  // Un chemin faux : rien n'est appliqué, l'erreur le dit.
  const faux = P.appliquerChangements(id, [{ diapo: 'couverture', chemin: 'heros.porteur', valeur: 'X' }, { diapo: 'nulle-part', chemin: 'titre', valeur: 'Y' }]);
  assert.equal(faux.ok, false);
  assert.match(faux.error, /nulle-part/);
  assert.equal(P.lirePresentation(id).diapos[0].heros.porteur, 'Jules Barthomeuf');
});

test("l'éditeur remplace une diapositive et change l'ordre, sans changer son type", async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const avant = P.lirePresentation(id).diapos;
  const merci = { ...avant.at(-1), heros: { ...avant.at(-1).heros, titre: 'Merci beaucoup.' } };
  assert.equal(P.modifierPresentation(id, { diapo: merci }).ok, true);
  assert.equal(P.lirePresentation(id).diapos.at(-1).heros.titre, 'Merci beaucoup.');
  assert.equal(P.modifierPresentation(id, { diapo: { ...merci, type: 'porteur' } }).ok, false);
  const ordre = avant.map((d) => d.id);
  [ordre[1], ordre[2]] = [ordre[2], ordre[1]];
  assert.equal(P.modifierPresentation(id, { ordre }).ok, true);
  assert.equal(P.lirePresentation(id).diapos[1].id, 'ville');
  assert.equal(P.modifierPresentation(id, { ordre: ordre.slice(1) }).ok, false);
  // Annuler une retouche d'AK : toutes les diapositives d'avant, d'un coup.
  assert.equal(P.modifierPresentation(id, { tout: avant }).ok, true);
  assert.equal(P.lirePresentation(id).diapos.at(-1).heros.titre, avant.at(-1).heros.titre);
  assert.equal(P.lirePresentation(id).diapos[1].id, avant[1].id);
  assert.equal(P.modifierPresentation(id, { tout: [avant[0], avant[0]] }).ok, false, 'deux fois la même diapositive');
  assert.equal(P.modifierPresentation(id, { tout: [] }).ok, false);
});

test('le PPTX dessine le modèle retouché et saute les diapositives masquées', async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const toutes = await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' });
  assert.equal(diapositives(toutes), 16);
  P.appliquerChangements(id, [{ diapo: 'porteur', chemin: 'masquee', valeur: true }, { diapo: 'couverture', chemin: 'heros.porteur', valeur: 'Prénom Retouché' }]);
  const buffer = await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' });
  assert.equal(diapositives(buffer), 15);
  assert.match(buffer.toString('latin1'), /ppt\/media\//, 'le logo Klocka est dans le PPTX');
  assert.ok(buffer.length > 10000);
});

test('une mise en forme de l\'éditeur (diapo.styles) sort dans le PPTX : masqué, gras, couleur', async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const avant = (await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' })).toString('latin1');
  assert.match(avant, /Nous restons/, "l'accroche de la dernière diapositive est là");
  const merci = P.lirePresentation(id).diapos.at(-1);
  P.modifierPresentation(id, { diapo: { ...merci, styles: { 'heros.accroche': { masque: true }, 'heros.titre': { gras: true, couleur: '#ABCDEF', taille: 90 } } } });
  const apres = (await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' })).toString('latin1');
  assert.doesNotMatch(apres, /Nous restons/, "l'accroche masquée ne sort pas");
  assert.match(apres, /ABCDEF/, 'la couleur libre est posée');
  // Le chat peut poser des styles d'un bloc ; AK voit ce qui est masqué, pas la mise en forme.
  assert.equal(P.appliquerChangements(id, [{ diapo: 'couverture', chemin: 'styles', valeur: { 'heros.banque': { masque: true } } }]).ok, true);
  const ctx = P.presentationPourAK(id);
  assert.match(ctx, /elements_masques.*heros\.banque/);
  assert.doesNotMatch(ctx, /ABCDEF/);
});

test("ce qu'AK lit de la présentation ouverte : les ids et les champs", async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const ctx = P.presentationPourAK(id);
  assert.match(ctx, /\[couverture\] \(couverture\)/);
  assert.match(ctx, /\[projection\] \(projection\)/);
  assert.match(ctx, /20 lignes/);
  assert.equal(P.presentationPourAK('inconnue'), null);
});

test("« ordre: modele » remet la couverture devant le sommaire, même après un déplacement (12 oct. 2026)", async () => {
  const { ordreDuModele, dansLOrdreDuModele, ORDRE, CIBLES_SOMMAIRE } = await import('../src/lib/presentation-modele.js');
  assert.equal(ORDRE[0], 'couverture');
  assert.equal(ORDRE[1], 'sommaire');
  assert.equal(ORDRE.length, 16);
  const melange = [{ id: 'sommaire', type: 'sommaire' }, { id: 'couverture', type: 'couverture' }, { id: 'merci', type: 'merci' }, { id: 'ville', type: 'ville' }];
  assert.equal(dansLOrdreDuModele(melange), false);
  assert.deepEqual(ordreDuModele(melange).map((d) => d.id), ['couverture', 'sommaire', 'ville', 'merci']);
  assert.equal(dansLOrdreDuModele(ordreDuModele(melange)), true);
  assert.equal(CIBLES_SOMMAIRE.length, 8, 'huit chapitres cliquables');
  const P = await import('./presentation-bancaire.js');
  const { Records } = await import('./db.js');
  const p = Records.create('PresentationBancaire', { diapos: melange, titre: 'x' });
  assert.equal(P.modifierPresentation(p.id, { ordre: 'modele' }).ok, true);
  assert.deepEqual(Records.get('PresentationBancaire', p.id).diapos.map((d) => d.id), ['couverture', 'sommaire', 'ville', 'merci']);
});

test("le PDF : un jeton d'impression court, et le fichier refait seulement après une retouche", async () => {
  const PDF = await import('./presentation-pdf.js');
  const { Records } = await import('./db.js');
  const p = Records.create('PresentationBancaire', { titre: 'Essai', diapos: [{ id: 'couverture', type: 'couverture' }], maj_le: '2026-10-12T10:00:00Z' });
  const j = PDF.jetonImpression(p.id, 1000);
  assert.equal(PDF.lireParJeton(j, 2000).titre, 'Essai');
  assert.equal(PDF.lireParJeton(j, 1000 + 3 * 60 * 1000), null, 'expiré après deux minutes');
  assert.equal(PDF.lireParJeton('faux'), null);
  assert.equal(PDF.pdfAJour({ pdf_url: '/x.pdf', pdf_le: '2026-10-12T11:00:00Z', maj_le: '2026-10-12T10:00:00Z' }), true);
  assert.equal(PDF.pdfAJour({ pdf_url: '/x.pdf', pdf_le: '2026-10-12T09:00:00Z', maj_le: '2026-10-12T10:00:00Z' }), false, 'retouchée depuis : à refaire');
  assert.equal(PDF.pdfAJour({ pdf_url: '/x.pdf', pdf_le: '2026-10-12T11:00:00Z', maj_le: '2026-10-12T10:00:00Z' }, false), false, 'fichier disparu : à refaire');
});

test("chaque diapositive dit d'où viennent ses chiffres ; une estimation de l'IA est signalée", async () => {
  const { sourcesDesDiapos } = await import('./presentation-projet.js');
  const S = sourcesDesDiapos({ origine: { ville: 'donnees', secteur: 'ia' }, indexation: 2, rendementRevente: 6.5 });
  assert.match(S.ville.chiffres, /jeu de données/);
  assert.match(S.quartier.chiffres, /estimation de l'IA[\s\S]*non vérifiée/);
  assert.match(S.projection.chiffres, /2 % par an[\s\S]*6\.5 %/);
  assert.match(S.emplacement.carte, /Google Maps/);
  const P = await import('./presentation-bancaire.js');
  const { Records } = await import('./db.js');
  const p = Records.create('PresentationBancaire', { titre: 'x', diapos: [{ id: 'quartier', type: 'quartier', sources: S.quartier }] });
  assert.match(P.presentationPourAK(p.id), /D'OÙ VIENNENT LES CHIFFRES[\s\S]*estimation de l'IA/);
});

test("loyers_equimmox : AK lit le loyer Equimmox du projet, sans dire qu'il n'y a pas accès", async () => {
  const S = await import('./projet-secteur.js');
  const p = Records.create('Project', { titre: 'Chocolaterie', adresse_complete: '10 Place Abel Surchamp, 33500 Libourne', surface_m2: 55 });
  // Une lecture de moins de trente jours : reprise telle quelle, sans appeler Equimmox.
  S.lireSecteur(p, { calculer: async () => ({ rue: { nom: 'Place Abel Surchamp', loyer_m2_an: 480, loyer_bas: 387, loyer_haut: 580, loyer_source: 'Equimmox', rayon: 500, surface_min: 44, surface_max: 66, le: '2026-10-12T10:00:00Z' } }) });
  await S.attendreSecteur(p.id);
  const r = await executerOutil({ name: 'loyers_equimmox', input: { projet_id: p.id } }, JULES);
  assert.equal(r.ok, true);
  assert.equal(r.source, 'Equimmox');
  assert.deepEqual([r.loyer_bas, r.loyer_m2_an, r.loyer_haut, r.rayon_m], [387, 480, 580, 500]);
  assert.match(r.note, /Equimmox/);
  assert.equal(r.coherent, true);
  assert.equal((await executerOutil({ name: 'loyers_equimmox', input: { projet_id: 'inconnu' } }, JULES)).ok, false);
  // Un repli Data-B se dit comme tel.
  const q = Records.create('Project', { titre: 'Autre', adresse_complete: '1 rue du Marché, 74000 Annecy' });
  S.lireSecteur(q, { calculer: async () => ({ rue: { loyer_m2_an: 300, loyer_bas: 240, loyer_haut: 360, loyer_source: 'Data-B' } }) });
  await S.attendreSecteur(q.id);
  const d = await executerOutil({ name: 'loyers_equimmox', input: { projet_id: q.id } }, JULES);
  assert.equal(d.source, 'Data-B');
  assert.match(d.note, /Equimmox n'a rien constaté/);
});

test('loyers_equimmox : une moyenne hors de sa fourchette est signalée, pas posée en silence', async () => {
  const S = await import('./projet-secteur.js');
  const p = Records.create('Project', { titre: 'Suspect', adresse_complete: '10 Place Abel Surchamp, 33500 Libourne' });
  S.lireSecteur(p, { calculer: async () => ({ rue: { loyer_m2_an: 199, loyer_bas: 182, loyer_haut: 190, loyer_source: 'Equimmox' } }) });
  await S.attendreSecteur(p.id);
  const r = await executerOutil({ name: 'loyers_equimmox', input: { projet_id: p.id } }, JULES);
  assert.equal(r.coherent, false);
  assert.match(r.note, /ATTENTION : la moyenne est hors de la fourchette/);
});

test("côté client : l'équipe envoie, le client ouvre et retouche la sienne seulement, sa question part dans le Feedback", async () => {
  const raphael = Records.create('User', { email: 'raphael@exemple.fr', full_name: 'Raphaël Test', role: 'user' });
  const autre = { email: 'autre@exemple.fr', role: 'user' };
  Records.create('User', { email: 'mandataire@exemple.fr', role: 'mandataire' });
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);

  // Un compte qui n'est pas client est refusé ; un client est accepté, et la liste remplace la précédente.
  assert.equal(P.envoyerAuxClients(id, ['mandataire@exemple.fr'], JULES).ok, false);
  const e = P.envoyerAuxClients(id, ['Raphael@Exemple.fr'], JULES);
  assert.deepEqual(e.envoye_a, ['raphael@exemple.fr']);
  assert.equal(P.clientsPossibles(id).find((c) => c.email === 'raphael@exemple.fr').envoyee, true);
  assert.equal(P.clientsPossibles(id).some((c) => c.email === 'mandataire@exemple.fr'), false, 'les mandataires ne sont pas des clients');

  // Raphaël la voit ; un autre client non ; l'équipe toujours.
  assert.deepEqual(P.presentationsDuClient(raphael).map((x) => x.id), [id]);
  assert.equal(P.presentationsDuClient(autre).length, 0);
  assert.equal(P.lirePourClient(id, autre), null);
  assert.ok(P.presentationsDuClient(JULES).some((x) => x.id === id));

  // Les sources restent, sans liens internes ni écarts de retouche.
  const d = P.lirePourClient(id, raphael);
  const toutes = Object.values(d.sources_champs).flatMap((c) => Object.values(c));
  assert.ok(toutes.length > 0);
  assert.ok(toutes.every((s) => !('ecart' in s) && (s.liens || []).every((l) => /^https?:\/\//.test(l.href))));

  // Sa question : une remarque du Feedback, rien de plus.
  assert.equal(P.poserQuestion(id, raphael, '  ').ok, false);
  assert.equal(P.poserQuestion(id, autre, 'Bonjour').ok, false);
  const q = P.poserQuestion(id, raphael, 'Le loyer de la diapo 6 est-il hors charges ?');
  const s = Records.get('Suggestion', q.id);
  assert.equal(s.statut, 'nouveau');
  assert.equal(s.client_email, 'raphael@exemple.fr');
  assert.match(s.contenu, /^Question sur la présentation « .+ » : Le loyer de la diapo 6/);

  // Retirer l'envoi : elle disparaît de sa page, mais l'équipe (vue client) la voit toujours.
  P.envoyerAuxClients(id, [], JULES);
  assert.equal(P.presentationsDuClient(raphael).length, 0);
  assert.ok(P.presentationsDuClient(JULES).some((x) => x.id === id), "l'équipe la voit dès sa création, envoyée ou non");
});

test("mode Sources : la source donnée par AK passe avant l'estimation de la création, et une retouche à la main l'efface", async () => {
  const { sourcesDesChamps } = await import('./presentation-sources.js');
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  // Une ville estimée par l'IA à la création, dont le libellé cite Le Figaro.
  const ville = P.lirePresentation(id).diapos.find((d) => d.id === 'ville');
  P.modifierPresentation(id, { diapo: { ...ville, sources: { chiffres: "une estimation de l'IA faite à la création de la présentation, non vérifiée" }, chiffres: [{ label: 'Prix médian du logement (Le Figaro)', valeur: '2 300 €/m²' }, ...ville.chiffres.slice(1)] } });
  let v = P.lirePresentation(id).diapos.find((d) => d.id === 'ville');
  let s = sourcesDesChamps(projet, [v])[v.id]['chiffres.0.valeur'];
  assert.equal(s.nature, 'ia');
  assert.match(s.detail, /de mémoire : sans recherche web/);
  assert.match(s.detail, /Le libellé cite Le Figaro, mais la valeur n'a pas été relue/);

  // AK la pose avec sa source : la fiche la montre, avec son lien.
  const r = await executerOutil({ name: 'modifier_presentation', input: { presentation_id: id, changements: [{ diapo: 'ville', chemin: 'chiffres.0.valeur', valeur: '2 412 €/m²', source: 'Le Figaro Immobilier, prix au m² de Libourne', lien: 'https://immobilier.lefigaro.fr/prix-immobilier/libourne/ville-33243' }] } }, JULES);
  assert.equal(r.ok, true);
  v = P.lirePresentation(id).diapos.find((d) => d.id === 'ville');
  s = P.lirePresentation(id).sources_champs.ville['chiffres.0.valeur'];
  assert.equal(s.nature, 'donnee');
  assert.equal(s.origine, 'Le Figaro Immobilier, prix au m² de Libourne');
  assert.equal(s.liens[0].href, 'https://immobilier.lefigaro.fr/prix-immobilier/libourne/ville-33243');

  // Retouchée à la main, la valeur perd la source d'AK.
  P.modifierPresentation(id, { diapo: { ...v, chiffres: [{ ...v.chiffres[0], valeur: '2 500 €/m²' }, ...v.chiffres.slice(1)] } });
  assert.equal(P.lirePresentation(id).sources_champs.ville['chiffres.0.valeur'].nature, 'ia');
});

test("acquisition droits inclus : le prix de revient du simulateur, pas le prix négocié ni le FAI", async () => {
  const { calculerTableauAnnuel, parametresDuProjet } = await import('../src/components/simulator/CalculFinancier.js');
  const p = Records.create('Project', { titre: 'Revient', sim_loyer_initial_ht: 24000, sim_prix_bien_negocie: 300000, sim_prix_bien_fai: 320000, sim_apport: 60000, surface_m2: 80 });
  const attendu = calculerTableauAnnuel(parametresDuProjet(p)).prixRevient;
  assert.ok(attendu > 300000, 'droits et frais en plus du prix négocié');
  const { presentation_id: id } = await P.creerPresentation(p.id, JULES);
  const d = P.lirePresentation(id);
  const eur = (n) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} €`;
  assert.equal(d.diapos.find((x) => x.id === 'couverture').stats[0].valeur, eur(attendu));
  assert.equal(d.diapos.find((x) => x.id === 'projection').lignes[0].valeur, eur(attendu));
  assert.equal(d.diapos.find((x) => x.id === 'conditions').blocs[2].valeur, eur(attendu - 60000), 'montant à financer = prix de revient - apport');
  const s = d.sources_champs.couverture['stats.0.valeur'];
  assert.equal(s.nature, 'calcul');
  assert.match(s.detail, /prix de revient du simulateur/);
  assert.match(s.calcul, /de droits .* de frais Klocka/);
});

test('flux autour du local : densité et fourchettes par heure du piéton, densité seule du voiture, avec leur source', async () => {
  const { fluxDeLEtude } = await import('./presentation-projet.js');
  assert.equal(fluxDeLEtude(null), null);
  const f = fluxDeLEtude({
    source: 'Étude Klocka', le: '2026-10-13T10:00:00Z',
    flux_pieton: { note: { note: 4, sur: 5 }, par_heure: { basse: { min: 500, max: 750 }, haute: { min: 1000, max: 1500 } }, methode: 'Estimation Klocka. Pas un comptage.' },
    flux_voiture: { note: { note: 3, sur: 5 }, methode: 'Classe de la voie (tertiary).' },
  });
  assert.equal(f.pieton.densite, 'Élevée');
  assert.deepEqual(f.pieton.etoiles, { note: 4, sur: 5 });
  assert.equal(f.pieton.basse, '500 à 750 piétons/h');
  assert.equal(f.pieton.haute, '1 000 à 1 500 piétons/h');
  assert.equal(f.voiture.densite, 'Moyenne');
  assert.deepEqual(f.voiture.etoiles, { note: 3, sur: 5 });
  assert.equal(f.voiture.basse, 'Non estimé', 'aucune source ne donne les voitures par heure');
  const { sourcesDesChamps } = await import('./presentation-sources.js');
  const s = sourcesDesChamps({}, [{ id: 'emplacement', type: 'emplacement', heros: {}, flux: f }]).emplacement;
  assert.match(s['flux.pieton.basse'].detail, /Pas un comptage.*heure creuse/);
  assert.equal(s['flux.voiture.basse'].nature, 'a_remplir');
  assert.equal(f.voiture.haute, undefined, 'pas d\'heure de pointe pour les voitures');
});
