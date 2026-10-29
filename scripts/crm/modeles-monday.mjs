// Les modèles de mail de Monday, pour Sunday CRM (29 oct. 2026, Jules ; scripts/crm/mails-twenty.mjs les importe).
// L'API de Monday ne donne pas les modèles d'Emails & Activités ; elle donne les mails partis, dans la timeline de
// chaque fiche. Un modèle, c'est un même objet envoyé à au moins deux personnes : on garde le texte le plus envoyé,
// le prénom de la fiche remis en {prénom}. Les réponses (Re:, TR:) et les avis de non-remise sont écartés.
// Les pièces jointes des modèles ne sont pas dans la timeline : à rajouter à la main à l'envoi.
//   node scripts/crm/modeles-monday.mjs                    (lit les timelines des tableaux migrés, ~1 h)
//   node scripts/crm/modeles-monday.mjs --depuis mails.json (refait les modèles d'une lecture déjà faite)
// Écrit exports-prives/mails-monday.json (les mails lus) et exports-prives/modeles-monday.json (les modèles).
import 'dotenv/config';
import fs from 'node:fs';

const SORTIE_MAILS = 'exports-prives/mails-monday.json';
const SORTIE_MODELES = 'exports-prives/modeles-monday.json';
const depuis = process.argv.includes('--depuis') ? process.argv[process.argv.indexOf('--depuis') + 1] : null;

async function lireTimelines() {
  process.env.CRM = 'monday';
  const M = await import('../../server/monday.js');
  const { tableaux } = JSON.parse(fs.readFileSync('crm/tableaux.json', 'utf8'));
  const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
  const req = async (q) => {
    for (let i = 0; i < 8; i++) {
      try {
        return await M.requeteMonday(q);
      } catch (e) {
        if (!/429|complexity|rate/i.test(e.message)) throw e;
        await dodo(15000 * (i + 1));
      }
    }
    throw new Error('Monday refuse encore (429)');
  };
  const mails = [];
  for (const { id } of tableaux) {
    let curseur = null;
    let nom = '';
    const items = [];
    do {
      const r = curseur
        ? (await req(`{ next_items_page(limit:200, cursor:"${curseur}") { cursor items { id name } } }`)).next_items_page
        : await req(`{ boards(ids:[${id}]) { name items_page(limit:200) { cursor items { id name } } } }`).then((x) => { nom = x.boards[0].name; return x.boards[0].items_page; });
      items.push(...r.items);
      curseur = r.cursor;
    } while (curseur);
    let n = 0;
    for (const it of items) {
      const tl = await req(`{ timeline(id:${it.id}) { timeline_items_page(limit:100) { timeline_items { id type title content created_at user { name } } } } }`);
      for (const x of tl.timeline?.timeline_items_page?.timeline_items || []) {
        if (x.type === 'email' && x.content) { mails.push({ tableau: nom, tableauId: id, item: it.name, ...x }); n++; }
      }
      await dodo(250);
    }
    console.log(`${nom.padEnd(28)} ${String(items.length).padStart(5)} fiches ${String(n).padStart(4)} mails`);
    fs.writeFileSync(SORTIE_MAILS, JSON.stringify(mails));
  }
  return mails;
}

const ENTITES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '’', '&rsquo;': '’', '&lsquo;': '‘', '&eacute;': 'é', '&egrave;': 'è', '&agrave;': 'à', '&ccedil;': 'ç' };
/** Le HTML d'un mail Monday → texte simple, paragraphes gardés. */
export function texteDuHtml(h) {
  return String(h || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITES[e.toLowerCase()] ?? e)
    .replace(/\uFEFF/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Le texte d'un envoi, le prénom de la fiche remis en {prénom} (Monday prend tout sauf le dernier mot du nom). */
export function gabarit(texte, nomFiche) {
  const mots = String(nomFiche || '').trim().split(/\s+/);
  const prenoms = [mots.slice(0, -1).join(' '), mots[0]].filter((x) => x && x.length > 1);
  let t = texte;
  for (const p of prenoms) t = t.replace(new RegExp(`(^|[^\\p{L}])${echapper(p)}(?![\\p{L}])`, 'gu'), '$1{prénom}');
  return t;
}

/** Sans la signature de l'auteur (un nom seul après la formule de fin) : l'envoi de Klocka met celle de l'expéditeur. */
export function sansSignatureFinale(texte) {
  const lignes = texte.split('\n');
  const fin = lignes[lignes.length - 1]?.trim() || '';
  const avant = lignes[lignes.length - 2]?.trim() || '';
  if (/^(\p{Lu}[\p{L}'-]*)(\s+\p{Lu}[\p{L}'-]*){0,3}$/u.test(fin) && /,$/.test(avant)) return lignes.slice(0, -1).join('\n').trim();
  return texte;
}

/** Les mails lus → les modèles : un objet envoyé à au moins deux fiches, son texte le plus fréquent. */
export function modelesDesMails(mails) {
  const parObjet = new Map();
  for (const m of mails) {
    const objet = String(m.title || '').trim();
    if (!objet || /^(re|tr|fwd?)\s*:/i.test(objet) || /delivery status|non remis|undeliverable|mail delivery/i.test(objet)) continue;
    const corps = sansSignatureFinale(gabarit(texteDuHtml(m.content).split(/\n(?:Le .{5,80} a écrit|On .{5,80} wrote)/)[0].trim(), m.item));
    if (!corps) continue;
    const g = parObjet.get(objet) || { objet, fiches: new Set(), textes: new Map(), tableaux: new Set(), auteurs: new Set(), dernier: '' };
    g.fiches.add(m.item);
    g.textes.set(corps, (g.textes.get(corps) || 0) + 1);
    g.tableaux.add(m.tableau);
    if (m.user?.name) g.auteurs.add(m.user.name);
    if (m.created_at > g.dernier) g.dernier = m.created_at;
    parObjet.set(objet, g);
  }
  return [...parObjet.values()]
    .filter((g) => g.fiches.size >= 2)
    .map((g) => ({
      nom: g.objet.slice(0, 120),
      objet: gabarit(g.objet, ''),
      corps: [...g.textes.entries()].sort((a, b) => b[1] - a[1])[0][0],
      envois: g.fiches.size,
      source: `Monday (${[...g.tableaux].join(', ')}), envoyé par ${[...g.auteurs].join(', ') || '?'}, dernier envoi le ${g.dernier.slice(0, 10)}`,
    }))
    .sort((a, b) => b.envois - a.envois);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const mails = depuis ? JSON.parse(fs.readFileSync(depuis, 'utf8')) : await lireTimelines();
  const modeles = modelesDesMails(mails);
  fs.writeFileSync(SORTIE_MODELES, JSON.stringify({ _: 'Modèles tirés des mails envoyés depuis Monday (scripts/crm/modeles-monday.mjs)', modeles }, null, 2));
  console.log(`${mails.length} mails lus, ${modeles.length} modèle(s) dans ${SORTIE_MODELES}`);
  for (const m of modeles) console.log(`  ${String(m.envois).padStart(4)} × ${m.nom}`);
}
