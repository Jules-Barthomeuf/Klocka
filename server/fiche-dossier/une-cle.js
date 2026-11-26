// Une seule fiche par chose (25 nov. 2026, Jules : « une seule fiche par bien ; une fiche pour Rachel : si on ouvre sa
// fiche dans l'assistant, c'est la même que dans le CRM »). La même personne ou le même bien avait plusieurs clés :
// Rachel était `twenty:clients:<id>` dans l'assistant et `client:<demande>` dans le CRM, deux fiches, l'une vide.
//
// La clé qui fait foi :
//   - un agent : celle de l'agent de Klocka (`agent:<id>`), qui porte la Prospection, la photo et les fiches envoyées ;
//     sa ligne du CRM (`twenty:agentImmobilier:<id>`) y mène dès que l'agent connaît son id de Twenty ;
//   - un client : sa ligne du CRM (`twenty:clients:<id>`) ; sa demande de Klocka (`client:<id>`) y mène par son id de Twenty ;
//   - un bien : son dossier (`deal:<id>`) ; son projet (`projet:<id>`) y mène quand il a un dossier (comme cleDuBien).
// Ce qui était rangé sous l'autre clé est fondu dans la bonne, jamais effacé : l'ancienne fiche garde ses champs sous
// `fondue:<ancienne clé>`, avec `fondue_dans`.

import db, { Records } from '../db.js';

const CHAMPS_FIXES = new Set(['id', 'cle', 'created_date', 'updated_date', 'created_by', 'fondue_dans']);
const VIDES = new Set(['Fiche du CRM', 'Sans nom']);

/** La clé qui fait foi pour `cle` (elle-même si elle est déjà la bonne). */
export function cleUnique(cle) {
  const c = String(cle || '');
  if (c.startsWith('client:')) {
    const d = Records.get('DemandeClient', c.slice(7));
    return d?.twenty_id ? `twenty:clients:${d.twenty_id}` : c;
  }
  if (c.startsWith('twenty:agentImmobilier:')) {
    const t = c.slice('twenty:agentImmobilier:'.length);
    const a = t ? Records.filter('AgentImmo', { twenty_id: t }).find((x) => !x.essai) : null;
    return a ? `agent:${a.id}` : c;
  }
  if (c.startsWith('projet:')) {
    const p = Records.get('Project', c.slice(7));
    return p?.deal_id && Records.findBy('Deal', 'deal_id', String(p.deal_id)) ? `deal:${p.deal_id}` : c;
  }
  return c;
}

/** Les autres clés qui désignent la même chose que `cle` (la bonne), d'où une fiche a pu naître. */
export function autresCles(cle) {
  const c = String(cle || '');
  if (c.startsWith('agent:')) {
    const t = Records.get('AgentImmo', c.slice(6))?.twenty_id;
    return t ? [`twenty:agentImmobilier:${t}`] : [];
  }
  if (c.startsWith('twenty:clients:')) {
    const t = c.slice('twenty:clients:'.length);
    return t ? Records.filter('DemandeClient', { twenty_id: t }).map((d) => `client:${d.id}`) : [];
  }
  if (c.startsWith('deal:')) return Records.filter('Project', { deal_id: c.slice(5) }).map((p) => `projet:${p.id}`);
  return [];
}

const remplacer = (liste, de, vers) => {
  if (!Array.isArray(liste) || !liste.includes(de)) return null;
  return [...new Set(liste.map((x) => (x === de ? vers : x)))];
};
const remplacerLiens = (liens, de, vers, soi = null) => {
  if (!Array.isArray(liens) || !liens.some((l) => l?.cle === de)) return null;
  const vus = new Set();
  return liens.map((l) => (l?.cle === de ? { ...l, cle: vers } : l)).filter((l) => {
    if (!l?.cle || l.cle === soi || vus.has(l.cle)) return false;
    vus.add(l.cle);
    return true;
  });
};

/**
 * Fond tout ce qui est rangé sous `de` dans la fiche `vers` : la fiche elle-même, son historique, ses actions, les liens
 * des notes et des autres fiches, les photos, les ouvertures, les étoiles. Rien n'est effacé, sauf une étoile en double
 * de la même personne. @returns {number} le nombre d'écritures
 */
const ENTITES = ['FicheDossier', 'EntreeDossier', 'PhotoFiche', 'FicheOuverte', 'AgentPrefere', 'ActionDossier', 'MessageEnvoye', 'NoteDossier'];

/** Une lecture de la base : la clé `de` est-elle écrite quelque part ? (le cas courant : non, et rien ne se relit). */
function estEcrite(de) {
  const motif = `%${JSON.stringify(String(de)).replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
  return !!db.prepare(`SELECT 1 FROM records WHERE entity IN (${ENTITES.map(() => '?').join(',')}) AND data LIKE ? ESCAPE '\\' LIMIT 1`).get(...ENTITES, motif);
}

export function fondre(de, vers) {
  if (!de || !vers || de === vers || !estEcrite(de)) return 0;
  let n = 0;
  const maj = (entite, id, patch) => { Records.update(entite, id, patch, { garderDate: true }); n += 1; };

  const fa = Records.findBy('FicheDossier', 'cle', de);
  if (fa) {
    const fb = Records.findBy('FicheDossier', 'cle', vers);
    if (!fb) maj('FicheDossier', fa.id, { cle: vers });
    else {
      const patch = {};
      for (const [k, v] of Object.entries(fa)) {
        if (CHAMPS_FIXES.has(k) || v == null || v === '' || k === 'liees' || k === 'ecartees') continue;
        const b = fb[k];
        if (b == null || b === '' || (k === 'nom' && VIDES.has(b))) patch[k] = v;
      }
      const liees = [...(fb.liees || []), ...(fa.liees || [])].filter((l, i, a) => l?.cle && l.cle !== vers && a.findIndex((x) => x?.cle === l.cle) === i);
      if (liees.length !== (fb.liees || []).length) patch.liees = liees;
      const ecartees = [...new Set([...(fb.ecartees || []), ...(fa.ecartees || [])])];
      if (ecartees.length !== (fb.ecartees || []).length) patch.ecartees = ecartees;
      if (fa.a_relire && !fb.a_relire) patch.a_relire = true;
      if (fa.maj_le && String(fa.maj_le) > String(fb.maj_le || '')) Object.assign(patch, { maj_le: fa.maj_le, maj_par: fa.maj_par || fb.maj_par || null });
      if (Object.keys(patch).length) maj('FicheDossier', fb.id, patch);
      maj('FicheDossier', fa.id, { cle: `fondue:${de}`, fondue_dans: vers });
    }
  }
  for (const e of Records.filter('EntreeDossier', { fiche_cle: de })) maj('EntreeDossier', e.id, { fiche_cle: vers });
  for (const e of Records.filter('PhotoFiche', { cle: de })) maj('PhotoFiche', e.id, { cle: vers, ordre: (e.ordre ?? 0) + 100 });
  for (const e of Records.filter('FicheOuverte', { cle: de })) {
    const deja = Records.filter('FicheOuverte', { par: e.par, cle: vers })[0];
    if (deja) { if (String(e.le) > String(deja.le)) maj('FicheOuverte', deja.id, { le: e.le }); maj('FicheOuverte', e.id, { cle: `fondue:${de}` }); }
    else maj('FicheOuverte', e.id, { cle: vers });
  }
  for (const e of Records.filter('AgentPrefere', { cle: de })) {
    if (Records.filter('AgentPrefere', { par: e.par, cle: vers }).length) { Records.delete('AgentPrefere', e.id); n += 1; }
    else maj('AgentPrefere', e.id, { cle: vers });
  }
  for (const entite of ['ActionDossier', 'MessageEnvoye']) {
    for (const a of Records.list(entite)) { const f = remplacer(a.fiches, de, vers); if (f) maj(entite, a.id, { fiches: f }); }
  }
  for (const note of Records.list('NoteDossier')) { const l = remplacerLiens(note.liens, de, vers); if (l) maj('NoteDossier', note.id, { liens: l }); }
  for (const f of Records.list('FicheDossier')) { const l = remplacerLiens(f.liees, de, vers, f.cle); if (l) maj('FicheDossier', f.id, { liees: l }); }
  return n;
}

/** Fond dans `cle` les fiches nées sous ses autres clés (à l'ouverture d'une fiche). */
export function rassembler(cle) {
  let n = 0;
  for (const a of autresCles(cle)) n += fondre(a, cle);
  return n;
}

const PREFIXES_ANCIENS = /^(client:|twenty:agentImmobilier:|projet:)/;

/** Toutes les clés rangées ailleurs que sous celle qui fait foi, fondues d'un coup (au démarrage). */
export function fondreTout() {
  const cles = new Set();
  const ajouter = (c) => { if (typeof c === 'string' && PREFIXES_ANCIENS.test(c)) cles.add(c); };
  for (const f of Records.list('FicheDossier')) { ajouter(f.cle); for (const l of f.liees || []) ajouter(l?.cle); }
  for (const e of Records.list('EntreeDossier')) ajouter(e.fiche_cle);
  for (const note of Records.list('NoteDossier')) for (const l of note.liens || []) ajouter(l?.cle);
  for (const a of Records.list('ActionDossier')) for (const c of a.fiches || []) ajouter(c);
  for (const entite of ['FicheOuverte', 'PhotoFiche', 'AgentPrefere']) for (const e of Records.list(entite)) ajouter(e.cle);
  const fondues = [];
  for (const c of cles) {
    const vers = cleUnique(c);
    if (vers !== c && fondre(c, vers)) fondues.push([c, vers]);
  }
  return fondues;
}
