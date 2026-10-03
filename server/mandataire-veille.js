// La veille du mandataire : un agent qui tourne tout seul, tout le temps.
//
// Prospecter à la main bute toujours au même endroit : le numéro du
// particulier derrière la SCI. La veille renverse l'ordre : au lieu de
// chercher les numéros au moment d'appeler, elle les cherche À L'AVANCE,
// commune par commune du secteur — ALX parcourt les rues, le cadastre et les
// fichiers DGFiP donnent le propriétaire des murs, les Pages Blanches donnent
// son numéro chez lui — et chaque matin elle sert une liste prête : des
// commerces VÉRIFIÉS, propriétaire connu, numéro en main. Le mandataire ouvre
// sa « liste du jour » et appelle. La prospection manuelle (Prospecter) reste
// pour cibler un type précis, en sachant que là, les numéros manquent parfois.
//
// La veille ne dépense rien d'IA ni de crédits : parcours ALX (un par
// mandataire et par jour au plus), lectures ouvertes (BAN, cadastre, DGFiP,
// Data-B), Pages Blanches. Apollo, qui coûte un crédit par gérant, reste
// réservé aux listes ouvertes à la main. VEILLE_MANDATAIRE=0 coupe tout.

import { Records, Meta } from './db.js';

const TRENTE_JOURS = 30 * 86400000;
const SEPT_JOURS = 7 * 86400000;
// Le débit d'un tour (toutes les quinze minutes) : de quoi traiter quelques
// centaines de commerces par jour. Les Pages Blanches sont espacées de deux à
// quatre secondes par recherche (annuaire-particuliers.js) : c'est elles qui
// bornent le tour, pas ces nombres.
const PAR_TOUR_PROPRIETAIRES = 12;
const PAR_TOUR_NUMEROS = 8;
const PAR_TOUR_DIRIGEANTS = 6;
// Tous les dirigeants de la société propriétaire sont cherchés, jusqu'à six.
const PERSONNES_PAR_SOCIETE = 6;
const TAILLE_LISTE_DU_JOUR = 12;

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const jourDeParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Un seul parcours ALX lancé par la veille à la fois, tous mandataires
// confondus : c'est le geste le plus lourd, inutile d'en empiler.
let parcoursEnCours = false;

const cleEtat = (email) => `veille-mandataire:${email}`;
const lireEtat = (email) => { try { return JSON.parse(Meta.get(cleEtat(email)) || '{}'); } catch { return {}; } };
const poserEtat = (email, etat) => Meta.set(cleEtat(email), JSON.stringify(etat));

// Les enseignes nationales : quand C'EST ELLES qui détiennent les murs
// (Société Générale propriétaire de son agence, Carrefour de son City), il
// n'y a pas de vendeur à démarcher. Un indépendant ou une SCI qui loue SES
// murs à Carrefour reste, lui, un très bon prospect.
const ENSEIGNES_NATIONALES = /\b(societe generale|bnp|credit agricole|credit mutuel|credit lyonnais|lcl|caisse d.?epargne|banque populaire|banque postale|la poste|cic\b|hsbc|axa|allianz|groupama|maaf|macif|mma\b|matmut|gmf\b|aesio|harmonie mutuelle|malakoff|ag2r|generali|swiss ?life|(?<!du )(?<!au )(?<!le )carrefour|auchan|leclerc|intermarche|lidl|aldi|casino|monoprix|franprix|picard|action\b|netto|spar\b|vival\b|orange\b|sfr\b|bouygues|free mobile|mcdonald|burger king|kfc\b|quick\b|subway|domino.?s|engie|edf\b|totalenergies|total energies|sncf|ratp|norauto|feu vert|midas|decathlon|fnac|darty|boulanger|but\b|conforama|ikea|leroy merlin|castorama|brico depot|mr bricolage|gifi|la halle|kiabi|celio|jules\b|etam|promod|sephora|marionnaud|nocibe|yves rocher|optic 2000|krys|afflelou|generale d.?optique|pharmacie lafayette|basic fit|fitness park|keep cool)\b/;

/** Pure : le propriétaire des murs est-il une enseigne nationale ? */
export const enseigneNationale = (nom) => ENSEIGNES_NATIONALES.test(norm(nom).replace(/[-']/g, ' '));

/** Pure : un bailleur public s'appelle à son standard, jamais chez son directeur. */
export const bailleurPublic = (nom) =>
  /\b(commune|office public|ophlm|opac|departement|région|region|communaute|metropole|syndicat|etat|ville de)\b/i.test(norm(nom).replace(/-/g, ' '));

/** Les cibles du secteur : celles des villes ALX dont le centre tombe dedans. */
async function ciblesDuSecteur(secteur) {
  const { villesDuSecteur } = await import('./mandataire-espace.js');
  const villes = villesDuSecteur(secteur);
  return villes.flatMap((v) => Records.filter('Cible', { ville_id: v.id }).map((c) => ({ ...c, ville: c.ville || v.nom })));
}

/** Pure : une cible est bonne à appeler — propriétaire connu, un numéro à lui. */
export function cibleVerifiee(c) {
  if (c.activite_exclue || c.pile === 'ecartee' || c.ecartee_regle) return false;
  const proprio = c.proprietaire?.nom;
  if (!proprio || bailleurPublic(proprio)) return false;
  // Les murs détenus par l'enseigne nationale elle-même : rien à vendre.
  if (enseigneNationale(proprio)) return false;
  if (c.proprietaire_occupant && enseigneNationale(c.enseigne || '')) return false;
  // Le numéro du propriétaire des murs, ou celui du dirigeant du commerce (qui
  // connaît son bailleur) ; jamais le seul numéro du commerce.
  return !!(c.murs_telephone || (c.proprietaire_occupant && c.telephone) || c.dirigeant_telephone);
}

/** Pure : l'ordre d'appel — n°1 d'abord, puis l'âge du propriétaire, puis la SCI. */
export function scoreCible(c) {
  let n = 0;
  if (c.emplacement === 1) n += 30;
  else if (c.emplacement === 1.5) n += 20;
  else if (c.emplacement === 2) n += 10;
  const age = c.societe?.gerants?.find((g) => g.tranche_age)?.tranche_age || null;
  if (age === '70+') n += 25;
  else if (age === '50-70') n += 12;
  if (/sci/i.test(c.proprietaire?.forme || c.societe?.forme || '')) n += 8;
  if (c.murs_telephone) n += 5;
  if ((c.murs_telephones || []).length > 1) n += 3;
  if (c.dirigeant_telephone) n += 2;
  return n;
}

// ---------------------------------------------------------------------------
// Les trois gestes d'un tour : parcourir, identifier, joindre.
// ---------------------------------------------------------------------------

/** La prochaine commune du secteur sans parcours ALX récent ; lance ALX dessus. */
async function parcourirUneCommune(secteur, user, etat) {
  if (parcoursEnCours) return false;
  // Un parcours par mandataire et par jour : c'est le geste cher de la veille.
  if (etat.parcours_le === jourDeParis()) return false;
  const { communesAgent } = await import('./mandataire-agent.js');
  const communes = (await communesAgent(secteur)).map((nom) => ({ nom }));
  if (!communes.length) return false;
  const { creerVille } = await import('./alx/index.js');
  const { lancer } = await import('./alx/parcours.js');
  const depart = etat.commune_i || 0;
  for (let i = 0; i < communes.length; i += 1) {
    const commune = communes[(depart + i) % communes.length];
    const c = creerVille({ nom: commune.nom, user });
    if (!c.ok) continue;
    const v = Records.get('Ville', c.ville.id);
    const p = v.parcours || {};
    if (p.etat === 'en_cours') return false;
    if (p.fini_le && Date.now() - Date.parse(p.fini_le) < TRENTE_JOURS) continue;
    const r = lancer(v.id, { user, tout: true });
    if (!r.ok) continue;
    parcoursEnCours = true;
    etat.commune_i = (depart + i + 1) % communes.length;
    etat.parcours_le = jourDeParis();
    console.log(`[veille mandataire] ALX parcourt ${v.nom} pour ${user.email}`);
    // On rend la main : le parcours vit sa vie, le prochain tour verra fini_le.
    const garde = setInterval(() => {
      const frais = Records.get('Ville', v.id);
      if (frais?.parcours?.etat !== 'en_cours') { parcoursEnCours = false; clearInterval(garde); }
    }, 60_000);
    garde.unref?.();
    return true;
  }
  return false;
}

/** Quelques propriétaires de murs identifiés (sources ouvertes, gratuit). */
async function identifierDesProprietaires(secteur, user = null, etat = null) {
  const { trouverProprietaire } = await import('./alx/enrichir.js');
  const aFaire = (await ciblesDuSecteur(secteur))
    .filter((c) => !c.proprietaire?.nom && !c.foncier && !c.activite_exclue && c.pile !== 'ecartee' && !c.ecartee_regle)
    .filter((c) => !(c.proprietaire_cherche_le && Date.now() - Date.parse(c.proprietaire_cherche_le) < SEPT_JOURS))
    .slice(0, PAR_TOUR_PROPRIETAIRES);
  for (const c of aFaire) {
    try {
      await trouverProprietaire(c.id, {});
      const apres = Records.get('Cible', c.id);
      if (apres?.proprietaire?.nom && user) {
        const { noter } = await import('./mandataire-agent.js');
        if (etat?.jour) etat.jour.proprietaires = (etat.jour.proprietaires || 0) + 1;
        noter(user.email, `Propriétaire des murs trouvé pour ${apres.enseigne || apres.adresse} (${apres.ville}) : ${apres.proprietaire.nom}.`);
      } else if (!apres?.proprietaire?.nom) {
        Records.update('Cible', c.id, { proprietaire_cherche_le: new Date().toISOString() });
      }
    } catch (e) {
      Records.update('Cible', c.id, { proprietaire_cherche_le: new Date().toISOString() });
      console.warn(`[veille mandataire] propriétaire (${c.enseigne || c.adresse}) : ${e?.message || e}`);
    }
    await new Promise((f) => setTimeout(f, 400));
  }
  return aFaire.length;
}

/** Pure : « 0385507121 » → « 03 85 50 71 21 », comme partout ailleurs. */
export const telLisible = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, '$1 ') : t; };

/** Les personnes à chercher pour une société : ses dirigeants personnes physiques, ou le particulier nommé. */
async function personnesDe(societe, nomProprietaire = '') {
  const { gerantsPersonnes } = await import('./alx/demarchage.js');
  const personnes = gerantsPersonnes(societe);
  if (!personnes.length && /^(m|mme|monsieur|madame)\b/i.test(nomProprietaire)) {
    const mots = nomProprietaire.replace(/^(m|mme|monsieur|madame)\.?\s+/i, '').split(/\s+/);
    personnes.push({ prenom: mots[0] || '', nom: mots.slice(1).join(' ') || mots[0] });
  }
  return personnes.slice(0, PERSONNES_PAR_SOCIETE);
}

/**
 * Cherche dans l'annuaire chacune des personnes, à une adresse connue.
 * Rend tous les numéros trouvés (sans doublon), et si l'annuaire est en panne.
 */
async function numerosDe(personnes, adresse) {
  const { numeroDuParticulier } = await import('./annuaire-particuliers.js');
  const trouves = [];
  for (const g of personnes) {
    let r = null;
    try {
      r = await numeroDuParticulier({ prenom: g.prenom, nom: g.nom, adresse });
    } catch (e) {
      console.warn(`[veille mandataire] annuaire (${g.prenom} ${g.nom}) : ${e?.message || e}`);
      return { trouves, enPanne: true };
    }
    if (r && !trouves.some((t) => t.telephone.replace(/\D/g, '') === String(r.telephone).replace(/\D/g, ''))) {
      trouves.push({ telephone: telLisible(r.telephone), nom: [g.prenom, g.nom].filter(Boolean).join(' '), qualite: g.qualite || null, adresse: r.adresse || null, source: r.source });
    }
  }
  return { trouves, enPanne: false };
}

/**
 * Les numéros des propriétaires des murs (Pages Blanches : gratuit). Tous les
 * dirigeants de la société propriétaire sont cherchés, et tous les numéros
 * gardés (`murs_telephones`) ; le premier fait `murs_telephone`. Le numéro vit
 * sur la CIBLE : il profite à la liste du jour comme à un export manuel.
 */
async function joindreDesProprietaires(secteur, user = null, etat = null) {
  const aFaire = (await ciblesDuSecteur(secteur))
    .filter((c) => c.proprietaire?.nom && !bailleurPublic(c.proprietaire.nom) && !enseigneNationale(c.proprietaire.nom) && !c.proprietaire_occupant)
    // Pas encore de numéro, ou un numéro trouvé avant qu'on cherche tous les dirigeants.
    .filter((c) => !c.murs_telephone || !c.murs_tels_complets)
    .filter((c) => !(c.murs_tel_cherche_le && Date.now() - Date.parse(c.murs_tel_cherche_le) < SEPT_JOURS))
    .filter((c) => !c.activite_exclue && c.pile !== 'ecartee' && !c.ecartee_regle)
    .sort((a, b) => scoreCible(b) - scoreCible(a))
    .slice(0, PAR_TOUR_NUMEROS);
  for (const c of aFaire) {
    const personnes = await personnesDe(c.societe, c.proprietaire.nom);
    const adresse = c.societe?.siege?.adresse || [c.adresse, c.ville].filter(Boolean).join(' ');
    const { trouves, enPanne } = await numerosDe(personnes, adresse);
    if (enPanne) break;
    // Les numéros déjà connus restent (une recherche plus ancienne, une saisie).
    const deja = (c.murs_telephones || (c.murs_telephone ? [{ telephone: c.murs_telephone, nom: null, source: c.murs_telephone_source || null }] : []));
    const tous = [...deja];
    for (const t of trouves) if (!tous.some((x) => String(x.telephone).replace(/\D/g, '') === t.telephone.replace(/\D/g, ''))) tous.push(t);
    const patch = { murs_tel_cherche_le: new Date().toISOString(), murs_tels_complets: true };
    if (tous.length) {
      const premier = tous[0];
      Object.assign(patch, {
        murs_telephones: tous,
        murs_telephone: premier.telephone,
        murs_telephone_source: premier.source ? `${premier.source}${premier.nom ? ` · ${premier.nom}` : ''}` : c.murs_telephone_source || null,
        ...(premier.adresse ? { murs_adresse_proprietaire: premier.adresse } : {}),
      });
    }
    Records.update('Cible', c.id, patch);
    if (tous.length) {
      // Les fiches déjà en liste sur ce commerce reçoivent les numéros aussitôt.
      for (const f of Records.list('ProprietaireMandataire').filter((x) => x.cible_id === c.id)) {
        Records.update('ProprietaireMandataire', f.id, {
          telephones_proprietaire: tous,
          ...(f.telephone ? {} : { telephone: patch.murs_telephone, telephone_source: patch.murs_telephone_source, adresse_proprietaire: patch.murs_adresse_proprietaire || null }),
        });
      }
    }
    if (user && trouves.length) {
      const { noter } = await import('./mandataire-agent.js');
      if (etat?.jour) etat.jour.numeros = (etat.jour.numeros || 0) + trouves.length;
      noter(user.email, `${trouves.length > 1 ? `${trouves.length} numéros trouvés` : 'Numéro trouvé'} pour ${c.proprietaire.nom} (${c.enseigne || c.adresse}) : ${trouves.map((t) => `${t.telephone}${t.nom ? ` (${t.nom})` : ''}`).join(', ')}.`, 'succes');
    }
    await new Promise((f) => setTimeout(f, 400));
  }
  return aFaire.length;
}

/**
 * Le dirigeant du COMMERCE (l'exploitant, par le SIRET de la cible) : il
 * connaît son bailleur et décroche plus volontiers. Ses dirigeants sont
 * cherchés à l'adresse du siège de son entreprise ; les numéros sont gardés à
 * part (`dirigeant`), jamais mêlés à ceux du propriétaire des murs. Les
 * enseignes nationales et les réseaux (plus de vingt établissements) n'ont
 * pas de dirigeant joignable : on passe.
 */
async function joindreDesDirigeants(secteur, user = null, etat = null) {
  const { societe } = await import('./alx/annuaire.js');
  const aFaire = (await ciblesDuSecteur(secteur))
    .filter((c) => /^\d{14}$/.test(String(c.siret || '').replace(/\s/g, '')) && !c.dirigeant_cherche_le)
    .filter((c) => !c.activite_exclue && c.pile !== 'ecartee' && !c.ecartee_regle)
    .filter((c) => c.proprietaire?.nom && !bailleurPublic(c.proprietaire.nom) && !enseigneNationale(c.proprietaire.nom))
    .sort((a, b) => scoreCible(b) - scoreCible(a))
    .slice(0, PAR_TOUR_DIRIGEANTS);
  for (const c of aFaire) {
    const siren = String(c.siret).replace(/\s/g, '').slice(0, 9);
    let s = null;
    try { s = await societe({ siren }); } catch (e) { console.warn(`[veille mandataire] annuaire des entreprises (${siren}) : ${e?.message || e}`); }
    if (!s || enseigneNationale(s.nom || '') || (s.nombre_etablissements || 0) > 20) {
      Records.update('Cible', c.id, { dirigeant_cherche_le: new Date().toISOString(), ...(s ? { dirigeant: { societe: s.nom, siren: s.siren, personnes: [], ecarte: 'réseau ou enseigne' } } : {}) });
      continue;
    }
    const personnes = await personnesDe(s);
    const adresse = s.siege?.adresse || [c.adresse, c.ville].filter(Boolean).join(' ');
    const { trouves, enPanne } = await numerosDe(personnes, adresse);
    if (enPanne) break;
    Records.update('Cible', c.id, {
      dirigeant_cherche_le: new Date().toISOString(),
      dirigeant: { societe: s.nom, siren: s.siren, personnes: personnes.map((g) => ({ nom: [g.prenom, g.nom].filter(Boolean).join(' '), qualite: g.qualite || null, tranche_age: g.tranche_age || null })), telephones: trouves },
      ...(trouves.length ? { dirigeant_telephone: trouves[0].telephone } : {}),
    });
    if (trouves.length) {
      for (const f of Records.list('ProprietaireMandataire').filter((x) => x.cible_id === c.id)) {
        Records.update('ProprietaireMandataire', f.id, { telephones_dirigeant: trouves, dirigeant_nom: trouves[0].nom });
      }
      if (user) {
        const { noter } = await import('./mandataire-agent.js');
        if (etat?.jour) etat.jour.dirigeants = (etat.jour.dirigeants || 0) + 1;
        noter(user.email, `Dirigeant joint pour ${c.enseigne || c.adresse} (${c.ville}) : ${trouves.map((t) => `${t.nom} ${t.telephone}`).join(', ')}.`, 'succes');
      }
    }
    await new Promise((f) => setTimeout(f, 400));
  }
  return aFaire.length;
}

// ---------------------------------------------------------------------------
// La liste du jour : chaque matin, ce qu'il y a de mieux à appeler.
// ---------------------------------------------------------------------------

async function poserListeDuJour(secteur, user, etat) {
  const jour = jourDeParis();
  if (etat.liste_du === jour) return null;
  const { creerProprietaire } = await import('./mandataire-espace.js');
  const prises = new Set(Records.list('ProprietaireMandataire').filter((p) => p.cible_id).map((p) => p.cible_id));
  const candidates = (await ciblesDuSecteur(secteur))
    .filter((c) => cibleVerifiee(c) && !prises.has(c.id))
    .sort((a, b) => scoreCible(b) - scoreCible(a))
    .slice(0, TAILLE_LISTE_DU_JOUR);
  // Rien de vérifié aujourd'hui : pas de liste vide, on retentera demain.
  if (!candidates.length) { etat.liste_du = jour; return null; }
  const nom = `À appeler · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}`;
  const liste = Records.create('ListeMandataire', { mandataire_email: user.email, nom, suggeree: true, cree_le: new Date().toISOString() });
  let posees = 0;
  for (const c of candidates) {
    const r = creerProprietaire({
      cible_id: c.id,
      nom: c.proprietaire?.nom || null,
      commerce: c.enseigne || c.activite || null,
      activite: c.activite || null,
      ville: c.ville || null,
      adresse: c.adresse || null,
      telephone: c.murs_telephone || (c.proprietaire_occupant ? c.telephone : null) || null,
    }, user);
    if (!r.ok) continue;
    Records.update('ProprietaireMandataire', r.proprietaire.id, {
      liste_id: liste.id,
      ...(c.murs_telephones?.length ? { telephones_proprietaire: c.murs_telephones } : {}),
      ...(c.dirigeant?.telephones?.length ? { telephones_dirigeant: c.dirigeant.telephones, dirigeant_nom: c.dirigeant.telephones[0].nom } : {}),
      ...(c.murs_telephone ? { telephone_source: c.murs_telephone_source || null, adresse_proprietaire: c.murs_adresse_proprietaire || null } : c.proprietaire_occupant && c.telephone ? { telephone_source: 'commerce (propriétaire-occupant)' } : {}),
    });
    for (const t of Records.list('TrouvailleAgent').filter((x) => x.cible_id === c.id && x.statut === 'nouvelle')) {
      Records.update('TrouvailleAgent', t.id, { statut: 'ajoutee', ajoutee_le: new Date().toISOString(), liste_id: liste.id });
    }
    const { synchroniserEnFond } = await import('./mandataire-monday.js');
    synchroniserEnFond(r.proprietaire.id);
    posees += 1;
  }
  if (!posees) { Records.delete('ListeMandataire', liste.id); etat.liste_du = jour; return null; }
  etat.liste_du = jour;
  console.log(`[veille mandataire] liste du jour pour ${user.email} : ${posees} propriétaire${posees > 1 ? 's' : ''}`);
  try {
    const { notifier } = await import('./notifications.js');
    notifier({
      pour: user.email,
      titre: 'Votre liste du jour est prête',
      texte: `${posees} propriétaire${posees > 1 ? 's' : ''} vérifié${posees > 1 ? 's' : ''}, numéro en main, prêt${posees > 1 ? 's' : ''} à appeler.`,
      lien: `/MandataireProspection?onglet=listes&liste=${liste.id}`,
      action: 'Ouvrir la liste',
      cle: `liste-jour:${user.email}:${jour}`,
    });
  } catch { /* la liste existe, la notification n'est qu'un rappel */ }
  return liste;
}

// ---------------------------------------------------------------------------
// Le tour de veille : appelé par le serveur, toutes les quinze minutes.
// ---------------------------------------------------------------------------

let tourEnCours = false;

export async function tourDeVeille() {
  if (process.env.VEILLE_MANDATAIRE === '0') return { ok: true, coupee: true };
  if (tourEnCours) return { ok: true, deja: true };
  tourEnCours = true;
  try {
    const secteurs = Records.list('SecteurMandataire').filter((s) => s.mandataire_email);
    for (const secteur of secteurs) {
      const user = { email: secteur.mandataire_email, role: 'mandataire' };
      const A = await import('./mandataire-agent.js');
      const agent = A.etatAgent(user.email);
      if (agent.actif === false) continue;
      const etat = lireEtat(user.email);
      // Les compteurs du jour vivent dans l'état de l'agent.
      if (agent.jour?.date !== new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())) agent.jour = { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()), lus: 0, proprietaires: 0, numeros: 0, trouvailles: 0 };
      try {
        await A.sourcer(secteur, user, agent);
        await parcourirUneCommune(secteur, user, etat);
        await identifierDesProprietaires(secteur, user, agent);
        await joindreDesProprietaires(secteur, user, agent);
        await joindreDesDirigeants(secteur, user, agent);
        await A.proposer(secteur, user, agent);
        await poserListeDuJour(secteur, user, etat);
        await A.rattraperMonday(user);
      } catch (e) {
        console.warn(`[veille mandataire] ${user.email} : ${e?.message || e}`);
      }
      poserEtat(user.email, etat);
      A.poserEtatAgent(user.email, { ...A.etatAgent(user.email), ...agent, actif: A.etatAgent(user.email).actif });
    }
    return { ok: true, secteurs: secteurs.length };
  } finally {
    tourEnCours = false;
  }
}
