// La source de chaque champ d'une présentation bancaire (13 oct. 2026, Jules :
// « on doit pouvoir lui demander la source de n'importe quel chiffre », et un
// mode Sources où le survol d'un chiffre ou d'une ligne dit d'où il vient).
// Pur : la fiche du projet telle qu'elle est aujourd'hui, la diapositive et ce
// que sa construction a retenu (d.sources, d.sources_liens). Rien n'est
// enregistré dans la diapositive : c'est relu à chaque ouverture.
//
// Une source : { origine, detail, calcul?, liens?: [{ href, texte }], nature,
// ecart? }. nature dit la confiance : projet (la fiche), donnee (une source
// publique), calcul (fait par la plateforme), carte, ia (estimation non
// vérifiée), modele (texte du modèle Klocka), a_remplir. ecart : la diapositive
// n'affiche plus ce que la fiche donne aujourd'hui (retouche à la main, ou
// fiche modifiée depuis).

import { calculerTableauAnnuel, parametresDuProjet } from '../src/components/simulator/CalculFinancier.js';

const positif = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const rempli = (v) => typeof v === 'string' && v.trim() && !/^\[.*\]$/.test(v.trim());
const nb = (n, d = 0) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ');
const eur = (n) => `${nb(Math.round(n))} €`;
const dateFr = (iso) => (iso && !isNaN(new Date(iso)) ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

// Les champs de la fiche, nommés comme à l'écran du projet.
const CHAMPS = {
  sim_loyer_initial_ht: 'Loyer initial HT, onglet Simulateur',
  loyer_annuel_ht: 'Loyer annuel HT de la fiche',
  bail_loyer_actuel: 'Loyer actuel, onglet Analyse du bail',
  sim_prix_bien_negocie: 'Prix négocié, onglet Simulateur',
  prix_acquisition: 'Prix d\'acquisition de la fiche',
  sim_prix_bien_fai: 'Prix FAI, onglet Simulateur',
  surface_m2: 'Surface de la fiche',
  sim_surface: 'Surface, onglet Simulateur',
  loyer_m2_an: 'Loyer au m² de la fiche',
  bail_date_echeance: 'Échéance, onglet Analyse du bail',
  echeance_bail: 'Échéance du bail de la fiche',
  nom_locataire: 'Locataire, onglet Locataire',
  activite_locataire: 'Activité du locataire, onglet Locataire',
  adresse_complete: 'Adresse de la fiche',
  statut_bail: 'Statut du bail, onglet Analyse du bail',
  sim_indexation_loyers: 'Indexation des loyers, onglet Simulateur',
  sim_duree_credit: 'Durée du crédit, onglet Simulateur',
  sim_apport: 'Apport, onglet Simulateur',
  sim_prix_revient: 'Prix de revient, onglet Simulateur',
  sim_rendement_capital: 'Rendement de sortie, onglet Simulateur',
  marche_loyer_autour: 'Loyer autour, onglet Marché (correction de l\'équipe)',
};

const STATUTS = { en_cours: 'En cours', renouvele: 'Renouvelé', a_renouveler: 'À renouveler', tacite: 'Tacite reconduction', echu: 'Échu' };

/** Le premier champ rempli d'une liste : { cle, valeur } ou null. */
function premier(p, cles, test = positif) {
  for (const cle of cles) if (test(p?.[cle])) return { cle, valeur: test === positif ? positif(p[cle]) : p[cle] };
  return null;
}

/** Pure : deux textes qui disent la même chose, à la casse et aux espaces près (« Société X » contient « X »). */
export const memeTexte = (a, b) => {
  const t = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return !!t(a) && !!t(b) && (t(a) === t(b) || t(a).includes(t(b)) || t(b).includes(t(a)));
};

/** Pure : les chiffres d'un texte, pour comparer « 18 000 € » et « 18000 ». */
export const memesChiffres = (a, b) => {
  const c = (v) => String(v ?? '').replace(/[^\d]/g, '');
  return !!c(a) && c(a) === c(b);
};

/**
 * Pure : la source de chaque champ des diapositives, { [diapoId]: { [chemin]: source } }.
 * @param {object} p le projet
 * @param {object[]} diapos
 * @param {{ loyerSecteur?: { valeur: number, source: string } | null, prixMurs?: object | null }} [o] prixMurs : l'analyse de prix Equimmox gardée (equimmox.js)
 */
export function sourcesDesChamps(p, diapos = [], { loyerSecteur = null, prixMurs = null } = {}) {
  const sortie = {};
  for (const d of diapos || []) {
    const s = sourcesDeLaDiapo(p || {}, d, { loyerSecteur, prixMurs });
    // Ce qu'AK a posé avec sa source (modifier_presentation, 13 oct. 2026) passe avant ce que la construction avait retenu.
    for (const [chemin, pv] of Object.entries(d.provenance || {})) {
      if (!pv?.source) continue;
      s[chemin] = {
        nature: 'donnee', origine: pv.source,
        detail: `Posé par AK le ${dateFr(pv.le) || '—'}, d'après cette source.`,
        liens: pv.lien ? [{ href: pv.lien, texte: pv.source }] : [],
      };
    }
    sortie[d.id] = s;
  }
  return sortie;
}

function sourcesDeLaDiapo(p, d, { loyerSecteur, prixMurs }) {
  const fiche = p.id ? [{ href: `/Projet?id=${encodeURIComponent(p.id)}`, texte: 'Ouvrir la fiche du projet' }] : [];
  const s = {};
  const ecart = (chemin, attendu) => {
    const affiche = lire(d, chemin);
    if (attendu == null || !rempli(String(affiche ?? ''))) return null;
    const pareil = /\d/.test(String(attendu)) ? memesChiffres(affiche, attendu) : memeTexte(affiche, attendu);
    return !pareil ? `La diapositive affiche « ${affiche} », la fiche donne aujourd'hui ${attendu} : retouché à la main, ou la fiche a changé depuis.` : null;
  };
  // Un champ de la fiche, tel quel.
  const duProjet = (chemin, cles, { format = (v) => String(v), test = positif, quoi = null } = {}) => {
    const f = premier(p, cles, test);
    if (!f) {
      s[chemin] = { nature: 'a_remplir', origine: 'La fiche du projet', detail: `${quoi ? `${quoi} : ` : ''}aucun des champs ${cles.map((c) => `« ${CHAMPS[c] || c} »`).join(', ')} n'est rempli. La case est à compléter, sur la fiche ou ici.`, liens: fiche };
      return null;
    }
    const valeur = format(f.valeur);
    s[chemin] = {
      nature: 'projet', origine: 'La fiche du projet',
      detail: `${CHAMPS[f.cle] || f.cle} : ${valeur}.${cles.length > 1 && cles[0] !== f.cle ? ` (« ${CHAMPS[cles[0]] || cles[0]} » est vide : c'est le champ suivant qui est pris.)` : ''}`,
      liens: fiche, ecart: ecart(chemin, valeur),
    };
    return f.valeur;
  };
  const calcul = (chemin, detail, formule, attendu = null) => {
    s[chemin] = { nature: 'calcul', origine: 'Calculé par la plateforme depuis la fiche du projet', detail, calcul: formule, liens: fiche, ecart: ecart(chemin, attendu) };
  };
  const modele = (chemin, detail = 'Texte du modèle Klocka, le même pour chaque présentation. Il se retouche ici.') => { s[chemin] = { nature: 'modele', origine: 'Le modèle de présentation', detail }; };
  const aRemplir = (chemin, detail) => { s[chemin] = { nature: 'a_remplir', origine: 'Aucune source pour l\'instant', detail }; };

  const LOYER = ['sim_loyer_initial_ht', 'loyer_annuel_ht', 'bail_loyer_actuel'];
  const PRIX = ['sim_prix_bien_negocie', 'prix_acquisition', 'sim_prix_bien_fai'];
  const SURFACE = ['surface_m2', 'sim_surface'];
  const ECHEANCE = ['bail_date_echeance', 'echeance_bail'];
  const valide = (v) => !!v && !isNaN(new Date(v));
  const loyer = premier(p, LOYER)?.valeur || null;
  const prix = premier(p, PRIX)?.valeur || null;
  // « Acquisition droits inclus » : le prix de revient du simulateur, pas le prix négocié FAI (13 oct. 2026, Jules).
  const simule = (() => { try { const r = calculerTableauAnnuel(parametresDuProjet(p)); return positif(r?.prixRevient) ? r : null; } catch { return null; } })();
  const revient = simule?.prixRevient || positif(p.sim_prix_revient) || prix;
  const acquisition = (chemin) => {
    if (!simule) return positif(p.sim_prix_revient) ? duProjet(chemin, ['sim_prix_revient'], { format: eur }) : aRemplir(chemin, 'Le prix de revient vient du simulateur du projet : le prix négocié y manque.');
    const neg = parametresDuProjet(p).prixBienNegocie;
    const travaux = Math.max(0, simule.prixRevient - neg - simule.droitsEnregistrement - simule.totalFraisKlocka - simule.fraisDivers);
    calcul(chemin, 'Le prix de revient du simulateur : le prix négocié, les droits d\'enregistrement, les frais Klocka, les frais divers (dossier bancaire, création de société, courtage) et les travaux de l\'année 1. Pas le prix FAI.',
      `${eur(neg)} + ${eur(simule.droitsEnregistrement)} de droits + ${eur(simule.totalFraisKlocka)} de frais Klocka + ${eur(simule.fraisDivers)} de frais divers${travaux > 0 ? ` + ${eur(travaux)} de travaux` : ''} = ${eur(simule.prixRevient)}`, eur(simule.prixRevient));
  };
  const surface = premier(p, SURFACE)?.valeur || null;
  const echeance = premier(p, ECHEANCE, valide);
  const indexation = positif(p.sim_indexation_loyers) ?? 2;
  const rendement = positif(p.sim_rendement_capital) || 6.5;
  const restant = echeance ? Math.max(0, (new Date(echeance.valeur) - Date.now()) / (365.25 * 86400000)) : null;
  const bailRestant = (chemin) => {
    if (!echeance) return aRemplir(chemin, `Les années restantes se comptent depuis l'échéance du bail, vide sur la fiche (« ${CHAMPS.bail_date_echeance} »).`);
    calcul(chemin, `Depuis l'échéance du bail : ${CHAMPS[echeance.cle]}, ${dateFr(echeance.valeur)}.`, `échéance - aujourd'hui = ${nb(restant, 1)} ans`, `${nb(restant, 1)} ans`);
  };
  const loyerM2 = (chemin) => {
    if (positif(p.loyer_m2_an)) return duProjet(chemin, ['loyer_m2_an'], { format: (v) => `${nb(v)} €` });
    if (!loyer || !surface) return aRemplir(chemin, 'Le loyer au m² se calcule avec le loyer annuel et la surface : l\'un des deux manque sur la fiche.');
    calcul(chemin, `Loyer annuel (${CHAMPS[premier(p, LOYER).cle]}) rapporté à la surface (${CHAMPS[premier(p, SURFACE).cle]}).`, `${eur(loyer)} / ${nb(surface)} m² = ${nb(Math.round(loyer / surface))} €/m²/an`, nb(Math.round(loyer / surface)));
  };
  // La ville et le quartier : ce que la construction a retenu (d.sources), avec ses liens.
  const groupe = (cle) => String(d.sources?.[cle] || '');
  const estIA = (txt) => /estimation de l'IA/i.test(txt);
  // L'estimation de l'IA à la création : de mémoire, sans recherche. Si le libellé du chiffre cite une source, on le dit.
  const sourceIA = (chemin) => {
    const libelle = String(lire(d, chemin.replace(/\.valeur$/, '.label')) ?? '');
    const citee = (libelle.match(/Le Figaro|INSEE|Filosofi|API Géo|Data-B|Equimmox/i) || [])[0];
    return {
      nature: 'ia', origine: 'Estimation de l\'IA',
      detail: `Proposé par l'IA à la création de la présentation, de mémoire : sans recherche web ni source vérifiée.${citee ? ` Le libellé cite ${citee}, mais la valeur n'a pas été relue sur ce site.` : ''} À confirmer avant d'envoyer : demandez à AK de la chercher à la source.`,
    };
  };
  const liensVille = d.sources_liens || {};
  const dossierInsee = liensVille.commune_code ? [{ href: `https://www.insee.fr/fr/statistiques/2011101?geo=COM-${liensVille.commune_code}`, texte: `INSEE, dossier complet de ${liensVille.commune_nom || 'la commune'}` }] : [];
  const deLaVille = (chemin, { publique, lien = [] }) => {
    const txt = groupe('chiffres');
    if (!rempli(String(lire(d, chemin) ?? ''))) return aRemplir(chemin, 'Aucune source n\'a rendu ce chiffre à la création de la présentation. AK peut le chercher (données de la commune : INSEE, Le Figaro), ou il se saisit ici.');
    if (/API Géo|INSEE Filosofi|Le Figaro/i.test(txt)) s[chemin] = { nature: 'donnee', origine: publique, detail: `Lu à la création de la présentation : ${publique}.`, liens: lien };
    else if (estIA(txt)) s[chemin] = sourceIA(chemin);
    else s[chemin] = { nature: 'donnee', origine: 'Le jeu de données des villes', detail: txt || 'Le jeu de données des villes de la plateforme (INSEE et observatoires).' };
  };
  const duSecteur = (chemin) => {
    const txt = groupe('chiffres');
    if (!rempli(String(lire(d, chemin) ?? ''))) return aRemplir(chemin, 'Pas de source fiable pour ce chiffre à l\'échelle du quartier : à valider auprès d\'un agent local, ou à demander à AK (Data-B pour un loyer).');
    if (estIA(txt)) s[chemin] = sourceIA(chemin);
    else s[chemin] = { nature: 'donnee', origine: txt.includes('description') ? 'La description du secteur' : 'Le jeu de données des secteurs', detail: txt || 'Le jeu de données des secteurs de la plateforme.', liens: txt.includes('description') ? fiche : [] };
  };
  const points = (chemin, cle) => {
    const txt = groupe(cle);
    if (!rempli(String(lire(d, chemin) ?? ''))) return aRemplir(chemin, 'Atout à écrire : aucune source n\'en a donné.');
    if (estIA(txt)) s[chemin] = { nature: 'ia', origine: 'Rédigé par l\'IA', detail: 'Rédigé par l\'IA à la création de la présentation : à relire, rien n\'y est vérifié.' };
    else s[chemin] = { nature: 'donnee', origine: txt.includes('description') ? 'La description de la fiche' : 'Le jeu de données de la plateforme', detail: txt || 'Le jeu de données de la plateforme.', liens: txt.includes('description') ? fiche : [] };
  };
  // Le prix des murs : l'analyse de prix d'Equimmox, si elle a été lue (13 oct. 2026).
  const murs = (chemin) => {
    if (!prixMurs?.moyenne) return aRemplir(chemin, 'Le prix des murs se lit sur Equimmox (Analyse de prix, offres de commerces) : demandez à AK « estime le prix des murs avec Equimmox ».');
    const x = prixMurs;
    s[chemin] = {
      nature: 'donnee', origine: 'Equimmox, analyse de prix',
      detail: `Les offres de vente de commerces autour du local${x.offres ? ` (${x.offres} annonces)` : ''}${x.rayon ? `, dans un rayon de ${x.rayon}` : ''}${x.surface_min && x.surface_max ? `, de ${x.surface_min} à ${x.surface_max} m²` : ''}, lues le ${dateFr(x.le)}. Des prix demandés, pas des ventes signées.`,
      calcul: [x.bas, x.moyenne, x.haut].every((v) => v != null) ? `bas ${nb(x.bas)} €/m² · moyenne ${nb(x.moyenne)} €/m² · haut ${nb(x.haut)} €/m²` : null,
      liens: [{ href: 'https://app.equimmox.com', texte: 'Equimmox (Analyse, Analyse de prix)' }],
      ecart: ecart(chemin, nb(Math.round(x.moyenne))),
    };
  };
  const photo = (chemin) => { s[chemin] = { nature: 'projet', origine: 'Les photos du projet', detail: 'Une photo de la fiche du projet, ou déposée ici. Un clic en mode Édition la change.', liens: fiche }; };

  switch (d.type || d.id) {
    case 'couverture':
      acquisition('stats.0.valeur');
      duProjet('stats.1.valeur', LOYER, { format: eur });
      bailRestant('stats.2.valeur');
      duProjet('heros.accroche', ['adresse_complete'], { test: rempli });
      calcul('heros.titre', 'Le nom de la commune, tiré de l\'adresse de la fiche.', null);
      aRemplir('heros.porteur', 'Le nom du porteur du projet, à écrire.');
      aRemplir('heros.banque', 'La banque à qui la présentation est adressée, à écrire.');
      photo('photo');
      break;
    case 'sommaire':
      modele('heros.accroche');
      (d.items || []).forEach((_, k) => { modele(`items.${k}.titre`, 'Les chapitres du modèle. Un clic sur une ligne, en lecture, va à sa page.'); modele(`items.${k}.page`, 'Le numéro de page du chapitre dans le modèle.'); });
      break;
    case 'ville':
      deLaVille('heros.grand', { publique: 'INSEE, population municipale (API Géo de l\'État)', lien: dossierInsee });
      deLaVille('chiffres.0.valeur', { publique: `INSEE, Filosofi${liensVille.filosofi_annee ? ` ${liensVille.filosofi_annee}` : ''} : niveau de vie médian, revenu disponible par unité de consommation`, lien: dossierInsee });
      deLaVille('chiffres.1.valeur', { publique: `INSEE, taux de chômage localisés${liensVille.zone_emploi ? `, zone d'emploi de ${liensVille.zone_emploi}` : ' par zone d\'emploi'}${liensVille.chomage_periode ? ` (${liensVille.chomage_periode}, CVS)` : ''}`, lien: [{ href: 'https://www.insee.fr/fr/statistiques/1893230', texte: 'INSEE, taux de chômage par zone d\'emploi' }] });
      deLaVille('chiffres.2.valeur', { publique: 'Le Figaro Immobilier : prix médian des logements de la commune (appartements et maisons)', lien: liensVille.figaro ? [{ href: liensVille.figaro, texte: 'Le Figaro Immobilier, la page de la commune' }] : [] });
      (d.atouts || []).forEach((_, k) => points(`atouts.${k}`, 'atouts'));
      modele('heros.note', 'Le nom de la source du chiffre au-dessus.');
      photo('photo');
      break;
    case 'emplacement': {
      const lat = Number(d.lat); const lon = Number(d.lon);
      const ok = d.lat != null && Number.isFinite(lat) && Number.isFinite(lon);
      const coords = Number(p.latitude) && Number(p.longitude);
      s.carte = ok
        ? { nature: 'carte', origine: 'Google Maps', detail: `Carte centrée sur ${nb(lat, 5)}, ${nb(lon, 5)} : ${coords ? 'les coordonnées de la fiche' : 'l\'adresse de la fiche, géocodée par la Base adresse nationale'}.`, liens: [{ href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, texte: 'Voir le point sur Google Maps' }] }
        : { nature: 'a_remplir', origine: 'Google Maps', detail: 'L\'adresse n\'a pas pu être placée sur une carte : vérifiez l\'adresse de la fiche.', liens: fiche };
      s['heros.accroche'] = { nature: 'donnee', origine: 'Le secteur', detail: 'Le premier atout du secteur, repris de la diapositive Quartier : sa source y est donnée.' };
      duProjet('heros.note', ['adresse_complete'], { test: rempli });
      // Les flux (13 oct. 2026) : une estimation de l'étude d'implantation, pas un comptage.
      if (d.flux) {
        const o = d.flux.origine || {};
        const lien = o.lien ? [{ href: o.lien, texte: o.etude }] : [];
        const quand = o.le ? `, lue le ${dateFr(o.le)}` : '';
        for (const k of ['densite', 'basse', 'haute']) {
          s[`flux.pieton.${k}`] = { nature: 'calcul', origine: o.etude || 'Étude d\'implantation', detail: `${o.pieton || 'Une estimation, pas un comptage.'}${quand}.${k === 'basse' ? ' Basse : le passage à l\'heure creuse.' : k === 'haute' ? ' Haute : le passage à l\'heure de pointe.' : ''}`, liens: lien };
        }
        s['flux.voiture.densite'] = { nature: 'calcul', origine: o.etude || 'Étude d\'implantation', detail: `${o.voiture || 'D\'après la classe de la voie chez OpenStreetMap.'}${quand}.`, liens: lien };
        for (const k of ['basse', 'haute']) s[`flux.voiture.${k}`] = { nature: 'a_remplir', origine: 'Pas d\'estimation par heure', detail: 'Ni Data-B ni l\'étude Klocka n\'estiment le passage des voitures par heure : seulement leur densité, d\'après la classe de la voie. Un comptage de la mairie ou du département se saisit ici.' };
      }
      modele('legende', 'La légende du repère, à retoucher ici.');
      break;
    }
    case 'quartier':
      duSecteur('heros.grand');
      (d.chiffres || []).forEach((c, k) => (/murs/i.test(String(c?.label || '')) ? murs(`chiffres.${k}.valeur`) : duSecteur(`chiffres.${k}.valeur`)));
      (d.atouts || []).forEach((_, k) => points(`atouts.${k}`, 'atouts'));
      points('heros.accroche', 'atouts');
      photo('photo');
      break;
    case 'local':
      duProjet('heros.grand', LOYER, { format: eur });
      loyerM2('stats.0.valeur');
      bailRestant('stats.1.valeur');
      duProjet('stats.2.valeur', ECHEANCE, { test: valide, format: (v) => `${String(new Date(v).getMonth() + 1).padStart(2, '0')}/${new Date(v).getFullYear()}` });
      duProjet('identite.0.valeur', ['nom_locataire'], { test: rempli, format: (v) => `Société ${v}` });
      duProjet('identite.1.valeur', ['activite_locataire'], { test: rempli });
      duProjet('identite.2.valeur', ['adresse_complete'], { test: rempli });
      duProjet('economie.0.valeur', LOYER, { format: eur });
      loyerM2('economie.1.valeur');
      duProjet('economie.2.valeur', ECHEANCE, { test: valide, format: dateFr });
      break;
    case 'photos':
      [0, 1, 2].forEach((k) => photo(`photos.${k}`));
      break;
    case 'bail':
      bailRestant('heros.grand');
      (d.points || []).forEach((pt, k) => {
        const c = `points.${k}.valeur`;
        const t = String(pt?.titre || '');
        if (/^Activité/i.test(t)) duProjet(c, ['activite_locataire'], { test: rempli });
        else if (/^Statut/i.test(t)) duProjet(c, ['statut_bail'], { test: rempli, quoi: 'Statut', format: (v) => STATUTS[String(v).toLowerCase()] || String(v).replace(/_/g, ' ') });
        else if (/échéance/i.test(t)) duProjet(c, ECHEANCE, { test: valide, format: dateFr });
        else if (/annuel/i.test(t)) duProjet(c, LOYER, { format: eur });
        else if (/mensuel/i.test(t)) loyer ? calcul(c, `Le loyer annuel (${CHAMPS[premier(p, LOYER).cle]}) sur douze mois.`, `${eur(loyer)} / 12 = ${eur(loyer / 12)}`, eur(loyer / 12)) : aRemplir(c, 'Le loyer annuel manque sur la fiche.');
        else if (/revalorisation/i.test(t)) duProjet(c, ['sim_indexation_loyers'], { format: (v) => `+${nb(v, 1)} % par an` }) ?? calcul(c, 'Le simulateur n\'a pas d\'indexation : 2 % par an par défaut.', null);
        else modele(c, 'Une clause type du bail commercial, écrite par le modèle : à vérifier contre le bail signé.');
      });
      break;
    case 'enseignes': {
      const la = Number(p.latitude); const lo = Number(p.longitude);
      const osmAutour = la && lo ? [{ href: `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`, texte: 'OpenStreetMap autour du local' }] : [];
      (d.enseignes || []).forEach((e, k) => {
        if (!rempli(String(e?.nom || ''))) { aRemplir(`enseignes.${k}.nom`, 'Case libre : aucune autre enseigne nationale relevée autour du local.'); return; }
        const osm = osmAutour;
        // Depuis le 13 oct. 2026 : Google Maps (ouvert, à moins de 300 m) et la liste des marques d'OpenStreetMap ; avant, OpenStreetMap seul.
        if (e.maps || e.distance_m != null) {
          const maps = e.maps ? [{ href: e.maps, texte: `${e.nom_google || e.nom} sur Google Maps` }] : [];
          s[`enseignes.${k}.nom`] = { nature: 'donnee', origine: 'Google Maps', detail: `« ${e.nom_google || e.nom} » : ouvert sur Google Maps${e.distance_m != null ? ` à ${nb(e.distance_m)} m du local` : ''} à la création de la présentation, et reconnu comme marque nationale (liste des marques d'OpenStreetMap, présentes en France).`, liens: [...maps, { href: 'https://nsi.guide', texte: 'La liste des marques (name-suggestion-index)' }] };
          s[`enseignes.${k}.secteur`] = { nature: 'donnee', origine: 'Google Maps', detail: 'Le type de commerce que Google Maps donne à ce lieu.', liens: maps };
          s[`enseignes.${k}.logo`] = { nature: 'donnee', origine: 'Wikidata', detail: 'Le logo officiel de la marque sur Wikidata (Wikimedia Commons), ou déposé ici.' };
          return;
        }
        s[`enseignes.${k}.nom`] = { nature: 'donnee', origine: 'OpenStreetMap', detail: `« ${e.nom} » : une marque relevée dans OpenStreetMap à moins de 400 m du local, à la création de la présentation.`, liens: osm };
        s[`enseignes.${k}.secteur`] = { nature: 'donnee', origine: 'OpenStreetMap', detail: 'Le secteur, d\'après le type de commerce noté dans OpenStreetMap.', liens: osm };
        s[`enseignes.${k}.logo`] = { nature: 'donnee', origine: 'Wikidata', detail: 'Le logo officiel de la marque sur Wikidata (Wikimedia Commons), ou déposé ici.' };
      });
      s['heros.accroche'] = (d.enseignes || []).some((e) => e?.maps || e?.distance_m != null)
        ? { nature: 'calcul', origine: 'Google Maps', detail: 'Les types de commerce des enseignes trouvées autour du local, mis bout à bout.' }
        : { nature: 'calcul', origine: 'OpenStreetMap', detail: 'Les secteurs des enseignes relevées autour du local, mis bout à bout.', liens: osmAutour };
      break;
    }
    case 'marche': {
      duProjet('heros.grand', PRIX, { format: eur });
      if (!prix || !surface) aRemplir('local.prix_m2', 'Le prix au m² se calcule avec le prix et la surface : l\'un des deux manque sur la fiche.');
      else calcul('local.prix_m2', `Prix (${CHAMPS[premier(p, PRIX).cle]}) rapporté à la surface (${CHAMPS[premier(p, SURFACE).cle]}).`, `${eur(prix)} / ${nb(surface)} m² = ${nb(Math.round(prix / surface))} €/m²`, nb(Math.round(prix / surface)));
      loyerM2('local.loyer_m2');
      if (positif(p.marche_loyer_autour)) duProjet('marche.loyer', ['marche_loyer_autour'], { format: (v) => `${nb(v)} €/m²/an` });
      else if (loyerSecteur?.valeur) s['marche.loyer'] = { nature: 'donnee', origine: loyerSecteur.source || 'Equimmox', detail: `Le loyer relevé autour du local par l'onglet Marché du projet : ${nb(loyerSecteur.valeur)} €/m²/an.`, liens: fiche, ecart: ecart('marche.loyer', nb(loyerSecteur.valeur)) };
      else aRemplir('marche.loyer', 'L\'onglet Marché du projet n\'a pas de loyer du secteur : lancez-le, ou demandez à AK (Data-B).');
      murs('marche.murs');
      break;
    }
    case 'projection': {
      const formule = `loyer (${loyer ? eur(loyer) : 'à remplir'}) indexé de ${nb(indexation, 1)} % par an sur 20 ans`;
      calcul('heros.grand', 'Les loyers nets cumulés sur 20 ans, rapportés au prix de revient (acquisition droits inclus).', `${formule} ; cumul / prix de revient${revient ? ` (${eur(revient)})` : ''}`);
      (d.lignes || []).forEach((l, k) => {
        const c = `lignes.${k}.valeur`;
        const lb = String(l?.label || '');
        if (/Acquisition/i.test(lb)) acquisition(c);
        else if (/cumul/i.test(lb)) calcul(c, 'La somme des loyers nets des 20 années (le tableau des revenus fonciers).', `${formule}, moins les charges non refacturées et les travaux article 606 du simulateur`);
        else if (/Revente/i.test(lb)) calcul(c, `Le loyer de l'année 20 capitalisé au rendement de sortie (${CHAMPS.sim_rendement_capital}, ${nb(rendement, 1)} %${positif(p.sim_rendement_capital) ? '' : ', valeur par défaut'}).`, `loyer de l'année 20 / ${nb(rendement, 1)} %`);
        else if (/Plus-value/i.test(lb)) calcul(c, 'La revente moins le prix de revient (acquisition droits inclus). C\'est une hypothèse, pas une estimation de valeur.', `revente - ${revient ? eur(revient) : 'prix de revient'}`);
      });
      calcul('legende', 'Les barres montrent les loyers nets cumulés, année après année.', formule);
      break;
    }
    case 'revenus':
      (d.lignes || []).forEach((l, r) => (l || []).forEach((_, k) => {
        const c = `lignes.${r}.${k}`;
        if (k === 0) return modele(c, 'L\'année de détention.');
        calcul(c, ['', 'Le loyer de l\'année : loyer du simulateur indexé chaque année (et revalorisé l\'année prévue au simulateur).', 'Les travaux article 606 saisis au simulateur pour cette année.', 'Le loyer brut, moins les charges non refacturées au locataire et les travaux de l\'année.', 'La somme des loyers nets depuis l\'année 1.'][k], `indexation de ${nb(indexation, 1)} % par an (${CHAMPS.sim_indexation_loyers}${positif(p.sim_indexation_loyers) ? '' : ', valeur par défaut'})`);
      }));
      (d.entetes || []).forEach((_, k) => modele(`entetes.${k}`, 'L\'intitulé de la colonne.'));
      break;
    case 'conditions':
      (d.blocs || []).forEach((b, k) => {
        const c = `blocs.${k}.valeur`;
        const t = String(b?.titre || '');
        if (/Durée/i.test(t)) duProjet(c, ['sim_duree_credit'], { format: (v) => `${v} ans` }) ?? modele(c, 'Le simulateur n\'a pas de durée de crédit : 20 ans par défaut.');
        else if (/Apport/i.test(t)) duProjet(c, ['sim_apport'], { format: eur });
        else if (/Montant/i.test(t)) (revient && positif(p.sim_apport)) ? calcul(c, `Le prix de revient (acquisition droits inclus) moins l'apport (${CHAMPS.sim_apport}).`, `${eur(revient)} - ${eur(positif(p.sim_apport))} = ${eur(revient - positif(p.sim_apport))}`, eur(revient - positif(p.sim_apport))) : aRemplir(c, 'Le montant à financer se calcule avec le prix de revient et l\'apport : l\'apport manque au simulateur.');
        else modele(c, 'Le type de taux demandé, à ajuster avec la banque.');
      });
      break;
    case 'porteur': case 'structuration': case 'merci':
      break;
    default:
      break;
  }
  return s;
}

/** Pure : la valeur d'un chemin (« stats.0.valeur ») dans une diapositive. */
export function lire(d, chemin) {
  return String(chemin || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
}

/**
 * Pure : la source d'un chemin, avec repli sur sa ligne (« chiffres.1.label » prend celle de « chiffres.1.valeur »).
 * Le libellé d'un chiffre partage sa source ; ce qui n'en a pas est du texte du modèle.
 */
export function sourceDuChemin(sources = {}, chemin = '') {
  if (sources[chemin]) return sources[chemin];
  const frere = String(chemin).replace(/\.(label|titre|page)$/, '.valeur');
  if (sources[frere]) return sources[frere];
  return null;
}

/** Pure : les sources d'une présentation en texte, pour AK (une ligne par champ sourcé). */
export function sourcesEnTexte(sourcesParDiapo = {}, diapos = []) {
  const lignes = [];
  for (const d of diapos) {
    const s = sourcesParDiapo[d.id] || {};
    for (const [chemin, src] of Object.entries(s)) {
      if (src.nature === 'modele') continue;
      const v = lire(d, chemin);
      lignes.push(`[${d.id}] ${chemin}${v != null && typeof v !== 'object' ? ` = « ${String(v).slice(0, 60)} »` : ''} : ${src.origine}. ${src.detail}${src.calcul ? ` Calcul : ${src.calcul}.` : ''}${src.ecart ? ` ATTENTION : ${src.ecart}` : ''}${(src.liens || []).length ? ` Lien : ${src.liens.map((l) => l.href).join(', ')}` : ''}`);
    }
  }
  return lignes.join('\n');
}
