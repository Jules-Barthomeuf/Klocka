import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { ExternalLink, Eye, Loader2, Monitor, Plus, Smartphone, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { Fenetre, req, bouton, boutonLigne, boutonPlein, champ } from "./commun";

// Les assets (9 oct. 2026) : ce qu'on glisse dans un mail en un clic, depuis
// l'éditeur (« Insérer un asset »). Le simulateur et son lien personnel, les
// lead magnets, un lien, un encadré. On les décrit à AK, qui les crée ; on les
// renomme, retouche ou supprime ici.

const GENRES = { simulateur: "Simulateur", lead_magnet: "Lead magnet", lien: "Lien", bloc: "Encadré" };
const MOTS_BLOC = { titre: "Titre", texte: "Texte", bouton: "Bouton", image: "Image", separateur: "Séparateur" };

/** L'aperçu d'un asset : ses blocs, à peu près comme dans le mail. */
function Apercu({ blocs }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-trait bg-surface px-3.5 py-3">
      {blocs.map((b) => (
        b.type === "bouton" ? <span key={b.id} className="self-start rounded-full bg-menthe px-3 py-1 text-[12.5px] text-sur-menthe">{b.texte || "Bouton"}</span>
          : b.type === "titre" ? <span key={b.id} className="text-[14px] text-encre">{b.texte}</span>
            : b.type === "separateur" ? <span key={b.id} className="h-px bg-trait" />
              : b.type === "image" ? <span key={b.id} className="text-[12px] text-ardoise">Image · {b.src || "sans adresse"}</span>
                : <span key={b.id} className="whitespace-pre-line text-[13px] leading-[1.5] text-craie">{b.texte}</span>
      ))}
    </div>
  );
}

/**
 * Le lien d'un asset tel qu'un contact l'ouvre, pour la prévisualisation : le
 * lien personnel devient celui d'un exemple (« k=exemple »), que le serveur
 * ne range dans aucune fiche ; rien n'est compté.
 */
export const lienDApercu = (asset) => {
  const lien = (asset?.blocs || []).find((b) => b.type === "bouton" && b.lien)?.lien || "";
  return lien.replace(/\{\{\s*lien_simulateur\s*\}\}/g, "/SimulateurPublic?k=exemple").replace(/\{\{\s*k\s*\}\}/g, "exemple").replace(/^https?:\/\/[^/]+(?=\/(SimulateurPublic|FeuilleDeRoute)\b)/, "");
};

/** Ce que voit le contact en cliquant : la page dans une fenêtre, sur ordinateur ou au téléphone. */
function Previsualiser({ asset, onFermer }) {
  const [ecran, setEcran] = useState("ordinateur");
  const url = lienDApercu(asset);
  const interne = url.startsWith("/");
  useEffect(() => {
    const echap = (e) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-fond/90 backdrop-blur-sm duration-200 animate-in fade-in-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait bg-surface-pleine px-5 py-3 max-md:px-3">
        <span className="text-[14px] text-encre">{asset.nom}</span>
        <span className="text-[12.5px] text-ardoise">Ce que voit un contact après avoir cliqué. Aperçu d'exemple : rien n'est compté.</span>
        <span className="ml-auto flex gap-1 rounded-full bg-rail-actif p-1 max-md:hidden">
          {[["ordinateur", Monitor, "Ordinateur"], ["telephone", Smartphone, "Téléphone"]].map(([k, Icone, mot]) => (
            <button key={k} type="button" onClick={() => setEcran(k)} aria-pressed={ecran === k} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] ${ecran === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={ecran === k ? undefined : { background: "transparent" }}><Icone className="h-3.5 w-3.5" />{mot}</button>
          ))}
        </span>
        <a href={url} target="_blank" rel="noreferrer" className={boutonLigne}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Ouvrir dans un onglet</a>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-5 max-md:p-0">
        {!url ? <p className="m-0 self-center text-[14px] text-brume">Cet asset n'a pas de bouton avec un lien.</p>
          : interne ? (
            <iframe title={`Aperçu de ${asset.nom}`} src={url}
              className={`h-full rounded-[14px] border border-bord-doux bg-fond transition-[width] duration-300 max-md:w-full max-md:rounded-none max-md:border-0 ${ecran === "telephone" ? "w-[390px]" : "w-full max-w-[1400px]"}`} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 self-center text-center">
              <p className="m-0 text-[14px] text-craie">Ce lien mène hors de Klocka : {url}</p>
              <a href={url} target="_blank" rel="noreferrer" className={boutonPlein}><ExternalLink className="h-3.5 w-3.5" />L'ouvrir dans un onglet</a>
            </div>
          )}
      </div>
    </div>,
    document.body,
  );
}

/** Retoucher un asset : son nom, sa description, chaque bloc (texte, lien). */
function Retoucher({ asset, onFermer }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState(asset);
  const enregistrer = useMutation({
    mutationFn: () => req("PATCH", `/assets/${asset.id}`, { nom: v.nom, description: v.description, blocs: v.blocs }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["emailing-assets"] }); toast.success("Asset enregistré"); onFermer(); },
    onError: (e) => toast.error(e?.message || "Enregistrement impossible"),
  });
  const bloc = (id, patch) => setV((x) => ({ ...x, blocs: x.blocs.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  return (
    <Fenetre titre={`Retoucher « ${asset.nom} »`} onFermer={onFermer} large
      pied={<><button type="button" className={bouton} onClick={onFermer}>Annuler</button><button type="button" className={boutonPlein} disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()}>Enregistrer</button></>}>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6 max-md:grid-cols-1">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Nom<input value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} className={champ} /></label>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Description<input value={v.description || ""} onChange={(e) => setV({ ...v, description: e.target.value })} className={champ} /></label>
          {v.blocs.map((b, i) => (
            <div key={b.id} className="flex flex-col gap-1.5 border-t border-trait pt-3">
              <span className="flex items-center justify-between text-[12.5px] text-ardoise">{MOTS_BLOC[b.type] || b.type}
                {v.blocs.length > 1 && <button type="button" onClick={() => setV({ ...v, blocs: v.blocs.filter((x) => x.id !== b.id) })} aria-label="Retirer ce bloc" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>}
              </span>
              {b.type !== "separateur" && b.type !== "image" && (b.type === "texte"
                ? <textarea value={b.texte || ""} onChange={(e) => bloc(b.id, { texte: e.target.value })} rows={3} className={`${champ} h-auto py-2`} />
                : <input value={b.texte || ""} onChange={(e) => bloc(b.id, { texte: e.target.value })} className={champ} />)}
              {(b.type === "bouton" || b.type === "image") && <input value={b.type === "image" ? b.src || "" : b.lien || ""} onChange={(e) => bloc(b.id, b.type === "image" ? { src: e.target.value } : { lien: e.target.value })} placeholder={b.type === "image" ? "Adresse de l'image" : "Lien du bouton"} className={champ} />}
              {i === 0 && asset.genre === "simulateur" && <span className="text-[12px] text-ardoise">Le bouton garde {"{{lien_simulateur}}"} : c'est le lien personnel de chaque contact.</span>}
            </div>
          ))}
          <div className="flex gap-2">
            {["texte", "bouton", "titre"].map((t) => <button key={t} type="button" className={boutonLigne} onClick={() => setV({ ...v, blocs: [...v.blocs, { id: `n${Date.now().toString(36)}`, type: t, texte: t === "bouton" ? "En savoir plus" : "", ...(t === "bouton" ? { lien: "https://klocka.immo" } : {}) }] })}><Plus className="mr-1 h-3 w-3" />{MOTS_BLOC[t]}</button>)}
          </div>
        </div>
        <div><p className="m-0 mb-2 text-[12.5px] text-ardoise">Aperçu</p><Apercu blocs={v.blocs} /></div>
      </div>
    </Fenetre>
  );
}

/** Créer un asset : on le décrit, AK le prépare ; ou on part d'un encadré vide. */
function Creer({ onFermer }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const fini = (r) => { queryClient.invalidateQueries({ queryKey: ["emailing-assets"] }); toast.success(`« ${r.asset.nom} » créé : retouchez-le si besoin`); onFermer(r.asset); };
  const generer = useMutation({ mutationFn: () => req("POST", "/assets/generer", { description }), onSuccess: fini, onError: (e) => toast.error(e?.message || "Création impossible") });
  const vide = useMutation({ mutationFn: () => req("POST", "/assets", { nom: "Nouvel asset", genre: "bloc", blocs: [{ type: "texte", texte: "Votre texte" }, { type: "bouton", texte: "En savoir plus", lien: "https://klocka.immo" }] }), onSuccess: fini });
  return (
    <Fenetre titre="Nouvel asset" onFermer={() => onFermer(null)}
      pied={<><button type="button" className={bouton} disabled={vide.isPending} onClick={() => vide.mutate()}>Partir d'un encadré vide</button><button type="button" className={boutonPlein} disabled={description.trim().length < 8 || generer.isPending} onClick={() => generer.mutate()}>{generer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Créer avec AK</button></>}>
      <p className="m-0 mb-2 text-[13px] text-craie">Décrivez ce que vous voulez glisser dans vos mails : AK prépare le texte et le bouton.</p>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} autoFocus
        placeholder="Ex. : le replay du webinaire du 12 octobre, en deux phrases, avec un bouton vers la vidéo" className={`${champ} h-auto py-2.5`} />
    </Fenetre>
  );
}

export default function Assets({ demande = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["emailing-assets"], queryFn: () => req("GET", "/assets") });
  const [creer, setCreer] = useState(false);
  const [ouvert, setOuvert] = useState(null);
  const [apercu, setApercu] = useState(null);
  useEffect(() => { if (demande?.quoi === "nouveau") setCreer(true); }, [demande?.n]);
  const renommer = useMutation({ mutationFn: ({ id, nom }) => req("PATCH", `/assets/${id}`, { nom }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["emailing-assets"] }) });
  const supprimer = useMutation({ mutationFn: (id) => req("DELETE", `/assets/${id}`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["emailing-assets"] }); toast.success("Asset supprimé"); } });
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const liste = data?.assets || [];
  return (
    <div className="px-10 pb-20 pt-7 max-md:px-4 max-md:pt-5">
      <p className="m-0 max-w-[70ch] text-[13px] text-ardoise">Dans un mail, « Insérer un asset » sous les blocs le glisse en un clic. Le simulateur porte le lien personnel de chaque contact : on sait qui l'utilise, et le call pris depuis le simulateur le sort des newsletters.</p>
      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {liste.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-[14px] border border-trait bg-rail p-4">
            <div className="flex items-start justify-between gap-2">
              <input defaultValue={a.nom} onBlur={(e) => { const nom = e.target.value.trim(); if (nom && nom !== a.nom) renommer.mutate({ id: a.id, nom }); }} aria-label="Nom de l'asset"
                className="min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-[14.5px] text-encre outline-none hover:border-bord-doux focus:border-bord-vif" />
              <span className="flex-none rounded-full border border-bord-doux px-2 py-px text-[11.5px] text-ardoise">{GENRES[a.genre] || a.genre}</span>
            </div>
            {a.description && <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">{a.description}</p>}
            <Apercu blocs={a.blocs || []} />
            <div className="mt-auto flex items-center justify-end gap-1.5">
              <button type="button" onClick={() => { if (window.confirm(`Supprimer « ${a.nom} » ? Les mails qui l'ont déjà gardent leurs blocs.`)) supprimer.mutate(a.id); }} aria-label={`Supprimer ${a.nom}`} className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              {lienDApercu(a) && <button type="button" onClick={() => setApercu(a)} className={boutonLigne}><Eye className="mr-1.5 h-3.5 w-3.5" />Prévisualiser</button>}
              <button type="button" onClick={() => setOuvert(a)} className={`${boutonLigne} text-encre`}>Retoucher</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setCreer(true)} className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-bord-doux text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
          <Sparkles className="h-4 w-4 text-menthe" />Décrire un nouvel asset
        </button>
      </div>
      {creer && <Creer onFermer={(a) => { setCreer(false); if (a) setOuvert(a); }} />}
      {ouvert && <Retoucher asset={ouvert} onFermer={() => setOuvert(null)} />}
      {apercu && <Previsualiser asset={apercu} onFermer={() => setApercu(null)} />}
    </div>
  );
}
