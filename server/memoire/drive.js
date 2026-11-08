// La Mémoire lit le Drive Klocka (8 nov. 2026, Jules : « va dans mon Drive Klocka et récupère le maximum de fiches qu'on
// n'a pas rentrées dans le CRM et la Mémoire »). Comme le lecteur des boîtes : une page de fichiers à la fois, un point
// de reprise, un appel au modèle par fiche, seule la pause l'arrête. Un fichier n'est lu que si son nom dit une fiche
// (la règle des mails, sans IA) : un Drive de dossiers est plein de baux et de diagnostics.
//
// Une fiche déjà connue n'est pas gardée deux fois : même fichier, même contenu, ou même adresse en Mémoire.

import { setTimeout as attendre } from 'timers/promises';
import { Records, Meta } from '../db.js';
import { PAUSE_MS } from './drapeaux.js';
import { ENTITE, bienDepuisLot, ecrireFiche, hashDe } from './memoire.js';
import { ajouterDepense, enPause } from './scraper.js';

const CLE = 'memoire.drive';
const TAILLE_MAX = 25 * 1024 * 1024;
// Ce que le Drive appelle autrement qu'une fiche (« VP2819-MURS OCCUPES… », « Murs Pamiers », « Bien-DC91-… ») ; et ce
// qu'un nom de fiche attrape à tort : nos présentations, les fichiers temporaires de Word, les pièces d'un dossier.
const NOM_DE_BIEN = /\bmurs\b|^vp\d|^bien-|local commercial|\binvestissement\b|haut rendement|immeuble lou[ée]/i;
const BRUIT = /^~\$|klocka|synergy|\bprofil\b|bon[ _-]?(de[ _-])?visite|^photos?\b|^analyse\b|synth[èe]se|\bddt\b|\bdta\b|assainissement|croquis|cession de fond|\bag\b|acculturation/i;

export function pointDrive() {
  try { return JSON.parse(Meta.get(CLE)) || {}; } catch { return {}; }
}
const noter = (p) => Meta.set(CLE, JSON.stringify(p));

/** Pure : le nom du fichier le désigne-t-il comme une fiche de bien ? */
export function estFicheDrive(f, F) {
  if (!f?.nom || f.taille > TAILLE_MAX || BRUIT.test(f.nom)) return false;
  const pieces = F.piecesFiche({ pieces_jointes: [{ nom: f.nom }] });
  return pieces.some(F.nomDitFiche) || (pieces.length > 0 && NOM_DE_BIEN.test(f.nom));
}

/** Un fichier du Drive : le bien en Mémoire, s'il est nouveau. */
export async function traiterFichier(compte, f, deps = {}) {
  const D = deps.drive || await import('../google-drive.js');
  const E = deps.extraire || (await import('../deal/extraire-faits.js')).extraireFaits;
  if (Records.findBy(ENTITE, 'drive_file_id', f.id)) return { fiche: false, raison: 'déjà lu' };
  const { buffer, nom, mime } = await D.telechargerFichier(compte, f.id);
  const hash = hashDe(buffer);
  if (Records.findBy(ENTITE, 'hash_piece', hash)) return { fiche: false, raison: 'même pièce déjà lue' };
  const faits = await E({ buffer, filename: nom, mimetype: mime }, { par: compte });
  const bien = bienDepuisLot(faits.lots?.[0], faits.agent || {}, { recu_le: f.cree_le || new Date().toISOString(), compte, hash_piece: hash, origine: 'drive', statut: 'memoire' });
  if (!bien.cle_adresse && !bien.prix && !bien.loyer_annuel) return { fiche: false, raison: 'fiche illisible', cout_eur: faits.cout_eur };
  if (bien.cle_adresse && Records.findBy(ENTITE, 'cle_adresse', bien.cle_adresse)) return { fiche: false, raison: 'adresse déjà en Mémoire', cout_eur: faits.cout_eur };
  bien.fiche = ecrireFiche(buffer, nom, mime);
  Records.create(ENTITE, { ...bien, drive_file_id: f.id, drive_url: f.url, objet_mail: String(nom).slice(0, 200), maj_le: new Date().toISOString() });
  return { fiche: true, cout_eur: faits.cout_eur };
}

/** Le compte qui lit le Drive : celui déclaré, sinon un compte de Jules qui a autorisé le Drive. */
async function compteLecteur() {
  const { SUPER_ADMINS } = await import('../acces-pages.js');
  const candidats = [process.env.GOOGLE_DRIVE_COMPTE, ...SUPER_ADMINS].map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
  return candidats.find((e) => Records.filter('MailAccount', { email: e })[0]?.peut_drive) || null;
}

let enCours = false;

/** Lit le Drive d'un bout à l'autre, une seule lecture à la fois ; une lecture finie ne recommence pas. */
export async function lireDrive(deps = {}) {
  if (enCours || pointDrive().termine_le) return { rien: true };
  enCours = true;
  try {
    const compte = await compteLecteur();
    if (!compte) { console.warn('[mémoire] Drive : aucun compte de Jules connecté au Drive'); return { rien: true }; }
    const D = deps.drive || await import('../google-drive.js');
    const F = deps.fiches || await import('../deal/fiches-auto.js');
    const p = { pageToken: null, vus: 0, lus: 0, fiches: 0, ignores: 0, erreurs: 0, commence_le: new Date().toISOString(), ...pointDrive() };
    for (;;) {
      if (enPause()) { noter(p); return { ...p, interrompu: true }; }
      const page = await D.pageDuDrive(compte, { pageToken: p.pageToken });
      for (const f of page.fichiers) {
        if (enPause()) { noter(p); return { ...p, interrompu: true }; }
        p.vus += 1;
        if (!estFicheDrive(f, F)) continue;
        try {
          const r = await traiterFichier(compte, f, { ...deps, drive: D });
          p.lus += 1;
          if (r.fiche) p.fiches += 1; else p.ignores += 1;
          if (r.cout_eur) ajouterDepense(r.cout_eur);
        } catch (e) {
          p.erreurs += 1;
          console.warn(`[mémoire] Drive ${f.nom} :`, e?.message || e);
        }
        if (PAUSE_MS) await attendre(PAUSE_MS);
      }
      p.pageToken = page.suivant;
      if (!p.pageToken) p.termine_le = new Date().toISOString();
      noter(p);
      console.log(`[mémoire] Drive : ${p.vus} fichiers vus, ${p.lus} fiches lues, ${p.fiches} nouvelles, ${p.erreurs} erreurs`);
      if (p.termine_le) return p;
    }
  } finally { enCours = false; }
}
