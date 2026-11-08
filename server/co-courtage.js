// La fiche confrère d'un bien en vente (6 nov. 2026, Jules : « il faut que ça construise les annonces pour eux, ainsi
// que les fiches anonymes de co »). Le co-courtage : un autre agent (un confrère) présente son acquéreur, et les deux
// se partagent les honoraires. La fiche reprend le teaser (anonyme : ni adresse, ni enseigne, ni nom), et y ajoute ce
// qu'un confrère demande avant de présenter le bien : le mandat (exclusif ou simple, sa référence, son échéance), le
// prix honoraires inclus, les honoraires et leur partage, et comment son acquéreur est protégé (le bon de visite à son
// nom). Composée par règles, sans modèle ; le partage se règle d'un clic (50 % par défaut).
//
// Klocka n'envoie rien : le mandataire copie le message pour ses confrères, ou envoie le PDF lui-même.

import { Records } from './db.js';

const AFAIRE = '[à compléter]';
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null);
const nombre = (...v) => { for (const x of v) { const n = Number(String(x ?? '').replace(/[^\d.]/g, '')); if (n > 0) return n; } return null; };

export const PARTAGES = [30, 40, 50, 60];

/**
 * Pure : le mandat tel qu'un confrère le lit, depuis le mandat de Klocka ou celui importé avec le bien. Les honoraires
 * d'un mandat de Klocka sont un nombre (au-dessus de 100, des euros ; sinon un pourcentage du prix) ; ceux d'un mandat
 * importé, un texte (« 36 000 € à la charge de l'acquéreur ») dont on lit le premier montant.
 */
export function mandatPourConfrere({ mandat = null, importe = null } = {}) {
  const prix = nombre(mandat?.prix, importe?.prix);
  const brut = mandat?.honoraires ?? importe?.honoraires ?? null;
  let honoraires = null;
  if (typeof brut === 'number' || /^\s*[\d.,]+\s*$/.test(String(brut ?? ''))) {
    const n = Number(String(brut).replace(',', '.'));
    honoraires = n > 100 ? n : prix && n > 0 ? Math.round((prix * n) / 100) : null;
  } else if (brut) {
    const m = String(brut).replace(/[\u202f\u00a0]/g, ' ').match(/(\d[\d ]*(?:[.,]\d+)?)\s*(k€|€|%)/i);
    if (m) {
      const n = Number(m[1].replace(/ /g, '').replace(',', '.'));
      honoraires = m[2] === '%' ? (prix ? Math.round((prix * n) / 100) : null) : m[2].toLowerCase() === 'k€' ? n * 1000 : n;
    }
  }
  const charge = mandat?.honoraires_charge || (/vendeur/i.test(String(importe?.honoraires || '')) ? 'vendeur' : 'acquereur');
  const exclusif = mandat?.type ? mandat.type === 'exclusif' : typeof importe?.exclusif === 'boolean' ? importe.exclusif : null;
  return {
    prix, honoraires, charge, exclusif,
    // Le prix que voit l'acquéreur : honoraires à sa charge, ils s'ajoutent.
    fai: prix && honoraires && charge === 'acquereur' ? prix + honoraires : prix,
    numero: mandat?.numero_registre || importe?.numero || null,
    echeance: importe?.echeance || (mandat?.signe_le && mandat?.duree_mois ? new Date(new Date(mandat.signe_le).setMonth(new Date(mandat.signe_le).getMonth() + Number(mandat.duree_mois))).toISOString().slice(0, 10) : null),
  };
}

/** Pure : les lignes « Co-courtage » de la fiche, et le message aux confrères. */
export function composerCo({ teaser = {}, m = {}, partage = 50, signataire = {}, ville = null } = {}) {
  const part = PARTAGES.includes(Number(partage)) ? Number(partage) : 50;
  const auConfrere = m.honoraires ? Math.round((m.honoraires * part) / 100) : null;
  const lignes = [
    { cle: 'mandat', intitule: 'Mandat', detail: m.exclusif == null ? AFAIRE : `${m.exclusif ? 'Exclusif' : 'Simple'}${m.numero ? `, n° ${m.numero}` : ''}${m.echeance ? `, jusqu'au ${date(m.echeance)}` : ''}` },
    // Le prix honoraires inclus est déjà dans les tuiles du teaser : la page ne garde que ce qu'un confrère y ajoute.
    { cle: 'honoraires', intitule: 'Honoraires', detail: m.honoraires ? `${eur(m.honoraires)}, charge ${m.charge === 'vendeur' ? 'vendeur' : 'acquéreur'}` : AFAIRE },
    { cle: 'partage', intitule: 'Partage', detail: auConfrere ? `${part} % au confrère, soit ${eur(auConfrere)}` : `${part} % au confrère` },
  ];
  const conditions = "Votre acquéreur est protégé par un bon de visite à votre nom, signé avant la visite. Le partage est réglé à la signature de l'acte authentique, sur facture. L'adresse et le dossier complet sont envoyés après un engagement de confidentialité.";
  const chiffres = (teaser.tuiles || []).filter((x) => x.valeur && !String(x.valeur).includes(AFAIRE) && !(m.fai && /prix/i.test(x.libelle || ''))).map((x) => `${x.libelle} : ${x.valeur}`);
  const message = [
    'Bonjour,',
    '',
    `Je vous propose en co-courtage : ${String(teaser.titre || 'un bien').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}${ville && !teaser.sous_titre ? `, à ${ville}` : ''}.`,
    teaser.sous_titre && !String(teaser.sous_titre).includes(AFAIRE) ? `${String(teaser.sous_titre).replace(/\.$/, '')}.` : null,
    ...(chiffres.length ? ['', ...chiffres] : []),
    m.fai ? `Prix honoraires inclus : ${eur(m.fai)}.` : null,
    `${m.exclusif == null ? '' : `Mandat ${m.exclusif ? 'exclusif' : 'simple'}${m.numero ? ` n° ${m.numero}` : ''}. `}Partage des honoraires : ${part} % pour vous${auConfrere ? ` (${eur(auConfrere)})` : ''}.`,
    '',
    "Si un de vos acquéreurs cherche ce type de bien, je vous envoie la fiche et le dossier. Votre client est protégé par un bon de visite à votre nom.",
    '',
    [signataire.nom, 'Mandataire K Partners', signataire.telephone, signataire.email].filter(Boolean).join(' · '),
  ].filter((l) => l != null).join('\n');
  return { v: 1, partage: part, lignes, conditions, message, compose_le: new Date().toISOString() };
}

const QUI = ['MiseEnMarche'];

/** Le mandat d'une mise en marché : celui de Klocka (par le dossier), sinon celui importé avec le bien. */
function mandatsDe(m) {
  const d = m?.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  const mandat = d?.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null;
  const p = d?.proprietaire_id ? Records.get('ProprietaireMandataire', d.proprietaire_id) : null;
  return { mandat, importe: p?.mandat_importe || null, prix_dossier: d?.prix || null };
}

/** La fiche confrère d'une mise en marché : composée une fois depuis le teaser, gardée telle qu'on l'a réglée. */
export async function coDe(marcheId, user, { refaire = false } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  const { teaserDe, signataireDe } = await import('./teaser.js');
  const t = await teaserDe(marcheId, user);
  if (!t.ok) return t;
  const signataire = signataireDe(m.mandataire_email);
  if (m.co?.v && !refaire) return { ok: true, co: m.co, teaser: t.teaser, signataire };
  const { mandat, importe, prix_dossier: prixDossier } = mandatsDe(m);
  const lu = mandatPourConfrere({ mandat, importe: importe || (prixDossier ? { prix: prixDossier } : null) });
  const ville = String(t.teaser.sous_titre || '').split(/[,·]/)[0].trim() || null;
  const co = { ...composerCo({ teaser: t.teaser, m: lu, partage: m.co?.partage || 50, signataire, ville }), diffusion: m.co?.diffusion || null };
  Records.update(QUI[0], m.id, { co });
  return { ok: true, co, teaser: t.teaser, signataire };
}

/** Le partage choisi, ou le message retouché. */
export async function modifierCo(marcheId, user, { partage, message, envoye } = {}) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m?.co) return { ok: false, error: 'Fiche confrère introuvable.' };
  if (partage !== undefined) {
    if (!PARTAGES.includes(Number(partage))) return { ok: false, error: 'Partage inconnu.' };
    Records.update('MiseEnMarche', m.id, { co: { ...m.co, partage: Number(partage) } });
    return coDe(marcheId, user, { refaire: true });
  }
  if (message !== undefined) Records.update('MiseEnMarche', m.id, { co: { ...m.co, message: String(message).slice(0, 4000), message_retouche: true } });
  if (envoye !== undefined) Records.update('MiseEnMarche', m.id, { co: { ...Records.get('MiseEnMarche', m.id).co, diffusion: envoye ? new Date().toISOString() : null } });
  return { ok: true, co: Records.get('MiseEnMarche', m.id).co };
}

/** La fiche confrère lue par la page d'impression (jeton seul). */
export async function coParJeton(jeton) {
  const { cibleDuJeton } = await import('./presentation-pdf.js');
  const cible = cibleDuJeton(jeton);
  if (!cible || !String(cible).startsWith('co:')) return null;
  const m = Records.get('MiseEnMarche', String(cible).slice(3));
  if (!m?.teaser || !m?.co) return null;
  const { signataireDe } = await import('./teaser.js');
  return { teaser: m.teaser, co: m.co, signataire: signataireDe(m.mandataire_email) };
}

const CANAUX_NOMS = { leboncoin: 'Leboncoin', portail: 'SeLoger · BureauxLocaux', linkedin: 'LinkedIn', whatsapp: 'WhatsApp · SMS', mail: 'le mail aux acquéreurs' };

/** Pure : où en est la diffusion, pour l'assistant (6 nov. 2026) : ce qui est en ligne, ce qui reste, la fiche confrère. */
export function cadreDeLaDiffusion(m) {
  if (!m?.annonces) return '';
  const d = m.annonces?.diffusion || {};
  const faits = Object.entries(d).filter(([, le]) => le).map(([k, le]) => `${CANAUX_NOMS[k] || k} (le ${String(le).slice(0, 10)})`);
  const reste = Object.keys(CANAUX_NOMS).filter((k) => m.annonces?.canaux?.[k] && !d[k]).map((k) => CANAUX_NOMS[k]);
  // Plus de fiche confrère à l'écran (7 nov. 2026, Jules) : l'assistant n'en parle plus.
  return `\nDIFFUSION : les annonces (onglet Annonces, après le teaser) sont prêtes ; Klocka ne publie rien, le mandataire copie. En ligne : ${faits.length ? faits.join(', ') : 'rien encore'}.${reste.length ? ` Reste : ${reste.join(', ')}.` : ''} Propose la suite en une ligne quand il te demande quoi faire (publier ce qui reste, noter les touches qui appellent). Ne parle jamais de fiche confrère.`;
}
