// Les biens qu'un mandataire a déjà en mandat (31 oct. 2026, Jules, PLAN.md 3.2 : « fais ça pour nos biens »). Le PDF
// d'un mandat, son registre en Excel ou CSV, ou une liste collée : Haka lit, le mandataire relit, puis un tap crée les
// fiches dans Biens, à la bonne étape. Rien ne s'écrit avant la confirmation, et rien ne part vers Monday ou Twenty.
//
// Un mandat signé chez K Partners entre à l'étape Mandat faite (la suite : Commercialisation). Un mandat signé sous une
// autre enseigne reste à cette enseigne : le bien entre avec son prix (Avis de valeur fait) et la relance « Re-signer
// le mandat chez K Partners » un mois avant son échéance.

import { Records } from './db.js';
import { creerProprietaire, mesProprietaires } from './mandataire-espace.js';
import { lireCsv } from './acquereurs-mandataire.js';
import { lirePrix } from './bien-etapes.js';

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const maintenant = () => new Date().toISOString();

export const CHAMPS = ['proprietaire', 'telephone', 'email', 'commerce', 'activite', 'adresse', 'ville', 'prix', 'loyer_annuel', 'honoraires', 'numero', 'signe_le', 'echeance', 'exclusif', 'enseigne'];

const SCHEMA = {
  type: 'object',
  properties: { biens: { type: 'array', items: { type: 'object', properties: {
    proprietaire: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' },
    commerce: { type: 'string' }, activite: { type: 'string' }, adresse: { type: 'string' }, ville: { type: 'string' },
    prix: { type: 'number' }, loyer_annuel: { type: 'number' }, honoraires: { type: 'string' },
    numero: { type: 'string' }, signe_le: { type: 'string' }, echeance: { type: 'string' },
    exclusif: { type: 'boolean' }, enseigne: { type: 'string' },
  } } } },
  required: ['biens'],
};

const CONSIGNE = `Ce sont les mandats de vente d'un agent immobilier (murs de commerces). Rends un bien par mandat : le propriétaire (nom ou société), son téléphone et son e-mail, le commerce (enseigne ou activité du locataire), l'activité, l'adresse du local, la ville, le prix de vente en euros (« 450 k€ » = 450000), le loyer annuel en euros, les honoraires tels qu'écrits, le numéro du mandat, la date de signature et la date d'échéance (AAAA-MM-JJ ; une durée « 3 mois » se compte depuis la signature), s'il est exclusif, et l'agence ou le réseau sous lequel il est signé (celui qui tient la carte professionnelle). N'invente rien : un champ absent reste vide.`;

/** Pure : un mandat signé chez K Partners. Sans enseigne lue, on le suppose (le mandataire corrige à la relecture). */
export const chezKPartners = (enseigne) => !String(enseigne || '').trim() || /k ?partners|klocka/.test(sansAccents(enseigne));

const date = (v) => {
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};

// L'étape d'un bien importé (3 nov. 2026, Jules : « il fait un vocal à l'assistant et joint tous les documents ») :
// choisie à la relecture, plus seulement déduite de l'enseigne du mandat. `validee` : la dernière étape franchie
// (src/lib/biens-mandataire.js) ; un bien sous offre a fini sa commercialisation, un bien vendu a tout franchi.
export const ETAPES_IMPORT = {
  estimation: { mot: 'Avis de valeur fait', validee: 'avis_accepte', statut: 'rdv_pris' },
  mandat_kp: { mot: 'Mandat K Partners', validee: 'mandat', statut: 'mandat_signe' },
  mandat_ailleurs: { mot: 'Mandat dans une autre agence', validee: 'avis_accepte', statut: 'rdv_pris' },
  offre: { mot: 'Sous offre', validee: 'marche', statut: 'mandat_signe' },
  vente: { mot: 'Vendu', validee: 'vente', statut: 'mandat_signe' },
};
/** Pure : l'étape choisie, sinon celle que dit l'enseigne du mandat. */
export const etapeDuBien = (b) => (ETAPES_IMPORT[b?.etape] ? b.etape : b?.k_partners ? 'mandat_kp' : 'mandat_ailleurs');

/** Pure : un bien lu, nettoyé. Il faut au moins une adresse, un commerce ou un propriétaire. */
export function bienLu(b = {}) {
  const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
  const out = {
    proprietaire: txt(b.proprietaire), telephone: txt(b.telephone), email: txt(b.email)?.toLowerCase() || null,
    commerce: txt(b.commerce), activite: txt(b.activite), adresse: txt(b.adresse), ville: txt(b.ville),
    prix: lirePrix(b.prix), loyer_annuel: lirePrix(b.loyer_annuel), honoraires: txt(b.honoraires),
    numero: txt(b.numero), signe_le: date(b.signe_le), echeance: date(b.echeance),
    exclusif: b.exclusif === true || /^(oui|vrai|true|exclusif)/.test(sansAccents(b.exclusif)) ? true : b.exclusif === false ? false : null,
    enseigne: txt(b.enseigne),
    etape: ETAPES_IMPORT[b.etape] ? b.etape : null,
  };
  if (!out.adresse && !out.commerce && !out.proprietaire) return null;
  out.k_partners = typeof b.k_partners === 'boolean' ? b.k_partners : chezKPartners(out.enseigne);
  return out;
}

const cleDe = (b) => [
  b.numero ? `n:${sansAccents(b.numero)}` : null,
  b.adresse ? `a:${sansAccents(`${b.adresse} ${b.ville || ''}`).replace(/\W+/g, '')}` : null,
].filter(Boolean);

/** Pure : marque les biens déjà dans Biens (même numéro de mandat, ou même adresse et ville). */
export function marquerDoublons(biens = [], fiches = []) {
  const deja = new Set(fiches.flatMap((p) => cleDe({ numero: p.mandat_importe?.numero, adresse: p.adresse, ville: p.ville })));
  return biens.map((b) => ({ ...b, deja: cleDe(b).some((c) => deja.has(c)) }));
}

async function texteDuPdf(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try { return String((await parser.getText()).text || '').trim(); } finally { await parser.destroy().catch(() => {}); }
}

/** Lit un PDF de mandat, un registre (.xlsx, .csv) ou une liste collée ; rend les biens, sans rien enregistrer. */
export async function lireBiens({ buffer = null, nom = '', texte = '', mimetype = null } = {}, user, { llm = null, lireDocument = null } = {}) {
  let brut = '';
  // Une photo de mandat, ou un PDF scanné (1er nov. 2026, PLAN.md 3.2) : le modèle le lit comme une image, puis on
  // repart du texte recopié, comme pour une liste collée.
  const recopier = async (type) => {
    const lire = lireDocument || (await import('./llm.js')).generateFromDocument;
    return String(await lire({ buffer, mimetype: type, nom, prompt: 'Recopie tout le texte de ce mandat, de ce registre ou de cette liste de biens, tel quel, sans rien résumer ni ajouter.' }) || '').trim();
  };
  const image = /^image\//i.test(String(mimetype || '')) || /\.(jpe?g|png|webp|heic)$/i.test(nom);
  if (buffer && image) {
    if (/\.heic$/i.test(nom) || /heic/i.test(String(mimetype || ''))) return { ok: false, error: 'Photo au format HEIC : dans Réglages › Appareil photo › Formats, choisissez « Le plus compatible », ou envoyez une capture.' };
    brut = await recopier(mimetype || (/\.png$/i.test(nom) ? 'image/png' : 'image/jpeg'));
    if (brut.length < 20) return { ok: false, error: 'Je ne lis rien sur cette photo : reprenez-la plus nette, à plat, ou collez ses informations.' };
  } else if (buffer && /\.pdf$/i.test(nom)) {
    brut = await texteDuPdf(buffer);
    if (brut.length < 40) brut = await recopier('application/pdf');
    if (brut.length < 40) return { ok: false, error: 'Je ne lis rien dans ce PDF : envoyez le PDF d’origine, ou collez ses informations.' };
  } else if (buffer && /\.xls$/i.test(nom)) {
    return { ok: false, error: 'Ancien format Excel (.xls) : enregistrez le fichier en .xlsx ou en CSV.' };
  } else {
    const lignes = buffer && /\.xlsx$/i.test(nom) ? (await import('./xlsx.js')).lireXlsx(buffer) : lireCsv(buffer ? buffer.toString('utf8') : texte);
    brut = lignes.length ? lignes.slice(0, 200).map((l) => JSON.stringify(l)).join('\n') : String(buffer ? buffer.toString('utf8') : texte).trim();
  }
  if (!brut) return { ok: false, error: 'Joignez un fichier ou collez vos mandats.' };
  const invoke = llm || (await import('./llm.js')).invokeLLM;
  const r = await invoke({ prompt: `${CONSIGNE}\n\n${brut.slice(0, 40000)}`, response_json_schema: SCHEMA });
  const biens = (r?.biens || []).map(bienLu).filter(Boolean);
  if (!biens.length) return { ok: false, error: 'Aucun mandat reconnu : il faut au moins une adresse, un commerce ou un propriétaire.' };
  return { ok: true, biens: marquerDoublons(biens, mesProprietaires(user)) };
}

/** Pure : la date de la relance « Re-signer » : un mois avant l'échéance, ou tout de suite si elle est passée ou inconnue. */
export function relanceAvant(echeance, maintenantIso = maintenant()) {
  if (!echeance) return maintenantIso;
  const d = new Date(`${echeance}T09:00:00`);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString() < maintenantIso ? maintenantIso : d.toISOString();
}

/** Crée les biens relus par le mandataire ; un bien déjà dans Biens n'est pas doublé. */
export function importerBiens(liste = [], user) {
  const biens = marquerDoublons(liste.map(bienLu).filter(Boolean), mesProprietaires(user));
  const crees = []; let doublons = 0;
  for (const b of biens) {
    if (b.deja) { doublons += 1; continue; }
    const etape = etapeDuBien(b);
    const E = ETAPES_IMPORT[etape];
    const r = creerProprietaire({ nom: b.proprietaire, telephone: b.telephone, email: b.email, commerce: b.commerce || b.activite || b.adresse, activite: b.activite, ville: b.ville, adresse: b.adresse, statut: E.statut }, user);
    if (!r.ok) continue;
    const p = r.proprietaire;
    const mandat = { numero: b.numero, signe_le: b.signe_le, echeance: b.echeance, exclusif: b.exclusif, honoraires: b.honoraires, enseigne: b.enseigne, k_partners: etape !== 'mandat_ailleurs' && etape !== 'estimation', prix: b.prix, loyer_annuel: b.loyer_annuel, etape, importe_le: maintenant() };
    const le = (d) => d.split('-').reverse().join('/');
    const texte = etape === 'mandat_ailleurs'
      ? `Bien importé : mandat signé chez ${b.enseigne || 'une autre agence'}${b.echeance ? `, échéance le ${le(b.echeance)}` : ''}`
      : etape === 'mandat_kp'
      ? `Bien importé : mandat${b.numero ? ` n° ${b.numero}` : ''} signé${b.signe_le ? ` le ${le(b.signe_le)}` : ''}`
      : `Bien importé : ${E.mot.toLowerCase()}`;
    const resigner = etape === 'mandat_ailleurs';
    crees.push(Records.update('ProprietaireMandataire', p.id, {
      source: 'import',
      mandat_importe: mandat,
      biens: { ...(p.biens || {}), validee: E.validee, prix_accord: b.prix || null },
      prochaine_action: resigner ? 'Re-signer le mandat chez K Partners' : null,
      prochaine_action_le: resigner ? relanceAvant(b.echeance) : null,
      historique: [...(p.historique || []), { le: maintenant(), type: 'import', texte }],
    }));
  }
  return { ok: true, ajoutes: crees.length, doublons, biens: crees };
}

/**
 * Un bien raconté à l'assistant, ses pièces jointes au même message (3 nov. 2026, Jules) : la carte confirmée crée le
 * bien à l'étape choisie, garde ses pièces sur la fiche, et ouvre le fil du bien sur le récit et les pièces, que
 * l'assistant relira à chaque étape suivante.
 */
export async function importerUnBien({ bien = {}, etape = null, pieces = [], recit = '' } = {}, user) {
  const lu = bienLu({ ...bien, etape: etape || bien.etape });
  if (!lu) return { ok: false, error: 'Il faut au moins une adresse, un commerce ou un propriétaire.' };
  const r = importerBiens([lu], user);
  if (!r.ajoutes) return { ok: false, error: r.doublons ? 'Ce bien est déjà dans vos biens.' : 'Bien non créé.' };
  const p = r.biens[0];
  // Les pièces viennent du dépôt du chat (/uploads/…) : rien d'autre n'est accepté.
  const { categorieDuNom } = await import('./dossier-vente.js');
  const jointes = (Array.isArray(pieces) ? pieces : [])
    .filter((x) => x && /^\/uploads\/[\w.-]+$/.test(String(x.url || '')))
    .slice(0, 20)
    .map((x) => ({ nom: String(x.nom || 'pièce').slice(0, 200), url: x.url, mimetype: x.mimetype || null, categorie: categorieDuNom(x.nom), le: maintenant() }));
  const fiche = jointes.length ? Records.update('ProprietaireMandataire', p.id, { pieces_importees: jointes }) : p;
  const E = ETAPES_IMPORT[etapeDuBien(lu)];
  const { versLeFil } = await import('./bien-etapes.js');
  const le = maintenant();
  versLeFil(fiche, user, [
    // Les pièces s'écrivent en tête du message, comme le chat les garde (« 📎 a.pdf · b.jpg — le récit ») : l'écran les
    // redessine en cartes (src/lib/apercu-fichier.js, pieceDuTexte).
    { role: 'user', contenu: jointes.length ? `📎 ${jointes.map((x) => x.nom).join(' · ')}${String(recit || '').trim() ? ` — ${String(recit).trim()}` : ''}` : String(recit || '').trim() || 'Bien importé.', le, canal: 'import' },
    { role: 'assistant', contenu: `Bien créé à l'étape ${E.mot}${jointes.length ? `, avec ${jointes.length} pièce${jointes.length > 1 ? 's' : ''} : ${jointes.map((x) => x.nom).join(', ')}` : ''}.`, le, canal: 'import' },
  ]);
  return { ok: true, proprietaire: Records.get('ProprietaireMandataire', p.id), etape: etapeDuBien(lu), mot: E.mot };
}
