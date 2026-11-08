import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-dossier-vente-'));
const { Records } = await import('./db.js');
const V = await import('./dossier-vente.js');
const P = await import('./mandataire-portes.js');
const { statutDuBien } = await import('../src/lib/biens-mandataire.js');

const AUJ = new Date('2026-10-27T10:00:00Z');

test('une pièce se range d’après son nom de fichier', () => {
  assert.equal(V.categorieDuNom('Bail commercial signé.pdf'), 'bail');
  assert.equal(V.categorieDuNom('avenant_2.pdf'), 'bail');
  assert.equal(V.categorieDuNom('Quittance-septembre.pdf'), 'quittances');
  assert.equal(V.categorieDuNom('TF 2025.pdf'), 'taxe_fonciere');
  assert.equal(V.categorieDuNom('DPE local.pdf'), 'diagnostics');
  assert.equal(V.categorieDuNom('PV AG 2024.pdf'), 'copropriete');
  assert.equal(V.categorieDuNom('Appel de charges T3.pdf'), 'copropriete', 'les charges vont avec la copropriété');
  assert.equal(V.categorieDuNom('extrait kbis.pdf'), null, 'plus de case Kbis pour des murs');
  assert.equal(V.categorieDuNom('extrait kbis.pdf', 'fonds_commerce'), 'kbis_fonds');
  assert.equal(V.categorieDuNom('IMG_2034.jpg'), null);
});

test('le droit de préférence : à notifier, un mois pour répondre, les exceptions', () => {
  assert.equal(V.etatPreference({}, { occupe: true }).statut, 'a_notifier');
  assert.equal(V.etatPreference({}, { occupe: true }).ok_pour_vente, false);
  assert.equal(V.etatPreference({}, { occupe: false }).statut, 'ne_s_applique_pas');
  assert.equal(V.etatPreference({ exception: 'immeuble' }, { occupe: true }).ok_pour_vente, true);
  const n = V.etatPreference({ notifie_le: '2026-10-20T00:00:00.000Z' }, { occupe: true, aujourdhui: AUJ });
  assert.equal(n.statut, 'notifie');
  assert.equal(n.fin_delai.slice(0, 10), '2026-11-20');
  assert.equal(V.etatPreference({ notifie_le: '2026-09-01T00:00:00.000Z' }, { aujourdhui: AUJ }).statut, 'expire');
  assert.equal(V.etatPreference({ notifie_le: '2026-10-20T00:00:00.000Z', reponse: 'accepte' }).ok_pour_vente, false);
  const c = V.courrierPreference({ locataire: 'SARL Fournil', prix: 680000 });
  assert.match(c, /680 000 €, hors honoraires/);
  assert.match(c, /délai d'un mois/);
  assert.match(c, /quatre premiers alinéas/);
});

test('les points des pièces : sans le critère d’investisseur, avec le terme du bail', () => {
  const synth = { signalements: [
    { cle: 'bail.tva', niveau: 'signale', onglet_titre: 'Bail', ligne: 'Loyer assujetti à TVA', motif: 'Loyer non assujetti à la TVA.' },
    { cle: 'bien.rendement', niveau: 'bloquant', onglet_titre: 'Bien', ligne: 'Rendement brut' },
  ] };
  const pts = V.pointsDesPieces(synth, { echeance: 'du 01/01/2019 au 31/12/2027', aujourdhui: AUJ });
  assert.deepEqual(pts.map((p) => p.cle), ['bail.tva', 'bail.terme']);
  assert.equal(V.pointsDesPieces(synth, { echeance: 'du 01/01/2024 au 31/12/2032', aujourdhui: AUJ }).length, 1);
});

test('« Mettre en vente » attend les pièces obligatoires seules ; le reste se règle avant une offre (7 nov. 2026)', () => {
  const lignes = (recues) => ({ lignes: P.PIECES.map((p) => ({ ...p, recue: recues.includes(p.cle), fichiers: [] })) });
  const pref = V.etatPreference({ exception: 'libre' });
  const dossier = { points_vente: {} };
  const manque = V.etatDuDossier({ dossier, checklist: lignes(['bail']), preference: pref });
  assert.equal(manque.pret, false);
  assert.match(manque.phrase, /Il manque trois dernières quittances/);
  const toutes = ['bail', 'quittances', 'diagnostics', 'taxe_fonciere'];
  const bloque = V.etatDuDossier({ dossier, checklist: lignes(toutes), points: [{ cle: 'x', niveau: 'bloquant', onglet: 'Bail' }], preference: pref });
  assert.equal(bloque.pret, true, 'un point bloquant se règle avant une offre');
  assert.match(bloque.avant_offre.join(' '), /1 point bloquant/);
  assert.equal(bloque.pieces.find((p) => p.cle === 'bail').etat, 'a_verifier');
  const traite = V.etatDuDossier({ dossier: { points_vente: { x: { decision: 'traite' } } }, checklist: lignes(toutes), points: [{ cle: 'x', niveau: 'bloquant', onglet: 'Bail' }], preference: pref });
  assert.deepEqual(traite.avant_offre, []);
  const aNotifier = V.etatDuDossier({ dossier, checklist: lignes(toutes), preference: V.etatPreference({}, { occupe: true }) });
  assert.equal(aNotifier.pret, true);
  assert.match(aNotifier.avant_offre.join(' '), /droit de préférence/);
  assert.equal(V.etatDuDossier({ dossier, checklist: lignes(toutes), lecture: 'en_cours', preference: pref }).pret, true);
});

test('de bout en bout : préférence notée, mise en vente par le mandataire, sans analyste', async () => {
  const user = { email: 'lucie@kpartners.fr', role: 'mandataire' };
  const { dossier: d } = P.creerDossier({ bien: 'Boulangerie du Pont' }, user);
  const docs = Object.fromEntries(['bail', 'quittances', 'diagnostics', 'taxe_fonciere'].map((k) => [k, [{ nom: `${k}.pdf`, url: `/uploads/${k}.pdf` }]]));
  Records.update('DossierMandataire', d.id, { documents: docs, statut: 'complet' });
  const avant = await V.vueDuDossier(d.id, user);
  assert.equal(avant.preference.statut, 'a_notifier', 'un bail déposé : le bien est loué');
  assert.equal(avant.pret, true, 'les pièces obligatoires suffisent à ouvrir la vente (7 nov. 2026)');
  assert.match(avant.avant_offre.join(' '), /droit de préférence/);
  assert.equal((await V.noterPreference(d.id, { notifie_le: '2030-01-01' }, user)).ok, false, 'pas dans le futur');
  assert.equal((await V.noterPreference(d.id, { notifie_le: '2026-10-20' }, user)).ok, true);
  assert.equal((await V.deciderPoint(d.id, 'bail.tva', 'expliquer', user)).ok, true);
  const r = await V.mettreEnVente(d.id, user);
  assert.equal(r.ok, true);
  assert.equal(r.dossier.statut, 'go');
  assert.equal(r.marche.statut, 'preparation');
  assert.equal(statutDuBien({ dossier: Records.get('DossierMandataire', d.id) }), 'En vente');
  assert.equal((await V.mettreEnVente(d.id, user)).deja, true);
  assert.equal(Records.list('MiseEnMarche').filter((m) => m.dossier_id === d.id).length, 1);
  assert.equal(P.estTransfere({ deal_id: 'x', deal_lecture: true, statut: 'complet' }), false, 'la lecture des pièces n’est pas un transfert');
});

test('L\'Assistant KPartners propose le geste suivant, dans l’ordre du travail', () => {
  const base = { pieces: [{ cle: 'bail', requise: true, etat: 'manquante' }], points: [], preference: { statut: 'ne_s_applique_pas' }, pret: false };
  assert.equal(V.prochainsGestes(base)[0].cle, 'premier_mail');
  assert.equal(V.prochainsGestes(base, { depot: { propose_le: '2026-10-20T00:00:00Z' }, aujourdhui: AUJ })[0].cle, 'relance');
  assert.equal(V.prochainsGestes(base, { depot: { propose_le: '2026-10-26T00:00:00Z' }, aujourdhui: AUJ }).length, 0, 'pas de relance le lendemain');
  const pret = { pieces: [], points: [{ cle: 'x', decision: null }], preference: { statut: 'a_notifier' }, pret: true };
  assert.deepEqual(V.prochainsGestes(pret).map((g) => g.cle), ['vente', 'preference', 'points']);
  assert.equal(V.prochainsGestes({ ...base, preference: { statut: 'a_notifier' } })[0].cle, 'preference', 'la notification au locataire en premier');
  const m = V.mailVendeur({ bien: 'Boulangerie', proprietaire: 'M. Martin', manquantes: ['Bail commercial'], url: 'https://x/DepotVendeur?jeton=abc' });
  assert.match(m.corps, /Bonjour M\. Martin/);
  assert.match(m.corps, /- Bail commercial/);
  assert.match(m.corps, /jeton=abc/);
  assert.match(V.mailVendeur({ genre: 'relance', bien: 'B', url: 'u' }).objet, /manquent encore/);
});

test('le vendeur dépose par son lien ; Assistant KPartners écrit le mail avec ce lien', async () => {
  const user = { email: 'lucie@kpartners.fr', role: 'mandataire' };
  const { dossier: d } = P.creerDossier({ bien: 'Fleuriste du Port', proprietaire: 'Mme Roy', proprietaire_email: 'roy@exemple.fr' }, user);
  assert.equal(V.dossierDuJeton('court'), null);
  const r = await V.executerOutilDossier({ name: 'mail_vendeur', input: { genre: 'premier' } }, user, { dossier_vente_id: d.id });
  assert.equal(r.ok, true);
  assert.equal(r.brouillon.destinataire, 'roy@exemple.fr');
  assert.match(r.brouillon.corps, /DepotVendeur\?jeton=/);
  const jeton = Records.get('DossierMandataire', d.id).depot.jeton;
  const vue = await V.vueVendeur(jeton);
  assert.equal(vue.ok, true);
  assert.equal(vue.points, undefined, 'le vendeur ne voit pas les points');
  assert.ok(Records.get('DossierMandataire', d.id).depot.ouvert_le);
  const dep = await V.deposerParLeVendeur(jeton, [{ nom: 'Bail signé 2019.pdf', url: '/uploads/b.pdf' }, { nom: 'IMG_0001.jpg', url: '/uploads/i.jpg' }]);
  assert.equal(dep.ok, true);
  const apres = Records.get('DossierMandataire', d.id);
  assert.equal(apres.documents.bail.length, 1);
  assert.equal(apres.documents.autres.length, 1, 'ce que rien ne reconnaît va dans Autres documents');
  assert.equal(apres.depot.deposes, 2);
  assert.ok(Records.list('Notification').some((n) => n.pour === user.email && /Le vendeur a déposé 2 pièces/.test(n.titre)));
  const relance = await V.executerOutilDossier({ name: 'mail_vendeur', input: { genre: 'relance', corps: 'Petit rappel.' } }, user, { dossier_vente_id: d.id });
  assert.match(relance.brouillon.corps, /^Petit rappel\.[\s\S]*jeton=/, 'le lien est ajouté à un texte réécrit');
  assert.equal((await V.executerOutilDossier({ name: 'mettre_en_vente', input: {} }, user, { dossier_vente_id: d.id })).ok, false, 'pas prêt');
  assert.equal((await V.executerOutilDossier({ name: 'dossier_de_vente', input: {} }, { email: 'autre@kpartners.fr' }, { dossier_vente_id: d.id })).ok, false, 'pas le dossier d’un autre');
  Records.update('DossierMandataire', d.id, { depot: { ...apres.depot, expire_le: '2020-01-01T00:00:00.000Z' } });
  assert.equal(V.dossierDuJeton(jeton), null, 'un lien expiré ne sert plus');
});

test('la veille : premier mail, puis relance après trois jours sans pièce, jamais deux fois', async () => {
  const v = { pieces: [{ cle: 'pv', mot: 'PV des AG', requise: true, etat: 'manquante' }] };
  assert.equal(V.mailAPreparer(v, null).genre, 'premier');
  assert.equal(V.mailAPreparer(v, { propose_le: '2026-10-26T10:00:00Z' }, { aujourdhui: AUJ }), null, 'un jour seulement');
  const r = V.mailAPreparer(v, { propose_le: '2026-10-24T10:00:00Z' }, { aujourdhui: AUJ });
  assert.equal(r.genre, 'relance');
  assert.match(r.raison, /pv des AG depuis 3 jours/i);
  assert.equal(V.mailAPreparer(v, { propose_le: '2026-10-20T10:00:00Z', dernier_depot_le: '2026-10-26T10:00:00Z' }, { aujourdhui: AUJ }), null, 'le vendeur vient de déposer');
  assert.equal(V.mailAPreparer(v, null, { deja: { genre: 'premier' } }), null, 'un mail attend déjà');
  assert.equal(V.mailAPreparer({ pieces: [] }, null), null, 'rien ne manque');

  const user = { email: 'paul@kpartners.fr', role: 'mandataire' };
  const { dossier: d } = P.creerDossier({ bien: 'Opticien', proprietaire: 'M. Lenoir', proprietaire_email: 'lenoir@exemple.fr' }, user);
  Records.update('DossierMandataire', d.id, { mandat_id: 'm1' });
  const mail = await V.veilleDuDossier(d.id);
  assert.equal(mail.genre, 'premier');
  assert.match(mail.corps, /DepotVendeur\?jeton=/);
  assert.equal(await V.veilleDuDossier(d.id), null, 'pas deux fois');
  assert.ok(Records.list('Notification').some((n) => n.pour === user.email && /Envoyer \?/.test(n.texte)));
  const sans = await V.envoyerMailVendeur(d.id, user);
  assert.equal(sans.sans_boite, true, 'sans boîte connectée, rien ne part');
  assert.equal((await V.envoyerMailVendeur(d.id, user, { marquer: true })).ok, true);
  const apres = Records.get('DossierMandataire', d.id);
  assert.ok(apres.depot.propose_le);
  assert.equal(apres.mail_propose, null);
  assert.equal((await V.ecarterMailVendeur(d.id, user)).ok, true);
});

test('après le teaser : envoyé à Klocka, l’analyste coche l’avancement ; le mandataire ne coche rien', async () => {
  const user = { email: 'nina@kpartners.fr', role: 'mandataire' };
  const { dossier: d } = P.creerDossier({ bien: 'Caviste' }, user);
  const m = Records.create('MiseEnMarche', { mandataire_email: user.email, dossier_id: d.id, bien: 'Caviste', statut: 'preparation' });
  assert.equal((await V.choisirVoie(m.id, 'ailleurs', user)).ok, false);
  const r = await V.choisirVoie(m.id, 'klocka', user);
  assert.equal(r.ok, true);
  assert.equal(r.marche.voie, 'klocka');
  const apres = Records.get('DossierMandataire', d.id);
  assert.ok(apres.envoye_klocka_le);
  assert.equal(apres.equipe, true, 'l’équipe, pas un analyste');
  assert.equal(apres.analyste_email, undefined);
  assert.equal((await V.cocherAvancement(d.id, 'analyse', true, user)).ok, false, 'réservé à Klocka');
  const admin = { email: 'jules.b@klocka.immo', role: 'admin' };
  assert.equal((await V.cocherAvancement(d.id, 'analyse', true, admin)).ok, true);
  assert.equal((await V.cocherAvancement(d.id, 'presentation', true, admin)).ok, true);
  assert.equal((await V.cocherAvancement(d.id, 'presentation', false, admin)).avancement.presentation, undefined);
  assert.ok(Records.get('DossierMandataire', d.id).avancement.analyse);
  assert.equal((await V.cocherAvancement(d.id, 'offre', true, admin)).ok, true);
  assert.ok(Records.list('Notification').some((n) => n.pour === user.email && /Offre en cours/.test(n.titre)), 'le mandataire est prévenu du passage à l’offre');
  assert.ok(Records.list('MessageDossier').some((x) => x.dossier_id === d.id && /Avancement : Analyse\./.test(x.texte)));
});

test('la priorité des pièces, et le mail qui part tel quel (2 nov. 2026, Jules)', () => {
  const manquantes = [{ cle: 'taxe_fonciere', mot: 'Dernière taxe foncière' }, { cle: 'quittances', mot: 'Trois dernières quittances' }, { cle: 'pouvoirs', mot: 'Pouvoirs du gérant pour vendre' }];
  const p = V.prioriteDesPieces(manquantes);
  assert.equal(p.cle, 'quittances');
  assert.equal(V.prioriteDesPieces([]), null);
  const m = V.mailVendeur({ bien: 'Boulangerie', manquantes, priorite: p, url: 'https://x/DepotVendeur?jeton=abc' });
  assert.match(m.corps, /En priorité : trois dernières quittances \(elles prouvent que le loyer est bien payé\)\.\n\nEnsuite :\n- Dernière taxe foncière\n- Pouvoirs du gérant pour vendre/);
  assert.doesNotMatch(m.corps, /si vous l'avez/);
});

test('après trois relances sans la pièce : un appel, une seule fois', () => {
  const v = { pieces: [{ cle: 'pouvoirs', mot: 'Pouvoirs du gérant pour vendre', requise: true, etat: 'manquante' }] };
  const depot = { propose_le: '2026-10-01T10:00:00Z', relance_le: '2026-10-20T10:00:00Z', relances: 3 };
  const r = V.mailAPreparer(v, depot, { aujourdhui: AUJ });
  assert.equal(r.genre, 'appel');
  assert.match(r.raison, /^Pouvoirs du gérant pour vendre manque toujours après 3 relances\. Un appel/);
  assert.equal(V.mailAPreparer(v, { ...depot, appel_propose_le: '2026-10-25T10:00:00Z' }, { aujourdhui: AUJ }), null);
  assert.match(V.quoiDireAuTelephone({ proprietaire: 'M. Bernard', manquantes: ['Pouvoirs du gérant'] }), /^« Bonjour M\. Bernard[\s\S]*pouvoirs du gérant/);
});

test('le propriétaire dépose : ce que la lecture relève, puis ce qui manque, ou la Data room complète', () => {
  const v = {
    pret: false,
    pieces: [{ cle: 'bail', mot: 'Bail commercial', requise: true, etat: 'recue' }, { cle: 'taxe_fonciere', mot: 'Dernière taxe foncière', requise: true, etat: 'recue' }, { cle: 'quittances', mot: 'Trois dernières quittances', requise: true, etat: 'manquante' }],
    points: [{ cle: 'bail.terme', onglet: 'Bail', ligne: 'Terme du bail', motif: 'Le bail se termine dans 8 mois : l’acheteur demandera si le locataire reste.', decision: null }],
  };
  const m = V.messagePiecesRecues(v, ['bail', 'bail', 'taxe_fonciere']);
  assert.match(m.contenu, /^Le propriétaire a déposé 2 pièces\./);
  assert.match(m.contenu, /- Bail commercial : reçu\. À voir : Le bail se termine dans 8 mois/);
  assert.match(m.contenu, /- Dernière taxe foncière : reçu\.$/m);
  assert.match(m.contenu, /Il manque encore trois dernières quittances\.$/);
  const fin = V.messagePiecesRecues({ ...v, pret: true, points: [] }, ['quittances']);
  assert.equal(fin, null, 'une pièce inconnue du dossier ne se dit pas');
  const complet = V.messagePiecesRecues({ ...v, pret: true, points: [] }, ['bail']);
  assert.match(complet.contenu, /Rien à signaler à la lecture\.[\s\S]*La Data room est complète/);
  assert.equal(complet.boutons[0].libelle, 'Mettre en vente');
});

test('la notification au locataire : un mail au propriétaire, prêt à envoyer à droite, la lettre dedans (3 nov. 2026, Jules)', async () => {
  const user = { email: 'nina@kpartners.fr', role: 'mandataire' };
  const { dossier: d } = P.creerDossier({ bien: 'Cave du Port', proprietaire: 'M. Leroy', proprietaire_email: 'leroy@exemple.fr' }, user);
  const r = await V.executerOutilDossier({ name: 'droit_de_preference', input: { action: 'courrier' } }, user, { dossier_vente_id: d.id });
  assert.equal(r.ok, true);
  assert.equal(r.courrier, undefined, 'plus de texte à recopier dans la réponse');
  assert.match(r.note, /NE RECOPIE NI LE MAIL NI LA LETTRE/);
  const mail = Records.get('DossierMandataire', d.id).mail_propose;
  assert.equal(mail.genre, 'preference');
  assert.equal(mail.a, 'leroy@exemple.fr');
  assert.match(mail.corps, /^Bonjour M\. Leroy,[\s\S]*recommandé avec accusé de réception[\s\S]*Objet : offre de vente du local/);
  assert.equal((await V.envoyerMailVendeur(d.id, user, { marquer: true })).genre, 'preference');
  const apres = Records.get('DossierMandataire', d.id);
  assert.ok(apres.preference.courrier_envoye_le);
  assert.equal(apres.depot?.propose_le, undefined, 'le premier mail des pièces n’est pas marqué parti');
  assert.match(V.etatPreference(apres.preference, { occupe: true }).phrase, /partie chez le propriétaire/);
});

test('le dossier de location : sans droit de préférence ni investisseurs, « Mettre en location » ouvre la Commercialisation seule (6 nov. 2026)', async () => {
  const user = { email: 'loc@kpartners.fr', role: 'mandataire' };
  const fiche = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Local rue Neuve', statut: 'rdv_pris', type_bien: 'murs_commerce', biens: { transaction: 'location' } });
  const mandat = Records.create('MandatMandataire', { mandataire_email: user.email, bien: 'Local rue Neuve', proprietaire_id: fiche.id, questionnaire: { bien_occupe: false } });
  const { dossier: d } = P.creerDossier({ bien: 'Local rue Neuve' }, user);
  Records.update('DossierMandataire', d.id, { mandat_id: mandat.id });
  assert.equal(P.transactionDuDossier(Records.get('DossierMandataire', d.id)), 'location');
  const avant = await V.vueDuDossier(d.id, user);
  assert.equal(avant.location, true);
  assert.equal(avant.preference, null, 'pas de droit de préférence');
  assert.equal(avant.courrier, null);
  assert.ok(!avant.pieces.some((p) => ['bail', 'quittances', 'bilans'].includes(p.cle)));
  assert.match(avant.phrase, /Il manque diagnostics.*plans et surfaces/);
  assert.ok(avant.points.some((p) => p.cle === 'copropriete.destination'), 'la destination face à la copropriété');
  assert.equal(avant.decisions.expliquer, 'À expliquer au candidat');
  assert.equal((await V.noterPreference(d.id, { exception: 'libre' }, user)).ok, false);
  const docs = { diagnostics: [{ nom: 'DPE.pdf', url: '/uploads/dpe.pdf' }], plans: [{ nom: 'plans.pdf', url: '/uploads/plans.pdf' }] };
  Records.update('DossierMandataire', d.id, { documents: docs, statut: 'complet' });
  const pret = await V.vueDuDossier(d.id, user);
  assert.equal(pret.pret, true, 'la destination se vérifie, elle ne bloque pas');
  assert.equal(pret.gestes[0].libelle, 'Mettre en location');
  assert.match(V.cadreDuDossier(pret, Records.get('DossierMandataire', d.id)), /DOSSIER DE LOCATION/);
  const r = await V.mettreEnVente(d.id, user);
  assert.equal(r.ok, true);
  assert.equal(r.dossier.statut, 'go');
  assert.equal(r.marche.statut, 'preparation');
  const apres = Records.get('DossierMandataire', d.id);
  assert.equal(apres.deal_id, null, 'aucun dossier d’analyse pour l’équipe');
  assert.equal(apres.projet_id, undefined, 'aucun projet Klocka');
  assert.equal((await V.choisirVoie(r.marche.id, 'klocka', user)).ok, false, 'pas d’envoi à Klocka');
  const m = V.mailVendeur({ genre: 'premier', bien: 'Local rue Neuve', manquantes: ['Plans et surfaces'], url: 'https://x/d', location: true });
  assert.match(m.corps, /présenter votre local aux candidats/);
  assert.doesNotMatch(`${m.objet} ${m.corps}`, /investisseurs|vente/);
  assert.match(V.mailVendeur({ genre: 'relance', bien: 'B', manquantes: ['DPE'], url: 'u', location: true }).corps, /aux candidats/);
  assert.match(V.mailVendeur({ genre: 'relance', bien: 'B', manquantes: ['DPE'], url: 'u' }).corps, /aux investisseurs/, 'la vente ne change pas');
});
