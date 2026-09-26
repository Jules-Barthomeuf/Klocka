// D'où viennent les agents à appeler. Trois sources, lues ici en candidats
// de même forme ({nom, agence, email, telephone, ville, adresse, source,
// annonces, remarque}) ; le dédoublonnage contre les deux tableaux Monday se
// fait ensuite (regles.js : nouveauxAgents).
//
//   Equimmox  l'export Excel des annonces en vente d'une ville : chaque annonce
//             porte l'agence, le mail et le téléphone de l'agent. On regroupe
//             par agent et on compte ses annonces commerciales : celui qui en
//             publie douze à Cannes passe devant celui qui en a une.
//   Un fichier  un export Apollo, une Google Sheet ou un Excel enregistré en CSV :
//             les colonnes sont reconnues par leur nom, en français ou en anglais.
//   Les alertes des sites (SeLoger, Leboncoin, BureauxLocaux…) reçues dans nos
//             boîtes : lues par alertes.js, elles rendent la même forme.

import { norm, normEmail, normTel, telAffiche } from './regles.js';


const valeurs = (v) => String(v || '').split(/\s*,\s*/).map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== 'hidden');
const uniques = (liste) => [...new Set(liste)];
const plusFrequent = (liste) => {
  const n = new Map();
  for (const x of liste) n.set(x, (n.get(x) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] || null;
};
/** Pure : « century 21 cce » → « Century 21 Cce », sans toucher aux sigles écrits en capitales. */
export const casse = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/(^|[\s'’(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());

// Une date d'Excel (numéro de série) ou une date écrite.
const dateDe = (v) => {
  const n = Number(v);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  const d = Date.parse(v);
  return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
};

/**
 * Pure : les agents d'un export Equimmox, du plus gros publieur au plus petit.
 * Une annonce peut paraître chez plusieurs agences (le même bien sur deux
 * mandats) : chaque mail distinct est un agent. Les annonces retirées et les
 * contacts masqués (« hidden », souvent un particulier) ne comptent pas.
 * @param {object[]} lignes - lireXlsx(export)
 * @param {{classes?: string[], ville?: string}} opts - classes d'actif gardées (Commercial par défaut)
 */
export function agentsDesAnnonces(lignes, { classes = ['Commercial'], ville = null } = {}) {
  const gardees = new Set(classes.map((c) => c.toLowerCase()));
  const parAgent = new Map();
  for (const l of lignes || []) {
    if (String(l.deleted_date || '').trim()) continue;
    if (gardees.size && !gardees.has(String(l['asset class'] || '').toLowerCase())) continue;
    const noms = valeurs(l['agency name']);
    const emails = valeurs(l['agent email']);
    const tels = valeurs(l['agent contact']);
    const reseaux = valeurs(l['broker network']);
    const sites = uniques(valeurs(l.provider));
    // Un agent par mail distinct ; sans mail, par téléphone distinct.
    const cles = uniques(emails.map(normEmail).filter(Boolean));
    const parTel = !cles.length;
    const liste = parTel ? uniques(tels.map(normTel).filter(Boolean)) : cles;
    if (!liste.length && !noms.length) continue;
    const annonce = {
      date: dateDe(l['publication date']),
      ville: l.city || ville || null,
      adresse: l.address || null,
      prix: Number(l.price) || null,
      surface: Number(l.surface) || null,
      exploitation: l.exploitation || null,
      libre: String(l.occupation).toLowerCase() === 'false',
      lien: l.url || null,
    };
    for (const [k, cle] of (liste.length ? liste : [null]).entries()) {
      const rang = parTel ? tels.findIndex((t) => normTel(t) === cle) : emails.findIndex((e) => normEmail(e) === cle);
      const seul = liste.length <= 1;
      const agence = casse((seul ? plusFrequent(noms) : noms[rang] ?? noms[k]) || plusFrequent(noms) || '');
      const reseau = casse((seul ? plusFrequent(reseaux) : reseaux[rang] ?? reseaux[k]) || '');
      const email = parTel ? null : cle;
      const tel = parTel ? cle : normTel(tels[rang] ?? (seul ? tels[0] : null));
      const id = email ? `e:${email}` : tel ? `t:${tel}` : `a:${norm(agence)}`;
      const a = parAgent.get(id) || { agence, reseau, email, telephone: tel ? telAffiche(tel) : null, annonces: 0, vides: 0, villes: new Set(), parVille: {}, videsParVille: {}, sites: new Set(), exemples: [] };
      a.annonces += 1;
      const v = casse(String(annonce.ville || ville || '').toLowerCase());
      if (v) { a.villes.add(v); a.parVille[v] = (a.parVille[v] || 0) + 1; }
      // « occupation » à false : le local est libre, des murs vides à vendre.
      if (String(l.occupation).toLowerCase() === 'false') { a.vides += 1; if (v) a.videsParVille[v] = (a.videsParVille[v] || 0) + 1; }
      for (const s of sites) a.sites.add(s);
      a.exemples.push(annonce);
      if (!a.telephone && tel) a.telephone = telAffiche(tel);
      parAgent.set(id, a);
    }
  }
  return [...parAgent.values()]
    .map((a) => {
      const exemples = a.exemples.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
      const villes = [...a.villes];
      const derniere = exemples[0];
      return {
        nom: a.agence || a.reseau || a.email || a.telephone,
        agence: a.reseau && a.reseau !== a.agence ? `${a.agence} (${a.reseau})` : a.agence,
        email: a.email,
        telephone: a.telephone,
        ville: villes[0] || ville || null,
        adresse: derniere?.adresse || null,
        source: 'Equimmox',
        annonces: a.annonces,
        vides: a.vides,
        annonces_par_ville: a.parVille,
        vides_par_ville: a.videsParVille,
        sites: [...a.sites],
        exemples: exemples.slice(0, 3),
        remarque: `Equimmox : ${a.annonces} annonce${a.annonces > 1 ? 's' : ''} de commerce en vente à ${villes.join(', ') || ville}${a.vides ? `, dont ${a.vides} libre${a.vides > 1 ? 's' : ''}` : ''}${derniere?.date ? `, la dernière du ${derniere.date.split('-').reverse().join('/')}` : ''}${a.sites.size ? ` (${[...a.sites].slice(0, 4).join(', ')})` : ''}.`,
      };
    })
    .sort((x, y) => y.annonces - x.annonces || String(x.nom).localeCompare(String(y.nom)));
}

// ---------------------------------------------------------------------------
// Un fichier : Apollo, une Google Sheet, un Excel en CSV
// ---------------------------------------------------------------------------

/** Pure : un CSV en lignes d'objets. Le séparateur (virgule, point-virgule, tabulation) se lit sur l'en-tête. */
export function lireCsv(texte) {
  const t = String(texte || '').replace(/^\uFEFF/, '');
  const premiere = t.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].map((s) => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = [];
  let ligne = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guillemets = false; else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((x) => x.trim())) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x.trim())) lignes.push(ligne);
  if (!lignes.length) return [];
  const entete = lignes[0].map((h) => h.trim());
  return lignes.slice(1).map((l) => Object.fromEntries(entete.map((h, k) => [h, String(l[k] ?? '').trim()])));
}

// Les noms de colonnes reconnus, du plus précis au plus vague.
const COLONNES = {
  prenom: ['first name', 'prenom', 'firstname'],
  nom_famille: ['last name', 'nom de famille', 'lastname'],
  nom: ['name', 'nom', 'full name', 'nom complet', 'contact'],
  agence: ['company', 'company name', 'agence', 'entreprise', 'societe', 'organisation', 'organization', 'account name'],
  email: ['email', 'e-mail', 'mail', 'adresse mail', 'adresse e-mail', 'work email'],
  telephone: ['mobile phone', 'work direct phone', 'first phone', 'telephone', 'tel', 'phone', 'portable', 'mobile', 'corporate phone', 'company phone'],
  ville: ['city', 'ville', 'person city', 'company city', 'localisation', 'location'],
  poste: ['title', 'poste', 'fonction', 'job title'],
};

/** Pure : la colonne d'un champ dans un en-tête, ou null. */
function colonne(entete, champ) {
  const normes = entete.map((h) => [h, norm(h).replace(/[._-]/g, ' ').replace(/\s+/g, ' ')]);
  for (const alias of COLONNES[champ]) {
    const trouve = normes.find(([, n]) => n === alias);
    if (trouve) return trouve[0];
  }
  return null;
}

/**
 * Pure : les candidats d'un fichier importé. Une ligne sans mail ni
 * téléphone ne se démarche pas : elle est écartée et comptée.
 */
export function candidatsDuFichier(lignes, { source = 'Import' } = {}) {
  const entete = Object.keys(lignes?.[0] || {});
  const col = Object.fromEntries(Object.keys(COLONNES).map((c) => [c, colonne(entete, c)]));
  const candidats = [];
  let sansContact = 0;
  for (const l of lignes || []) {
    const get = (c) => (col[c] ? String(l[col[c]] || '').trim() : '');
    const nom = [get('prenom'), get('nom_famille')].filter(Boolean).join(' ') || get('nom');
    const email = normEmail(get('email'));
    const tel = normTel(get('telephone'));
    if (!email && !tel) { sansContact += 1; continue; }
    const agence = get('agence');
    candidats.push({
      nom: nom || agence || email,
      agence: agence || null,
      email,
      telephone: tel ? telAffiche(tel) : null,
      ville: get('ville') || null,
      adresse: null,
      source,
      annonces: 0,
      remarque: `${source}${get('poste') ? ` : ${get('poste')}` : ''}.`,
    });
  }
  return { candidats, sansContact, colonnes: col };
}
