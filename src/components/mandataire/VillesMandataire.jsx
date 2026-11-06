import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, MapPin, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

/**
 * Les villes d'un mandataire (6 nov. 2026, Jules : « pas de secteur : il tape une ville, et je peux lui en charger ») :
 * une liste, et un champ qui cherche n'importe quelle commune de France. Une ville ajoutée se lit en fond : un avis dit
 * le temps à attendre, un spinner la marque dans la liste, le bouton En fond (en bas à gauche) dit où elle en est, et
 * une notification vient quand elle est prête. La même liste chez le mandataire (pilule Villes de la Prospection) et
 * dans la fiche d'un mandataire côté équipe (`email`).
 */
const MOTS = { en_lecture: "en lecture", en_attente: "en attente", a_lire: "en attente" };
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const memeVille = (a, b) => norm(a) === norm(b);

const apiDe = (email) => (email ? `/api/mandataire/admin/mandataires/${encodeURIComponent(email)}/villes` : "/api/mandataire/villes");
export const cleVilles = (email) => (email ? ["admin-villes", String(email).toLowerCase()] : ["m-villes"]);

export function useVilles(email = null) {
  return useQuery({
    queryKey: cleVilles(email), queryFn: () => base44.request("GET", apiDe(email)),
    refetchInterval: (q) => ((q.state.data?.villes || []).some((v) => enCours(v)) ? 30_000 : false),
  });
}

/**
 * Ce qui reste à faire dans une ville, en quelques mots ; null quand elle est prête. Jamais les prix (1er nov. puis
 * 6 nov. 2026, Jules) : seulement ce qui change ce que le mandataire voit, la lecture et les propriétaires.
 */
export function enCours(v) {
  if (v.etat !== "lue") return MOTS[v.etat] || "en attente";
  return v.preparation?.proprietaires_a_faire > 0 ? "propriétaires en cours" : null;
}

/** Pure : « 30 min », « 1 h 30 ». */
export const enMinutes = (n) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h${n % 60 ? ` ${String(n % 60).padStart(2, "0")}` : ""}`);
/** Pure : quand une ville devrait être prête, en clair (« vers 15 h 40 », « dans quelques minutes »). */
export function quandPrete(v, maintenant = Date.now()) {
  if (!v?.pret_vers || v.etat === "lue") return null;
  const t = Date.parse(v.pret_vers);
  if (t - maintenant < 5 * 60_000) return "dans quelques minutes";
  const d = new Date(t);
  return `vers ${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Chercher une commune et l'ajouter. */
function AjoutVille({ email, onAjoutee }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [vu, setVu] = useState("");
  useEffect(() => { const t = setTimeout(() => setVu(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useQuery({ queryKey: ["m-communes", vu], queryFn: () => base44.request("GET", `/api/mandataire/communes?q=${encodeURIComponent(vu)}`), enabled: vu.length >= 2, staleTime: 60 * 60_000 });
  const ajouter = useMutation({
    mutationFn: (c) => base44.request("POST", apiDe(email), { body: { nom: c.nom, code: c.code, population: c.population } }),
    onSuccess: (r) => {
      // Ce n'est pas instantané (6 nov. 2026, Jules) : l'avis dit combien de temps, et qu'une notification suivra.
      const nom = r?.ville?.nom || "La ville";
      if (r?.prete) toast.success(`${nom} est prête`);
      else toast.success(`${nom} part en lecture`, { description: `Un agent lit ses commerces en fond : prête dans environ ${enMinutes(r?.pret_dans || 20)}. Vous recevrez une notification.`, duration: 9000 });
      setQ(""); setVu("");
      qc.invalidateQueries({ queryKey: cleVilles(email) });
      qc.invalidateQueries({ queryKey: ["m-prospecter"] });
      onAjoutee?.(r?.ville);
    },
    onError: (e) => toast.error(e?.message || "Ville non ajoutée"),
  });
  const communes = vu.length >= 2 ? data?.communes || [] : [];
  return (
    <div>
      <label className="flex h-10 items-center gap-2 rounded-full border border-bord-doux bg-rail px-4 focus-within:border-bord-vif">
        {ajouter.isPending || isFetching ? <Loader2 className="h-4 w-4 flex-none animate-spin text-ardoise" /> : <Plus className="h-4 w-4 flex-none text-ardoise" />}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter une ville" aria-label="Ajouter une ville"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
      </label>
      {communes.length > 0 && (
        <ul className="m-0 mt-1.5 list-none p-0">
          {communes.map((c) => (
            <li key={c.code}>
              <button type="button" disabled={ajouter.isPending} onClick={() => ajouter.mutate(c)}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] text-encre hover:bg-rail-actif" style={{ background: "transparent" }}>
                <span className="min-w-0 flex-1 truncate">{c.nom}</span>
                <span className="flex-none text-[12.5px] text-brume">{c.departement}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * La liste des villes. `choisie` / `onChoisir` : la Prospection filtre sur une ville (null : toutes) ; sans eux, une
 * simple liste (la fiche du mandataire côté équipe).
 */
export function ListeVilles({ email = null, choisie, onChoisir = null, vide = "Aucune ville encore." }) {
  const qc = useQueryClient();
  const { data, isLoading } = useVilles(email);
  const villes = data?.villes || [];
  const retirer = useMutation({
    mutationFn: (v) => base44.request("DELETE", `${apiDe(email)}/${encodeURIComponent(v.cle)}`),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: cleVilles(email) });
      qc.invalidateQueries({ queryKey: ["m-prospecter"] });
      if (onChoisir && memeVille(choisie, v.nom)) onChoisir(null);
    },
    onError: (e) => toast.error(e?.message || "Ville non retirée"),
  });
  const ligne = "flex min-h-[40px] items-center gap-3 rounded-[10px] px-3 text-[14px]";
  return (
    <div className="flex flex-col gap-2">
      {isLoading ? <p className="m-0 px-3 py-2 text-[13px] text-brume">Chargement…</p> : (
        <ul className="m-0 list-none p-0">
          {onChoisir && villes.length > 1 && (
            <li>
              <button type="button" onClick={() => onChoisir(null)} className={`${ligne} w-full text-left text-encre hover:bg-rail-actif`} style={{ background: "transparent" }}>
                <span className="min-w-0 flex-1">Toutes mes villes</span>
                {!choisie && <Check className="h-4 w-4 flex-none text-menthe" />}
              </button>
            </li>
          )}
          {villes.map((v) => {
            const reste = enCours(v);
            const ici = onChoisir && memeVille(choisie, v.nom);
            const corps = (
              <>
                <span className="min-w-0 flex-1 truncate text-encre">{v.nom}</span>
                {/* Juste un spinner (6 nov. 2026, Jules) : le détail est dans le bouton En fond. */}
                {reste && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-ardoise" aria-label={`${v.nom} : ${reste}`} />}
                {ici && <Check className="h-4 w-4 flex-none text-menthe" />}
              </>
            );
            return (
              <li key={v.cle} className="group flex items-center">
                {onChoisir
                  ? <button type="button" onClick={() => onChoisir(v.nom)} className={`${ligne} min-w-0 flex-1 text-left hover:bg-rail-actif`} style={{ background: "transparent" }}>{corps}</button>
                  : <span className={`${ligne} min-w-0 flex-1`}>{corps}</span>}
                <button type="button" onClick={() => retirer.mutate(v)} disabled={retirer.isPending} aria-label={`Retirer ${v.nom}`} title="Retirer"
                  className="grid h-8 w-8 flex-none place-items-center rounded-full text-brume hover:bg-rail-actif hover:text-encre" style={{ background: "transparent" }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
          {!villes.length && <li className="px-3 py-2 text-[13px] text-brume">{vide}</li>}
        </ul>
      )}
      <AjoutVille email={email} onAjoutee={(v) => { if (onChoisir && v?.nom && villes.length) onChoisir(v.nom); }} />
    </div>
  );
}

/** La pilule Villes de la Prospection : la ville regardée, et la liste qui s'ouvre dessous. */
export function PiluleVilles({ choisie, onChoisir }) {
  const { data } = useVilles();
  const villes = data?.villes || [];
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (!racine.current?.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("mousedown", dehors); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  const mot = choisie || (villes.length === 1 ? villes[0].nom : villes.length ? "Toutes mes villes" : "Choisir une ville");
  return (
    <div ref={racine} className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-encre hover:border-bord-vif">
        <MapPin className="h-4 w-4 text-ardoise" />{mot}
        <ChevronDown className={`h-4 w-4 text-ardoise transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[320px] max-w-[calc(100vw-32px)] rounded-[14px] border border-bord-doux bg-surface-pleine p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.35)]">
          <ListeVilles choisie={choisie} onChoisir={(v) => { onChoisir(v); setOuvert(false); }} vide="Tapez une ville pour commencer." />
        </div>
      )}
    </div>
  );
}

/**
 * Ce qui tourne en fond, en bas à gauche (6 nov. 2026, Jules : « ça gêne la vue ; un truc en bas à gauche qu'on peut
 * ouvrir, sinon juste un spinner ») : fermé, un rond avec un spinner ; ouvert, chaque ville, son étape et l'heure où
 * elle devrait être prête, et la phrase qui dit que ce n'est pas instantané. `autres` : d'autres tâches de la page
 * ({ cle, titre, detail }), comme le recensement des locaux vides. Rien en cours : rien à l'écran.
 */
export function EnFond({ autres = [] }) {
  const { data } = useVilles();
  const [ouvert, setOuvert] = useState(false);
  const villes = (data?.villes || []).filter((v) => enCours(v));
  const taches = [
    ...villes.map((v) => ({
      cle: v.cle, titre: v.nom,
      detail: v.etat !== "lue" ? `Lecture des commerces${quandPrete(v) ? `, prête ${quandPrete(v)}` : ""}` : `Propriétaires : ${v.preparation.proprietaires_a_faire} à chercher`,
    })),
    ...autres,
  ];
  if (!taches.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-40 md:left-[calc(var(--k-barre-largeur,0px)+16px)]">
      {ouvert && (
        <div className="mb-2 w-[320px] max-w-[calc(100vw-32px)] rounded-[14px] border border-bord-doux bg-surface-pleine p-4 shadow-[0_16px_40px_rgb(0_0_0/0.35)]">
          <div className="flex items-start gap-3">
            <p className="m-0 min-w-0 flex-1 text-[14px] text-encre">En fond</p>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:bg-rail-actif hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-ardoise">Un agent lit vos villes en fond : ce n'est pas instantané. Une notification vous prévient quand une ville est prête.</p>
          <ul className="m-0 mt-3 list-none p-0">
            {taches.map((t) => (
              <li key={t.cle} className="flex items-start gap-2.5 border-t border-trait py-2.5">
                <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-none animate-spin text-menthe" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-encre">{t.titre}</span>
                  <span className="block text-[12.5px] text-ardoise">{t.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-label={`${taches.length} tâche${taches.length > 1 ? "s" : ""} en fond`} title="En fond"
        className="relative grid h-11 w-11 place-items-center rounded-full border border-bord-doux bg-surface-pleine shadow-[0_8px_24px_rgb(0_0_0/0.25)] hover:border-bord-vif">
        <Loader2 className="h-4 w-4 animate-spin text-menthe" />
        {taches.length > 1 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-menthe px-1 text-[11px] font-medium text-sur-menthe">{taches.length}</span>}
      </button>
    </div>
  );
}
