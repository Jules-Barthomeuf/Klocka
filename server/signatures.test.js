// La bannière de signature (8 oct. 2026) : elle remplace la signature en texte
// dans le HTML, part en pièce intégrée, et seulement pour les adresses Klocka
// qui en ont une.

import test from 'node:test';
import assert from 'node:assert/strict';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { banniereDe, sansSignature, htmlAvecBanniere, CID } from './signatures.js';

test("la signature en texte s'enlève : celle de Jules, celle du mode appel ; la formule de politesse reste", () => {
  const a = sansSignature("Bonjour Marc,\n\nMerci pour votre temps.\n\nBien à vous,\nJules\njules.b@klocka.immo\nwww.klocka.immo\n", { email: 'jules.b@klocka.immo', nom: 'Jules Barthomeuf' });
  assert.equal(a.retiree, true);
  assert.equal(a.corps, 'Bonjour Marc,\n\nMerci pour votre temps.\n\nBien à vous,');
  const b = sansSignature('Bonjour,\n\nVoici la fiche.\n\nBien à vous,\nNora Lorinquer\nKlocka · klocka.immo\nnora.l@klocka.immo', { email: 'nora.l@klocka.immo', nom: 'Nora Lorinquer' });
  assert.equal(b.corps, 'Bonjour,\n\nVoici la fiche.\n\nBien à vous,');
});

test("sans signature reconnaissable, rien n'est retiré ; « klocka.immo » au milieu d'une phrase reste", () => {
  const t = 'Bonjour,\n\nNotre site klocka.immo présente nos critères.\n\nÀ bientôt';
  assert.deepEqual(sansSignature(t, { email: 'coralie.g@klocka.immo', nom: 'Coralie Guillaud' }), { corps: t, retiree: false });
  // Le prénom seul en fin de mail, sans adresse : on ne devine pas.
  assert.equal(sansSignature('Merci,\nCoralie', { email: 'coralie.g@klocka.immo', nom: 'Coralie Guillaud' }).retiree, false);
});

test('une bannière par personne de l\'équipe, aucune ailleurs ; le mail la porte en pièce intégrée', async () => {
  for (const e of ['jules.b@klocka.immo', 'maxime.p@klocka.immo', 'coralie.g@klocka.immo', 'nora.l@klocka.immo']) {
    const b = banniereDe(e);
    assert.ok(b && b.contenu.length > 10000, e);
    assert.ok(b.contenu.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), `${e} : un JPEG`);
  }
  assert.equal(banniereDe('jules.btmf@gmail.com'), null);
  assert.equal(banniereDe('inconnu@klocka.immo'), null);
  const b = banniereDe('maxime.p@klocka.immo');
  assert.match(b.alt, /Maxime Pama · Klocka · maxime\.p@klocka\.immo · 06 10 91 71 65/);
  const html = htmlAvecBanniere('<div>Bonjour</div>', b);
  assert.match(html, new RegExp(`src="cid:${CID}"`));
  const brut = (await new MailComposer({ from: 'Maxime <maxime.p@klocka.immo>', to: 'agent@exemple.fr', subject: 'Test', text: 'Bonjour', html, attachments: [{ filename: 'klocka-maxime.p.jpg', content: b.contenu, cid: CID, contentType: 'image/jpeg', contentDisposition: 'inline' }] }).compile().build()).toString();
  assert.match(brut, new RegExp(`Content-ID: <${CID}>`));
  assert.match(brut, /Content-Disposition: inline/);
});
