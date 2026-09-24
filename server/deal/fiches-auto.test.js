// La fiche qui arrive devient un dossier toute seule : ce qui est une fiche,
// ce qui est un complément, et les doublons. Sans Gmail ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiches-auto-'));
const { Records, Meta } = await import('../db.js');
const { piecesFiche, estUneReponse, estUneNouvelleFiche, doublonDe, preanalyserLesNouvellesFiches } = await import('./fiches-auto.js');

const piece = (nom) => ({ nom, piece_id: `p-${nom}` });

test('la fiche est un PDF ou un Word qui n\'est pas un document de dossier', () => {
  const noms = (m) => piecesFiche(m).map((p) => p.nom);
  assert.deepEqual(noms({ pieces_jointes: [piece('Fiche_produit_358147.pdf'), piece('image001.png'), piece('logo.pdf')] }), ['Fiche_produit_358147.pdf']);
  assert.deepEqual(noms({ pieces_jointes: [piece('BAIL_COM_2024.pdf'), piece('PV AG 2023.pdf'), piece('6902 (DIAG DT).pdf'), piece('DPE.pdf')] }), []);
  assert.deepEqual(noms({ pieces_jointes: [piece('Teaser murs Lyon.docx'), piece('photo.jpg')] }), ['Teaser murs Lyon.docx']);
});

test('une réponse ou un complément n\'ouvre pas de dossier', () => {
  const fiche = { objet: 'Murs occupés par un glacier', pieces_jointes: [piece('fiche.pdf')], deal_id: null };
  assert.equal(estUneNouvelleFiche(fiche), true);
  assert.equal(estUneNouvelleFiche({ ...fiche, objet: 'Re: Murs occupés par un glacier' }), false);
  assert.equal(estUneNouvelleFiche({ ...fiche, objet: 'Fwd: doc complémentaire pour mur mirabeau nice' }), false);
  assert.equal(estUneNouvelleFiche({ ...fiche, thread_id: 't1' }, { filsConnus: new Set(['t1']) }), false);
  assert.equal(estUneNouvelleFiche({ ...fiche, deal_id: 'd1' }), false);
  assert.equal(estUneNouvelleFiche({ ...fiche, preanalyse_auto: { essais: 2 } }), false, 'deux échecs : on laisse au dashboard');
  assert.equal(estUneNouvelleFiche({ ...fiche, pieces_jointes: [] }), false);
  assert.equal(estUneReponse({ objet: 'RE : votre local' }), true);
});

test('la même fiche arrivée dans une autre boîte rejoint le premier dossier', () => {
  const maintenant = Date.parse('2026-09-24T12:00:00Z');
  const mails = [
    { id: 'm1', date: '2026-09-23T18:00:00Z', pieces_jointes: [piece('Fiche_produit_358147.pdf')], deal_id: 'd1' },
    { id: 'm2', date: '2026-09-24T11:00:00Z', pieces_jointes: [piece('fiche_produit_358147.PDF')] },
  ];
  const deals = [{ deal_id: 'd1', source_mail: { mail_recu_id: 'm1' } }];
  assert.equal(doublonDe(mails[1], { mails, deals, maintenant }), 'd1');
  assert.equal(doublonDe({ id: 'm3', pieces_jointes: [piece('autre.pdf')] }, { mails, deals, maintenant }), null);
  assert.equal(doublonDe(mails[1], { mails, deals, maintenant: Date.parse('2026-10-30T12:00:00Z') }), null, 'au-delà de quatorze jours, c\'est une nouvelle fiche');
});

test('la passe : une fiche nouvelle devient un dossier nommé, avant tout rattachement', async () => {
  const maintenant = new Date();
  Meta.set('mail.preanalyse_auto.depuis', new Date(maintenant - 3600000).toISOString());
  // Un agent qui a déjà un dossier ouvert : sa nouvelle fiche fait un nouveau dossier.
  Records.create('Deal', { deal_id: 'ancien', contact_agent_email: 'agent@agence.fr', statut: 'documents_recus', lots: [] });
  const fiche = Records.create('MailRecu', { compte: 'jules.b@klocka.immo', de_email: 'agent@agence.fr', objet: 'Glacier Reaumur', date: new Date(maintenant - 60000).toISOString(), pieces_jointes: [piece('Fiche_produit_358147.pdf')], deal_id: null });
  Records.create('MailRecu', { compte: 'jules.b@klocka.immo', de_email: 'agent@agence.fr', objet: 'Re: le bail', date: new Date(maintenant - 30000).toISOString(), pieces_jointes: [piece('bail.pdf')], deal_id: null });
  Records.create('MailRecu', { compte: 'jules.b@klocka.immo', de_email: 'vieux@agence.fr', objet: 'Fiche d\'avant', date: new Date(maintenant - 2 * 3600000).toISOString(), pieces_jointes: [piece('ancienne.pdf')], deal_id: null });

  const appels = [];
  const preanalyser = async (mail, opts) => {
    appels.push({ mail: mail.id, contact: opts.contactEmail });
    const d = Records.create('Deal', { deal_id: 'nouveau', lots: [{ lot: { locataire_nom: { valeur: null }, locataire_activite: { valeur: 'glacier' }, adresse: { valeur: { ville: 'Paris 2e' } } } }], suivi: [], source_mail: { mail_recu_id: mail.id } });
    Records.update('MailRecu', mail.id, { deal_id: d.deal_id });
    return { deal_id: d.deal_id };
  };
  const bilan = await preanalyserLesNouvellesFiches({ actif: true, preanalyser, maintenant });
  assert.equal(bilan.crees, 1);
  assert.deepEqual(appels, [{ mail: fiche.id, contact: undefined }], 'seule la fiche nouvelle, reçue après la mise en route');
  const d = Records.findBy('Deal', 'deal_id', 'nouveau');
  assert.equal(d.nom, 'Glacier - Paris 2e');
  assert.ok(d.suivi.some((s) => s.type === 'preanalyse_auto'));
  assert.equal(bilan.lignes[0].dossier, 'Glacier - Paris 2e');

  // Un second passage ne refait rien.
  assert.equal((await preanalyserLesNouvellesFiches({ actif: true, preanalyser, maintenant })).crees, 0);
});

test('une fiche transférée par l\'équipe n\'a pas d\'agent, et un échec est retenté une fois', async () => {
  const maintenant = new Date();
  const m = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'jules.b@klocka.immo', interne: true, objet: 'Fwd: murs Nice', date: new Date(maintenant - 1000).toISOString(), pieces_jointes: [piece('Gambetta_122_mur.pdf')], deal_id: null });
  let contact = 'pas appelé';
  let essais = 0;
  const rate = async (mail, opts) => { contact = opts.contactEmail; essais += 1; throw new Error('PDF illisible'); };
  const b1 = await preanalyserLesNouvellesFiches({ actif: true, preanalyser: rate, maintenant });
  assert.equal(contact, null);
  assert.equal(b1.crees, 0);
  assert.match(b1.erreurs[0], /PDF illisible/);
  await preanalyserLesNouvellesFiches({ actif: true, preanalyser: rate, maintenant });
  await preanalyserLesNouvellesFiches({ actif: true, preanalyser: rate, maintenant });
  assert.equal(essais, 2, 'deux essais, puis la fiche reste au dashboard');
  assert.equal(Records.get('MailRecu', m.id).preanalyse_auto.essais, 2);
});

test('éteinte, la passe ne fait rien', async () => {
  const b = await preanalyserLesNouvellesFiches({ actif: false, preanalyser: async () => { throw new Error('pas appelé'); } });
  assert.equal(b.crees, 0);
});
