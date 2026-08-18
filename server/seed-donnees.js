// Sauvegarde chiffrée des données réelles, embarquée dans le dépôt.
//
// Problème résolu : la base (server/data) n'est pas versionnée, donc chaque
// nouveau déploiement démarre vide et obligeait à tout réimporter à la main.
// Ici, un instantané complet de la base (sauf les jetons : Session,
// MailAccount) est chiffré en AES-256-GCM puis committé dans
// server/data-seed/donnees.enc. Le dépôt étant public, RIEN n'y est lisible
// sans la clé — KLOCKA_SEED_KEY, qui vit dans le .env de chaque déploiement,
// comme les autres secrets.
//
// Au démarrage, si le fichier et la clé sont présents et que cet instantané
// n'a pas déjà été appliqué (empreinte mémorisée en Meta), il est restauré :
// créations et mises à jour idempotentes, sans jamais écraser un mot de passe
// déjà défini localement par un plus ancien.
//
// Rafraîchir l'instantané depuis l'instance de référence :
//   node server/seed-donnees.js exporter

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { Records, Meta } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FICHIER = path.join(__dirname, 'data-seed', 'donnees.enc');
// Jetons et sessions : jamais dans l'instantané, propres à chaque instance.
const ENTITES_EXCLUES = new Set(['Session', 'MailAccount']);

const cle = () => {
  const secret = process.env.KLOCKA_SEED_KEY;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
};

export function exporterSeed() {
  const k = cle();
  if (!k) throw new Error('KLOCKA_SEED_KEY manquante dans le .env — impossible de chiffrer.');

  const entites = {};
  for (const entity of Records.listEntities()) {
    if (ENTITES_EXCLUES.has(entity)) continue;
    entites[entity] = Records.list(entity);
  }

  const clair = zlib.gzipSync(
    Buffer.from(JSON.stringify({ exporte_le: new Date().toISOString(), entites }))
  );
  const iv = crypto.randomBytes(12);
  const chiffreur = crypto.createCipheriv('aes-256-gcm', k, iv);
  const chiffre = Buffer.concat([chiffreur.update(clair), chiffreur.final()]);

  fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
  fs.writeFileSync(FICHIER, Buffer.concat([iv, chiffreur.getAuthTag(), chiffre]));

  const total = Object.values(entites).reduce((n, a) => n + a.length, 0);
  console.log(
    `Instantané chiffré : ${Object.keys(entites).length} entités, ${total} enregistrements → ${path.relative(process.cwd(), FICHIER)} (${Math.round(fs.statSync(FICHIER).size / 1024)} Ko)`
  );
  return { entites: Object.keys(entites).length, enregistrements: total };
}

function dechiffrer(brut, k) {
  const iv = brut.subarray(0, 12);
  const tag = brut.subarray(12, 28);
  const dechiffreur = crypto.createDecipheriv('aes-256-gcm', k, iv);
  dechiffreur.setAuthTag(tag);
  const clair = Buffer.concat([dechiffreur.update(brut.subarray(28)), dechiffreur.final()]);
  return JSON.parse(zlib.gunzipSync(clair));
}

/**
 * Restaure l'instantané au démarrage si nécessaire. Synchrone : l'app ne doit
 * pas servir de requêtes sur une base à moitié restaurée.
 */
export function restaurerSeedSiNecessaire() {
  const k = cle();
  if (!k || !fs.existsSync(FICHIER)) return { fait: false };

  const brut = fs.readFileSync(FICHIER);
  const empreinte = crypto.createHash('sha256').update(brut).digest('hex');
  if (Meta.get('seed_donnees_hash') === empreinte) return { fait: false };

  let contenu;
  try {
    contenu = dechiffrer(brut, k);
  } catch {
    console.error('[seed] données chiffrées illisibles — KLOCKA_SEED_KEY ne correspond pas au fichier.');
    return { fait: false };
  }

  let crees = 0;
  let maj = 0;
  for (const [entity, records] of Object.entries(contenu.entites || {})) {
    if (ENTITES_EXCLUES.has(entity)) continue;
    for (const rec of records) {
      if (entity === 'User' && rec.email) {
        // L'email est la clé d'identité d'un compte. Un mot de passe déjà
        // défini sur place n'est jamais remplacé par celui de l'instantané.
        const existant = Records.filter('User', { email: String(rec.email).toLowerCase() })[0];
        if (existant) {
          const { id, mot_de_passe, ...champs } = rec;
          Records.update('User', existant.id, existant.mot_de_passe ? champs : { ...champs, mot_de_passe });
          maj++;
          continue;
        }
      }
      if (rec.id && Records.get(entity, rec.id)) {
        Records.update(entity, rec.id, rec);
        maj++;
      } else {
        Records.create(entity, rec);
        crees++;
      }
    }
  }

  Meta.set('seed_donnees_hash', empreinte);
  // Les données réelles sont là : le seed de démonstration n'a plus lieu d'être.
  Meta.set('seeded', 'true');
  console.log(`[seed] instantané du ${contenu.exporte_le} restauré : ${crees} créés, ${maj} mis à jour.`);
  return { fait: true, crees, maj };
}

// Usage CLI : node server/seed-donnees.js exporter
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'exporter') {
    const { config } = await import('dotenv');
    config();
    exporterSeed();
  } else {
    console.log('Usage : node server/seed-donnees.js exporter');
  }
}
