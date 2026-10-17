// AK dans l'application : le chat du tableau de bord parle au même moteur
// que l'AK de Google Chat (même consigne, mêmes outils, mêmes garde-fous
// contre les doublons). Trois différences, parce que l'écran n'est pas un
// fil de chat :
//  - les étapes partent en direct (`surEtape`), le fil les affiche une à une ;
//  - un mail rédigé revient en brouillon à relire sous la réponse, au lieu
//    d'être collé dans la conversation ;
//  - une tâche de fond (LOI, K-Data, préz, prospection ALX) s'annonce, finie,
//    par une notification de l'application.

import fs from 'fs';
import { tracer } from './trace.js';
import { auBanc } from './banc/garde.js';
const CADRE_APP = `

TU RÉPONDS DANS L'APPLICATION KLOCKA (le chat du tableau de bord), pas dans Google Chat :
- le ton du document au-dessus, en écriture normale ; le markdown est retiré à l'affichage, n'en mets pas ; des retours à la ligne, et des tirets pour une liste quand elle aide ;
- pas de mention @, pas de pièce jointe à poster ;
- les liens vers la plateforme en chemins relatifs (/Dossiers?deal_id=…, /Projet?id=…) ;
- un mail rédigé (mail_agent, mail_libre, retoucher_brouillon) s'ouvre en brouillon sous ta réponse, à relire et envoyer d'un clic : dis-le en une ligne, ne le recopie pas ;
- une tâche de fond finie sera annoncée par une notification de l'application : dis « je te préviens quand c'est prêt ».

TU AS UN BAC À SABLE PYTHON (l'outil code_execution : pandas, openpyxl, matplotlib, sans internet) :
- tout calcul chiffré passe par le code, jamais de tête : rendement, loyer au m², indexation, simulation, cumul, écart, conversion ; tu donnes le résultat, pas le code ;
- les données viennent d'abord de tes outils (projet, dossier, simulateur) : tu les recopies dans le code telles qu'ils les rendent ;
- un fichier joint qui n'est ni une image ni un PDF (Excel, CSV, Word, PowerPoint) est déposé dans le bac à sable : tu l'y lis avec le code ;
- un fichier demandé (un Excel, un CSV, un graphique) : tu l'écris dans le bac à sable ; il s'affiche sous ta réponse, à télécharger d'un clic. Dis-le en une ligne, sans recopier le contenu.`;

// Le modèle de données (partie 2, 13 oct. 2026) : lu une fois, dans la partie stable de la consigne (en cache).
const MODELE_DONNEES = (() => { try { return `\n\n${fs.readFileSync(new URL('../../docs/ak/modele-donnees.md', import.meta.url), 'utf8')}`; } catch { return ''; } })();

// La version 2 (partie 3, 13 oct. 2026), derrière AK_CONSIGNE=v2 : la consigne réécrite (docs/ak/consigne-v2.md, le
// modèle de données dedans), 28 outils regroupés (outils-v2.js), les fiches métier à la demande (procedures.js), la
// recherche web et la recherche d'outils d'Anthropic. Sans la variable, rien ne change.
export const enV2 = () => (process.env.AK_CONSIGNE || '').trim().toLowerCase() === 'v2';
let consigneV2Cache = null;
async function consigneV2() {
  if (consigneV2Cache) return consigneV2Cache;
  const { listeProcedures } = await import('./procedures.js');
  const brut = fs.readFileSync(new URL('../../docs/ak/consigne-v2.md', import.meta.url), 'utf8');
  const corps = brut.slice(brut.indexOf('═══ 1.'), brut.indexOf('═══ 6.'))
    .replace(/^\[docs\/ak\/modele-donnees\.md[^\n]*\]$/m, MODELE_DONNEES.trim())
    .replace(/Les fiches : [^\n]*/, `Les fiches : ${listeProcedures()}.`);
  consigneV2Cache = corps.trim();
  return consigneV2Cache;
}
/** Pure : un texte qui cite les anciens outils, réécrit avec les noms v2 (« modifier_presentation » → « presentation (action modifier) »). */
export function nomsV2(texte, groupes) {
  const table = new Map();
  for (const g of groupes) {
    if (g.seul) { const o = typeof g.seul === 'string' ? g.seul : g.seul.outil; if (o !== g.nom && !table.has(o)) table.set(o, g.nom); continue; }
    for (const [action, a] of Object.entries(g.actions)) { const o = typeof a === 'string' ? a : a.outil; if (!table.has(o) || typeof a === 'string') table.set(o, `${g.nom} (action ${action})`); }
  }
  table.delete('trouver_bien');
  return String(texte || '').replace(/\b[a-z][a-z_]+_[a-z_]+\b/g, (m) => table.get(m) || m);
}

const LECTURES = new Set(['layer_chercher', 'layer_fiche', 'historique', 'lire_entite', 'chercher_entites', 'lire_fiche_monday', 'trouver_bien', 'chercher_dossier', 'chercher_projet', 'etat_dossier', 'etat_projet', 'verifier', 'outils_kdata', 'taches_en_cours', 'historique_actions', 'plan_du_jour', 'registre_engagements', 'interroger_documents', 'marche_ville', 'boite_recue', 'lire_mail', 'mails_du_dossier', 'chercher_drive', 'agenda', 'souvenirs', 'verifier_renta', 'chercher_biens', 'lire_piece', 'verifier_presentation', 'chercher_cible', 'chercher_agents', 'version', 'echeances', 'fiche_client_decouverte', 'note_d_appel']);
const MAILS = new Set(['mail_agent', 'mail_libre', 'retoucher_brouillon']);

/**
 * Un tour du chat de l'application, traité par AK.
 * @param {{texte: string, historique?: Array<{role, contenu}>, user: object, surEtape?: Function}} p
 * @returns {Promise<{texte, actions, outils, brouillon, taches}>}
 */
// Comment AK parle à Jules dans les ateliers d'emailing (9 oct. 2026) : « structure c (deux relances
// actives, le reste pédagogique sec) : j1 chiffre réel… » lui a déplu. Le tac au tac de la consigne
// générale ne vaut pas ici : on présente un plan à un client, pas une note entre collègues.
const STYLE_ATELIER = `
COMMENT TU PARLES ICI (cela prime sur le ton de ta consigne générale) :
- Des phrases complètes, avec majuscules et ponctuation, comme un rédacteur qui présente un plan à son client. Pas de style télégraphique.
- Aucune abréviation ni étiquette interne : pas de « j1 », « J+3 », « CTA », « relance active », « pédagogique sec », « structure C ». Écris « le premier mail, mardi 13 octobre », « un appel à l'action vers le simulateur ».
- Plusieurs options : donne à chacune un nom parlant (« Deux temps forts, le reste en conseils ») et décris-la en une phrase claire ; jamais de lettre ni de numéro seul.
- Un plan de mails : une liste, une ligne par mail, « Mail 1 · mardi 13 octobre · Le vrai rendement d'un local : un chiffre type, puis le simulateur pour faire le calcul. » Le jour, le sujet, ce qu'apporte le mail, l'asset s'il y en a un, nommé en toutes lettres.
- Court : le plan, ce que tu as supposé en une phrase, et au plus une question.`;

// Bloc 4 (13 oct. 2026) : une image ou un PDF joint part au modèle tel quel, il le voit et le lit lui-même.
// Les limites de l'API : 5 Mo par image ; un PDF, on s'arrête à 20 Mo. Le reste (HEIC, Excel, Word…) garde
// son chemin, et lire_piece le lit.
const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;

/** Les blocs natifs des pièces (image, document), et les pièces qu'ils couvrent. Lecture du disque injectable. */
export function blocsNatifs(pieces = [], { taille = (c) => fs.statSync(c).size, lire = (c) => fs.readFileSync(c) } = {}) {
  const blocs = [];
  const lues = new Set();
  for (const p of pieces) {
    const type = String(p?.type || '').toLowerCase();
    try {
      if (IMAGES.has(type) && taille(p.chemin) <= MAX_IMAGE) {
        blocs.push({ type: 'image', source: { type: 'base64', media_type: type, data: lire(p.chemin).toString('base64') } });
        lues.add(p);
      } else if (type === 'application/pdf' && taille(p.chemin) <= MAX_PDF) {
        blocs.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: lire(p.chemin).toString('base64') }, title: String(p.nom || 'document.pdf').slice(0, 200) });
        lues.add(p);
      }
    } catch { /* illisible : la pièce reste un chemin */ }
  }
  return { blocs, lues };
}

/** Pure : la mémoire des outils d'une réponse, une ligne par appel, tronquée (8 000 signes au plus). */
export function memoireDesOutils(appels = []) {
  const court = (v, n) => { const t = typeof v === 'string' ? v : JSON.stringify(v ?? null); return t.length > n ? `${t.slice(0, n)}…` : t; };
  let total = 0;
  const lignes = [];
  for (const a of appels) {
    const l = `- ${a.outil}(${court(a.args || {}, 240)}) → ${court(a.resultat, 1400)}`;
    if (total + l.length > 8000) { lignes.push(`- … ${appels.length - lignes.length} autre(s) appel(s) non repris`); break; }
    lignes.push(l);
    total += l.length;
  }
  return lignes.join('\n');
}

/** Pure : le contenu d'un message d'historique ; une réponse d'AK récente reprend sa mémoire d'outils. */
export function avecMemoire(m, recent = true) {
  if (m.role !== 'assistant' || !recent || typeof m.memoire !== 'string' || !m.memoire.trim()) return m.contenu;
  return `${m.contenu}\n\n[Pour cette réponse, tu avais appelé ces outils ; leurs résultats valent toujours, sauf si la personne dit le contraire :\n${m.memoire.slice(0, 8000)}]`;
}

/**
 * Pure : ce que la personne voit au moment de sa question (14 oct. 2026). AK
 * lisait la base, pas l'écran : il refaisait les calculs de la page avec ses
 * hypothèses, ignorait une saisie pas encore enregistrée et ne savait pas ce que
 * « ça » désignait. La page envoie son texte affiché (unités comprises), l'élément
 * cliqué et ce qui attend d'être enregistré.
 */
/**
 * L'Intelligence (spec MVP du 14 oct. 2026) : les règles d'AK sur le passé, le
 * débrief « retiens que… » noté avant qu'il réponde, et la question qu'il a
 * posée à la personne (un dossier accepté ou refusé sans motif).
 */
async function cadreLayer(texte, user) {
  if (user?.role !== 'admin') return '';
  const C = await import('../layer.js');
  // Les consignes de la section 12 de la spec du Layer (15 oct. 2026).
  let cadre = `\n\nL'INTELLIGENCE DE KLOCKA (le Layer : comptes rendus, réunions, appels, débriefs, validés par l'équipe). Pour toute question sur le passé ou sur une personne, une agence, un dossier, un investisseur, une ville : appelle layer_fiche (la synthèse de la fiche) puis layer_chercher (avec les filtres que la question donne : fiche, ville, type, période) AVANT de répondre. Cite toujours la date, la personne et la source de chaque fait (« d'après l'Intelligence, le 15/10, Nora… ») et son statut s'il n'est pas validé (« à valider, pas encore acquis »). Si la recherche ne rend rien : réponds « rien dans l'Intelligence » et propose de le noter (layer_noter). Ne déduis jamais un fait absent d'un autre fait.`;
  const debrief = C.debriefDe(texte);
  if (debrief) {
    const r = await C.noter(debrief, { user }).catch((e) => ({ ok: false, error: e?.message || String(e) }));
    cadre += r.ok
      ? `\nCE MESSAGE EST UN DÉBRIEF, DÉJÀ NOTÉ DANS L'INTELLIGENCE (source ${r.source_id}). Faits extraits, en attente de validation : ${JSON.stringify((r.faits || []).map((f) => ({ type: f.type, resume: f.resume, a_rattacher: f.statut === 'a_rattacher' })))}${r.doublons ? ` ; ${r.doublons} déjà connu(s), pas recréé(s)` : ''}. Réponds en une ligne ce que tu as compris (« Noté : une information, … ; un engagement, … »), et dis que Jules le validera. N'appelle ni noter ni retenir pour ce message.`
      : `\nCE MESSAGE EST UN DÉBRIEF, MAIS IL N'A PAS PU ÊTRE NOTÉ DANS L'INTELLIGENCE (${r.error}). Dis-le, en une ligne.`;
  }
  const q = C.questionOuverte(user.email);
  if (q) cadre += `\nTU AS POSÉ CETTE QUESTION À LA PERSONNE (question_id ${q.id}) : « ${q.texte} ». Si son message y répond, appelle layer_noter avec question_id ${q.id} et texte = le motif tel qu'elle le dit, puis remercie en une ligne. Sinon, réponds à son message, et repose la question en une ligne à la fin.`;
  return cadre;
}

export function cadreEcran(ecran) {
  if (!ecran || typeof ecran !== 'object') return '';
  const court = (v, n) => String(v ?? '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, n);
  const texte = court(ecran.texte, 9000).trim();
  if (!texte && !ecran.designe) return '';
  const ou = [ecran.onglet && `onglet ${court(ecran.onglet, 60)}`, ecran.mode && `mode ${court(ecran.mode, 30)}`].filter(Boolean).join(', ');
  const designe = ecran.designe ? `\nL'ÉLÉMENT QUE LA PERSONNE A CLIQUÉ EN DERNIER : « ${court(ecran.designe.texte, 300)} »${ecran.designe.champ ? ` (champ ${court(ecran.designe.champ, 80)})` : ''}. « Ça », « celui-là », « ce chiffre », « cette ligne » le désignent d'abord ; si la phrase peut viser autre chose (un autre lot, une autre ligne), demande lequel avant de modifier.` : '';
  const attente = ecran.non_enregistre && Object.keys(ecran.non_enregistre).length
    ? `\nSAISI À L'ÉCRAN, PAS ENCORE ENREGISTRÉ (la page l'enregistre dans la seconde ; c'est ce que la personne voit) : ${court(JSON.stringify(ecran.non_enregistre), 1500)}`
    : '';
  return `\n\nL'ÉCRAN AU MOMENT DE LA QUESTION${ou ? ` (${ou})` : ''}. C'est ce que la personne regarde, avec les unités et les chiffres que la page calcule (rendement, prix de revient, loyer au m², simulateur, frise) : ils font foi. Ne les recalcule pas avec d'autres hypothèses ; si la base dit autre chose que l'écran, dis l'écart au lieu de choisir. Cite toujours l'unité d'un montant (€/an ou €/mois, HT HC ou charges comprises, €/m²/an) et la surface dont tu parles (utile, pondérée, du bail).${designe}${attente}${texte ? `\n<<<ÉCRAN\n${texte}\nÉCRAN>>>` : ''}`;
}

export async function repondreApp({ texte, historique = [], user, surEtape = null, contexte = null, pieces = [], estAnnule = null, signal = null, surTexte = null }) {
  const { consigneStable, consigneApprise, OUTILS, executerOutil, MODELE, effortDuChat } = await import('./agent.js');
  const { runAgent } = await import('../llm.js');
  const { libelleOutil } = await import('../etapes-libelles.js');
  const souvenirs = [];
  const { estEchec, journaliser } = await import('../assistant-journal.js');

  const espace = `app:${String(user?.email || 'inconnu').toLowerCase()}`;
  const prenom = String(user?.full_name || user?.email || 'Quelqu’un').split(/[ @]/)[0];
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const message = { espace, auteur: { nom: user?.email || null, affiche: prenom }, texte, pieces, groupe: false, page: contexte?.page || null };
  const { blocs: natifs, lues } = blocsNatifs(pieces);
  // Les autres pièces (Excel, CSV, Word, PowerPoint…) vont dans le bac à sable du code (13 oct. 2026).
  const { deposerPourCode, OUTIL_CODE } = await import('../llm.js');
  const deposees = new Set();
  for (const p of pieces) {
    if (lues.has(p)) continue;
    const bloc = await deposerPourCode(p.chemin, p.nom || 'piece', p.type || 'application/octet-stream');
    if (bloc) { natifs.push(bloc); deposees.add(p); }
  }
  const joints = pieces.map((p) => `${p.nom} (${p.type || 'type inconnu'}, chemin : ${p.chemin}${lues.has(p) ? ' ; jointe ci-dessus, tu la vois directement' : deposees.has(p) ? ` ; déposée dans le bac à sable du code sous le nom ${p.nom}` : ''})`);
  const messages = [
    ...(Array.isArray(historique) ? historique : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
      .slice(-20)
      // Ce qu'AK avait lu ou fait pour une réponse d'avant revient avec elle (bloc 3, 13 oct. 2026) : les 4 dernières.
      .map((m, i, liste) => ({ role: m.role, content: avecMemoire(m, i >= liste.length - 8) })),
    (() => {
      const phrase = `${prenom} (compte ${user?.email || '?'}, ${aujourdhui}, depuis l'application) : ${texte}${joints.length ? `\n(pièces jointes : ${joints.join(' ; ')})` : ''}`;
      return { role: 'user', content: natifs.length ? [...natifs, { type: 'text', text: phrase }] : phrase };
    })(),
  ];

  // Une réaction à la réponse d'avant (« non, pas celui-là », « nickel ») :
  // gardée comme leçon, comme dans Google Chat. Le message est traité ensuite.
  const { apprendre, noterEchange } = await import('./lecons.js');
  try { apprendre({ espace, auteur: message.auteur, texte }); } catch (e) { console.warn('[ak app] leçon non gardée :', e?.message || e); }
  // Les préférences de la personne (questionnaire et ce qu'elle a dit en passant) : comme dans Google Chat, pour elle
  // seule, dans le bloc qui suit le cache (3d, 13 oct. 2026). Avant, l'application ne les lisait pas.
  const { preferencesDe } = await import('./lecons.js');
  const prefs = preferencesDe(user?.email);
  const preferences = prefs ? `\n\n${prefs}` : '';
  // La page Offres : le chat y rédige et corrige les lettres d'intention.
  let cadrePage = '';
  if (contexte?.page === 'offres') {
    cadrePage = `\n\nTU ES SUR LA PAGE OFFRES (les lettres d'intention d'achat, LOI). Le bien d'une offre est un PROJET de la plateforme : « fais l'offre pour X sur le projet de Dieppe » = trouver_bien (par ville, titre, adresse ou locataire). Plusieurs résultats : liste-les numérotés, une ligne chacun (titre, adresse, locataire, prix), et demande lequel ; on affine (« celui de la rue X », « le 2 ») jusqu'à un seul, sans rédiger avant. Un seul : rediger_loi avec son projet_id, le bien vient du projet. Un candidat sans projet (un dossier seul) : rediger_loi avec son deal_id. Il te manque forcément ce qu'on ne t'a pas dit parmi l'acquéreur, le vendeur, le prix et l'apport : demande TOUT ce qui manque en UNE ligne. Ne devine jamais un nom ou un prix.`;
    if (contexte.loi_id) {
      const { contexteLettre } = await import('../offres.js');
      const ctx = await contexteLettre(String(contexte.loi_id));
      if (ctx) cadrePage += `\n${ctx}\nUne correction (« le prix à 190 000 », « enlève la clause de substitution », « ajoute que… ») porte sur CETTE lettre : rediger_loi avec loi_id et seulement ce qui change (champs, ou textes par clé). Une offre pour un autre bien ou un autre acquéreur : une nouvelle lettre, sans loi_id.`;
    }
  }
  // La page Présentations : le chat y crée et retouche les présentations bancaires.
  if (contexte?.page === 'presentations') {
    cadrePage = `\n\nTU ES SUR LA PAGE PRÉSENTATIONS (les dossiers bancaires « Projet de Financement », seize diapositives : un panneau à gauche, une carte à droite). Une présentation part d'un PROJET de la plateforme : « fais la préz du projet de Dieppe » = trouver_bien (par ville, titre, adresse ou locataire). Plusieurs résultats : liste-les numérotés, une ligne chacun, et demande lequel. Un seul : creer_presentation_bancaire avec son projet_id (jamais generer_prez_bancaire ici). Ensuite, une remarque (« mets Jules Barthomeuf en porteur », « à l'attention du Crédit Agricole », « enlève le point 3 du sommaire », « cache la diapo enseignes » ; le porteur et la banque se reportent partout où ils apparaissent : couverture, porteur, merci) = modifier_presentation sur la présentation ouverte, avec tous les changements d'un coup ; réponds en une ligne ce qui a changé. Les loyers autour d'un projet (« va chercher les loyers dans Equimmox ») : loyers_equimmox avec le projet_id de la présentation ouverte, puis tu poses la moyenne et la fourchette sur les diapositives concernées (quartier : « Loyer commercial moyen » ; prix et marché : « Valeur moyenne locative ») avec modifier_presentation, en gardant la source rendue (Equimmox, ou Data-B si Equimmox n'a rien constaté, et tu le dis). Chaque chiffre que tu poses avec modifier_presentation porte sa source (source, et lien si tu l'as) : c'est elle que le mode Sources montre au client. Pour la ville (habitants, revenu médian, chômage, prix du logement), lis donnees_commune et cite ce qu'il rend (INSEE, Le Figaro Immobilier), jamais de mémoire. Tu as accès à Equimmox par cet outil : ne dis jamais le contraire, et ne passe pas par Data-B si on t'a demandé Equimmox. Le prix des murs (« estime le prix des murs », les cases « Prix des murs commerciaux » du quartier et « Valeur moyenne des murs » de prix et marché) : prix_murs_equimmox avec le projet_id, puis la moyenne en €/m² sur ces cases avec modifier_presentation ; ce sont des offres de vente (prix demandés), dis-le. Ne dis jamais qu'aucune source ne donne le prix des murs : Equimmox le donne. Tu peux réécrire un texte entier (une phrase, un point) quand on te le demande ; ne touche jamais un chiffre qu'on ne t'a pas donné.`;
    if (contexte.presentation_id) {
      const { presentationPourAK } = await import('../presentation-bancaire.js');
      const ctx = presentationPourAK(String(contexte.presentation_id));
      if (ctx) cadrePage += `\n${ctx}\nUne correction porte sur CETTE présentation : modifier_presentation avec presentation_id ${contexte.presentation_id}. Une présentation pour un autre projet : creer_presentation_bancaire.`;
    }
  }
  // La page Projets (14 oct. 2026, Jules) : l'éditeur d'un projet, AK à gauche, le projet à droite.
  if (contexte?.page === 'projets') {
    cadrePage = `\n\nTU ES DANS L'ÉDITEUR D'UN PROJET (la fiche que le client voit : marché, bien, locataire, bail, copropriété, simulateur). On te demande de corriger ou d'étayer ses chiffres : « le loyer est trop bas, va chercher des chiffres plus cohérents », « mets le loyer autour d'Equimmox », « la surface du bail est de 82 m² ». Tu cherches, puis tu écris avec modifier_projet, puis tu dis en clair ce qui a changé (avant → après) et pourquoi, en quelques lignes : « J'ai cherché des données plus cohérentes : Equimmox donne 240 €/m²/an à 500 m (avant 180, saisi à la main) ; je l'ai posé en loyer autour. » OÙ CHERCHER : le loyer du marché, loyers_equimmox (baux constatés à 500 m, surface à ±20 %), sinon data_b quoi valeur_locative avec le projet_id (il écrit lui-même la fourchette marche_offre_* du projet) ; le prix des murs, prix_murs_equimmox ; la ville, donnees_commune ; l'étude d'implantation Data-B (un crédit, plusieurs minutes) seulement si on la demande. RÈGLES : chaque chiffre que tu écris porte sa source, telle que tu l'as lue, et sa raison ; tu n'inventes jamais un chiffre et tu ne le changes pas pour qu'il « tombe mieux ». Une surface ne change que pour une surface sourcée (le bail, une surface pondérée, un plan), et tu dis laquelle ; si on te demande de la réduire pour gonfler le loyer au m², tu réponds que tu ne peux le faire qu'avec une source, et tu proposes la surface pondérée ou celle du bail. Le loyer « Le projet » au m² se déduit du loyer et de la surface du simulateur : pour le corriger, corrige l'un d'eux, ou force valeurs_forcees.commercial_loyer_projet avec sa source. Un chiffre calculé (prix de revient, rendement, écarts) se force par valeurs_forcees.<cle> seulement si on le demande. Ne touche jamais un chiffre qu'on ne t'a pas demandé de changer. CE QUE L'ÉQUIPE TE DIT DU BIEN OU DU BAIL EST UNE SOURCE (14 oct. 2026) : « c'est un bail de 10 ans dont 6 ans ferme » s'écrit, avec la source « Indiqué par <prénom> dans le chat » ; tu ajoutes seulement, si aucune pièce ne le porte, qu'il faudra le vérifier sur le bail. Avant de répondre « rien à modifier », compare ce qu'on te dit avec ce que la page AFFICHE (la frise, les cases, la synthèse, données plus bas) : si l'affichage le contredit, corrige les champs qui le pilotent, puis dis ce qui a changé à l'écran. Le bail : la frise se calcule à partir de bail_date_debut, bail_date_echeance et bail_duree_ferme_ans (le nombre d'années fermes : pas d'échéance triennale avant leur fin, « Fin de la période ferme » à la place) ; une échéance triennale à retirer se retire par la période ferme, jamais en déplaçant une date. Les textes du bail se réécrivent aussi : bail_analyse.<id> pour une clause de l'analyse (type_bail, dates_bail, loyer, conditions_exceptionnelles, cession, indexation, depot, charges, taxe_fonciere…), analyse_bail pour la synthèse (tu reprends tout le texte et ne changes que le passage faux) ; les cases du résumé par cases_forcees.bail.<id>.valeur. Ne dis jamais « je n'ai pas d'outil pour ça » sans avoir vérifié cette liste ; si un affichage ne dépend d'aucun champ que tu peux écrire, dis lequel et où le corriger à la main. La page à droite se met à jour seule après ta retouche : ne demande jamais de la recharger.`;
    if (contexte.projet_id) {
      const { projetPourAK } = await import('../projet-sources.js');
      const ctx = await projetPourAK(String(contexte.projet_id));
      if (ctx) cadrePage += `\n${ctx}\nUne correction porte sur CE projet : modifier_projet avec projet_id ${contexte.projet_id}, tous les changements d'un coup.`;
    }
  }
  // Un dossier ouvert (17 oct. 2026, Jules) : AK à gauche, le dossier à droite, à toutes les étapes.
  if (contexte?.page === 'dossiers' && contexte.deal_id) {
    const { Records } = await import('../db.js');
    const deal = Records.findBy('Deal', 'deal_id', String(contexte.deal_id));
    if (deal) {
      const lot = deal.lots?.[0];
      const titre = deal.nom || lot?.synthese?.titre || deal.deal_id;
      const etapes = { reception: 'Email', preanalyse: 'Pré-analyse', documents: 'Data Room', analyse: 'Analyse', plateforme: 'Plateforme', clients: 'Clients', offre: 'Offre', bancaire: 'Dossier bancaire' };
      const etape = etapes[contexte.etape] || null;
      cadrePage = `\n\nTU ES DANS UN DOSSIER OUVERT À DROITE : « ${titre} » (deal_id ${deal.deal_id}, statut ${deal.statut || 'analyse'}${etape ? `, étape ouverte : ${etape}` : ''}${lot?.evaluation?.verdict ? `, verdict ${lot.evaluation.verdict}` : ''}). Une question ou une correction sans autre précision porte sur CE dossier : etat_dossier avec ce deal_id pour lire ce qu'il contient, modifier_dossier avec ce deal_id pour corriger un fait (loyer, prix, surface, locataire, bail…), mails_du_dossier pour les échanges. L'écran se met à jour après ta réponse. Ne parle d'un autre dossier que si on te le nomme.`;
    }
  }
  // La page Emailing : le chat y conçoit les séquences d'emails, avec l'équipe.
  if (contexte?.page === 'emailing') {
    const E = await import('../emailing/index.js');
    const listes = E.listes();
    cadrePage = `\n\nTU ES SUR LA PAGE EMAILING, avec ${prenom}, pour CONCEVOIR une séquence d'emails (rediger_sequence). Tu es un rédacteur marketing exigeant, pas un générateur de relances.
- Klocka accompagne des particuliers qui investissent dans des MURS COMMERCIAUX (un local loué à un commerce : boulangerie, pharmacie…) : chercher le bien, l'analyser (emplacement, bail, locataire), négocier, financer. Les leads sont des inscrits à un webinaire, rien d'autre : ils ne connaissent pas encore Klocka.
- Une séquence n'est JAMAIS une simple relance. Chaque email apporte quelque chose : une idée qu'on retient, un chiffre, un cas concret, une erreur à éviter, une objection levée, une preuve. L'objectif est celui de l'équipe : apporter de la valeur chaque semaine sans rien vendre, ou amener à un appel découverte, ou autre ; suis-le. Sans objectif dit, demande-le. Un appel à l'action au plus par email, discret (lire, revoir le replay, répondre) quand le but est la valeur.
- Avant d'écrire, si l'objectif, le webinaire (sujet, date), l'appel à l'action ou le lien manquent : pose en UNE fois les deux ou trois questions qui comptent. Si la demande suffit, écris une première version complète tout de suite et dis ce que tu as supposé.
- Style des emails : vouvoiement, phrases courtes, concret, chaleureux sans emphase ; pas de tiret cadratin, pas d'emoji, pas de jargon creux (« n'hésitez pas », « solution innovante »). Objets courts et précis (pas de MAJUSCULES, pas de « Re: » trompeur). Un bloc texte = un ou deux paragraphes ; signature « L'équipe Klocka » sauf demande contraire. {{prenom}} pour personnaliser, avec parcimonie. Un lien inconnu : https://klocka.immo, et signale-le.
- Jours : chaque email a son jour d'envoi compté depuis l'inscription (0, 7, 14… pour un rythme hebdomadaire). Le rythme et le nombre d'emails sont ceux que l'équipe demande ; sans indication, propose-les (12 emails au plus par séquence).
- Jamais de chiffre ni de cas inventé présenté comme réel (« un cas réel », « un client a gagné ») : un exemple chiffré s'annonce comme un exemple type, et un témoignage ou un dossier réel se demande à l'équipe.
- Après rediger_sequence : résume chaque email en une ligne (jour, idée), propose une ou deux améliorations. Une remarque (« le 2 est trop long », « ajoute un témoignage », « plus direct ») : réécris avec sequence_id, la liste complète des emails.${STYLE_ATELIER}
Listes de contacts existantes : ${listes.length ? listes.map((l) => `« ${l.nom} » (${l.total})`).join(', ') : 'aucune encore (l\'équipe importe les inscrits dans Contacts)'}.`;
    // Les newsletters (9 oct. 2026) : l'atelier en plein écran, le chat à gauche, la newsletter à droite.
    if (contexte.mode === 'newsletter') {
      const N = await import('../emailing/newsletters.js');
      const { resumeAssets } = await import('../emailing/assets.js');
      cadrePage = `\n\nTU ES DANS L'ATELIER DES NEWSLETTERS (page Emailing), avec ${prenom}, pour CONCEVOIR une newsletter (rediger_newsletter). Tu es un rédacteur marketing exigeant.
- Klocka accompagne des particuliers qui investissent dans des MURS COMMERCIAUX (un local loué à un commerce). Les contacts sont les inscrits d'un webinaire : une cohorte fixe, qui reçoit un mail tous les quatorze jours environ, à date fixe.
- Chaque mail APPORTE DE LA VALEUR : une idée, un chiffre type annoncé comme tel, une erreur à éviter, une méthode, un outil. Au plus un appel à l'action, et le plus souvent vers un ASSET : le simulateur (lien personnel {{lien_simulateur}}, qui permet ensuite de parler au fondateur) ou un lead magnet. Ne vends rien ; le call vient du simulateur.
- Avant d'écrire, si le sujet du webinaire, le nombre de mails ou l'angle manquent, pose en UNE fois les deux ou trois questions qui comptent ; sinon écris tout de suite une première version complète (4 mails par défaut) et dis ce que tu as supposé.
- Style : vouvoiement, phrases courtes, concret, chaleureux sans emphase ; pas de tiret cadratin, pas d'emoji, pas de jargon creux. Objets courts et précis. Signature « L'équipe Klocka ». {{prenom}} avec parcimonie.
- Un asset existant (« mets le simulateur dans le mail 2 ») : inserer_asset, avec le rang du mail et le nom de l'asset. En rédigeant un mail neuf, tu peux aussi recopier ses blocs tels quels (mêmes textes, même lien).
- Jamais de chiffre ni de cas inventé présenté comme réel.
- Après rediger_newsletter : résume chaque mail en une ligne (date, idée), propose une ou deux améliorations. Une remarque : réécris avec newsletter_id, la liste complète des mails non envoyés.
${STYLE_ATELIER}
Listes existantes : ${E.listes().map((l) => `« ${l.nom} » (${l.abonnes} abonnés)`).join(', ') || 'aucune encore'}.
ASSETS DISPONIBLES :\n${resumeAssets()}`;
      const n = contexte.newsletter_id ? N.newsletter(String(contexte.newsletter_id)) : null;
      if (n) {
        const noms = new Map(E.listes().map((l) => [l.id, l.nom]));
        const resume = n.mails.map((m, i) => `Mail ${i + 1} (${m.jour || '?'}, ${m.statut}) objet « ${m.objet} », aperçu « ${m.apercu || ''} » : ${JSON.stringify((m.design?.blocs || []).map((b) => ({ type: b.type, ...(b.texte ? { texte: b.texte } : {}), ...(b.lien ? { lien: b.lien } : {}) })))}`).join('\n');
        cadrePage += `\nLA NEWSLETTER OUVERTE À DROITE (newsletter_id ${n.id}, « ${n.nom} », ${n.statut}, listes ${(n.listes || []).map((x) => noms.get(x)).filter(Boolean).join(', ') || 'aucune'}, départ ${n.depart}, tous les ${n.rythme_jours} jours à ${n.heure}) ; l'équipe a pu la retoucher, c'est la version à jour :\n${resume}\nUne correction porte sur CETTE newsletter : rediger_newsletter avec newsletter_id. Les mails envoyés ne se réécrivent pas.`;
        // Le mail ouvert dans l'éditeur, à droite : « change le titre », « plus court » portent sur lui (9 oct. 2026).
        const k = contexte.mail_id ? n.mails.findIndex((m) => m.id === String(contexte.mail_id)) : -1;
        if (k >= 0) cadrePage += `\nLE MAIL OUVERT À DROITE est le Mail ${k + 1} (« ${n.mails[k].objet} ») : une remarque sans autre précision porte sur lui. Réécris-le, et recopie les autres mails à l'identique.`;
      }
    }
    if (contexte.sequence_id) {
      const s = E.sequence(String(contexte.sequence_id));
      if (s) {
        let jour = 0;
        const resume = (s.etapes || []).map((e, i) => `Email ${i + 1} (jour ${(jour += i ? Number(e.delai_jours) || 0 : 0)}, design ${e.design?.theme || 'clair'}) objet « ${e.objet} », aperçu « ${e.apercu || ''} » : ${JSON.stringify((e.design?.blocs || []).map((b) => ({ type: b.type, ...(b.texte ? { texte: b.texte } : {}), ...(b.lien ? { lien: b.lien } : {}), ...(b.src ? { src: b.src } : {}) })))}`).join('\n');
        cadrePage += `\nLA SÉQUENCE OUVERTE À DROITE (sequence_id ${s.id}, « ${s.nom} », ${s.statut}, liste ${s.liste || 'aucune'}) ; l'équipe a pu la retoucher à la main, c'est la version à jour :\n${resume}\nUne correction porte sur CETTE séquence : rediger_sequence avec sequence_id. ${s.statut === 'active' ? 'Elle est ACTIVE : préviens que les changements valent pour les prochains envois.' : ''}`;
      }
    }
  }
  cadrePage += await cadreLayer(texte, user);
  cadrePage += cadreEcran(contexte?.ecran);
  const fond = [];
  const apres = [];
  const actions = [];
  const outils = [];
  const trace = [];
  // Ce que l'écran montre sous la réponse (1.8) : la fiche analysée, la fiche client à relire, les échéances, les liens d'une note d'appel.
  const blocs = [];
  const noterBloc = (nom, r) => {
    if (nom === 'analyser_fiche' && r?.deal_id && r?.cree) blocs.push({ type: 'fiche', deal_id: r.deal_id });
    if (nom === 'fiche_client_decouverte' && r?.champs) blocs.push({ type: 'client', champs: r.champs });
    if (nom === 'echeances' && r?.ok && !blocs.some((b) => b.type === 'echeances')) blocs.push({ type: 'echeances' });
    if (nom === 'note_d_appel' && r) blocs.push({ type: 'note', dossier: r.dossier?.lien || null, agent: r.agent?.url || null });
  };
  // La v2 : la consigne, les outils regroupés et la traduction des appels vers les anciens outils.
  const v2 = enV2() ? await (async () => {
    const O = await import('./outils-v2.js');
    const { listeProcedures, lireProcedure } = await import('./procedures.js');
    return { consigne: await consigneV2(), outils: O.outilsV2(OUTILS, { listeProcedures: listeProcedures() }), serveurs: O.SERVEURS_V2, groupes: O.GROUPES, versAncien: O.versAncien, lireProcedure };
  })() : null;
  const { text, tours = null, limite = false, fichiers = [] } = await runAgent({
    journal: { chat: 'admin', par: user?.email || null, page: contexte?.page || null },
    signal,
    surTexte,
    effort: effortDuChat(),
    // Du plus stable au plus changeant (1.7) : le document de Jules et le cadre, puis ce que l'équipe lui a appris, puis la page ouverte.
    system: v2
      ? [{ texte: v2.consigne, cache: true }, { texte: consigneApprise(), cache: true }, { texte: nomsV2(cadrePage, v2.groupes) + preferences }]
      : [{ texte: consigneStable() + CADRE_APP + MODELE_DONNEES, cache: true }, { texte: consigneApprise(), cache: true }, { texte: cadrePage + preferences }],
    messages,
    tools: v2 ? v2.outils : OUTILS,
    serveurs: v2 ? v2.serveurs : [OUTIL_CODE],
    model: MODELE,
    cache: true,
    onTool: tracer(async (appelRecu) => {
      // Stop : plus rien ne s'exécute, le modèle est prié de conclure sur ce qui est fait.
      if (estAnnule?.()) return { ok: false, error: "La personne a arrêté la demande : ne fais plus rien, dis en une ligne ce qui a déjà été fait." };
      // En v2, une fiche métier se lit directement ; un outil regroupé redevient l'ancien outil, qui s'exécute tel quel.
      if (v2 && appelRecu.name === 'lire_procedure') return v2.lireProcedure(appelRecu.input);
      const traduit = v2 ? v2.versAncien(appelRecu) : null;
      if (traduit?.erreur) return { ok: false, error: traduit.erreur };
      const appel = traduit || appelRecu;
      outils.push(appel.name);
      surEtape?.(libelleOutil(appel.name, appel.input));
      const resultat = await executerOutil(appel, user, { fond: (t) => fond.push(t), apres: (t) => apres.push(t), message });
      noterBloc(appel.name, resultat);
      souvenirs.push({ outil: appel.name, args: appel.input, resultat });
      if (!LECTURES.has(appel.name)) {
        if (!estEchec(resultat)) actions.push({ ...appel, resultat });
        try { journaliser({ outil: appel.name, args: appel.input, resultat, user, via: "AK dans l'application" }); } catch (e) { console.warn('[ak app] journalisation impossible :', e?.message || e); }
      }
      return resultat;
    }, trace),
  });

  // Le mail rédigé : le brouillon qu'AK garde pour cet espace.
  let brouillon = null;
  if (outils.some((o) => MAILS.has(o))) {
    const { brouillonEnAttente } = await import('./mail-agent.js');
    const b = brouillonEnAttente(espace);
    if (b) brouillon = { destinataire: b.a || '', objet: b.objet || '', corps: b.corps || '', deal_id: b.deal_id || null, intention: b.intention || null, ak_id: b.id };
  }
  // Les tâches de fond partent, et s'annonceront par une notification.
  if (fond.length && !auBanc()) {
    const { lancerTachesApp } = await import('./veille.js');
    lancerTachesApp(fond, user);
  }
  let reponse = [String(text || '').trim() || 'Rien à répondre là-dessus.', ...(brouillon ? [] : apres)].join('\n\n');
  // Une LOI rédigée sur la page Offres : elle est déjà ouverte à droite.
  // Sous la réponse, ses sources : d'où vient chaque champ, à ouvrir sans quitter la page.
  let sources = null;
  const loi = contexte?.page === 'offres' ? actions.find((a) => a.name === 'rediger_loi' && a.resultat?.nouvelle) : null;
  if (loi) {
    reponse = 'Voici votre LOI rédigée, en deux modèles à droite : choisissez celui que vous préférez. Vous pourrez ensuite l’éditer directement, ou me dire ci-dessous ce qu’il faut changer.';
    try {
      const { sourcesDe } = await import('../offres.js');
      const liste = await sourcesDe(loi.resultat.loi_id);
      if (liste?.length) sources = { loi_id: loi.resultat.loi_id, liens: liste.map((x) => ({ id: x.id, titre: x.titre, detail: x.detail })) };
    } catch (e) { console.warn('[ak app] sources de la LOI :', e?.message || e); }
  }
  try { noterEchange({ espace, auteur: message.auteur, demande: texte, reponse }); } catch { /* la mesure ne bloque pas la réponse */ }
  // Le Layer (phase 8) : les faits que la réponse a cités, au journal de chaque recherche (matière de l'évaluation).
  try {
    const { faitsCites } = await import('../layer-evaluation.js');
    const { noterCites } = await import('../layer-schema.js');
    for (const s of souvenirs.filter((x) => x.outil === 'layer_chercher' && x.resultat?.requete_id)) noterCites(s.resultat.requete_id, faitsCites(reponse, s.resultat.faits || []));
  } catch { /* la mesure ne bloque pas la réponse */ }
  return { texte: reponse, actions, outils, brouillon, taches: fond.map((t) => t.libelle), trace, tours, blocs, memoire: memoireDesOutils(souvenirs) || null, ...(fichiers.length ? { fichiers } : {}), ...(limite ? { limite } : {}), ...(sources ? { sources } : {}) };
}
