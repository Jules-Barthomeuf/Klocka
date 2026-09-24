// L'avis d'AK sur une préanalyse : ce qu'il peut dire sans avoir vu le bien.
//
// Tout se calcule ici, à partir du dossier tel que l'écran le lit (grille,
// prix acte en main, marché autour, clients) : AK dit la même chose que la
// fiche, et rien qu'elle ne dise pas. L'emplacement, il ne le voit pas : il
// le laisse à vérifier tant que personne ne l'a qualifié. Aucun appel au
// modèle, donc aucun coût et aucune invention.

import { calculerAEM } from '../deal/aem.js';
import { SEUILS } from './outils.js';

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
const nombre = (x) => { const n = Number(val(x)); return Number.isFinite(n) && n > 0 ? n : null; };
const k = (n) => `${Math.round(n / 1000)} k`;
const pct = (n) => `${String(Math.round(n * 10) / 10).replace('.', ',')} %`;
const signe = (n) => `${n > 0 ? '+' : ''}${n} %`;

// Au-delà, ce n'est plus une négo, c'est un autre prix : on dit que ça tourne pas.
const NEGO_MAX = 0.15;
const NEGO_PETITE = 0.07;

/** Pure : le rendement visé, celui de la grille du dossier (« ≥ 6.5 % »), sinon le seuil « ça tourne » d'AK. */
export function rendementVise(grille = [], seuils = SEUILS) {
  const c = grille.find((x) => x.champ === 'rendement_aem' && /\d/.test(String(x.attendu || '')));
  const n = c ? Number(String(c.attendu).replace(',', '.').match(/(\d+(?:\.\d+)?)/)?.[1]) : null;
  return n && n > 0 && n < 30 ? n : seuils.rendement_aem.tourne;
}

/**
 * Pure : le prix négocié qui amène le rendement acte en main au rendement
 * visé. Le prix acte en main dépend du prix négocié (droits, fees, incentive
 * sur la remise) : on cherche par dichotomie, puis la négo s'arrondit aux
 * 5 000 € au-dessus. `nego` vaut 0 quand le prix passe déjà ; null quand on
 * ne peut pas chiffrer.
 */
export function negoPourViser({ prixFai, loyer, vise, calculer = calculerAEM }) {
  if (!prixFai || !loyer || !vise) return null;
  const rendement = (p) => calculer({ prixFai, prixNegocie: p, loyerAnnuel: loyer })?.rendement_aem ?? null;
  const actuel = rendement(prixFai);
  if (actuel == null) return null;
  if (actuel >= vise) return { nego: 0, prix: prixFai, rendement: actuel, actuel };
  let bas = Math.max(1000, prixFai * 0.2);
  if ((rendement(bas) ?? 0) < vise) return { nego: null, prix: null, rendement: null, actuel, hors_de_portee: true };
  let haut = prixFai;
  while (haut - bas > 500) {
    const m = (bas + haut) / 2;
    if (rendement(m) >= vise) bas = m; else haut = m;
  }
  const nego = Math.ceil((prixFai - bas) / 5000) * 5000;
  const prix = prixFai - nego;
  return { nego, prix, rendement: rendement(prix), actuel };
}

/** Pure : la phrase sur la renta et la négo, sur le ton de l'équipe. */
export function phraseRenta({ prixFai, loyer, vise, n, verdict, manquants = [] }) {
  if (!prixFai || !loyer) {
    const quoi = !prixFai ? 'le prix' : 'le loyer';
    return `je peux pas chiffrer la renta, il manque ${quoi}${manquants.length ? ` (manque aussi : ${manquants.filter((m) => !/loyer|prix/i.test(m)).slice(0, 2).join(', ') || 'rien d\'autre'})` : ''}`;
  }
  if (!n) return null;
  const debut = verdict === 'NO-GO' ? 'no go sur la grille' : 'dossier pas mal';
  if (n.nego === 0) return `${debut}, la renta passe en l'état : ${pct(n.actuel)} AEM pour ${pct(vise)} visés`;
  if (n.hors_de_portee || n.nego / prixFai > NEGO_MAX) {
    const combien = n.nego ? ` : il faudrait ${k(n.nego)} de négo (${Math.round((n.nego / prixFai) * 100)} %) pour atteindre ${pct(vise)}` : '';
    return `la renta est horrible, ${pct(n.actuel)} AEM${combien}, ça tourne pas`;
  }
  const taille = n.nego / prixFai <= NEGO_PETITE ? 'une petite négo' : 'une négo';
  return `${debut}, il faut ${taille} d'environ ${k(n.nego)} pour que ça devienne intéressant (${pct(vise)} AEM à ${k(n.prix)} au lieu de ${k(prixFai)})`;
}

const cotes = (m, quoi) => {
  const j = m?.jugement;
  if (m?.kdata_en_cours) return { mot: `le ${quoi} de marché est encore en lecture`, ecart: '', sens: null };
  if (!j) return null;
  const ecart = j.ecart != null ? ` (${signe(j.ecart)} vs marché)` : '';
  if (j.sens === 'haut') return { mot: `le ${quoi} est ${j.ecart != null && j.ecart <= 25 ? 'un peu ' : ''}surévalué`, ecart, sens: 'haut' };
  if (j.sens === 'bas') return { mot: `le ${quoi} est sous le marché`, ecart, sens: 'bas' };
  return { mot: `le ${quoi} est dans le marché`, ecart: '', sens: 'juste' };
};

/**
 * Pure : le prix et le loyer face au marché, en une phrase. « le loyer est
 * un peu surévalué quand même (+18 % vs marché), mais pas le prix ».
 */
export function phraseMarche(marche) {
  if (!marche) return null;
  const prix = cotes(marche.prix, 'prix');
  const loyer = cotes(marche.loyer, 'loyer');
  const reserve = marche.approche ? ", lu sur le quartier faute d'adresse" : '';
  if (!prix && !loyer) return marche.manque ? `pas de marché lisible autour : ${String(marche.manque).replace(/\.$/, '').toLowerCase()}` : null;
  if (loyer?.sens === 'haut' && prix?.sens === 'juste') return `${loyer.mot} quand même${loyer.ecart}, mais pas le prix${reserve}`;
  if (prix?.sens === 'haut' && loyer?.sens === 'juste') return `${prix.mot}${prix.ecart}, le loyer lui est dans le marché${reserve}`;
  if (prix?.sens === 'juste' && loyer?.sens === 'juste') return `prix et loyer dans le marché${reserve}`;
  if (prix?.sens === 'haut' && loyer?.sens === 'haut') {
    const ecarts = [marche.loyer.jugement.ecart, marche.prix.jugement.ecart].every((e) => e != null) ? ` (${signe(marche.loyer.jugement.ecart)} et ${signe(marche.prix.jugement.ecart)} vs marché)` : '';
    return `le loyer et le prix sont surévalués${ecarts}${reserve}`;
  }
  return [loyer && loyer.mot + loyer.ecart, prix && prix.mot + prix.ecart].filter(Boolean).join(', ') + reserve;
}

/** Pure : l'emplacement et le preneur, ce qu'AK ne peut pas trancher seul. */
export function phraseInconnues(lot) {
  const l = lot?.lot || {};
  const emplacement = lot?.enrichissement?.emplacement;
  const morceaux = [];
  if (!emplacement || emplacement === 'a_qualifier') morceaux.push('emplacement à vérifier');
  const occupe = val(l.occupe);
  const preneur = val(l.locataire_nom);
  if (occupe === false) morceaux.push('le local est vide');
  else if (!preneur) morceaux.push('on sait pas qui est le preneur');
  if (!morceaux.length) return null;
  return morceaux.length === 2 ? `${morceaux[0]}, et ${morceaux[1]}` : morceaux[0];
}

/**
 * Pure : ce qui coince d'autre dans la grille, hors ce que les phrases
 * au-dessus disent déjà (rendement, emplacement, preneur, loyer, prix).
 */
export function autresPoints(grille = [], limite = 2) {
  const dits = new Set(['rendement_aem', 'emplacement', 'locataire_nom', 'loyer_annuel_ht_hc', 'prix_fai', 'rendement_fai']);
  return grille
    .filter((c) => c.ok === false && !dits.has(c.champ))
    .slice(0, limite)
    .map((c) => {
      const quoi = c.critere.toLowerCase();
      if (c.valeur == null || c.valeur === '') return `${quoi} : non renseigné`;
      const attendu = c.attendu ? `, attendu ${String(c.attendu).toLowerCase().replace(/^≠\s*/, 'autre que ')}` : '';
      return `${quoi} : ${String(c.valeur).toLowerCase()}${attendu}`;
    });
}

/** Pure : les clients qui pourraient coller, s'il y en a. */
export function phraseClients(clients) {
  if (!clients?.configure) return null;
  const liste = clients.clients || [];
  if (!liste.length) return 'aucun client ne colle pour l\'instant';
  const noms = liste.slice(0, 3).map((c) => c.nom).filter(Boolean);
  return `${liste.length} client${liste.length > 1 ? 's' : ''} pourrai${liste.length > 1 ? 'ent' : 't'} coller${noms.length ? ` : ${noms.join(', ')}${liste.length > 3 ? '…' : ''}` : ''}`;
}

/**
 * Pure : l'avis complet, prêt à poster. `dossier` est la lecture de
 * obtenirDossier (grille calculée), `marche` le retour de comparerAuMarche,
 * `clients` celui de la route des clients.
 */
export function avisPreanalyse({ dossier, marche = null, clients = null, lien = null, seuils = SEUILS, calculer = calculerAEM }) {
  const lot = dossier?.lots?.[0] || {};
  const ev = lot.evaluation || {};
  const grille = ev.grille || [];
  const titre = dossier?.nom || dossier?.titre || 'sans nom';
  const prixFai = nombre(ev.aem?.prix_fai) || nombre(lot.lot?.prix_fai);
  const loyer = nombre(lot.lot?.loyer_annuel_ht_hc);
  const vise = rendementVise(grille, seuils);
  const n = prixFai && loyer ? negoPourViser({ prixFai, loyer, vise, calculer }) : null;

  const lignes = [`c'est bon, le dossier ${titre} est prêt${lien ? ` : ${lien}` : ''}`];
  const renta = phraseRenta({ prixFai, loyer, vise, n, verdict: ev.verdict, manquants: ev.libelles_manquants || [] });
  if (renta) lignes.push(renta);
  if (ev.verdict === 'NO-GO' && ev.motifs?.length) lignes.push(`bloquant : ${String(ev.motifs[0]).replace(/\.$/, '').toLowerCase()}`);
  const m = phraseMarche(marche);
  if (m) lignes.push(m);
  const inconnues = phraseInconnues(lot);
  if (inconnues) lignes.push(inconnues);
  const autres = autresPoints(grille);
  if (autres.length) lignes.push(`à noter aussi : ${autres.join(', ')}`);
  const c = phraseClients(clients);
  if (c) lignes.push(c);
  lignes.push('dis-moi si tu veux que je fasse autre chose');
  return lignes.join('\n');
}

/**
 * L'avis d'un dossier de la base : sa lecture, le marché autour, les
 * clients. Chaque source qui rate est simplement tue, l'avis part quand même.
 */
export async function avisDuDossier(dealId, { lien = null, marche = undefined } = {}) {
  const { obtenirDossier } = await import('../deal/index.js');
  const dossier = obtenirDossier(dealId);
  if (!dossier) return null;
  const { Records } = await import('../db.js');
  const brut = Records.findBy('Deal', 'deal_id', dealId);
  let m = marche;
  if (m === undefined) {
    try {
      const { comparerAuMarche } = await import('../deal/comparaison-marche.js');
      const r = await comparerAuMarche(brut, 0);
      m = r?.ok ? r : null;
    } catch { m = null; }
  }
  let clients = null;
  try {
    const { mondayConfigure } = await import('../monday.js');
    if (mondayConfigure() && !dossier.test) {
      const { investisseursPourDeal } = await import('../deal/monday-sync.js');
      const candidats = await investisseursPourDeal(brut);
      clients = { configure: true, clients: candidats.map((c) => ({ nom: c.client.nom })) };
    }
  } catch { clients = null; }
  return avisPreanalyse({ dossier, marche: m, clients, lien });
}
