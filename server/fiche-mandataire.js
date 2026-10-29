// La fiche du mandataire (24 oct. 2026, Jules). Sur la carte, un point n'est
// que de la donnée brute : un commerce, son propriétaire, un signal ; il
// n'appartient à personne. La fiche naît quand le mandataire agit (il ajoute
// le commerce à une liste, passe au commerce, appelle) : elle lui appartient,
// aucun autre mandataire ne peut la prendre. C'est la fiche propriétaire
// (ProprietaireMandataire) : une seule, de la Prospection à la vente.
//
// Elle avance par la dictée : le mandataire dit ce qui s'est passé, Haka dit
// ce qu'il a compris, le mandataire confirme ou corrige, et la fiche se met à
// jour (infos nouvelles, « à confirmer » quand elles viennent d'un tiers ;
// statut suivant ; ligne d'historique ; tâche).
//
// En Prospection, deux statuts : À contacter, Contacté (et Pas d'intérêt pour
// en sortir). Au rendez-vous fixé, la fiche passe dans Biens, sans copie :
// Visite, Avis de valeur, Mandat, Commercialisation, Offres, Vente (27 oct. 2026 : six étapes, plus d'Analyse)
// (26 oct. 2026) ; chaque étape validée s'écrit dans l'historique.
// Dans Biens, un refus du prix met la fiche En pause, avec une relance.

import { Records } from './db.js';
import { CAS_RESTITUTION, appliquerRestitution } from './restitution-avis.js';
// Les étapes faites se comptent comme à l'écran (src/lib/biens-mandataire.js).
import { ETAPES_BIEN, etapesFaites as faitesDuBien, marqueurDe } from '../src/lib/biens-mandataire.js';

const maintenant = () => new Date().toISOString();
const emailDe = (u) => String(u?.email || '').toLowerCase();
const PARIS = 'Europe/Paris';

/** Les étapes d'un bien, dans l'ordre. */
export const ETAPES_BIENS = ETAPES_BIEN.map((e) => [e.id, e.label]);
// Les anciens mots (avant le 26 oct. 2026), encore dits par Haka ou la dictée : la visite faite, l'avis accepté.
export const ALIAS_ETAPES = { visite: 'previsite', prix_accord: 'estimation', analyse: 'mandat' };
const IDS = ETAPES_BIENS.map(([k]) => k);

/** Une fiche est dans Biens dès le rendez-vous fixé. */
export const dansBiens = (p) => ['rdv_pris', 'mandat_signe'].includes(p?.statut);

/** Les mots de la Prospection : deux statuts, et Pas d'intérêt pour sortir. */
export const MOTS_PROSPECTION = { a_appeler: 'À contacter', a_recontacter: 'À contacter', contacte: 'Contacté', en_discussion: 'Contacté', pas_vendeur: "Pas d'intérêt", rdv_pris: 'Dans Biens', mandat_signe: 'Dans Biens' };

const ajouter = (p, entree) => [...(p.historique || []), { le: maintenant(), ...entree }];

function sienne(id, user) {
  const p = Records.get('ProprietaireMandataire', id);
  return p && p.mandataire_email === emailDe(user) ? p : null;
}

/** Valider une étape de Biens (et celles d'avant) : le statut avance, l'historique s'en souvient. */
export function validerEtape(id, etape, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  if (!dansBiens(p)) return { ok: false, error: "Cette fiche n'est pas encore dans Biens : il faut un rendez-vous fixé." };
  const cle = ALIAS_ETAPES[etape] || etape;
  const i = IDS.indexOf(cle);
  if (i < 0) return { ok: false, error: 'Étape inconnue.' };
  const mot = ETAPES_BIENS[i][1];
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), validee: marqueurDe(cle), pause: null }, historique: ajouter(p, { type: 'etape', texte: `Étape validée : ${mot}` }) }) };
}

/** Dans Biens, le propriétaire refuse le prix : En pause, une relance programmée et un nouvel argument. */
export async function mettreEnPause(id, { argument = null, dans_jours = 30 } = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const { argumentDe, signauxDe } = await import('./mandataire-matin.js');
  const { drapeauxDe } = await import('./off-market/simple.js');
  const cs = p.commerce_simple_id ? Records.get('CommerceSimple', p.commerce_simple_id) : null;
  const cible = p.cible_id ? Records.get('Cible', p.cible_id) : null;
  const arg = String(argument || '').trim() || argumentDe(signauxDe(cs, drapeauxDe, cible));
  const le = new Date(Date.now() + Math.max(1, Number(dans_jours) || 30) * 86400000).toISOString();
  const nom = p.commerce || p.nom || 'ce propriétaire';
  const rappel = Records.create('Rappel', {
    espace: 'mandataire', genre: 'relance', proprietaire_id: p.id, nom, quoi: `Relancer ${nom} (en pause)`, note: `Nouvel argument : ${arg}`,
    telephone: p.telephone || null, echeance: le, cree_le: maintenant(), cree_par: user?.email || null, fait_le: null,
  });
  return { ok: true, rappel_id: rappel.id, proprietaire: Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), pause: { le: maintenant(), relance_le: le, argument: arg } }, historique: ajouter(p, { type: 'pause', texte: `En pause : relance le ${new Date(le).toLocaleDateString('fr-FR', { timeZone: PARIS })}. Nouvel argument : ${arg}` }) }) };
}

/** Reprendre une fiche en pause. */
export function reprendre(id, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), pause: null, perdu: null }, historique: ajouter(p, { type: 'pause', texte: 'Reprise' }) }) };
}

const AGES_LONGS = { '70+': '70 ans et plus', '50-70': '50 à 70 ans', '-50': 'moins de 50 ans' };
const sirenLisible = (x) => (x ? String(x).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3') : null);
const millions = (n) => (Number.isFinite(Number(n)) && n !== null ? `${(Number(n) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€` : null);
const anneeDe = (d) => (/^\d{4}/.test(String(d || '')) && !String(d).startsWith('1900') ? String(d).slice(0, 4) : null);

/** Ce qu'on sait d'une société, en lignes courtes : forme, SIREN, création, siège, effectif, comptes, source. */
function lignesSociete(x) {
  if (!x) return [];
  return [
    [x.nom, x.forme && !String(x.nom || '').toUpperCase().startsWith(String(x.forme).toUpperCase()) ? x.forme : null].filter(Boolean).join(' · ') || null,
    x.siren ? `SIREN ${sirenLisible(x.siren)}` : null,
    anneeDe(x.creation) ? `Créée en ${anneeDe(x.creation)}` : null,
    x.siege?.adresse ? `Siège : ${x.siege.adresse}` : null,
    x.effectif ? `Effectif : ${x.effectif}` : null,
    x.derniers_comptes?.ca != null ? `Chiffre d'affaires : ${millions(x.derniers_comptes.ca)}${x.derniers_comptes.resultat_net != null ? ` · résultat : ${millions(x.derniers_comptes.resultat_net)}` : ''}` : null,
  ].filter(Boolean);
}

/**
 * Pure : le détail de chaque rangée de la fiche, dépliable d'une flèche (25 oct. 2026, Jules : « voir le détail de
 * chaque champ »). Des lignes de texte, sources comprises ; une rangée sans détail n'a pas de flèche.
 */
export function detailsDe({ p = {}, commerce: cs = null, cible = null, signaux = [] } = {}) {
  const ex = cs?.exploitant || null;
  const pr = cs?.proprietaire || cible?.proprietaire || null;
  const soc = cible?.societe || null;
  const gerants = (pr?.gerants || soc?.gerants || []).filter((g) => !g.personne_morale);
  const source = (x) => (x ? `Source : ${x}` : null);
  return {
    exploitant: [
      ...lignesSociete(ex),
      cs?.depuis && anneeDe(cs.depuis) ? `Établissement ouvert en ${anneeDe(cs.depuis)}` : null,
      cs?.activite ? `Activité : ${cs.activite}` : null,
      source(ex?.source),
    ].filter(Boolean),
    murs: [
      ...lignesSociete({ ...(soc || {}), ...(pr || {}), siege: pr?.siege || soc?.siege, creation: pr?.creation || soc?.creation }),
      pr?.parcelle ? `Parcelle cadastrale ${pr.parcelle}` : null,
      cs?.lien_motif ? `Lien avec l'exploitant : ${cs.lien_motif}` : null,
      source(pr?.source),
    ].filter(Boolean),
    gerant: gerants.map((g) => [g.nom, g.qualite, AGES_LONGS[g.tranche_age]].filter(Boolean).join(' · ')),
    // La source du numéro se lit déjà à côté de lui : le détail dit l'autre numéro, celui du commerce.
    telephone: [
      cs?.telephone || cible?.telephone ? `Numéro du commerce : ${cs?.telephone || cible?.telephone}` : null,
    ].filter(Boolean),
    signaux: signaux.length > 1 || signaux.some((x) => x.source) ? signaux.map((x) => [x.texte, [x.source, x.date ? new Date(x.date).toLocaleDateString('fr-FR', { timeZone: PARIS }) : null].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) : [],
  };
}

/**
 * La fiche sur une page : le commerce et l'exploitant ; le propriétaire des murs (SCI, gérant, âge) ; les signaux avec
 * leur source et leur date ; le contact et sa source ; les recherches clients compatibles ; le statut, la prochaine
 * action et l'historique ; et, dans Biens, ses étapes.
 */
export async function fiche(id, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  return composer(p);
}

/**
 * L'aperçu d'un commerce sans fiche (25 oct. 2026, Jules : « exactement la fiche de la carte des listes ») : la même
 * fiche, composée depuis le commerce seul, sans rien créer. Elle naît au premier geste (`ficheDuCommerce`). Refusée si un
 * autre mandataire tient le commerce ; si c'est le mien, c'est sa vraie fiche.
 */
export async function ficheDeCommerce(commerceId, user) {
  const c = Records.get('CommerceSimple', commerceId);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const deja = Records.list('ProprietaireMandataire').find((x) => x.commerce_simple_id === commerceId);
  if (deja) return deja.mandataire_email === emailDe(user) ? composer(deja) : { ok: false, error: 'Ce commerce est déjà suivi par un autre mandataire.' };
  const { nomLisible, societeLisible, rueLisible } = await import('./off-market/casse.js');
  const ex = c.exploitant || {};
  const telephone = String(c.lien || '').startsWith('exploitant') ? (c.contact?.telephone || c.telephone || null) : null;
  const virtuelle = {
    id: null, apercu: true, statut: null, commerce_simple_id: commerceId, mandataire_email: emailDe(user),
    nom: c.proprietaire?.nom ? nomLisible(c.proprietaire.nom, { forme: c.proprietaire.forme }) : null,
    commerce: c.enseigne ? societeLisible(c.enseigne) : nomLisible(ex.nom || c.nom, { forme: ex.forme }),
    activite: c.activite || null, ville: c.ville || null, adresse: rueLisible(c.adresse), telephone,
    telephone_source: telephone ? 'commerce (exploitant propriétaire)' : null, historique: [],
  };
  return composer(virtuelle);
}

async function composer(p) {
  const { ficheCourte, signauxDe } = await import('./mandataire-matin.js');
  const { drapeauxDe } = await import('./off-market/simple.js');
  const cs = p.commerce_simple_id ? Records.get('CommerceSimple', p.commerce_simple_id) : null;
  const cible = p.cible_id ? Records.get('Cible', p.cible_id) : null;
  const courte = ficheCourte({ p, commerce: cs, cible, drapeaux: drapeauxDe });
  const cor = p.corrections || {};
  const brut = cs ? drapeauxDe(cs) : null;
  const signaux = brut ? brut.map((d) => ({ texte: d.texte, source: d.source || null, date: d.date || null })) : signauxDe(null, drapeauxDe, cible).map((s) => ({ texte: s.texte, source: 'Prospection par rue', date: cible?.classee_le || null }));
  const { matcheurInvestisseurs } = await import('./mandataire-agent.js');
  const investisseurs = await (await matcheurInvestisseurs())({ ...(cible || {}), ...p, activite: p.activite || cs?.activite || cible?.activite, ville: p.ville || cs?.ville || cible?.ville }).catch(() => []);
  // Dans Biens : les objets nés de la fiche (estimation rattachée, puis mandat, dossier, mise en marché).
  let biens = null;
  if (dansBiens(p)) {
    const estimation = Records.list('EstimationMandataire').find((e) => e.proprietaire_id === p.id) || null;
    const mandat = estimation ? Records.list('MandatMandataire').find((m) => m.estimation_id === estimation.id) || null : null;
    const dossier = mandat ? Records.list('DossierMandataire').find((d) => d.mandat_id === mandat.id) || null : null;
    const marche = dossier ? Records.list('MiseEnMarche').find((k) => k.dossier_id === dossier.id) || null : null;
    const faites = faitesDuBien({ proprietaire: p, estimation, mandat, dossier, marche });
    biens = { etapes: ETAPES_BIENS.map(([k, mot]) => ({ id: k, mot, faite: faites.has(k) })), en_cours: IDS[Math.min(IDS.length - 1, Math.max(-1, ...IDS.map((k, i) => (faites.has(k) ? i : -1))) + 1)], pause: p.biens?.pause || null };
  }
  return {
    ok: true,
    fiche: {
      id: p.id, apercu: !!p.apercu, statut: p.statut, statut_mot: p.apercu ? 'Pas encore de fiche' : MOTS_PROSPECTION[p.statut] || p.statut, dans_biens: dansBiens(p),
      commerce: p.commerce || cs?.enseigne || cible?.enseigne || null, activite: p.activite || cs?.activite || cible?.activite || null,
      adresse: [p.adresse || cs?.adresse || cible?.adresse, p.ville || cs?.ville || cible?.ville].filter(Boolean).join(', ') || null,
      // Les corrections du mandataire passent devant les registres (25 oct. 2026). Plus d'accroche (Jules).
      exploitant: { nom: cor.exploitant || courte.exploitant, depuis: cor.exploitant ? null : courte.depuis },
      murs: { proprietaire: cor.murs || courte.proprietaire, forme: cor.murs ? null : courte.forme, gerant: cor.gerant ? { nom: cor.gerant, age: null } : courte.gerant },
      corrections: cor,
      // La classe d'actif (26 oct. 2026) : commerce, bureaux, entrepôt.
      classe: cs?.classe || 'commerce',
      // Les parties libres ajoutées à la fiche (26 oct. 2026).
      sections: Array.isArray(p.sections) ? p.sections : [],
      // La préparation du rendez-vous (26 oct. 2026) : prête en fond au rendez-vous fixé, mise à jour la veille à 18 h.
      preparation: p.preparation || null,
      // Où est le commerce, pour sa vitrine (Street View) en tête de fiche (25 oct. 2026).
      position: cs?.lat != null && cs?.lon != null ? { lat: cs.lat, lon: cs.lon } : cible?.lat != null && cible?.lon != null ? { lat: cible.lat, lon: cible.lon } : null,
      // La liste où vit la fiche (25 oct. 2026) : « Dans la liste « Lyon » · changer ».
      liste: p.liste_id ? (({ id, nom }) => ({ id, nom }))(Records.get('ListeMandataire', p.liste_id) || { id: p.liste_id, nom: 'Liste' }) : null,
      details: detailsDe({ p, commerce: cs, cible, signaux }),
      signaux,
      contact: { telephone: p.telephone || null, telephone_source: p.telephone_source || null, email: p.email || null, a_confirmer: p.a_confirmer || {} },
      investisseurs,
      prochaine_action: p.prochaine_action || null, prochaine_action_le: p.prochaine_action_le || null,
      historique: [...(p.historique || [])].reverse(),
      biens,
    },
  };
}

/**
 * La dictée, premier temps : Haka lit ce que le mandataire a dit et propose ce qu'il a compris. Rien n'est écrit.
 * `texte` ou `audio` (transcrit). Rend une proposition à confirmer ou corriger.
 */
export async function lireDictee(id, { texte = null, audio = null } = {}, user, { llm = null } = {}) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  let dit = String(texte || '').trim();
  if (!dit && audio) {
    const { transcrire } = await import('./prospection/appel.js');
    try { dit = String(await transcrire(audio) || '').trim(); } catch (e) { return { ok: false, error: `Transcription impossible : ${e?.message || e}. Écrivez-le en une phrase.` }; }
  }
  if (!dit) return { ok: false, error: "Rien à lire : dictez ou écrivez ce qui s'est passé." };
  const enBiens = dansBiens(p);
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS });
  const invoquer = llm || (await import('./llm.js')).invokeLLM;
  const { mesurer } = await import('./llm-couts.js');
  const { resultat: lu } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invoquer({
    prompt:
      `Un mandataire immobilier raconte ce qui vient de se passer avec ${p.nom || 'le propriétaire'} des murs de ${p.commerce || 'ce commerce'}${p.ville ? ` à ${p.ville}` : ''}. ${enBiens ? 'Le bien est déjà en cours de vente (rendez-vous fixé).' : 'Le commerce est en prospection.'}\n\nCe qu'il dit :\n« ${dit.slice(0, 6000)} »\n\nNous sommes le ${aujourdhui}. Réponds en JSON :\n` +
      `- compris : en une ou deux phrases, ce que tu as compris (au mandataire, « vous »).\n` +
      `- issue : ${enBiens ? "une étape franchie parmi visite (la visite est faite), prix_accord (le propriétaire accepte le prix de l'avis), pause (il refuse le prix ou veut attendre), ou null" : "contacte (joint, rien de conclu ou à suivre), rdv (un rendez-vous est convenu), pas_interet (il ne vendra pas), ou null"}.\n` +
      (enBiens ? `- restitution : si le propriétaire réagit à l'avis de valeur envoyé, le cas parmi ${Object.keys(CAS_RESTITUTION).join(', ')} (accord_conseille : d'accord sur le prix conseillé ; accord_fourchette ou accord_au_dessus : d'accord à un autre prix ; reflechit ; sans_reponse ; consulte : famille, comptable ; attend : un document, une fin de bail, une succession ; trop_bas : refuse le prix ; concurrent : a signé ailleurs ; plus_vendeur ; injoignable ; bail_change : le bail change la valeur), sinon null. Avec restitution, issue vaut null.\n- restitution_prix : le prix convenu ou demandé, en euros, sinon null.\n- restitution_date : la date qu'il donne (AAAA-MM-JJ), sinon null.\n` : '') +
      `- rdv_quand : si un rendez-vous est convenu, sa date-heure AAAA-MM-JJTHH:MM (heure de Paris), sinon null.\n` +
      `- infos : les informations nouvelles sur le propriétaire ou le commerce, chacune { champ: "telephone" | "email" | "nom" | "remarque", valeur, a_confirmer } ; a_confirmer vaut true si elle vient d'un tiers (un voisin, l'exploitant, un employé) et non du propriétaire lui-même.\n` +
      `- tache : la prochaine chose à faire, { quoi: « Appeler M. Bernard », quand: AAAA-MM-JJ }, ou null.\n` +
      `- note : l'essentiel pour l'historique, une phrase.`,
    response_json_schema: {
      type: 'object',
      properties: {
        compris: { type: 'string' },
        issue: { type: ['string', 'null'] },
        rdv_quand: { type: ['string', 'null'] },
        restitution: { type: ['string', 'null'] },
        restitution_prix: { type: ['number', 'string', 'null'] },
        restitution_date: { type: ['string', 'null'] },
        infos: { type: 'array', items: { type: 'object', properties: { champ: { type: 'string' }, valeur: { type: 'string' }, a_confirmer: { type: 'boolean' } }, required: ['champ', 'valeur'] } },
        tache: { type: ['object', 'null'], properties: { quoi: { type: 'string' }, quand: { type: ['string', 'null'] } } },
        note: { type: 'string' },
      },
      required: ['compris', 'note'],
    },
  }));
  if (!lu || typeof lu !== 'object') return { ok: false, error: "Haka n'a pas pu le lire : réessayez, ou écrivez-le autrement." };
  const issues = enBiens ? ['visite', 'prix_accord', 'pause'] : ['contacte', 'rdv', 'pas_interet'];
  const champs = ['telephone', 'email', 'nom', 'remarque'];
  return {
    ok: true,
    dit,
    proposition: {
      compris: String(lu.compris || '').trim(),
      issue: issues.includes(lu.issue) ? lu.issue : null,
      rdv_quand: lu.rdv_quand || null,
      restitution: enBiens && CAS_RESTITUTION[lu.restitution] ? { cas: lu.restitution, prix: lu.restitution_prix ?? null, date: lu.restitution_date || null, mot: CAS_RESTITUTION[lu.restitution].mot } : null,
      infos: (Array.isArray(lu.infos) ? lu.infos : []).filter((x) => champs.includes(x?.champ) && String(x?.valeur || '').trim()).map((x) => ({ champ: x.champ, valeur: String(x.valeur).trim().slice(0, 300), a_confirmer: !!x.a_confirmer })),
      tache: lu.tache?.quoi ? { quoi: String(lu.tache.quoi).slice(0, 200), quand: lu.tache.quand || null } : null,
      note: String(lu.note || '').trim() || dit.slice(0, 200),
    },
  };
}

/**
 * La dictée, second temps : le mandataire a confirmé (ou corrigé) la proposition ; la fiche se met à jour. Les infos
 * d'un tiers restent marquées « à confirmer ». Un rendez-vous fait passer la fiche dans Biens.
 */
export async function appliquerDictee(id, proposition = {}, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const faits = [];
  const patch = {};
  const aConfirmer = { ...(p.a_confirmer || {}) };
  for (const i of proposition.infos || []) {
    if (!['telephone', 'email', 'nom', 'remarque'].includes(i.champ)) continue;
    const v = String(i.valeur || '').trim().slice(0, 300);
    if (!v) continue;
    patch[i.champ] = i.champ === 'remarque' && p.remarque ? `${p.remarque} · ${v}` : v;
    if (i.champ === 'telephone') patch.telephone_source = i.a_confirmer ? 'dictée, d\'un tiers' : 'dictée';
    if (i.a_confirmer) aConfirmer[i.champ] = true; else delete aConfirmer[i.champ];
    faits.push(`${i.champ === 'telephone' ? 'Téléphone' : i.champ === 'email' ? 'Mail' : i.champ === 'nom' ? 'Nom' : 'Remarque'} : ${v}${i.a_confirmer ? ' (à confirmer)' : ''}`);
  }
  if (Object.keys(patch).length) Records.update('ProprietaireMandataire', p.id, { ...patch, a_confirmer: aConfirmer });
  const note = String(proposition.note || '').trim() || 'Dictée';
  const E = await import('./mandataire-espace.js');
  const issue = proposition.issue || null;
  if (issue === 'rdv' || proposition.rdv_quand) {
    if (proposition.rdv_quand) {
      const { executerOutilMandataire } = await import('./mandataire.js');
      const r = await executerOutilMandataire({ name: 'noter_rdv', input: { qui: [p.nom, p.commerce].filter(Boolean).join(' '), avec: p.nom || p.commerce, quand: proposition.rdv_quand, lieu: p.commerce || null } }, user);
      if (r.ok) faits.push(`${r.titre} · ${r.pour}`);
    }
    const r = E.noterResultat(p.id, { statut: 'rdv_pris', texte: note }, user);
    if (!r.ok) return r;
    faits.unshift('Rendez-vous fixé : la fiche passe dans Biens');
  } else if (issue === 'contacte' || issue === 'pas_interet') {
    // Pas d'intérêt : la fiche sort des listes, une relance possible dans six mois.
    const r = E.noterResultat(p.id, { statut: issue === 'pas_interet' ? 'pas_vendeur' : 'contacte', texte: note, rappel_dans_jours: issue === 'pas_interet' ? 180 : null }, user);
    if (!r.ok) return r;
    faits.unshift(issue === 'pas_interet' ? "Pas d'intérêt : relance dans six mois" : 'Contacté');
  } else if (issue === 'visite' || issue === 'prix_accord') {
    const r = validerEtape(p.id, issue, user);
    if (!r.ok) return r;
    faits.unshift(issue === 'visite' ? 'Visite faite' : "Avis accepté : le mandat peut se préparer");
  } else if (proposition.restitution?.cas) {
    // La restitution de l'avis (27 oct. 2026) : le statut, la relance datée et la ligne d'historique.
    const r = appliquerRestitution(p.id, { ...proposition.restitution, note }, user);
    if (!r.ok) return r;
    faits.unshift(`${r.plan.mot} : prochaine action le ${new Date(r.plan.relance.le).toLocaleDateString('fr-FR', { timeZone: PARIS })}`);
    if (r.plan.alerte) faits.push(r.plan.alerte);
  } else if (issue === 'pause') {
    const r = await mettreEnPause(p.id, {}, user);
    if (!r.ok) return r;
    faits.unshift('En pause : relance programmée');
  }
  // La ligne d'historique de la dictée, si le statut n'en a pas déjà écrit une.
  if (!issue || ['visite', 'prix_accord', 'pause'].includes(issue)) {
    const q = Records.get('ProprietaireMandataire', p.id);
    Records.update('ProprietaireMandataire', p.id, { historique: ajouter(q, { type: 'dictee', texte: note }) });
  }
  if (proposition.tache?.quoi) {
    const quand = /^\d{4}-\d{2}-\d{2}/.test(String(proposition.tache.quand || '')) ? new Date(`${String(proposition.tache.quand).slice(0, 10)}T09:00:00+02:00`).toISOString() : new Date(Date.now() + 86400000).toISOString();
    Records.create('Rappel', { espace: 'mandataire', genre: 'relance', proprietaire_id: p.id, nom: p.commerce || p.nom || null, quoi: proposition.tache.quoi, telephone: p.telephone || null, echeance: quand, cree_le: maintenant(), cree_par: user?.email || null, fait_le: null });
    Records.update('ProprietaireMandataire', p.id, { prochaine_action: proposition.tache.quoi, prochaine_action_le: quand });
    faits.push(`Tâche : ${proposition.tache.quoi} (${new Date(quand).toLocaleDateString('fr-FR', { timeZone: PARIS })})`);
  }
  return { ok: true, faits, proprietaire: Records.get('ProprietaireMandataire', p.id) };
}

/**
 * La fiche d'un commerce de la carte, au premier geste (24 oct. 2026) : créée si elle n'existe pas, à ce mandataire ;
 * refusée si un autre mandataire l'a déjà. Rend la fiche (existante ou nouvelle).
 */
export async function ficheDuCommerce(commerceId, user, { statut = 'a_appeler' } = {}) {
  const c = Records.get('CommerceSimple', commerceId);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const moi = emailDe(user);
  const deja = Records.list('ProprietaireMandataire').find((p) => p.commerce_simple_id === commerceId);
  if (deja) return deja.mandataire_email === moi ? { ok: true, proprietaire: deja, deja: true } : { ok: false, error: 'Ce commerce est déjà suivi par un autre mandataire.' };
  const { creerProprietaire } = await import('./mandataire-espace.js');
  const { nomLisible, societeLisible, rueLisible } = await import('./off-market/casse.js');
  const pr = c.proprietaire || null;
  const ex = c.exploitant || {};
  const telephone = String(c.lien || '').startsWith('exploitant') ? (c.contact?.telephone || c.telephone || null) : null;
  const r = creerProprietaire({
    nom: pr?.nom ? nomLisible(pr.nom, { forme: pr.forme }) : null,
    commerce: c.enseigne ? societeLisible(c.enseigne) : nomLisible(ex.nom || c.nom, { forme: ex.forme }),
    activite: c.activite || null, ville: c.ville || null, adresse: rueLisible(c.adresse), telephone, statut,
  }, user);
  if (!r.ok) return r;
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', r.proprietaire.id, { commerce_simple_id: commerceId, source: 'Carte', ...(telephone ? { telephone_source: 'commerce (exploitant propriétaire)' } : {}) }) };
}

/** Pure : qui tient chaque commerce de la carte (commerce_simple_id → { a_moi, dans_biens }). */
export function teneurs(fiches, moi) {
  const m = new Map();
  for (const p of fiches) if (p.commerce_simple_id) m.set(p.commerce_simple_id, { id: p.id, a_moi: p.mandataire_email === moi, dans_biens: dansBiens(p), statut: p.statut });
  return m;
}
