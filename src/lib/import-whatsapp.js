// Une conversation WhatsApp exportée (« Exporter la discussion », sans les médias : un .txt ; avec : un .zip qui le
// contient), glissée ou choisie par le « + » de la saisie (19 nov. 2026, Jules : « je ne peux pas copier toute une
// conversation, ça limite »). Lue ici, dans le navigateur, puis envoyée avec la note.

import { lireConversation } from "@/lib/whatsapp";

/**
 * La même empreinte que le serveur (server/fiche-dossier/import.js, `wa:` + sha1 du texte, 20 signes) : l'écran reconnaît
 * une conversation déjà importée avant de l'envoyer (23 nov. 2026). Null hors d'un contexte sûr (http).
 */
async function empreinte(texte) {
  try {
    const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(String(texte || "")));
    return `wa:${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20)}`;
  } catch {
    return null;
  }
}

const estExport = (f) => /\.(txt|zip|md)$/i.test(f?.name || "");

/** Le texte de l'export : le .txt lui-même, ou celui que le .zip contient (« _chat.txt » sur iPhone). */
async function texteDe(f) {
  if (/\.(txt|md)$/i.test(f.name)) return f.text();
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(f);
  const txt = Object.values(zip.files).filter((x) => !x.dir && /\.(txt|md)$/i.test(x.name));
  const choisi = txt.find((x) => /_chat\.txt$/i.test(x.name)) || txt.find((x) => /whatsapp/i.test(x.name)) || txt[0];
  return choisi ? choisi.async("string") : null;
}

/**
 * La conversation d'un fichier, ou null si ce n'en est pas une.
 * @returns {Promise<{ nom: string, fichier: string, cle: string|null, texte: string, messages: number, du: string, au: string, participants: string[] } | null>}
 */
export async function lireExportWhatsApp(f) {
  if (!estExport(f)) return null;
  try {
    const texte = await texteDe(f);
    const conv = texte ? lireConversation(texte) : null;
    if (!conv) return null;
    return { nom: conv.titre || f.name.replace(/\.(txt|zip|md)$/i, ""), fichier: f.name, cle: await empreinte(texte), texte, messages: conv.messages.length, du: conv.du, au: conv.au, participants: conv.participants.map((p) => p.nom) };
  } catch {
    return null;
  }
}

export { estExport };
