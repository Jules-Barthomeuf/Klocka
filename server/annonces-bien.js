// Les annonces d'un bien en vente (4 nov. 2026, Jules : « on leur donne des annonces pré-rédigées avec une photo de
// couverture, pour leur faciliter le plus possible »). Klocka ne publie rien : le mandataire copie chaque annonce sur le
// canal qu'il utilise, depuis son propre compte. Une annonce par canal, chacune à son format :
//   - Leboncoin : un titre court, le prix en tête, un texte simple ;
//   - les portails pro (SeLoger, BureauxLocaux) : plus descriptif, la surface et le rendement ;
//   - LinkedIn : un post, angle investisseur ;
//   - WhatsApp ou SMS : quelques lignes pour son réseau ;
//   - un mail aux acquéreurs de son fichier.
// Les faits viennent du teaser (mandat, avis, Data room), jamais du modèle, qui n'écrit que la tournure. La version est
// publique : ni adresse, ni enseigne, ni nom ; un fonds ne dit pas son nom (une cession qui s'ébruite abîme le fonds).
// Les mentions (référence, honoraires, qui publie, RSAC, carte de K Partners) sont posées par règle, sous chaque texte.

import { Records } from './db.js';

export const CANAUX = [
  { cle: 'leboncoin', nom: 'Leboncoin', titre: true, consigne: 'Titre de 60 caractères au plus, le type de bien et la ville. Texte de 600 à 900 caractères, phrases courtes, le prix et le rendement dans les deux premières lignes, puis le local, le bail, l’emplacement, et « Contactez-moi pour recevoir le dossier ».' },
  { cle: 'portail', nom: 'SeLoger · BureauxLocaux', titre: true, consigne: 'Titre de 80 caractères au plus. Texte de 1 200 à 1 800 caractères, en paragraphes : le bien, la surface, le bail et le locataire (son activité, jamais son nom), le rendement, l’emplacement et le quartier, puis la visite et le dossier sur demande.' },
  { cle: 'linkedin', nom: 'LinkedIn', titre: false, consigne: 'Un post de 500 à 900 caractères, angle investisseur : une première ligne qui accroche par le chiffre (rendement ou prix), trois points forts en lignes courtes, puis « Dossier complet sur demande, en message privé ». Pas de hashtags en rafale : trois au plus, à la fin.' },
  { cle: 'whatsapp', nom: 'WhatsApp · SMS', titre: false, consigne: 'Trois à cinq lignes, 350 caractères au plus : le bien, la ville, le prix, le rendement, « dispo pour en parler ». Ton direct, sans formule.' },
  { cle: 'mail', nom: 'Mail aux acquéreurs', titre: true, consigne: 'Le titre est l’objet du mail (70 caractères au plus). Texte de 700 à 1 100 caractères : « Bonjour, » puis le bien en deux phrases, les chiffres en lignes courtes (prix, loyer, rendement, surface, bail), et « Je vous envoie le teaser et le dossier si le bien vous intéresse. »' },
];
const CLES = new Set(CANAUX.map((c) => c.cle));
const AFAIRE = '[à compléter]';

/** Pure : les faits que l'annonce peut dire, depuis le teaser (sans les cases encore « à compléter »). */
export function faitsDuTeaser(t = {}) {
  const sansTrou = (v) => (v && !String(v).includes(AFAIRE) ? v : null);
  const tuiles = Object.fromEntries((t.tuiles || []).filter((x) => sansTrou(x.valeur)).map((x) => [x.libelle || x.cle, x.valeur]));
  const lignes = Object.fromEntries((t.lignes || []).filter((x) => sansTrou(x.detail)).map((x) => [x.intitule || x.cle, x.detail]));
  return {
    titre: sansTrou(t.titre), situation: sansTrou(t.sous_titre), classe: t.classe || null, ref: t.ref || null,
    chiffres: tuiles, caracteristiques: lignes, points_forts: (t.points || []).filter(sansTrou),
  };
}

/** Pure : les mentions sous chaque annonce. `s` : le signataire (server/mandataire-avis.js) ; `mandat` : prix, honoraires. */
export function mentionsDe({ ref = null, s = {}, mandat = null, location = false } = {}) {
  // Comme le registre des mandats (mandataire-portes.js) : un nombre au-dessus de 100 est en euros, sinon en %.
  // Une location (7 nov. 2026) : des honoraires du loyer annuel, à la charge du preneur, et pas de prix honoraires inclus.
  const charge = { acquereur: "de l'acquéreur", preneur: 'du preneur', bailleur: 'du bailleur' }[mandat?.honoraires_charge] || (location ? 'du preneur' : 'du vendeur');
  const honoraires = mandat?.honoraires != null
    ? `Honoraires : ${mandat.honoraires}${Number(mandat.honoraires) > 100 ? ' €' : ` %${location ? ' HT du loyer annuel HT HC' : ''}`} à la charge ${charge}.`
    : `Honoraires : ${AFAIRE}.`;
  const qui = [s.nom, s.qualite || 'agent commercial'].filter(Boolean).join(', ');
  const rsac = s.rsac ? `RSAC ${s.ville_rsac ? `de ${s.ville_rsac} ` : ''}n° ${s.rsac}` : `RSAC ${AFAIRE}`;
  return [
    ref ? `Réf. ${ref}.` : null,
    location ? 'Loyer hors taxes et hors charges.' : 'Prix honoraires inclus.',
    honoraires,
    `Annonce publiée par ${qui || AFAIRE} (${rsac}), mandataire de K Partners${s.carte_t ? `, carte professionnelle n° ${s.carte_t}` : ''}.`,
    [s.telephone, s.email].filter(Boolean).join(' · ') || null,
  ].filter(Boolean).join('\n');
}

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(CANAUX.map((c) => [c.cle, { type: 'object', properties: { ...(c.titre ? { titre: { type: 'string' } } : {}), texte: { type: 'string' } }, required: c.titre ? ['titre', 'texte'] : ['texte'] }])),
  required: CANAUX.map((c) => c.cle),
};

/** Pure : la consigne du modèle. */
export function consigneAnnonces(f) {
  return `Tu rédiges les annonces de vente d'un bien immobilier commercial pour un mandataire K Partners. Elles sont publiques.

LES FAITS (n'utilise qu'eux, n'en invente aucun ; un fait absent ne s'écrit pas, ne le remplace pas par une approximation) :
${JSON.stringify(f, null, 2)}

RÈGLES :
- Jamais d'adresse précise, de numéro de rue, d'enseigne, de nom de locataire ou de vendeur. La ville et le type d'emplacement suffisent.${f.classe === 'fonds' ? "\n- C'est un fonds de commerce : pas d'activité trop reconnaissable dans la ville, pas de chiffre exact du CA ; « CA et EBE communiqués sur demande »." : ''}
- Les montants en français : « 450 000 € », « 1,2 M€ » dès un million, « 6,5 % ».
- Pas d'emoji, pas de tiret cadratin, pas de superlatif creux (« exceptionnel », « rare », « unique »).
- Ne recopie pas les mentions légales (référence, honoraires, RSAC) : elles sont ajoutées sous chaque texte.

UNE ANNONCE PAR CANAL :
${CANAUX.map((c) => `- ${c.cle} (${c.nom}) : ${c.consigne}`).join('\n')}`;
}

/** Les annonces d'une mise en marché : rédigées une fois, gardées telles que le mandataire les a retouchées. */
export async function annoncesDe(marcheId, user, { refaire = false } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  if (m.annonces?.canaux && !refaire) return { ok: true, annonces: m.annonces };
  const { teaserDe } = await import('./teaser.js');
  const t = await teaserDe(marcheId, user);
  if (!t.ok) return t;
  const f = faitsDuTeaser(t.teaser);
  const { invokeLLM } = await import('./llm.js');
  const lu = await invokeLLM({ prompt: consigneAnnonces(f), response_json_schema: SCHEMA, max_tokens: 6000 });
  const d = m.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const mandat = d?.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null;
  const { signataire } = await import('./mandataire-avis.js');
  const canaux = Object.fromEntries(CANAUX.map((c) => [c.cle, { titre: c.titre ? String(lu?.[c.cle]?.titre || '').trim() : null, texte: String(lu?.[c.cle]?.texte || '').trim() }]));
  const annonces = { v: 1, le: new Date().toISOString(), ref: t.teaser.ref || null, canaux, mentions: mentionsDe({ ref: t.teaser.ref, s: signataire({ email: m.mandataire_email }), mandat, location: t.teaser.classe === 'a_louer' }), photo: m.annonces?.photo || t.teaser.photo || null, diffusion: m.annonces?.diffusion || null };
  Records.update('MiseEnMarche', m.id, { annonces });
  return { ok: true, annonces };
}

/** Une retouche à la main : le titre ou le texte d'un canal, les mentions, ou la photo de couverture. */
export async function modifierAnnonce(marcheId, user, { canal = null, titre, texte, mentions, photo, publie } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m?.annonces) return { ok: false, error: 'Annonces introuvables.' };
  const a = { ...m.annonces, canaux: { ...m.annonces.canaux } };
  if (canal) {
    if (!CLES.has(canal)) return { ok: false, error: 'Canal inconnu.' };
    a.canaux[canal] = { ...a.canaux[canal], ...(titre !== undefined ? { titre: String(titre) } : {}), ...(texte !== undefined ? { texte: String(texte) } : {}) };
  }
  if (mentions !== undefined) a.mentions = String(mentions);
  if (photo !== undefined) a.photo = photo && /^\/uploads\//.test(String(photo)) ? String(photo) : null;
  // Où l'annonce est en ligne (6 nov. 2026) : le mandataire le coche, la date se garde ; l'assistant le sait.
  if (publie !== undefined && canal) a.diffusion = { ...(a.diffusion || {}), [canal]: publie ? new Date().toISOString() : null };
  Records.update('MiseEnMarche', m.id, { annonces: a });
  return { ok: true, annonces: a };
}
