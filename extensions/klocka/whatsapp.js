// WhatsApp Web : la conversation ouverte. Rien n'est lu tant que la fenêtre de l'extension ne le demande, et le fond
// ne le demande que pour une conversation activée.
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;

function titre() {
  const h = document.querySelector("#main header");
  if (!h) return null;
  const s = [...h.querySelectorAll('span[dir="auto"]')].map((x) => x.innerText.trim()).find(Boolean);
  return s || h.innerText.split("\n")[0].trim() || null;
}

// Un message envoyé par la personne elle-même (28 nov. 2026, Jules : « c'est faux, je ne suis pas Alexis ») : WhatsApp
// Web donne à chaque message un identifiant qui commence par « true_ » quand il vient de soi ; la classe
// « message-out » n'existe pas dans toutes ses versions.
const deSoi = (el) => String(el.closest("[data-id]")?.getAttribute("data-id") || "").startsWith("true_") || !!el.closest(".message-out");

// Chaque message porte « [10:51, 28/11/2026] Paul Dz: » : la forme d'un copier-coller de WhatsApp Web, que Klocka lit.
function lire() {
  const lignes = [];
  const noms = new Set();
  for (const el of document.querySelectorAll("#main [data-pre-plain-text]")) {
    const m = /^(\[[^\]]+\])\s*(.*?):\s*$/.exec(el.getAttribute("data-pre-plain-text") || "");
    if (!m) continue;
    const sortant = deSoi(el);
    const corps = (el.querySelector("span.selectable-text") || el).innerText.trim();
    if (!corps) continue;
    if (!sortant && m[2]) noms.add(m[2]);
    lignes.push(`${m[1]} ${sortant ? "Vous" : m[2]}: ${corps}`);
  }
  return { titre: titre(), fil: lignes.join("\n"), participants: [...noms], messages: lignes.length };
}

// Aller sur une autre conversation (28 nov. 2026, Jules : « ça va dans la conversation de Christophe Lepas, lit sa
// question, puis revient sur celle de Paul ») : la ligne de la liste à gauche, sinon la recherche de WhatsApp. Le fond
// ne le demande que pour une conversation activée.
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const attendre = async (trouver, ms = 5000) => {
  const fin = Date.now() + ms;
  for (;;) { const x = trouver(); if (x || Date.now() > fin) return x; await pause(150); }
};
const ligneDe = (nom) => [...document.querySelectorAll("#pane-side span[title]")].find((s) => s.getAttribute("title") === nom) || null;
function cliquer(el) {
  const cible = el.closest('[role="listitem"], [role="row"], [role="gridcell"]') || el;
  for (const t of ["mousedown", "mouseup", "click"]) cible.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
}
function viderRecherche(champ) {
  champ.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
}
async function ouvrirConversation(nom) {
  if (titre() === nom) return true;
  let ligne = ligneDe(nom);
  const recherche = ligne ? null : document.querySelector('#side div[contenteditable="true"]');
  if (recherche) {
    viderRecherche(recherche);
    document.execCommand("insertText", false, nom);
    ligne = await attendre(() => ligneDe(nom), 4000);
  }
  if (!ligne) { if (recherche) viderRecherche(recherche); return false; }
  cliquer(ligne);
  const ok = await attendre(() => titre() === nom, 5000);
  if (recherche) viderRecherche(recherche);
  // Les messages se chargent un instant après l'en-tête.
  await attendre(() => document.querySelector("#main [data-pre-plain-text]"), 3000);
  await pause(400);
  return !!ok;
}
async function lireAutre(nom) {
  const depart = titre();
  if (!(await ouvrirConversation(nom))) return { ok: false, error: `Je ne trouve pas la conversation « ${nom} » dans WhatsApp.` };
  const lu = lire();
  const retour = depart ? await ouvrirConversation(depart) : true;
  return { ok: true, conversation: nom, fil: lu.fil, messages: lu.messages, revenu: retour };
}

// Qui a écrit en dernier, de l'autre côté : le nom des pilules (« Répondre à Christophe »). Seulement ce nom, rien du
// message. Dans un groupe (28 nov. 2026, Jules : « Klocka t'a écrit en dernier, alors que c'est Christophe ; le groupe
// s'appelle Klocka - … »), c'est l'auteur du message, jamais le nom du groupe : faute d'auteur lisible, pas de nom.
// `aToi` : le dernier message de la conversation vient de l'autre (sinon, c'est toi qui as écrit en dernier).
function dernier() {
  const tous = [...document.querySelectorAll("#main [data-pre-plain-text]")];
  const recus = tous.filter((x) => !deSoi(x));
  const nomDe = (x) => {
    const m = /^\[[^\]]+\]\s*(.*?):\s*$/.exec(x?.getAttribute("data-pre-plain-text") || "");
    return m?.[1]?.replace(/^~\s*/, "").trim() || null;
  };
  const dernierRecu = recus[recus.length - 1] || null;
  return { nom: nomDe(dernierRecu), aToi: !!tous.length && tous[tous.length - 1] === dernierRecu };
}

api.runtime.onMessage.addListener((msg, _de, repondre) => {
  if (msg?.quoi === "ou") {
    const t = titre();
    const d = t ? dernier() : null;
    repondre(t ? { site: "whatsapp", cle: `whatsapp:${t}`, libelle: t, dernier: d.nom, aToi: d.aToi, peutRanger: true } : { site: "whatsapp", cle: null, libelle: null });
  } else if (msg?.quoi === "lire") {
    repondre(lire());
  } else if (msg?.quoi === "lireAutre") {
    lireAutre(String(msg.nom || "")).then(repondre);
    return true;
  } else if (msg?.quoi === "ecrire") {
    const champ = document.querySelector('#main footer div[contenteditable="true"]');
    if (!champ) { repondre({ ok: false }); return false; }
    const ici = titre();
    globalThis.klockaPoser(champ, msg.texte).then((ok) => {
      // Posé : on guette le message que la personne enverra, pour apprendre de sa version.
      if (ok && ici) {
        globalThis.klockaGuetter({
          envoyes: () => [...document.querySelectorAll("#main [data-pre-plain-text]")].filter(deSoi).map((el) => (el.querySelector("span.selectable-text") || el).innerText.trim()),
          memeLieu: () => titre() === ici, brouillon: msg.texte, canal: "whatsapp", pour: dernier().nom || ici, cle: `whatsapp:${ici}`,
        });
      }
      repondre({ ok });
    });
    return true;
  }
  return false;
});
