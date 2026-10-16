// L'audio d'un appel en un seul WAV (16 oct. 2026, Jules) : le mode appel garde
// chaque morceau de huit secondes ; au raccrochage on les recolle pour que
// Voxtral sépare les voix une fois sur tout l'appel (la part de parole).

const ENTETE = 44;

/** Recolle des WAV PCM 16 bits mono (en-tête de 44 octets, comme pcmVersWav). */
export async function fusionnerWav(blobs) {
  const parts = [];
  for (const b of blobs) if (b) parts.push(new Uint8Array(await b.arrayBuffer()));
  if (!parts.length) return null;
  const donnees = parts.reduce((t, p) => t + Math.max(0, p.length - ENTETE), 0);
  const sortie = new Uint8Array(ENTETE + donnees);
  sortie.set(parts[0].subarray(0, ENTETE), 0);
  const v = new DataView(sortie.buffer);
  v.setUint32(4, 36 + donnees, true);
  v.setUint32(40, donnees, true);
  let o = ENTETE;
  for (const p of parts) { sortie.set(p.subarray(ENTETE), o); o += p.length - ENTETE; }
  return new Blob([sortie], { type: "audio/wav" });
}

/** Au plus douze minutes d'audio à 16 kHz : au-delà, la limite de Voxtral (quinze minutes) approche. */
export const OCTETS_MAX = 12 * 60 * 32000;
