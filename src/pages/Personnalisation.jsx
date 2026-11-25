import React, { useEffect, useRef, useState } from "react";
import BoiteMail from "@/components/dashboard/BoiteMail";
import ImportFiches from "@/components/fiche-dossier/ImportFiches";
import { vueDe } from "@/lib/vue";
import { Check, Maximize2, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/components/providers/UserProvider";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, OPTIONS, PERSONNAGES_HAKA, accentHex, hexVersHsv, hsvVersHex, themeEffectif } from "@/lib/personnalisation";
import { GROUPE_PARAMETRES, masquesDe } from "@/lib/menu";
import ProfilCompte from "@/components/compte/ProfilCompte";
import Competences from "@/components/haka/Competences";
import Sources from "@/components/socle/Sources";
import AccesAdmins from "@/components/compte/AccesAdmins";
import MesMails from "@/components/compte/MesMails";
import { ListeVilles } from "@/components/mandataire/VillesMandataire";
import { estApercuTelephone } from "@/components/ApercuTelephone";
import { Filtres, TitrePage } from "@/components/mandataire/elements";
import { createPageUrl } from "@/utils";
import { Link, useNavigate } from "react-router-dom";
import { prechargerAuSurvol } from "@/lib/precharger";

// L'onglet Assistant (portrait, longueur des réponses, tableaux), caché le 25 nov. 2026 (Jules : « tu peux cacher
// Assistant, si c'est demandé je le remettrai ») : true le remet.
const HAKA_VISIBLE = false;

// La page Personnalisation : chacun règle l'application pour lui. Tout
// s'applique à l'instant, sur la page elle-même : c'est l'aperçu. Les
// réglages suivent le compte (PersonnalisationProvider), pas l'appareil.

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";

/** Une ligne de réglage : le nom et sa note à gauche, les choix à droite. */
function Reglage({ titre, note, children }) {
  return (
    <div className="grid gap-3 border-t border-trait py-5 first:border-t-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div>
        <p className="m-0 text-[14px] font-medium text-encre">{titre}</p>
        {note && <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ardoise">{note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Des pilules à choix unique. `rendre` habille un libellé (une police, une forme). */
function Pilules({ valeur, valeurs = null, options, onChoisir, rendre }) {
  return options.map(([v, mot]) => {
    const actif = valeurs ? valeurs.includes(v) : v === valeur;
    return (
      <button
        key={String(v)}
        type="button"
        onClick={() => onChoisir(v)}
        aria-pressed={actif}
        className={`rounded-full border px-3.5 py-1.5 max-md:py-2 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/10 text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
        style={{ background: actif ? undefined : "transparent" }}
      >
        {rendre ? rendre(v, mot) : mot}
      </button>
    );
  });
}

/** Les pastilles d'accent : la couleur elle-même, dans le thème affiché. */
function Accents({ valeur, theme, onChoisir }) {
  return OPTIONS.accent.map(([cle, nom]) => {
    const actif = cle === valeur;
    const couleur = accentHex(cle, theme);
    return (
      <button
        key={cle}
        type="button"
        onClick={() => onChoisir(cle)}
        aria-pressed={actif}
        title={nom}
        className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors ${actif ? "border-menthe text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
        style={{ background: "transparent" }}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: couleur }}>
          {actif && <Check className="h-3.5 w-3.5" style={{ color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .7)" }} strokeWidth={3} />}
        </span>
        {nom}
      </button>
    );
  });
}

/**
 * La couleur d'accent (9 oct. 2026) : les teintes proposées, la couleur
 * enregistrée (« Ma couleur »), et « Personnaliser » : le sélecteur, un
 * aperçu sur un bouton, puis « Enregistrer la couleur ».
 */
function ChoixAccent({ prefs, changer, theme }) {
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState(() => prefs.accent_perso || accentHex(prefs.accent, theme));
  const perso = /^#/.test(String(prefs.accent || ""));
  const pastille = (couleur, actif) => (
    <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: couleur }}>
      {actif && <Check className="h-3.5 w-3.5" style={{ color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .7)" }} strokeWidth={3} />}
    </span>
  );
  const pilule = (actif) => `inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors ${actif ? "border-menthe text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`;
  return (
    <>
      <Accents valeur={prefs.accent} theme={theme} onChoisir={(v) => { changer({ accent: v }); setOuvert(false); }} />
      {prefs.accent_perso && (
        <button type="button" onClick={() => { changer({ accent: prefs.accent_perso }); setOuvert(false); }} aria-pressed={perso} title="Votre couleur enregistrée" className={pilule(perso)} style={{ background: "transparent" }}>
          {pastille(prefs.accent_perso, perso)}Ma couleur
        </button>
      )}
      <button type="button" onClick={() => { setBrouillon(prefs.accent_perso || accentHex(prefs.accent, theme)); setOuvert((x) => !x); }} aria-expanded={ouvert} className={pilule(ouvert)} style={{ background: "transparent" }}>
        <span className="h-6 w-6 rounded-full" style={{ background: "conic-gradient(from 0deg, hsl(0 85% 60%), hsl(60 85% 60%), hsl(120 85% 55%), hsl(180 85% 55%), hsl(240 85% 65%), hsl(300 85% 62%), hsl(360 85% 60%))" }} />
        Personnaliser
      </button>
      {ouvert && (
        <div className="mt-2 flex w-full flex-wrap items-start gap-6 rounded-[14px] border border-trait p-4">
          <SelecteurCouleur valeur={brouillon} onChoisir={setBrouillon} />
          <div className="flex flex-col gap-3">
            <span className="text-[12px] text-brume">Aperçu</span>
            <span className="inline-flex h-10 items-center rounded-full px-5 text-[14px]" style={{ background: brouillon, color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .78)" }}>Valider · 4 étapes</span>
            <span className="text-[14px]" style={{ color: brouillon }}>Un lien, un état actif</span>
            <span className="mt-2 flex gap-2">
              <button type="button" onClick={() => { changer({ accent: brouillon, accent_perso: brouillon }); setOuvert(false); }} className="h-9 rounded-full bg-encre px-4 text-[13.5px] text-fond hover:opacity-90">Enregistrer la couleur</button>
              <button type="button" onClick={() => setOuvert(false)} className="h-9 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Le sélecteur de couleur : un carré (saturation de gauche à droite, valeur
 * de haut en bas) dans la teinte choisie, et le spectre dessous. On glisse
 * le curseur, ou on tape le code.
 */
function SelecteurCouleur({ valeur, onChoisir }) {
  const [hsv, setHsv] = useState(() => hexVersHsv(valeur));
  const [saisie, setSaisie] = useState(valeur);
  const carre = useRef(null);
  const spectre = useRef(null);
  useEffect(() => { setSaisie(valeur); if (hsvVersHex(...hsv) !== valeur) setHsv(hexVersHsv(valeur)); }, [valeur]);
  const poser = (h, s0, v) => { setHsv([h, s0, v]); onChoisir(hsvVersHex(h, s0, v)); };
  const glisser = (zone, lire) => (e) => {
    const el = zone.current;
    if (!el) return;
    el.setPointerCapture?.(e.pointerId);
    const suivre = (ev) => { const r = el.getBoundingClientRect(); lire(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
    suivre(e);
    const fin = () => { el.removeEventListener("pointermove", suivre); el.removeEventListener("pointerup", fin); el.removeEventListener("pointercancel", fin); };
    el.addEventListener("pointermove", suivre);
    el.addEventListener("pointerup", fin);
    el.addEventListener("pointercancel", fin);
  };
  const [h, sat, val] = hsv;
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3">
      <div
        ref={carre}
        onPointerDown={glisser(carre, (x, y) => poser(h, x, 1 - y))}
        className="relative h-[170px] cursor-crosshair touch-none rounded-[10px]"
        style={{ backgroundColor: `hsl(${h} 100% 50%)`, backgroundImage: "linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, rgb(255 255 255), transparent)" }}
      >
        <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%`, borderColor: "rgb(255 255 255)", boxShadow: "0 0 0 1px rgb(0 0 0 / .4)", background: valeur }} />
      </div>
      <div
        ref={spectre}
        onPointerDown={glisser(spectre, (x) => poser(x * 360, sat, val))}
        className="relative h-3 cursor-pointer touch-none rounded-full"
        style={{ backgroundImage: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((d) => `hsl(${d} 100% 50%)`).join(", ")})` }}
      >
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${(h / 360) * 100}%`, borderColor: "rgb(255 255 255)", boxShadow: "0 0 0 1px rgb(0 0 0 / .4)", background: `hsl(${h} 100% 50%)` }} />
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ardoise">
        Code
        <input
          value={saisie}
          onChange={(e) => { const v = e.target.value.trim(); setSaisie(v); if (/^#?[0-9a-f]{6}$/i.test(v)) onChoisir((v.startsWith("#") ? v : `#${v}`).toLowerCase()); }}
          spellCheck={false}
          className="w-[96px] rounded-md border border-bord-doux bg-transparent px-2 py-1 font-mono text-[12.5px] text-encre outline-none focus:border-menthe"
        />
      </label>
    </div>
  );
}

/** La bannière en bas des mails (8 oct. 2026) : celle de son adresse Klocka, telle qu'elle part. */
function SignatureMails({ email }) {
  const [absente, setAbsente] = useState(false);
  const local = String(email || "").toLowerCase().endsWith("@klocka.immo") ? String(email).toLowerCase().split("@")[0] : null;
  return (
    <section className="mt-5 rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
      <p className={`${etiq} pt-4`}>Mails</p>
      <Reglage titre="Signature des mails" note="En bas de chaque mail parti de votre boîte Klocka, à la place de la signature en texte.">
        {local && !absente
          ? <img src={`/signatures/${local}.jpg`} alt="Votre bannière de signature" onError={() => setAbsente(true)} className="block w-full max-w-[500px] rounded-[8px]" />
          : <p className="m-0 text-[13.5px] text-ardoise">Pas encore de bannière pour {email || "cette adresse"} : demandez-la à Jules.</p>}
      </Reglage>
    </section>
  );
}

export default function Personnalisation() {
  const user = useUser();
  const { prefs, changer, etat, connecte } = usePersonnalisation();
  const [portraitsGrands, setPortraitsGrands] = useState(false);
  const admin = user?.role === "admin";
  // La vue client (un client, ou un admin qui regarde comme lui) : pas de page
  // d'ouverture, d'entrées de menu ni de bulle d'assistant, et tout dans une
  // seule carte.
  // Un admin en Vue Client ou en Vue Mandataire règle comme un client : pas
  // d'éditeur du menu admin ni de réglages de l'assistant dans ces vues.
  const vueClient = !admin || vueDe(user) !== "admin";
  // Le mandataire (ou l'admin en Vue Mandataire) a la page large de l'équipe :
  // ses réglages à gauche, ses habilitations à droite, là où l'admin a l'assistant.
  const vueMandataire = vueDe(user) === "mandataire";
  // « Choisir les communes » (onglet Agent IA) arrive sur #agent.
  useEffect(() => {
    if (!vueMandataire || window.location.hash !== "#agent") return undefined;
    const t = setTimeout(() => document.getElementById("agent")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [vueMandataire]);
  const large = !vueClient || vueMandataire;
  // Les sections de la page, selon qui regarde. Simplifiée le 25 nov. 2026 (Jules : « simplifier au maximum ») : à
  // gauche ce qui est à la personne (Profil, Mails, Apparence, et Suivi pour les admins, « à la place d'Assistant, c'est
  // important pour les admins ») ; à droite les outils de qui gère les accès. Les réglages retirés (fond, barre, halo,
  // points, surfaces, transparence, police, boutons, animations, page d'ouverture, menu, bulle, personnage) gardent
  // la valeur que chacun avait ; l'onglet Assistant est caché, prêt à revenir (HAKA_VISIBLE).
  const suiviOuvert = admin && !vueClient && !vueMandataire && !(user?.pages_fermees || []).includes("Monitoring");
  const sections = [
    ["profil", "Profil", true],
    ["agent", "Mes villes", vueMandataire],
    ["mails", "Mails", admin && !vueClient],
    ["apparence", "Apparence", true],
    ["haka", "Assistant", HAKA_VISIBLE && !vueClient],
    ["habilitations", "Habilitations", vueMandataire],
    ["suivi", "Suivi", suiviOuvert],
  ].filter((x) => x[2]);
  const outils = [
    ["acces", "Accès de l'équipe", !vueClient && !!user?.gere_les_acces],
    // Les compétences de Haka (17 oct. 2026) : Jules seul les écrit et les publie.
    ["competences", "Compétences", !vueClient && !!user?.gere_les_acces],
    // L'import des fiches (22 nov. 2026, Jules) : remplir les fiches avant que l'équipe s'en serve.
    ["import", "Import des fiches", !vueClient && !vueMandataire && !!user?.gere_les_acces],
    // Les sources de la boîte à outils de Haka (18 oct. 2026, lot 1) : interrupteurs, poids, entrepôt.
    ["sources", "Sources", !vueClient && !vueMandataire && !!user?.gere_les_acces],
  ].filter((x) => x[2]);
  const navigate = useNavigate();
  const [sectionBrute, setSection] = useState(() => { try { const h = typeof window !== "undefined" ? window.location.hash.slice(1) : ""; return h || localStorage.getItem("compte.section") || "profil"; } catch { return "profil"; } });
  // Une section demandée par l'adresse (#mails, #apparence…, 25 nov. 2026 : le menu du profil en haut à droite y mène).
  useEffect(() => {
    const suivre = () => { const h = window.location.hash.slice(1); if (h) setSection(h); };
    window.addEventListener("hashchange", suivre);
    return () => window.removeEventListener("hashchange", suivre);
  }, []);
  const section = [...sections, ...outils].some(([k]) => k === sectionBrute && k !== "suivi") ? sectionBrute : "profil";
  // Suivi ouvre sa page (Usage, Appels, Réunion, Corrections) ; les autres onglets restent ici.
  const choisir = (k) => {
    if (k === "suivi") { navigate(createPageUrl("Monitoring")); return; }
    setSection(k);
    try { localStorage.setItem("compte.section", k); } catch { /* navigation privée */ }
  };
  const theme = themeEffectif(prefs);
  const etatMot = !connecte ? "Sur cet appareil seulement" : etat === "enregistrement" ? "Enregistrement…" : etat === "erreur" ? "Pas enregistré : le serveur n'a pas répondu" : "Enregistré sur votre compte";

  return (
    // L'équipe et les mandataires (9 nov. 2026, Jules) : la largeur des autres pages, chaque bloc dans un cadre à 12 px, le fond de la page dedans.
    <div className={`mx-auto w-full px-5 ${large ? "max-w-[1500px] py-[22px] md:px-8 [&_section]:!rounded-[12px] [&_section]:!border [&_section]:!border-trait [&_section]:!bg-transparent [&_section]:!bg-none [&_section.k-grid]:before:!hidden [&_section.k-grid]:after:!hidden md:[&_input:not([type=checkbox]):not([type=color]):not([type=range]):not([type=file])]:!h-8 md:[&_input]:!text-[13.5px]" : `py-8 md:px-6 md:py-10 ${large ? "max-w-[1100px]" : "max-w-[980px]"}`}`}>
      {large ? (
        <TitrePage titre="Paramètres" className="mb-3.5 md:!pr-[112px]" actions={<span className={`text-[13px] ${etat === "erreur" ? "text-alerte" : "text-ardoise"}`}>{etatMot}</span>} />
      ) : (
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Paramètres</h1>
          <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.6] text-craie">Votre profil, puis vos réglages. Tout s'applique tout de suite, et vous suit d'un appareil à l'autre.</p>
        </div>
        <span className={`text-[12.5px] ${etat === "erreur" ? "text-alerte" : "text-brume"}`}>{etatMot}</span>
      </header>
      )}

      {/* Les sections en onglets (9 oct. 2026) : on va droit à la bonne, sans faire défiler toute la page. */}
      {/* Tout à droite, Modèles et Suivi (14 nov. 2026, Jules : « dans Paramètres, un onglet tout à droite pour Suivi, un
          autre pour Modèles ») : ils ouvrent leur page ; Intelligence et Automatismes aussi, pour qui les a. */}
      {large ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Filtres label="Sections du compte" valeur={section} onChange={choisir} options={sections.map(([k, mot]) => [k, mot])} />
          {/* À droite, les outils de qui gère les accès : ses sections, puis Modèles, Intelligence, Automatismes et le mode
              téléphone (25 nov. 2026). */}
          {(outils.length > 0 || (admin && !vueClient && !vueMandataire && !!user?.gere_les_acces)) && (
            <div className="flex flex-wrap gap-0.5">
              {outils.map(([k, mot]) => (
                <button key={k} type="button" onClick={() => choisir(k)} aria-pressed={section === k}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-[13px] transition-colors ${section === k ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`}
                  style={section === k ? undefined : { background: "transparent" }}>{mot}</button>
              ))}
              {admin && !vueClient && !vueMandataire && !!user?.gere_les_acces && GROUPE_PARAMETRES.entrees.filter((e) => !["Personnalisation", "Monitoring"].includes(e.cle) && !masquesDe(user?.email).includes(e.cle) && !(user?.pages_fermees || []).includes(e.cle))
                .map((e) => (
                  <Link key={e.cle} to={createPageUrl(e.cle)} onMouseEnter={() => prechargerAuSurvol(e.cle)} onFocus={() => prechargerAuSurvol(e.cle)} className="inline-flex h-8 items-center rounded-full px-3 text-[13px] text-craie transition-colors hover:bg-relief hover:text-encre">{e.label}</Link>
                ))}
              {!!user?.gere_les_acces && !estApercuTelephone() && (
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("klocka:mode-telephone", { detail: { depart: createPageUrl("Dashboard") } }))} title="L'application comme sur un téléphone, depuis cet ordinateur"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-craie transition-colors hover:bg-relief hover:text-encre max-md:hidden" style={{ background: "transparent" }}>
                  <Smartphone className="h-3.5 w-3.5" />Mode téléphone
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
      <nav className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sections du compte">
        {sections.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => choisir(k)} aria-pressed={section === k}
            className={`inline-flex h-9 flex-none items-center rounded-full border-0 px-4 text-[14px] transition-colors ${section === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
            style={section === k ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
      </nav>
      )}

      <div key={section} className="duration-300 animate-in fade-in-0">
      {/* Qui vous êtes : photo, nom, mot de passe ; pour un mandataire, ses documents. */}
      {section === "profil" && <ProfilCompte user={user} partie={vueMandataire ? "haut" : "tout"} />}
      {section === "profil" && admin && !vueClient && <SignatureMails email={user?.email} />}

      {/* Jules seul : qui, parmi les admins, ouvre quelles pages. */}
      {section === "acces" && <AccesAdmins />}

      {/* Le mandataire : ses villes (6 nov. 2026, Jules), les mêmes que la pilule Villes de la Prospection. */}
      {section === "agent" && (
        <section id="agent" className="scroll-mt-6 rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
          <p className={`${etiq} pt-4`}>Mes villes</p>
          <Reglage titre="Où vous prospectez" note="Vos clients qui cherchent dans ces villes s'affichent dans la Prospection. Une ville ajoutée se prépare en fond.">
            <ListeVilles vide="Aucune ville encore." />
          </Reglage>
        </section>
      )}

      {section === "apparence" && (
      <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
        <Reglage titre="Mode" note="Sombre, clair, ou celui de l'appareil, qui change avec lui.">
          <Pilules valeur={prefs.mode} options={OPTIONS.mode} onChoisir={(v) => changer({ mode: v })} />
        </Reglage>
        {/* Côté mandataire, l'accent est celui de K Partners : rien à choisir (31 oct. 2026, Jules). */}
        {!vueMandataire && (
          <Reglage titre="Couleur d'accent" note="Boutons, liens, états actifs et pastilles. En clair, la teinte descend d'un cran pour rester lisible.">
            <ChoixAccent prefs={prefs} changer={changer} theme={theme} />
          </Reglage>
        )}
        <Reglage titre="Taille de l'interface" note="Tout grossit ou rétrécit d'un bloc, texte et espacements.">
          <Pilules valeur={prefs.taille} options={OPTIONS.taille} onChoisir={(v) => changer({ taille: v })} />
        </Reglage>
      </section>
      )}

      {/* Mails : la boîte qui envoie, puis ses modèles de mails après un appel (25 nov. 2026, réunis). */}
      {section === "mails" && (
        <section className="mb-5 rounded-[12px] border border-trait p-5">
          <p className="m-0 mb-1 text-[15px] text-encre">Boîtes mail connectées</p>
          <p className="m-0 mb-4 text-[13px] text-ardoise">Les mails de la plateforme partent de la boîte cochée. Un clic sur une autre en fait la boîte par défaut.</p>
          <BoiteMail enLigne />
        </section>
      )}
      {section === "mails" && <MesMails />}
      {section === "import" && <ImportFiches />}
      {section === "habilitations" && <ProfilCompte user={user} partie="habilitations" />}
      {section === "haka" && (
      <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
        <Reglage titre="Personnage de l'Assistant Klocka" note="Son portrait dans les chats.">
          <div className="flex flex-wrap items-center gap-3">
            {OPTIONS.personnage_haka.map(([v, mot]) => {
              const actif = prefs.personnage_haka === v;
              return (
                <button key={v} type="button" onClick={() => changer({ personnage_haka: v })} aria-pressed={actif} title={mot}
                  className={`flex flex-col items-center gap-1.5 rounded-[14px] border p-2.5 transition-colors ${actif ? "border-menthe bg-menthe/10" : "border-bord-doux hover:border-bord-vif"}`}
                  style={{ background: actif ? undefined : "transparent" }}>
                  <img src={PERSONNAGES_HAKA[v]} alt="" className="h-14 w-14 rounded-full object-cover" draggable={false} />
                  <span className="text-[12.5px] text-craie">{mot}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setPortraitsGrands(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
              <Maximize2 className="h-3.5 w-3.5" /> Voir en grand
            </button>
          </div>
        </Reglage>
        {/* Les portraits en grand (18 oct. 2026, Jules) : un clic en choisit un. */}
        <Dialog open={portraitsGrands} onOpenChange={setPortraitsGrands}>
          <DialogContent className="max-w-[880px]">
            <DialogHeader><DialogTitle>Personnage de l'Assistant Klocka</DialogTitle></DialogHeader>
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2">
              {OPTIONS.personnage_haka.map(([v, mot]) => {
                const actif = prefs.personnage_haka === v;
                return (
                  <button key={v} type="button" onClick={() => changer({ personnage_haka: v })} aria-pressed={actif}
                    className={`flex flex-col items-center gap-2 rounded-[16px] border p-3 transition-colors ${actif ? "border-menthe bg-menthe/10" : "border-bord-doux hover:border-bord-vif"}`}
                    style={{ background: actif ? undefined : "transparent" }}>
                    <img src={PERSONNAGES_HAKA[v]} alt={mot} className="aspect-square w-full rounded-full object-cover" draggable={false} />
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] text-encre">{actif && <Check className="h-3.5 w-3.5 text-menthe" />}{mot}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
        <Reglage titre="Longueur des réponses" note="Pour vous seul. Plus c'est court, moins Assistant Klocka coûte.">
          <Pilules valeur={prefs.haka_longueur} options={OPTIONS.haka_longueur} onChoisir={(v) => changer({ haka_longueur: v })} />
        </Reglage>
        <Reglage titre="Tableaux" note="Un petit tableau quand il dit les chiffres plus vite qu'une phrase, ou jamais.">
          <Pilules valeur={prefs.haka_tableaux} options={OPTIONS.haka_tableaux} onChoisir={(v) => changer({ haka_tableaux: v })} />
        </Reglage>
      </section>
      )}
      {section === "competences" && <Competences />}
      {section === "sources" && <Sources peutRegler={!!user?.gere_les_acces} />}
      </div>
    </div>
  );
}
