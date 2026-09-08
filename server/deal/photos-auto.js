// Les images d'un projet, cherchées toutes seules à sa création.
//
// Deux sources, toutes deux sourcées et sans droits à demander :
//
//  - Street View, cadré depuis la rue sur l'adresse du bien : la devanture,
//    telle qu'un passant la voit. Trois angles pour avoir le choix.
//  - Maps Static, une vue aérienne du quartier et un plan large de la ville.
//
// Les images sont rapatriées dans /uploads : la clé Google ne part jamais au
// navigateur, et le projet garde ses photos même si la clé change. Un échec
// n'est jamais bloquant : le projet se crée sans images, elles s'ajoutent à la
// main comme avant.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const CLE = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

async function telecharger(url, uploadDir) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`image indisponible (${resp.status})`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  // Une image d'erreur de Google pèse quelques centaines d'octets.
  if (buffer.length < 3000) throw new Error('image vide');
  const nom = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(uploadDir, nom), buffer);
  return `/uploads/${nom}`;
}

/** Y a-t-il une prise de vue Street View à ce point ? */
async function couvertureStreetView(position) {
  const meta = await fetch(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${position}&key=${CLE}`
  ).then((r) => r.json());
  return meta?.status === 'OK';
}

/**
 * Les photos d'un bien : devanture sous trois angles, quartier vu du ciel,
 * plan de la ville. Retourne les URLs locales, dans cet ordre.
 * @param {{ adresse?: string, lat?: number, lon?: number, ville?: string }} lieu
 * @param {string} uploadDir
 * @returns {Promise<{ photos: string[], raisons: string[] }>}
 */
export async function photosDuBien({ adresse, lat, lon, ville }, uploadDir) {
  const photos = [];
  const raisons = [];
  if (!CLE) return { photos, raisons: ['aucune clé Google Maps : pas de photos automatiques'] };

  // Street View accepte une adresse en clair ; les coordonnées servent de repli.
  const position = adresse ? encodeURIComponent(adresse) : lat != null && lon != null ? `${lat},${lon}` : null;
  if (position) {
    try {
      if (await couvertureStreetView(position)) {
        for (const angle of [{ fov: 75, pitch: 8 }, { fov: 100, pitch: 0 }, { fov: 45, pitch: 12 }]) {
          try {
            photos.push(await telecharger(
              `https://maps.googleapis.com/maps/api/streetview?size=1280x720&location=${position}` +
              `&fov=${angle.fov}&pitch=${angle.pitch}&source=outdoor&key=${CLE}`,
              uploadDir
            ));
          } catch { /* un angle manquant n'empêche pas les autres */ }
        }
      } else {
        raisons.push('pas de prise de vue Street View à cette adresse');
      }
    } catch (e) {
      raisons.push(`Street View injoignable : ${e?.message || e}`);
    }
  }

  // Le quartier vu du ciel, puis la ville en plan large.
  const centre = adresse ? encodeURIComponent(adresse) : lat != null && lon != null ? `${lat},${lon}` : null;
  if (centre) {
    try {
      photos.push(await telecharger(
        `https://maps.googleapis.com/maps/api/staticmap?center=${centre}&zoom=18&size=1280x720&maptype=satellite&key=${CLE}`,
        uploadDir
      ));
    } catch (e) { raisons.push(`vue aérienne indisponible : ${e?.message || e}`); }
  }
  if (ville) {
    try {
      photos.push(await telecharger(
        `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(ville)}&zoom=13&size=1280x720` +
        `&maptype=roadmap&markers=color:0x96c0b8%7C${centre || encodeURIComponent(ville)}&key=${CLE}`,
        uploadDir
      ));
    } catch (e) { raisons.push(`plan de la ville indisponible : ${e?.message || e}`); }
  }

  return { photos, raisons };
}
