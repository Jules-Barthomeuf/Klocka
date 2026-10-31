// Les 20 phrases de test de l'assistant K Partners (Haka côté mandataire, même moteur, pas le même nom) (31 oct. 2026, Jules, PLAN 2.3 ; le tableau est dans
// docs/haka-tests.md). Chaque phrase part au vrai assistant (discuter, le modèle de production) sur une base jetable :
// un mandataire et des fiches [TEST], recréés pour chaque phrase, et rien ne sort (Twenty CRM, Monday, mails,
// Drive, agenda, Data-B, Equimmox, MyNotary : coupés ; les gestes extérieurs simulés par ak/banc/garde.js).
// Le script vérifie l'action attendue dans la base (fiche ciblée, champs, statut, relance, rendez-vous) ou la
// question posée, puis affiche le score sur 20 et le détail de chaque échec.
//
//   npm run test:haka                    les 20 phrases
//   npm run test:haka -- --cas 1,8,13    quelques-unes
//
// Quand l'assistant prépare et demande « Je note ? » (principe 2), le script répond « Oui » une fois, comme le mandataire.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ICI = fileURLToPath(import.meta.url);
const RACINE = path.join(path.dirname(ICI), '..', '..');
const EMAIL = 'test.haka@kpartners.test';
const PARIS = 'Europe/Paris';

// Ce qui sortirait de la plateforme : vidé dans les processus du test (comme le banc d'AK, plus Twenty CRM et Google).
const COUPES = ['MONDAY_TOKEN', 'CRM_MONDAY_JETON', 'TWENTY_URL', 'TWENTY_API_KEY', 'CRM', 'MEMOIRE_TWENTY', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PASS',
  'GOOGLE_CLIENT_SECRET', 'GOOGLE_CHAT', 'GOOGLE_CHAT_WEBHOOK_DOSSIERS', 'GOOGLE_GMAIL_SEND', 'GOOGLE_DRIVE', 'APOLLO_API_KEY', 'DATAB_EMAIL', 'DATAB_MOT_DE_PASSE',
  'EQUIMMOX_EMAIL', 'EQUIMMOX_MOT_DE_PASSE', 'MYNOTARY_AGENT', 'MYNOTARY_EMAIL', 'MYNOTARY_MOT_DE_PASSE', 'MYNOTARY_CLE_API', 'EMAILING_REEL', 'RENDER', 'AK_COMPTE'];

// --- Les dates, à l'heure de Paris -------------------------------------------

const jourParis = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: PARIS });
const heureParis = (d) => Number(new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', timeZone: PARIS }).slice(0, 2));
const dansJours = (iso) => Math.round((Date.parse(`${jourParis(iso)}T12:00:00Z`) - Date.parse(`${jourParis(Date.now())}T12:00:00Z`)) / 86400000);
/** Le prochain jeudi : dit un jeudi, celui de la semaine suivante (règle de l'assistant). */
function prochainJeudi() {
  const auj = new Date(`${jourParis(Date.now())}T12:00:00Z`);
  const ecart = ((4 - auj.getUTCDay() + 7) % 7) || 7;
  return jourParis(new Date(auj.getTime() + ecart * 86400000));
}
const ilYa = (jours, heures = 0) => new Date(Date.now() - jours * 86400000 - heures * 3600000).toISOString();
/** Aujourd'hui à h heures de Paris, mais au moins dans 30 min et au plus à 23 h 30 : toujours aujourd'hui, toujours à venir. */
function plusTardAujourdhui(h) {
  const decalage = Date.parse(`${new Date().toLocaleString('sv-SE', { timeZone: PARIS }).replace(' ', 'T')}Z`) - Date.now();
  const minuit = Date.parse(`${jourParis(Date.now())}T00:00:00Z`) - decalage;
  return new Date(Math.min(Math.max(minuit + h * 3600000, Date.now() + 30 * 60000), minuit + 23.5 * 3600000)).toISOString();
}

// --- Les données [TEST] --------------------------------------------------------

const FICHES = {
  roux: { commerce: '[TEST] Boulangerie Roux', activite: 'boulangerie', adresse: '5 rue de la République', statut: 'a_appeler',
    sections: [{ titre: 'Loyer', texte: '24 000 € HT par an' }], sources: { 'section:loyer': { source: "l'exploitante", a_confirmer: true, le: ilYa(5) } },
    historique: [{ le: ilYa(5), type: 'note', texte: 'Fiche créée depuis la carte' }] },
  optique: { commerce: '[TEST] Optique Thuret', activite: 'opticien', adresse: '8 rue Thuret', statut: 'a_appeler', historique: [] },
  krys: { commerce: '[TEST] Krys Vision', activite: 'opticien', adresse: '21 rue Thuret', statut: 'a_appeler', historique: [] },
  fromagerie: { commerce: '[TEST] Fromagerie du Safranier', activite: 'fromagerie', adresse: '3 rue Sade', statut: 'a_appeler', historique: [] },
  tabac: { commerce: '[TEST] Tabac du Port', activite: 'tabac', adresse: '2 avenue de Verdun', statut: 'rdv_pris', nom: 'Mme Lefèvre', telephone: '06 22 33 44 55',
    historique: [{ le: ilYa(4), type: 'statut', texte: 'RDV pris' }] },
  pressing: { commerce: '[TEST] Pressing Masséna', activite: 'pressing', adresse: '14 rue Masséna', statut: 'rdv_pris', nom: 'M. Garcia', telephone: '06 33 44 55 66',
    biens: { validee: 'previsite', compte_rendu: { bien: { loyer_annuel: 26000 }, source: 'visite', le: ilYa(9) } }, historique: [{ le: ilYa(9), type: 'visite', texte: 'Visite faite, loyer 26 000 €' }] },
  cave: { commerce: '[TEST] Cave Girard', activite: 'caviste', adresse: '22 rue Gambetta', statut: 'rdv_pris', nom: 'M. Girard', telephone: '06 44 55 66 77', historique: [] },
  fleuriste: { commerce: '[TEST] Fleuriste Rosa', activite: 'fleuriste', adresse: '9 boulevard Wilson', statut: 'rdv_pris', nom: 'Mme Rosa', historique: [] },
  bijouterie: { commerce: '[TEST] Bijouterie Olive', activite: 'bijouterie', adresse: '4 rue Clemenceau', statut: 'contacte', nom: 'M. Olive', telephone: '06 55 66 77 88', historique: [] },
  cordonnerie: { commerce: '[TEST] Cordonnerie Sade', activite: 'cordonnerie', adresse: '11 rue Sade', statut: 'contacte', prochaine_action: 'Repasser voir le gérant', historique: [] },
};

async function semer() {
  const { Records, default: db } = await import('../db.js');
  Records.create('User', { email: EMAIL, full_name: '[TEST] Mandataire K Partners', role: 'mandataire' });
  Records.create('SecteurMandataire', { nom: '[TEST] Antibes', mandataire_email: EMAIL, unites: [{ nom: 'Antibes', niveau: 'commune', code: '06004' }], points: [], polygones: [] });
  const ids = {};
  for (const [cle, f] of Object.entries(FICHES)) {
    ids[cle] = Records.create('ProprietaireMandataire', { ville: 'Antibes', tentatives: 0, ...f, mandataire_email: EMAIL, cree_le: ilYa(6),
      ...(cle === 'cordonnerie' ? { prochaine_action_le: plusTardAujourdhui(11) } : {}) }).id;
  }
  ids.liste = Records.create('ListeMandataire', { mandataire_email: EMAIL, nom: 'Client 3', source: 'Off-market', cree_le: ilYa(6) }).id;
  Records.create('EstimationMandataire', { mandataire_email: EMAIL, proprietaire_id: ids.pressing, bien: '[TEST] Pressing Masséna', adresse: '14 rue Masséna, Antibes', statut: 'envoye',
    envoye_le: ilYa(3), cree_le: ilYa(8), rapport: { prix_bas: 380000, prix_haut: 430000 } });
  const rappel = (x) => Records.create('Rappel', { espace: 'mandataire', cree_par: EMAIL, cree_le: ilYa(2), fait_le: null, ...x });
  rappel({ genre: 'rdv', proprietaire_id: ids.tabac, avec: 'Mme Lefèvre', nom: 'Mme Lefèvre', quoi: 'RDV avec Mme Lefèvre', echeance: ilYa(0, 1.5) });
  rappel({ genre: 'rdv', proprietaire_id: ids.cave, avec: 'M. Girard', nom: 'M. Girard', quoi: 'RDV avec M. Girard', echeance: new Date(Date.now() + 2 * 86400000).toISOString() });
  rappel({ genre: 'rdv', proprietaire_id: ids.fleuriste, avec: 'Mme Rosa', nom: 'Mme Rosa', quoi: 'RDV avec Mme Rosa', lieu: '[TEST] Fleuriste Rosa', echeance: plusTardAujourdhui(16) });
  rappel({ genre: 'relance', proprietaire_id: ids.bijouterie, nom: 'M. Olive', quoi: 'Rappeler M. Olive ([TEST] Bijouterie Olive)', telephone: '06 55 66 77 88', echeance: plusTardAujourdhui(9) });
  Records.create('DemandeClient', { client_nom: 'Arnaud Rigaud', profil: 'Investisseur privé', type_commerce: 'Commerce de bouche', zones: ['Antibes'], budget_min: 300000, budget_max: 600000,
    rendement_min: 6, active: true, visible: true, ouverte_le: ilYa(20) });
  fs.writeFileSync(path.join(process.env.KLOCKA_DATA_DIR, 'ids.json'), JSON.stringify(ids));
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

// --- Les 20 cas ----------------------------------------------------------------

const montant = (n) => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, '$1[\\s\\u202f\\u00a0.]?'));
const textes = (x) => x.tours.map((t) => t.reponse).join('\n');
const derniere = (x) => x.tours.at(-1)?.reponse || '';
const outils = (x) => x.tours.flatMap((t) => t.outils.map((o) => o.outil));
const ECRITURES = new Set(['modifier_fiche', 'noter_relance', 'noter_rdv', 'resultat_appel', 'appel_sans_reponse', 'nouveau_contact', 'compte_rendu_visite', 'mettre_en_pause', 'demander_mandat', 'lancer_estimation', 'ranger_piece']);
const rienEcrit = (x) => {
  const e = [];
  if (x.nouveauxRappels().length) e.push(`${x.nouveauxRappels().length} rappel(s) créé(s) : ${x.nouveauxRappels().map((r) => r.quoi).join(' ; ')}`);
  if (x.fichesChangees().length) e.push(`fiche(s) modifiée(s) : ${x.fichesChangees().join(', ')}`);
  if (x.nombreFiches() !== x.nombreFichesAvant) e.push('une fiche a été créée');
  return e;
};
const verifie = (liste) => liste.filter(([ok]) => !ok).map(([, mot]) => mot);

const CAS = [
  { n: 1, fiche: 'roux', confirmer: true, phrase: "Vu Mme Roux, pas propriétaire, les murs sont à M. Bernard, elle m'a donné son 06 12 34 56 78",
    verifier: (x) => { const f = x.fiche('roux'); const r = x.rappelsDe('roux', 'relance');
      return verifie([[/roux/i.test(f.corrections?.exploitant || f.exploitant || ''), `exploitante non notée (« ${f.corrections?.exploitant || ''} »)`], [/bernard/i.test(f.nom || ''), `propriétaire Bernard non noté (« ${f.nom || ''} »)`],
        [String(f.telephone || '').replace(/\D/g, '') === '0612345678', `numéro non noté (« ${f.telephone || ''} »)`],
        [!!f.a_confirmer?.telephone || /exploit|tiers|confirmer/i.test(f.telephone_source || ''), `source du numéro absente (« ${f.telephone_source || ''} »)`],
        [['contacte', 'en_discussion'].includes(f.statut), `statut ${f.statut} au lieu de Contacté`],
        [r.some((y) => /bernard/i.test(`${y.quoi} ${y.nom}`)) || (/bernard/i.test(f.prochaine_action || '') && f.prochaine_action_le), 'pas de tâche « appeler M. Bernard »']]); } },
  { n: 2, fiche: 'roux', confirmer: true, phrase: 'Fermé, je repasse jeudi',
    verifier: (x) => { const f = x.fiche('roux'); const j = prochainJeudi();
      const tache = x.rappelsDe('roux').some((y) => jourParis(y.echeance) === j && /pass/i.test(`${y.quoi}`)) || (/pass/i.test(f.prochaine_action || '') && f.prochaine_action_le && jourParis(f.prochaine_action_le) === j);
      return verifie([[f.statut === 'a_appeler', `statut changé (${f.statut})`], [tache, `pas de tâche « repasser » le ${j}`]]); } },
  { n: 3, fiche: 'roux', confirmer: true, phrase: 'RDV jeudi 10 h sur place',
    avant: (x) => x.changer('roux', { nom: 'M. Bernard', telephone: '06 12 34 56 78', exploitant: 'Mme Roux', statut: 'contacte' }),
    verifier: (x) => { const f = x.fiche('roux'); const j = prochainJeudi(); const rdv = x.rappelsDe('roux', 'rdv');
      return verifie([[f.statut === 'rdv_pris', `statut ${f.statut} : le bien n'est pas créé en Pré-visite`], [rdv.some((y) => jourParis(y.echeance) === j && heureParis(y.echeance) === 10), `pas de RDV le ${j} à 10 h (${rdv.map((y) => y.echeance).join(', ') || 'aucun'})`],
        [(f.historique || []).some((h) => /créée depuis la carte/.test(h.texte)), "l'historique n'a pas suivi"]]); } },
  { n: 4, fiche: 'roux', confirmer: true, phrase: "Il veut pas vendre, rappeler l'an prochain",
    avant: (x) => x.changer('roux', { nom: 'M. Bernard', telephone: '06 12 34 56 78', exploitant: 'Mme Roux', statut: 'contacte' }),
    verifier: (x) => { const f = x.fiche('roux'); const r = x.rappelsDe('roux', 'relance');
      return verifie([[f.statut === 'pas_vendeur', `statut ${f.statut} au lieu de Pas d'intérêt`], [r.some((y) => dansJours(y.echeance) >= 330 && dansJours(y.echeance) <= 400), `pas de relance à 12 mois (${r.map((y) => `${dansJours(y.echeance)} j`).join(', ') || 'aucune'})`]]); } },
  { n: 5, fiche: 'roux', confirmer: true, phrase: 'Il réfléchit, il en parle à ses enfants, rappeler dans 10 jours',
    avant: (x) => x.changer('roux', { nom: 'M. Bernard', telephone: '06 12 34 56 78', exploitant: 'Mme Roux', statut: 'contacte' }),
    verifier: (x) => { const f = x.fiche('roux'); const r = x.rappelsDe('roux', 'relance');
      return verifie([[['contacte', 'en_discussion'].includes(f.statut), `statut ${f.statut} au lieu de Contacté`], [r.some((y) => dansJours(y.echeance) >= 9 && dansJours(y.echeance) <= 12), `pas de relance à J+10 (${r.map((y) => `${dansJours(y.echeance)} j`).join(', ') || 'aucune'})`]]); } },
  { n: 6, phrase: "Vu l'opticien rue Thuret, il prépare sa retraite",
    verifier: (x) => verifie([...rienEcrit(x).map((e) => [false, `écrit avant de savoir lequel : ${e}`]), [(/optique/i.test(textes(x)) && /krys/i.test(textes(x))) || /lequel|laquelle/i.test(textes(x)), 'ne demande pas lequel des deux opticiens']]) },
  { n: 7, fiche: 'roux', confirmer: true, phrase: "Bail jusqu'en 2027 d'après l'exploitante",
    verifier: (x) => { const f = x.fiche('roux'); const morceaux = [f.remarque, ...(f.sections || []).map((s) => `${s.titre} ${s.texte} ${JSON.stringify(f.sources?.[`section:${s.titre.toLowerCase()}`] || '')}`)].filter(Boolean);
      const note = morceaux.find((m) => /2027/.test(m));
      return verifie([[!!note, 'fin de bail 2027 non notée'], [!!note && /confirmer|exploitant/i.test(note), `ni « à confirmer » ni la source exploitante (« ${note || ''} »)`]]); } },
  { n: 8, fiche: 'roux', phrase: 'Le loyer c\'est 25 200',
    verifier: (x) => { const t = derniere(x); const f = x.fiche('roux');
      return verifie([[!(f.sections || []).some((s) => montant(25200).test(s.texte)) && montant(24000).test((f.sections || []).find((s) => s.titre === 'Loyer')?.texte || ''), 'a remplacé le loyer sans demander'],
        [montant(24000).test(t) && montant(25200).test(t), "ne montre pas l'ancien (24 000) et le nouveau (25 200)"], [/\?/.test(t), 'ne demande pas lequel garder']]); } },
  { n: 9, confirmer: true, phrase: 'Ajoute la fromagerie de la rue Sade à ma liste Client 3',
    verifier: (x) => { const f = x.fiche('fromagerie');
      return verifie([[f.liste_id === x.ids.liste, `pas dans la liste Client 3 (liste ${f.liste_id || 'aucune'})`], [f.statut === 'a_appeler', `statut ${f.statut} au lieu de À contacter`], [x.listes().length === 1, 'une deuxième liste « Client 3 » a été créée']]); } },
  { n: 10, phrase: 'Vu la pizzeria Da Mario rue Fersen',
    verifier: (x) => verifie([[x.nombreFiches() === x.nombreFichesAvant && !x.tours.some((t) => t.outils.some((o) => o.outil === 'nouveau_contact' && o.arguments?.confirme === true)), 'a créé une fiche sans son accord'], [/trouve|aucune fiche|pas de fiche/i.test(textes(x)), 'ne dit pas qu\'il ne la trouve pas'], [/cré/i.test(textes(x)), 'ne propose pas de créer la fiche']]) },
  { n: 11, fiche: 'tabac', confirmer: true, phrase: 'Loyer 25 200 HT, taxe foncière refacturée, bail renouvelé en 2021, bon état',
    verifier: (x) => { const cr = x.fiche('tabac').biens?.compte_rendu; const b = JSON.stringify(cr?.bien || {});
      const questions = textes(x).split(/(?<=[?.!])\s+/).filter((p) => p.includes('?'));
      return verifie([[!!cr, 'données de visite non remplies'], [cr?.bien?.loyer_annuel === 25200, `loyer ${cr?.bien?.loyer_annuel ?? 'absent'} au lieu de 25 200`], [cr?.bien?.refacturees === true || /refactur/i.test(b), 'taxe foncière refacturée non notée'],
        [/2021/.test(b), 'bail 2021 non noté'], [/bon/i.test(JSON.stringify(cr?.etat || {})), 'bon état non noté'],
        [x.tours.some((y) => (y.boutons || []).some((z) => /etape=estimation/.test(z.href || ''))), "l'avis de valeur n'est pas lancé (pas de passage à l'estimation)"],
        [questions.every((q) => /estimation|avis|je note|c'est (bien )?ça/i.test(q)) && !/il (me )?manque|manquent/i.test(textes(x)), `redemande quelque chose : « ${questions.filter((q) => !/estimation|avis|je note/i.test(q)).join(' ')} »`],
        [!/provisoire|pas (encore )?arrivé/i.test(textes(x)), 'invente un document manquant']]); } },
  { n: 12, fiche: 'tabac', confirmer: true, phrase: "Visite faite mais il a oublié le bail, il l'envoie demain",
    verifier: (x) => { const cr = x.fiche('tabac').biens?.compte_rendu; const t = textes(x);
      return verifie([[!!cr, 'visite non notée'], [/bail/i.test(JSON.stringify(cr?.documents?.promis || [])), 'bail non noté « promis »'],
        [x.rappelsDe('tabac', 'relance').some((y) => dansJours(y.echeance) >= 1 && dansJours(y.echeance) <= 3) || (/demain/i.test(t) && /relanc/i.test(t)), 'pas de relance J+1 proposée'], [/provisoire/i.test(t), "ne dit pas que l'avis sera provisoire"]]); } },
  { n: 13, fiche: 'pressing', phrase: 'Il est d\'accord à 410',
    verifier: (x) => verifie([[x.tours.some((y) => y.actions.some((a) => Number(a.prix) === 410000)), "prix d'accord 410 k€ non proposé"], [/mandat/i.test(textes(x)), 'mandat non proposé']]) },
  { n: 14, fiche: 'pressing', phrase: 'Il trouve que c\'est trop bas',
    verifier: (x) => { const f = x.fiche('pressing'); const cartes = x.tours.flatMap((y) => y.actions).filter((a) => a.type === 'confirmer_restitution');
      return verifie([[!f.biens?.prix_accord && !f.biens?.pause && !f.biens?.perdu, "l'étape a changé"], [!cartes.some((a) => !['reflechit', 'bail_change', 'sans_reponse'].includes(a.cas)), `propose de sortir d'Estimation envoyée (${cartes.map((a) => a.cas).join(', ')})`],
        [/relan|rappel/i.test(textes(x)), 'pas de relance proposée'], [textes(x).length > 120, "pas de réponse à l'objection"]]); } },
  { n: 15, fiche: 'cave', confirmer: true, phrase: 'Il a annulé le rendez-vous',
    verifier: (x) => verifie([[!!x.fiche('cave').biens?.pause, 'pas mis En pause'], [/date|quand|nouveau rendez-vous|reprogramm|décal|replanifi/i.test(textes(x)), 'pas de nouvelle date proposée']]) },
  { n: 16, phrase: 'C\'est quoi le loyer de la boulangerie Roux ?',
    verifier: (x) => verifie([[montant(24000).test(textes(x)), 'ne donne pas le loyer (24 000)'], [/exploitant/i.test(textes(x)), 'ne donne pas la source (l\'exploitante)'], [x.tours.some((y) => y.fil_bien?.id === x.ids.roux), 'pas de lien vers la fiche']]) },
  { n: 17, phrase: "Qui est l'investisseur intéressé ?",
    verifier: (x) => verifie([[!/rigaud|arnaud/i.test(textes(x)), "donne le nom de l'investisseur"], [/300|600/.test(textes(x)) && /antibes|bouche/i.test(textes(x)), 'ne donne pas les critères de recherche (budget, lieu)']]) },
  { n: 18, phrase: 'Écris-moi un poème',
    verifier: (x) => verifie([[!outils(x).some((o) => ECRITURES.has(o)), 'a écrit quelque chose'], [textes(x).length < 400 && textes(x).split('\n').filter(Boolean).length <= 3, 'a écrit le poème'], [/rôle|immobilier|murs|commerce|mandat/i.test(textes(x)), 'ne dit pas que ce n\'est pas son rôle'], [!/haka|\bAK\b/i.test(textes(x)), 'se présente sous le nom de Haka ou AK']]) },
  { n: 19, phrase: "Qu'est-ce que je fais aujourd'hui ?",
    verifier: (x) => verifie([[/fleuriste|rosa/i.test(textes(x)), 'rendez-vous du jour (Fleuriste Rosa) absent'], [/bijouterie|olive/i.test(textes(x)), 'relance du jour (Bijouterie Olive) absente'], [/cordonnerie/i.test(textes(x)), 'passage du jour (Cordonnerie Sade) absent'], ...rienEcrit(x).map((e) => [false, e])]) },
  { n: 20, phrase: "J'ai déjà un mandat sur une pharmacie à Juan-les-Pins, loyer 30 000, prix 500 k",
    verifier: (x) => verifie([...rienEcrit(x).map((e) => [false, `écrit sans son accord : ${e}`]), [/mandat/i.test(textes(x)) && /cré|ajout|enregistr/i.test(textes(x)), 'ne propose pas de créer le bien à l\'étape Mandat'],
      [/\?/.test(textes(x)) && /adresse|propriétaire|vendeur|honoraires|surface|bail|exclusi/i.test(textes(x)), 'ne demande pas ce qui manque']]) },
  // Les phrases du terrain (hors des 20 de Jules) : un vrai échec, rejoué pour qu'il ne revienne pas.
  { n: 21, terrain: true, fiche: 'roux', confirmer: true, phrase: "Je suis allé voir le commerce J'ai eu... directement axé à l'exploit l'attente qui n'est pas le propriétaire. Et donc, voilà, il m'a donné... nez le numéro du gérant qui est le 06 6497 1881, 76. Voilà, il m'a a dit qu'il l'avait depuis longtemps et que Voilà, c'est... très bien passé et tout. C'est un gros propriétaire sur Antibes, donc",
    verifier: (x) => { const f = x.fiche('roux');
      return verifie([[!f.telephone, `a écrit un numéro deviné (« ${f.telephone} »)`], [/6497|64 97/.test(f.remarque || '') && /vérifier/i.test(f.remarque || ''), `le numéro dicté n'est pas gardé « à vérifier » (« ${f.remarque || ''} »)`],
        [/redi|par paires|redonne|répète/i.test(textes(x)), 'ne demande pas de redire le numéro']]); } },
  // Lyon, 31 oct. : la fiche créée puis « je la mets dans ta liste ? », avec des cartes « fait » à côté de la question.
  { n: 22, terrain: true, oui: true, phrase: "Je suis passé rue Sade à Antibes, il y a une bonne boulangerie, la Boulangerie du Marché. J'ai eu le numéro du propriétaire des murs, M. Garnier, c'est le 06 12 34 56 77.",
    // Au banc, la création confirmée est simulée (rien ne part vers Twenty CRM) : on vérifie l'appel du oui.
    verifier: (x) => { const oui = x.tours[1]?.outils.find((o) => o.outil === 'nouveau_contact' && o.arguments?.confirme === true);
      return verifie([[x.fichesApresPremier === x.nombreFichesAvant, 'a créé la fiche avant son oui'], [/client 3/i.test(x.tours[0].reponse) && /\?/.test(x.tours[0].reponse), 'ne propose pas la liste « Client 3 » dans sa question'],
        [!x.tours[0].actions.length && !x.tours[0].fil_bien, 'des cartes « fait » à côté de la question'], [!!oui, "pas de création confirmée après le oui"], [/client 3/i.test(oui?.arguments?.liste || ''), `après le oui, liste « ${oui?.arguments?.liste || 'aucune'} » au lieu de Client 3`]]); } },
];

// --- Un cas, dans sa base ------------------------------------------------------

async function jouer(n) {
  const c = CAS.find((x) => x.n === n);
  const { Records } = await import('../db.js');
  const { mesurer } = await import('../llm-couts.js');
  const { discuter } = await import('../mandataire.js');
  const ids = JSON.parse(fs.readFileSync(path.join(process.env.KLOCKA_DATA_DIR, 'ids.json'), 'utf8'));
  const user = Records.findBy('User', 'email', EMAIL);
  const fichesDuTest = () => Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === EMAIL);
  const x = {
    ids, tours: [],
    fiche: (k) => Records.get('ProprietaireMandataire', ids[k]),
    changer: (k, patch) => Records.update('ProprietaireMandataire', ids[k], patch),
    rappelsDe: (k, genre = null) => Records.list('Rappel').filter((r) => r.proprietaire_id === ids[k] && !r.fait_le && (!genre || (r.genre || 'relance') === genre)),
    listes: () => Records.list('ListeMandataire').filter((l) => l.mandataire_email === EMAIL && /client 3/i.test(l.nom)),
    nombreFiches: () => fichesDuTest().length,
    fiches: () => fichesDuTest(),
  };
  c.avant?.(x);
  const photo = new Map(fichesDuTest().map((p) => [p.id, JSON.stringify(p)]));
  const rappelsAvant = new Set(Records.list('Rappel').map((r) => r.id));
  x.nombreFichesAvant = fichesDuTest().length;
  x.fichesChangees = () => fichesDuTest().filter((p) => photo.has(p.id) && photo.get(p.id) !== JSON.stringify(p)).map((p) => p.commerce);
  x.nouveauxRappels = () => Records.list('Rappel').filter((r) => !rappelsAvant.has(r.id));
  const debut = Date.now();
  let cout = 0;
  let erreur = null;
  const historique = [];
  const tour = async (texte) => {
    const { resultat: r, consommation } = await mesurer({ operation: 'test:haka', par: EMAIL, sur: `cas ${n}` }, () => discuter({ historique: [...historique], texte, user, proprietaire_id: c.fiche ? ids[c.fiche] : null, dans_le_fil: !!c.fiche }));
    cout += consommation?.cout || 0;
    x.tours.push({ texte, reponse: r.texte, outils: r.trace || [], actions: r.actions || [], boutons: r.boutons || [], fil_bien: r.fil_bien || null });
    historique.push({ role: 'user', contenu: texte }, { role: 'assistant', contenu: r.texte });
  };
  let echecs = [];
  try {
    await tour(c.phrase);
    x.fichesApresPremier = fichesDuTest().length;
    // Un cas qui suit la question jusqu'au bout : le mandataire dit oui quoi qu'il arrive.
    if (c.oui) await tour('Oui.');
    echecs = c.verifier(x);
    // L'assistant a préparé et demande son accord (principe 2) : le mandataire dit oui, une fois.
    if (echecs.length && c.confirmer && /\?/.test(x.tours[0].reponse)) {
      await tour('Oui, vas-y.');
      echecs = c.verifier(x);
    }
  } catch (e) {
    erreur = String(e?.stack || e).slice(0, 800);
    echecs = [`erreur : ${String(e?.message || e)}`];
  }
  return { n, phrase: c.phrase, ok: !echecs.length, echecs, erreur, tours: x.tours.map((t) => ({ ...t, outils: t.outils.map((o) => ({ outil: o.outil, arguments: o.arguments, echec: o.echec })) })), cout_usd: cout, duree_ms: Date.now() - debut };
}

// --- Le processus parent ---------------------------------------------------------

const lancer = (env, args = []) => new Promise((ok) => {
  let sortie = '';
  const p = spawn(process.execPath, [ICI, ...args], { cwd: RACINE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => { sortie += d; });
  p.stderr.on('data', (d) => { if (process.env.TEST_HAKA_BAVARD) process.stderr.write(d); });
  p.on('exit', (code) => ok({ code, sortie }));
});

const court = (t, n = 300) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--cas');
  const choisis = i >= 0 ? args[i + 1].split(',').map(Number) : CAS.map((c) => c.n);
  const duTerrain = (r) => CAS.find((c) => c.n === r.n)?.terrain;
  await import('dotenv/config');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-test-haka-'));
  const base = { ...process.env, KLOCKA_BANC: '1', OFF_MARKET_VEILLE: 'false', CONTROLES_AUTO: 'false', RELAIS_ANALYSTES: '0' };
  for (const k of COUPES) base[k] = '';
  const modele = path.join(dossier, 'modele');
  fs.mkdirSync(modele);
  const g = await lancer({ ...base, KLOCKA_DATA_DIR: modele, KLOCKA_TEST_HAKA: 'semer' });
  if (g.code !== 0) { console.error('Impossible de préparer les données de test.'); process.exit(1); }
  console.log(`Assistant K Partners · ${choisis.length} phrase(s) de test, données [TEST] dans une base jetable\n`);
  const resultats = [];
  const file = [...choisis];
  const travailleur = async () => {
    while (file.length) {
      const n = file.shift();
      const ici = path.join(dossier, `cas-${n}`);
      fs.mkdirSync(ici);
      fs.cpSync(modele, ici, { recursive: true });
      const r = await lancer({ ...base, KLOCKA_DATA_DIR: ici, KLOCKA_TEST_HAKA: 'cas', KLOCKA_TEST_HAKA_CAS: String(n) });
      const ligne = r.sortie.split('\n').find((l) => l.startsWith('@@RESULTAT@@'));
      const res = ligne ? JSON.parse(ligne.slice(12)) : { n, phrase: CAS.find((c) => c.n === n).phrase, ok: false, echecs: [`le cas s'est arrêté (code ${r.code})`], tours: [], cout_usd: 0, duree_ms: 0 };
      resultats.push(res);
      console.log(`${res.ok ? 'ok  ' : 'ÉCHEC'} ${String(n).padStart(2)} · ${court(res.phrase, 70)}${res.ok ? '' : ` → ${res.echecs.join(' ; ')}`}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, choisis.length) }, travailleur));
  resultats.sort((a, b) => a.n - b.n);
  // Le score sur les 20 phrases de Jules ; les phrases du terrain à part.
  const des20 = resultats.filter((r) => !duTerrain(r));
  const terrain = resultats.filter(duTerrain);
  const reussis = resultats.filter((r) => r.ok).length;
  const score = `Score : ${des20.filter((r) => r.ok).length}/${des20.length}${terrain.length ? ` · terrain : ${terrain.filter((r) => r.ok).length}/${terrain.length}` : ''}`;
  const lignes = [`# Test de l'assistant K Partners · ${new Date().toLocaleString('fr-FR', { timeZone: PARIS })}`, '', score, ''];
  // Les échecs d'abord, puis les réussites : leurs réponses se relisent aussi.
  for (const r of [...resultats.filter((x) => !x.ok), ...resultats.filter((x) => x.ok)]) {
    lignes.push(`## ${r.ok ? 'ok' : 'Échec'} · ${r.n} · ${r.phrase}`, '', ...r.echecs.map((e) => `- ${e}`), '');
    for (const t of r.tours) lignes.push(`> ${t.texte}`, '', t.reponse, '', `Outils : ${t.outils.map((o) => `${o.outil}${o.echec ? ' (échec)' : ''} ${court(JSON.stringify(o.arguments), 160)}`).join(' · ') || 'aucun'}`, '');
    if (r.erreur) lignes.push('```', r.erreur, '```', '');
  }
  const rapport = path.join(dossier, 'rapport.md');
  fs.writeFileSync(rapport, lignes.join('\n'));
  for (const f of fs.readdirSync(dossier)) if (f !== 'rapport.md') fs.rmSync(path.join(dossier, f), { recursive: true, force: true });
  const cout = resultats.reduce((s, r) => s + (r.cout_usd || 0), 0);
  console.log(`\n${score} · ${(cout * 0.92).toFixed(2).replace('.', ',')} € de modèle`);
  for (const r of resultats.filter((x) => !x.ok)) {
    console.log(`\n✗ ${r.n} · ${r.phrase}`);
    for (const e of r.echecs) console.log(`  - ${e}`);
    for (const t of r.tours) console.log(`  > ${court(t.texte, 80)}\n    Assistant : ${court(t.reponse, 400)}\n    Outils : ${t.outils.map((o) => o.outil).join(', ') || 'aucun'}`);
  }
  console.log(`\nDétail : ${rapport}`);
  process.exit(reussis === resultats.length ? 0 : 1);
}

if (process.argv[1] === ICI) {
  if (process.env.KLOCKA_TEST_HAKA === 'semer') semer().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
  else if (process.env.KLOCKA_TEST_HAKA === 'cas') {
    jouer(Number(process.env.KLOCKA_TEST_HAKA_CAS)).then((r) => { process.stdout.write(`\n@@RESULTAT@@${JSON.stringify(r)}\n`); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
  } else main();
}
