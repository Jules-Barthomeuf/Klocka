// Le Suivi des mandataires (9 oct. 2026) : ce que chaque mandataire K Partners
// fait de son espace. Qui se connecte, quelles pages, puis le travail lui-même :
// propriétaires appelés, prospections, avis de valeur, mandats, dossiers,
// ventes, et ce que l'IA a coûté pour lui. Lecture seule, rien ne s'écrit.
//
// Les chiffres comptent ce qui s'est passé sur la période (la date de
// l'événement), sauf les RDV en cours, qui sont l'état des fiches aujourd'hui.

import { Records } from './db.js';
import { EUR_PAR_USD } from './llm-couts.js';

const norm = (e) => String(e || '').trim().toLowerCase();
const jourDe = (iso) => String(iso || '').slice(0, 10);
const dans = (iso, depuis) => !!iso && String(iso) >= depuis;

const LIBELLES_DOSSIER = { go: 'Dossier en GO', no_go: 'Dossier en NO GO', en_etude: 'Dossier à l\'étude', complements: 'Compléments demandés' };
const ETAPES_VENTE = [['preparation_le', 'Mise en marché préparée'], ['presente_le', 'Bien présenté'], ['offre_le', 'Offre reçue'], ['compromis_le', 'Compromis signé'], ['acte_le', 'Acte signé']];

/** Pure, sur les tables passées : le suivi de la période. */
export function suiviMandataires({ jours = 30, maintenant = new Date(), tables = null } = {}) {
  const t = tables || {
    users: Records.list('User'), visites: Records.list('VisitePage'), proprietaires: Records.list('ProprietaireMandataire'),
    prospections: Records.list('ProspectionMandataire'), trouvailles: Records.list('TrouvailleAgent'), estimations: Records.list('EstimationMandataire').filter((x) => !x.exemple),
    // Les fiches d'exemple posées à l'arrivée (mandataire-exemples.js) ne sont pas de l'usage.
    mandats: Records.list('MandatMandataire').filter((x) => !x.exemple), dossiers: Records.list('DossierMandataire').filter((x) => !x.exemple), ventes: Records.list('MiseEnMarche').filter((x) => !x.exemple), couts: Records.list('CoutIA'),
  };
  const depuis = new Date(maintenant.getTime() - jours * 86400000).toISOString();
  const de = (liste, champ = 'mandataire_email') => {
    const m = new Map();
    for (const x of liste) { const e = norm(x[champ]); if (e) m.set(e, [...(m.get(e) || []), x]); }
    return m;
  };
  const comptes = t.users.filter((u) => u.role === 'mandataire' || (u.role === 'admin' && u.aussi_mandataire === true));
  const emails = new Set(comptes.map((u) => norm(u.email)));
  const visitesM = t.visites.filter((v) => v.role === 'mandataire' || emails.has(norm(v.par)));
  for (const v of visitesM) emails.add(norm(v.par));
  const P = de(t.proprietaires), PR = de(t.prospections), TR = de(t.trouvailles), ES = de(t.estimations), MA = de(t.mandats), DO = de(t.dossiers), VE = de(t.ventes);
  const V = de(visitesM, 'par');
  const C = de(t.couts, 'par');
  emails.delete('');

  const journal = [];
  const pagesEquipe = new Map();
  const parJour = new Map();
  for (let i = jours - 1; i >= 0; i -= 1) parJour.set(jourDe(new Date(maintenant.getTime() - i * 86400000).toISOString()), { visites: 0, par: {} });

  const mandataires = [...emails].map((email) => {
    const compte = comptes.find((u) => norm(u.email) === email);
    const nom = compte?.full_name || email.split('@')[0];
    const vTout = V.get(email) || [];
    const v = vTout.filter((x) => dans(x.le, depuis));
    const pages = new Map();
    for (const x of v) {
      pages.set(x.page, (pages.get(x.page) || 0) + 1);
      pagesEquipe.set(x.page, (pagesEquipe.get(x.page) || 0) + 1);
      const j = parJour.get(jourDe(x.le));
      if (j) { j.visites += 1; j.par[email] = (j.par[email] || 0) + 1; }
    }
    const props = P.get(email) || [];
    let contacts = 0;
    for (const p of props) {
      for (const h of p.historique || []) {
        if (!['appel', 'statut'].includes(h.type) || !dans(h.le, depuis)) continue;
        contacts += 1;
        journal.push({ le: h.le, email, nom, quoi: h.type === 'appel' ? 'Appel' : 'Propriétaire', detail: `${p.nom || p.commerce || 'Propriétaire'}${p.ville ? ` · ${p.ville}` : ''} : ${h.texte}` });
      }
    }
    const prosp = PR.get(email) || [];
    for (const p of prosp) if (dans(p.cree_le, depuis)) journal.push({ le: p.cree_le, email, nom, quoi: 'Prospection', detail: `Lancée : ${p.nom || 'sans nom'}` });
    const est = ES.get(email) || [];
    for (const e of est) {
      if (dans(e.cree_le, depuis)) journal.push({ le: e.cree_le, email, nom, quoi: 'Avis de valeur', detail: `Commencé${e.bien ? ` : ${e.bien}` : ''}` });
      if (dans(e.envoye_le, depuis)) journal.push({ le: e.envoye_le, email, nom, quoi: 'Avis de valeur', detail: `Envoyé${e.bien ? ` : ${e.bien}` : ''}` });
    }
    const man = MA.get(email) || [];
    for (const m of man) {
      if (dans(m.cree_le, depuis)) journal.push({ le: m.cree_le, email, nom, quoi: 'Mandat', detail: `Préparé${m.bien ? ` : ${m.bien}` : ''}` });
      if (dans(m.signe_le, depuis)) journal.push({ le: m.signe_le, email, nom, quoi: 'Mandat', detail: `Signé${m.bien ? ` : ${m.bien}` : ''}` });
    }
    const dos = DO.get(email) || [];
    for (const d of dos) {
      if (dans(d.cree_le, depuis)) journal.push({ le: d.cree_le, email, nom, quoi: 'Dossier', detail: `Ouvert${d.bien ? ` : ${d.bien}` : ''}` });
      for (const [champ, statut] of [['go_le', 'go'], ['en_etude_le', 'en_etude'], ['complements_le', 'complements']]) {
        if (dans(d[champ], depuis)) journal.push({ le: d[champ], email, nom, quoi: 'Dossier', detail: `${LIBELLES_DOSSIER[statut]}${d.bien ? ` : ${d.bien}` : ''}` });
      }
    }
    const ven = VE.get(email) || [];
    for (const x of ven) for (const [champ, mot] of ETAPES_VENTE) if (dans(x[champ], depuis)) journal.push({ le: x[champ], email, nom, quoi: 'Vente', detail: `${mot}${x.bien ? ` : ${x.bien}` : ''}` });
    const cout = (C.get(email) || []).filter((x) => dans(x.le, depuis)).reduce((s, x) => s + (Number(x.cout) || 0), 0) * EUR_PAR_USD;
    const joursActifs = new Set(v.map((x) => jourDe(x.le))).size;
    return {
      email, nom, compte: !!compte, inscrit_le: compte?.created_date || null,
      derniere_visite: vTout.reduce((m, x) => (!m || x.le > m ? x.le : m), null),
      visites: v.length, jours_actifs: joursActifs,
      pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([page, n]) => ({ page, n })),
      proprietaires: props.length, proprietaires_ajoutes: props.filter((p) => dans(p.cree_le, depuis)).length, contacts,
      rdv: props.filter((p) => p.statut === 'rdv_pris').length,
      prospections: prosp.filter((p) => dans(p.cree_le, depuis)).length,
      trouvailles: (TR.get(email) || []).filter((x) => dans(x.trouve_le, depuis)).length,
      avis_commences: est.filter((e) => dans(e.cree_le, depuis)).length, avis_envoyes: est.filter((e) => dans(e.envoye_le, depuis)).length,
      mandats_signes: man.filter((m) => dans(m.signe_le, depuis)).length,
      dossiers_ouverts: dos.filter((d) => dans(d.cree_le, depuis)).length, dossiers_go: dos.filter((d) => dans(d.go_le, depuis)).length,
      actes: ven.filter((x) => dans(x.acte_le, depuis)).length,
      cout_ia_eur: Math.round(cout * 100) / 100,
    };
  }).sort((a, b) => b.visites - a.visites || String(b.derniere_visite || '').localeCompare(String(a.derniere_visite || '')));

  const somme = (k) => mandataires.reduce((s, m) => s + (m[k] || 0), 0);
  return {
    jours,
    equipe: {
      mandataires: mandataires.length, actifs: mandataires.filter((m) => m.visites).length,
      visites: somme('visites'), contacts: somme('contacts'), rdv: somme('rdv'), prospections: somme('prospections'),
      avis_envoyes: somme('avis_envoyes'), mandats_signes: somme('mandats_signes'), dossiers_go: somme('dossiers_go'), actes: somme('actes'),
      cout_ia_eur: Math.round(somme('cout_ia_eur') * 100) / 100,
    },
    mandataires,
    par_jour: [...parJour.entries()].map(([jour, x]) => ({ jour, ...x })),
    pages: [...pagesEquipe.entries()].sort((a, b) => b[1] - a[1]).map(([page, n]) => ({ page, n })),
    journal: journal.sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 400),
  };
}
