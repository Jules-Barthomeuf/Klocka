// Les visites d'acquéreurs (27 oct. 2026, Jules) : pendant la Commercialisation, chaque visite protège la commission
// (un bon de visite signé), informe le propriétaire (un compte rendu sans rien de l'acquéreur) et suit l'acquéreur (une
// note interne, une relance datée), sans que le mandataire écrive. Avant : la visite créée (à l'écran ou par Haka), le
// bon prérempli signé sur place au doigt, un rappel si l'heure approche sans bon. Après : il raconte au micro, Haka
// propose les deux documents, il valide ; le compte rendu part de sa messagerie. Rien ne part sans validation.

import { Records } from './db.js';

const VISITE = 'VisiteAcquereur';
const ACQUEREUR = 'AcquereurMandataire';
const PARIS = 'Europe/Paris';
const maintenant = () => new Date().toISOString();
const emailDe = (u) => String(u?.email || '').toLowerCase();
const texte = (v, max = 400) => (v == null ? null : String(v).trim().slice(0, max) || null);
const liste = (v, max = 8) => (Array.isArray(v) ? v.map((x) => texte(x, 300)).filter(Boolean).slice(0, max) : []);
export const INTERETS = ['fort', 'moyen', 'nul'];

const sienne = (id, user) => {
  const v = Records.get(VISITE, id);
  return v && (v.mandataire_email === emailDe(user) || user?.role === 'admin') ? v : null;
};

/** Pure : où en est le bon d'une visite : signé, à signer, ou en retard (l'heure est passée sans bon). */
export function etatDuBon(v, quand = Date.now()) {
  if (v?.bon?.signe_le) return 'signe';
  return Date.parse(v?.quand || '') <= quand ? 'manquant' : 'a_signer';
}

/** Pure : l'acquéreur tel que le mandataire le voit (un client Klocka reste une référence, jamais son nom). */
export function nomAcquereur(v) {
  const a = v?.acquereur || {};
  return a.nom || a.reference || 'Acquéreur';
}

/** Le texte du bon de visite, prérempli (le visiteur écrit son nom et signe sur place). */
export function texteDuBon(v, signataire = {}) {
  const le = new Date(v.quand || Date.now());
  const date = le.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS });
  const heure = le.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).replace(':', ' h ');
  const qui = v.bon?.nom || '…';
  const par = [signataire.nom, signataire.qualite ? `${signataire.qualite} du réseau K Partners` : 'mandataire du réseau K Partners'].filter(Boolean).join(', ');
  return {
    titre: 'Bon de visite',
    lignes: [
      `Je soussigné(e) ${qui}, reconnais avoir visité le ${date} à ${heure}, par l'intermédiaire de ${par}, le bien suivant :`,
      [v.bien?.titre, v.bien?.adresse].filter(Boolean).join(', '),
      "Je reconnais que ce bien m'a été présenté par K Partners. En cas d'acquisition, directement ou par une personne ou une société interposée, je m'engage à ne traiter que par son intermédiaire, et à ne pas traiter directement avec le propriétaire ni par un autre intermédiaire pendant la durée du mandat et les douze mois qui suivent son expiration.",
      `Fait le ${date}.`,
    ],
  };
}

/**
 * Pure : le compte rendu au propriétaire, nettoyé de ce qui appartient à l'acquéreur : son nom (et celui de sa société),
 * son budget, son financement. Une phrase qui en parle disparaît ; le nom devient « l'acquéreur ».
 */
export function anonymiser(cr = {}, acquereur = {}) {
  const noms = [acquereur.nom, acquereur.societe].filter(Boolean)
    .flatMap((n) => [n, ...String(n).split(/\s+/)]).filter((m) => String(m).length >= 3)
    .sort((a, b) => b.length - a.length);
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const CIVILITE = '(?:\\b(?:M\\.|Mme|Mlle|Monsieur|Madame)\\s+)?';
  const sansNom = (t) => noms.reduce((x, n) => x.replace(new RegExp(`${CIVILITE}\\b${echapper(n)}\\b`, 'gi'), "l'acquéreur"), String(t || ''))
    .replace(/l'acquéreur(\s+l'acquéreur)+/g, "l'acquéreur");
  const majuscule = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  // Le prix du bien peut se dire (une réserve sur le prix intéresse le propriétaire) ; les moyens de l'acquéreur, non.
  const SENSIBLE = /budget|financ|\bpr[eê]ts?\b|banque|bancaire|apport|emprunt|cr[ée]dit/i;
  const phrases = (t) => sansNom(t).split(/(?<=[.!?])\s+/).filter((s) => s && !SENSIBLE.test(s));
  const propre = (t) => phrases(t).map(majuscule).join(' ').trim() || null;
  const propres = (l) => (l || []).map(propre).filter(Boolean);
  return {
    date: cr.date || null,
    profil: phrases(cr.profil).join(' ').trim() || 'un acquéreur',
    impression: propre(cr.impression),
    points_positifs: propres(cr.points_positifs),
    reserves: propres(cr.reserves),
  };
}

/** Pure : le mail au propriétaire qui porte le compte rendu (vouvoiement, signé du mandataire). */
export function mailAuProprietaire(v, { proprietaire = {}, signataire = {} } = {}) {
  const cr = v.compte_rendu || {};
  const jour = new Date(v.quand || Date.now()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: PARIS });
  const puces = (l) => (l || []).map((x) => `- ${x}`).join('\n');
  const corps = [
    `${proprietaire.nom ? `Bonjour ${proprietaire.nom},` : 'Bonjour,'}`,
    '',
    `Voici le compte rendu de la visite de ${v.bien?.titre || 'votre bien'}, ${jour}.`,
    '',
    `Le visiteur : ${cr.profil || 'un acquéreur'}.`,
    cr.impression ? `Impression générale : ${cr.impression}` : null,
    cr.points_positifs?.length ? `\nCe qui lui a plu :\n${puces(cr.points_positifs)}` : null,
    cr.reserves?.length ? `\nSes réserves :\n${puces(cr.reserves)}` : null,
    '',
    'Je reviens vers vous dès que j’ai son retour.',
    '',
    'Bien cordialement,',
    [signataire.nom, signataire.telephone].filter(Boolean).join('\n') || null,
  ].filter((l) => l !== null).join('\n');
  return { a: proprietaire.email || null, objet: `Visite de ${v.bien?.titre || 'votre bien'} : compte rendu`, texte: corps };
}

/** Le propriétaire du bien d'une visite (nom, mail) : sur la fiche, le mandat ou le dossier. */
function proprietaireDe(v) {
  const p = v.bien?.proprietaire_id ? Records.get('ProprietaireMandataire', v.bien.proprietaire_id) : null;
  const m = v.bien?.mandat_id ? Records.get('MandatMandataire', v.bien.mandat_id) : null;
  const d = v.bien?.dossier_id ? Records.get('DossierMandataire', v.bien.dossier_id) : null;
  return { nom: p?.nom || m?.vendeur || d?.proprietaire || null, email: p?.email || m?.questionnaire?.vendeur_email || d?.proprietaire_email || null };
}

const signataireDe = async (user) => (await import('./mandataire-avis.js')).signataire(user);

/** Pure : ce que l'écran lit d'une visite (sans la signature, lourde : elle vient avec la visite ouverte). */
export function vue(v, { complete = false } = {}) {
  const { signature, ...bon } = v.bon || {};
  return { ...v, bon: complete ? v.bon || null : { ...bon, a_signature: !!signature }, etat_bon: etatDuBon(v), acquereur_nom: nomAcquereur(v) };
}

export async function mesVisites(user) {
  await exemplesVisites(user);
  return Records.list(VISITE).filter((v) => v.mandataire_email === emailDe(user)).sort((a, b) => String(b.quand).localeCompare(String(a.quand))).map((v) => vue(v));
}

/** Les acquéreurs qu'il peut choisir : les siens (nommés), et les clients de Klocka (par leur référence). */
export async function acquereursDe(user) {
  const siens = Records.list(ACQUEREUR).filter((a) => a.mandataire_email === emailDe(user)).map((a) => ({ id: a.id, nom: a.nom, telephone: a.telephone || null, email: a.email || null }));
  const { demandesVisibles } = await import('./mandataire-espace.js');
  const klocka = demandesVisibles().map((d) => ({ demande_id: d.id, reference: d.reference, profil: d.profil }));
  return { siens, klocka };
}

/** Pure : le bien d'une visite, depuis un bien de Biens (ses identifiants et son titre). */
export function bienDeVisite(b = {}) {
  const ids = (b.ids || [b.cle]).filter(Boolean);
  const de = (k) => ids.find((x) => x.startsWith(`${k}:`))?.split(':')[1] || null;
  return { cles: ids, titre: texte(b.titre, 200) || 'Bien', adresse: texte(b.adresse, 300), proprietaire_id: de('proprietaire'), mandat_id: de('mandat'), dossier_id: de('dossier'), marche_id: de('marche'), estimation_id: de('estimation') };
}

/** Une visite : le bien, l'acquéreur (le sien, un nouveau, ou un client de Klocka) et l'heure. */
export async function creerVisite({ bien, acquereur = {}, quand } = {}, user) {
  if (!bien?.cles?.length && !bien?.ids?.length && !bien?.cle) return { ok: false, error: 'Quel bien ?' };
  const le = Date.parse(quand || '');
  if (!Number.isFinite(le)) return { ok: false, error: 'Quand a lieu la visite ?' };
  let a = null;
  if (acquereur.acquereur_id) {
    const x = Records.get(ACQUEREUR, acquereur.acquereur_id);
    if (!x || x.mandataire_email !== emailDe(user)) return { ok: false, error: 'Acquéreur introuvable.' };
    a = { acquereur_id: x.id, nom: x.nom, telephone: x.telephone || null, email: x.email || null };
  } else if (acquereur.demande_id) {
    const { demandesVisibles } = await import('./mandataire-espace.js');
    const d = demandesVisibles().find((x) => x.id === acquereur.demande_id);
    if (!d) return { ok: false, error: 'Client introuvable.' };
    a = { demande_id: d.id, reference: d.reference, profil: d.profil || null };
  } else if (texte(acquereur.nom)) {
    const x = Records.create(ACQUEREUR, { mandataire_email: emailDe(user), nom: texte(acquereur.nom, 120), telephone: texte(acquereur.telephone, 40), email: texte(acquereur.email, 160)?.toLowerCase() || null, historique: [], cree_le: maintenant() });
    a = { acquereur_id: x.id, nom: x.nom, telephone: x.telephone, email: x.email };
  } else return { ok: false, error: "Qui visite ? Choisissez un acquéreur ou donnez son nom." };
  const v = Records.create(VISITE, {
    mandataire_email: emailDe(user), bien: bien.cles ? bien : bienDeVisite(bien), acquereur: a, quand: new Date(le).toISOString(),
    bon: null, recit: null, proposition: null, note_interne: null, compte_rendu: null, valide_le: null, envoi: null,
    statut: 'prevue', cree_le: maintenant(), historique: [{ le: maintenant(), par: emailDe(user), action: 'visite créée' }],
  });
  return { ok: true, visite: vue(v) };
}

/** Le bon signé sur place : le nom écrit par le visiteur et sa signature au doigt (une image PNG). */
export function signerBon(id, { nom, signature } = {}, user) {
  const v = sienne(id, user);
  if (!v) return { ok: false, error: 'Visite introuvable.' };
  if (!texte(nom)) return { ok: false, error: 'Le visiteur écrit son nom.' };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(signature || '')) || String(signature).length > 400_000) return { ok: false, error: 'La signature est manquante.' };
  const bon = { nom: texte(nom, 120), signature, signe_le: maintenant() };
  return { ok: true, visite: vue(Records.update(VISITE, id, { bon, historique: [...(v.historique || []), { le: bon.signe_le, par: emailDe(user), action: `bon de visite signé par ${bon.nom}` }] }), { complete: true }) };
}

export function lireVisite(id, user) {
  const v = sienne(id, user);
  return v ? { ok: true, visite: vue(v, { complete: true }) } : { ok: false, error: 'Visite introuvable.' };
}

/**
 * Le récit de la visite (dicté ou écrit) : Haka propose la note interne et le compte rendu au propriétaire ; rien
 * n'est gardé comme validé avant le geste du mandataire.
 */
export async function lireRecit(id, { texte: dit0 = null, audio = null } = {}, user, { llm = null } = {}) {
  const v = sienne(id, user);
  if (!v) return { ok: false, error: 'Visite introuvable.' };
  let dit = String(dit0 || '').trim();
  if (!dit && audio) {
    const { transcrire } = await import('./prospection/appel.js');
    try { dit = String(await transcrire(audio) || '').trim(); } catch (e) { return { ok: false, error: `Transcription impossible : ${e?.message || e}. Écrivez-le en quelques phrases.` }; }
  }
  if (!dit) return { ok: false, error: 'Racontez la visite : sa réaction, ce qui lui a plu, ses objections, son budget, la suite.' };
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS });
  const invoquer = llm || (await import('./llm.js')).invokeLLM;
  const { mesurer } = await import('./llm-couts.js');
  const profil = v.acquereur?.profil || null;
  const { resultat: lu } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invoquer({
    prompt:
      `Un mandataire immobilier sort de la visite de ${v.bien?.titre || 'un bien'} avec un acquéreur (${nomAcquereur(v)}${profil ? `, ${profil}` : ''}). Nous sommes le ${aujourdhui}.\n\nCe qu'il raconte :\n« ${dit.slice(0, 8000)} »\n\nRéponds en JSON, en français, sans rien inventer (une information absente vaut null ou une liste vide) :\n` +
      `- compris : une phrase au mandataire (« vous »), ce que tu retiens.\n` +
      `- interet : fort, moyen ou nul.\n- reaction : sa réaction, une phrase.\n- points_positifs : ce qui lui a plu.\n- objections : ses objections, chacune courte.\n` +
      `- budget, financement, delai, autres_biens : ce qu'il en a dit, sinon null.\n- prochaine_etape : la suite convenue, une phrase.\n` +
      `- relance : { quoi: « Rappeler M. X pour son retour », le: AAAA-MM-JJ } ; sans date dite, dans trois jours.\n` +
      `- compte_rendu : pour le propriétaire, { profil: le visiteur anonymisé (« investisseur particulier », « enseigne nationale », « commerçant du quartier »), impression: une ou deux phrases, points_positifs: liste, reserves: liste }. JAMAIS le nom de l'acquéreur, son budget, son financement ni ses autres pistes.`,
    response_json_schema: {
      type: 'object',
      properties: {
        compris: { type: 'string' }, interet: { type: 'string' }, reaction: { type: ['string', 'null'] },
        points_positifs: { type: 'array', items: { type: 'string' } }, objections: { type: 'array', items: { type: 'string' } },
        budget: { type: ['string', 'null'] }, financement: { type: ['string', 'null'] }, delai: { type: ['string', 'null'] }, autres_biens: { type: ['string', 'null'] },
        prochaine_etape: { type: ['string', 'null'] },
        relance: { type: ['object', 'null'], properties: { quoi: { type: 'string' }, le: { type: ['string', 'null'] } } },
        compte_rendu: { type: 'object', properties: { profil: { type: 'string' }, impression: { type: 'string' }, points_positifs: { type: 'array', items: { type: 'string' } }, reserves: { type: 'array', items: { type: 'string' } } } },
      },
      required: ['compris', 'interet', 'compte_rendu'],
    },
  }));
  if (!lu || typeof lu !== 'object') return { ok: false, error: "Haka n'a pas pu le lire : réessayez, ou racontez-le autrement." };
  const proposition = propositionDe(lu, v);
  const r = Records.update(VISITE, id, { recit: { texte: dit.slice(0, 8000), le: maintenant() }, proposition, statut: v.valide_le ? v.statut : 'racontee' });
  return { ok: true, compris: texte(lu.compris, 400), visite: vue(r, { complete: true }) };
}

/** Pure : la lecture de Haka mise en forme des deux documents (le compte rendu déjà anonymisé). */
export function propositionDe(lu = {}, v = {}) {
  const dans3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const relanceLe = /^\d{4}-\d{2}-\d{2}$/.test(String(lu.relance?.le || '')) ? lu.relance.le : dans3;
  return {
    note_interne: {
      interet: INTERETS.includes(lu.interet) ? lu.interet : 'moyen',
      reaction: texte(lu.reaction), points_positifs: liste(lu.points_positifs), objections: liste(lu.objections),
      budget: texte(lu.budget, 200), financement: texte(lu.financement, 200), delai: texte(lu.delai, 200), autres_biens: texte(lu.autres_biens, 300),
      prochaine_etape: texte(lu.prochaine_etape), relance: { quoi: texte(lu.relance?.quoi, 200) || `Rappeler ${nomAcquereur(v)} pour son retour`, le: relanceLe },
    },
    compte_rendu: anonymiser({ ...(lu.compte_rendu || {}), date: v.quand || null, profil: lu.compte_rendu?.profil || v.acquereur?.profil }, v.acquereur || {}),
  };
}

/**
 * Le mandataire valide (les documents relus, corrigés s'il le faut) : ils sont gardés, la relance de l'acquéreur se
 * date, la note rejoint la fiche de l'acquéreur, et l'historique du bien le dit. Le compte rendu, lui, est relu une
 * dernière fois avant de partir (il repasse par l'anonymisation).
 */
export function validerVisite(id, { note_interne = null, compte_rendu = null } = {}, user) {
  const v = sienne(id, user);
  if (!v) return { ok: false, error: 'Visite introuvable.' };
  if (!v.proposition && !note_interne) return { ok: false, error: 'Rien à valider : racontez la visite d’abord.' };
  const base = v.proposition || {};
  const note = propositionDe({ ...(base.note_interne || {}), ...(note_interne || {}), compris: '', compte_rendu: {} }, v).note_interne;
  const cr = anonymiser({ ...(base.compte_rendu || {}), ...(compte_rendu || {}), date: v.quand }, v.acquereur || {});
  const le = maintenant();
  const nom = nomAcquereur(v);
  // La relance de l'acquéreur : une seule par visite, remplacée si on revalide.
  if (v.rappel_id) { const r = Records.get('Rappel', v.rappel_id); if (r && !r.fait_le) Records.delete('Rappel', r.id); }
  const rappel = Records.create('Rappel', {
    espace: 'mandataire', genre: 'relance', visite_id: v.id, acquereur_id: v.acquereur?.acquereur_id || null, demande_id: v.acquereur?.demande_id || null,
    nom, quoi: `${note.relance.quoi} (${v.bien?.titre || 'visite'})`, canal: 'appel', telephone: v.acquereur?.telephone || null,
    echeance: `${note.relance.le}T09:00:00.000Z`, cree_le: le, cree_par: emailDe(user), mandataire_email: emailDe(user), fait_le: null,
  });
  // La fiche de l'acquéreur : la note de chaque visite, dans l'ordre.
  const ligne = { le, visite_id: v.id, bien: v.bien?.titre || null, interet: note.interet, objections: note.objections, prochaine_etape: note.prochaine_etape };
  if (v.acquereur?.acquereur_id) {
    const a = Records.get(ACQUEREUR, v.acquereur.acquereur_id);
    if (a) Records.update(ACQUEREUR, a.id, { historique: [...(a.historique || []).filter((x) => x.visite_id !== v.id), ligne] });
  } else if (v.acquereur?.demande_id) {
    const d = Records.get('DemandeClient', v.acquereur.demande_id);
    if (d) Records.update('DemandeClient', d.id, { visites_mandataires: [...(d.visites_mandataires || []).filter((x) => x.visite_id !== v.id), { ...ligne, mandataire: emailDe(user), budget: note.budget, financement: note.financement }] });
  }
  // L'historique du bien : sa commercialisation, sinon sa fiche.
  const mot = `visite de ${nom} : intérêt ${note.interet}${note.objections.length ? `, ${note.objections.slice(0, 2).join(', ')}` : ''}`;
  const m = v.bien?.marche_id ? Records.get('MiseEnMarche', v.bien.marche_id) : null;
  const p = !m && v.bien?.proprietaire_id ? Records.get('ProprietaireMandataire', v.bien.proprietaire_id) : null;
  if (m) Records.update('MiseEnMarche', m.id, { historique: [...(m.historique || []), { le, par: emailDe(user), action: mot }] });
  else if (p) Records.update('ProprietaireMandataire', p.id, { historique: [...(p.historique || []), { le, quoi: mot, par: emailDe(user) }] });
  const r = Records.update(VISITE, id, { note_interne: note, compte_rendu: cr, valide_le: le, rappel_id: rappel.id, statut: 'validee', historique: [...(v.historique || []), { le, par: emailDe(user), action: 'documents validés' }] });
  return { ok: true, visite: vue(r, { complete: true }) };
}

/** Le mail au propriétaire, prêt à partir de la messagerie du mandataire (il le relit d'abord). */
export async function preparerMail(id, user) {
  const v = sienne(id, user);
  if (!v) return { ok: false, error: 'Visite introuvable.' };
  if (!v.valide_le) return { ok: false, error: 'Validez les documents avant d’écrire au propriétaire.' };
  return { ok: true, mail: mailAuProprietaire(v, { proprietaire: proprietaireDe(v), signataire: await signataireDe(user) }) };
}

/** Le mandataire dit que le compte rendu est parti. */
export function marquerEnvoye(id, { a = null } = {}, user) {
  const v = sienne(id, user);
  if (!v) return { ok: false, error: 'Visite introuvable.' };
  if (!v.valide_le) return { ok: false, error: 'Validez les documents d’abord.' };
  const le = maintenant();
  return { ok: true, visite: vue(Records.update(VISITE, id, { envoi: { a: texte(a, 200), le }, statut: 'envoyee', historique: [...(v.historique || []), { le, par: emailDe(user), action: 'compte rendu envoyé au propriétaire' }] }), { complete: true }) };
}

/** Le bon de visite d'une visite, à imprimer ou montrer (le texte et la signature). */
export async function bonDeVisite(id, user) {
  const v = sienne(id, user);
  if (!v) return { ok: false, error: 'Visite introuvable.' };
  return { ok: true, bon: { ...texteDuBon(v, await signataireDe(user)), signe_le: v.bon?.signe_le || null, signature: v.bon?.signature || null, nom: v.bon?.nom || null } };
}

/**
 * Deux visites d'exemple (27 oct. 2026), une fois par mandataire qui a des exemples, sur son bien d'exemple en
 * Commercialisation : une faite (bon signé, récit, documents à valider), une demain (bon à faire signer).
 */
export async function exemplesVisites(user) {
  const email = emailDe(user);
  const { Meta } = await import('./db.js');
  const cle = `mandataire-exemples-visites:${email}`;
  if (!email || process.env.NODE_TEST_CONTEXT || Meta.get(cle)) return 0;
  const biens = await biensDe(user);
  const b = biens.find((x) => x.marche?.exemple && x.marche?.statut === 'preparation');
  if (!b) return 0;
  Meta.set(cle, maintenant());
  const jour = (n, h) => { const d = new Date(Date.now() + n * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
  const base = { mandataire_email: email, exemple: true, bien: bienDeVisite(b), cree_le: maintenant(), envoi: null, note_interne: null, compte_rendu: null, valide_le: null };
  const a = Records.create(ACQUEREUR, { mandataire_email: email, exemple: true, nom: 'Paul Exemple', telephone: '06 00 00 00 09', email: null, historique: [], cree_le: maintenant() });
  const recit = 'Visite avec Paul Exemple, gérant de deux salles de sport. Il aime le bail de neuf ans et le parking. Il trouve le rendement un peu juste et veut voir les charges. Budget 900 k€, prêt en cours avec sa banque. Il visite aussi un local à Orange. Il revient vers moi lundi après avoir parlé à son comptable.';
  Records.create(VISITE, {
    ...base, acquereur: { acquereur_id: a.id, nom: a.nom, telephone: a.telephone, email: null }, quand: jour(-1, 9),
    bon: { nom: 'Paul Exemple', signature: null, signe_le: jour(-1, 9) }, recit: { texte: recit, le: jour(-1, 11) }, statut: 'racontee',
    proposition: propositionDe({
      interet: 'fort', reaction: 'Séduit par le bail et le parking', points_positifs: ['bail de neuf ans', 'parking'], objections: ['rendement un peu juste', 'charges à voir'],
      budget: '900 k€', financement: 'prêt en cours avec sa banque', delai: null, autres_biens: 'un local à Orange', prochaine_etape: 'Il revient lundi après avoir vu son comptable',
      relance: { quoi: 'Rappeler Paul Exemple pour son retour', le: jour(4, 9).slice(0, 10) },
      compte_rendu: { profil: 'exploitant de salles de sport', impression: 'Très bonne impression : le bail de neuf ans et le parking ont convaincu.', points_positifs: ['Le bail de neuf ans', 'Le parking'], reserves: ['Le rendement lui semble un peu juste', 'Il veut voir le détail des charges'] },
    }, { quand: jour(-1, 9), acquereur: { nom: 'Paul Exemple' } }),
    historique: [{ le: jour(-1, 9), par: email, action: 'exemple posé' }],
  });
  Records.create(VISITE, { ...base, acquereur: { nom: 'Claire Exemple', telephone: '06 00 00 00 10' }, quand: jour(1, 14), bon: null, recit: null, proposition: null, statut: 'prevue', historique: [{ le: maintenant(), par: email, action: 'exemple posé' }] });
  return 2;
}

// ---------------------------------------------------------------------------
// Haka : créer une visite, et la reconnaître quand on la raconte
// ---------------------------------------------------------------------------

const nz = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Les biens du mandataire (ceux de Biens), pour retrouver celui qu'il nomme. */
export async function biensDe(user) {
  const { regrouperBiens } = await import('../src/lib/biens-mandataire.js');
  const { dansBiens } = await import('./fiche-mandataire.js');
  const moi = emailDe(user);
  const a = (e) => Records.list(e).filter((x) => x.mandataire_email === moi);
  return regrouperBiens({ estimations: a('EstimationMandataire'), mandats: a('MandatMandataire'), dossiers: a('DossierMandataire'), marches: a('MiseEnMarche'), proprietaires: a('ProprietaireMandataire').filter(dansBiens) });
}

/** Pure : le bien qu'il nomme, parmi les siens ; « ambigu » quand plusieurs se valent. */
export function trouverBien(biens, qui) {
  const q = nz(qui).split(' ').filter((m) => m.length >= 3);
  if (!q.length) return null;
  const notes = biens.map((b) => [b, q.filter((m) => nz(`${b.titre} ${b.adresse || ''}`).includes(m)).length]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  if (!notes.length) return null;
  return notes.length === 1 || notes[0][1] > notes[1][1] ? notes[0][0] : 'ambigu';
}

/** Pure : la visite qu'il raconte : celle du bien nommé (ou de l'acquéreur), la plus proche de maintenant, pas encore validée. */
export function visiteRacontee(visites, { qui = null, acquereur = null } = {}, quand = Date.now()) {
  const q = nz(qui), a = nz(acquereur);
  const candidates = visites.filter((v) => !v.valide_le && Date.parse(v.quand) <= quand + 6 * 3600000)
    .filter((v) => (!q || nz(v.bien?.titre).includes(q) || q.split(' ').some((m) => m.length >= 3 && nz(v.bien?.titre).includes(m))) && (!a || nz(nomAcquereur(v)).includes(a) || a.includes(nz(nomAcquereur(v)))));
  return candidates.sort((x, y) => Math.abs(Date.parse(x.quand) - quand) - Math.abs(Date.parse(y.quand) - quand))[0] || null;
}

export const OUTILS_VISITE = [
  {
    name: 'noter_visite_acquereur',
    description:
      "Créer la visite d'un acquéreur sur un bien en Commercialisation (« je fais visiter la boulangerie Masséna à M. Durand jeudi 15 h », ou un mail d'acquéreur qui confirme une visite). Le bon de visite se prérempli ; il se signe sur place, sur le téléphone. Ce n'est pas la visite du propriétaire (Pré-visite) : celle-ci passe par noter_rdv.",
    input_schema: {
      type: 'object',
      properties: {
        bien: { type: 'string', description: 'Le bien visité, comme le mandataire le dit' },
        acquereur: { type: 'string', description: "Le nom de l'acquéreur, ou la référence d'un client Klocka (« AR »)" },
        telephone: { type: 'string' }, email: { type: 'string' },
        quand: { type: 'string', description: 'Date-heure de la visite, AAAA-MM-JJTHH:MM (heure de Paris)' },
      },
      required: ['bien', 'acquereur', 'quand'],
    },
  },
  {
    name: 'raconter_visite_acquereur',
    description:
      "Le mandataire raconte la visite d'un acquéreur qu'il vient de faire (réaction, points positifs, objections, intérêt, budget, financement, suite). Haka retrouve la visite et prépare la note interne et le compte rendu au propriétaire ; le mandataire les relit et les valide à l'écran, rien ne part avant. Passe tout ce qu'il a dit dans recit.",
    input_schema: {
      type: 'object',
      properties: {
        bien: { type: 'string', description: 'Le bien, s’il le nomme' },
        acquereur: { type: 'string', description: "L'acquéreur, s’il le nomme" },
        recit: { type: 'string', description: 'Tout ce que le mandataire a raconté, tel quel' },
      },
      required: ['recit'],
    },
  },
];
export const NOMS_OUTILS_VISITE = new Set(OUTILS_VISITE.map((o) => o.name));

const lienVisite = (v) => `/MandataireBiens?bien=${encodeURIComponent(v.bien?.cles?.[0] || '')}&etape=marche&visite=${v.id}`;

export async function executerOutilVisite(name, input = {}, user, { llm = null } = {}) {
  if (name === 'noter_visite_acquereur') {
    const b = trouverBien(await biensDe(user), input.bien);
    if (!b) return { ok: false, error: `Je ne trouve pas « ${input.bien} » dans vos biens.` };
    if (b === 'ambigu') return { ok: false, error: `Plusieurs biens répondent à « ${input.bien} » : lequel ?` };
    const acquereurs = await acquereursDe(user);
    const q = nz(input.acquereur);
    const sien = acquereurs.siens.find((x) => nz(x.nom) === q);
    const client = acquereurs.klocka.find((x) => nz(x.reference) === q);
    const r = await creerVisite({ bien: bienDeVisite(b), quand: input.quand, acquereur: sien ? { acquereur_id: sien.id } : client ? { demande_id: client.demande_id } : { nom: input.acquereur, telephone: input.telephone, email: input.email } }, user);
    if (!r.ok) return r;
    return { ok: true, cree: true, visite_id: r.visite.id, titre: `Visite notée : ${r.visite.acquereur_nom}`, pour: `${b.titre} · ${new Date(r.visite.quand).toLocaleString('fr-FR', { timeZone: PARIS, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · bon à signer sur place`, lien: lienVisite(r.visite) };
  }
  if (name === 'raconter_visite_acquereur') {
    const siennes = Records.list(VISITE).filter((v) => v.mandataire_email === emailDe(user));
    const v = visiteRacontee(siennes, { qui: input.bien, acquereur: input.acquereur });
    if (!v) return { ok: false, error: "Je ne trouve pas de visite d'acquéreur à raconter : créez-la d'abord (le bien, l'acquéreur, l'heure)." };
    const r = await lireRecit(v.id, { texte: input.recit }, user, { llm });
    if (!r.ok) return r;
    const bon = etatDuBon(v) === 'signe' ? 'bon signé' : 'attention : bon de visite non signé';
    return { ok: true, cree: true, visite_id: v.id, compris: r.compris, titre: `Compte rendu prêt : ${nomAcquereur(v)}`, pour: `${v.bien?.titre || ''} · à relire et valider · ${bon}`, lien: lienVisite(v) };
  }
  return { ok: false, error: `Outil inconnu : ${name}` };
}

// ---------------------------------------------------------------------------
// Le bon pas encore signé à l'approche de la visite
// ---------------------------------------------------------------------------

/** Une heure avant (et jusqu'à l'heure), une notification par visite dont le bon n'est pas signé. */
export async function tourDesBons(quand = new Date()) {
  const t = quand.getTime();
  const { notifier } = await import('./notifications.js');
  let n = 0;
  for (const v of Records.list(VISITE).filter((x) => !x.bon?.signe_le && !x.alerte_bon_le && Date.parse(x.quand) - t <= 3600000 && Date.parse(x.quand) - t > -3600000)) {
    const heure = new Date(v.quand).toLocaleTimeString('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    notifier({ pour: v.mandataire_email, titre: `Visite de ${heure} : le bon de visite n'est pas signé`, texte: `${v.bien?.titre || 'Le bien'} avec ${nomAcquereur(v)}. Faites-le signer sur votre téléphone avant d'entrer : sans bon, la commission n'est pas protégée.`, lien: lienVisite(v), action: 'Faire signer', genre: 'rdv', cle: `bon-visite:${v.id}` });
    Records.update(VISITE, v.id, { alerte_bon_le: maintenant() });
    n += 1;
  }
  return n;
}

/** Toutes les cinq minutes, sur Render (ou VISITES_BON=1 en local) ; VISITES_BON=0 l'arrête. */
export function planifier() {
  const actif = process.env.VISITES_BON === '1' || (!!process.env.RENDER && process.env.VISITES_BON !== '0');
  if (!actif) return null;
  const t = setInterval(() => { tourDesBons().catch((e) => console.error('[visites] bons :', e?.message || e)); }, 5 * 60 * 1000);
  t.unref?.();
  return t;
}
