// Un faux modèle, à la place de l'API d'Anthropic, pour le test du parcours.
//
// Le serveur garde son code : le SDK lit ANTHROPIC_BASE_URL, qu'on pointe ici.
// Les réponses sont fixes, pour que le test soit rapide et stable ; le vrai
// comportement de Haka se teste ailleurs (PLAN.md, tâche 2.3). Trois phrases
// dictées appellent un outil (étapes 5, 6 et 8), tout le reste reçoit une
// réponse neutre : un JSON vide quand une forme est demandée, « C'est noté. »
// sinon. Chaque demande est notée dans modele.jsonl, pour comprendre un échec.

import fs from 'fs';
import http from 'http';
import path from 'path';
import { COMMERCE, COMMERCE_TEL, DICTEES } from './donnees.mjs';

const NOMS = [COMMERCE.nom, COMMERCE_TEL.nom];

/** Le prochain jeudi à 10 h, heure de Paris, en « 2026-11-05T10:00:00 ». */
export function jeudiProchain(depuis = new Date()) {
  const d = new Date(depuis);
  d.setDate(d.getDate() + (((4 - d.getDay() + 7) % 7) || 7));
  return `${d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })}T10:00:00`;
}

const texteDe = (m) => (typeof m?.content === 'string' ? m.content : (m?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
const resultatsOutils = (m) => Array.isArray(m?.content) && m.content.some((b) => b.type === 'tool_result');

/** Ce que le faux modèle répond : une liste de blocs et la raison de l'arrêt. */
export function repondre(corps) {
  const messages = corps.messages || [];
  const dernier = messages[messages.length - 1];
  const outils = new Set((corps.tools || []).map((t) => t.name));
  const tout = JSON.stringify(corps);
  const nom = NOMS.find((n) => tout.includes(n)) || COMMERCE.nom;
  const texte = (t) => ({ blocs: [{ type: 'text', text: t }], arret: 'end_turn' });
  const outil = (name, input) => ({ blocs: [{ type: 'text', text: 'Je note.' }, { type: 'tool_use', id: `toolu_faux_${Date.now()}`, name, input }], arret: 'tool_use' });

  if (resultatsOutils(dernier)) return texte("C'est noté.");
  const dit = texteDe(dernier);
  if (dit.includes(DICTEES.contact) && outils.has('resultat_appel')) {
    return outil('resultat_appel', { qui: nom, statut: 'contacte', note: "Vu l'exploitante, numéro du propriétaire obtenu." });
  }
  if (dit.includes(DICTEES.rdv) && outils.has('noter_rdv')) {
    return outil('noter_rdv', { quand: jeudiProchain(), avec: 'le propriétaire', qui: nom, objet: 'Visite des murs' });
  }
  if (dit.includes(DICTEES.visite) && outils.has('compte_rendu_visite')) {
    return outil('compte_rendu_visite', {
      bien: { loyer_annuel: 24000, bail_date: '2019', surface: 80, refacturees: true },
      proprietaire: { prix: 420000, delai: "dans l'année", vendeur: true },
    });
  }
  // Une forme JSON demandée (invokeLLM) : un objet vide se lit sans erreur.
  const systeme = typeof corps.system === 'string' ? corps.system : JSON.stringify(corps.system || '');
  if (!outils.size && /json/i.test(systeme)) return texte('{}');
  return texte("C'est noté.");
}

const message = (corps, { blocs, arret }) => ({
  id: `msg_faux_${Date.now()}`,
  type: 'message',
  role: 'assistant',
  model: corps.model || 'faux',
  content: blocs,
  stop_reason: arret,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

/** La même réponse, en flux (messages.stream). */
function enFlux(res, m) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { ...m, content: [], stop_reason: null } });
  m.content.forEach((b, index) => {
    if (b.type === 'text') {
      ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
      ev('content_block_delta', { index, delta: { type: 'text_delta', text: b.text } });
    } else {
      ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    ev('content_block_stop', { index });
  });
  ev('message_delta', { delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } });
  ev('message_stop', {});
  res.end();
}

export function demarrerFauxModele({ port, dossier }) {
  const journal = path.join(dossier, 'modele.jsonl');
  const serveur = http.createServer((req, res) => {
    let brut = '';
    req.on('data', (c) => { brut += c; });
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'Faux modèle : seul /v1/messages répond.' } }));
      }
      let corps = {};
      try { corps = JSON.parse(brut || '{}'); } catch { /* corps illisible : réponse neutre */ }
      const m = message(corps, repondre(corps));
      try {
        fs.appendFileSync(journal, `${JSON.stringify({ le: new Date().toISOString(), dernier: texteDe((corps.messages || []).at(-1)).slice(0, 300), outils: (corps.tools || []).length, reponse: m.content })}\n`);
      } catch { /* le journal est une aide, pas une condition */ }
      if (corps.stream) return enFlux(res, m);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(m));
    });
  });
  return new Promise((ok) => serveur.listen(port, '127.0.0.1', () => ok(serveur)));
}
