import test from 'node:test';
import assert from 'node:assert/strict';
import { ouvertureDeLEtape as brut, ceQuOnSait as su } from '../src/lib/ouverture-etape.js';

// Les espaces insécables des nombres et des dates, en espaces simples pour comparer.
const plat = (t) => (t == null ? t : String(t).replace(/[\u202f\u00a0]/g, ' '));
const ouvertureDeLEtape = (...a) => plat(brut(...a));
const ceQuOnSait = (...a) => plat(su(...a));

const importe = (biens = {}, extra = {}) => ({ titre: '9 rue de l\'Oratoire, Grasse', proprietaire: { id: 'p1', statut: 'rdv_pris', biens: { import: { fini: true }, ...biens }, ...extra } });

test("un bien importé : l'assistant dit où l'on est, ce qu'on sait et ce qu'il suffit de dire (6 nov. 2026)", () => {
  const b = importe({ repris: { surface: 85, loyer_annuel: 18600 } }, { mandat_importe: { signe_le: '2026-03-03', k_partners: true } });
  assert.equal(ceQuOnSait(b.proprietaire), '85 m², loyer 18 600 € par an, mandat signé le 3 mars 2026');
  const m = ouvertureDeLEtape(b, 'mandat');
  assert.match(m, /^Vous êtes à l'étape Mandat de 9 rue de l'Oratoire, Grasse\./);
  assert.match(m, /Le mandat est signé/);
  assert.match(ouvertureDeLEtape(b, 'estimation'), /rédige-le/);
  assert.equal(ouvertureDeLEtape({ proprietaire: { biens: {} } }, 'mandat'), null, "un bien qui n'est pas importé : rien");
});

test("en location, les mots de la location", () => {
  const b = importe({ transaction: 'location', repris: { loyer_annuel: 24000 } }, { mandat_importe: { k_partners: true } });
  const m = ouvertureDeLEtape(b, 'mandat');
  assert.match(m, /étape Mandat de location/);
  assert.match(m, /un local à louer/);
  assert.match(m, /loyer demandé 24 000 € par an/);
  assert.match(m, /pas encore signé/);
  assert.match(ouvertureDeLEtape(b, 'offre'), /Vos acquéreurs, les futurs locataires/);
});
