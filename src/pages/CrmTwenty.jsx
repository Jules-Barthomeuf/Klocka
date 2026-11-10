import React, { Suspense, createContext, lazy, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, CircleUser, Columns3, Copy, Download, ExternalLink, FileText, ListFilter, Loader2, Lock, Moon, MoreHorizontal, PanelLeft, Paperclip, Phone, Plus, Rows3, Search, Send, Settings2, Sun, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { montant } from "../../server/montants.js";
import { apercuAdmin } from "@/lib/vue";
import LogoKP from "@/components/mandataire/LogoKP";
import { CLASSES_STATUT, couleurStatut } from "@/lib/couleur-statut";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, definirCadreCrm, themeEffectif } from "@/lib/personnalisation";
import { useUser } from "@/components/providers/UserProvider";

// Des pages de Klocka dans le CRM (6 nov. 2026, Jules : « mets la page utilisateurs dans le CRM en gardant celle
// actuelle aussi », puis « fais pareil pour Mandataires ») : en bas de l'espace Klocka, pour l'équipe seule, et pas des
// tableaux de Twenty. Les comptes restent dans Klocka : ce sont les pages d'Administration, ouvertes ici.
// Le tableau de bord (la carte des clients de Twenty) et les fiches de Klocka d'un agent ou d'un client (6 nov. 2026).
const CarteClientsTwenty = lazy(() => import("@/components/crm/CarteClientsTwenty"));
const TiroirAgent = lazy(() => import("@/pages/Agents").then((m) => ({ default: m.TiroirAgent })));
// Inviter et Familles, en haut à droite d'Utilisateurs et de Clients, comme sur l'ancienne page (10 nov. 2026, Jules).
const ActionsComptes = lazy(() => import("@/components/crm/ActionsComptes"));
const FicheClient = lazy(() => import("@/pages/AdminClients").then((m) => ({ default: m.FicheClient })));
const AppelClient = lazy(() => import("@/components/clients/AppelClient"));
// Les tableaux de Twenty dont une ligne ouvre la fiche de Klocka (Relations), quand elle en a une.
const AVEC_FICHE_KLOCKA = new Set(["agentImmobilier", "clients"]);
const pageKlocka = (singulier, nom) => ({ singulier, nom, local: true, champs: [], vues: [], niveau: "local" });
// Utilisateurs n'est plus une page ouverte ici (6 nov. 2026, Jules : « la même structure que Clients ») : c'est un
// tableau que le serveur ajoute à l'espace Klocka (server/crm/utilisateurs.js), lu comme ceux de Twenty.
// Mandataires aussi, le même jour (« un tableau, chaque champ une colonne », server/crm/mandataires.js).
const PAGES_KLOCKA = [pageKlocka("tableau-de-bord", "Tableau de bord")];

// Twenty CRM dans Klocka (5 nov. 2026, Jules : « recrée Twenty et mets-le dans notre plateforme », puis « finis tout
// pour que ce soit le plus proche de ce qu'on a sur Twenty »). Twenty reste la base ; la page la lit et l'écrit par le
// serveur (server/crm/ecran.js), selon le rôle Twenty de chacun. À gauche les dossiers et les tableaux de la barre de
// Twenty ; au centre les vues du tableau en onglets (Tableau ou Kanban), les filtres, la recherche, le tableau en lignes
// où chaque case se corrige d'un clic, les cases à cocher et leur bandeau (Déplacer vers, Dupliquer, Supprimer) ; à
// droite la fiche, en onglets comme dans Twenty : Fiche (champs et fiches liées), Tâches, Notes, Fichiers. Un clic sur
// une adresse ouvre la fenêtre d'envoi : le mail part de la boîte Gmail de la personne.

const API = "/api/crm/ecran";
// L'espace mandataire (5 nov. 2026) : quand Jules regarde Klocka comme un mandataire, le CRM aussi (droits de K Partners).
// Un vrai mandataire l'est de toute façon côté serveur.
const ESPACE = () => (apercuAdmin() === "mandataire" ? "mandataire" : "");
const avecEspace = (chemin) => (ESPACE() ? `${chemin}${chemin.includes("?") ? "&" : "?"}espace=${ESPACE()}` : chemin);
const req = (methode, chemin, options) => base44.request(methode, avecEspace(chemin), options);
const dateFr = (iso, heure = false) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", ...(heure ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "");
const telFr = (t) => {
  if (!t?.primaryPhoneNumber) return "";
  const n = String(t.primaryPhoneNumber).replace(/\D/g, "");
  if ((t.primaryPhoneCallingCode || "+33") === "+33" && n.length === 9) return `0${n}`.replace(/(\d{2})(?=\d)/g, "$1 ");
  return `${t.primaryPhoneCallingCode || ""} ${n}`.trim();
};
const NUMERIQUES = ["NUMBER", "CURRENCY", "DATE", "DATE_TIME", "RATING"];
const SANS_NOM = { type: "TEXT" };
// Les membres de l'équipe dans Twenty : le choix d'un champ Personnes (SPOC…).
const Membres = createContext([]);
// Les personnes qu'on choisit dans un SPOC : nom affiché, valeur écrite (nom Monday), membre Twenty (sa photo).
const Spoc = createContext([]);

/** Ce qu'une case affiche, selon le type du champ dans Twenty. */
function affiche(c, v, liens = {}) {
  if (v == null || v === "") return "";
  switch (c.type) {
    case "SELECT": return c.options.find((o) => o.valeur === v)?.libelle || v;
    case "MULTI_SELECT": return (v || []).map((x) => c.options.find((o) => o.valeur === x)?.libelle || x).join(", ");
    case "DATE": case "DATE_TIME": return dateFr(v);
    case "BOOLEAN": return v ? "Oui" : "Non";
    case "EMAILS": return v.primaryEmail || "";
    case "PHONES": return telFr(v);
    case "LINKS": return String(v.primaryLinkUrl || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    case "CURRENCY": return v.amountMicros == null ? "" : montant(v.amountMicros / 1e6);
    case "FULL_NAME": return [v.firstName, v.lastName].filter(Boolean).join(" ");
    case "ADDRESS": return [v.addressCity || v.addressStreet1, v.addressCountry].filter(Boolean).join(", ");
    case "RICH_TEXT": case "RICH_TEXT_V2": return typeof v === "string" ? v : v.markdown || "";
    case "RELATION": return liens[c.nom]?.[v] || "Fiche liée";
    default: return typeof v === "object" ? "" : String(v);
  }
}

/** La valeur à mettre dans le champ de saisie. */
function brut(c, v) {
  if (v == null) return c.type === "MULTI_SELECT" ? [] : "";
  switch (c.type) {
    case "EMAILS": return v.primaryEmail || "";
    case "PHONES": return telFr(v);
    case "LINKS": return v.primaryLinkUrl || "";
    case "CURRENCY": return v.amountMicros == null ? "" : String(v.amountMicros / 1e6);
    case "FULL_NAME": return [v.firstName, v.lastName].filter(Boolean).join(" ");
    case "DATE": return String(v).slice(0, 10);
    case "DATE_TIME": { const d = new Date(v); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
    case "MULTI_SELECT": return Array.isArray(v) ? v : [];
    // Une adresse se corrige en « rue, code postal ville » (8 nov. 2026) : le serveur la redécoupe.
    case "ADDRESS": return [v.addressStreet1, [v.addressPostcode, v.addressCity].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    default: return typeof v === "object" ? "" : String(v);
  }
}

const ligneMenu = "block w-full truncate rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-encre hover:bg-relief";
const pilule = (actif) => `h-8 rounded-full border px-3.5 text-[13px] ${actif ? "border-transparent bg-relief text-encre" : "border-trait text-ardoise hover:text-craie"}`;

/** Une petite fenêtre posée sous son déclencheur ; un clic ailleurs ou Échap la ferme. */
function Flottant({ ancre, onFermer, largeur = 280, children }) {
  const boite = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const r = ancre?.getBoundingClientRect();
    if (!r) return;
    const gauche = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8));
    setPos(window.innerHeight - r.bottom > 320 ? { left: gauche, top: r.bottom + 6 } : { left: gauche, bottom: window.innerHeight - r.top + 6 });
  }, [ancre, largeur]);
  useEffect(() => {
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target) && !ancre?.contains(e.target)) onFermer(); };
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    document.addEventListener("pointerdown", dehors); document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", dehors); document.removeEventListener("keydown", echap); };
  }, [ancre, onFermer]);
  if (!pos) return null;
  return createPortal(
    <div ref={boite} data-crm-dehors="" style={{ ...pos, width: largeur }} className="fixed z-[90] max-h-[60vh] overflow-y-auto rounded-[14px] border border-trait bg-surface-pleine p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.28)]">{children}</div>,
    document.body,
  );
}

/** Le choix d'une fiche liée : une recherche dans le tableau cible. */
function ChoixLien({ c, onChoisir }) {
  const [texte, setTexte] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(texte), 250); return () => clearTimeout(t); }, [texte]);
  const { data, isFetching } = useQuery({ queryKey: ["crm-chercher", c.cible, q], queryFn: () => req("GET", `${API}/${c.cible}/chercher?q=${encodeURIComponent(q)}`) });
  return (
    <div>
      <input autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Chercher" className="mb-1 h-9 w-full rounded-[10px] border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
      {isFetching && !data && <p className="m-0 px-2 py-2 text-[13px] text-brume">…</p>}
      <button type="button" onClick={() => onChoisir("")} className={`${ligneMenu} text-ardoise`} style={{ background: "transparent" }}>Aucune</button>
      {(data?.fiches || []).map((f) => <button key={f.id} type="button" onClick={() => onChoisir(f.id)} className={ligneMenu} style={{ background: "transparent" }}>{f.nom}</button>)}
    </div>
  );
}

/** La tête d'une personne de l'équipe (SPOC…) : sa photo de Twenty CRM, ou ses initiales sur la couleur d'accent. Le nom
 *  peut être celui de Monday (« JulesB ») : les alias des membres le retrouvent. */
function Tete({ nom, className = "", taille = "h-7 w-7 text-[11px]" }) {
  const membres = useContext(Membres);
  const [sansPhoto, setSansPhoto] = useState(false);
  const norme = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();
  const choix = useContext(Spoc).find((p) => norme(p.nom) === norme(nom) || norme(p.valeur) === norme(nom));
  const m = membres.find((x) => x.id === choix?.membre) || membres.find((x) => (x.alias || [x.nom]).some((a) => norme(a) === norme(nom)));
  const initiales = String(choix?.nom || m?.nom || nom || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  if (m && !sansPhoto) return <img src={`/api/crm/ecran-photo/${m.id}`} alt={nom} title={choix?.nom || nom} onError={() => setSansPhoto(true)} className={`${taille} rounded-full object-cover ${className}`} />;
  return <span title={nom} className={`grid ${taille} place-items-center rounded-full bg-menthe font-medium text-sur-menthe ${className}`}>{initiales}</span>;
}

/** Le contenu d'une fenêtre de saisie, selon le type du champ ; `onFini(valeur)` enregistre, `onFini()` annule. */
function Saisie({ c, valeur, onFini }) {
  const [texte, setTexte] = useState(brut(c, valeur));
  const membres = useContext(Membres);
  const spoc = useContext(Spoc);
  if (c.type === "RELATION") return <ChoixLien c={c} onChoisir={(id) => onFini(id)} />;
  if (c.personnes) {
    // Comme le champ Personnes de Twenty : on coche les gens de l'équipe, chacun avec sa tête ; seuls ceux que Jules a
    // choisis sont proposés (crm/equipe.json, 5 nov. 2026). Le texte garde leur nom Monday, que la synchro relie.
    const noms = String(texte || "").split(",").map((x) => x.trim()).filter(Boolean);
    const norme = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();
    const alias = (p) => [p.nom, p.valeur, ...(membres.find((m) => m.id === p.membre)?.alias || [])].map(norme);
    const coche = (p) => noms.some((n) => alias(p).includes(norme(n)));
    const basculer = (p) => setTexte((coche(p) ? noms.filter((n) => !alias(p).includes(norme(n))) : [...noms, p.valeur]).join(", "));
    return (
      <div>
        {spoc.map((p) => (
          <button key={p.valeur} type="button" onClick={() => basculer(p)} className={`${ligneMenu} flex items-center justify-between gap-2`} style={{ background: "transparent" }}>
            <span className="flex min-w-0 items-center gap-2.5"><Tete nom={p.valeur} className="flex-none" /><span className="truncate">{p.nom}</span></span>
            {coche(p) && <Check className="h-3.5 w-3.5 flex-none text-menthe" />}
          </button>
        ))}
        <div className="flex justify-end p-1"><button type="button" onClick={() => onFini(noms.join(", "))} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe">Valider</button></div>
      </div>
    );
  }
  if (c.type === "SELECT") {
    return (
      <div>
        <button type="button" onClick={() => onFini("")} className={`${ligneMenu} text-ardoise`} style={{ background: "transparent" }}>Aucun</button>
        {c.options.map((o) => (
          <button key={o.valeur} type="button" onClick={() => onFini(o.valeur)} className={`${ligneMenu} flex items-center justify-between`} style={{ background: "transparent" }}>
            {o.libelle}{valeur === o.valeur && <Check className="h-3.5 w-3.5 text-menthe" />}
          </button>
        ))}
      </div>
    );
  }
  if (c.type === "MULTI_SELECT") {
    const choisis = Array.isArray(texte) ? texte : [];
    return (
      <div>
        {c.options.map((o) => {
          const pris = choisis.includes(o.valeur);
          return (
            <button key={o.valeur} type="button" onClick={() => setTexte(pris ? choisis.filter((x) => x !== o.valeur) : [...choisis, o.valeur])} className={`${ligneMenu} flex items-center justify-between`} style={{ background: "transparent" }}>
              {o.libelle}{pris && <Check className="h-3.5 w-3.5 text-menthe" />}
            </button>
          );
        })}
        <div className="flex justify-end p-1"><button type="button" onClick={() => onFini(choisis)} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe">Valider</button></div>
      </div>
    );
  }
  if (c.type === "BOOLEAN") {
    return [true, false].map((v) => <button key={String(v)} type="button" onClick={() => onFini(v)} className={ligneMenu} style={{ background: "transparent" }}>{v ? "Oui" : "Non"}</button>);
  }
  const long = c.type === "TEXT" && String(texte).length > 60;
  const Tag = long ? "textarea" : "input";
  return (
    <div className="p-0.5">
      <Tag autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} rows={long ? 6 : undefined} aria-label={c.libelle}
        type={long ? undefined : c.type === "DATE" ? "date" : c.type === "DATE_TIME" ? "datetime-local" : "text"}
        inputMode={c.type === "NUMBER" || c.type === "CURRENCY" ? "decimal" : undefined}
        onKeyDown={(e) => { if (e.key === "Enter" && (!long || e.metaKey || e.ctrlKey)) { e.preventDefault(); onFini(texte); } if (e.key === "Escape") onFini(); }}
        className="block w-full resize-none rounded-[10px] border border-bord-doux bg-surface px-3 py-2 text-[14px] text-encre outline-none max-md:text-[16px]" />
      <p className="m-0 px-1 pt-1.5 text-[12px] text-brume">{long ? "Cmd + Entrée enregistre" : "Entrée enregistre"} · Échap annule</p>
    </div>
  );
}

/** Une valeur qui se corrige d'un clic : la fenêtre de saisie s'ouvre dessous. */
function Corrigeable({ c, valeur, liens, onEnregistrer, onMail, className = "", children }) {
  const [ouvert, setOuvert] = useState(false);
  const ancre = useRef(null);
  const fini = (v) => { setOuvert(false); if (v !== undefined) onEnregistrer(c.nom, v); };
  const vu = affiche(c, valeur, liens);
  const lien = vu && (c.type === "EMAILS" ? { onClick: (e) => { e.stopPropagation(); onMail?.(vu); } }
    : c.type === "PHONES" ? { href: `tel:${vu.replace(/\s/g, "")}` } : c.type === "LINKS" ? { href: valeur.primaryLinkUrl, target: "_blank", rel: "noreferrer" } : null);
  return (
    <>
      <div ref={ancre} role={c.modifiable ? "button" : undefined} tabIndex={c.modifiable ? 0 : undefined}
        onClick={(e) => { if (!c.modifiable) return; e.stopPropagation(); setOuvert(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && c.modifiable) setOuvert(true); }}
        className={`${c.modifiable ? "cursor-pointer hover:bg-relief/50" : ""} ${className}`}>
        {children ? children(vu, lien) : vu}
      </div>
      {ouvert && <Flottant ancre={ancre.current} onFermer={() => setOuvert(false)} largeur={c.type === "TEXT" ? 360 : 280}><Saisie c={c} valeur={valeur} onFini={fini} /></Flottant>}
    </>
  );
}


/**
 * Un mail, un téléphone, un lien dans une case (8 nov. 2026, Jules : « on doit pouvoir modifier les adresses mail, les
 * numéros, vraiment tout ») : le texte s'ouvre en saisie au clic, comme toute case ; la petite icône à côté écrit le mail,
 * appelle ou ouvre le lien.
 */
function ValeurAction({ vu, lien, type }) {
  const Icone = type === "EMAILS" ? Send : type === "PHONES" ? Phone : ExternalLink;
  const mot = type === "EMAILS" ? "Écrire un mail" : type === "PHONES" ? "Appeler" : "Ouvrir le lien";
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1.5">
      <span className="min-w-0 truncate text-encre">{vu}</span>
      {lien?.onClick
        ? <button type="button" onClick={lien.onClick} aria-label={mot} title={mot} className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-menthe" style={{ background: "transparent" }}><Icone className="h-3.5 w-3.5" /></button>
        : lien ? <a {...lien} onClick={(e) => e.stopPropagation()} aria-label={mot} title={mot} className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-menthe"><Icone className="h-3.5 w-3.5" /></a> : null}
    </span>
  );
}

/** La fenêtre d'envoi d'un mail, en bas à droite, comme dans Twenty : À, Objet, le texte, les Modèles, Envoyer. */
function EnvoiMail({ envoi, onFermer }) {
  const queryClient = useQueryClient();
  const [a, setA] = useState(envoi.a || "");
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [modele, setModele] = useState(null);
  const [choix, setChoix] = useState(false);
  const bouton = useRef(null);
  const { data } = useQuery({ queryKey: ["crm-modeles"], queryFn: () => req("GET", "/api/crm/ecran-modeles"), staleTime: 300_000 });
  const nom = envoi.nom || "";
  const remplir = (t) => String(t || "").replaceAll("{prénom}", nom.split(/\s+/)[0] || "").replaceAll("{nom}", nom);
  const partir = useMutation({
    mutationFn: () => req("POST", `${API}/${envoi.objet}/${envoi.id}/mail`, { body: { a, objet, corps, modele } }),
    onSuccess: (r) => { toast.success(`Mail parti de ${r.expediteur}`); queryClient.invalidateQueries({ queryKey: ["crm-fiche", envoi.objet, envoi.id] }); onFermer(); },
    onError: (e) => toast.error(e?.message || "Envoi refusé"),
  });
  const brouillon = objet.trim() || corps.trim();
  return createPortal(
    <div data-crm-dehors="" className="fixed bottom-4 right-4 z-[85] flex w-[440px] max-w-[calc(100vw-32px)] flex-col rounded-[16px] border border-trait bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.3)] max-md:inset-x-2 max-md:bottom-2 max-md:w-auto">
      <div className="flex items-center justify-between gap-3 border-b border-trait px-4 py-3">
        <p className="m-0 truncate text-[15px] text-encre">{nom ? `E-mail à ${nom}` : "Nouvel e-mail"}</p>
        <button type="button" onClick={() => { if (!brouillon || window.confirm("Jeter ce brouillon ?")) onFermer(); }} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      {[["À", a, setA], ["Objet", objet, setObjet]].map(([mot, v, set]) => (
        <label key={mot} className="flex items-center gap-3 border-b border-trait px-4 py-2">
          <span className="w-12 flex-none text-[13px] text-ardoise">{mot}</span>
          <input value={v} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-encre outline-none max-md:text-[16px]" />
        </label>
      ))}
      <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={9} placeholder="Votre message" className="block w-full resize-none border-none bg-transparent px-4 py-3 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
      <div className="flex items-center justify-between gap-3 border-t border-trait px-3 py-2.5">
        <button ref={bouton} type="button" onClick={() => setChoix((x) => !x)} className="inline-flex h-9 max-w-[60%] items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
          <FileText className="h-3.5 w-3.5 flex-none" /><span className="truncate">{modele || "Modèles"}</span><ChevronDown className="h-3.5 w-3.5 flex-none" />
        </button>
        <button type="button" disabled={!a.trim() || partir.isPending || !brouillon} onClick={() => partir.mutate()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe disabled:opacity-40">
          {partir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Envoyer
        </button>
      </div>
      {choix && (
        <Flottant ancre={bouton.current} onFermer={() => setChoix(false)} largeur={320}>
          {!(data?.modeles || []).length ? <p className="m-0 px-2 py-2 text-[13px] text-brume">Aucun modèle : ajoutez-en dans Modèles.</p>
            : data.modeles.map((m) => (
              <button key={m.id} type="button" onClick={() => { if (brouillon && !window.confirm("Remplacer l'objet et le texte par ce modèle ?")) return; setModele(m.nom); setObjet(remplir(m.objet)); setCorps(remplir(m.corps)); setChoix(false); }} className="block w-full rounded-[8px] px-2.5 py-2 text-left hover:bg-relief" style={{ background: "transparent" }}>
                <span className="block truncate text-[13.5px] text-encre">{m.nom}</span>
                {m.objet && <span className="block truncate text-[12.5px] text-ardoise">{m.objet}</span>}
              </button>
            ))}
        </Flottant>
      )}
    </div>,
    document.body,
  );
}

/** Supprimer avec « Annuler » : la fiche part à la corbeille de Twenty, l'avis la remet. */
function useSupprimer(objet, apres) {
  const queryClient = useQueryClient();
  const relire = () => queryClient.invalidateQueries({ queryKey: ["crm-page", objet?.singulier] });
  return useMutation({
    mutationFn: (ids) => req("POST", `${API}/${objet.singulier}/lot`, { body: { action: "supprimer", ids } }).then(() => ids),
    onSuccess: (ids) => {
      relire(); apres?.();
      toast.success(ids.length > 1 ? `${ids.length} fiches supprimées` : "Fiche supprimée", {
        action: { mot: "Annuler", faire: () => req("POST", `${API}/${objet.singulier}/lot`, { body: { action: "restaurer", ids } }).then(relire).catch((e) => toast.error(e?.message || "Restauration impossible")) },
      });
    },
    onError: (e) => toast.error(e?.message || "Suppression refusée"),
  });
}

/** La fiche d'une ligne, à droite (au téléphone, par-dessus la page), en onglets comme dans Twenty. */
function Fiche({ objet, objets, id, onFermer, onOuvrir, onMail }) {
  const queryClient = useQueryClient();
  const cle = ["crm-fiche", objet.singulier, id];
  const { data, isLoading, isError, error } = useQuery({ queryKey: cle, queryFn: () => req("GET", `${API}/${objet.singulier}/${id}`), staleTime: 30_000 });
  const [onglet, setOnglet] = useState("fiche");
  const [note, setNote] = useState("");
  const [tache, setTache] = useState("");
  const [echeance, setEcheance] = useState("");
  const plein = objet.niveau === "plein";
  const maj = (fn) => queryClient.setQueryData(cle, (d) => (d ? fn(d) : d));
  const changer = useMutation({
    mutationFn: ({ champ, valeur }) => req("PATCH", `${API}/${objet.singulier}/${id}`, { body: { champ, valeur } }),
    onSuccess: (r) => { maj((d) => ({ ...d, fiche: r.fiche, liens: { ...d.liens, ...r.liens } })); queryClient.invalidateQueries({ queryKey: ["crm-page", objet.singulier] }); },
    onError: (e) => toast.error(e?.message || "Twenty a refusé la modification"),
  });
  const noter = useMutation({
    mutationFn: () => req("POST", `${API}/${objet.singulier}/${id}/notes`, { body: { texte: note } }),
    onSuccess: (r) => { setNote(""); maj((d) => ({ ...d, notes: [r.note, ...d.notes] })); },
    onError: (e) => toast.error(e?.message || "Note refusée"),
  });
  const ajouterTache = useMutation({
    mutationFn: () => req("POST", `${API}/${objet.singulier}/${id}/taches`, { body: { titre: tache, echeance: echeance || null } }),
    onSuccess: (r) => { setTache(""); setEcheance(""); maj((d) => ({ ...d, taches: [r.tache, ...d.taches] })); },
    onError: (e) => toast.error(e?.message || "Tâche refusée"),
  });
  const cocher = useMutation({
    mutationFn: ({ tacheId, faite }) => req("PATCH", `/api/crm/ecran-taches/${tacheId}`, { body: { faite } }),
    onMutate: ({ tacheId, faite }) => maj((d) => ({ ...d, taches: d.taches.map((t) => (t.id === tacheId ? { ...t, statut: faite ? "DONE" : "TODO" } : t)) })),
    onError: (e) => toast.error(e?.message || "Tâche non modifiée"),
  });
  const ajouterLiee = useMutation({
    mutationFn: (l) => req("POST", `${API}/${l.cible}`, { body: { nom: "", valeurs: { [l.cle]: id } } }).then((r) => ({ l, r })),
    onSuccess: ({ l, r }) => onOuvrir(l.cible, r.fiche.id),
    onError: (e) => toast.error(e?.message || "Création refusée"),
  });
  const supprimer = useSupprimer(objet, onFermer);
  const histo = useQuery({ queryKey: ["crm-historique", objet.singulier, id], queryFn: () => req("GET", `${API}/${objet.singulier}/${id}/historique`), enabled: onglet === "historique" });
  const choixFichier = useRef(null);
  const deposer = useMutation({
    mutationFn: async (fichiers) => {
      const deposes = [];
      for (const fi of fichiers) {
        const fd = new FormData();
        fd.append("fichier", fi);
        deposes.push((await req("POST", `${API}/${objet.singulier}/${id}/fichiers`, { body: fd })).piece);
      }
      return deposes;
    },
    onSuccess: (deposes) => { maj((d) => ({ ...d, pieces: [...deposes, ...d.pieces] })); toast.success(deposes.length > 1 ? `${deposes.length} fichiers déposés` : "Fichier déposé"); },
    onError: (e) => toast.error(e?.message || "Dépôt refusé"),
  });
  const f = data?.fiche;
  const champNom = objet.champs.find((c) => c.nom === objet.principal);
  const nom = f ? affiche(champNom || SANS_NOM, f[objet.principal]) : "";
  const ouvertes = data?.taches?.filter((t) => t.statut !== "DONE").length || 0;
  // Un tableau de Klocka (Utilisateurs) n'a ni historique, ni tâches, ni notes, ni fichiers dans Twenty.
  const ONGLETS = objet.klocka ? [["fiche", "Fiche"]] : [["fiche", "Fiche"], ["historique", "Historique"], ["taches", `Tâches${ouvertes ? ` ${ouvertes}` : ""}`], ["notes", `Notes${data?.notes?.length ? ` ${data.notes.length}` : ""}`], ["fichiers", `Fichiers${data?.pieces?.length ? ` ${data.pieces.length}` : ""}`]];
  const boiteSaisie = "mb-3 rounded-[12px] border border-trait bg-surface px-3 py-2 focus-within:border-bord-doux";
  // Au téléphone, la fiche passe par-dessus tout l'écran, barre de Klocka comprise : elle sort de la page (portail).
  const telephone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  // Un clic ailleurs ferme la fiche (8 nov. 2026, Jules : « on doit pouvoir cliquer ailleurs pour le fermer ») ; pas un clic
  // dans une petite fenêtre de saisie ou d'envoi, posées hors de la fiche (portails marqués data-crm-dehors).
  const cadre = useRef(null);
  useEffect(() => {
    const dehors = (e) => { if (cadre.current && !cadre.current.contains(e.target) && !e.target.closest?.("[data-crm-dehors], [role=\"alertdialog\"], [role=\"dialog\"], [role=\"menu\"]")) onFermer(); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [onFermer]);
  const panneau = (
    <motion.aside ref={cadre} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col overflow-hidden bg-rail shadow-[0_12px_40px_rgb(0_0_0/0.3)] max-md:fixed max-md:inset-0 max-md:z-[80] max-md:pt-[env(safe-area-inset-top)] md:absolute md:inset-y-0 md:right-0 md:z-20 md:w-[460px] md:border-l md:border-trait">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          {f && champNom?.modifiable ? (
            <Corrigeable c={champNom} valeur={f[objet.principal]} onEnregistrer={(champ, valeur) => changer.mutate({ champ, valeur })} className="-mx-1 rounded-[8px] px-1">
              {(vu) => <h2 className="m-0 truncate text-[20px] font-normal leading-[1.2] text-encre">{vu || "Sans nom"}</h2>}
            </Corrigeable>
          ) : <h2 className="m-0 truncate text-[20px] font-normal leading-[1.2] text-encre">{nom || (isLoading ? "…" : "Sans nom")}</h2>}
          <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{objet.nom_un}{objet.niveau === "lecture" ? " · en lecture" : ""}</p>
        </div>
        <span className="flex flex-none items-center gap-1">
          {plein && f && <button type="button" onClick={() => supprimer.mutate([id])} aria-label="Supprimer la fiche" title="Supprimer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-4 w-4" /></button>}
          <button type="button" onClick={onFermer} aria-label="Fermer la fiche" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </span>
      </div>
      <div role="tablist" className="mt-3 flex gap-1 overflow-x-auto border-b border-trait px-4">
        {ONGLETS.map(([k, mot]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}
            className={`-mb-px flex-none whitespace-nowrap border-b-2 px-2.5 pb-2.5 pt-1 text-[13.5px] ${onglet === k ? "border-encre text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
        {isLoading && <Chargement />}
        {isError && <p className="m-0 mt-4 text-[13.5px] text-alerte">{error?.message || "Cette fiche ne se charge pas."}</p>}
        {f && onglet === "fiche" && (
          <>
            <dl className="m-0 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
              {objet.champs.filter((c) => c.nom !== objet.principal).map((c) => (
                <div key={c.nom} className="grid grid-cols-2 items-stretch border-t border-trait text-center first:border-t-0">
                  <dt className="flex items-center justify-center px-4 py-3 text-[13px] text-ardoise">{c.libelle}</dt>
                  <dd className="m-0 flex min-w-0 border-l border-bord-doux text-[14px] text-encre">
                    <Corrigeable c={c} valeur={f[c.nom]} liens={data.liens} onEnregistrer={(champ, valeur) => changer.mutate({ champ, valeur })} onMail={(a) => onMail({ a, objet: objet.singulier, id, nom })}
                      className="flex min-h-full min-w-0 flex-1 items-center justify-center px-4 py-3">
                      {(vu, lien) => (vu ? (
                        <span className="line-clamp-4 min-w-0 whitespace-pre-line break-words">
                          {c.type === "RELATION" && objets.some((o) => o.singulier === c.cible)
                            ? <button type="button" onClick={(e) => { e.stopPropagation(); onOuvrir(c.cible, f[c.nom]); }} className="text-encre underline decoration-trait underline-offset-2 hover:text-menthe" style={{ background: "transparent" }}>{vu}</button>
                            : (c.type === "EMAILS" || c.type === "PHONES" || c.type === "LINKS") ? <ValeurAction vu={vu} lien={lien} type={c.type} /> : vu}
                        </span>
                      ) : <span className="text-brume">{c.modifiable ? "À compléter" : "Vide"}</span>)}
                    </Corrigeable>
                  </dd>
                </div>
              ))}
            </dl>
            {(data.liees || []).map((l) => (
              <div key={l.nom} className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="m-0 text-[15px] text-encre">{l.libelle} <span className="text-[13px] text-ardoise">{l.fiches.length}</span></p>
                  {plein && objets.find((o) => o.singulier === l.cible)?.niveau === "plein" && (
                    <button type="button" onClick={() => ajouterLiee.mutate(l)} disabled={ajouterLiee.isPending} className="inline-flex h-8 items-center gap-1 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Ajouter</button>
                  )}
                </div>
                {!l.fiches.length ? <p className="m-0 text-[13.5px] text-brume">Aucune.</p> : (
                  <ul className="m-0 list-none overflow-hidden rounded-[12px] border border-bord-doux p-0">
                    {l.fiches.map((x) => (
                      <li key={x.id} className="border-t border-trait first:border-t-0">
                        <button type="button" onClick={() => onOuvrir(l.cible, x.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] text-encre hover:bg-relief" style={{ background: "transparent" }}>
                          <span className="truncate">{x.nom || "Sans nom"}</span><ExternalLink className="h-3.5 w-3.5 flex-none text-ardoise" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
        {f && onglet === "historique" && (histo.isLoading ? <Chargement /> : !(histo.data?.lignes || []).length ? <p className="m-0 text-[13.5px] text-brume">Rien encore.</p> : (
          <ol className="relative m-0 list-none p-0 pl-5">
            <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-trait" />
            {histo.data.lignes.map((l) => (
              <li key={l.id} className="relative pb-4">
                <span aria-hidden className="absolute -left-5 top-[7px] h-[11px] w-[11px] rounded-full border border-bord-vif bg-surface-pleine" />
                <p className="m-0 text-[14px] leading-[1.45] text-encre"><span className="text-craie">{l.qui}</span> {l.quoi}{l.lie ? <span className="text-ardoise"> « {l.lie} »</span> : null}</p>
                {l.changes.map((x) => {
                  const c = objet.champs.find((y) => y.nom === x.champ) || SANS_NOM;
                  const av = affiche(c, x.avant, data.liens); const ap = affiche(c, x.apres, data.liens);
                  return <p key={x.champ} className="m-0 mt-0.5 break-words text-[13px] text-ardoise">{x.libelle} : {av ? <span className="line-through decoration-trait">{av}</span> : "vide"} → <span className="text-craie">{ap || "vide"}</span></p>;
                })}
                <p className="m-0 mt-0.5 text-[12px] text-brume">{dateFr(l.le, true)}</p>
              </li>
            ))}
          </ol>
        ))}
        {f && onglet === "taches" && (
          <>
            {plein && (
              <div className={boiteSaisie}>
                <input value={tache} onChange={(e) => setTache(e.target.value)} placeholder="Nouvelle tâche" onKeyDown={(e) => { if (e.key === "Enter" && tache.trim()) ajouterTache.mutate(); }}
                  className="block w-full border-none bg-transparent py-1 text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="flex items-center gap-2 text-[12.5px] text-ardoise">Échéance<input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className="rounded-[8px] border border-trait bg-surface px-2 py-1 text-[13px] text-encre" /></label>
                  <button type="button" disabled={!tache.trim() || ajouterTache.isPending} onClick={() => ajouterTache.mutate()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe disabled:opacity-40">{ajouterTache.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Ajouter</button>
                </div>
              </div>
            )}
            {!data.taches.length ? <p className="m-0 text-[13.5px] text-brume">Aucune tâche.</p> : (
              <ul className="m-0 list-none p-0">
                {data.taches.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 border-b border-trait py-3 last:border-b-0">
                    <button type="button" onClick={() => cocher.mutate({ tacheId: t.id, faite: t.statut !== "DONE" })} aria-label={t.statut === "DONE" ? "Rouvrir la tâche" : "Marquer faite"}
                      className={`mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full border ${t.statut === "DONE" ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif hover:border-menthe"}`} style={t.statut === "DONE" ? undefined : { background: "transparent" }}>
                      {t.statut === "DONE" && <Check className="h-3 w-3" />}
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className={`block break-words text-[14px] ${t.statut === "DONE" ? "text-brume line-through" : "text-encre"}`}>{t.titre || "Sans titre"}</span>
                      <span className="block text-[12.5px] text-ardoise">{t.echeance ? `Pour le ${dateFr(t.echeance)}` : dateFr(t.le)}{t.statut === "IN_PROGRESS" ? " · en cours" : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {f && onglet === "notes" && (
          <>
            {plein && (
              <div className={boiteSaisie}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ajouter une note"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) noter.mutate(); }}
                  className="block w-full resize-none border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
                <div className="flex justify-end">
                  <button type="button" disabled={!note.trim() || noter.isPending} onClick={() => noter.mutate()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe disabled:opacity-40">{noter.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Noter</button>
                </div>
              </div>
            )}
            {!data.notes.length ? <p className="m-0 text-[13.5px] text-brume">Aucune note.</p> : (
              <ul className="m-0 list-none p-0">
                {data.notes.map((n) => (
                  <li key={n.id} className="border-b border-trait py-3 last:border-b-0">
                    <p className="m-0 text-[12.5px] text-ardoise">{dateFr(n.le, true)}</p>
                    <p className="m-0 mt-1 whitespace-pre-line break-words text-[14px] leading-[1.5] text-encre">{n.texte || n.titre}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {f && onglet === "fichiers" && plein && (
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const l = [...(e.dataTransfer.files || [])]; if (l.length) deposer.mutate(l); }}
            className="mb-3 flex items-center justify-between gap-3 rounded-[12px] border border-dashed border-bord-vif px-4 py-3">
            <span className="text-[13.5px] text-ardoise">Glissez des fichiers ici</span>
            <input ref={choixFichier} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; if (l.length) deposer.mutate(l); }} />
            <button type="button" onClick={() => choixFichier.current?.click()} disabled={deposer.isPending} className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
              {deposer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}Déposer
            </button>
          </div>
        )}
        {f && onglet === "fichiers" && (!data.pieces.length ? <p className="m-0 text-[13.5px] text-brume">Aucun fichier.</p> : (
          <ul className="m-0 list-none overflow-hidden rounded-[12px] border border-bord-doux p-0">
            {data.pieces.map((p) => (
              <li key={p.id} className="border-t border-trait first:border-t-0">
                <a href={p.url || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 text-[14px] text-encre hover:bg-relief">
                  <FileText className="h-4 w-4 flex-none text-ardoise" /><span className="min-w-0 flex-1 truncate">{p.nom}</span><span className="flex-none text-[12.5px] text-ardoise">{dateFr(p.le)}</span>
                </a>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </motion.aside>
  );
  return telephone ? createPortal(panneau, document.body) : panneau;
}

const OPERATEURS = {
  texte: [["contient", "contient"], ["ne_contient_pas", "ne contient pas"], ["vide", "est vide"], ["non_vide", "n'est pas vide"]],
  choix: [["parmi", "est"], ["hors", "n'est pas"], ["vide", "est vide"], ["non_vide", "n'est pas vide"]],
  nombre: [["sup", "au moins"], ["inf", "au plus"], ["vide", "est vide"], ["non_vide", "n'est pas vide"]],
  date: [["apres", "après le"], ["avant", "avant le"], ["vide", "est vide"], ["non_vide", "n'est pas vide"]],
  oui: [["est", "est"]],
  lien: [["non_vide", "est renseigné"], ["vide", "est vide"], ["moi", "c'est moi"]],
};
const familleDe = (c) => (["SELECT", "MULTI_SELECT"].includes(c.type) ? "choix" : ["NUMBER", "CURRENCY", "RATING"].includes(c.type) ? "nombre" : ["DATE", "DATE_TIME"].includes(c.type) ? "date" : c.type === "BOOLEAN" ? "oui" : c.type === "RELATION" ? "lien" : "texte");
const motFiltre = (c, f) => {
  const op = OPERATEURS[familleDe(c)].find(([k]) => k === f.op)?.[1] || f.op;
  const v = Array.isArray(f.valeur) ? f.valeur.map((x) => c.options.find((o) => o.valeur === x)?.libelle || x).join(", ")
    : f.op === "est" ? (f.valeur ? "Oui" : "Non") : ["avant", "apres"].includes(f.op) ? dateFr(f.valeur) : f.valeur ?? "";
  return `${c.libelle} ${op}${v !== "" ? ` ${v}` : ""}`;
};

/** Ajouter ou corriger un filtre : le champ, puis la condition et la valeur. */
function EditeurFiltre({ champs, depart = null, onValider }) {
  const [champ, setChamp] = useState(depart?.champ || null);
  const [op, setOp] = useState(depart?.op || null);
  const [valeur, setValeur] = useState(depart?.valeur ?? "");
  const [cherche, setCherche] = useState("");
  const c = champs.find((x) => x.nom === champ);
  if (!c) {
    const vus = champs.filter((x) => !["RICH_TEXT", "RICH_TEXT_V2"].includes(x.type) && x.libelle.toLowerCase().includes(cherche.toLowerCase()));
    return (
      <div>
        <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Filtrer par…" className="mb-1 h-9 w-full rounded-[10px] border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        {vus.map((x) => (
          <button key={x.nom} type="button" onClick={() => { const fam = familleDe(x); setChamp(x.nom); setOp(OPERATEURS[fam][0][0]); setValeur(fam === "choix" ? [] : fam === "oui" ? true : ""); }} className={ligneMenu} style={{ background: "transparent" }}>{x.libelle}</button>
        ))}
      </div>
    );
  }
  const sansValeur = ["vide", "non_vide", "moi"].includes(op);
  const choisis = Array.isArray(valeur) ? valeur : [];
  const fam = familleDe(c);
  return (
    <div className="p-1">
      <p className="m-0 px-1 pb-2 text-[13.5px] text-encre">{c.libelle}</p>
      <div className="mb-2 flex flex-wrap gap-1">
        {OPERATEURS[fam].map(([k, mot]) => <button key={k} type="button" onClick={() => setOp(k)} className={`h-7 rounded-full border px-2.5 text-[12.5px] ${op === k ? "border-transparent bg-relief text-encre" : "border-trait text-ardoise"}`} style={op === k ? undefined : { background: "transparent" }}>{mot}</button>)}
      </div>
      {!sansValeur && (fam === "choix" ? (
        <div className="max-h-[220px] overflow-y-auto">
          {c.options.map((o) => {
            const pris = choisis.includes(o.valeur);
            return <button key={o.valeur} type="button" onClick={() => setValeur(pris ? choisis.filter((x) => x !== o.valeur) : [...choisis, o.valeur])} className={`${ligneMenu} flex items-center justify-between py-1.5`} style={{ background: "transparent" }}>{o.libelle}{pris && <Check className="h-3.5 w-3.5 text-menthe" />}</button>;
          })}
        </div>
      ) : fam === "oui" ? (
        <div className="flex gap-1">{[true, false].map((v) => <button key={String(v)} type="button" onClick={() => setValeur(v)} className={`h-7 rounded-full border px-3 text-[12.5px] ${valeur === v ? "border-transparent bg-relief text-encre" : "border-trait text-ardoise"}`} style={valeur === v ? undefined : { background: "transparent" }}>{v ? "Oui" : "Non"}</button>)}</div>
      ) : (
        <input autoFocus value={valeur} onChange={(e) => setValeur(e.target.value)} type={fam === "date" ? "date" : "text"} inputMode={fam === "nombre" ? "decimal" : undefined}
          onKeyDown={(e) => { if (e.key === "Enter") onValider({ champ, op, valeur }); }}
          className="h-9 w-full rounded-[10px] border border-bord-doux bg-surface px-3 text-[14px] text-encre outline-none max-md:text-[16px]" />
      ))}
      <div className="flex justify-end pt-2"><button type="button" onClick={() => onValider({ champ, op, valeur: sansValeur ? null : valeur })} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe">Appliquer</button></div>
    </div>
  );
}

/** Une pastille de filtre : un clic la corrige, la croix la retire ; celles de la vue se lisent seulement. */
function PastilleFiltre({ c, f, champs, onChanger, onRetirer, deVue = false }) {
  const [ouvert, setOuvert] = useState(false);
  const ancre = useRef(null);
  return (
    <span ref={ancre} className={`inline-flex h-8 items-center gap-1 rounded-full border text-[13px] ${deVue ? "border-trait px-3 text-ardoise" : "border-menthe/40 bg-menthe/10 pl-3 pr-1 text-encre"}`}>
      {deVue ? <span className="max-w-[260px] truncate">{motFiltre(c, f)}</span> : (
        <>
          <button type="button" onClick={() => setOuvert(true)} className="max-w-[260px] truncate" style={{ background: "transparent" }}>{motFiltre(c, f)}</button>
          <button type="button" onClick={onRetirer} aria-label="Retirer le filtre" className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
        </>
      )}
      {ouvert && <Flottant ancre={ancre.current} onFermer={() => setOuvert(false)} largeur={300}><EditeurFiltre champs={champs} depart={f} onValider={(n) => { setOuvert(false); onChanger(n); }} /></Flottant>}
    </span>
  );
}

/** Le Kanban d'une vue : une colonne par option du choix, une carte par fiche ; une carte glissée change le choix. */
function Kanban({ objet, champ, fiches, liens, colonnes, onOuvrir, onChanger }) {
  const c = objet.champs.find((x) => x.nom === champ);
  const [survol, setSurvol] = useState(undefined);
  const groupes = [...c.options.map((o) => ({ valeur: o.valeur, libelle: o.libelle })), { valeur: null, libelle: "Sans valeur" }];
  const autres = colonnes.filter((n) => n !== objet.principal && n !== champ).slice(0, 3).map((n) => objet.champs.find((x) => x.nom === n)).filter(Boolean);
  const plein = objet.niveau === "plein";
  return (
    <div className="flex min-h-[60vh] gap-3 overflow-x-auto pb-4">
      {groupes.map((g) => {
        const cartes = fiches.filter((f) => (f[champ] ?? null) === g.valeur);
        if (g.valeur === null && !cartes.length) return null;
        return (
          <div key={g.valeur ?? "sans"} onDragOver={(e) => { if (plein) { e.preventDefault(); setSurvol(g.valeur); } }} onDragLeave={() => setSurvol(undefined)}
            onDrop={(e) => { setSurvol(undefined); const id = e.dataTransfer.getData("text/plain"); const avant = fiches.find((f) => f.id === id); if (id && (avant?.[champ] ?? null) !== g.valeur) onChanger(id, champ, g.valeur || ""); }}
            className={`flex w-[272px] flex-none flex-col rounded-[14px] border p-2 ${survol === g.valeur ? "border-menthe/50 bg-menthe/5" : "border-trait bg-rail"}`}>
            <p className="m-0 flex items-center justify-between px-2 pb-2 pt-1 text-[13.5px] text-encre">{g.libelle}<span className="text-[12.5px] tabular-nums text-ardoise">{cartes.length}</span></p>
            <div className="flex flex-col gap-2">
              {cartes.map((f) => (
                <button key={f.id} type="button" draggable={plein} onDragStart={(e) => e.dataTransfer.setData("text/plain", f.id)} onClick={() => onOuvrir(f.id)}
                  className="rounded-[10px] border border-trait bg-surface px-3 py-2.5 text-left hover:border-bord-doux" style={{ cursor: plein ? "grab" : "pointer" }}>
                  <span className="block truncate text-[14px] text-encre">{affiche(objet.champs.find((x) => x.nom === objet.principal) || SANS_NOM, f[objet.principal]) || "Sans nom"}</span>
                  {autres.map((a) => { const v = affiche(a, f[a.nom], liens); return v ? <span key={a.nom} className="mt-0.5 block truncate text-[12.5px] text-ardoise">{v}</span> : null; })}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}


/** Les colonnes d'une vue : cochées pour les montrer, flèches pour l'ordre ; enregistré dans la vue, pour toute l'équipe. */
function ReglageColonnes({ objet, colonnes, onValider }) {
  const [ordre, setOrdre] = useState(colonnes);
  const bouger = (i, d) => setOrdre((t) => { const n = [...t]; const j = i + d; if (j < 1 || j >= n.length) return t; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const cachees = objet.champs.filter((c) => !ordre.includes(c.nom));
  return (
    <div className="p-1">
      <p className="m-0 px-1 pb-1.5 text-[12.5px] text-ardoise">Montrées</p>
      {ordre.map((n, i) => {
        const c = objet.champs.find((x) => x.nom === n);
        if (!c) return null;
        return (
          <div key={n} className="flex items-center gap-1 rounded-[8px] px-1.5 py-1 hover:bg-relief">
            <button type="button" disabled={i === 0} onClick={() => setOrdre((t) => t.filter((x) => x !== n))} aria-label={`Cacher ${c.libelle}`} className="grid h-5 w-5 flex-none place-items-center rounded-[5px] border border-menthe bg-menthe text-sur-menthe disabled:opacity-50"><Check className="h-3 w-3" /></button>
            <span className="min-w-0 flex-1 truncate px-1 text-[13.5px] text-encre">{c.libelle}</span>
            {i > 0 && <button type="button" onClick={() => bouger(i, -1)} disabled={i === 1} aria-label="Monter" className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ArrowUp className="h-3.5 w-3.5" /></button>}
            {i > 0 && <button type="button" onClick={() => bouger(i, 1)} disabled={i === ordre.length - 1} aria-label="Descendre" className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ArrowDown className="h-3.5 w-3.5" /></button>}
          </div>
        );
      })}
      {cachees.length > 0 && <p className="m-0 px-1 pb-1.5 pt-3 text-[12.5px] text-ardoise">Cachées</p>}
      {cachees.map((c) => (
        <button key={c.nom} type="button" onClick={() => setOrdre((t) => [...t, c.nom])} className="flex w-full items-center gap-1 rounded-[8px] px-1.5 py-1 text-left hover:bg-relief" style={{ background: "transparent" }}>
          <span className="h-5 w-5 flex-none rounded-[5px] border border-bord-vif" />
          <span className="min-w-0 flex-1 truncate px-1 text-[13.5px] text-craie">{c.libelle}</span>
        </button>
      ))}
      <div className="flex justify-end pt-2"><button type="button" onClick={() => onValider(ordre)} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe">Enregistrer</button></div>
    </div>
  );
}

/** Le menu d'une vue, comme celui de Twenty : colonnes, enregistrer les filtres, nouvelle vue, renommer, supprimer. */
function MenuVue({ objet, vue, filtres, tri, onVue, declencheur = "menu" }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(null);
  const [nom, setNom] = useState("");
  const ancre = useRef(null);
  const relireBarre = () => queryClient.invalidateQueries({ queryKey: ["crm-barre"] });
  const agir = useMutation({
    mutationFn: ({ methode, chemin, corps }) => req(methode, `${API}/${objet.singulier}/vues${chemin}`, corps ? { body: corps } : undefined),
    // La vue changée tout de suite à l'écran ; Twenty enregistre derrière (quelques secondes), puis il est relu.
    onMutate: (v) => {
      setOuvert(null);
      if (v.local) queryClient.setQueryData(["crm-barre", ESPACE()], (d) => (d ? { ...d, dossiers: d.dossiers.map((x) => ({ ...x, objets: x.objets.map((o) => (o.singulier !== objet.singulier ? o : { ...o, vues: o.vues.map((w) => (w.id === vue.id ? { ...w, ...v.local } : w)) })) })) } : d));
    },
    onSuccess: (r, v) => {
      relireBarre(); toast.success(v.message);
      if (v.ouvrir) onVue(v.ouvrir === "nouvelle" ? r.id : v.ouvrir === "meme" ? vue.id : null);
    },
    onError: (e) => { relireBarre(); toast.error(e?.message || "Twenty a refusé"); },
  });
  const modifie = filtres.length > 0 || !!tri;
  const etat = { colonnes: vue.colonnes, filtres: [...vue.filtres, ...filtres], tri: tri || vue.tri };
  const ligne = (mot, faire, danger = false) => <button type="button" onClick={faire} className={`${ligneMenu} ${danger ? "hover:text-alerte" : ""}`} style={{ background: "transparent" }}>{mot}</button>;
  return (
    <>
      {declencheur === "plus" ? (
        <button ref={ancre} type="button" onClick={() => { setNom(""); setOuvert("nouvelle"); }} aria-label="Nouvelle vue" title="Nouvelle vue" className="grid h-7 w-7 place-items-center rounded-[8px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><Plus className="h-4 w-4" /></button>
      ) : (
        <button ref={ancre} type="button" onClick={() => setOuvert("menu")} aria-label="Options de la vue" title="Options de la vue" className="grid h-6 w-6 place-items-center rounded-[6px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>{agir.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}</button>
      )}
      {ouvert && (
        <Flottant ancre={ancre.current} onFermer={() => setOuvert(null)} largeur={ouvert === "colonnes" ? 320 : 280}>
          {ouvert === "menu" && (
            <>
              {ligne(<span className="inline-flex items-center gap-2"><Columns3 className="h-3.5 w-3.5" />Colonnes</span>, () => setOuvert("colonnes"))}
              {modifie && ligne(`Enregistrer dans « ${vue.nom} »`, () => agir.mutate({ methode: "PATCH", chemin: `/${vue.id}`, corps: { filtres: etat.filtres, tri: etat.tri }, message: "Vue enregistrée", ouvrir: "meme", local: { filtres: etat.filtres, tri: etat.tri } }))}
              {ligne("Enregistrer comme nouvelle vue", () => { setNom(""); setOuvert("nouvelle"); })}
              {vue.nom !== "Tout" && ligne("Renommer la vue", () => { setNom(vue.nom); setOuvert("renommer"); })}
              {vue.nom !== "Tout" && ligne("Supprimer la vue", () => { if (window.confirm(`Supprimer la vue « ${vue.nom} » pour toute l'équipe ?`)) agir.mutate({ methode: "DELETE", chemin: `/${vue.id}`, message: "Vue supprimée", ouvrir: "tout" }); }, true)}
              <p className="m-0 px-2.5 pb-1 pt-2 text-[12px] text-brume">Les vues sont partagées avec l'équipe, comme dans Twenty.</p>
            </>
          )}
          {ouvert === "colonnes" && <ReglageColonnes objet={objet} colonnes={vue.colonnes} onValider={(colonnes) => agir.mutate({ methode: "PATCH", chemin: `/${vue.id}`, corps: { colonnes }, message: "Colonnes enregistrées", local: { colonnes } })} />}
          {(ouvert === "nouvelle" || ouvert === "renommer") && (
            <div className="p-1">
              <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la vue"
                onKeyDown={(e) => { if (e.key === "Enter" && nom.trim()) e.currentTarget.form?.requestSubmit?.(); }}
                className="h-9 w-full rounded-[10px] border border-bord-doux bg-surface px-3 text-[14px] text-encre outline-none max-md:text-[16px]" />
              <div className="flex justify-end pt-2">
                <button type="button" disabled={!nom.trim()} onClick={() => (ouvert === "nouvelle"
                  ? agir.mutate({ methode: "POST", chemin: "", corps: { nom, ...etat }, message: `Vue « ${nom.trim()} » créée`, ouvrir: "nouvelle" })
                  : agir.mutate({ methode: "PATCH", chemin: `/${vue.id}`, corps: { nom }, message: "Vue renommée", local: { nom: nom.trim() } }))}
                  className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe disabled:opacity-40">{ouvert === "nouvelle" ? "Créer" : "Renommer"}</button>
              </div>
            </div>
          )}
        </Flottant>
      )}
    </>
  );
}


// Les réglages d'une colonne (Jules, 6 nov. 2026 : « une petite roue, je clique dessus et je vois les paramètres ») :
// l'alignement et la largeur, gardés par personne dans ce navigateur ; Twenty n'est pas touché.
const ALIGNEMENTS = [["gauche", "Gauche"], ["centre", "Centre"], ["droite", "Droite"]];
const CLASSES_ALIGNEMENT = { gauche: "justify-start text-left", centre: "justify-center text-center", droite: "justify-end text-right" };
const LARGEUR_MIN = 70;

/** L'en-tête d'une colonne : un clic trie ; la roue au survol ouvre ses réglages ; le bord droit se glisse pour la largeur. */
function EnTeteColonne({ c, tri, reglage, onTri, onReglage, alignementDefaut }) {
  const [ouvert, setOuvert] = useState(false);
  const roue = useRef(null);
  const cellule = useRef(null);
  const alignement = reglage.align || alignementDefaut;
  const glisser = (e) => {
    e.preventDefault(); e.stopPropagation();
    const depart = e.clientX;
    const largeurDepart = cellule.current.getBoundingClientRect().width;
    let largeur = largeurDepart;
    // Pendant le geste, seules les colonnes bougent (pas de rendu du tableau) ; la largeur s'enregistre au lâcher.
    const cols = document.querySelectorAll(`col[data-col="${CSS.escape(c.nom)}"]`);
    const bouger = (m) => { largeur = Math.max(LARGEUR_MIN, Math.round(largeurDepart + m.clientX - depart)); cols.forEach((x) => { x.style.width = `${largeur}px`; }); };
    const lacher = () => { window.removeEventListener("pointermove", bouger); window.removeEventListener("pointerup", lacher); document.body.style.cursor = ""; onReglage({ largeur }); };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  return (
    <th ref={cellule} className="group relative h-[35px] overflow-hidden whitespace-nowrap border-b border-r border-trait px-2.5 font-normal">
      <div className={`flex items-center gap-1 ${CLASSES_ALIGNEMENT[alignement]}`}>
        <button type="button" onClick={() => onTri()} className="inline-flex min-w-0 items-center gap-1 text-encre hover:text-menthe" style={{ background: "transparent" }}>
          <span className="truncate">{c.libelle}</span>
          {tri?.champ === c.nom && (tri.sens === "desc" ? <ArrowDown className="h-3 w-3 flex-none" /> : <ArrowUp className="h-3 w-3 flex-none" />)}
        </button>
        <button ref={roue} type="button" onClick={() => setOuvert(true)} aria-label={`Réglages de la colonne ${c.libelle}`} title="Réglages de la colonne"
          className={`grid h-6 w-6 flex-none place-items-center rounded-[6px] text-ardoise hover:bg-relief hover:text-encre group-hover:opacity-100 max-md:opacity-100 ${ouvert ? "opacity-100" : "opacity-0 focus:opacity-100"}`} style={{ background: "transparent" }}>
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <span role="separator" aria-orientation="vertical" aria-label="Glisser pour changer la largeur" title="Glisser pour changer la largeur, double-clic pour la largeur automatique"
        onPointerDown={glisser} onDoubleClick={() => onReglage({ largeur: null })}
        className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-menthe/60" />
      {ouvert && (
        <Flottant ancre={roue.current} onFermer={() => setOuvert(false)} largeur={240}>
          <p className="m-0 px-2.5 pb-1 pt-1.5 text-[12px] text-brume">Alignement</p>
          <div className="flex gap-1 px-1.5 pb-1.5">
            {ALIGNEMENTS.map(([cle, mot]) => (
              <button key={cle} type="button" onClick={() => onReglage({ align: cle === alignementDefaut ? null : cle })}
                className={`h-8 flex-1 rounded-[8px] text-[13px] ${alignement === cle ? "bg-menthe text-sur-menthe" : "text-encre hover:bg-relief"}`} style={alignement === cle ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
          <div className="my-1 border-t border-trait" />
          <button type="button" onClick={() => { setOuvert(false); onTri("asc"); }} className={ligneMenu} style={{ background: "transparent" }}><span className="inline-flex items-center gap-2"><ArrowUp className="h-3.5 w-3.5" />Trier croissant</span></button>
          <button type="button" onClick={() => { setOuvert(false); onTri("desc"); }} className={ligneMenu} style={{ background: "transparent" }}><span className="inline-flex items-center gap-2"><ArrowDown className="h-3.5 w-3.5" />Trier décroissant</span></button>
          {reglage.largeur && <button type="button" onClick={() => { setOuvert(false); onReglage({ largeur: null }); }} className={ligneMenu} style={{ background: "transparent" }}>Largeur automatique</button>}
          <p className="m-0 px-2.5 pb-1 pt-2 text-[12px] text-brume">Glissez le bord droit de la colonne pour changer sa largeur.</p>
        </Flottant>
      )}
    </th>
  );
}

// Les cases d'un choix (Groupe, Mandat, Statut…) sont colorées, pas en pastille (Jules, 5 nov. 2026) : texte et fond de
// la couleur du statut, une couleur un sens partout (src/lib/couleur-statut.js) ; le gris pour ce qui est neutre.
const couleurCase = (c, v) => `text-center ${CLASSES_STATUT[couleurStatut(c.options.find((o) => o.valeur === v)?.libelle || v)]}`;

/** La case à cocher d'une ligne, comme celle de Monday : un carré bordé aux coins doux, centré dans sa colonne. */
function Case({ cochee, onChange, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={cochee} aria-label={label} onClick={onChange}
      className={`mx-auto grid h-[17px] w-[17px] place-items-center rounded-[4px] border transition-colors ${cochee ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif hover:border-craie"}`}
      style={cochee ? undefined : { background: "transparent" }}>
      {cochee && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

/** Un groupe du tableau, comme ceux de Monday : ses fiches lues à part (50, puis « Voir plus »), son nom dans la couleur
 *  d'accent, un chevron qui le replie, un filet à gauche. Un groupe vide n'est pas dessiné. */
function GroupeCrm({ objet, vue, q, tri, filtres, libelle, ferme, onBasculer, rendre }) {
  const liste = useInfiniteQuery({
    queryKey: ["crm-page", objet.singulier, vue?.id, q, tri?.champ, tri?.sens, JSON.stringify(filtres)],
    initialPageParam: null,
    queryFn: ({ pageParam }) => req("GET", `${API}/${objet.singulier}?${new URLSearchParams({ q, ...(tri ? { tri: tri.champ, sens: tri.sens } : {}), filtres: JSON.stringify(filtres), ...(pageParam ? { apres: pageParam } : {}) })}`),
    getNextPageParam: (d) => d.suite || undefined,
    staleTime: 30_000,
    placeholderData: (avant) => avant,
  });
  const fiches = liste.data?.pages.flatMap((p) => p.fiches) || [];
  const liens = useMemo(() => {
    const out = {};
    for (const p of liste.data?.pages || []) for (const [k, v] of Object.entries(p.liens || {})) out[k] = { ...(out[k] || {}), ...v };
    return out;
  }, [liste.data]);
  if (liste.isLoading || liste.isError || !fiches.length) return null;
  const total = liste.data.pages[0]?.total ?? fiches.length;
  return (
    <section className="mt-6 first:mt-4">
      <button type="button" onClick={onBasculer} className="mb-2.5 inline-flex items-center gap-2 text-[19px] text-menthe" style={{ background: "transparent" }}>
        {ferme ? <ChevronRight className="h-[18px] w-[18px]" /> : <ChevronDown className="h-[18px] w-[18px]" />}{libelle}<span className="text-[13px] tabular-nums text-ardoise">{total}</span>
      </button>
      {!ferme && <div className="overflow-x-auto rounded-[12px] border border-trait border-l-[3px] border-l-menthe bg-crm-tableau">{rendre(fiches, liens)}</div>}
      {!ferme && liste.hasNextPage && (
        <div className="flex justify-center pt-3">
          <button type="button" onClick={() => liste.fetchNextPage()} disabled={liste.isFetchingNextPage} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            {liste.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Voir plus
          </button>
        </div>
      )}
    </section>
  );
}

/** Le logo d'un espace : celui de K Partners pour KPartners (Jules, 5 nov. 2026), l'initiale sinon. */
function LogoEspace({ nom, ferme = false, petit = false }) {
  const taille = petit ? "h-6 w-6 rounded-[6px]" : "h-7 w-7 rounded-[7px]";
  if (nom === "KPartners") return <span className={`grid flex-none place-items-center bg-relief ${taille} ${ferme ? "opacity-50" : ""}`}><LogoKP fond="theme" className={petit ? "text-[11px]" : "text-[13px]"} /></span>;
  return <span className={`grid flex-none place-items-center font-semibold ${taille} ${petit ? "text-[12px]" : "text-[13px]"} ${ferme ? "bg-relief text-brume" : "bg-menthe text-sur-menthe"}`}>{(nom || "C")[0]}</span>;
}

export default function CrmTwenty() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const barre = useQuery({ queryKey: ["crm-barre", ESPACE()], queryFn: () => req("GET", API), staleTime: 120_000, retry: false });
  // Sans la liste du serveur (une ancienne réponse gardée), les membres de Twenty : le choix n'est jamais vide.
  const spoc = barre.data?.spoc?.length ? barre.data.spoc : (barre.data?.membres || []).map((m) => ({ nom: m.nom.replace(/\s+/g, " "), valeur: m.nom, membre: m.id }));
  const moi = useUser();
  // Un admin garde les pages de Klocka dans la vue mandataire, où l'espace Klocka lui reste ouvert (6 nov. 2026).
  const equipe = moi?.role === "admin";
  const objets = useMemo(() => [...(barre.data?.dossiers || []).filter((d) => !d.ferme).flatMap((d) => d.objets.filter((o) => !o.ferme)), ...(equipe ? PAGES_KLOCKA : [])], [barre.data, equipe]);
  const objet = objets.find((o) => o.singulier === params.get("t")) || objets[0] || null;
  const vue = objet?.vues.find((v) => v.id === params.get("v")) || objet?.vues[0] || null;
  const ficheId = params.get("f");
  const ficheObjet = objets.find((o) => o.singulier === params.get("ft")) || objet;
  const { prefs, changer: changerPrefs } = usePersonnalisation();
  const clair = themeEffectif(prefs) === CLAIR;
  const [recherche, setRecherche] = useState("");
  const [q, setQ] = useState("");
  const [tri, setTri] = useState(null);
  const [filtres, setFiltres] = useState([]);
  const [choisies, setChoisies] = useState([]);
  const [ajoutFiltre, setAjoutFiltre] = useState(false);
  const [deplacer, setDeplacer] = useState(false);
  const [modifierLot, setModifierLot] = useState(null);
  const boutonModifier = useRef(null);
  const [envoi, setEnvoi] = useState(null);
  // La fiche de Klocka ouverte depuis une ligne (`{ type, id, singulier, twenty }`), et un appel client lancé depuis elle.
  const [klocka, setKlocka] = useState(null);
  const [appel, setAppel] = useState(null);
  // Le panneau de l'espace de travail : l'espace choisi, le panneau replié ou non (gardés dans le navigateur).
  const lireLocal = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
  const ecrireLocal = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* sans stockage */ } };
  const [espaceChoisi, setEspaceChoisi] = useState(() => lireLocal(`crm-espace-${ESPACE() || "equipe"}`, null));
  const [panneauReplie, setPanneauReplie] = useState(() => lireLocal("crm-panneau-replie", false));
  const [choixEspace, setChoixEspace] = useState(false);
  const [glisse, setGlisse] = useState(null);
  const apresGlisse = useRef(false);
  // Le glisser se fait à la souris (pointeur), pas par le glisser-déposer du navigateur, qui ne prend pas un bouton
  // partout (Firefox) : au-delà de 4 px, la page suit ; relâchée sur une autre, elle se pose avant ou après elle.
  const commencerGlisse = (e, esp, de) => {
    if (e.button !== 0 || e.pointerType !== "mouse" || !esp || esp.objets.find((x) => x.singulier === de)?.local) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let etat = null;
    const bouger = (m) => {
      if (!etat && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
      m.preventDefault();
      const el = document.elementFromPoint(m.clientX, m.clientY)?.closest?.("[data-page]:not([data-fixe])");
      const sur = el?.dataset.page || null;
      const apres = el ? m.clientY > el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 : false;
      if (!etat || etat.sur !== sur || etat.apres !== apres) { etat = { de, sur, apres }; setGlisse(etat); }
    };
    const lacher = () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
      window.removeEventListener("pointercancel", lacher);
      if (!etat) return;
      apresGlisse.current = true;
      setTimeout(() => { apresGlisse.current = false; }, 0);
      if (etat.sur && etat.sur !== de) rangerPage(esp, de, esp.objets.filter((x) => !x.local).findIndex((x) => x.singulier === etat.sur), etat.apres);
      setGlisse(null);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
    window.addEventListener("pointercancel", lacher);
  };
  const ordrePages = useMutation({
    mutationFn: (corps) => req("PUT", "/api/crm/ecran-ordre", { body: corps }),
    onError: () => { toast("L'ordre des pages n'a pas été gardé."); queryClient.invalidateQueries({ queryKey: ["crm-barre", ESPACE()] }); },
  });
  // Une page glissée sur une autre se pose avant ou après elle ; l'ordre est gardé pour la personne, à l'écran tout de suite.
  const rangerPage = (esp, de, vers, apres) => {
    if (!esp) return;
    const rangees = esp.objets.filter((o) => !o.local);
    const pages = rangees.map((o) => o.singulier);
    const depuis = pages.indexOf(de);
    if (depuis < 0) return;
    pages.splice(depuis, 1);
    let ici = vers + (apres ? 1 : 0);
    if (depuis < ici) ici -= 1;
    pages.splice(ici, 0, de);
    if (pages.every((p, k) => p === rangees[k].singulier)) return;
    queryClient.setQueryData(["crm-barre", ESPACE()], (d) => (d ? { ...d, ordre: { ...(d.ordre || {}), [esp.nom]: pages } } : d));
    ordrePages.mutate({ espace: esp.nom, pages });
  };
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [personne, setPersonne] = useState(false);
  const [grouper, setGrouper] = useState(false);
  const [groupesFermes, setGroupesFermes] = useState([]);
  const [groupes, setGroupes] = useState(() => lireLocal("crm-groupes", {}));
  const [reglagesColonnes, setReglagesColonnes] = useState(() => lireLocal("crm-colonnes", {}));
  const boutonEspace = useRef(null);
  const boutonPersonne = useRef(null);
  const boutonGrouper = useRef(null);
  const boutonNouveau = useRef(null);
  const [menuNouveau, setMenuNouveau] = useState(false);
  const boutonFiltre = useRef(null);
  const boutonDeplacer = useRef(null);
  useEffect(() => { const t = setTimeout(() => setQ(recherche), 300); return () => clearTimeout(t); }, [recherche]);
  // La barre de navigation et la bande du haut ne font qu'un bloc sur cette page (index.css, .k-cadre-crm).
  // Seul le mode du compte s'applique au CRM, jamais le reste de la personnalisation (personnalisation.js, definirCadreCrm).
  useEffect(() => {
    document.documentElement.classList.add("k-cadre-crm");
    definirCadreCrm(true);
    return () => { document.documentElement.classList.remove("k-cadre-crm"); definirCadreCrm(false); };
  }, []);
  useEffect(() => { setRecherche(""); setQ(""); setTri(null); setFiltres([]); setChoisies([]); }, [objet?.singulier, vue?.id]);

  const aller = (patch) => setParams((p) => { const n = new URLSearchParams(p); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return n; });
  const ouvrir = (singulier, id) => aller(singulier === objet?.singulier ? { f: id, ft: null } : { f: id, ft: singulier });
  // Un agent ou un client : sa fiche de Klocka, comme dans Relations ; sans fiche de Klocka, sa fiche du CRM.
  const ouvrirLigne = async (singulier, id) => {
    if (!equipe || !AVEC_FICHE_KLOCKA.has(singulier)) { ouvrir(singulier, id); return; }
    try {
      const r = await queryClient.fetchQuery({ queryKey: ["crm-klocka", singulier, id], queryFn: () => req("GET", `/api/crm/klocka/${singulier}/${id}`), staleTime: 5 * 60_000 });
      if (r?.fiche) { setKlocka({ ...r.fiche, singulier, twenty: id }); return; }
    } catch { /* la fiche du CRM, faute de mieux */ }
    ouvrir(singulier, id);
  };
  const versCrm = () => { const k = klocka; setKlocka(null); if (k) aller({ t: k.singulier, v: null, f: k.twenty, ft: null }); };
  const kanban = vue?.kanban || null;
  const tousFiltres = useMemo(() => [...(vue?.filtres || []), ...filtres], [vue, filtres]);
  const triVu = tri || vue?.tri;
  const liste = useInfiniteQuery({
    queryKey: ["crm-page", objet?.singulier, vue?.id, q, triVu?.champ, triVu?.sens, JSON.stringify(tousFiltres)],
    enabled: !!objet && !objet.local,
    initialPageParam: null,
    queryFn: ({ pageParam }) => req("GET", `${API}/${objet.singulier}?${new URLSearchParams({ q, ...(triVu ? { tri: triVu.champ, sens: triVu.sens } : {}), filtres: JSON.stringify(tousFiltres), ...(pageParam ? { apres: pageParam } : {}) })}`),
    getNextPageParam: (d) => d.suite || undefined,
    // Twenty répond en une demi-seconde à une seconde (8 nov. 2026, Jules : « le crm lag ») : une page vue il y a moins
    // de 30 s ne se relit pas, et pendant une recherche, un tri ou un filtre, le tableau du même onglet reste à l'écran.
    staleTime: 30_000,
    placeholderData: (avant, requete) => (requete?.queryKey[1] === objet?.singulier && requete?.queryKey[2] === vue?.id ? avant : undefined),
  });
  // 50 fiches, puis « Voir plus » charge les 50 suivantes (6 nov. 2026, Jules : « dans les tableaux mets 50 maximum »).
  // Le Kanban seul les charge toutes d'elles-mêmes (jusqu'à 750) : ses colonnes n'ont pas de « Voir plus ».
  const pagesChargees = liste.data?.pages.length || 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = liste;
  useEffect(() => { if (kanban && hasNextPage && !isFetchingNextPage && pagesChargees < 15) fetchNextPage(); }, [kanban, hasNextPage, isFetchingNextPage, pagesChargees, fetchNextPage]);
  const fiches = liste.data?.pages.flatMap((p) => p.fiches) || [];
  const liens = useMemo(() => {
    const out = {};
    for (const p of liste.data?.pages || []) for (const [k, v] of Object.entries(p.liens || {})) out[k] = { ...(out[k] || {}), ...v };
    return out;
  }, [liste.data]);
  const total = liste.data?.pages[0]?.total;
  const colonnesVue = (vue?.colonnes || []).map((n) => objet.champs.find((c) => c.nom === n)).filter(Boolean);
  const plein = objet?.niveau === "plein";
  const relire = () => queryClient.invalidateQueries({ queryKey: ["crm-page", objet?.singulier] });
  const ajouter = useMutation({
    mutationFn: () => req("POST", `${API}/${objet.singulier}`, { body: { nom: "" } }),
    onSuccess: (r) => { relire(); aller({ f: r.fiche.id, ft: null }); },
    onError: (e) => toast.error(e?.message || "Création refusée"),
  });
  const changerCase = useMutation({
    mutationFn: ({ id, champ, valeur }) => req("PATCH", `${API}/${objet.singulier}/${id}`, { body: { champ, valeur } }),
    onSuccess: (r, { id }) => {
      queryClient.setQueriesData({ queryKey: ["crm-page", objet.singulier] }, (d) => (d ? {
        ...d,
        pages: d.pages.map((p) => ({ ...p, liens: Object.fromEntries([...new Set([...Object.keys(p.liens || {}), ...Object.keys(r.liens || {})])].map((k) => [k, { ...(p.liens?.[k] || {}), ...(r.liens?.[k] || {}) }])), fiches: p.fiches.map((f) => (f.id === id ? r.fiche : f)) })),
      } : d));
      queryClient.invalidateQueries({ queryKey: ["crm-fiche", objet.singulier, id] });
    },
    onError: (e) => toast.error(e?.message || "Twenty a refusé la modification"),
  });
  const enLot = useMutation({
    mutationFn: (corps) => req("POST", `${API}/${objet.singulier}/lot`, { body: { ...corps, ids: choisies } }),
    onSuccess: (r, corps) => {
      relire(); setChoisies([]);
      const n = r.faites;
      if (corps.action === "modifier") { toast.success(`${n} fiche${n > 1 ? "s" : ""} modifiée${n > 1 ? "s" : ""}`); return; }
      toast.success(corps.action === "dupliquer" ? `${n} fiche${n > 1 ? "s" : ""} dupliquée${n > 1 ? "s" : ""}` : `${n} fiche${n > 1 ? "s" : ""} déplacée${n > 1 ? "s" : ""}${r.erreurs?.length ? `, ${r.erreurs.length} en erreur` : ""}`);
    },
    onError: (e) => toast.error(e?.message || "Action refusée"),
  });
  const supprimer = useSupprimer(objet, () => setChoisies([]));
  const toutes = fiches.length > 0 && fiches.every((f) => choisies.includes(f.id));
  const nomDeFiche = (f) => affiche(objet.champs.find((x) => x.nom === objet.principal) || SANS_NOM, f[objet.principal]);

  if (barre.isLoading) return <Chargement taille="grand" />;
  if (barre.isError) return <p className="px-6 py-24 text-center text-[14px] text-ardoise">{barre.error?.message || "Twenty CRM ne répond pas."}</p>;

  // L'espace de travail montré dans le panneau : celui choisi, sinon celui de la page ouverte, sinon le premier ouvert.
  // Les pages hors dossier de Twenty (Propriétés, Déplacements, Modèles…) se rangent dans « Autres ».
  const horsDossier = barre.data.dossiers.find((d) => !d.nom);
  const espaces = barre.data.dossiers.filter((d) => d.nom).map((d) => (d.nom === "Autres" && horsDossier && !d.ferme && !horsDossier.ferme ? { ...d, objets: [...d.objets, ...horsDossier.objets] } : { ...d }));
  if (horsDossier && !horsDossier.ferme && !espaces.some((d) => d.nom === "Autres")) espaces.push({ ...horsDossier, nom: "Autres" });
  // L'ordre des pages que la personne a choisi en les glissant (6 nov. 2026) ; les autres gardent l'ordre de Twenty.
  for (const d of espaces) {
    const rang = new Map((barre.data.ordre?.[d.nom] || []).map((s, i) => [s, i]));
    if (rang.size) d.objets = d.objets.map((o, i) => [o, rang.has(o.singulier) ? rang.get(o.singulier) : rang.size + i]).sort((x, y) => x[1] - y[1]).map(([o]) => o);
  }
  // Le tableau de bord en tête de l'espace Klocka (créé s'il manque), pour l'équipe seule ; après l'ordre choisi, qui
  // ne range que les tableaux.
  if (equipe) {
    const klocka = espaces.find((d) => d.nom === "Klocka");
    if (klocka) klocka.objets = [...PAGES_KLOCKA, ...klocka.objets];
    else espaces.unshift({ nom: "Klocka", objets: PAGES_KLOCKA });
  }
  const espaceDeLaPage = espaces.find((d) => !d.ferme && d.objets.some((o) => o.singulier === objet?.singulier && !o.ferme));
  const espace = (espaceChoisi && espaces.find((d) => d.nom === espaceChoisi && !d.ferme && d.objets.some((o) => o.singulier === objet?.singulier))) || espaceDeLaPage || espaces.find((d) => !d.ferme) || null;
  const choisirEspace = (d) => {
    setChoixEspace(false);
    if (d.ferme) { toast(d.raison); return; }
    setEspaceChoisi(d.nom); ecrireLocal(`crm-espace-${ESPACE() || "equipe"}`, d.nom);
    const premiere = d.objets.find((o) => !o.ferme);
    if (premiere) aller({ t: premiere.singulier, v: null, f: null, ft: null });
  };
  const replier = (v) => { setPanneauReplie(v); ecrireLocal("crm-panneau-replie", v); };
  const champPersonne = objet?.champs.find((c) => c.personnes) || null;
  const champsGroupe = objet?.champs.filter((c) => c.type === "SELECT") || [];
  // Grouper par (comme les groupes de Monday) : le champ « Groupe » par défaut quand le tableau en a un.
  const groupe = objet ? (groupes[objet.singulier] !== undefined ? groupes[objet.singulier] : champsGroupe.find((c) => c.nom === "groupe")?.nom || null) : null;
  const champGroupe = champsGroupe.find((c) => c.nom === groupe) || null;
  // Le champ du groupement ne se répète pas en colonne : chaque groupe le dit déjà. Le SPOC prend sa place, juste après
  // le nom, avec les têtes des gens (5 nov. 2026, Jules : « à la place de groupe, on doit avoir SPOC »).
  const colonnes = (() => {
    const restent = colonnesVue.filter((c) => c.nom !== champGroupe?.nom);
    const spoc = restent.find((c, i) => i > 0 && c.personnes) || (champPersonne && !restent.includes(champPersonne) ? champPersonne : null);
    if (!spoc || !restent.length) return restent;
    return [restent[0], spoc, ...restent.slice(1).filter((c) => c !== spoc)];
  })();
  const choisirGroupe = (nom) => { setGrouper(false); const n = { ...groupes, [objet.singulier]: nom }; setGroupes(n); ecrireLocal("crm-groupes", n); };
  // Plus de bloc « Sans groupe » (9 nov. 2026, Jules) : une fiche sans groupe se voit par Grouper > Aucun groupe.
  const groupesDuTableau = !champGroupe ? []
    : champGroupe.options.map((o) => ({ cle: o.valeur, libelle: o.libelle, filtre: { champ: champGroupe.nom, op: "est", valeur: o.valeur } }));
  const outil = "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[14px] text-craie hover:bg-relief hover:text-encre";

  /** Le tableau d'un groupe : cases à traits pleins, comme Monday ; la première colonne ouvre la fiche. */
  // Les réglages des colonnes de ce tableau (alignement, largeur) ; une colonne sans largeur partage la place qui reste.
  const reglagesTableau = reglagesColonnes[objet?.singulier] || {};
  const reglageDe = (c) => reglagesTableau[c.nom] || {};
  // La première colonne (le nom de la fiche) part plus large que les autres.
  const largeurDe = (c, i) => reglageDe(c).largeur || (i === 0 ? 220 : null);
  const alignementDefaut = (i) => (i === 0 ? "gauche" : "centre");
  const regler = (c, change) => {
    const r = { ...reglageDe(c), ...change };
    for (const k of Object.keys(r)) if (r[k] == null) delete r[k];
    const tableauNouveau = { ...reglagesTableau, [c.nom]: r };
    if (!Object.keys(r).length) delete tableauNouveau[c.nom];
    const n = { ...reglagesColonnes, [objet.singulier]: tableauNouveau };
    setReglagesColonnes(n); ecrireLocal("crm-colonnes", n);
  };
  const toutesReglees = colonnes.length > 0 && colonnes.every((c, i) => largeurDe(c, i));
  const largeurMini = 37 + colonnes.reduce((s, c, i) => s + (largeurDe(c, i) || 140), 0);
  const tableau = (lignes, liensT = liens) => (
    <table className="w-full table-fixed border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0" style={{ minWidth: Math.max(720, largeurMini) }}>
      <colgroup>
        <col style={{ width: 37 }} />
        {colonnes.map((c, i) => <col key={c.nom} data-col={c.nom} style={largeurDe(c, i) ? { width: largeurDe(c, i) } : undefined} />)}
        {/* Quand toutes les colonnes ont leur largeur, une colonne vide prend le reste au lieu de les élargir. */}
        {toutesReglees && <col />}
      </colgroup>
      <thead>
        <tr className="text-encre">
          <th className="h-[35px] border-b border-r border-trait p-0 align-middle">
            <Case cochee={lignes.every((f) => choisies.includes(f.id))} label="Tout cocher" onChange={() => { const tous = lignes.every((f) => choisies.includes(f.id)); setChoisies((t) => (tous ? t.filter((x) => !lignes.some((f) => f.id === x)) : [...new Set([...t, ...lignes.map((f) => f.id)])])); }} />
          </th>
          {colonnes.map((c, i) => (
            <EnTeteColonne key={c.nom} c={c} tri={triVu} reglage={reglageDe(c)} alignementDefaut={alignementDefaut(i)} onReglage={(change) => regler(c, change)}
              onTri={(sens) => setTri((t) => (sens ? { champ: c.nom, sens } : t?.champ === c.nom ? (t.sens === "asc" ? { champ: c.nom, sens: "desc" } : null) : { champ: c.nom, sens: "asc" }))} />
          ))}
          {toutesReglees && <th className="border-b border-trait" />}
        </tr>
      </thead>
      <tbody>
        {lignes.map((f) => {
          const cochee = choisies.includes(f.id);
          return (
            <tr key={f.id} className={f.id === ficheId || cochee ? "bg-relief" : "hover:bg-relief/60"}>
              <td className="border-b border-r border-trait p-0 align-middle">
                <Case cochee={cochee} label="Cocher la fiche" onChange={() => setChoisies((t) => (cochee ? t.filter((x) => x !== f.id) : [...t, f.id]))} />
              </td>
              {colonnes.map((c, i) => (
                <td key={c.nom} className={`h-[36px] overflow-hidden border-b border-r border-trait p-0 ${i === 0 ? "text-encre" : c.type === "SELECT" && f[c.nom] ? couleurCase(c, f[c.nom]) : "text-craie"} ${NUMERIQUES.includes(c.type) ? "tabular-nums" : ""}`}>
                  {i === 0 ? (
                    <button type="button" onPointerDown={() => { if (!objet.local) queryClient.prefetchQuery({ queryKey: ["crm-fiche", objet.singulier, f.id], queryFn: () => req("GET", `${API}/${objet.singulier}/${f.id}`), staleTime: 30_000 }); }} onClick={() => ouvrirLigne(objet.singulier, f.id)} className={`block w-full truncate px-4 py-1.5 text-encre hover:text-menthe ${CLASSES_ALIGNEMENT[reglageDe(c).align || "gauche"].split(" ")[1]}`} style={{ background: "transparent" }}>
                      {affiche(c, f[c.nom], liensT) || <span className="text-brume">Sans nom</span>}
                    </button>
                  ) : (
                    <Corrigeable c={c} valeur={f[c.nom]} liens={liensT} onEnregistrer={(champ, valeur) => changerCase.mutate({ id: f.id, champ, valeur })} onMail={(a) => setEnvoi({ a, objet: objet.singulier, id: f.id, nom: nomDeFiche(f) })}
                      className={`flex min-h-[36px] items-center truncate px-2.5 py-1 ${CLASSES_ALIGNEMENT[reglageDe(c).align || alignementDefaut(i)]}`}>
                      {(vu, lien) => (c.personnes && vu
                        // Un champ Personnes (SPOC) : les têtes des gens (photo de Twenty CRM, sinon initiales), comme dans Monday.
                        ? <span className="flex -space-x-1.5" title={vu}>{vu.split(",").map((n) => n.trim()).filter(Boolean).map((n) => <Tete key={n} nom={n} className="border-2 border-crm-tableau" />)}</span>
                        : c.type === "RELATION" && vu && objets.some((o) => o.singulier === c.cible)
                          ? <button type="button" onClick={(e) => { e.stopPropagation(); ouvrir(c.cible, f[c.nom]); }} className="max-w-full truncate text-encre underline decoration-trait underline-offset-2 hover:text-menthe" style={{ background: "transparent" }}>{vu}</button>
                          : c.type === "SELECT" && vu ? <span className="truncate">{vu}</span>
                          : (c.type === "EMAILS" || c.type === "PHONES" || c.type === "LINKS") && vu ? <ValeurAction vu={vu} lien={lien} type={c.type} />
                          // Un texte long ne montre que son début (8 nov. 2026, Jules) : la première ligne, coupée ; le clic ouvre le détail.
                          : vu ? <span className="block min-w-0 truncate">{String(vu).split("\n")[0]}</span> : vu)}
                    </Corrigeable>
                  )}
                </td>
              ))}
              {toutesReglees && <td className="border-b border-trait" />}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <Membres.Provider value={barre.data.membres || []}><Spoc.Provider value={spoc}>
    {/* Le cadre de la page, sur le modèle de Monday (Jules, 5 nov. 2026) : une bande en haut de la couleur de la barre de
        navigation (Twenty CRM, la recherche), puis le panneau de l'espace de travail et ses pages, puis le tableau. */}
    <div className="flex h-[100dvh] min-h-0 flex-col bg-rail max-md:h-auto">
      {/* Le logo « crm_ » en haut à gauche (Jules, 5 nov. 2026) : centré dans la bande de 48 px comme la recherche, et
          autant d'espace à sa gauche qu'au-dessus et au-dessous de lui. Posé au-dessus de la barre de navigation. */}
      {/* Le cadre centre le logo dans la bande ; le logo garde son alignement sur la ligne de base : le trait en bas, comme kp_. */}
      {createPortal(<span className="pointer-events-none fixed left-[15px] top-0 z-[45] flex h-12 items-center max-md:hidden"><span className="logo-kp logo-kp-theme text-[24px] tracking-[-0.03em]" role="img" aria-label="CRM">crm<span className="logo-kp-trait" style={{ width: "0.4em", marginLeft: "0.17em" }} aria-hidden="true" /></span></span>, document.body)}
      <header className="relative flex h-12 flex-none items-center gap-4 px-4">
        <div className="mx-auto flex h-8 w-full max-w-[480px] items-center gap-2.5 rounded-full bg-relief px-4 focus-within:ring-1 focus-within:ring-bord-doux max-md:hidden">
          <Search className="h-4 w-4 flex-none text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={objet ? `Rechercher dans ${objet.nom}…` : "Rechercher…"} aria-label="Rechercher" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
        </div>
        {/* Le mode, en haut à droite (Jules, 5 nov. 2026) : clair ou sombre, rien d'autre ; la bascule écrit la préférence du compte. */}
        <button type="button" onClick={() => changerPrefs({ mode: clair ? "sombre" : "clair" })} aria-label={clair ? "Passer en mode sombre" : "Passer en mode clair"} title={clair ? "Mode sombre" : "Mode clair"} className="absolute right-4 grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:hidden" style={{ background: "transparent" }}>
          {clair ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </header>

      <div className="k-crm-contenu flex min-h-0 flex-1 overflow-hidden rounded-tl-[16px] bg-fond max-md:flex-col max-md:rounded-none">
        {/* L'espace de travail : son choix (Klocka, KPartners, Autres), puis ses pages. */}
        {!panneauReplie && (
          <nav aria-label="Espace de travail" className="flex w-[236px] flex-none flex-col border-r border-trait max-md:w-auto max-md:border-b max-md:border-r-0">
            <div className="flex items-center justify-between px-[18px] pb-3 pt-4 max-md:hidden">
              <p className="m-0 text-[14px] text-craie">Espace de travail</p>
              <button type="button" onClick={() => replier(true)} aria-label="Replier le panneau" title="Replier" className="grid h-8 w-8 place-items-center rounded-[8px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><ChevronsLeft className="h-4 w-4" /></button>
            </div>
            <div className="px-4 pb-3 max-md:pt-3">
              <div className="flex gap-2">
              <button ref={boutonEspace} type="button" onClick={() => setChoixEspace(true)} className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-bord-doux px-2 text-left hover:border-bord-vif" style={{ background: "transparent" }}>
                <LogoEspace nom={espace?.nom} />
                <span className="min-w-0 flex-1 truncate text-[13px] uppercase tracking-[.04em] text-encre">{espace?.nom || "Pages"}</span>
                <ChevronDown className="h-4 w-4 flex-none text-ardoise" />
              </button>
              {/* Le « + » à côté de l'espace, comme dans Monday : une nouvelle fiche dans la page ouverte. */}
              <button type="button" onClick={() => plein && ajouter.mutate()} disabled={!plein || ajouter.isPending} aria-label="Nouvelle fiche" title={plein ? "Nouvelle fiche" : "Page en lecture"} className="grid h-10 w-10 flex-none place-items-center rounded-[10px] border border-bord-doux text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}><Plus className="h-[18px] w-[18px]" /></button>
              </div>
              {choixEspace && (
                <Flottant ancre={boutonEspace.current} onFermer={() => setChoixEspace(false)} largeur={268}>
                  {espaces.map((d) => (
                    <button key={d.nom} type="button" onClick={() => choisirEspace(d)} className={`${ligneMenu} flex items-center gap-2.5 ${d.ferme ? "text-brume" : ""}`} style={{ background: "transparent" }}>
                      <LogoEspace nom={d.nom} ferme={d.ferme} petit />
                      <span className="min-w-0 flex-1 truncate">{d.nom}</span>
                      {d.ferme ? <Lock className="h-3.5 w-3.5 flex-none" /> : d.nom === espace?.nom ? <Check className="h-3.5 w-3.5 flex-none text-menthe" /> : null}
                    </button>
                  ))}
                </Flottant>
              )}
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto px-3 pb-6 ${glisse ? "cursor-grabbing select-none" : ""} max-md:flex max-md:gap-1.5 max-md:overflow-x-auto max-md:pb-3`}>
              {(espace?.objets || []).map((o) => {
                const ici = o.singulier === objet?.singulier && !o.ferme;
                // Glisser une page pour la ranger : un filet dans la couleur d'accent montre où elle tombera.
                const cible = glisse && glisse.de !== o.singulier && glisse.sur === o.singulier;
                return (
                  <button key={o.singulier} type="button" onClick={() => (apresGlisse.current ? (apresGlisse.current = false) : o.ferme ? toast(o.raison || espace?.raison) : aller({ t: o.singulier, v: null, f: null, ft: null }))}
                    data-page={o.singulier} data-fixe={o.local ? "" : undefined}
                    onPointerDown={(e) => commencerGlisse(e, espace, o.singulier)}
                    title={o.ferme ? o.raison : o.niveau === "lecture" ? "En lecture" : undefined}
                    className={`relative flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[14px] transition-colors max-md:w-auto max-md:flex-none max-md:whitespace-nowrap ${o.ferme ? "text-brume max-md:hidden" : ici ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"} ${glisse?.de === o.singulier ? "opacity-40" : ""}`}
                    style={ici ? undefined : { background: "transparent" }}>
                    {cible && <span className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-menthe ${glisse.apres ? "-bottom-px" : "-top-px"}`} />}
                    {/* L'icône d'une page : un tableau ; un cadenas dessus quand elle est fermée ou en lecture. */}
                    <span className="relative flex-none max-md:hidden">
                      <PanelLeft className="h-4 w-4" strokeWidth={1.7} />
                      {(o.ferme || o.niveau === "lecture") && <Lock className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-[2px] bg-fond" strokeWidth={2.2} />}
                    </span>
                    <span className="truncate">{o.nom}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {objet?.local && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Suspense fallback={<Chargement />}>
                {objet.singulier === "tableau-de-bord" && (
                  <div className="px-10 pb-10 pt-[18px] max-md:px-4">
                    <h1 className="m-0 text-[25px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">Tableau de bord</h1>
                    <p className="m-0 mt-1 text-[13px] text-ardoise">Clients, projets, prospection et deals. Un clic ouvre la fiche.</p>
                    <CarteClientsTwenty hauteur="calc(100dvh - 240px)" className="mt-4 min-h-[460px]"
                      onClient={(p) => (p.klocka ? setKlocka({ type: "client", id: p.klocka, singulier: "clients", twenty: p.id }) : aller({ t: "clients", v: null, f: p.id, ft: null }))} />
                  </div>
                )}
              </Suspense>
            </div>
          )}
          {objet && !objet.local && (
            <>
              {/* Le titre de la page, puis ses vues en onglets soulignés (le … de la vue ouverte, + pour une nouvelle vue). */}
              <div className="flex flex-wrap items-center gap-3 px-10 pb-1 pt-[18px] max-md:px-4">
                {panneauReplie && <button type="button" onClick={() => replier(false)} aria-label="Ouvrir le panneau" title="Espace de travail" className="grid h-8 w-8 place-items-center rounded-[8px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><ChevronsRight className="h-4 w-4" /></button>}
                <h1 className="m-0 truncate text-[25px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">{objet.nom}</h1>
                {total != null && <span className="text-[13px] tabular-nums text-ardoise">{total}</span>}
                {objet.niveau === "lecture" && <span className="rounded-full bg-relief px-2.5 py-1 text-[12px] text-ardoise">En lecture</span>}
                {equipe && (objet.singulier === "utilisateurs" || objet.singulier === "clients") && (
                  <Suspense fallback={null}><ActionsComptes singulier={objet.singulier} /></Suspense>
                )}
              </div>
              <div className="mx-10 flex items-end gap-1 overflow-x-auto border-b border-trait max-md:mx-4">
                {objet.vues.map((v) => {
                  const active = v.id === vue?.id;
                  return (
                    <span key={v.id} className={`-mb-px flex flex-none items-center gap-1 border-b-2 px-1.5 pb-1.5 pt-1.5 ${active ? "border-menthe" : "border-transparent"}`}>
                      <button type="button" onClick={() => aller({ v: v.id === objet.vues[0].id ? null : v.id, f: null, ft: null })} className={`whitespace-nowrap rounded-[6px] px-1.5 py-1 text-[14px] ${active ? "text-encre" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={{ background: "transparent" }}>
                        {v.nom === "Tout" ? "Tableau principal" : v.nom}{v.kanban ? " · Kanban" : ""}
                      </button>
                      {active && plein && <MenuVue objet={objet} vue={v} filtres={filtres} tri={tri} onVue={(id) => { setFiltres([]); setTri(null); aller({ v: id, f: null, ft: null }); }} />}
                    </span>
                  );
                })}
                {plein && vue && <span className="flex-none pb-2"><MenuVue objet={objet} vue={vue} filtres={filtres} tri={tri} declencheur="plus" onVue={(id) => { setFiltres([]); setTri(null); aller({ v: id, f: null, ft: null }); }} /></span>}
              </div>

              {/* La barre d'outils, comme celle de Monday : Nouveau (et sa flèche), Rechercher, Personne, Filtre, Grouper par. */}
              <div className="flex flex-wrap items-center gap-1.5 px-10 pb-2 pt-4 max-md:px-4">
                {plein && (
                  <span className="mr-2 inline-flex h-8 overflow-hidden rounded-[8px] bg-menthe text-sur-menthe">
                    <button type="button" onClick={() => ajouter.mutate()} disabled={ajouter.isPending} className="inline-flex items-center gap-1.5 px-3 text-[14px] disabled:opacity-60" style={{ background: "transparent" }}>
                      {ajouter.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Ajouter {String(objet.nom_un || "fiche").replace(/^KP\s*·\s*/i, "").toLowerCase()}
                    </button>
                    <button ref={boutonNouveau} type="button" onClick={() => setMenuNouveau(true)} aria-label="Plus d'actions" className="grid w-8 place-items-center border-l border-sur-menthe/20" style={{ background: "transparent" }}><ChevronDown className="h-4 w-4" /></button>
                  </span>
                )}
                {menuNouveau && (
                  <Flottant ancre={boutonNouveau.current} onFermer={() => setMenuNouveau(false)} largeur={240}>
                    <a href={avecEspace(`${API}/${objet.singulier}/export?${new URLSearchParams({ q, ...(triVu ? { tri: triVu.champ, sens: triVu.sens } : {}), filtres: JSON.stringify(tousFiltres), colonnes: (vue?.colonnes || []).join(",") })}`)}
                      onClick={() => setMenuNouveau(false)} className={`${ligneMenu} flex items-center gap-2`}><Download className="h-3.5 w-3.5" />Exporter en CSV</a>
                  </Flottant>
                )}
                {rechercheOuverte || recherche ? (
                  <span className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-bord-doux px-2.5">
                    <Search className="h-4 w-4 flex-none text-ardoise" />
                    <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} onBlur={() => setRechercheOuverte(false)} placeholder="Rechercher" aria-label="Rechercher dans le tableau" className="w-[200px] border-none bg-transparent text-[13px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
                    {recherche && <button type="button" onClick={() => setRecherche("")} aria-label="Effacer" className="text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>}
                  </span>
                ) : <button type="button" onClick={() => setRechercheOuverte(true)} className={outil} style={{ background: "transparent" }}><Search className="h-4 w-4" />Rechercher</button>}
                {champPersonne && (
                  <button ref={boutonPersonne} type="button" onClick={() => setPersonne(true)} className={outil} style={{ background: "transparent" }}><CircleUser className="h-4 w-4" />Personne</button>
                )}
                {personne && (
                  <Flottant ancre={boutonPersonne.current} onFermer={() => setPersonne(false)} largeur={260}>
                    <p className="m-0 px-2.5 pb-1 pt-1 text-[12.5px] text-ardoise">{champPersonne.libelle}</p>
                    {spoc.map((p) => (
                      <button key={p.valeur} type="button" onClick={() => { setPersonne(false); setFiltres((t) => [...t.filter((x) => x.champ !== champPersonne.nom), { champ: champPersonne.nom, op: "contient", valeur: p.valeur }]); }} className={`${ligneMenu} flex items-center gap-2.5`} style={{ background: "transparent" }}>
                        <Tete nom={p.valeur} className="flex-none" /><span className="truncate">{p.nom}</span>
                      </button>
                    ))}
                  </Flottant>
                )}
                <button ref={boutonFiltre} type="button" onClick={() => setAjoutFiltre(true)} className={outil} style={{ background: "transparent" }}><ListFilter className="h-4 w-4" />Filtre<ChevronDown className="h-3.5 w-3.5" /></button>
                {ajoutFiltre && <Flottant ancre={boutonFiltre.current} onFermer={() => setAjoutFiltre(false)} largeur={300}><EditeurFiltre champs={objet.champs} onValider={(f) => { setAjoutFiltre(false); setFiltres((t) => [...t, f]); }} /></Flottant>}
                {!kanban && champsGroupe.length > 0 && <button ref={boutonGrouper} type="button" onClick={() => setGrouper(true)} className={outil} style={{ background: "transparent" }}><Rows3 className="h-4 w-4" />{champGroupe ? `Groupé par ${champGroupe.libelle}` : "Grouper par"}</button>}
                {grouper && (
                  <Flottant ancre={boutonGrouper.current} onFermer={() => setGrouper(false)} largeur={240}>
                    <button type="button" onClick={() => choisirGroupe(null)} className={`${ligneMenu} flex items-center justify-between`} style={{ background: "transparent" }}>Aucun groupe{!champGroupe && <Check className="h-3.5 w-3.5 text-menthe" />}</button>
                    {champsGroupe.map((c) => <button key={c.nom} type="button" onClick={() => choisirGroupe(c.nom)} className={`${ligneMenu} flex items-center justify-between`} style={{ background: "transparent" }}>{c.libelle}{champGroupe?.nom === c.nom && <Check className="h-3.5 w-3.5 text-menthe" />}</button>)}
                  </Flottant>
                )}
              </div>

              {/* Les filtres posés : ceux de la vue en gris, les siens dans la couleur d'accent. */}
              {((vue?.filtres || []).length > 0 || filtres.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 px-10 pb-2 max-md:px-4">
                  {(vue?.filtres || []).map((f, i) => { const c = objet.champs.find((x) => x.nom === f.champ); return c ? <PastilleFiltre key={`v${i}`} c={c} f={f} champs={objet.champs} deVue /> : null; })}
                  {filtres.map((f, i) => {
                    const c = objet.champs.find((x) => x.nom === f.champ);
                    return c ? <PastilleFiltre key={i} c={c} f={f} champs={objet.champs} onChanger={(n) => setFiltres((t) => t.map((x, j) => (j === i ? n : x)))} onRetirer={() => setFiltres((t) => t.filter((_, j) => j !== i))} /> : null;
                  })}
                  {filtres.length > 0 && <button type="button" onClick={() => setFiltres([])} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout effacer</button>}
                </div>
              )}

              {/* Le bandeau des lignes cochées, comme dans Twenty. */}
              {choisies.length > 0 && (
                <div className="mx-10 mb-2 flex flex-wrap items-center gap-2 rounded-[12px] border border-bord-doux bg-surface px-3 py-2 max-md:mx-4">
                  <span className="px-1 text-[13.5px] text-encre">{choisies.length} sélectionnée{choisies.length > 1 ? "s" : ""}</span>
                  {plein && objet.deplacer.length > 0 && (
                    <button ref={boutonDeplacer} type="button" onClick={() => setDeplacer(true)} disabled={enLot.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Déplacer vers<ChevronDown className="h-3.5 w-3.5" /></button>
                  )}
                  {plein && <button ref={boutonModifier} type="button" onClick={() => setModifierLot("champ")} disabled={enLot.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Modifier<ChevronDown className="h-3.5 w-3.5" /></button>}
                  {modifierLot && (
                    <Flottant ancre={boutonModifier.current} onFermer={() => setModifierLot(null)} largeur={modifierLot === "champ" ? 280 : 320}>
                      {modifierLot === "champ" ? objet.champs.filter((c) => c.modifiable && !["EMAILS", "PHONES", "LINKS", "CURRENCY"].includes(c.type)).map((c) => (
                        <button key={c.nom} type="button" onClick={() => setModifierLot(c.nom)} className={ligneMenu} style={{ background: "transparent" }}>{c.libelle}</button>
                      )) : (() => {
                        const c = objet.champs.find((x) => x.nom === modifierLot);
                        return (
                          <>
                            <p className="m-0 px-2 pb-1.5 text-[12.5px] text-ardoise">{c.libelle} pour {choisies.length} fiche{choisies.length > 1 ? "s" : ""}</p>
                            <Saisie c={c} valeur={null} onFini={(v) => { setModifierLot(null); if (v !== undefined) enLot.mutate({ action: "modifier", champ: c.nom, valeur: v }); }} />
                          </>
                        );
                      })()}
                    </Flottant>
                  )}
                  {plein && <button type="button" onClick={() => enLot.mutate({ action: "dupliquer" })} disabled={enLot.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}><Copy className="h-3.5 w-3.5" />Dupliquer</button>}
                  {plein && <button type="button" onClick={() => supprimer.mutate(choisies)} disabled={supprimer.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" />Supprimer</button>}
                  {(enLot.isPending || supprimer.isPending) && <Loader2 className="h-4 w-4 animate-spin text-ardoise" />}
                  <button type="button" onClick={() => setChoisies([])} aria-label="Tout décocher" className="ml-auto grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
                  {deplacer && (
                    <Flottant ancre={boutonDeplacer.current} onFermer={() => setDeplacer(false)} largeur={280}>
                      {objet.deplacer.map((o) => <button key={o.valeur} type="button" onClick={() => { setDeplacer(false); enLot.mutate({ action: "deplacer", vers: o.valeur }); }} className={ligneMenu} style={{ background: "transparent" }}>{o.libelle}</button>)}
                    </Flottant>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-auto px-10 pb-10 max-md:px-4">
                {liste.isLoading ? <Chargement /> : liste.isError ? <p className="py-16 text-center text-[14px] text-ardoise">{liste.error?.message || "Twenty ne répond pas."}</p>
                  : !fiches.length ? <p className="py-16 text-center text-[14px] text-brume">{q || tousFiltres.length ? "Rien ne correspond." : "Aucune fiche."}</p>
                  : kanban ? <Kanban objet={objet} champ={kanban} fiches={fiches} liens={liens} colonnes={vue.colonnes} onOuvrir={(id) => ouvrirLigne(objet.singulier, id)} onChanger={(id, champ, valeur) => changerCase.mutate({ id, champ, valeur })} />
                  : !champGroupe ? <div className="mt-4 overflow-x-auto rounded-[12px] border border-trait border-l-[3px] border-l-menthe bg-crm-tableau">{tableau(fiches)}</div>
                  // Groupé : chaque groupe lit ses fiches à part, 50 par 50, avec son « Voir plus » (8 nov. 2026, Jules).
                  : groupesDuTableau.map((g) => (
                    <GroupeCrm key={g.cle} objet={objet} vue={vue} q={q} tri={triVu} filtres={[...tousFiltres, g.filtre]} libelle={g.libelle}
                      ferme={groupesFermes.includes(g.cle)} onBasculer={() => setGroupesFermes((t) => (t.includes(g.cle) ? t.filter((x) => x !== g.cle) : [...t, g.cle]))} rendre={tableau} />
                  ))}
                {!kanban && !champGroupe && liste.hasNextPage && (
                  <div className="flex justify-center pt-5">
                    <button type="button" onClick={() => liste.fetchNextPage()} disabled={liste.isFetchingNextPage} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                      {liste.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Voir plus
                    </button>
                  </div>
                )}
              </div>
              <AnimatePresence>
                {ficheId && ficheObjet && <Fiche key={`${ficheObjet.singulier}-${ficheId}`} objet={ficheObjet} objets={objets} id={ficheId} onFermer={() => aller({ f: null, ft: null })} onOuvrir={ouvrir} onMail={setEnvoi} />}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
      {envoi && <EnvoiMail envoi={envoi} onFermer={() => setEnvoi(null)} />}
      <Suspense fallback={null}>
        {klocka?.type === "agent" && <TiroirAgent id={klocka.id} onFermer={() => setKlocka(null)} onCrm={versCrm} />}
        {klocka?.type === "client" && <FicheClient id={klocka.id} onFermer={() => setKlocka(null)} onAppel={(client, mode) => setAppel({ client, mode })} onCrm={versCrm} />}
        {appel && <AppelClient client={appel.client} mode={appel.mode} onFermer={() => setAppel(null)} onFait={() => queryClient.invalidateQueries({ queryKey: ["client-equipe"] })} />}
      </Suspense>
    </div>
    </Spoc.Provider></Membres.Provider>
  );
}
