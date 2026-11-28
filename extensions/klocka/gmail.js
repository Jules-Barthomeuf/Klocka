// Gmail : le fil ouvert. Rien n'est lu tant que la fenêtre de l'extension ne le demande, et le fond ne le demande que
// pour une boîte activée.
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;

const compte = () => (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(document.title) || [null])[0];
const objet = () => document.querySelector("h2.hP")?.innerText.trim() || null;

function lire() {
  const morceaux = [];
  const noms = new Set();
  for (const m of document.querySelectorAll("div.adn")) {
    const de = m.querySelector("span.gD");
    const corps = m.querySelector("div.a3s");
    if (!corps) continue;
    const copie = corps.cloneNode(true);
    copie.querySelectorAll(".gmail_quote, blockquote, .gmail_signature").forEach((x) => x.remove());
    const nom = de?.getAttribute("name") || de?.innerText || "?";
    if (de?.getAttribute("email") !== compte()) noms.add(nom);
    const quand = m.querySelector("span.g3")?.getAttribute("title") || "";
    // Ses propres mails s'appellent « Vous » : Klocka y lit comment il tutoie ou vouvoie la personne.
    const moi = de?.getAttribute("email") && de.getAttribute("email") === compte();
    morceaux.push(`De : ${moi ? "Vous" : nom}${de?.getAttribute("email") && !moi ? ` <${de.getAttribute("email")}>` : ""}${quand ? `, ${quand}` : ""}\n${copie.innerText.trim()}`);
  }
  return { titre: objet(), fil: morceaux.join("\n\n---\n\n"), participants: [...noms], messages: morceaux.length };
}

const attendre = (trouver, ms = 4000) => new Promise((ok) => {
  const debut = Date.now();
  const tour = () => { const x = trouver(); if (x || Date.now() - debut > ms) ok(x); else setTimeout(tour, 150); };
  tour();
});
const caseDeReponse = () => document.querySelector('div.adn ~ div div[contenteditable="true"][role="textbox"], div.M9 div[contenteditable="true"][role="textbox"], td.Bu div[contenteditable="true"][role="textbox"]');

async function ecrire(texte) {
  let champ = caseDeReponse();
  if (!champ) {
    // Le bouton « Répondre » sous le dernier mail.
    const bouton = [...document.querySelectorAll('span.ams[role="link"], div[role="button"][data-tooltip]')].find((b) => /^(répondre|reply)$/i.test((b.innerText || b.getAttribute("data-tooltip") || "").trim()));
    if (!bouton) return false;
    bouton.click();
    champ = await attendre(caseDeReponse);
  }
  const ok = !!champ && (await globalThis.klockaPoser(champ, texte, { remplacer: false }));
  // Posé : on guette le mail que la personne enverra dans ce fil, pour apprendre de sa version.
  const sujet = objet();
  const moi = compte();
  if (ok && sujet && moi) {
    const corps = (m) => { const c = m.querySelector("div.a3s")?.cloneNode(true); if (!c) return ""; c.querySelectorAll(".gmail_quote, blockquote, .gmail_signature").forEach((x) => x.remove()); return c.innerText.trim(); };
    const noms = [...document.querySelectorAll("div.adn span.gD")].filter((x) => x.getAttribute("email") !== moi).map((x) => x.getAttribute("name") || x.innerText);
    globalThis.klockaGuetter({
      envoyes: () => [...document.querySelectorAll("div.adn")].filter((m) => m.querySelector("span.gD")?.getAttribute("email") === moi).map(corps).filter(Boolean),
      memeLieu: () => objet() === sujet, brouillon: texte, canal: "mail", pour: noms[noms.length - 1] || sujet, cle: `gmail:${moi}`,
    });
  }
  return ok;
}

api.runtime.onMessage.addListener((msg, _de, repondre) => {
  if (msg?.quoi === "ou") {
    const c = compte();
    const o = objet();
    const noms = [...document.querySelectorAll("div.adn span.gD")].filter((x) => x.getAttribute("email") !== c).map((x) => x.getAttribute("name") || x.innerText);
    repondre({ site: "gmail", cle: c ? `gmail:${c}` : null, libelle: c, sujet: o, dernier: noms[noms.length - 1] || null, peutRanger: false });
  } else if (msg?.quoi === "lire") {
    repondre(lire());
  } else if (msg?.quoi === "ecrire") {
    ecrire(msg.texte).then((ok) => repondre({ ok }));
    return true;
  }
  return false;
});
