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

function BoutonCopier({ texte, libelle = "Copier" }) {
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

const champ = "w-full rounded-[10px] border border-trait bg-transparent px-3 py-2 text-[14px] leading-[1.6] text-encre outline-none focus:border-menthe max-md:text-[16px]";

/** Une annonce : son titre, son texte (les mentions ajoutées à la copie), retouchés sur place et gardés en quittant le champ. */
function Annonce({ canal, valeur, mentions, onGarder }) {
  const [titre, setTitre] = useState(valeur?.titre || "");
  const [texte, setTexte] = useState(valeur?.texte || "");
  useEffect(() => { setTitre(valeur?.titre || ""); setTexte(valeur?.texte || ""); }, [valeur?.titre, valeur?.texte]);
  const complet = [texte, mentions].filter(Boolean).join("\n\n");
  return (
    <section className="rounded-[14px] bg-rail p-4">
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="m-0 text-[15px] text-encre">{canal.nom}</p>
        <BoutonCopier texte={canal.titre ? `${titre}\n\n${complet}` : complet} libelle="Tout copier" />
      </div>
      {canal.titre && (
        <div className="flex items-center gap-2 pb-2">
          <input value={titre} onChange={(e) => setTitre(e.target.value)} onBlur={() => titre !== (valeur?.titre || "") && onGarder({ canal: canal.cle, titre })}
            aria-label={`Titre ${canal.nom}`} className={`${champ} min-w-0 flex-1`} />
          <BoutonCopier texte={titre} libelle="Titre" />
        </div>
      )}
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={() => texte !== (valeur?.texte || "") && onGarder({ canal: canal.cle, texte })}
        aria-label={`Texte ${canal.nom}`} rows={Math.min(14, Math.max(4, Math.ceil(texte.length / 70)))} className={`${champ} resize-y`} />
      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="text-[12.5px] tabular-nums text-brume">{texte.length} caractères</span>
        <BoutonCopier texte={complet} libelle="Texte" />
      </div>
    </section>
  );
}

export default function AnnoncesBien({ marcheId, dossierId = null }) {
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
    onSuccess: (r) => qc.setQueryData(cle, (v) => ({ ...v, annonces: r.annonces })),
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

  if (isLoading) return <p className="m-0 flex items-center gap-2 py-10 text-[14px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Les annonces se rédigent depuis le teaser…</p>;
  if (isError) return <p className="m-0 py-10 text-[14px] text-alerte">{error?.message || "Les annonces ne se chargent pas."}</p>;
  return (
    <div className="flex flex-col gap-6 pb-10">
      <Couverture photo={photo} photos={photos} onPhoto={(u) => garder.mutate({ photo: u })} nom={a?.ref} />
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">Une annonce par canal{a?.ref ? <span className="text-ardoise"> · réf. {a.ref}</span> : null}</p>
        <button type="button" onClick={() => refaire.mutate()} disabled={refaire.isPending} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          {refaire.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Réécrire
        </button>
      </div>
      <p className="m-0 -mt-4 text-[13px] leading-[1.55] text-ardoise">Publiez-les depuis vos comptes. Ni adresse ni enseigne : l'adresse et le dossier se donnent après l'engagement de confidentialité. Les mentions ci-dessous s'ajoutent à chaque copie.</p>
      {(data?.canaux || []).map((c) => <Annonce key={c.cle} canal={c} valeur={a?.canaux?.[c.cle]} mentions={mentions} onGarder={(x) => garder.mutate(x)} />)}
      <section>
        <p className="m-0 pb-2 text-[15px] text-encre">Mentions</p>
        <textarea value={mentions} onChange={(e) => setMentions(e.target.value)} onBlur={() => mentions !== (a?.mentions || "") && garder.mutate({ mentions })}
          aria-label="Mentions de l'annonce" rows={5} className={`${champ} resize-y`} />
        {/\[à compléter\]/.test(mentions) && <p className="m-0 mt-1.5 text-[12.5px] text-ambre">Complétez ce qui manque (honoraires, RSAC) : l'équipe le tient sur votre fiche.</p>}
      </section>
    </div>
  );
}
