import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, ExternalLink, Globe, Landmark, Loader2, Plus, Search, Star, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useEdition, Bloc } from "./EditionEnPlace";
import { nomDuSite } from "@/lib/nom-du-site";

// La présence en ligne du locataire (25 nov. 2026, Jules : « dans la partie locataire il faut les pages réseaux sociaux,
// site etc et Pappers du locataire aussi ») : depuis le 26 nov., sans carte autour, l'aperçu Pappers puis une carte par page.
// Pappers en tête, d'après le SIREN que le serveur connaît (projet, dossier, Kbis lu, outil Locataire) ; puis le site et
// les réseaux du projet (`liens_locataire`). Dans l'éditeur : chercher les pages d'un clic (une recherche web, seules les
// adresses vues reviennent), coller une adresse, retirer une ligne.

const LINK_CONFIG = {
  instagram: {
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  google_avis: {
    label: "Avis Google",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
      </svg>
    ),
  },
  tripadvisor: {
    label: "TripAdvisor",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 004.04 10.43 5.976 5.976 0 004.075-1.6L12 19.705l1.922-2.09a5.976 5.976 0 004.075 1.6 5.997 5.997 0 004.04-10.43L24 6.648h-4.35a13.573 13.573 0 00-7.644-2.353zM6.003 17.214a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zm11.994 0a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zM6.003 11.22a2 2 0 100 4 2 2 0 000-4zm11.994 0a2 2 0 100 4 2 2 0 000-4z"/>
      </svg>
    ),
  },
  site_web: {
    label: "Site web",
    icon: <ExternalLink className="w-5 h-5" />,
  },
  linkedin: {
    label: "LinkedIn",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  pappers: {
    label: "Pappers",
    icon: <Building2 className="w-5 h-5" />,
  },
  bodacc: {
    label: "BODACC",
    icon: <Landmark className="w-5 h-5" />,
  },
  autre: {
    label: "Autre",
    icon: <ExternalLink className="w-5 h-5" />,
  },
};

// Les avis Google juste sous Pappers (26 nov. 2026, Jules : « en dessous de Voir sur Pappers, on peut voir avis Google »).
/**
 * La bannière d'un réseau (26 nov. 2026, Jules : « le fond à la couleur système de la personne ; sinon ça fait trop de
 * couleurs », puis « le texte en noir plutôt ») : le fond prend l'accent choisi dans le compte (`menthe`), le logo et le
 * nom en `sur-menthe` (le texte posé sur l'accent, foncé sur le thème sombre), pour tous les réseaux, Pappers et le BODACC
 * compris.
 */
function BanniereReseau({ type, nom }) {
  // Un site ou une plateforme sans logo ici : le globe (26 nov. 2026, Jules : « que ça marche pour tout type de site »).
  const icone = type === "site_web" || type === "autre" || !LINK_CONFIG[type] ? <Globe className="w-5 h-5" /> : LINK_CONFIG[type].icon;
  return (
    // Le logo et le nom en noir (26 nov. 2026, Jules : « vraiment noir, pas violet »).
    <div className="flex h-full w-full items-center justify-center gap-3 bg-menthe text-black transition-transform duration-500 group-hover:scale-[1.015] [&_svg]:h-7 [&_svg]:w-7">
      {icone}
      <span className="min-w-0 truncate px-1 text-[20px] font-semibold tracking-[-0.01em]">{nom}</span>
    </div>
  );
}
/**
 * L'image de Pappers et du BODACC (26 nov. 2026, Jules, sur une maquette : « à la place de Pappers et BODACC, les images ;
 * toujours les mêmes ») : le fond à l'accent, le nom en gras et ce qu'on y trouve, et une page de document penchée,
 * coupée par le bas : la fiche d'une société pour Pappers (bandeau noir, deux cases), une annonce légale pour le BODACC
 * (titre centré, filet, encadré). Dessinée, la même pour tous les locataires.
 */
// `risques` : la page de Géorisques (26 nov. 2026, Jules : « un dessin pareil que BODACC ») : un titre, une petite carte
// avec l'adresse épinglée, puis les risques en lignes, chacun sa pastille.
function VisuelFiche({ nom, sousTitre, annonce = false, risques = false }) {
  const trait = (largeur, classe = "bg-black/[0.12]") => <span className={`block h-[7px] rounded-full ${classe}`} style={{ width: largeur }} />;
  // Au survol, la page sort de la case par le haut (26 nov. 2026, Jules : « dès qu'on passe la souris, le document sort de
  // la case, il bouge vraiment ») : elle monte, se redresse et grossit, son ombre s'élargit ; seul le bas reste coupé.
  return (
    <div className="relative h-full w-full text-black">
      <div className="absolute inset-0 overflow-hidden rounded-t-[16px] bg-menthe" />
      <div className="absolute left-6 top-1/2 z-10 max-w-[55%] -translate-y-1/2 max-md:left-5">
        <p className="m-0 truncate text-[32px] font-bold leading-[1.05] tracking-[-0.02em] max-md:text-[26px]">{nom}</p>
        <p className="m-0 mt-2 text-[14px] font-medium leading-[1.3]">{sousTitre}</p>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 [clip-path:inset(-90px_-40px_0_-40px)]">
        <div className={`absolute -bottom-10 right-7 flex w-[38%] min-w-[150px] max-w-[230px] flex-col gap-2.5 rounded-[10px] bg-white px-3.5 pb-12 pt-3.5 shadow-[0_14px_36px_rgb(0_0_0/0.22)] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-9 group-hover:rotate-0 group-hover:scale-[1.06] group-hover:shadow-[0_28px_60px_rgb(0_0_0/0.35)] ${annonce ? "top-6 rotate-[-4deg]" : risques ? "top-5 rotate-[3deg]" : "top-5 rotate-[5deg]"}`}>
          {risques ? (
            <>
              <span className="block h-[6px] w-[62%] rounded-full bg-black" />
              <span className="relative block h-14 w-full overflow-hidden rounded-[5px] bg-menthe/25">
                <span className="absolute -left-2 top-3 block h-[2px] w-[70%] rotate-[-8deg] bg-black/15" />
                <span className="absolute left-[30%] top-0 block h-full w-[2px] rotate-[12deg] bg-black/15" />
                <span className="absolute right-[-6px] bottom-3 block h-[2px] w-[60%] rotate-[6deg] bg-black/15" />
                <span className="absolute left-1/2 top-1/2 block h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-menthe/60" />
                <span className="absolute left-1/2 top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black" />
              </span>
              {["bg-menthe", "bg-menthe/50", "bg-black/20"].map((c, i) => (
                <span key={i} className="flex items-center gap-2"><span className={`block h-2.5 w-2.5 flex-none rounded-full ${c}`} />{trait(["72%", "58%", "66%"][i])}</span>
              ))}
            </>
          ) : annonce ? (
            <>
              <span className="mx-auto block h-[6px] w-[55%] rounded-full bg-black" />
              <span className="block h-[2px] w-full bg-black" />
              {trait("78%")}
              {trait("70%")}
              <span className="block h-9 w-full rounded-[5px] bg-menthe" />
              {trait("82%")}
            </>
          ) : (
            <>
              <span className="block h-6 w-full rounded-[5px] bg-black" />
              {trait("78%")}
              {trait("58%")}
              <span className="flex gap-2"><span className="block h-10 flex-1 rounded-[5px] bg-menthe" /><span className="block h-10 flex-1 rounded-[5px] bg-menthe/25" /></span>
              {trait("68%")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ORDRE = ["pappers", "google_avis", "site_web", "instagram", "facebook", "linkedin", "tripadvisor", "autre"];

const hote = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(url || ""); } };

/** Pure : le réseau d'une adresse collée, d'après son domaine. */
export function typeDuLien(url) {
  const h = hote(url).toLowerCase();
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)facebook\.com$/.test(h)) return "facebook";
  if (/(^|\.)linkedin\.com$/.test(h)) return "linkedin";
  if (/(^|\.)tripadvisor\./.test(h)) return "tripadvisor";
  if (/(^|\.)(google\.|goo\.gl|g\.page)/.test(h)) return "google_avis";
  if (/(^|\.)pappers\.fr$/.test(h)) return "pappers";
  return "site_web";
}

/** Pure : les lignes de la carte, Pappers d'abord, un réseau après l'autre. */
export function lignesDesLiens(liens = [], siren = null) {
  const sirenDe = (url) => (String(url || "").match(/(\d{9})(?!\d)/) || [])[1];
  const lignes = (liens || []).map((l, idx) => ({ ...l, idx })).filter((l) => l?.url)
    .map((l) => (l.type === "pappers" && sirenDe(l.url) ? { ...l, detail: `SIREN ${sirenDe(l.url).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}` } : l));
  if (/^\d{9}$/.test(String(siren || "")) && !lignes.some((l) => l.type === "pappers")) {
    lignes.push({ type: "pappers", url: `https://www.pappers.fr/entreprise/${siren}`, label: "Pappers", detail: `SIREN ${String(siren).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`, auto: true });
  }
  const rang = (t) => { const i = ORDRE.indexOf(t); return i < 0 ? ORDRE.length : i; };
  return lignes.sort((a, b) => rang(a.type) - rang(b.type));
}


/**
 * Une carte d'aperçu : une image fixe de la page (toujours la même, quel que soit le locataire) et « Voir sur … » ; toute
 * la carte ouvre la page du locataire (26 nov. 2026, Jules : « la capture que je t'ai envoyée, tout le temps la même ;
 * juste “Voir sur Pappers” en blanc, rien en dessous » ; puis « le truc data.gouv pareil, voir sur data.gouv »).
 */
// `debordant` : le visuel peut sortir de la carte par le haut (la page de Pappers et du BODACC au survol).
export function ApercuSite({ image = null, visuel = null, libelle, url, aspect = "aspect-[1200/345]", contenir = false, petit = false, titre = null, debordant = false }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={libelle} title={titre || undefined}
      className={`k-carte group block transition-colors hover:border-bord-vif ${debordant ? "overflow-visible hover:z-30" : "overflow-hidden"}`}>
      <div className={`${aspect} ${debordant ? "relative rounded-t-[16px]" : "overflow-hidden"} border-b border-trait`}>
        {visuel || <img src={image} alt="" className={`h-full w-full transition-transform duration-500 group-hover:scale-[1.015] ${contenir ? "bg-white object-contain" : "object-cover object-top"}`} />}
      </div>
      <div className={`flex items-center justify-between gap-3 ${petit ? "px-4 py-3" : "px-5 py-4"}`}>
        <span className={`min-w-0 truncate text-encre ${petit ? "text-[14px]" : "text-[15px]"}`}>{libelle}</span>
        <ArrowUpRight className="h-4 w-4 flex-none text-ardoise transition-colors group-hover:text-encre" />
      </div>
    </a>
  );
}

/** Pappers : la fiche du locataire avec son SIREN, sinon la recherche Pappers sur son nom. */
export function ApercuPappers({ siren = null, fiche = null, nomDeRepli = null }) {
  const url = fiche?.pappers || (siren ? `https://www.pappers.fr/entreprise/${siren}` : `https://www.pappers.fr/recherche?q=${encodeURIComponent(nomDeRepli || "")}`);
  return <ApercuSite visuel={<VisuelFiche nom="Pappers" sousTitre="Fiche société complète" />} libelle="Voir l'entreprise sur Pappers" url={url} aspect="h-[168px]" petit debordant />;
}

/** Le BODACC : les annonces de la société avec son SIREN, sinon la recherche du BODACC sur son nom. */
export function ApercuBodacc({ siren = null, nomDeRepli = null }) {
  const url = siren ? `https://www.bodacc.fr/pages/annonces-commerciales/?q.registre=registre:${siren}` : `https://www.bodacc.fr/pages/annonces-commerciales-recherche/?q=${encodeURIComponent(nomDeRepli || "")}`;
  return <ApercuSite visuel={<VisuelFiche nom="BODACC" sousTitre="Annonces légales officielles" annonce />} libelle="Voir l'entreprise sur le BODACC" url={url} aspect="h-[168px]" petit debordant />;
}

/**
 * Géorisques : le rapport « Les risques près de chez moi » de l'adresse du bien (le serveur la situe), sinon l'accueil de
 * Géorisques. Dans les diagnostics (26 nov. 2026, Jules).
 */
export function ApercuGeorisques({ adresse }) {
  const q = useQuery({
    queryKey: ["georisques", adresse || ""],
    queryFn: () => base44.request("GET", `/api/marche/georisques?adresse=${encodeURIComponent(adresse)}`),
    enabled: !!String(adresse || "").trim(),
    staleTime: 60 * 60_000,
    retry: false,
  });
  return <ApercuSite visuel={<VisuelFiche nom="Géorisques" sousTitre="Les risques à cette adresse" risques />} libelle="Voir sur Géorisques" url={q.data?.url || "https://www.georisques.gouv.fr/"} aspect="h-[168px]" petit debordant />;
}



/** Cinq étoiles, remplies jusqu'à la note (une étoile partielle pour la décimale). */
function Etoiles({ note }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => {
        const part = Math.max(0, Math.min(1, note - i));
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-ardoise/40" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${part * 100}%` }}>
              <Star className="h-4 w-4 text-or" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Le résumé des avis Google du locataire (26 nov. 2026, Jules : « un design comme ça avec l'enseigne du projet ; la vraie
 * note des avis ») : les barres par étoile, la note, les étoiles et le nombre d'avis, lus par le serveur sur la fiche
 * Google Maps du commerce. Toute la carte ouvre la fiche.
 */
export function ResumeAvisGoogle({ avis }) {
  const max = Math.max(...avis.repartition.map((r) => r.avis), 1);
  const nf = new Intl.NumberFormat("fr-FR");
  return (
    <a href={avis.url} target="_blank" rel="noopener noreferrer" aria-label={`Avis Google : ${String(avis.note).replace(".", ",")} sur 5, ${nf.format(avis.total)} avis`}
      className="k-carte sans-grille group block px-6 pb-6 pt-5 transition-colors hover:border-bord-vif max-md:px-5">
      <div className="flex items-start justify-between gap-3">
        {/* Le titre seul (26 nov. 2026, Jules : « pas besoin de mettre KFC Lyon République en dessous »). */}
        <p className="m-0 min-w-0 text-[16px] text-encre">Résumé des avis Google</p>
        <ArrowUpRight className="mt-1 h-4 w-4 flex-none text-ardoise transition-colors group-hover:text-encre" />
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6">
        <div className="flex flex-col gap-2">
          {avis.repartition.map((r) => (
            <div key={r.etoiles} className="flex items-center gap-3">
              <span className="w-2.5 text-[13.5px] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>{r.etoiles}</span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-encre/10">
                <span className="block h-full rounded-full bg-or" style={{ width: `${Math.max(r.avis ? 3 : 0, (r.avis / max) * 100)}%` }} />
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[44px] font-normal leading-none tracking-[-0.02em] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{String(avis.note).replace(".", ",")}</span>
          <Etoiles note={avis.note} />
          <span className="text-[13.5px] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>({nf.format(avis.total)})</span>
        </div>
      </div>
    </a>
  );
}

// `partie` : « fiches » (Pappers et BODACC, entre le bail en place et qui exploite) ou « reseaux » (le résumé des avis
// Google, puis le site et les réseaux, dans la colonne de droite) (26 nov. 2026, Jules : « ça fait trop »).
export default function LocataireLiensSociaux({ project, siren = null, isPublic = false, partie = "reseaux" }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const [ajout, setAjout] = useState("");
  const liens = project?.liens_locataire || [];
  // La fiche de la société : lue par le serveur, ou celle gardée pour le lien public. Elle remplace la ligne Pappers.
  const avecId = !!project?.id && project.id !== "apercu";
  const sirenVu = siren || (liens.find((l) => /pappers\.fr/i.test(String(l?.url || "")))?.url.match(/(\d{9})(?!\d)/) || [])[1] || null;
  const qSociete = useQuery({
    queryKey: ["societe-locataire", project?.id, sirenVu],
    queryFn: () => base44.request("GET", `/api/projets/${project.id}/societe-locataire`),
    enabled: !isPublic && avecId && !!sirenVu,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const fiche = isPublic ? project?.societe_locataire || null : qSociete.data?.fiche || null;
  // L'aperçu Pappers est toujours là dès qu'on a un nom ou un SIREN, et fait la ligne Pappers : pas de pastille en double.
  const avecApercu = !!(sirenVu || String(project?.nom_locataire || "").trim());
  // Les pages trouvées d'office (une recherche par projet, gardée par le serveur) et les avis Google (le lien officiel de
  // Google Maps sur le nom et l'adresse, sans recherche) s'ajoutent à celles du projet ; un réseau déjà là n'est pas
  // doublé ; une page retirée dans l'éditeur va dans `liens_masques` et ne revient pas.
  const qTrouves = useQuery({
    queryKey: ["liens-trouves", project?.id, project?.nom_locataire || "", project?.adresse_complete || ""],
    queryFn: () => base44.request("GET", `/api/projets/${project.id}/liens-trouves`),
    enabled: !isPublic && avecId && !!String(project?.nom_locataire || "").trim(),
    staleTime: 30 * 60_000,
    retry: false,
  });
  const trouves = isPublic ? project?.liens_trouves || [] : qTrouves.data?.liens || [];
  // Le résumé des avis Google, lu par le serveur sur la fiche Google Maps (une fois, gardé sept jours).
  const qAvis = useQuery({
    queryKey: ["avis-google", project?.id, project?.nom_locataire || "", project?.adresse_complete || ""],
    queryFn: () => base44.request("GET", `/api/projets/${project.id}/avis-google`),
    enabled: !isPublic && avecId && !!String(project?.nom_locataire || "").trim() && !!project?.adresse_complete,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const avis = isPublic ? project?.avis_google || null : qAvis.data?.avis || null;
  const masques = new Set(project?.liens_masques || []);
  const nomAdresse = [project?.nom_locataire, project?.adresse_complete].map((t) => String(t || "").trim()).filter(Boolean).join(", ");
  const avisGoogle = String(project?.nom_locataire || "").trim() && project?.adresse_complete
    ? { type: "google_avis", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomAdresse)}`, label: "Avis Google", trouve: true } : null;
  const enPlus = [...trouves.map((l) => ({ ...l, trouve: true })), ...(avisGoogle ? [avisGoogle] : [])]
    .filter((l, i, t) => l?.url && !masques.has(l.url) && !liens.some((x) => x.url === l.url || (x.type === l.type && l.type !== "autre")) && t.findIndex((y) => y.type === l.type) === i);
  const rang = (t) => { const i = ORDRE.indexOf(t); return i < 0 ? ORDRE.length : i; };
  const lignes = [...lignesDesLiens(liens, siren), ...enPlus].filter((l) => l.type !== "pappers" && !masques.has(l.url) && !(avis && l.type === "google_avis"))
    .sort((a, b) => rang(a.type) - rang(b.type));
  const retirer = (l) => (l.trouve
    ? edition.onChamp("liens_masques", [...masques, l.url], true)
    : ecrire(liens.filter((_, i) => i !== l.idx)));
  const ecrire = (liste) => edition.onChamp("liens_locataire", liste.map(({ type, url, label }) => ({ type, url, label: label || "" })), true);
  const chercher = useMutation({
    mutationFn: () => base44.request("POST", `/api/projets/${project.id}/liens-locataire`, { body: { projet: { nom_locataire: project.nom_locataire || "", activite_locataire: project.activite_locataire || "", adresse_complete: project.adresse_complete || "" } } }),
    onSuccess: (r) => {
      const nouveaux = (r?.liens || []).filter((l) => !liens.some((x) => x.url === l.url || (x.type === l.type && l.type !== "autre")));
      if (nouveaux.length) { ecrire([...liens, ...nouveaux]); toast.success(nouveaux.length === 1 ? "1 page trouvée" : `${nouveaux.length} pages trouvées`, { description: "Retirez celles qui ne sont pas le bon commerce." }); }
      else toast("Aucune nouvelle page trouvée", { description: "Collez une adresse si vous en connaissez une." });
    },
    onError: (e) => toast.error(e?.message || "La recherche n'a pas abouti."),
  });
  const ajouter = () => {
    const t = ajout.trim();
    if (!t) return;
    const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    try { new URL(url); } catch { toast.error("Ce n'est pas une adresse web."); return; }
    const type = typeDuLien(url);
    ecrire([...liens, { type, url, label: LINK_CONFIG[type]?.label || "" }]);
    setAjout("");
  };
  // Les fiches de la société : Pappers et le BODACC, côte à côte. Plus d'Annuaire des Entreprises (26 nov. 2026, après
  // avis : la même fiche que Pappers, en moins riche).
  if (partie === "fiches") {
    if (!avecApercu) return null;
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <Bloc id="locataire-pappers" titre="Pappers"><ApercuPappers siren={sirenVu} fiche={fiche} nomDeRepli={project.nom_locataire} /></Bloc>
        <Bloc id="locataire-bodacc" titre="BODACC"><ApercuBodacc siren={sirenVu} nomDeRepli={project.nom_locataire} /></Bloc>
      </div>
    );
  }

  if (!lignes.length && !avis && !qAvis.isFetching && !enEdition) return null;
  // Le résumé des avis, puis le site et les réseaux en tuiles compactes, deux par ligne ; dans l'éditeur, chercher et
  // coller dessous.
  return (
    <div className="flex flex-col gap-3">
      {avis ? <Bloc id="locataire-avis-google" titre="Résumé des avis Google"><ResumeAvisGoogle avis={avis} /></Bloc> : qAvis.isFetching && !isPublic ? (
        <div className="k-carte flex items-center gap-2 px-6 py-5 text-[13.5px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lecture des avis Google…</div>
      ) : null}
      {/* Le site et les réseaux en cartes-images, comme Pappers et le BODACC (26 nov. 2026, Jules) : l'image du réseau
          (public/apercus/), « Voir sur … » dessous, deux par ligne. */}
      {lignes.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {lignes.map((l) => {
            const config = LINK_CONFIG[l.type] || LINK_CONFIG.autre;
            // Le nom dans la bannière et « Voir sur … » : une plateforme connue par son nom, une autre page par le sien ou
            // son domaine, le site du locataire en « Site web » (src/lib/nom-du-site.js).
            const { nom, libelle } = nomDuSite(l.url, { type: l.type, label: l.label });
            return (
              <Bloc key={`${l.type}-${l.url}`} id={`locataire-lien-${l.type}`} titre={l.label || config.label} className="min-w-0">
                <ApercuSite visuel={<BanniereReseau type={l.type} nom={nom} />} libelle={libelle} url={l.url} titre={l.url} aspect="aspect-[800/350]" petit />
                {/* Retirer la page (elle ne revient plus), à gauche ; « Masquer » (pour le client seulement) est à droite. */}
                {enEdition && !l.auto && (
                  <button type="button" onClick={() => retirer(l)} aria-label={`Retirer ${l.label || config.label}`} title="Retirer cette page"
                    className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-fond/80 text-craie transition-colors hover:text-alerte">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </Bloc>
            );
          })}
        </div>
      )}
      {enEdition && (
        <div className="flex items-center gap-2 pt-1">
          <input value={ajout} onChange={(e) => setAjout(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }}
            placeholder="Coller une page (site, Instagram…)" aria-label="Ajouter une page du locataire"
            className="h-9 min-w-0 flex-1 rounded-full border border-trait bg-transparent px-4 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
          <button type="button" onClick={ajouter} disabled={!ajout.trim()} aria-label="Ajouter" title="Ajouter"
            className="grid h-9 w-9 flex-none place-items-center rounded-full border border-trait text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
            <Plus className="h-4 w-4" />
          </button>
          {avecId && (
            <button type="button" onClick={() => chercher.mutate()} disabled={chercher.isPending || !project.nom_locataire}
              title={project.nom_locataire ? "Chercher le site, les réseaux et la fiche Pappers du locataire sur le web" : "Il faut le nom du locataire"}
              aria-label="Chercher les pages du locataire"
              className="grid h-9 w-9 flex-none place-items-center rounded-full border border-trait text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {chercher.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
