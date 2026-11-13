import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import jetons from "@/design/jetons.json";
import "./logo-kp.css";

// Les annonces d'un bien en vente (4 nov. 2026, Jules : « des annonces pré-rédigées avec une photo de couverture, pour
// leur faciliter le plus possible »). Klocka ne publie rien : le mandataire copie. En tête, la couverture au canva de
// Jules (fond lavande, deux blocs nuit, la photo arrondie, « kp_ » en blanc), dessinée dans l'écran avec la photo du
// bien, à télécharger ; puis une carte par canal, son titre et son texte à copier, les mentions ajoutées à la copie.
// Le serveur : server/annonces-bien.js.

const C = jetons.couverture_kp;
const L = 1200;
const H = 900;
// Les mesures du canva (1200 × 900) : la photo, son rayon, les deux blocs nuit, le logo.
const PHOTO = { x: 33, y: 26, l: 1135, h: 764, r: 26 };
const BLOC_HAUT = { x: 0, y: 0, l: 198, h: 199 };
const BLOC_BAS = { x: 822, y: 524, l: L - 822, h: H - 524 };
const LOGO = { x: 1006, base: 869, taille: 100 };

const chargerImage = (url) => new Promise((ok, non) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => non(new Error("Photo illisible"));
  img.src = url;
});

/** Dessine la couverture sur un canvas : la photo remplit son cadre (recadrée au centre), le reste est fixe. */
export async function dessinerCouverture(canvas, url) {
  canvas.width = L;
  canvas.height = H;
  const x = canvas.getContext("2d");
  x.fillStyle = C.lavande;
  x.fillRect(0, 0, L, H);
  x.fillStyle = C.nuit;
  x.fillRect(BLOC_HAUT.x, BLOC_HAUT.y, BLOC_HAUT.l, BLOC_HAUT.h);
  x.fillRect(BLOC_BAS.x, BLOC_BAS.y, BLOC_BAS.l, BLOC_BAS.h);
  const cadre = () => { x.beginPath(); x.roundRect(PHOTO.x, PHOTO.y, PHOTO.l, PHOTO.h, PHOTO.r); };
  // L'ombre douce sous la photo, comme le canva.
  x.save();
  x.shadowColor = "rgba(0,0,0,0.28)";
  x.shadowBlur = 36;
  x.shadowOffsetY = 10;
  x.fillStyle = C.nuit;
  cadre();
  x.fill();
  x.restore();
  if (url) {
    const img = await chargerImage(url);
    const echelle = Math.max(PHOTO.l / img.width, PHOTO.h / img.height);
    const l = img.width * echelle;
    const h = img.height * echelle;
    x.save();
    cadre();
    x.clip();
    x.drawImage(img, PHOTO.x + (PHOTO.l - l) / 2, PHOTO.y + (PHOTO.h - h) / 2, l, h);
    x.restore();
  }
  // Le logo : « kp » en Hanken Grotesk Medium, approche −0,06 em, puis le trait (0,37 × 0,10 em) sur la ligne de base.
  await document.fonts?.load?.(`500 ${LOGO.taille}px "Hanken Grotesk"`).catch(() => {});
  x.font = `500 ${LOGO.taille}px "Hanken Grotesk", system-ui, sans-serif`;
  if ("letterSpacing" in x) x.letterSpacing = `${-0.06 * LOGO.taille}px`;
  x.fillStyle = C.blanc;
  x.textBaseline = "alphabetic";
  x.fillText("kp", LOGO.x, LOGO.base);
  const fin = LOGO.x + x.measureText("kp").width;
  x.fillStyle = C.trait;
  x.fillRect(fin + 0.1 * LOGO.taille, LOGO.base - 0.1 * LOGO.taille, 0.37 * LOGO.taille, 0.1 * LOGO.taille);
}

/**
 * La couverture en tête de chaque annonce (8 nov. 2026, Jules : « la couverture, à chaque fois la même ; sur Leboncoin tu
 * mets juste l'image, je ne veux pas ça, j'ai fait la couverture exprès ») : le même canva que plus bas, sur tous les
 * canaux (Leboncoin, SeLoger, LinkedIn, WhatsApp, mail), à télécharger pour la poser dans l'annonce.
 */
function CouvertureAnnonce({ photo, nom }) {
  const ref = useRef(null);
  const [etat, setEtat] = useState("dessin");
  useEffect(() => {
    let vivant = true;
    setEtat("dessin");
    dessinerCouverture(ref.current, photo).then(() => vivant && setEtat("pret")).catch(() => vivant && setEtat("erreur"));
    return () => { vivant = false; };
  }, [photo]);
  const telecharger = () => ref.current?.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `couverture-${nom || "bien"}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/jpeg", 0.92);
  return (
    <div className="relative border-b border-bord-doux">
      <canvas ref={ref} className="block h-auto w-full" style={{ aspectRatio: `${L} / ${H}` }} aria-label="La couverture de l'annonce" />
      <button type="button" onClick={telecharger} disabled={etat !== "pret"}
        className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-fond/80 px-3 text-[12.5px] text-encre backdrop-blur hover:bg-fond disabled:opacity-50">
        <Download className="h-3.5 w-3.5" />Couverture
      </button>
    </div>
  );
}

function Couverture({ photo, photos, onPhoto, nom }) {
  const ref = useRef(null);
  const [etat, setEtat] = useState("pret");
  useEffect(() => {
    let vivant = true;
    setEtat("dessin");
    dessinerCouverture(ref.current, photo).then(() => vivant && setEtat("pret")).catch(() => vivant && setEtat("erreur"));
    return () => { vivant = false; };
  }, [photo]);
  const telecharger = () => ref.current?.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `couverture-${nom || "bien"}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/jpeg", 0.92);
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <p className="m-0 text-[15px] text-encre">Couverture</p>
        <button type="button" onClick={telecharger} disabled={etat !== "pret" || !photo}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          <Download className="h-4 w-4" />Télécharger
        </button>
      </div>
      <div className="relative overflow-hidden rounded-[14px]">
        <canvas ref={ref} className="block h-auto w-full" style={{ aspectRatio: `${L} / ${H}` }} aria-label="La couverture de l'annonce" />
        {etat === "dessin" && <span className="absolute inset-0 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-encre" /></span>}
      </div>
      {!photo && <p className="m-0 mt-2 text-[13px] text-ambre">Aucune photo du bien encore : déposez-en dans la Data room, elle se pose ici d'elle-même.</p>}
      {etat === "erreur" && <p className="m-0 mt-2 text-[13px] text-alerte">La photo ne se lit pas : choisissez-en une autre.</p>}
      {photos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="La photo de la couverture">
          {photos.map((u) => (
            <button key={u} type="button" role="radio" aria-checked={u === photo} onClick={() => onPhoto(u)}
              className={`h-14 w-[74px] flex-none overflow-hidden rounded-[8px] border-2 ${u === photo ? "border-menthe" : "border-transparent opacity-70 hover:opacity-100"}`}>
              <img src={u} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function BoutonCopier({ texte, libelle = "Copier" }) {
  const [fait, setFait] = useState(false);
  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); setFait(true); setTimeout(() => setFait(false), 1500); } catch { toast.error("Copie impossible"); }
  };
  return (
    <button type="button" onClick={copier} className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>
      {fait ? <Check className="h-3.5 w-3.5 text-menthe" /> : <Copy className="h-3.5 w-3.5" />}{fait ? "Copié" : libelle}
    </button>
  );
}

/** La case « En ligne » ou « Envoyée » d'une annonce ou de la fiche confrère, avec sa date. */
export function Publie({ le, onChange, mot = "En ligne" }) {
  return (
    <button type="button" onClick={() => onChange(!le)} aria-pressed={!!le}
      className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${le ? "border-menthe/60 text-menthe" : "border-trait text-ardoise hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-full ${le ? "bg-menthe text-sur-menthe" : "border border-bord-vif"}`}>{le && <Check className="h-2.5 w-2.5" />}</span>
      {le ? `${mot} le ${new Date(le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : mot}
    </button>
  );
}

const champ = "w-full rounded-[10px] border border-trait bg-transparent px-3 py-2 text-[14px] leading-[1.6] text-encre outline-none focus:border-menthe max-md:text-[16px]";
// Les champs de l'aperçu : sans cadre, ils se lisent comme l'annonce publiée et se corrigent sur place.
const nu = "w-full border-0 bg-transparent p-0 text-encre outline-none focus:ring-0 placeholder:text-brume max-md:text-[16px]";

/**
 * Une annonce, telle qu'elle paraîtra (7 nov. 2026, Jules : « rendre le module des annonces plus beau ») : la photo de
 * couverture, le titre et le texte corrigés sur place, les mentions repliées dessous ; la copie et « En ligne » en tête.
 */
function Annonce({ canal, valeur, mentions, onGarder, publieLe = null, photo = null, nomCouverture = null }) {
  const [titre, setTitre] = useState(valeur?.titre || "");
  const [texte, setTexte] = useState(valeur?.texte || "");
  const zone = useRef(null);
  useEffect(() => { setTitre(valeur?.titre || ""); setTexte(valeur?.texte || ""); }, [valeur?.titre, valeur?.texte]);
  // Le texte prend sa hauteur : l'annonce se lit d'un bloc, sans ascenseur.
  useEffect(() => { const el = zone.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }, [texte]);
  const complet = [texte, mentions].filter(Boolean).join("\n\n");
  const message = canal.cle === "mail" || canal.cle === "whatsapp";
  return (
    <section className="overflow-hidden k-verre">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bord-doux px-4 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[15px] text-encre">{canal.nom}</p>
          <p className="m-0 text-[12px] tabular-nums text-brume">{texte.length} caractères{canal.titre ? ` · titre ${titre.length}` : ""}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {/* Où l'annonce est en ligne (6 nov. 2026) : coché par le mandataire, l'assistant le sait. */}
          <Publie le={publieLe} onChange={(oui) => onGarder({ canal: canal.cle, publie: oui })} mot={message ? "Envoyée" : "En ligne"} />
          <BoutonCopier texte={canal.titre ? `${titre}\n\n${complet}` : complet} libelle="Tout copier" />
        </div>
      </div>
      <CouvertureAnnonce photo={photo} nom={nomCouverture} />
      <div className="px-5 py-4">
        {canal.titre && (
          <div className="group flex items-start gap-2">
            <input value={titre} onChange={(e) => setTitre(e.target.value)} onBlur={() => titre !== (valeur?.titre || "") && onGarder({ canal: canal.cle, titre })}
              aria-label={`Titre ${canal.nom}`} placeholder="Le titre de l'annonce" className={`${nu} min-w-0 flex-1 text-[18px] font-medium leading-[1.35]`} />
            <span className="opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100"><BoutonCopier texte={titre} libelle="Titre" /></span>
          </div>
        )}
        <textarea ref={zone} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={() => texte !== (valeur?.texte || "") && onGarder({ canal: canal.cle, texte })}
          aria-label={`Texte ${canal.nom}`} rows={4} className={`${nu} ${canal.titre ? "mt-3" : ""} resize-none overflow-hidden text-[14.5px] leading-[1.65] text-craie`} />
        {mentions && <p className="m-0 mt-3 whitespace-pre-line border-t border-bord-doux pt-3 text-[12px] leading-[1.55] text-brume">{mentions}</p>}
      </div>
    </section>
  );
}

// `canalInitial` : le canal ouvert d'emblée (une ligne touchée dans la Diffusion de la Mise en vente, 8 nov. 2026).
export default function AnnoncesBien({ marcheId, dossierId = null, canalInitial = null }) {
  const qc = useQueryClient();
  const cle = ["m-annonces", marcheId];
  const url = `/api/mandataire/marches/${encodeURIComponent(marcheId)}/annonces`;
  const { data, isLoading, isError, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", url), staleTime: 60_000 });
  // Les photos du bien : la Data room et la visite, par la liste des documents du bien.
  const { data: docs } = useQuery({
    queryKey: ["m-documents-bien", { marche: marcheId, dossier: dossierId }],
    queryFn: () => base44.request("GET", `/api/mandataire/biens/documents?${new URLSearchParams({ marche: marcheId, dossier: dossierId || "" })}`),
  });
  const garder = useMutation({
    mutationFn: (corps) => base44.request("PATCH", url, { body: corps }),
    onSuccess: (r) => {
      qc.setQueryData(cle, (v) => ({ ...v, annonces: r.annonces }));
      // « En ligne » coché : la Diffusion et le bandeau de la Mise en vente le comptent aussitôt.
      ["m-diffusion", "m-vente-etat"].forEach((k) => qc.invalidateQueries({ queryKey: [k, marcheId] }));
    },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const refaire = useMutation({
    mutationFn: () => base44.request("GET", `${url}?refaire=1`),
    onSuccess: (r) => { qc.setQueryData(cle, r); toast.success("Annonces réécrites"); },
    onError: (e) => toast.error(e?.message || "Pas réécrites"),
  });
  const a = data?.annonces;
  const photos = [...new Set([a?.photo, ...((docs?.groupes || []).find((g) => g.nature === "photos")?.documents || []).map((d) => d.url)].filter(Boolean))];
  const photo = a?.photo || photos[0] || null;
  const [mentions, setMentions] = useState("");
  useEffect(() => setMentions(a?.mentions || ""), [a?.mentions]);
  const canaux = data?.canaux || [];
  const [choisi, setChoisi] = useState(canalInitial);
  useEffect(() => { if (canalInitial) setChoisi(canalInitial); }, [canalInitial]);
  const canal = canaux.find((c) => c.cle === choisi) || canaux[0] || null;
  const enLigne = canaux.filter((c) => a?.diffusion?.[c.cle]).length;

  if (isLoading) return <p className="m-0 flex items-center gap-2 py-10 text-[14px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Les annonces se rédigent depuis le teaser…</p>;
  if (isError) return <p className="m-0 py-10 text-[14px] text-alerte">{error?.message || "Les annonces ne se chargent pas."}</p>;
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 pb-10 pt-2">
      {/* Où en est la diffusion, en une ligne. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[20px] leading-[1.3] text-encre">{enLigne ? `${enLigne} sur ${canaux.length} canaux diffusés` : "Prêtes à publier"}</p>
          <p className="m-0 mt-1 text-[13px] leading-[1.55] text-ardoise">Une annonce par canal, à copier dans vos comptes. Ni adresse ni enseigne{a?.ref ? ` · réf. ${a.ref}` : ""}.</p>
        </div>
        <button type="button" onClick={() => refaire.mutate()} disabled={refaire.isPending} className="inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>
          {refaire.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Réécrire
        </button>
      </div>
      <div className="flex h-1.5 gap-1" aria-hidden>
        {canaux.map((c) => <span key={c.cle} className={`flex-1 rounded-full ${a?.diffusion?.[c.cle] ? "bg-menthe" : "bg-rail-actif"}`} />)}
      </div>

      {/* Les canaux, un à la fois : la pastille dit s'il est en ligne. */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Canaux">
        {canaux.map((c) => {
          const actif = canal?.cle === c.cle;
          const fait = !!a?.diffusion?.[c.cle];
          return (
            <button key={c.cle} type="button" role="tab" aria-selected={actif} onClick={() => setChoisi(c.cle)}
              className={`inline-flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] ${actif ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-craie"}`} style={actif ? undefined : { background: "transparent" }}>
              <span className={`h-2 w-2 rounded-full ${fait ? "bg-menthe" : "border border-bord-vif"}`} />{c.nom}
            </button>
          );
        })}
      </div>
      {canal && <Annonce key={canal.cle} canal={canal} valeur={a?.canaux?.[canal.cle]} mentions={mentions} photo={photo} nomCouverture={a?.ref} publieLe={a?.diffusion?.[canal.cle] || null} onGarder={(x) => garder.mutate(x)} />}

      <Couverture photo={photo} photos={photos} onPhoto={(u) => garder.mutate({ photo: u })} nom={a?.ref} />

      {/* Les mentions légales, repliées : elles s'ajoutent à chaque copie. */}
      <details className="group rounded-[14px] border border-bord-doux px-4 py-3" open={/\[à compléter\]/.test(mentions) || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] text-encre">
          Mentions légales<span className="text-[12.5px] text-brume group-open:hidden">ajoutées à chaque copie</span>
        </summary>
        <textarea value={mentions} onChange={(e) => setMentions(e.target.value)} onBlur={() => mentions !== (a?.mentions || "") && garder.mutate({ mentions })}
          aria-label="Mentions de l'annonce" rows={5} className={`${champ} mt-3 resize-y`} />
        {/\[à compléter\]/.test(mentions) && <p className="m-0 mt-1.5 text-[12.5px] text-ambre">Complétez ce qui manque (honoraires, RSAC) : l'équipe le tient sur votre fiche.</p>}
      </details>
    </div>
  );
}
