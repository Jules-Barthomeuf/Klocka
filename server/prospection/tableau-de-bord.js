/**
 * Le tableau de bord de la Prospection (15 nov. 2026, Jules : « on arrive dessus, on voit combien on a fait d'appels,
 * à combien de pourcents une ville est faite, et quels dossiers on a sortis ce mois-ci et où ; ça nous propose une
 * ville »). Rien n'est écrit : on relit les appels (suivi-appels), les listes de l'agent IA (avancement par ville,
 * même calcul que la barre du Mode appel) et les dossiers et projets nés depuis le 1er du mois.
 */
import { Records } from '../db.js';

const AGENCE = 'AgenceProspect';

/** Pure : un nom de ville comparable (« Paris 4e Arrondissement », « LYON » → « paris », « lyon »). */
export function cleVille(v) {
  return String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bcedex\b.*$/, '')
    .replace(/\s+\d.*$/, '')
    .replace(/[^a-z' -]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pure : la ville d'une adresse écrite (« 12 rue X, 69002 Lyon » → « Lyon » ; « 5 Place de la Libération Lorient » → « Lorient »). */
export function villeDeLAdresse(adresse) {
  const t = String(adresse || '').trim();
  if (!t) return null;
  const cp = t.match(/\b\d{5}\s+([^,\d]+?)\s*(?:,|$)/);
  if (cp) return cp[1].trim();
  const parties = t.split(',').map((x) => x.trim()).filter(Boolean);
  if (parties.length >= 2) return parties.at(-1).replace(/^\d+\s*/, '').trim() || null;
  const mots = t.split(/\s+/);
  const dernier = mots.at(-1);
  return mots.length > 1 && /^\p{Lu}/u.test(dernier) ? dernier : null;
}

/** Pure : le premier jour du mois à minuit (heure locale du serveur), en ISO. */
export function debutDuMois(maintenantD = new Date()) {
  return new Date(maintenantD.getFullYear(), maintenantD.getMonth(), 1).toISOString();
}

/**
 * Pure : la ville à prospecter. D'abord là où sortent le plus de dossiers et de projets ce mois-ci et où la liste
 * n'est pas finie ; une ville qui en sort sans liste se propose aussi (l'agent IA y cherchera les agences). Sans
 * dossier du mois : la liste la moins avancée parmi celles qui ont encore des agences à appeler.
 */
export function villeProposee(villes, sorties) {
  const parCle = new Map(villes.map((v) => [cleVille(v.ville), v]));
  const candidates = sorties
    .map((s) => ({ s, l: parCle.get(cleVille(s.ville)) || null }))
    .filter(({ l }) => !l || l.fait_pourcent < 100)
    .sort((a, b) => b.s.total - a.s.total || (a.l?.fait_pourcent ?? 0) - (b.l?.fait_pourcent ?? 0));
  const c = candidates[0];
  if (c) {
    const n = c.s.total;
    const sortis = `${n} dossier${n > 1 ? 's' : ''} ou projet${n > 1 ? 's' : ''} ce mois-ci`;
    return c.l
      ? { ville: c.l.ville, liste_id: c.l.id, raison: `${sortis}, ${c.l.fait_pourcent} % des agences appelées.` }
      : { ville: c.s.ville, liste_id: null, raison: `${sortis}, et pas encore de liste d'agences.` };
  }
  const reste = villes.filter((v) => v.fait_pourcent < 100 && v.agences > 0).sort((a, b) => a.fait_pourcent - b.fait_pourcent);
  if (!reste.length) return null;
  return { ville: reste[0].ville, liste_id: reste[0].id, raison: `La liste la moins avancée : ${reste[0].fait_pourcent} % des agences appelées.` };
}

/** Pure : les dossiers et projets nés depuis `depuis`, regroupés par ville, le plus fourni d'abord. */
export function sortiesParVille({ dossiers = [], projets = [] }, depuis) {
  const par = new Map();
  const ajouter = (ville, genre, x) => {
    const k = cleVille(ville);
    if (!k) return;
    const g = par.get(k) || { ville: ville.trim(), dossiers: 0, projets: 0, total: 0, noms: [] };
    g[genre] += 1;
    g.total += 1;
    if (g.noms.length < 4) g.noms.push(x);
    par.set(k, g);
  };
  for (const d of dossiers) {
    const le = d.cree_le || d.created_date;
    // Les dossiers d'essai (« Essai Marché · … ») ne disent rien de l'activité.
    if (!le || le < depuis || d.archived || d.test || /^essai\b/i.test(d.titre || '')) continue;
    const ville = (d.lots || []).map((l) => l.ville).find(Boolean);
    if (ville) ajouter(ville, 'dossiers', { id: d.deal_id, nom: d.titre, genre: 'dossier' });
  }
  for (const p of projets) {
    if (!p.created_date || p.created_date < depuis || p.archived || p.test) continue;
    const ville = p.ville || villeDeLAdresse(p.adresse_complete);
    if (ville) ajouter(ville, 'projets', { id: p.id, nom: p.titre || p.adresse_complete, genre: 'projet' });
  }
  return [...par.values()].sort((a, b) => b.total - a.total || a.ville.localeCompare(b.ville, 'fr'));
}

const resumeAppels = (s) => ({ appels: s.equipe?.appels || 0, aboutis: s.equipe?.aboutis || 0, biens: s.equipe?.biens || 0 });

export async function tableauDeBord({ maintenantD = new Date() } = {}) {
  const [{ suiviAppels }, IA, MA, { listerDossiers }] = await Promise.all([
    import('./suivi-appels.js'), import('./agent-ia.js'), import('./mode-appel.js'), import('../deal/index.js'),
  ]);
  const jour = suiviAppels({ jours: 1, maintenantD, journal: 0 });
  const semaine = suiviAppels({ jours: 7, maintenantD, journal: 0 });
  const mois = suiviAppels({ jours: 30, maintenantD, journal: 0 });

  // L'avancement de chaque ville : les agences lues une fois, rangées par liste.
  const parListe = new Map();
  for (const a of Records.list(AGENCE)) {
    if (a.hors_cible || !a.liste_id) continue;
    if (!parListe.has(a.liste_id)) parListe.set(a.liste_id, []);
    parListe.get(a.liste_id).push(a);
  }
  const villes = IA.listes().map((l) => {
    const c = MA.chiffresDeLaVille(MA.annoter(parListe.get(l.id) || [], maintenantD));
    return { id: l.id, ville: l.ville, agences: c.agences - c.mortes, appelees: c.appelees, fait_pourcent: c.fait_pourcent, interessees: c.interessees, a_rappeler: c.a_rappeler };
  }).filter((v) => v.agences > 0).sort((a, b) => b.fait_pourcent - a.fait_pourcent || a.ville.localeCompare(b.ville, 'fr'));

  const depuis = debutDuMois(maintenantD);
  const sorties = sortiesParVille({ dossiers: listerDossiers(500), projets: Records.list('Project') }, depuis);

  return {
    ok: true,
    appels: { jour: resumeAppels(jour), semaine: resumeAppels(semaine), mois: resumeAppels(mois) },
    par_personne: (semaine.analystes || []).filter((x) => x.appels > 0).map((x) => ({ email: x.email, prenom: x.prenom, appels: x.appels, aboutis: x.aboutis, biens: x.biens || 0 })),
    par_jour: (mois.par_jour || []).slice(-14).map((x) => ({ jour: x.jour, appels: x.appels, aboutis: x.aboutis })),
    villes,
    mois: { depuis, sorties },
    proposee: villeProposee(villes, sorties),
  };
}
