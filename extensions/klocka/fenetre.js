// La fenêtre de l'extension, ouverte d'un clic sur l'icône en haut à droite, d'après la maquette de Jules (28 nov.
// 2026) : la roue des réglages à gauche, « Klocka » au centre et la croix ; le nom de la conversation, « Conversation WhatsApp lue » et l'interrupteur
// (une conversation non lue n'est jamais lue) ; le fil, avec le portrait de l'assistant choisi dans Klocka ; la saisie
// et l'envoi. Retirés le même jour (Jules) : « Lier » (l'assistant trouve seul le dossier ou la personne qu'on nomme),
// l'historique et le crayon (« je ne sais pas à quoi il sert »), et avec eux les réglages. Le travail se fait dans le
// fond : la fenêtre peut se fermer, elle retrouve le chat en se rouvrant.
import { reglages } from "./reglages.js";
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;
// Les chats : la mémoire de session, ou la mémoire locale là où elle manque.
const etats = api.storage.session ?? api.storage.local;

const $ = (id) => document.getElementById(id);
const fil = $("fil");

/** Un élément, sans jamais passer de texte lu à l'écran en HTML. */
function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "classe") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return n;
}
/** Une icône au trait (celles de lucide, que la plateforme emploie). */
function icone(chemins, taille = 16, epaisseur = 2) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: taille, height: taille, fill: "none", stroke: "currentColor", "stroke-width": epaisseur, "stroke-linecap": "round", "stroke-linejoin": "round" })) s.setAttribute(k, v);
  for (const d of [].concat(chemins)) { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); }
  return s;
}
const COCHE = "M20 6 9 17l-5-5";
const CHEVRON_BAS = "m6 9 6 6 6-6";
const ETINCELLE = ["M12 3v3", "M12 18v3", "M3 12h3", "M18 12h3", "m5.6 5.6 2.1 2.1", "m16.3 16.3 2.1 2.1", "m5.6 18.4 2.1-2.1", "m16.3 7.7 2.1-2.1"];

let onglet = null;
let ou = null;
let r = null;
// Les frises dépliées.
const deplies = new Set();

const cleChat = () => `chat:${onglet?.id}:${ou?.cle}`;
const envoyer = (quoi, plus = {}) => api.runtime.sendMessage({ quoi, tabId: onglet.id, lieu: ou?.cle, ...plus });

async function lieuOuvert() {
  try { return await api.tabs.sendMessage(onglet.id, { quoi: "ou" }); } catch { return null; }
}

// « Paul Dz » : « Paul » ; un numéro reste entier.
const prenom = (n) => (!n ? null : /^[+\d\s]+$/.test(n) ? n : n.split(/\s+/)[0]);

function interrupteur(coche, surChange, titre) {
  const i = el("input", { type: "checkbox", "aria-label": titre, onchange: (e) => surChange(e.target.checked) });
  i.checked = coche;
  return el("label", { classe: "interrupteur", title: titre }, i, el("span"));
}

async function copier(texte, bouton, mot) {
  await navigator.clipboard.writeText(texte);
  bouton.textContent = "Copié";
  setTimeout(() => { bouton.textContent = mot; }, 1500);
}

// Le portrait de l'assistant (28 nov. 2026, Jules : « l'assistant doit reprendre un des assistants de Klocka ») : le
// personnage choisi dans Paramètres > Personnalisation (préférence `personnage_haka` du compte), comme dans le chat de la
// plateforme ; le premier tant que le compte n'a pas répondu. Gardé dans le navigateur pour s'afficher tout de suite.
const PORTRAITS = ["haka-1", "haka-2", "haka-3", "haka-4", "haka-5", "haka-6"];
let portrait = "haka-1";
async function lirePortrait() {
  const { portrait: garde } = await api.storage.local.get("portrait");
  if (PORTRAITS.includes(garde)) portrait = garde;
  try {
    const { base } = await reglages();
    const rep = await fetch(`${base.replace(/\/+$/, "")}/api/auth/me`, { credentials: "include" });
    if (!rep.ok) return;
    const choisi = (await rep.json())?.preferences?.personnage_haka;
    const nouveau = PORTRAITS.includes(choisi) ? choisi : "haka-1";
    if (nouveau !== portrait) { portrait = nouveau; await api.storage.local.set({ portrait }); dessiner(); }
  } catch { /* Klocka ne répond pas : le portrait gardé suffit */ }
}

/** Une ligne de l'assistant : son portrait, puis ce qu'il dit. */
const ligne = (...corps) => el("div", { classe: "ligne" }, el("img", { classe: "rond", src: `images/${portrait}.png`, alt: "Assistant Klocka", draggable: "false" }), el("div", { classe: "corps" }, ...corps));
const message = (texte) => el("p", { classe: "message" }, texte);
const pilules = (boutons, enLigne = false) => el("div", { classe: `pilules${enLigne ? " en-ligne" : ""}` }, boutons);
const pilule = (libelle, faire, { desactivee = false, principale = false } = {}) => el("button", { classe: `pilule${principale ? " principale" : ""}`, type: "button", disabled: desactivee, onclick: faire }, libelle);

/** La frise de raisonnement : faite (coches), en cours (la dernière balayée d'un reflet), ou repliée une fois finie. */
function frise(etapes, { enCours = false, id = null } = {}) {
  if (!etapes?.length) return null;
  if (!enCours && !deplies.has(id)) {
    return el("button", { classe: "replie", type: "button", onclick: () => { deplies.add(id); dessiner(); } },
      `Analyse terminée · ${etapes.length} étape${etapes.length > 1 ? "s" : ""}`, icone(CHEVRON_BAS, 12));
  }
  const vues = etapes.map((e, i) => {
    const ici = enCours && i === etapes.length - 1;
    const derniere = i === etapes.length - 1;
    return el("div", { classe: `etape${ici ? " ici" : ""}` },
      el("span", { classe: "rail" },
        el("span", { classe: "point-etape" }, ici ? el("span", { style: "color: var(--craie); display: grid" }, icone(ETINCELLE, 15, 1.7)) : el("span", { classe: "coche" }, icone(COCHE, 10, 3))),
        !derniere || ici ? el("span", { classe: "lien-rail" }) : null),
      el("span", { classe: "libelle" }, e));
  });
  return el("div", { classe: "etapes" }, vues,
    !enCours ? el("button", { classe: "replier", type: "button", onclick: () => { deplies.delete(id); dessiner(); } }, "Replier") : null);
}

/** Une suite : un geste direct (ranger) ou une phrase dite au chat (« Plus court »). */
function suite(libelle, occupe) {
  const faire = /^ranger dans klocka$/i.test(libelle) ? () => envoyer("ranger") : () => envoyer("dire", { texte: libelle });
  return pilule(libelle, faire, { desactivee: occupe });
}

/** « Ce que j'en retiens » : chaque ajout et chaque chose à faire, cochés d'office, à décocher avant de ranger. */
function carteProposition(m, occupe) {
  const p = m.proposition.contenu || {};
  const ouverte = m.proposition.etat === "ouverte";
  const garde = new Set();
  const reponses = {};
  const caseA = (id, texte, detail = null) => {
    garde.add(id);
    const c = el("input", { type: "checkbox", disabled: !ouverte, onchange: (e) => (e.target.checked ? garde.add(id) : garde.delete(id)) });
    c.checked = true;
    return el("label", { classe: "case" }, c, el("span", {}, texte, detail ? el("div", { classe: "detail" }, detail) : null));
  };
  const lignes = [];
  for (const f of p.fiches || []) {
    const sous = [...(f.elements || []).map((e) => caseA(e.id, e.texte)), f.etape ? caseA(`${f.id}-etape`, `Étape : ${f.etape}${f.etat ? ` · ${f.etat}` : ""}`) : null].filter(Boolean);
    if (f.blocage !== undefined) garde.add(`${f.id}-blocage`);
    if (sous.length) lignes.push(el("div", { classe: "section" }, f.nom), ...sous);
  }
  for (const d of p.faites || []) lignes.push(caseA(d.id, `Fait : ${d.libelle}`));
  if ((p.actions || []).length) lignes.push(el("div", { classe: "section" }, "À faire"));
  for (const a of p.actions || []) {
    const quand = a.echeance ? new Date(`${a.echeance}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : null;
    const detail = [a.pour, quand, a.brouillon?.texte ? `message prêt : « ${a.brouillon.texte.slice(0, 90)}${a.brouillon.texte.length > 90 ? "…" : ""} »` : null].filter(Boolean).join(" · ");
    lignes.push(caseA(a.id, a.titre, detail || null));
  }
  for (const x of p.retraits || []) lignes.push(caseA(x.id, `Retirer ${x.nom} de ${x.de_nom}`));
  for (const x of p.regles || []) garde.add(x.id);
  for (const q of p.questions || []) {
    const zone = q.choix?.length
      ? el("div", { classe: "choix" }, q.choix.map((c) => el("button", { type: "button", "aria-pressed": "false", disabled: !ouverte, onclick: (e) => { reponses[q.id] = c; e.target.parentNode.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.target))); } }, c)))
      : el("input", { type: "text", placeholder: "Ta réponse (facultatif)", disabled: !ouverte, oninput: (e) => { reponses[q.id] = e.target.value; } });
    lignes.push(el("div", { classe: "case" }, el("span", {}, q.texte)), zone);
  }
  if (!lignes.length) return el("p", { classe: "note" }, "Rien de neuf à ranger dans cette conversation.");
  return el("div", { classe: `carte${ouverte ? "" : " fermee"}` },
    lignes,
    ouverte
      ? pilules([
        pilule("Ranger", () => envoyer("valider", { id: m.id, garde: [...garde], reponses }), { desactivee: occupe, principale: true }),
        pilule("Laisser", () => envoyer("laisser", { id: m.id }), { desactivee: occupe }),
      ], true)
      : el("p", { classe: "note" }, m.proposition.etat === "rangee" ? "Rangé." : "Laissé de côté."));
}

function vueMessage(m, dernier, occupe) {
  if (m.de === "moi") {
    return el("div", { classe: "envoye" },
      el("div", { classe: "bulle" }, m.texte));
  }
  if (m.fait) return ligne(el("div", { classe: "fait" }, icone(COCHE), el("div", {}, m.fait, m.detail ? el("span", { classe: "detail" }, ` · ${m.detail}`) : null)));
  const corps = [frise(m.etapes, { id: m.id })];
  if (m.brouillon) {
    // D'abord ce qui est fait (le brouillon posé), puis ce qu'il en dit. Posé dans la case, le texte se lit là où il
    // partira : le chat ne le répète pas. Seulement si la case manque.
    const ici = m.brouillon.site === "gmail" ? "Gmail" : "WhatsApp";
    if (m.brouillon.pose) corps.push(el("div", { classe: "fait" }, icone(COCHE), `Écrit dans ${ici}, pas envoyé.`));
    else {
      const b = el("button", { classe: "lien-action", type: "button", onclick: (e) => copier(m.brouillon.texte, e.target, "Copier") }, "Copier");
      corps.push(el("div", { classe: "fait" }, el("span", {}, `Je n'ai pas pu écrire dans ${ici}. `), b), el("div", { classe: "brouillon" }, m.brouillon.texte));
    }
  }
  if (m.texte) corps.push(message(m.texte));
  if (m.proposition) corps.push(carteProposition(m, occupe));
  if (dernier && m.suites?.length) corps.push(pilules(m.suites.map((s) => suite(s, occupe))));
  const l = ligne(...corps);
  if (m.erreur) l.classList.add("erreur");
  return l;
}

/** La question d'ouverture : ce que l'assistant propose, en pilules empilées. */
function ouverture(occupe) {
  // Le prénom de l'auteur du dernier message reçu, jamais le nom d'un groupe.
  const qui = prenom(ou.dernier);
  const repondre = qui ? `Répondre à ${qui}` : "Écrire la réponse";
  return ligne(
    message(qui && ou.site === "whatsapp" && ou.aToi ? `${qui} t'a écrit en dernier. Que veux-tu que je fasse ?` : "Que veux-tu que je fasse ?"),
    pilules([
      pilule(repondre, () => envoyer("repondre", { libelle: repondre }), { desactivee: occupe }),
      ou.site === "whatsapp" ? pilule("Copier la conversation", async (e) => { const lu = await api.tabs.sendMessage(onglet.id, { quoi: "lire" }); await copier(lu?.fil || "", e.target, "Copier la conversation"); }) : null,
    ]),
  );
}

// Deux dessins lancés coup sur coup (un réglage, puis son écho) : seul le dernier pose son contenu.
let tour = 0;
async function dessiner() {
  const moi = ++tour;
  const m = [];
  const lieu = [];
  let saisie = { ouverte: false, occupe: false };
  try { saisie = await construire(m, lieu); } finally {
    if (moi === tour) {
      const enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 40;
      $("lieu").replaceChildren(...lieu.flat().filter(Boolean));
      fil.replaceChildren(...m.flat().filter(Boolean));
      $("saisie").classList.toggle("cachee", !saisie.ouverte);
      $("texte").disabled = saisie.occupe;
      majEnvoi();
      if (enBas || saisie.occupe) fil.scrollTop = fil.scrollHeight;
    }
  }
}

/** Remplit le fil et la tête (la conversation, son état, son interrupteur) ; rend l'état de la saisie. */
async function construire(m, lieu) {
  r = await reglages();
  const ferme = { ouverte: false, occupe: false };
  if (!r.active) {
    m.push(ligne(message("Je suis éteint : je ne lis et n'écris rien, nulle part."), pilules([pilule("Rallumer l'extension", () => api.storage.local.set({ active: true }))])));
    return ferme;
  }
  ou = onglet ? await lieuOuvert() : null;
  if (!ou) { m.push(ligne(message("Ouvre une conversation dans WhatsApp Web ou un mail dans Gmail, puis clique de nouveau sur moi."))); return ferme; }
  if (!ou.cle) { m.push(ligne(message(ou.site === "whatsapp" ? "Ouvre une conversation." : "Ouvre un mail."))); return ferme; }
  const actif = !!r.lieux[ou.cle];
  const activer = async (v) => {
    const lieux = { ...r.lieux };
    if (v) lieux[ou.cle] = true; else delete lieux[ou.cle];
    await api.storage.local.set({ lieux });
  };
  const whatsapp = ou.site === "whatsapp";
  lieu.push(
    el("div", { classe: "quoi" },
      el("div", { classe: "nom" }, whatsapp ? ou.libelle : ou.sujet || ou.libelle),
      el("div", { classe: "etat" }, el("span", { classe: `point${actif ? " lue" : ""}` }),
        whatsapp ? (actif ? "Conversation WhatsApp lue" : "Conversation WhatsApp non lue") : (actif ? "Mail lu" : "Boîte non lue"))),
    interrupteur(actif, activer, whatsapp ? "Lire cette conversation" : "Lire cette boîte"),
  );
  if (!actif) {
    m.push(ligne(
      message(whatsapp ? `Je ne lis pas la conversation avec ${ou.libelle} tant que tu ne l'as pas activée.` : "Je ne lis pas cette boîte tant que tu ne l'as pas activée."),
      pilules([pilule(whatsapp ? `Activer pour ${ou.libelle}` : "Activer pour cette boîte", () => activer(true))]),
    ));
    return ferme;
  }
  if (!whatsapp && !ou.sujet) { m.push(ligne(message("Ouvre un mail, je t'aide à y répondre."))); return ferme; }
  const { [cleChat()]: chat } = await etats.get(cleChat());
  const messages = chat?.messages || [];
  const occupe = !!chat?.travail;
  if (!messages.length) m.push(ouverture(occupe));
  const dernierAssistant = [...messages].reverse().find((x) => x.de === "assistant");
  for (const x of messages) m.push(vueMessage(x, x === dernierAssistant && !occupe, occupe));
  if (occupe) {
    const vues = [...(chat.vives || [])];
    if (!vues.length || vues[vues.length - 1] !== chat.travail) vues.push(chat.travail);
    m.push(ligne(frise(vues, { enCours: true })));
  }
  return { ouverte: true, occupe };
}

// La saisie : Entrée envoie, Maj + Entrée passe à la ligne ; un clic dans le cadre met le curseur dans le champ.
const zone = $("texte");
const majEnvoi = () => { $("envoyer").disabled = zone.disabled || !zone.value.trim(); };
const ajuster = () => { zone.style.height = "auto"; zone.style.height = `${Math.min(zone.scrollHeight, 120)}px`; };
zone.addEventListener("input", () => { majEnvoi(); ajuster(); });
zone.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("saisie").requestSubmit(); } });
$("saisie").addEventListener("mousedown", (e) => { if (!e.target.closest("button, textarea")) { e.preventDefault(); zone.focus(); } });
$("saisie").addEventListener("submit", (e) => {
  e.preventDefault();
  const texte = zone.value.trim();
  if (!texte || zone.disabled) return;
  envoyer("dire", { texte });
  zone.value = "";
  ajuster();
  majEnvoi();
});
$("fermer").addEventListener("click", () => window.close());
api.storage.onChanged.addListener((changes) => { if (Object.keys(changes).some((k) => k === cleChat() || k === "lieux" || k === "active")) dessiner(); });

// La roue (28 nov. 2026, Jules : « une petite roue de paramètres en haut à gauche, pour zoomer plus ou moins ; et on doit
// pouvoir élargir, modifier les dimensions et déplacer l'extension comme on veut ») : la taille du texte, et « Ouvrir
// dans une fenêtre à part ». La fenêtre de la barre, le navigateur ne la laisse ni déplacer ni agrandir (800 × 600 au
// plus) ; la fenêtre à part se déplace et se redimensionne, et garde sa taille et sa place.
const seule = new URLSearchParams(location.search).has("seule");
const ZOOMS = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];
let zoom = 1;
function appliquerZoom() {
  document.documentElement.style.zoom = String(zoom);
  if (seule) {
    document.body.style.width = `${window.innerWidth / zoom}px`;
    document.body.style.height = `${window.innerHeight / zoom}px`;
  } else {
    // Plus gros, la fenêtre de la barre garde sa hauteur : 600 px, c'est le plafond du navigateur.
    document.body.style.width = "400px";
    document.body.style.height = `${Math.floor(Math.min(580, 598 / zoom))}px`;
  }
  $("taux").textContent = `${Math.round(zoom * 100)} %`;
  $("moins").disabled = zoom <= ZOOMS[0];
  $("plus").disabled = zoom >= ZOOMS[ZOOMS.length - 1];
}
async function changerZoom(sens) {
  const i = ZOOMS.findIndex((z) => z >= zoom - 0.001);
  zoom = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + sens))];
  appliquerZoom();
  await api.storage.local.set({ zoom });
}
$("moins").addEventListener("click", () => changerZoom(-1));
$("plus").addEventListener("click", () => changerZoom(1));
$("roue").addEventListener("click", (e) => { e.stopPropagation(); const ouvert = $("menu").hidden; $("menu").hidden = !ouvert; $("roue").setAttribute("aria-expanded", String(ouvert)); });
document.addEventListener("click", (e) => { if (!$("menu").hidden && !e.target.closest("#menu")) { $("menu").hidden = true; $("roue").setAttribute("aria-expanded", "false"); } });
$("detacher").hidden = seule;
$("aide-detacher").hidden = seule;
$("detacher").addEventListener("click", async () => {
  const { fenetre_place: p } = await api.storage.local.get("fenetre_place");
  await api.windows.create({ url: api.runtime.getURL(`fenetre.html?onglet=${onglet.id}&seule=1`), type: "popup", width: p?.w || 440, height: p?.h || 680, ...(p ? { left: p.x, top: p.y } : {}) });
  window.close();
});
if (seule) {
  window.addEventListener("resize", appliquerZoom);
  // La place et la taille de la fenêtre à part, gardées pour la prochaine fois.
  let place = "";
  setInterval(() => {
    const p = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    const t = JSON.stringify(p);
    if (t !== place) { place = t; api.storage.local.set({ fenetre_place: p }); }
  }, 1000);
}
// On change de conversation dans WhatsApp : la fenêtre suit (la fenêtre à part reste ouverte longtemps).
setInterval(async () => {
  const n = await lieuOuvert();
  if ((n?.cle || null) !== (ou?.cle || null) || n?.dernier !== ou?.dernier || n?.aToi !== ou?.aToi) dessiner();
}, 1500);

// `?onglet=` : la fenêtre posée sur un onglet donné (la fenêtre à part, et les essais hors de la barre).
const voulu = Number(new URLSearchParams(location.search).get("onglet"));
onglet = voulu ? await api.tabs.get(voulu) : (await api.tabs.query({ active: true, currentWindow: true }))[0];
zoom = ZOOMS.includes((await api.storage.local.get("zoom")).zoom) ? (await api.storage.local.get("zoom")).zoom : 1;
appliquerZoom();
if (seule) document.body.classList.add("seule");
await lirePortrait().catch(() => {});
await dessiner();
zone.focus();
