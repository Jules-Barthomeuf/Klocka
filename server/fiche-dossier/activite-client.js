// L'activité d'un client sur la plateforme, dans sa fiche (27 nov. 2026, Jules : « s'il s'est connecté, on le voit dans
// l'historique, et dans le résumé ; que ça nous serve à montrer que ce client est actif : il a regardé tel dossier pendant
// tant, il a regardé le simulateur »).
//
// La matière existe déjà : chaque page ouverte par un compte (VisitePage) et le battement du navigateur (VisiteSession),
// découpés en sessions par usage-sessions.js (le temps sur une page va jusqu'à la suivante). Ici :
//   - le compte du client : son adresse dans Twenty (eMail.primaryEmail de clientsListe), sinon un compte client au même
//     nom, un seul ; gardé sur la fiche (compte_email), relu chaque jour s'il manque ;
//   - « Sur la plateforme », sous le résumé : actif ou non, la dernière connexion, le temps sur 30 jours, les dossiers et
//     les outils regardés, avec leur temps ;
//   - l'historique : une ligne par connexion terminée, datée, écrite une fois (EntreeDossier.session_cle). Rien d'autre
//     n'est touché sur la fiche.

import db, { Records } from '../db.js';
import { decouperSessions } from '../usage-sessions.js';

const JOUR = 86400000;
const PAUSE = 30 * 60 * 1000;
const bas = (t) => String(t || '').trim().toLowerCase();
const norm = (t) => bas(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const estEquipe = (u) => !u || u.role === 'admin' || u.role === 'mandataire' || /@klocka\.immo$/.test(bas(u.email));

/** Pure : « 1 h 10 », « 12 min », « 40 s ». */
export function duree(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
}

const parametre = (url, nom) => { try { return new URL(url, 'https://x').searchParams.get(nom); } catch { return null; } };

// Les pages d'un client, dites comme on les dit. Sans nom ici : la page compte dans le temps, pas dans la liste.
const OUTILS = {
  SimulateurRentabilite: 'le simulateur', SimulateurPublic: 'le simulateur', MesProjets: 'ses projets', MesPresentations: 'les présentations',
  Vision: 'Vision', Ressources: 'les ressources', Offres: 'son offre', KEstimation: "l'estimation",
};

/**
 * Pure : ce qu'une page ouverte dit. `{ genre: 'dossier', cle, nom, lien }`, `{ genre: 'outil', nom }`, ou null (l'accueil,
 * les réglages). `projets` : id → titre.
 */
export function pageLisible(page, url, projets = new Map()) {
  if (page === 'ProjetDetail' || ((page === 'AdminProjets' || page === 'MesProjets') && parametre(url, 'id'))) {
    const id = parametre(url, 'id');
    if (id) return { genre: 'dossier', cle: id, nom: projets.get(id) || 'un dossier', lien: `/Projets?id=${id}` };
  }
  if (OUTILS[page]) return { genre: 'outil', cle: OUTILS[page], nom: OUTILS[page] };
  return null;
}

/** Pure : une connexion en une ligne d'historique : « Connecté 12 min : KFC Lyon (8 min), le simulateur (3 min) ». */
export function ligneDeSession(s, projets = new Map()) {
  const parQuoi = new Map();
  for (const p of s.pages) {
    const q = pageLisible(p.page, p.url, projets);
    if (!q) continue;
    const x = parQuoi.get(q.cle) || { ...q, temps: 0 };
    x.temps += p.duree_ms || 0;
    parQuoi.set(q.cle, x);
  }
  const vus = [...parQuoi.values()].filter((x) => x.temps >= 10000).sort((a, b) => b.temps - a.temps);
  const quoi = vus.slice(0, 4).map((x) => `${x.genre === 'dossier' ? `le dossier « ${x.nom} »` : x.nom} (${duree(x.temps)})`);
  return `Connecté ${duree(s.duree_ms)} sur la plateforme${quoi.length ? ` : ${quoi.join(', ')}${vus.length > 4 ? '…' : ''}` : ''}`;
}

/** Pure : le bilan de l'activité, sur 30 jours. */
export function bilan(sessions, projets = new Map(), { maintenant = new Date() } = {}) {
  const t = maintenant.getTime();
  if (!sessions.length) return { statut: 'jamais', phrase: "Son compte existe, il ne s'est jamais connecté.", sessions_30j: 0, temps_30j_ms: 0, derniere: null, regardes: [] };
  const derniere = sessions.reduce((a, s) => (s.fin > a ? s.fin : a), sessions[0].fin);
  const recentes = sessions.filter((s) => t - Date.parse(s.debut) <= 30 * JOUR);
  const temps = recentes.reduce((a, s) => a + s.duree_ms, 0);
  const parQuoi = new Map();
  for (const s of recentes) for (const p of s.pages) {
    const q = pageLisible(p.page, p.url, projets);
    if (!q) continue;
    const x = parQuoi.get(q.cle) || { ...q, temps_ms: 0, vues: 0, dernier: null };
    x.temps_ms += p.duree_ms || 0;
    x.vues += 1;
    if (!x.dernier || p.le > x.dernier) x.dernier = p.le;
    parQuoi.set(q.cle, x);
  }
  const regardes = [...parQuoi.values()].filter((x) => x.temps_ms >= 10000).sort((a, b) => b.temps_ms - a.temps_ms).slice(0, 8)
    .map(({ genre, nom, lien = null, temps_ms, vues, dernier }) => ({ genre, nom, lien, temps_ms, temps: duree(temps_ms), vues, dernier }));
  const jours = Math.floor((t - Date.parse(derniere)) / JOUR);
  const statut = jours <= 7 ? 'actif' : jours <= 30 ? 'tiede' : 'inactif';
  const quand = jours === 0 ? "aujourd'hui" : jours === 1 ? 'hier' : `il y a ${jours} jours`;
  const morceaux = [`Dernière connexion ${quand}`];
  if (recentes.length) morceaux.push(`${recentes.length} connexion${recentes.length > 1 ? 's' : ''} en 30 jours, ${duree(temps)} en tout`);
  const phrase = `${{ actif: 'Actif', tiede: 'Moins actif', inactif: 'Inactif' }[statut]} : ${morceaux.join(' ; ')}.${regardes.length ? ` Il a surtout regardé ${regardes.slice(0, 3).map((x) => `${x.genre === 'dossier' ? `« ${x.nom} »` : x.nom} (${x.temps})`).join(', ')}.` : ''}`;
  return { statut, phrase, sessions_30j: recentes.length, temps_30j_ms: temps, temps_30j: duree(temps), derniere, regardes };
}

/** Les pages et battements d'un compte, lus par une requête (pas toute la table). */
function traces(email) {
  const e = bas(email);
  const lignes = (entite) => db.prepare("SELECT data FROM records WHERE entity = ? AND LOWER(json_extract(data, '$.par')) = ?").all(entite, e).map((r) => JSON.parse(r.data));
  return { pages: lignes('VisitePage'), battements: lignes('VisiteSession') };
}

const titresDesProjets = () => new Map(db.prepare("SELECT id, json_extract(data, '$.titre') AS t, json_extract(data, '$.adresse_complete') AS a FROM records WHERE entity = 'Project'").all().map((r) => [r.id, r.t || r.a || 'un dossier']));

/**
 * Le compte d'un client, pour sa fiche : l'adresse gardée, sinon celle de Twenty, sinon un compte client au même nom.
 * Garde ce qu'il trouve sur la fiche ; relit au plus une fois par jour quand il ne trouve rien.
 */
export async function compteDuClient(f, { twenty = true, maintenant = new Date() } = {}) {
  if (!f || f.genre !== 'client') return null;
  const parMail = (m) => { const u = m ? Records.findBy('User', 'email', bas(m)) || Records.list('User').find((x) => bas(x.email) === bas(m)) : null; return u && !estEquipe(u) ? u : null; };
  if (f.compte_email) return parMail(f.compte_email);
  if (f.compte_cherche_le && maintenant.getTime() - Date.parse(f.compte_cherche_le) < JOUR) return null;
  let u = null;
  let par = null;
  const twentyId = String(f.cle || '').startsWith('twenty:clients:') ? f.cle.slice('twenty:clients:'.length) : null;
  if (twentyId && twenty && !process.env.NODE_TEST_CONTEXT) {
    try {
      const { lire, twentyConfigure } = await import('../twenty.js');
      if (twentyConfigure()) {
        const t = await lire('clientsListe', twentyId);
        for (const m of [t?.eMail?.primaryEmail, ...(t?.eMail?.additionalEmails || [])].filter(Boolean)) { u = parMail(m); if (u) { par = 'twenty'; break; } }
      }
    } catch { /* Twenty absent : le nom prend le relais */ }
  }
  if (!u && f.nom) {
    const n = norm(f.nom);
    const memes = Records.list('User').filter((x) => !estEquipe(x) && n && norm(x.full_name) === n);
    if (memes.length === 1) { [u] = memes; par = 'nom'; }
  }
  Records.update('FicheDossier', f.id, u ? { compte_email: bas(u.email), compte_lie_par: par } : { compte_cherche_le: maintenant.toISOString() });
  return u;
}

/**
 * L'activité d'un client pour sa fiche, et ses connexions terminées dans l'historique. Rend null sans compte.
 */
export async function activiteDuClient(f, { maintenant = new Date(), twenty = true } = {}) {
  const u = await compteDuClient(f, { twenty, maintenant });
  if (!u) return null;
  const { pages, battements } = traces(u.email);
  const sessions = decouperSessions(pages, battements);
  const projets = titresDesProjets();
  // Son compte créé sur la plateforme (27 nov. 2026, Jules : « quand ils ont été rentrés »), une ligne datée, une fois.
  const kc = `compte:${bas(u.email)}`;
  if (u.created_date && !Records.findBy('EntreeDossier', 'session_cle', kc)) {
    Records.create('EntreeDossier', { fiche_cle: f.cle, genre: 'evenement', texte: 'Compte créé sur la plateforme', raison: null, note_id: null, par: null, le: u.created_date, ordre: 0, source: 'plateforme', session_cle: kc });
  }
  // Les connexions terminées (plus de 30 minutes sans page) entrent dans l'historique, une fois chacune.
  const finies = sessions.filter((s) => maintenant.getTime() - Date.parse(s.fin) > PAUSE).slice(-60);
  for (const s of finies) {
    const k = `${bas(u.email)}|${s.debut}`;
    if (Records.findBy('EntreeDossier', 'session_cle', k)) continue;
    Records.create('EntreeDossier', { fiche_cle: f.cle, genre: 'evenement', texte: ligneDeSession(s, projets), raison: null, note_id: null, par: null, le: s.debut, ordre: 0, source: 'plateforme', session_cle: k });
  }
  return { compte: bas(u.email), lie_par: Records.get('FicheDossier', f.id)?.compte_lie_par || null, ...bilan(sessions, projets, { maintenant }), presentes: projetsPresentes(u.email, sessions, projets) };
}

// ---------------------------------------------------------------------------
// Les projets présentés (27 nov. 2026, Jules : « regarde dans les projets qui est assigné à quoi : on voit à qui on a
// présenté chaque projet »). Un projet assigné à un compte (Project.client_email, client_emails) lui a été présenté ;
// ses visites disent s'il l'a ouvert, quand la première fois, et combien de temps il y est resté.
// ---------------------------------------------------------------------------

const assignes = (p) => [p.client_email, ...(p.client_emails || [])].map(bas).filter(Boolean);

/** Les projets assignés à ce compte, avec ce qu'il en a regardé. */
export function projetsPresentes(email, sessions = null, projets = null) {
  const e = bas(email);
  const lignes = db.prepare("SELECT id, data FROM records WHERE entity = 'Project' AND (LOWER(json_extract(data, '$.client_email')) = ? OR LOWER(data) LIKE ?)").all(e, `%${e.replace(/[%_]/g, '')}%`)
    .map((r) => ({ ...JSON.parse(r.data), id: r.id })).filter((p) => assignes(p).includes(e) && !p.archived);
  if (!lignes.length) return [];
  const s = sessions || decouperSessions(...Object.values(traces(e)));
  const vues = new Map();
  for (const x of s) for (const pg of x.pages) {
    const q = pageLisible(pg.page, pg.url, projets || new Map());
    if (q?.genre !== 'dossier') continue;
    const v = vues.get(q.cle) || { temps_ms: 0, premiere: null, derniere: null };
    v.temps_ms += pg.duree_ms || 0;
    if (!v.premiere || pg.le < v.premiere) v.premiere = pg.le;
    if (!v.derniere || pg.le > v.derniere) v.derniere = pg.le;
    vues.set(q.cle, v);
  }
  return lignes.map((p) => {
    const v = vues.get(p.id);
    return { id: p.id, nom: p.titre || p.adresse_complete || 'Projet', lien: `/Projets?id=${p.id}`, deal_id: p.deal_id || null, ouvert: !!v, premiere: v?.premiere || null, derniere: v?.derniere || null, temps: v ? duree(v.temps_ms) : null, temps_ms: v?.temps_ms || 0 };
  }).sort((a, b) => String(b.derniere || '').localeCompare(String(a.derniere || '')) || a.nom.localeCompare(b.nom));
}

/** À qui un bien a été présenté : les comptes assignés à ses projets, s'ils l'ont ouvert, et leur fiche. */
export function presenteA(cle) {
  const c = String(cle || '');
  const projets = c.startsWith('deal:') ? Records.filter('Project', { deal_id: c.slice(5) }) : c.startsWith('projet:') ? [Records.get('Project', c.slice(7))].filter(Boolean) : [];
  const emails = [...new Set(projets.flatMap(assignes))];
  if (!emails.length) return [];
  const ids = new Set(projets.map((p) => p.id));
  return emails.map((e) => {
    const u = Records.findBy('User', 'email', e) || Records.list('User').find((x) => bas(x.email) === e);
    if (u && estEquipe(u)) return null;
    const { pages, battements } = traces(e);
    let temps = 0; let premiere = null; let derniere = null;
    for (const x of decouperSessions(pages, battements)) for (const pg of x.pages) {
      const id = parametre(pg.url, 'id');
      if (!id || !ids.has(id) || !['ProjetDetail', 'AdminProjets', 'MesProjets'].includes(pg.page)) continue;
      temps += pg.duree_ms || 0;
      if (!premiere || pg.le < premiere) premiere = pg.le;
      if (!derniere || pg.le > derniere) derniere = pg.le;
    }
    const f = Records.findBy('FicheDossier', 'compte_email', e);
    return { email: e, nom: u?.full_name || f?.nom || e, fiche: f?.cle || null, ouvert: !!premiere, premiere, derniere, temps: premiere ? duree(temps) : null };
  }).filter(Boolean).sort((a, b) => String(b.derniere || '').localeCompare(String(a.derniere || '')));
}
