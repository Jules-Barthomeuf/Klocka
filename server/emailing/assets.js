// Les assets de l'emailing (9 oct. 2026) : ce qu'on glisse dans n'importe quel
// mail en un clic. Le simulateur (son lien est personnel : {{lien_simulateur}}),
// les lead magnets (la feuille de route), un lien, un encadré. Chaque asset est
// une petite suite de blocs (texte, bouton, image), qu'on renomme, retouche,
// supprime, ou qu'AK crée d'après une description.
//
// Les deux premiers sont posés d'office (le simulateur, puis un par lead
// magnet) et se retouchent comme les autres ; supprimés, ils ne reviennent pas.

import { Records, Meta } from '../db.js';

export const ASSET = 'EmailingAsset';
const maintenant = () => new Date().toISOString();
const base = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001').replace(/\/$/, '');
const GENRES = ['simulateur', 'lead_magnet', 'lien', 'bloc'];
const TYPES = new Set(['titre', 'texte', 'bouton', 'image', 'separateur']);
const idBloc = (k = 0) => `a${Date.now().toString(36)}${k}${Math.random().toString(36).slice(2, 5)}`;

/** Pure : des blocs propres (types connus, champs bornés). */
export function blocsPropres(blocs) {
  return (Array.isArray(blocs) ? blocs : []).filter((b) => TYPES.has(b?.type)).slice(0, 8).map((b, k) => ({
    id: idBloc(k), type: b.type,
    ...(b.texte != null ? { texte: String(b.texte).slice(0, 2000) } : {}),
    ...(b.lien ? { lien: String(b.lien).slice(0, 500) } : {}),
    ...(b.src ? { src: String(b.src).slice(0, 500) } : {}),
  }));
}

/** Les assets d'office, une seule fois chacun (Meta). */
function semer() {
  let fait = {};
  try { fait = JSON.parse(Meta.get('emailing:assets_semes') || '{}') || {}; } catch { fait = {}; }
  const ajout = {};
  if (!fait.simulateur) {
    Records.create(ASSET, {
      nom: 'Simulateur de rentabilité', genre: 'simulateur', systeme: true,
      description: 'Le simulateur public, avec un lien personnel par contact : on sait qui l\'utilise et avec quelles valeurs, et le bouton « Parler au fondateur » y prend le call.',
      blocs: blocsPropres([
        { type: 'texte', texte: 'Faites le calcul pour votre projet : prix, loyer, apport, crédit. Le simulateur vous montre le rendement et le cash-flow, année par année.' },
        { type: 'bouton', texte: 'Ouvrir le simulateur', lien: '{{lien_simulateur}}' },
      ]),
      cree_le: maintenant(),
    });
    ajout.simulateur = true;
  }
  for (const lm of Records.list('LeadMagnet')) {
    const cle = `lm:${lm.slug}`;
    if (fait[cle] || !lm.slug) continue;
    Records.create(ASSET, {
      nom: `Lead magnet · ${lm.titre || lm.slug}`, genre: 'lead_magnet', systeme: true, slug: lm.slug,
      description: 'La page « Ma feuille de route » : le plan d\'acquisition chiffré sur le quartier du contact, puis le simulateur prérempli.',
      blocs: blocsPropres([
        { type: 'texte', texte: `${lm.titre || 'Votre feuille de route'} : dites votre objectif de revenu et vos fonds propres, la page calcule combien d'acquisitions faire, à quel prix et en quelle année.` },
        { type: 'bouton', texte: 'Construire ma feuille de route', lien: `${base()}/FeuilleDeRoute?k={{k}}&utm_source=newsletter` },
      ]),
      cree_le: maintenant(),
    });
    ajout[cle] = true;
  }
  if (Object.keys(ajout).length) Meta.set('emailing:assets_semes', JSON.stringify({ ...fait, ...ajout }));
}

export function assets() {
  semer();
  return Records.list(ASSET).sort((a, b) => (b.systeme ? 1 : 0) - (a.systeme ? 1 : 0) || String(a.cree_le).localeCompare(String(b.cree_le)));
}

export function creerAsset({ nom, genre = 'bloc', description = '', blocs = [] } = {}, user = null) {
  const propres = blocsPropres(blocs);
  if (!propres.length) return { ok: false, error: 'Un asset a au moins un bloc.' };
  return { ok: true, asset: Records.create(ASSET, { nom: String(nom || '').trim().slice(0, 120) || 'Nouvel asset', genre: GENRES.includes(genre) ? genre : 'bloc', description: String(description || '').slice(0, 600), blocs: propres, cree_par: user?.email || null, cree_le: maintenant() }) };
}

export function modifierAsset(id, patch) {
  const a = Records.get(ASSET, id);
  if (!a) return { ok: false, error: 'Asset introuvable.' };
  const champs = { maj_le: maintenant() };
  if (patch.nom != null) champs.nom = String(patch.nom).trim().slice(0, 120) || a.nom;
  if (patch.description != null) champs.description = String(patch.description).slice(0, 600);
  if (Array.isArray(patch.blocs)) {
    const propres = blocsPropres(patch.blocs);
    if (!propres.length) return { ok: false, error: 'Un asset a au moins un bloc.' };
    // Le simulateur garde son lien personnel : sans lui, plus rien ne se mesure.
    if (a.genre === 'simulateur' && !propres.some((b) => String(b.lien || '').includes('{{lien_simulateur}}'))) return { ok: false, error: 'Le simulateur garde un bouton vers {{lien_simulateur}} : c\'est ce lien qui dit qui l\'utilise.' };
    champs.blocs = propres;
  }
  return { ok: true, asset: Records.update(ASSET, id, champs) };
}

export function supprimerAsset(id) {
  if (!Records.get(ASSET, id)) return { ok: false, error: 'Asset introuvable.' };
  Records.delete(ASSET, id);
  return { ok: true };
}

const SCHEMA = {
  type: 'object',
  properties: {
    nom: { type: 'string', description: 'court, ex. « Replay du webinaire »' },
    genre: { type: 'string', enum: GENRES },
    description: { type: 'string', description: 'une phrase : ce que c\'est, à quoi il sert' },
    blocs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...TYPES] },
          texte: { type: 'string', description: '**gras** et retours à la ligne permis' },
          lien: { type: 'string' },
          src: { type: 'string' },
        },
        required: ['type'],
      },
    },
  },
  required: ['nom', 'blocs'],
};

/** AK crée un asset d'après une description : il est enregistré, à retoucher ensuite. */
export async function genererAsset(description, user = null) {
  const d = String(description || '').trim();
  if (d.length < 8) return { ok: false, error: 'Décrivez l\'asset en une phrase ou deux.' };
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  if (!llmEnabled) return { ok: false, error: 'AK n\'est pas branché sur ce serveur.' };
  const r = await invokeLLM({
    prompt: `Tu prépares un ASSET pour les newsletters de Klocka (investissement en murs commerciaux, pour des particuliers inscrits à un webinaire) : un petit encadré à glisser dans un mail, de un à quatre blocs (titre, texte, bouton, image, séparateur).
Règles : vouvoiement, phrases courtes, concret, aucune emphase, pas de tiret cadratin, pas d'emoji. Un bouton au plus, avec un texte d'action court. Le lien du simulateur est toujours {{lien_simulateur}} (personnel à chaque contact) ; un lien inconnu : https://klocka.immo. Jamais de chiffre inventé présenté comme réel.

La demande de l'équipe :
${d}`,
    response_json_schema: SCHEMA,
    effort: 'low',
  });
  return creerAsset({ nom: r?.nom, genre: r?.genre || 'bloc', description: r?.description || d, blocs: r?.blocs || [] }, user);
}

/** Pour AK : la liste des assets, à citer et insérer dans les mails qu'il écrit. */
export const resumeAssets = () => assets().map((a) => `« ${a.nom} » (${a.genre}) : ${JSON.stringify(a.blocs.map((b) => ({ type: b.type, ...(b.texte ? { texte: b.texte } : {}), ...(b.lien ? { lien: b.lien } : {}) })))}`).join('\n');
