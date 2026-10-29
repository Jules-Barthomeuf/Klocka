// Les clients de l'équipe : un appel lu remplit la fiche, Monday et le réseau des mandataires.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-clients-equipe-'));
const C = await import('./clients-equipe.js');
const { Records } = await import('./db.js');
const { demandeAnonyme } = await import('./mandataire-espace.js');
const { COL } = await import('./clients-decouverte.js');

const MAINTENANT = new Date('2026-10-16T10:00:00Z');
const PAUL = { email: 'paul.z@klocka.immo', full_name: 'Paul de Zulueta' };
const VIDE = C.nettoyerLecture({});
const lecture = (x) => async () => ({ ...VIDE, ...x });

/** Un Monday de test : il retient ce qu'on lui demande. */
function faussMonday(colonnesExistantes = {}) {
  const fait = [];
  return {
    fait,
    m: {
      tableau: 'T',
      lire: async (id) => ({ id, colonnes: colonnesExistantes }),
      maj: async (t, id, colonnes) => { fait.push(['maj', id, colonnes]); return { id }; },
      creer: async (t, nom, colonnes) => { fait.push(['creer', nom, colonnes]); return { id: '999' }; },
      commenter: async (id, texte) => { fait.push(['note', id, texte]); return {}; },
    },
  };
}

test('la lecture nettoyée : ce qui n’est pas dit reste vide', () => {
  const l = C.nettoyerLecture({ prenom: ' Hélène ', budget: 0, zones: ['Nice', '', 'Antibes'], objectif: 'Inconnu', email: 'H@X.FR' }, { objectif: ['Equilibre'], statut: [] });
  assert.equal(l.prenom, 'Hélène');
  assert.equal(l.budget, null);
  assert.deepEqual(l.zones, ['Nice', 'Antibes']);
  assert.equal(l.objectif, null);
  assert.equal(l.email, 'h@x.fr');
});

test('la fiche : une valeur dite remplace, les listes s’ajoutent, le nom ne sort pas vers les mandataires', () => {
  const d = { client_nom: 'Hélène Roux', budget: 400000, zones: ['Lyon'], fiche: { exclusions: ['restauration'], motivation: 'retraite' } };
  const { apres, avant } = C.changementsDeFiche(d, { ...VIDE, budget: 600000, zones: ['Nice'], exclusions: ['Restauration', 'bars'], horizon: 'avant l’été', pour_mandataires: 'Hélène Roux cherche une pharmacie à Nice.' }, {
    masquer: (t, nom) => t.replace(nom, 'H. R.'),
  });
  assert.equal(apres.budget, 600000);
  assert.equal(apres.budget_min, 500000);
  assert.equal(apres.budget_max, 700000);
  assert.deepEqual(apres.zones, ['Nice']);
  assert.deepEqual(apres.fiche.exclusions, ['restauration', 'bars']);
  assert.equal(apres.fiche.motivation, 'retraite');
  assert.equal(apres.fiche.horizon, 'avant l’été');
  assert.equal(apres.information, 'H. R. cherche une pharmacie à Nice.');
  assert.equal(avant.budget, 400000);
  assert.equal('client_nom' in apres, false, 'un nom connu ne change pas');
});

test('un client se retrouve par son adresse, sinon par son nom exact', () => {
  const clients = [{ id: 'a', client_nom: 'Hélène Roux', client_email: 'h@x.fr' }, { id: 'b', client_nom: 'Marc Démo' }];
  assert.equal(C.retrouverClient(clients, { email: 'H@x.fr' }).id, 'a');
  assert.equal(C.retrouverClient(clients, { nom: 'marc demo' }).id, 'b');
  assert.equal(C.retrouverClient(clients, { nom: 'Marc' }), null);
});

test('un appel collé fait naître le client : fiche, Sunday CRM créé avec sa note, visible du réseau, sans son nom', async () => {
  const { fait, m } = faussMonday();
  const r = await C.noterAppelClient({
    contenu: 'Appel avec Hélène Martin : elle cherche une pharmacie à Nice, budget 600 k, apport 150 k.', source: 'colle', user: PAUL, monday: m, maintenant: MAINTENANT,
    lire: lecture({ prenom: 'Hélène', nom: 'Martin', budget: 600000, fonds_propres: 150000, zones: ['Nice'], type_commerce: 'pharmacie', resume: 'Elle cherche une pharmacie à Nice.', prochaine_etape: 'Lui envoyer deux dossiers', date_prochaine_etape: 'jeudi', pour_mandataires: 'Hélène Martin cherche une pharmacie louée à Nice.' }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.nouveau, true);
  const d = Records.get('DemandeClient', r.client.id);
  assert.equal(d.client_nom, 'Hélène Martin');
  assert.equal(d.monday_id, '999');
  assert.equal(d.visible, true, 'on sait ce qu’elle cherche : le réseau la voit');
  assert.equal(d.edit_manuel, true);
  const [creer, note] = fait;
  assert.equal(creer[0], 'creer');
  assert.equal(creer[2][COL.budget], 600000);
  assert.deepEqual(creer[2][COL.statut], { label: 'Def Strategie' });
  assert.equal(note[0], 'note');
  assert.match(note[2], /Prochaine étape : Lui envoyer deux dossiers \(jeudi\)/);
  // Ce que voit le mandataire : ni le nom, ni l'adresse.
  const vu = JSON.stringify(demandeAnonyme(d));
  assert.doesNotMatch(vu, /Martin|Hélène/);
  assert.match(vu, /pharmacie/);
});

test('un appel enregistré sur une fiche connue : Sunday CRM mis à jour, puis « Annuler » remet tout', async () => {
  const d0 = Records.create('DemandeClient', { client_nom: 'Paul Test', source: 'monday', monday_id: '42', budget: 400000, budget_min: 350000, budget_max: 450000, zones: ['Lyon'], visible: true, active: true });
  const { fait, m } = faussMonday({ [COL.budget]: '400000', [COL.lieu_recherche]: 'Lyon' });
  const r = await C.noterAppelClient({ client_id: d0.id, contenu: 'Transcription : finalement 600 000 euros, à Nice plutôt qu’à Lyon.', source: 'enregistre', duree_s: 300, user: PAUL, monday: m, maintenant: MAINTENANT,
    lire: lecture({ budget: 600000, zones: ['Nice'], resume: 'Il monte son budget et change de ville.' }) });
  assert.equal(r.nouveau, false);
  assert.equal(Records.get('DemandeClient', d0.id).budget, 600000);
  assert.equal(r.appel.transcription.startsWith('Transcription'), true, 'la transcription est gardée avec l’appel');
  const maj = fait.find((x) => x[0] === 'maj');
  assert.deepEqual(maj[2], { [COL.budget]: 600000, [COL.lieu_recherche]: 'Nice' });
  assert.ok(fait.some((x) => x[0] === 'note' && x[1] === '42'));

  const fait2 = [];
  const a = await C.annulerAppelClient(r.appel.id, { user: PAUL, monday: { ...m, maj: async (t, id, colonnes) => { fait2.push([id, colonnes]); } } });
  assert.equal(a.ok, true);
  const d1 = Records.get('DemandeClient', d0.id);
  assert.equal(d1.budget, 400000);
  assert.deepEqual(d1.zones, ['Lyon']);
  assert.deepEqual(fait2[0], ['42', { [COL.budget]: 400000, [COL.lieu_recherche]: 'Lyon' }]);
  assert.equal((await C.annulerAppelClient(r.appel.id, { user: PAUL, monday: m })).ok, false, 'une seule fois');
});

test('un appel sans nom ni fiche ouverte ne crée rien ; Sunday CRM absent n’empêche rien', async () => {
  const avant = Records.list('DemandeClient').length;
  const r = await C.noterAppelClient({ contenu: 'Un appel où personne ne dit son nom, assez long pour être lu.', user: PAUL, monday: null, lire: lecture({ resume: 'x' }) });
  assert.equal(r.ok, false);
  assert.equal(Records.list('DemandeClient').length, avant);
  const c = C.creerClient({ nom: 'Sophie Essai' }, PAUL).client;
  const r2 = await C.noterAppelClient({ client_id: c.id, contenu: 'Sophie cherche une boulangerie à Antibes, rien de plus pour l’instant.', user: PAUL, monday: null, lire: lecture({ zones: ['Antibes'], resume: 'Boulangerie à Antibes.' }) });
  assert.equal(r2.appel.monday.etat, 'ignore');
  assert.equal((await C.ficheClient(c.id)).historique.length, 1);
});

test('retoucher : cacher au réseau est un choix qui tient', async () => {
  const c = C.creerClient({ nom: 'Client Caché' }, PAUL).client;
  C.retoucherClient(c.id, { visible: false }, PAUL);
  await C.noterAppelClient({ client_id: c.id, contenu: 'Il cherche des murs de banque à Marseille, budget un million.', user: PAUL, monday: null, lire: lecture({ zones: ['Marseille'], budget: 1000000, resume: 'Banque à Marseille.' }) });
  assert.equal(Records.get('DemandeClient', c.id).visible, false);
});
