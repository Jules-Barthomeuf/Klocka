// Une conversation WhatsApp collée ou importée dans une note (19 nov. 2026, Jules : « donner toute la conversation WhatsApp à
// l'assistant pour qu'il mette à jour la fiche d'une personne »). Reconnue à ses lignes datées (export Android ou
// iPhone, copier-coller de WhatsApp Web ou de l'ordinateur), elle est lue autrement qu'une note : qui parle à qui,
// la date de chaque message, la fin gardée plutôt que le début (c'est le plus récent), jamais prise pour une demande.

// « 12/11/2026 14:03 - Nom: », « 12/11/2026, 14:03 - Nom: », « [12/11/2026 14:03:22] Nom: », « [12/11/26, 14:03] Nom: »
const DATE_HEURE = /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2})[:h](\d{2})(?::\d{2})?\]?\s*(?:[-–]\s*)?(.+)$/;
// « [14:03, 12/11/2026] Nom: » (copier-coller de WhatsApp Web et de l'ordinateur)
const HEURE_DATE = /^\[(\d{1,2}):(\d{2}),\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\]\s*(.+)$/;
const MEDIA = /^<?(?:médias? omis|media omitted|image absente|vidéo absente|audio omis|fichier joint|pièce jointe)>?$/i;
// L'export en Markdown (22 nov. 2026, les groupes de Jules) : « # Exportation de la discussion WhatsApp: Titre », un jour
// par titre « ## 29 juin 2026 », puis « [10:51] **Nom:** texte » ; « [10:51] __texte__ » est une ligne système.
const MD_TITRE = /^#\s+(?:Exportation de la discussion WhatsApp|WhatsApp chat export|Export of WhatsApp chat)\s*:\s*(.+)$/i;
const MD_JOUR = /^##\s+(\d{1,2})(?:er)?\s+([a-zéûô]+)\.?\s+(\d{4})$/i;
const MD_MESSAGE = /^\[(\d{1,2}):(\d{2})\]\s+(?:\*\*(.+?):\*\*\s*(.*)|__(.*)__)$/;
const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, janv: 1, fevr: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12 };
const sansAccent = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Une pièce sans texte : « [média] », « [message vocal] », « [document : nom.pdf] » (le nom du document dit souvent ce que c'est).
function media(t) {
  if (MEDIA.test(t) || /^\[(?:image|vidéo|video|photo|autocollant|sticker|gif)\]$/i.test(t)) return '[média]';
  if (/^\[(?:message vocal|audio|voice message)\]$/i.test(t)) return '[message vocal]';
  const doc = /^\[(?:document|fichier)\]\s*(.+)$/i.exec(t);
  return doc ? `[document : ${doc[1].slice(0, 160)}]` : t;
}
// « Vous » (ou « You ») : la personne qui a exporté la conversation.
const VOUS = /^(?:vous|you)$/i;

const nettoyer = (t) => String(t ?? '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/[\u202f\u00a0]/g, ' ');

function dateDe(j, m, a, h, mi) {
  const an = Number(a) < 100 ? 2000 + Number(a) : Number(a);
  const d = new Date(Date.UTC(an, Number(m) - 1, Number(j), Number(h), Number(mi)));
  return Number.isNaN(d.getTime()) || Number(m) > 12 ? null : d;
}

/** Une ligne qui ouvre un message : sa date, qui l'écrit, le début du texte. Une ligne système (sans « Nom: ») : null. */
function debut(ligne) {
  let m = DATE_HEURE.exec(ligne);
  let le = null;
  let reste = null;
  if (m) { le = dateDe(m[1], m[2], m[3], m[4], m[5]); reste = m[6]; }
  else if ((m = HEURE_DATE.exec(ligne))) { le = dateDe(m[3], m[4], m[5], m[1], m[2]); reste = m[6]; }
  if (!le) return null;
  const i = reste.indexOf(': ');
  const j = i < 0 && reste.endsWith(':') ? reste.length - 1 : i;
  if (j <= 0 || j > 60) return { le, systeme: true };
  return { le, de: reste.slice(0, j).trim(), texte: reste.slice(j + 1).trim() };
}

/**
 * La conversation si le texte en est une (trois messages au moins, et le texte commence par un message), sinon null.
 * @returns {{ messages: { le: string, de: string, texte: string }[], participants: { nom: string, messages: number }[], du: string, au: string } | null}
 */
export function lireConversation(texte, { vous = null } = {}) {
  const lignes = nettoyer(texte).split(/\r?\n/);
  const messages = [];
  let vus = 0;
  let premiere = null;
  let titre = null;
  let jour = null;
  for (const brute of lignes) {
    const ligne = brute.trim();
    if (!ligne) continue;
    // L'export en Markdown : le titre, les jours et les séparateurs ne sont pas des messages.
    let md = null;
    if (premiere === null && (md = MD_TITRE.exec(ligne))) { titre = md[1].trim(); continue; }
    if ((md = MD_JOUR.exec(ligne)) && MOIS[sansAccent(md[2])]) { jour = [Number(md[1]), MOIS[sansAccent(md[2])], Number(md[3])]; continue; }
    if (titre !== null && (ligne === '---' || /^date d.exportation\s*:/i.test(ligne))) continue;
    let d = null;
    if (jour && (md = MD_MESSAGE.exec(ligne))) {
      const le = dateDe(jour[0], jour[1], jour[2], md[1], md[2]);
      d = !le ? null : md[3] ? { le, de: md[3].trim(), texte: (md[4] || '').trim() } : { le, systeme: true };
    } else d = debut(ligne);
    if (d && !d.systeme && vous && VOUS.test(d.de)) d.de = vous;
    if (premiere === null) premiere = !!d;
    if (d) {
      vus += 1;
      if (!d.systeme) messages.push({ le: d.le.toISOString(), de: d.de, texte: media(d.texte) });
      continue;
    }
    const dernier = messages[messages.length - 1];
    if (dernier) dernier.texte = `${dernier.texte}\n${ligne}`;
  }
  if ((!premiere && titre === null) || vus < 3 || messages.length < 3) return null;
  const compte = new Map();
  for (const m of messages) compte.set(m.de, (compte.get(m.de) || 0) + 1);
  return {
    messages,
    participants: [...compte].map(([nom, n]) => ({ nom, messages: n })).sort((a, b) => b.messages - a.messages),
    du: messages[0].le,
    au: messages[messages.length - 1].le,
    ...(titre ? { titre } : {}),
  };
}

const jourCourt = (iso) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/** La conversation telle que l'assistant la lit : un message par ligne, daté ; la fin gardée si elle est trop longue. */
export function conversationLisible(conv, limite = 12000) {
  const lignes = conv.messages.map((m) => `${jourCourt(m.le)} ${m.de} : ${m.texte.replace(/\n+/g, ' / ')}`);
  const gardees = [];
  let taille = 0;
  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    if (taille + lignes[i].length + 1 > limite) break;
    gardees.unshift(lignes[i]);
    taille += lignes[i].length + 1;
  }
  const omis = lignes.length - gardees.length;
  return { texte: `${omis ? `(${omis} message${omis > 1 ? 's' : ''} plus ancien${omis > 1 ? 's' : ''} non repris)\n` : ''}${gardees.join('\n')}`, omis, lus: gardees.length };
}

const simple = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Qui est qui : les participants de l'équipe (prénom reconnu) d'un côté, ceux qui ressemblent aux fiches liées de
 * l'autre, le reste à deviner par l'assistant.
 */
export function cotes(conv, { equipe = [], liens = [] } = {}) {
  const prenoms = equipe.map((p) => simple(p));
  const noms = liens.filter((l) => l.genre !== 'bien').map((l) => simple(l.nom));
  const nous = [];
  const eux = [];
  const autres = [];
  for (const p of conv.participants) {
    const s = simple(p.nom);
    const premier = s.split(/\s+/)[0];
    if (noms.some((n) => n && (n.includes(s) || s.includes(n) || n.split(/\s+/)[0] === premier))) eux.push(p.nom);
    else if (prenoms.includes(premier)) nous.push(p.nom);
    else autres.push(p.nom);
  }
  return { nous, eux, autres };
}
