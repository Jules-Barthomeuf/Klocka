// Le fond de l'extension : il lit l'écran par les scripts de page, parle à Klocka avec la session du navigateur, et tient
// le chat de chaque conversation (un fil par onglet et par conversation), pour que la fenêtre le retrouve si elle s'est
// fermée entre-temps. Il ne lit rien sur une page tant que l'extension est éteinte ou que la conversation n'est pas
// activée. Rien ne part jamais : un brouillon est posé dans la case de réponse, la personne l'envoie elle-même.

import { reglages } from "./reglages.js";
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;
// Les chats : la mémoire de session, ou la mémoire locale là où elle manque.
const etats = api.storage.session ?? api.storage.local;

export const cleChat = (tabId, lieu) => `chat:${tabId}:${lieu}`;
const nouvelId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function lireChat(cle) {
  const { [cle]: c } = await etats.get(cle);
  return c || { messages: [], travail: null };
}
async function ecrireChat(cle, maj) {
  const c = await lireChat(cle);
  const suivant = typeof maj === "function" ? maj(c) : { ...c, ...maj };
  await etats.set({ [cle]: suivant });
  return suivant;
}
const ajouter = (cle, message) => ecrireChat(cle, (c) => ({ ...c, messages: [...c.messages, { id: nouvelId(), le: Date.now(), ...message }].slice(-60) }));
// Ce que fait l'assistant pendant qu'il travaille : `travail` (la ligne en cours) et `vives` (les étapes déjà passées,
// la frise de raisonnement du chat de la plateforme). Fini, les étapes passent sous la réponse.
const travail = (cle, texte) => ecrireChat(cle, (c) => ({ ...c, travail: texte, vives: texte ? c.vives || [] : [] }));
const etape = (cle, texte) => ecrireChat(cle, (c) => ({ ...c, travail: texte, vives: [...(c.vives || []), texte].slice(-30) }));

async function klocka(chemin, { methode = "GET", corps = null } = {}) {
  const { base } = await reglages();
  let r;
  try {
    r = await fetch(`${base.replace(/\/+$/, "")}${chemin}`, { method: methode, credentials: "include", headers: corps ? { "Content-Type": "application/json" } : {}, body: corps ? JSON.stringify(corps) : undefined });
  } catch {
    throw new Error(`Klocka ne répond pas à ${base}. Vérifie l'adresse dans les réglages.`);
  }
  if (r.status === 401 || r.status === 403) throw new Error("Connecte-toi à Klocka dans ce navigateur, avec un compte de l'équipe.");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Klocka a répondu ${r.status}.`);
  return j;
}

const page = (tabId, msg) => api.tabs.sendMessage(tabId, msg);

/** Lit l'écran, seulement si l'extension est allumée et ce lieu (conversation, boîte) activé. */
async function lireSiPermis(tabId) {
  const { active, lieux } = await reglages();
  if (!active) throw new Error("L'extension est éteinte.");
  const ou = await page(tabId, { quoi: "ou" });
  if (!ou?.cle || !lieux[ou.cle]) throw new Error("Active d'abord l'extension pour cette conversation.");
  const lu = await page(tabId, { quoi: "lire" });
  if (!lu?.fil) throw new Error("Je ne vois aucun message à l'écran.");
  return { ou, lu };
}

/** Le brouillon posé dans la case de réponse, et le message du chat qui le montre. */
async function poserBrouillon(tabId, cle, texte, message, suites) {
  const pose = await page(tabId, { quoi: "ecrire", texte }).catch(() => ({ ok: false }));
  const { site } = await page(tabId, { quoi: "ou" }).catch(() => ({}));
  await ajouter(cle, { de: "assistant", texte: message, brouillon: { texte, pose: !!pose?.ok, site: site || null }, suites });
}

const SUITES_BROUILLON = ["Plus court", "Plus chaleureux"];

/** Une pilule « Répondre à Paul » : le brouillon, sans passer par le choix du geste. */
async function repondre(tabId, lieu, libelle) {
  const cle = cleChat(tabId, lieu);
  await ajouter(cle, { de: "moi", texte: libelle });
  await travail(cle, "J'écris la réponse…");
  try {
    const { ou, lu } = await lireSiPermis(tabId);
    const r = await klocka("/api/extension/repondre", { methode: "POST", corps: { canal: ou.site === "gmail" ? "mail" : "whatsapp", titre: lu.titre || ou.libelle, fil: lu.fil, participants: lu.participants } });
    // « Ranger dans Klocka » ne se propose plus en pilule (28 nov. 2026, Jules : « je ne pense pas qu'ils le fassent ») ;
    // l'assistant sait encore le faire quand on le lui demande avec ses mots.
    await poserBrouillon(tabId, cle, r.texte, "", SUITES_BROUILLON);
  } catch (e) {
    await ajouter(cle, { de: "assistant", texte: e.message, erreur: true });
  } finally {
    await travail(cle, null);
  }
}

/** « Ranger dans Klocka » : la conversation passe par « Ce que j'en retiens », comme une note collée dans l'assistant. */
async function ranger(tabId, lieu, { libelle = "Ranger dans Klocka", demande = "", dejaDit = false } = {}) {
  const cle = cleChat(tabId, lieu);
  if (!dejaDit) await ajouter(cle, { de: "moi", texte: libelle });
  await travail(cle, "Je lis la conversation et je regarde ce qui revient à chaque fiche…");
  try {
    const { lu } = await lireSiPermis(tabId);
    const r = await klocka("/api/fiche-dossier/notes", { methode: "POST", corps: { texte: demande, conversation: lu.fil, libre: true } });
    if (r.nature !== "note") {
      await ajouter(cle, { de: "assistant", texte: "Je n'y vois rien à ranger sur une fiche." });
      return;
    }
    await ajouter(cle, { de: "assistant", texte: "Voilà ce que j'en retiens. Décoche ce que tu ne veux pas garder.", proposition: { note_id: r.note_id, contenu: r.proposition, etat: "ouverte" } });
  } catch (e) {
    await ajouter(cle, { de: "assistant", texte: e.message, erreur: true });
  } finally {
    await travail(cle, null);
  }
}

/** Klocka en flux : une ligne JSON par événement (étape, outil demandé au navigateur, résultat ou erreur). */
async function klockaFlux(chemin, corps, surLigne) {
  const { base } = await reglages();
  let r;
  try {
    r = await fetch(`${base.replace(/\/+$/, "")}${chemin}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  } catch {
    throw new Error(`Klocka ne répond pas à ${base}. Vérifie l'adresse dans les réglages.`);
  }
  if (r.status === 401 || r.status === 403) throw new Error("Connecte-toi à Klocka dans ce navigateur, avec un compte de l'équipe.");
  if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Klocka a répondu ${r.status}.`); }
  const lecteur = r.body.getReader();
  const dec = new TextDecoder();
  let reste = "";
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) break;
    reste += dec.decode(value, { stream: true });
    let i;
    while ((i = reste.indexOf("\n")) >= 0) {
      const ligne = reste.slice(0, i).trim();
      reste = reste.slice(i + 1);
      if (ligne) await surLigne(JSON.parse(ligne));
    }
  }
  if (reste.trim()) await surLigne(JSON.parse(reste.trim()));
}

// Le markdown est retiré à l'affichage, comme dans le chat de la plateforme : gras, italique, titres.
const sansMarkdown = (t) => String(t || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/`([^`]+)`/g, "$1");

/** Les conversations WhatsApp activées : leur nom, tel que dans l'en-tête de WhatsApp. */
const conversationsActivees = (lieux) => Object.keys(lieux || {}).filter((k) => k.startsWith("whatsapp:")).map((k) => k.slice(9));

/** Un outil que l'assistant demande au navigateur : lire une autre conversation, poser un brouillon, ranger. */
async function outilNavigateur(tabId, lieu, ou, { nom, input = {} }, { surBrouillon = null } = {}) {
  const cle = cleChat(tabId, lieu);
  if (nom === "lire_conversation_whatsapp") {
    if (ou.site !== "whatsapp") return { ok: false, error: "On n'est pas dans WhatsApp Web." };
    const { lieux } = await reglages();
    const voulu = String(input.nom || "").trim().toLowerCase();
    const activees = conversationsActivees(lieux);
    const titre = activees.find((t) => t.toLowerCase() === voulu) || activees.find((t) => t.toLowerCase().includes(voulu) || voulu.includes(t.toLowerCase()));
    if (!titre) return { ok: false, error: `« ${input.nom} » n'est pas activée dans l'extension : il faut l'ouvrir et allumer son interrupteur.` };
    return page(tabId, { quoi: "lireAutre", nom: titre }).catch(() => ({ ok: false, error: "Je n'ai pas pu ouvrir la conversation." }));
  }
  if (nom === "poser_brouillon") {
    const texte = String(input.texte || "").trim();
    if (!texte) return { ok: false, error: "Texte vide." };
    const pose = await page(tabId, { quoi: "ecrire", texte }).catch(() => ({ ok: false }));
    // Pendant une réponse de l'assistant, le brouillon rejoint sa réponse (un seul message, un seul portrait).
    if (surBrouillon) surBrouillon({ texte, pose: !!pose?.ok, site: ou.site });
    else await ajouter(cle, { de: "assistant", texte: "", brouillon: { texte, pose: !!pose?.ok, site: ou.site } });
    // Le résultat dit au modèle quoi répondre : la personne lit le message dans la case, le chat ne le résume pas.
    return pose?.ok
      ? { ok: true, pose: true, a_dire: "C'est écrit dans la case ; l'extension l'affiche déjà. Ne dis rien de plus, sauf un doute précis à signaler (un nom, un dossier, un chiffre), en une phrase." }
      : { ok: false, error: "La case de réponse est introuvable ; le texte est montré dans le chat, à copier." };
  }
  if (nom === "ranger_conversation") {
    if (!ou.peutRanger) return { ok: false, error: "Un mail ne se range pas ici : il se transfère à sourcing@." };
    await ranger(tabId, lieu, { demande: String(input.demande || ""), dejaDit: true });
    return { ok: true, info: "La proposition est montrée dans le chat : la personne coche ce qu'elle garde, puis range." };
  }
  return { ok: false, error: `Outil inconnu : ${nom}` };
}

/**
 * Un message tapé : l'assistant de la plateforme (même moteur, mêmes outils : dossiers, projets, fiches, rappels), avec
 * la conversation ou le mail ouvert en contexte, et les trois outils du navigateur.
 */
async function dire(tabId, lieu, texte) {
  const cle = cleChat(tabId, lieu);
  const avant = (await lireChat(cle)).messages;
  await ajouter(cle, { de: "moi", texte });
  if (/^ranger dans klocka$/i.test(texte.trim())) return ranger(tabId, lieu, { dejaDit: true });
  await travail(cle, "Je regarde…");
  let brouillon = null;
  try {
    const { ou, lu } = await lireSiPermis(tabId);
    const { lieux } = await reglages();
    // Ce que ses outils avaient lu (une autre conversation, un dossier) revient avec chaque réponse : sans cela, il
    // croirait ne pas l'avoir fait.
    const historique = avant.filter((m) => !m.erreur).map((m) => ({ role: m.de === "moi" ? "user" : "assistant", contenu: m.texte || m.fait || (m.brouillon ? `(brouillon posé dans la case : ${m.brouillon.texte})` : ""), ...(m.memoire ? { memoire: m.memoire } : {}) })).filter((m) => m.contenu);
    let fin = null;
    await klockaFlux("/api/extension/assistant", {
      texte, historique,
      contexte: { canal: ou.site === "gmail" ? "mail" : "whatsapp", titre: lu.titre || ou.libelle, fil: lu.fil, conversations: conversationsActivees(lieux) },
    }, async (l) => {
      if (l.etape) await etape(cle, l.etape);
      else if (l.outil_navigateur) {
        const resultat = await outilNavigateur(tabId, lieu, ou, l.outil_navigateur, { surBrouillon: (b) => { brouillon = b; } });
        await travail(cle, "Je continue…");
        await klocka("/api/extension/outil", { methode: "POST", corps: { id: l.outil_navigateur.id, resultat } }).catch(() => {});
      } else if (l.resultat) fin = l.resultat;
      else if (l.erreur) throw new Error(l.erreur);
    });
    // Un brouillon posé : de quoi le retoucher d'un clic.
    const { vives } = await lireChat(cle);
    // « Écrit dans WhatsApp » suffit : la phrase de l'assistant qui le redit (« c'est dans la case, à relire ») est tue.
    let dit = sansMarkdown(fin?.texte || "");
    if (brouillon?.pose && dit.length < 140 && /\b(case|relire|pos[ée]|[ée]crit|brouillon|rien n.est parti)\b/i.test(dit)) dit = "";
    if (dit || brouillon) await ajouter(cle, { de: "assistant", etapes: vives || [], brouillon, texte: dit, memoire: fin.memoire || null, suites: (fin.outils || []).includes("poser_brouillon") ? SUITES_BROUILLON : [] });
  } catch (e) {
    if (brouillon) await ajouter(cle, { de: "assistant", texte: "", brouillon });
    await ajouter(cle, { de: "assistant", texte: e.message, erreur: true });
  } finally {
    await travail(cle, null);
  }
}

const marquer = (cle, id, etat) => ecrireChat(cle, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, proposition: { ...m.proposition, etat } } : m)) }));

async function valider(tabId, lieu, id, garde, reponses) {
  const cle = cleChat(tabId, lieu);
  const m = (await lireChat(cle)).messages.find((x) => x.id === id);
  if (!m?.proposition) return;
  await travail(cle, "Je range…");
  try {
    const r = await klocka(`/api/fiche-dossier/notes/${encodeURIComponent(m.proposition.note_id)}/ranger`, { methode: "POST", corps: { garde, reponses: reponses || {} } });
    await marquer(cle, id, "rangee");
    const quoi = [r.entrees ? `${r.entrees} ajout${r.entrees > 1 ? "s" : ""}` : null, r.actions ? `${r.actions} chose${r.actions > 1 ? "s" : ""} à faire` : null].filter(Boolean).join(", ");
    const fiches = (r.fiches || []).map((f) => f.nom).filter(Boolean);
    await ajouter(cle, { de: "assistant", fait: `Rangé dans Klocka${quoi ? ` : ${quoi}` : ""}`, detail: fiches.length ? fiches.join(", ") : null });
  } catch (e) {
    await ajouter(cle, { de: "assistant", texte: e.message, erreur: true });
  } finally {
    await travail(cle, null);
  }
}

// « Laisser » : la proposition est écartée, elle ne revient pas dans « Aujourd'hui » de Klocka.
async function laisser(tabId, lieu, id) {
  const cle = cleChat(tabId, lieu);
  const m = (await lireChat(cle)).messages.find((x) => x.id === id);
  try { if (m?.proposition?.note_id) await klocka(`/api/fiche-dossier/notes/${encodeURIComponent(m.proposition.note_id)}/ecarter`, { methode: "POST", corps: {} }); } catch { /* déjà rangée ou écartée */ }
  await marquer(cle, id, "laissee");
}

// Un message envoyé après un brouillon (le script de la page l'a vu partir) : appris par Klocka pour le style, si la
// conversation est toujours activée. Rien d'autre n'en est fait.
async function envoye({ cle, canal, pour, texte, initial }) {
  const { active, lieux } = await reglages();
  if (!active || !cle || !lieux[cle]) return;
  await klocka("/api/extension/envoye", { methode: "POST", corps: { canal, pour, texte, initial } }).catch(() => {});
}

api.runtime.onMessage.addListener((msg) => {
  const { tabId, lieu } = msg || {};
  if (msg?.quoi === "envoye") { envoye(msg); return undefined; }
  if (msg?.quoi === "repondre") repondre(tabId, lieu, msg.libelle);
  else if (msg?.quoi === "ranger") ranger(tabId, lieu);
  else if (msg?.quoi === "dire") dire(tabId, lieu, String(msg.texte || "").slice(0, 2000));
  else if (msg?.quoi === "valider") valider(tabId, lieu, msg.id, msg.garde, msg.reponses);
  else if (msg?.quoi === "laisser") laisser(tabId, lieu, msg.id);
  return undefined;
});

// Un onglet fermé : ses chats partent avec lui.
api.tabs.onRemoved.addListener(async (tabId) => {
  const tout = await etats.get(null);
  const cles = Object.keys(tout || {}).filter((k) => k.startsWith(`chat:${tabId}:`));
  if (cles.length) await etats.remove(cles);
});
