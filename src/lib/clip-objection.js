// Le clip d'objection (16 oct. 2026, Jules) : l'écran d'appel garde chaque
// morceau de huit secondes (WAV PCM 16 bits mono, en-tête de 44 octets) ;
// AK rend la phrase de l'objection non levée ; on retrouve le morceau qui la
// porte, et on découpe quinze secondes centrées sur lui, voisins compris.

const ENTETE = 44;
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Pure : le morceau dont le texte porte le plus de mots de la phrase, ou -1. */
export function morceauDeLaPhrase(textes, phrase) {
  const mots = norm(phrase).split(" ").filter((m) => m.length > 2);
  if (!mots.length) return -1;
  let meilleur = -1;
  let score = 0;
  textes.forEach((t, i) => {
    const texte = ` ${norm(t)} `;
    const n = mots.filter((m) => texte.includes(` ${m} `)).length;
    if (n > score) { score = n; meilleur = i; }
  });
  return score / mots.length >= 0.4 ? meilleur : -1;
}

/**
 * Pure : `secondes` d'audio centrées sur le morceau `i`, pris avec ses voisins.
 * @param {(Uint8Array|null)[]} parts  les morceaux, chacun un WAV complet
 * @returns {Uint8Array|null} un WAV
 */
export function decouper(parts, i, secondes = 15) {
  const voisins = [i - 1, i, i + 1].filter((k) => k >= 0 && parts[k]?.length > ENTETE);
  if (!parts[i] || parts[i].length <= ENTETE) return null;
  const freq = new DataView(parts[i].buffer, parts[i].byteOffset, ENTETE).getUint32(24, true);
  const donnees = voisins.map((k) => parts[k].subarray(ENTETE));
  const total = donnees.reduce((t, d) => t + d.length, 0);
  // Où commence le morceau i dans le collage, et son milieu.
  const debutI = voisins.slice(0, voisins.indexOf(i)).reduce((t, k) => t + parts[k].length - ENTETE, 0);
  const milieu = debutI + Math.floor((parts[i].length - ENTETE) / 2);
  const fenetre = Math.min(total, Math.round(secondes * freq) * 2);
  let debut = Math.max(0, Math.min(total - fenetre, milieu - Math.floor(fenetre / 2)));
  debut -= debut % 2;
  const colle = new Uint8Array(total);
  let o = 0;
  for (const d of donnees) { colle.set(d, o); o += d.length; }
  const sortie = new Uint8Array(ENTETE + fenetre);
  sortie.set(parts[i].subarray(0, ENTETE), 0);
  const v = new DataView(sortie.buffer);
  v.setUint32(4, 36 + fenetre, true);
  v.setUint32(40, fenetre, true);
  sortie.set(colle.subarray(debut, debut + fenetre), ENTETE);
  return sortie;
}

/** Le clip, prêt à envoyer : un Blob WAV, ou null si le morceau manque. */
export async function clipAutour(wavs, i, secondes = 15) {
  const parts = await Promise.all(wavs.map(async (b) => (b ? new Uint8Array(await b.arrayBuffer()) : null)));
  const clip = decouper(parts, i, secondes);
  return clip ? new Blob([clip], { type: "audio/wav" }) : null;
}
