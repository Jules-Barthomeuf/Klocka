// L'inscription libre : un espace découverte, sans passer par l'équipe.
//
// Deux portes. Google — l'identité vient de Google, rien à prouver. Ou une
// adresse et un mot de passe, avec un code à six chiffres envoyé par mail :
// on ne crée pas un compte au nom d'une adresse qu'on ne tient pas.
//
// Le code est haché comme un mot de passe, vaut dix minutes, cinq essais. Il
// vit dans une entité que l'API générique ne sert jamais.

import { randomInt } from 'crypto';
import { Records } from './db.js';
import { hacherMotDePasse, verifierMotDePasse, validerMotDePasse } from './passwords.js';

const DIX_MINUTES = 10 * 60000;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const adresseValide = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Cadence : trois codes par heure et par adresse, dix par heure et par IP.
const cadence = new Map();
function tropVite(cle, max) {
  const maintenant = Date.now();
  const liste = (cadence.get(cle) || []).filter((t) => maintenant - t < 3600000);
  if (liste.length >= max) return true;
  liste.push(maintenant);
  cadence.set(cle, liste);
  return false;
}

/** Le compte découverte, commun aux deux portes. */
export function creerCompteDecouverte({ email, full_name = '', picture = null, via = 'email', mot_de_passe = null }) {
  const user = Records.create('User', {
    email: normEmail(email),
    full_name: String(full_name || '').trim() || null,
    picture,
    role: 'user',
    acces: 'decouverte',
    etape_actuelle: 1,
    inscrit_le: new Date().toISOString(),
    inscription_via: via,
    ...(mot_de_passe ? { mot_de_passe, mot_de_passe_defini_le: new Date().toISOString() } : {}),
  });
  console.log(`[inscription] compte découverte : ${user.email} (${via})`);
  return user;
}

/** Une boîte d'équipe peut-elle envoyer le code ? */
export async function inscriptionParEmailDisponible() {
  try {
    const { comptesEquipe } = await import('./google-oauth.js');
    if (comptesEquipe().some((c) => c.peut_envoyer)) return true;
  } catch {
    /* pas de Google : on regarde le SMTP */
  }
  try {
    const { hasAnyAccount } = await import('./email.js');
    return !!hasAnyAccount?.();
  } catch {
    return false;
  }
}

/**
 * Envoie un code à l'adresse. Refuse un compte déjà actif ; laisse passer un
 * compte découverte né par Google qui veut aussi un mot de passe.
 */
export async function demanderCode({ email, full_name, ip }) {
  const adresse = normEmail(email);
  if (!adresseValide(adresse)) return { ok: false, statut: 400, error: 'Adresse invalide.' };
  const existant = Records.filter('User', { email: adresse })[0];
  if (existant?.mot_de_passe) return { ok: false, statut: 409, error: 'Ce compte existe déjà : connectez-vous.' };
  if (existant && !existant.inscrit_le) {
    return { ok: false, statut: 409, error: 'Cette adresse est connue de Klocka : connectez-vous, votre mot de passe se choisit à la première connexion.' };
  }
  if (tropVite(`adresse:${adresse}`, 3) || (ip && tropVite(`ip:${ip}`, 10))) {
    return { ok: false, statut: 429, error: 'Trop de codes demandés. Réessayez dans une heure.' };
  }
  if (!(await inscriptionParEmailDisponible())) {
    return { ok: false, statut: 503, error: "L'inscription par e-mail est momentanément indisponible : continuez avec Google, ou écrivez-nous." };
  }

  for (const ancien of Records.filter('CodeInscription', { email: adresse })) Records.delete('CodeInscription', ancien.id);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  Records.create('CodeInscription', {
    email: adresse,
    full_name: String(full_name || '').trim() || null,
    code_hash: await hacherMotDePasse(code),
    expire_le: new Date(Date.now() + DIX_MINUTES).toISOString(),
    tentatives: 0,
  });

  const { sendEmail } = await import('./email.js');
  const prenom = String(full_name || '').trim().split(' ')[0];
  const r = await sendEmail({
    to: adresse,
    subject: `${code} — votre code Klocka`,
    body: `${prenom ? `Bonjour ${prenom},` : 'Bonjour,'}\n\nVoici votre code pour créer votre espace Klocka :\n\n    ${code}\n\nIl vaut dix minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nKlocka`,
    intention: 'code_inscription',
  });
  if (!r?.success) {
    console.error(`[inscription] envoi du code impossible à ${adresse} :`, r?.error || 'sans détail');
    return { ok: false, statut: 503, error: "L'envoi du code a échoué de notre côté. Continuez avec Google, ou réessayez dans un instant." };
  }
  return { ok: true, envoye: true, expire_le: new Date(Date.now() + DIX_MINUTES).toISOString() };
}

/** Vérifie le code, crée le compte (ou pose le mot de passe sur un compte Google). */
export async function confirmerInscription({ email, code, mot_de_passe, full_name }) {
  const adresse = normEmail(email);
  const demande = Records.filter('CodeInscription', { email: adresse })[0];
  if (!demande) return { ok: false, statut: 404, error: 'Aucun code en attente pour cette adresse : demandez-en un.' };
  if (new Date(demande.expire_le) < new Date()) {
    Records.delete('CodeInscription', demande.id);
    return { ok: false, statut: 410, error: 'Ce code a expiré : demandez-en un nouveau.' };
  }
  if ((demande.tentatives || 0) >= 5) {
    Records.delete('CodeInscription', demande.id);
    return { ok: false, statut: 429, error: 'Trop d\'essais : demandez un nouveau code.' };
  }
  const bon = await verifierMotDePasse(String(code || '').replace(/\D/g, ''), demande.code_hash);
  if (!bon) {
    Records.update('CodeInscription', demande.id, { tentatives: (demande.tentatives || 0) + 1 });
    return { ok: false, statut: 401, error: 'Code incorrect.' };
  }
  const controle = validerMotDePasse(mot_de_passe);
  if (!controle.valide) return { ok: false, statut: 400, error: controle.erreur };

  const existant = Records.filter('User', { email: adresse })[0];
  if (existant?.mot_de_passe) {
    Records.delete('CodeInscription', demande.id);
    return { ok: false, statut: 409, error: 'Ce compte existe déjà : connectez-vous.' };
  }
  const hash = await hacherMotDePasse(mot_de_passe);
  const nom = String(full_name || demande.full_name || '').trim();
  const user = existant
    ? Records.update('User', existant.id, {
        mot_de_passe: hash,
        mot_de_passe_defini_le: new Date().toISOString(),
        ...(nom && !existant.full_name ? { full_name: nom } : {}),
      })
    : creerCompteDecouverte({ email: adresse, full_name: nom, via: 'email', mot_de_passe: hash });
  Records.delete('CodeInscription', demande.id);
  return { ok: true, user };
}
