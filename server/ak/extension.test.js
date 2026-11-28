// L'assistant de l'extension (server/ak/extension.js) : la consigne de la conversation ouverte et les outils que le
// navigateur exécute, demandés par le flux et rendus par la route /api/extension/outil.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
// Une base à part : ces tests créent des messages envoyés, jamais dans la base de travail.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-extension-'));
const { cadreExtension, demanderAuNavigateur, estOutilNavigateur, reponseDuNavigateur } = await import('./extension.js');

test("extension : la consigne porte la conversation ouverte et les seules autres conversations activées", () => {
  const c = cadreExtension({ canal: 'whatsapp', titre: 'Paul Dz', fil: '[10:51, 28/11/2026] Paul Dz: Salut', conversations: ['Paul Dz', 'Christophe Lepas'] });
  assert.match(c, /« Paul Dz »/);
  assert.match(c, /activées que tu peux lire : « Christophe Lepas »/);
  assert.match(c, /Paul Dz: Salut/);
  const m = cadreExtension({ canal: 'mail', titre: 'Murs Lorient', fil: 'Bonjour' });
  assert.match(m, /transfère à sourcing@/);
  assert.doesNotMatch(m, /lire_conversation_whatsapp/);
});

test("extension : un outil du navigateur attend la réponse de la même personne, et seulement d'elle", async () => {
  assert.equal(estOutilNavigateur('poser_brouillon'), true);
  assert.equal(estOutilNavigateur('chercher_dossier'), false);
  let demande = null;
  const attente = demanderAuNavigateur({ name: 'lire_conversation_whatsapp', input: { nom: 'Christophe Lepas' } }, 'Jules.B@klocka.immo', (l) => { demande = l.outil_navigateur; });
  assert.equal(demande.nom, 'lire_conversation_whatsapp');
  assert.equal(reponseDuNavigateur(demande.id, 'autre@klocka.immo', { ok: true }), false);
  assert.equal(reponseDuNavigateur(demande.id, 'jules.b@klocka.immo', { ok: true, fil: 'x' }), true);
  assert.deepEqual(await attente, { ok: true, fil: 'x' });
  assert.equal(reponseDuNavigateur(demande.id, 'jules.b@klocka.immo', { ok: true }), false);
});

test("extension : sans réponse du navigateur, l'outil rend une erreur au lieu de bloquer", async () => {
  const r = await demanderAuNavigateur({ name: 'poser_brouillon', input: { texte: 'x' } }, 'a@b.c', () => {}, { delai: 20 });
  assert.equal(r.ok, false);
});

test("extension : la personne qui parle est « Vous », jamais un autre nom du fil (28 nov. 2026, Jules : « je ne suis pas Alexis »)", () => {
  const c = cadreExtension({ canal: 'whatsapp', titre: 'Klocka - Lepas', moi: 'Jules Barthomeuf', fil: '[10:51, 28/11/2026] Alexis: Salut' });
  assert.match(c, /avec Jules Barthomeuf/);
  assert.match(c, /« Vous » : la personne qui te parle \(Jules Barthomeuf\) ; tous les autres noms sont d'autres personnes/);
});
