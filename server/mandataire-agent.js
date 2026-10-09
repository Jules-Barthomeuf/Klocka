// L'agent IA du mandataire : il tourne toute la journée sur son secteur.
//
// Le constat de terrain : le mandataire perd sa journée à chercher QUI
// possède les murs et COMMENT le joindre. L'agent fait ce travail en continu,
// en tâche de fond, et ne lui présente que des commerces « prêts » :
//
//   1. Sourcer      Data Prospective (Data-B), commune après commune du
//                   secteur, critères de la suggestion intelligente
//                   (indépendants, rues commerçantes, solvables) : une
//                   prospective par jour et par mandataire, lue page à page.
//   2. Identifier   le propriétaire des murs (cadastre, DGFiP, Data-B Foncier).
//   3. Joindre      son numéro chez lui (Pages Blanches, à l'adresse du siège).
//   4. Proposer     chaque commerce devenu appelable est une « trouvaille » :
//                   une notification « J'ai trouvé… », une ligne dans l'onglet
//                   Agent IA, et des listes proposées par commune.
//
// Les gestes de l'agent se lisent dans son journal. Il notifie de 8 h à 20 h
// (heure de Paris), six fois par heure au plus ; au-delà, et la nuit, les
// trouvailles s'additionnent en une seule notification. Il ne dépense ni IA ni
// Apollo ; Data-B : une prospective par mandataire et par jour.

import { Records, Meta } from './db.js';

const ENTITE = 'TrouvailleAgent';
const QUATORZE_JOURS = 14 * 86400000;
const TRENTE_JOURS = 30 * 86400000;
const NOTIFS_PAR_HEURE = 6;
// Trois pages Data-B par tour (150 commerces), et plusieurs prospectives par
// jour : l'agent enchaîne les communes au lieu d'en lire une par jour. Chaque
// prospective consomme chez Data-B : un plafond par mandataire et par jour,
// réglable (AGENT_PROSPECTIVES_JOUR), et le compte est tenu dans le journal.
const PAGES_PAR_TOUR = 3;
const PROSPECTIVES_PAR_JOUR = Math.max(0, Number(process.env.AGENT_PROSPECTIVES_JOUR ?? 6));

const moi = (email) => String(email || '').toLowerCase();
const PARIS = 'Europe/Paris';
const maintenant = () => new Date().toISOString();
const jourDeParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// en-GB : « 13 ». En fr-FR, l'heure s'écrit « 13 h » et Number() rendait NaN.
const heureDeParis = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: PARIS, hour: '2-digit', hour12: false }).format(new Date())) % 24;

// --- L'état de l'agent, par mandataire --------------------------------------

const cleEtat = (email) => `agent-mandataire:${moi(email)}`;
export function etatAgent(email) {
  try { return { actif: true, ...JSON.parse(Meta.get(cleEtat(email)) || '{}') }; } catch { return { actif: true }; }
}
export const poserEtatAgent = (email, etat) => Meta.set(cleEtat(email), JSON.stringify(etat));

/** Les compteurs du jour, remis à zéro chaque matin. */
function compteurs(etat) {
  const j = jourDeParis();
  if (etat.jour?.date !== j) etat.jour = { date: j, lus: 0, proprietaires: 0, numeros: 0, trouvailles: 0 };
  return etat.jour;
}

// --- Le journal : ce que l'agent a fait, en phrases -------------------------

const cleJournal = (email) => `agent-journal:${moi(email)}`;
export function journal(email) {
  try { return JSON.parse(Meta.get(cleJournal(email)) || '[]'); } catch { return []; }
}
export function noter(email, texte, genre = 'info') {
  const j = [{ le: maintenant(), texte, genre }, ...journal(email)].slice(0, 80);
  Meta.set(cleJournal(email), JSON.stringify(j));
}

// --- Les communes du secteur ----------------------------------------------------

/**
 * Les communes du secteur. Celles choisies quand le secteur a été dessiné par
 * unités ; sinon (un contour tracé à la main), celles que le contour couvre,
 * lues à l'API Géo sur une grille de points et gardées un mois sur le
 * secteur. Les plus peuplées d'abord : plus de commerces.
 * @returns {Promise<Array<{nom, code, population?}>>}
 */
export async function communesDuSecteur(secteur) {
  const choisies = (secteur.unites || []).filter((u) => u.niveau === 'commune').map((u) => ({ nom: u.nom, code: u.code || null }));
  if (choisies.length) return choisies;
  if (secteur.communes_auto?.length && Date.now() - Date.parse(secteur.communes_auto_le || 0) < TRENTE_JOURS) return secteur.communes_auto;
  // L'API Géo injoignable : on ne relance pas la grille avant une heure.
  if (secteur.communes_auto_echec_le && Date.now() - Date.parse(secteur.communes_auto_echec_le) < 3600000) return [];
  const { anneauxSecteur, dansSecteur } = await import('./mandataire-espace.js');
  const anneaux = anneauxSecteur(secteur);
  if (!anneaux.length) return [];
  const pts = anneaux.flat();
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const PAS = 22;
  const trouvees = new Map();
  for (let i = 0; i <= PAS; i += 1) {
    for (let j = 0; j <= PAS; j += 1) {
      const p = [la0 + ((la1 - la0) * i) / PAS, lo0 + ((lo1 - lo0) * j) / PAS];
      if (!dansSecteur(p, secteur)) continue;
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?lat=${p[0]}&lon=${p[1]}&fields=nom,code,population&limit=1`, { signal: AbortSignal.timeout(8000) });
        const c = r.ok ? (await r.json())[0] : null;
        if (c && !trouvees.has(c.code)) trouvees.set(c.code, { nom: c.nom, code: c.code, population: c.population || 0 });
      } catch { /* un point muet n'empêche pas les autres */ }
    }
  }
  const communes = [...trouvees.values()].sort((a, b) => b.population - a.population);
  if (secteur.id) Records.update('SecteurMandataire', secteur.id, communes.length ? { communes_auto: communes, communes_auto_le: maintenant(), communes_auto_echec_le: null } : { communes_auto_echec_le: maintenant() });
  return communes;
}

/**
 * Où l'agent cherche : les villes Klocka du secteur d'abord, toujours, puis
 * les communes que le mandataire a cochées pour son activité. Rien d'autre :
 * une commune du secteur non cochée n'est pas lue.
 */
export async function communesAgent(secteur) {
  const { villesKlocka, rangerCommunes } = await import('./villes-klocka.js');
  const r = rangerCommunes(await communesDuSecteur(secteur), villesKlocka(), secteur.communes_activite || []);
  return [...r.klocka, ...r.autres.filter((c) => c.choisie)].map((c) => c.nom);
}

/** Le réglage du mandataire : les villes Klocka de son secteur, et les autres communes, cochées ou non. */
export async function reglageCommunes(user) {
  const { secteurDe } = await import('./mandataire-espace.js');
  const secteur = secteurDe(user);
  if (!secteur) return { secteur: null, klocka: [], autres: [], regle: true };
  const { villesKlocka, rangerCommunes } = await import('./villes-klocka.js');
  const r = rangerCommunes(await communesDuSecteur(secteur), villesKlocka(), secteur.communes_activite || []);
  const champ = (c) => ({ nom: c.nom, code: c.code || null, population: c.population || null });
  return { secteur: { nom: secteur.nom }, klocka: r.klocka.map(champ), autres: r.autres.map((c) => ({ ...champ(c), choisie: c.choisie })), regle: !!secteur.communes_reglees_le };
}

/** Le mandataire coche ses communes : seulement celles de son secteur, hors villes Klocka (toujours lues). */
export async function choisirCommunes(user, cles = []) {
  const { secteurDe } = await import('./mandataire-espace.js');
  const secteur = secteurDe(user);
  if (!secteur) return { ok: false, error: "Aucun secteur ne vous est attribué : demandez à Klocka de tracer le vôtre." };
  const { villesKlocka, rangerCommunes, norm } = await import('./villes-klocka.js');
  const r = rangerCommunes(await communesDuSecteur(secteur), villesKlocka(), []);
  const voulues = new Set((Array.isArray(cles) ? cles : []).map(String));
  const choisies = r.autres.filter((c) => voulues.has(c.code || '') || voulues.has(c.nom) || voulues.has(norm(c.nom))).map((c) => c.code || norm(c.nom));
  Records.update('SecteurMandataire', secteur.id, { communes_activite: choisies, communes_reglees_le: maintenant() });
  const noms = [...r.klocka.map((c) => c.nom), ...r.autres.filter((c) => choisies.includes(c.code || norm(c.nom))).map((c) => c.nom)];
  noter(user.email, noms.length ? `Je cherche désormais à ${noms.slice(0, 6).join(', ')}${noms.length > 6 ? ` et ${noms.length - 6} autres` : ''}.` : "Aucune commune à lire : cochez celles de votre activité dans Compte.", noms.length ? 'info' : 'alerte');
  return { ok: true, ...(await reglageCommunes(user)) };
}

// --- 1. Sourcer : Data Prospective, commune après commune -------------------

/**
 * Une prospective Data-B par jour, sur la commune suivante du secteur, puis
 * une page lue par tour : chaque établissement devient une cible ALX.
 */
export async function sourcer(secteur, user, etat) {
  const { dataBConfigure } = await import('./data-b.js');
  if (!dataBConfigure()) return 0;
  const c = compteurs(etat);
  const M = await import('./mandataire-prospective.js');

  // Une prospective sur une commune décochée depuis : on la laisse.
  if (etat.datab?.commune && !(await communesAgent(secteur)).includes(etat.datab.commune)) {
    noter(user.email, `${etat.datab.commune} n'est plus dans vos communes : je la laisse.`);
    etat.datab = null;
  }
  // Une prospective en cours de lecture : les pages suivantes.
  if (etat.datab?.jeton && etat.datab.page <= (etat.datab.pages || 1)) {
    let lus = 0;
    for (let n = 0; n < PAGES_PAR_TOUR && etat.datab && etat.datab.page <= (etat.datab.pages || 1); n += 1) {
      const r = await M.resultats(etat.datab.jeton, { page: etat.datab.page, user });
      if (!r.ok) { noter(user.email, `Data-B n'a pas rendu la page ${etat.datab.page} de ${etat.datab.commune} : ${r.error}`, 'alerte'); etat.datab = null; break; }
      let nouvelles = 0;
      let ailleurs = 0;
      for (const l of r.resultats) {
        const x = await M.cibleDepuisDataB(l, { villeNom: etat.datab.commune, centre: etat.datab.centre || null, user, horsCommune: 'ignorer' });
        if (x.ok && !x.deja) nouvelles += 1;
        if (x.hors) ailleurs += 1;
      }
      if (ailleurs) noter(user.email, `${etat.datab.commune} : ${ailleurs} commerce${ailleurs > 1 ? 's' : ''} d'une autre commune écarté${ailleurs > 1 ? 's' : ''} (Data-B les plaçait ici).`);
      c.lus += r.resultats.length;
      lus += r.resultats.length;
      etat.datab.pages = r.pages;
      if (nouvelles) noter(user.email, `${etat.datab.commune} : ${r.resultats.length} commerces lus (page ${etat.datab.page} sur ${r.pages}), ${nouvelles} nouveaux à étudier.`);
      etat.datab.page += 1;
      if (etat.datab.page > r.pages) {
        etat.lues = { ...(etat.lues || {}), [etat.datab.commune]: maintenant() };
        noter(user.email, `${etat.datab.commune} entièrement lue : ${r.total} commerces passés au crible.`, 'succes');
        etat.datab = null;
      }
    }
    return lus;
  }

  // Une nouvelle prospective, sur la commune la moins récemment lue, tant que
  // le plafond du jour le permet.
  if (etat.prospectives?.date !== jourDeParis()) etat.prospectives = { date: jourDeParis(), n: 0 };
  if (etat.prospectives.n >= PROSPECTIVES_PAR_JOUR) return 0;
  const communes = await communesAgent(secteur);
  if (!communes.length) {
    if (etat.sans_commune_le !== jourDeParis()) { etat.sans_commune_le = jourDeParis(); noter(user.email, 'Aucune commune à lire : votre secteur ne compte aucune ville Klocka et vous n\'en avez coché aucune. Cochez celles de votre activité dans Compte.', 'alerte'); }
    return 0;
  }
  const lues = etat.lues || {};
  // Les villes Klocka passent avant les communes du mandataire : la première
  // commune à relire dans l'ordre de communesAgent.
  const suivante = communes.find((n) => !lues[n] || Date.now() - Date.parse(lues[n]) > QUATORZE_JOURS);
  if (!suivante) return 0;
  const z = await M.resoudreZone({ ville_nom: suivante }, user);
  if (!z.ok) { etat.lues = { ...lues, [suivante]: maintenant() }; noter(user.email, `${suivante} : ${z.error}`, 'alerte'); return 0; }
  const r = await M.lancerProspective({ nom: `Agent IA · ${z.ville.nom}`, ville: z.ville, filtres: M.SUGGESTION }, user);
  etat.prospective_le = jourDeParis();
  etat.prospectives.n += 1;
  if (!r.ok) { noter(user.email, `Data-B refuse la prospective sur ${z.ville.nom} : ${r.error}`, 'alerte'); return 0; }
  etat.datab = { jeton: r.prospective.jeton, commune: z.ville.nom, centre: { lat: z.ville.lat, lon: z.ville.lon }, page: 1, pages: 1 };
  noter(user.email, `Je commence ${z.ville.nom} : indépendants, rues commerçantes et mieux, entreprises solvables (prospective Data-B ${etat.prospectives.n} sur ${PROSPECTIVES_PAR_JOUR} aujourd'hui).`);
  return 0;
}

// --- Les investisseurs qui pourraient matcher -------------------------------

/**
 * Pour un commerce, les demandes de clients Klocka qui lui correspondent :
 * même activité recherchée et/ou même zone. Une demande sans aucun critère
 * (« toute la France, tout commerce ») ne compte pas : elle matcherait tout.
 * Références anonymisées seulement (initiales), jamais un nom.
 * @returns {(c: object) => Array<{reference, pourquoi, budget}>}
 */
const nz = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Les sigles des zones dites par les clients.
const ALIAS_ZONES = { paca: 'provence alpes cote azur', idf: 'ile france', ara: 'auvergne rhone alpes', bfc: 'bourgogne franche comte' };
const VAGUES = new Set(['sud', 'nord', 'est', 'ouest', 'france', 'toute', 'tout', 'region', 'grand', 'grande', 'secteur', 'zone', 'autour']);

/** Le département et la région d'une commune (API Géo), gardés sur la ville. */
async function geoDe(ville) {
  const v = Records.list('Ville').find((x) => nz(x.nom) === nz(ville));
  if (v?.geo) return v.geo;
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(ville)}&fields=nom,departement,region&boost=population&limit=1`, { signal: AbortSignal.timeout(8000) });
    const c = r.ok ? (await r.json())[0] : null;
    const geo = c ? { departement: c.departement?.nom || null, region: c.region?.nom || null } : { departement: null, region: null };
    if (v) Records.update('Ville', v.id, { geo });
    return geo;
  } catch { return { departement: null, region: null }; }
}

/** Pure : une zone dite par un client (« PACA/Rhone-Alpes », « SUD (bordeaux-lyon) ») couvre-t-elle cette commune ? */
export function zoneCouvre(zone, { ville, departement = null, region = null }) {
  const v = nz(ville).replace(/[^a-z]+/g, ' ').trim();
  const d = nz(departement).replace(/[^a-z]+/g, ' ');
  const r = nz(region).replace(/[^a-z]+/g, ' ');
  return String(zone || '').split(/[/,;]| et /i).some((segment) => {
    const brut = nz(segment).replace(/[^a-z]+/g, ' ').trim();
    const mots = (ALIAS_ZONES[brut] || brut).split(' ').filter((m) => m.length > 3 && !VAGUES.has(m));
    if (!mots.length) return false;
    // Une ville nommée dans la zone (« lyon » dans « SUD (bordeaux-lyon) »).
    if (mots.some((m) => v === m || v.startsWith(`${m} `) || v.split(' ')[0] === m)) return true;
    // Un département ou une région entière (tous ses mots y sont).
    return mots.every((m) => d.includes(m) || r.includes(m));
  });
}

/**
 * Pour un commerce, les demandes de clients Klocka qui lui correspondent :
 * même activité recherchée et/ou zone qui couvre la commune (ville,
 * département, région). Une demande sans aucun critère (« toute la France,
 * tout commerce ») ne compte pas : elle matcherait tout. Références
 * anonymisées seulement, jamais un nom.
 * @returns {Promise<(c: object) => Promise<Array<{reference, pourquoi, budget}>>>}
 */
export async function matcheurInvestisseurs() {
  const { demandesVisibles } = await import('./mandataire-espace.js');
  const demandes = demandesVisibles();
  const k = montantCourt;
  return async (c) => {
    if (!c?.ville) return [];
    const geo = await geoDe(c.ville);
    const lieu = { ville: c.ville, ...geo };
    const activite = nz(`${c.activite || ''} ${c.categorie_activite || ''} ${c.enseigne || ''} ${c.commerce || ''}`);
    const res = [];
    for (const d of demandes) {
      const type = nz(d.type_commerce);
      const typeOk = !!type && type.split(/\s+/).some((m) => m.length > 2 && activite.includes(m));
      const zones = (d.zones || []).filter((z) => !/toute la france|^france$/i.test(z));
      const zone = zones.find((z) => zoneCouvre(z, lieu));
      if ((type && !typeOk) || (zones.length && !zone)) continue;
      const score = (typeOk ? 2 : 0) + (zone ? 2 : 0);
      if (!score) continue;
      res.push({
        reference: d.reference,
        score,
        pourquoi: [typeOk ? `cherche ${d.type_commerce}` : null, zone ? `zone ${zone}` : null].filter(Boolean).join(' · '),
        budget: d.budget_min || d.budget_max ? [k(d.budget_min), k(d.budget_max)].filter(Boolean).join(' – ') : null,
      });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 3).map(({ score, ...r }) => r);
  };
}

/** Pure : 450 000 → « 450 k€ », 1 700 000 → « 1,7 M€ ». */
export function montantCourt(v) {
  const n = Number(v);
  if (!n) return null;
  if (n >= 1e6) return `${(Math.round(n / 1e5) / 10).toLocaleString('fr-FR')} M€`;
  return `${Math.round(n / 1000)} k€`;
}

// --- 4. Proposer : les trouvailles ------------------------------------------

/** Pure : pourquoi ce commerce mérite l'appel, en quelques mots. */
export function raisonDe(c) {
  const morceaux = [];
  if (c.emplacement === 1) morceaux.push('emplacement n°1');
  else if (c.emplacement === 1.5) morceaux.push('rue très commerçante');
  else if (c.emplacement === 2) morceaux.push('rue commerçante');
  if (c.proprietaire_occupant) morceaux.push('propriétaire exploitant');
  else if (/sci/i.test(c.proprietaire?.forme || c.societe?.forme || c.proprietaire?.nom || '')) morceaux.push('murs en SCI');
  const age = c.societe?.gerants?.find((g) => g.tranche_age)?.tranche_age;
  if (age === '70+') morceaux.push('dirigeant de plus de 70 ans');
  if (c.datab?.independant) morceaux.push('indépendant');
  return morceaux.join(' · ') || 'propriétaire identifié, numéro en main';
}

/** Les cibles du secteur devenues appelables, et pas encore proposées ni suivies. */
async function nouvellesTrouvailles(secteur, user) {
  const { cibleVerifiee, scoreCible } = await import('./mandataire-veille.js');
  const { villesDuSecteur } = await import('./mandataire-espace.js');
  const villes = new Set(villesDuSecteur(secteur).map((v) => v.id));
  const dejaProposees = new Set(Records.list(ENTITE).filter((t) => t.mandataire_email === moi(user.email)).map((t) => t.cible_id));
  const suivies = new Set(Records.list('ProprietaireMandataire').filter((p) => p.cible_id).map((p) => p.cible_id));
  return Records.list('Cible')
    .filter((c) => villes.has(c.ville_id) && cibleVerifiee(c) && !dejaProposees.has(c.id) && !suivies.has(c.id))
    .sort((a, b) => scoreCible(b) - scoreCible(a));
}

export async function proposer(secteur, user, etat) {
  const nouvelles = await nouvellesTrouvailles(secteur, user);
  if (!nouvelles.length) return [];
  const c = compteurs(etat);
  const investisseurs = await matcheurInvestisseurs();
  const creees = [];
  for (const cible of nouvelles) {
    const inv = await investisseurs(cible);
    const t = Records.create(ENTITE, {
      mandataire_email: moi(user.email), cible_id: cible.id, statut: 'nouvelle',
      raison: raisonDe(cible), investisseurs: inv, trouve_le: maintenant(),
    });
    // Rangée tout de suite dans la liste de l'agent pour sa commune : le
    // mandataire n'a rien à trier, il ouvre la liste et appelle.
    const liste = listePour(user, { nom: `Agent IA · ${cible.ville}`, agent: true });
    const r = await versFiche(t, liste, user);
    creees.push({ t: { ...t, liste_id: liste.id, liste_nom: liste.nom }, cible, inv });
    noter(user.email, `J'ai trouvé ${cible.enseigne || cible.adresse} (${cible.ville}) : murs à ${cible.proprietaire?.nom}, ${cible.murs_telephone || cible.telephone}.${r.ok ? ` Rangé dans « ${liste.nom} ».` : ''}${inv.length ? ` Peut intéresser ${inv.map((x) => x.reference).join(', ')}.` : ''}`, 'trouvaille');
  }
  c.trouvailles += creees.length;
  await notifierTrouvailles(creees, user, etat);
  return creees;
}

/**
 * « J'ai trouvé un commerce » : une notification par trouvaille, dans la
 * journée et sous le plafond horaire ; le reste s'additionne et part en une
 * seule notification dès que c'est permis.
 */
async function notifierTrouvailles(creees, user, etat) {
  const { notifier } = await import('./notifications.js');
  const h = heureDeParis();
  const ouvert = h >= 8 && h < 20;
  const tranche = `${jourDeParis()}T${h}`;
  if (etat.notifs?.tranche !== tranche) etat.notifs = { tranche, n: 0 };
  let reste = etat.en_attente || 0;
  for (const { t, cible, inv = [] } of creees) {
    if (ouvert && etat.notifs.n < NOTIFS_PAR_HEURE) {
      notifier({
        pour: user.email,
        titre: "J'ai trouvé un commerce",
        texte: `${cible.enseigne || cible.adresse} · ${cible.ville} — murs : ${cible.proprietaire?.nom}. ${t.raison}.${inv.length ? ` Peut intéresser ${inv.map((x) => x.reference).join(', ')}.` : ''} Ajouté à « ${t.liste_nom} ».`,
        lien: t.liste_id ? `/MandataireProspection?onglet=listes&liste=${t.liste_id}` : '/MandataireProspection?onglet=agent',
        action: 'Ouvrir la liste',
        cle: `trouvaille:${t.id}`,
      });
      etat.notifs.n += 1;
    } else {
      reste += 1;
    }
  }
  if (reste && ouvert && etat.notifs.n < NOTIFS_PAR_HEURE) {
    notifier({
      pour: user.email,
      titre: `J'ai trouvé ${reste} autre${reste > 1 ? 's' : ''} commerce${reste > 1 ? 's' : ''}`,
      texte: 'Propriétaires identifiés, numéros en main : ils sont déjà rangés dans les listes de votre agent.',
      lien: '/MandataireProspection?onglet=agent',
      action: 'Voir',
      cle: `trouvailles:${user.email}:${tranche}`,
    });
    etat.notifs.n += 1;
    reste = 0;
  }
  etat.en_attente = reste;
}

// --- Monday : le rattrapage des propriétaires trouvés après coup ------------

export async function rattraperMonday(user, max = 5) {
  const { synchroniserFicheMonday } = await import('./mandataire-monday.js');
  const aFaire = Records.list('ProprietaireMandataire')
    .filter((p) => p.mandataire_email === moi(user.email) && !p.monday_synchro_le && p.statut !== 'pas_vendeur')
    .filter((p) => !p.monday_essai_le || Date.now() - Date.parse(p.monday_essai_le) > 86400000)
    .filter((p) => p.nom || (p.cible_id && Records.get('Cible', p.cible_id)?.proprietaire?.nom))
    .slice(0, max);
  for (const p of aFaire) await synchroniserFicheMonday(p.id).catch(() => {});
  return aFaire.length;
}

// --- Ce que l'onglet Agent IA affiche ----------------------------------------

const telDe = (c) => c.murs_telephone || (c.proprietaire_occupant ? c.telephone : null) || null;

function ligneTrouvaille(t) {
  const c = Records.get('Cible', t.cible_id);
  if (!c) return null;
  return {
    id: t.id, statut: t.statut, raison: t.raison, trouve_le: t.trouve_le, cible_id: c.id,
    enseigne: c.enseigne || null, activite: c.activite || null, adresse: c.adresse, ville: c.ville, arrondissement: c.arrondissement || null,
    emplacement: c.emplacement ?? null, lat: c.lat ?? null, lon: c.lon ?? null,
    proprietaire: c.proprietaire?.nom || null, forme: c.proprietaire?.forme || c.societe?.forme || null,
    proprietaire_source: c.proprietaire?.source || null,
    telephone: telDe(c), telephone_source: c.murs_telephone ? c.murs_telephone_source : c.proprietaire_occupant ? 'commerce (propriétaire-occupant)' : null,
    telephone_commerce: c.telephone || null,
  };
}

export async function vueAgent(user) {
  const { secteurDe } = await import('./mandataire-espace.js');
  const { villesKlocka, rangerCommunes, norm } = await import('./villes-klocka.js');
  const etat = etatAgent(user.email);
  const secteur = secteurDe(user);
  // Les communes déjà connues du secteur (sans relancer la grille de l'API Géo à chaque coup d'œil).
  const connues = secteur ? ((secteur.unites || []).filter((u) => u.niveau === 'commune').map((u) => ({ nom: u.nom, code: u.code || null })).concat(secteur.unites?.some((u) => u.niveau === 'commune') ? [] : secteur.communes_auto || [])) : [];
  const rang = rangerCommunes(connues, villesKlocka(), secteur?.communes_activite || []);
  const groupeDe = new Map([...rang.klocka.map((c) => [norm(c.nom), 'klocka']), ...rang.autres.filter((c) => c.choisie).map((c) => [norm(c.nom), 'activite'])]);
  const toutes = Records.list(ENTITE).filter((t) => t.mandataire_email === moi(user.email));
  // Une trouvaille d'une commune décochée depuis ne s'affiche plus ; elle reste en base.
  const recentes = toutes.filter((t) => t.statut !== 'ignoree')
    .sort((a, b) => String(b.trouve_le).localeCompare(String(a.trouve_le)))
    .map((t) => {
      const l = ligneTrouvaille(t);
      if (!l) return null;
      const groupe = connues.length ? groupeDe.get(norm(l.ville)) : 'activite';
      if (!groupe) return null;
      const liste = t.liste_id ? Records.get('ListeMandataire', t.liste_id) : null;
      return { ...l, groupe, investisseurs: groupe === 'klocka' ? t.investisseurs || [] : [], liste: liste ? { id: liste.id, nom: liste.nom } : null };
    })
    .filter(Boolean)
    .slice(0, 60);
  // Les listes de l'agent : ce qu'il a rangé, commune par commune.
  const fiches = Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === moi(user.email));
  const listes = Records.list('ListeMandataire')
    .filter((l) => l.mandataire_email === moi(user.email) && (l.agent || l.suggeree))
    .map((l) => { const f = fiches.filter((p) => p.liste_id === l.id); return { id: l.id, nom: l.nom, total: f.length, a_appeler: f.filter((p) => p.statut === 'a_appeler').length }; })
    .filter((l) => l.total)
    .sort((a, b) => b.a_appeler - a.a_appeler);
  const j = etat.jour?.date === jourDeParis() ? etat.jour : { lus: 0, proprietaires: 0, numeros: 0, trouvailles: 0 };
  return {
    actif: etat.actif !== false,
    secteur: secteur ? { nom: secteur.nom, communes: (secteur.unites || []).filter((u) => u.niveau === 'commune').map((u) => u.nom) } : null,
    // Où il cherche : les villes Klocka du secteur, puis celles cochées par le mandataire.
    cherche: { klocka: rang.klocka.map((c) => c.nom), activite: rang.autres.filter((c) => c.choisie).map((c) => c.nom), regle: !!secteur?.communes_reglees_le },
    en_cours: etat.datab ? { commune: etat.datab.commune, page: etat.datab.page, pages: etat.datab.pages } : null,
    lues: etat.lues || {},
    aujourdhui: j,
    total: { trouvailles: toutes.length, ajoutees: toutes.filter((t) => t.statut === 'ajoutee').length },
    trouvailles: recentes,
    listes,
    journal: journal(user.email).slice(0, 40),
  };
}

// --- Les gestes du mandataire sur les trouvailles ---------------------------

const NOM_LISTE_AGENT = 'Agent IA · trouvailles';

function listePour(user, { liste_id = null, nom = null } = {}) {
  if (liste_id) {
    const l = Records.get('ListeMandataire', liste_id);
    return l && l.mandataire_email === moi(user.email) ? l : null;
  }
  const n = String(nom || NOM_LISTE_AGENT).trim().slice(0, 80);
  return Records.list('ListeMandataire').find((l) => l.mandataire_email === moi(user.email) && l.nom === n)
    || Records.create('ListeMandataire', { mandataire_email: moi(user.email), nom: n, agent: true, cree_le: maintenant() });
}

async function versFiche(t, liste, user) {
  const { creerProprietaire } = await import('./mandataire-espace.js');
  const { synchroniserEnFond } = await import('./mandataire-monday.js');
  const c = Records.get('Cible', t.cible_id);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const r = creerProprietaire({
    cible_id: c.id, nom: c.proprietaire?.nom || null, commerce: c.enseigne || c.activite || null,
    activite: c.activite || null, ville: c.ville || null, adresse: c.adresse || null, telephone: telDe(c),
  }, user);
  if (!r.ok) return r;
  Records.update('ProprietaireMandataire', r.proprietaire.id, {
    liste_id: liste.id, raison: t.raison,
    ...(c.murs_telephones?.length ? { telephones_proprietaire: c.murs_telephones } : {}),
    ...(c.dirigeant?.telephones?.length ? { telephones_dirigeant: c.dirigeant.telephones, dirigeant_nom: c.dirigeant.telephones[0].nom } : {}),
    telephone_source: c.murs_telephone ? c.murs_telephone_source : 'commerce (propriétaire-occupant)',
    ...(c.murs_adresse_proprietaire ? { adresse_proprietaire: c.murs_adresse_proprietaire } : {}),
  });
  Records.update(ENTITE, t.id, { statut: 'ajoutee', ajoutee_le: maintenant(), liste_id: liste.id });
  synchroniserEnFond(r.proprietaire.id);
  return { ok: true, fiche: r.proprietaire };
}

function trouvailleSienne(id, user) {
  const t = Records.get(ENTITE, id);
  return t && t.mandataire_email === moi(user.email) ? t : null;
}

export async function ajouterTrouvaille(id, cible, user) {
  const t = trouvailleSienne(id, user);
  if (!t || t.statut !== 'nouvelle') return { ok: false, error: 'Trouvaille introuvable.' };
  const liste = listePour(user, cible || {});
  if (!liste) return { ok: false, error: 'Liste introuvable.' };
  const r = await versFiche(t, liste, user);
  return r.ok ? { ok: true, liste: { id: liste.id, nom: liste.nom } } : r;
}

export function ignorerTrouvaille(id, user) {
  const t = trouvailleSienne(id, user);
  if (!t) return { ok: false, error: 'Trouvaille introuvable.' };
  Records.update(ENTITE, t.id, { statut: 'ignoree', ignoree_le: maintenant() });
  // La fiche rangée par l'agent, jamais travaillée : elle sort de la liste.
  const f = Records.list('ProprietaireMandataire').find((p) => p.cible_id === t.cible_id && p.mandataire_email === moi(user.email) && p.liste_id === t.liste_id);
  if (f && f.statut === 'a_appeler' && !(f.tentatives > 0) && !(f.historique || []).some((h) => h.type !== 'creation')) Records.delete('ProprietaireMandataire', f.id);
  return { ok: true };
}

/** Une liste proposée acceptée : toutes les trouvailles de la commune, en une liste. */
export async function creerListeProposee(ville, user) {
  const nouvelles = Records.list(ENTITE)
    .filter((t) => t.mandataire_email === moi(user.email) && t.statut === 'nouvelle')
    .filter((t) => Records.get('Cible', t.cible_id)?.ville === ville);
  if (!nouvelles.length) return { ok: false, error: 'Plus rien à proposer pour cette commune.' };
  const nom = `Agent IA · ${ville} · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: PARIS })}`;
  const liste = listePour(user, { nom });
  let ajoutees = 0;
  for (const t of nouvelles) if ((await versFiche(t, liste, user)).ok) ajoutees += 1;
  noter(user.email, `Liste « ${nom} » créée : ${ajoutees} commerce${ajoutees > 1 ? 's' : ''} à appeler.`, 'succes');
  return { ok: true, liste: { id: liste.id, nom: liste.nom }, ajoutees };
}

export function basculerAgent(user, actif) {
  const etat = etatAgent(user.email);
  etat.actif = !!actif;
  poserEtatAgent(user.email, etat);
  noter(user.email, actif ? 'Agent relancé : je reprends la recherche.' : 'Agent en pause : je ne cherche plus jusqu\'à nouvel ordre.');
  return { ok: true, actif: etat.actif };
}
