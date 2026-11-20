// Une conversation WhatsApp collée ou importée dans une note (19 nov. 2026, Jules : « donner toute la conversation WhatsApp à
// l'assistant pour qu'il mette à jour la fiche d'une personne »). Reconnue à ses lignes datées (export Android ou
// iPhone, copier-coller de WhatsApp Web ou de l'ordinateur), elle est lue autrement qu'une note : qui parle à qui,
// la date de chaque message, la fin gardée plutôt que le début (c'est le plus récent), jamais prise pour une demande.

// « 12/11/2026 14:03 - Nom: », « 12/11/2026, 14:03 - Nom: », « [12/11/2026 14:03:22] Nom: », « [12/11/26, 14:03] Nom: »
const DATE_HEURE = /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2})[:h](\d{2})(?::\d{2})?\]?\s*(?:[-–]\s*)?(.+)$/;
// « [14:03, 12/11/2026] Nom: » (copier-coller de WhatsApp Web et de l'ordinateur)
const HEURE_DATE = /^\[(\d{1,2}):(\d{2}),\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\]\s*(.+)$/;
const MEDIA = /^<?(?:médias? omis|media omitted|image absente|vidéo absente|audio omis|fichier joint|pièce jointe)>?$/i;

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
export function lireConversation(texte) {
  const lignes = nettoyer(texte).split(/\r?\n/);
  const messages = [];
  let vus = 0;
  let premiere = null;
  for (const brute of lignes) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const d = debut(ligne);
    if (premiere === null) premiere = !!d;
    if (d) {
      vus += 1;
      if (!d.systeme) messages.push({ le: d.le.toISOString(), de: d.de, texte: MEDIA.test(d.texte) ? '[média]' : d.texte });
      continue;
    }
    const dernier = messages[messages.length - 1];
    if (dernier) dernier.texte = `${dernier.texte}\n${ligne}`;
  }
  if (!premiere || vus < 3 || messages.length < 3) return null;
  const compte = new Map();
  for (const m of messages) compte.set(m.de, (compte.get(m.de) || 0) + 1);
  return {
    messages,
    participants: [...compte].map(([nom, n]) => ({ nom, messages: n })).sort((a, b) => b.messages - a.messages),
    du: messages[0].le,
    au: messages[messages.length - 1].le,
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
