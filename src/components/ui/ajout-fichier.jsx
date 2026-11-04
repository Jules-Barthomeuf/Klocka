import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, HardDrive, Loader2, Monitor, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Le « + » partout (4 nov. 2026, Jules : « lorsqu'on clique sur plus, soit on importe un fichier depuis l'ordi, soit
// un fichier depuis le Drive ; ça permet d'aller directement le chercher dans le Google Drive »). Un petit menu sous le
// « + » : l'ordinateur ouvre le choix de fichiers habituel ; le Drive ouvre le vrai Google Drive (le sélecteur de
// Google), avec le propre compte Google de la personne (server/routes/integrations.js), et notre liste en repli. Un fichier du Drive arrive comme un fichier de l'ordinateur : chaque
// « + » le range comme d'habitude.

const quand = (iso) => (iso && !isNaN(new Date(iso)) ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : "");

/** Le contenu d'un fichier du Drive, en `File` du navigateur. */
async function fichierDuDrive(f) {
  const r = await fetch(`/api/drive/mes-fichiers/${encodeURIComponent(f.id)}/contenu`, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Le Drive n'a pas rendu « ${f.nom} »`);
  const nom = decodeURIComponent(r.headers.get("X-Nom-Fichier") || "") || f.nom;
  const blob = await r.blob();
  return new File([blob], nom, { type: blob.type || f.mime || "application/octet-stream" });
}

// --- Le vrai Google Drive : le sélecteur de Google (Picker) -----------------------------------------------------------

let chargementPicker = null;
/** Le script de Google, puis le module picker, chargés une fois. */
function chargerPicker() {
  if (window.google?.picker) return Promise.resolve();
  if (chargementPicker) return chargementPicker;
  chargementPicker = new Promise((ok, ko) => {
    const pret = () => window.gapi.load("picker", { callback: ok, onerror: () => ko(new Error("Le sélecteur Google ne se charge pas")) });
    if (window.gapi) return pret();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = pret;
    s.onerror = () => ko(new Error("Google injoignable"));
    document.head.appendChild(s);
  }).catch((e) => { chargementPicker = null; throw e; });
  return chargementPicker;
}

/**
 * Ouvre le Drive de la personne, l'interface de Google (4 nov. 2026, Jules : « il faut que ça ouvre le vrai Google
 * Drive et on va sélectionner les documents qu'on veut »). Rend les fichiers choisis, en `File`, ou [] si on ferme.
 * `null` : pas de compte Google avec le Drive. Lève si Google refuse (clé, sélecteur non activé) : la liste prend le relais.
 */
async function choisirDansLeDrive({ multiple = true } = {}) {
  // Sans clé à lui, le sélecteur de Google refuse de s'ouvrir : la liste prend le relais.
  if (!import.meta.env.VITE_GOOGLE_PICKER_KEY) throw new Error("VITE_GOOGLE_PICKER_KEY absente");
  const [infos] = await Promise.all([base44.request("GET", "/api/drive/jeton"), chargerPicker()]);
  if (!infos?.jeton) return null;
  // Une clé à elle, avec l'API Google Picker autorisée : celle de Maps est refusée (« clé de développement non valide »).
  const cle = import.meta.env.VITE_GOOGLE_PICKER_KEY || null;
  const P = window.google.picker;
  const choisis = await new Promise((ok) => {
    const vue = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setOwnedByMe(false);
    const constructeur = new P.PickerBuilder()
      .addView(vue)
      .addView(new P.DocsView(P.ViewId.DOCS).setEnableDrives(true).setIncludeFolders(true))
      .addView(new P.DocsView(P.ViewId.RECENTLY_PICKED))
      .setOAuthToken(infos.jeton)
      .setLocale("fr")
      .setTitle("Choisir dans Google Drive")
      .setCallback((d) => {
        if (d[P.Response.ACTION] === P.Action.PICKED) ok(d[P.Response.DOCUMENTS] || []);
        else if (d[P.Response.ACTION] === P.Action.CANCEL) ok([]);
      });
    if (cle) constructeur.setDeveloperKey(cle);
    if (infos.app_id) constructeur.setAppId(infos.app_id);
    if (multiple) constructeur.enableFeature(P.Feature.MULTISELECT_ENABLED);
    constructeur.enableFeature(P.Feature.SUPPORT_DRIVES);
    const picker = constructeur.build();
    picker.setVisible(true);
  });
  const faits = [];
  for (const doc of choisis) {
    const f = { id: doc[P.Document.ID], nom: doc[P.Document.NAME], mime: doc[P.Document.MIME_TYPE] };
    try { faits.push(await fichierDuDrive(f)); } catch (e) { toast.error(e?.message || "Fichier non rapatrié"); }
  }
  return faits;
}

/** La liste du Drive : cocher, puis « Importer ». Le repli quand le sélecteur de Google ne s'ouvre pas. */
export function ChoixDrive({ multiple = true, onFichiers, onFermer }) {
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState(() => new Map());
  const [enCours, setEnCours] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["drive-mes-fichiers", recherche],
    queryFn: () => base44.request("GET", `/api/drive/mes-fichiers?recherche=${encodeURIComponent(recherche)}`),
  });
  const fichiers = data?.fichiers || [];
  const basculer = (f) => setChoisis((m) => {
    const n = new Map(multiple ? m : []);
    if (m.has(f.id)) n.delete(f.id); else n.set(f.id, f);
    return n;
  });
  const importer = async () => {
    setEnCours(true);
    const faits = [];
    for (const f of choisis.values()) {
      try { faits.push(await fichierDuDrive(f)); } catch (e) { toast.error(e?.message || "Fichier non rapatrié"); }
    }
    setEnCours(false);
    if (faits.length) { onFichiers(faits); onFermer(); }
  };
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);

  return createPortal(
    // Un portail rend ses clics à l'arbre React : ils ne doivent pas rouvrir la case qui a ouvert la liste.
    <div onClick={(e) => { e.stopPropagation(); onFermer(); }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-6 max-md:p-3">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] border border-bord bg-surface shadow-[0_30px_80px_rgba(0,0,0,.6)] max-md:max-h-[calc(100dvh-24px)]">
        <header className="flex items-center justify-between gap-4 border-b border-trait px-5 py-4">
          <div className="min-w-0">
            <p className="m-0 text-[15px] text-encre">Depuis Google Drive</p>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-brume">{data?.compte || "Votre Drive"}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </header>
        {!isLoading && !error && !data?.compte ? (
          <p className="m-0 px-5 py-8 text-[13.5px] leading-[1.55] text-ardoise">Aucun compte Google avec accès au Drive n'est connecté. Connectez votre compte Google (Compte, Boîtes mail) en accordant l'accès au Drive, puis revenez ici.</p>
        ) : (
          <>
            <label className="flex items-center gap-3 border-b border-trait px-5 py-3">
              <Search className="h-4 w-4 flex-none text-brume" />
              <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher par nom…" aria-label="Chercher dans le Drive"
                className="w-full border-0 bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            </label>
            <div className="min-h-[160px] flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="m-0 inline-flex items-center gap-2 px-5 py-8 text-[13px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Lecture du Drive…</p>
              ) : error ? (
                <p className="m-0 px-5 py-8 text-[13.5px] text-alerte">{error?.message || "Drive injoignable"}</p>
              ) : !fichiers.length ? (
                <p className="m-0 px-5 py-8 text-[13.5px] text-brume">Aucun fichier.</p>
              ) : fichiers.map((f) => {
                const pris = choisis.has(f.id);
                return (
                  <button key={f.id} type="button" onClick={() => basculer(f)} className="flex w-full items-center gap-4 border-b border-trait px-5 py-3 text-left hover:bg-relief/40" style={{ background: "transparent" }}>
                    <span className={`grid h-4 w-4 flex-none place-items-center rounded-[5px] border ${pris ? "border-menthe bg-menthe" : "border-bord-vif"}`}>{pris && <Check className="h-3 w-3 text-fond" strokeWidth={3} />}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-encre">{f.nom}</span>
                    <span className="w-[70px] flex-none text-right text-[12.5px] text-brume">{quand(f.modifie_le)}</span>
                  </button>
                );
              })}
            </div>
            <footer className="flex items-center justify-between gap-4 border-t border-trait px-5 py-4">
              <span className="text-[12.5px] text-brume">{choisis.size ? `${choisis.size} fichier${choisis.size > 1 ? "s" : ""} choisi${choisis.size > 1 ? "s" : ""}` : "Cochez ce qu'il faut importer."}</span>
              <button type="button" onClick={importer} disabled={!choisis.size || enCours} className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
                {enCours && <Loader2 className="h-4 w-4 animate-spin" />} Importer
              </button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Le « + » à deux sources. `onOrdinateur` ouvre le choix de fichiers de la page (son <input type="file">) ;
 * `onFichiers` reçoit les fichiers venus du Drive, comme ceux de l'ordinateur. Rend `ouvrir(ev)` à poser sur le « + »
 * et `rendu`, à placer n'importe où dans la page (le menu et la liste sont en portail).
 */
export function useAjoutFichier({ onOrdinateur, onFichiers, multiple = true }) {
  const [menu, setMenu] = useState(null);
  const [drive, setDrive] = useState(false);
  const ouvrir = useCallback((ev) => {
    ev?.stopPropagation?.();
    ev?.preventDefault?.();
    const r = ev?.currentTarget?.getBoundingClientRect?.();
    const x = r ? r.left : ev?.clientX ?? 40;
    const bas = r ? r.bottom : ev?.clientY ?? 40;
    const haut = r ? r.top : bas;
    setMenu({ x: Math.min(x, window.innerWidth - 240), y: bas + 6, haut });
  }, []);
  const fermer = useCallback(() => setMenu(null), []);
  useEffect(() => {
    if (!menu) return undefined;
    const k = (e) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu, fermer]);
  const ouvrirDrive = async () => {
    try {
      const faits = await choisirDansLeDrive({ multiple });
      if (faits === null) { toast.error("Aucun compte Google avec accès au Drive", { description: "Connectez votre compte Google (Compte, Boîtes mail) en accordant l'accès au Drive." }); return; }
      if (faits.length) onFichiers(faits);
    } catch (e) {
      console.warn("[drive] sélecteur Google :", e?.message || e);
      setDrive(true);
    }
  };
  // Près du bas de l'écran (la saisie d'un chat), le menu s'ouvre au-dessus du « + ».
  const enHaut = menu && menu.y + 110 > window.innerHeight;
  const choix = (Icone, mot, faire) => (
    <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); fermer(); faire(); }}
      className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
      <Icone className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} /> {mot}
    </button>
  );
  const rendu = (
    <>
      {menu && createPortal(
        <div className="fixed inset-0 z-[85]" onClick={(e) => { e.stopPropagation(); fermer(); }}>
          <div role="menu" onClick={(e) => e.stopPropagation()}
            className="absolute w-[230px] rounded-[14px] border border-bord bg-surface-pleine p-1.5 shadow-[0_18px_50px_rgb(0_0_0/0.45)]"
            style={enHaut ? { left: menu.x, bottom: window.innerHeight - menu.haut + 6 } : { left: menu.x, top: menu.y }}>
            {choix(Monitor, "Depuis l'ordinateur", () => onOrdinateur?.())}
            {choix(HardDrive, "Depuis Google Drive", ouvrirDrive)}
          </div>
        </div>,
        document.body,
      )}
      {drive && <ChoixDrive multiple={multiple} onFichiers={onFichiers} onFermer={() => setDrive(false)} />}
    </>
  );
  return { ouvrir, rendu };
}
