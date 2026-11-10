// Un bien transféré par mail, côté mandataire (9 nov. 2026, Jules : « pour importer un bien il faut juste pouvoir
// transférer un mail vers sourcing@klocka.immo, on met "rentre ce dossier dans ma plateforme" et ça va le rentrer dans
// l'espace mandataire »).
//
// Le mail et ses pièces ouvrent un bien en cours d'import, comme le bouton Importer : la fiche (server/bien-repris.js),
// ses documents, le fil du bien. Une adresse déjà connue complète le bien existant. Le mandataire relit avec l'assistant
// et touche « Import terminé » : rien ne part au CRM avant.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Records } from './db.js';
import { SIMULER } from './haka/drapeaux.js';
import { OUTIL_REPRENDRE, creerBienAImporter, executerReprise, ficheVivante } from './bien-repris.js';
import { deposerAuBien } from './documents-du-bien.js';
import { versLeFil } from './bien-etapes.js';

const MAX_PIECES = 20;
const MAX_LUES = 8;

const CONSIGNE = `Un mandataire immobilier (murs et fonds de commerce) a transféré ce mail pour faire entrer un bien dans ses biens. Rends ce que le mail et ses pièces disent du bien. N'invente rien : un champ absent reste vide, et l'étape aussi si rien ne la dit. « 450 k€ » = 450000. Un mandat n'est rempli que si un mandat est joint ou décrit. L'expéditeur du mail d'origine est souvent un agent : ce n'est pas le propriétaire. plusieurs_biens : true seulement quand le mail présente plusieurs biens distincts, à des adresses différentes et à vendre séparément (un immeuble à plusieurs lots reste un seul bien).`;

const SCHEMA = {
  ...OUTIL_REPRENDRE.input_schema,
  properties: { ...OUTIL_REPRENDRE.input_schema.properties, plusieurs_biens: { type: 'boolean' } },
  required: [],
};

let lecteur = null;
/** Pour les tests : remplace la lecture par le modèle. */
export function _brancherLecteur(fn) { lecteur = fn; }

async function lireLeMail({ mail, lu, fichiers }, user) {
  const { ingerer } = await import('./deal/ingest.js');
  const textes = [];
  for (const f of fichiers.slice(0, MAX_LUES)) {
    try {
      const t = String((await ingerer({ buffer: f.buffer, filename: f.nom, mimetype: f.mime || undefined }))?.texte || '').trim();
      if (t) textes.push(`--- ${f.nom} ---\n${t.slice(0, 12000)}`);
    } catch (e) { console.warn(`[transfert mandataire] ${f.nom} illisible : ${e?.message || e}`); }
  }
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const prompt = `${CONSIGNE}\n\nObjet : ${lu.objet_origine || mail.objet || ''}\n\n--- LE MAIL ---\n${String(mail.texte || '').slice(0, 20000)}\n\n${textes.join('\n\n').slice(0, 60000)}`;
  const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, () => invokeLLM({ prompt, response_json_schema: SCHEMA }));
  return resultat || {};
}

function ecrire(fichier, uploadDir) {
  const nom = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${String(fichier.nom).replace(/[^\w.-]/g, '_')}`;
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, nom), fichier.buffer);
  return { nom: fichier.nom, url: `/uploads/${nom}`, mimetype: fichier.mime || null };
}

const nomDuBien = (p) => p.nom_bien || [p.adresse, p.ville].filter(Boolean).join(', ') || p.commerce || 'Nouveau bien';

/**
 * Le bien naît du transfert. `fichiers` : [{ nom, mime, buffer }], déjà téléchargés.
 * @returns {Promise<{fait: 'bien'|'plusieurs'|'rien', proprietaire_id?: string, nom?: string, pieces?: number, complete?: boolean, lu?: boolean}>}
 */
export async function bienDepuisTransfert(mail, { user, lu, uploadDir, fichiers = [] }) {
  // Une tâche reprise après une coupure ne refait pas le bien.
  const deja = mail.proprietaire_id ? ficheVivante({ id: mail.proprietaire_id }) : null;
  if (deja) return { fait: 'bien', proprietaire_id: deja.id, nom: nomDuBien(deja), pieces: 0, lu: true };

  const pieces = fichiers.slice(0, MAX_PIECES);
  const lire = lecteur || (SIMULER ? async () => ({}) : lireLeMail);
  // Le modèle en panne ne perd pas les pièces : le bien s'ouvre avec elles, et le mandataire le raconte à l'assistant.
  const lues = await lire({ mail, lu, fichiers: pieces }, user).catch((e) => { console.warn(`[transfert mandataire] lecture : ${e?.message || e}`); return {}; });
  if (lues.plusieurs_biens) return { fait: 'plusieurs' };
  const { plusieurs_biens: _plusieurs, corriger_etape: _corriger, ...entree } = lues;
  const reconnu = !!(entree.adresse || entree.commerce || entree.proprietaire || entree.prix || entree.loyer_annuel);
  if (!reconnu && !pieces.length) return { fait: 'rien' };
  if (!reconnu && lu.objet_origine) entree.commerce = String(lu.objet_origine).slice(0, 120);

  const cree = creerBienAImporter(user);
  if (!cree.ok) throw new Error(cree.error);
  if (pieces.length) {
    const d = await deposerAuBien(cree.proprietaire.id, pieces.map((f) => ecrire(f, uploadDir)), user);
    if (!d.ok) throw new Error(d.error);
  }
  const r = await executerReprise(entree, user, { fiche: cree.proprietaire });
  if (!r.ok) throw new Error(r.error);

  const p = ficheVivante({ id: r.fiche_id });
  const le = new Date().toISOString();
  const agent = lu.origine?.email || null;
  Records.update('ProprietaireMandataire', p.id, { historique: [...(p.historique || []), { le, type: 'import', texte: `Bien reçu par transfert de mail${agent ? ` (mail de ${agent})` : ''}` }] });
  Records.update('MailRecu', mail.id, { proprietaire_id: p.id });
  // Le fil du bien s'ouvre sur le mail et ses pièces, comme un message joint au chat.
  const note = String(lu.note || '').trim();
  versLeFil(p, user, [
    { role: 'user', contenu: pieces.length ? `📎 ${pieces.map((f) => f.nom).join(' · ')}${note ? ` — ${note}` : ''}` : note || 'Bien transféré par mail.', le, canal: 'import' },
    { role: 'assistant', contenu: `${r.ouvrir_bien ? 'Ce bien était déjà là : je l\'ai complété avec votre transfert' : 'Bien créé depuis votre transfert'}${pieces.length ? `, avec ${pieces.length} pièce${pieces.length > 1 ? 's' : ''}` : ''}. Relisez la fiche et dites-moi ce qui est faux ou ce qui manque.`, le, canal: 'import' },
  ]);
  return { fait: 'bien', proprietaire_id: p.id, nom: nomDuBien(p), pieces: pieces.length, complete: !!r.ouvrir_bien, lu: reconnu };
}

/** Pure : la notification au mandataire, une fois le geste fait. */
export function compteRenduBien(r, { objet = '' } = {}) {
  const sujet = String(objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim();
  const titre = `Votre transfert${r.nom ? ` · ${r.nom}` : sujet ? ` · ${sujet}` : ''}`.slice(0, 140);
  if (r.fait === 'plusieurs') return { titre, texte: 'Ce mail présente plusieurs biens : transférez-les un par un, chacun dans son mail.', lien: null };
  if (r.fait === 'rien') return { titre, texte: "Je n'ai trouvé ni bien ni pièce dans ce mail. Transférez le mail qui décrit le bien, ou joignez sa fiche ou son mandat.", lien: null };
  const avec = r.pieces ? `, avec ${r.pieces} pièce${r.pieces > 1 ? 's' : ''}` : '';
  const texte = r.complete
    ? `Ce bien était déjà dans vos biens : « ${r.nom} » est complété${avec}.`
    : `C'est fait : « ${r.nom} » est dans vos biens${avec}. ${r.lu ? "Relisez la fiche et finissez l'import avec l'assistant." : "Je n'ai pas su lire ses informations : racontez-le à l'assistant."}`;
  return { titre, texte, lien: `/MandataireBiens?bien=proprietaire:${r.proprietaire_id}` };
}
