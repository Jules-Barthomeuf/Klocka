import React, { useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileUp, ImagePlus, Loader2, Mail, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { bouton, boutonPlein, champ } from "@/components/off-market/commun";

// Le dossier de vente (27 oct. 2026, Jules : plus d'analyste). Le premier temps de la Commercialisation d'un bien :
// les pièces et leur état, les points que leur lecture fait apparaître (les grilles de l'analyse de l'équipe), le
// droit de préférence du locataire, puis « Mettre en vente », actif quand le dossier est complet et sans point
// bloquant. Le serveur est dans server/dossier-vente.js.

const ETATS = {
  recue: ["text-menthe", "Reçue"],
  en_lecture: ["text-ardoise k-scintille", "En lecture"],
  a_verifier: ["text-ambre", "À vérifier"],
  manquante: ["text-ardoise", "Manquante"],
};
const NIVEAUX = { bloquant: ["text-alerte", "Bloquant"], signale: ["text-ambre", "À voir"] };
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

/** Le dossier d'un bien, avant sa mise en vente. `dossierId` : le dossier né du mandat signé. */
export default function DossierVente({ dossierId }) {
  const queryClient = useQueryClient();
  const cle = ["m-dossier-vente", dossierId];
  const url = `/api/mandataire/dossiers/${encodeURIComponent(dossierId)}`;
  const { data: v, isLoading } = useQuery({
    queryKey: cle,
    queryFn: () => base44.request("GET", `${url}/vente`),
    // Les pièces se lisent en arrière-plan : l'écran se relit tant que la lecture tourne.
    refetchInterval: (q) => (q.state.data?.pieces?.some((p) => p.etat === "en_lecture") ? 5000 : false),
  });
  const relire = () => { queryClient.invalidateQueries({ queryKey: cle }); queryClient.invalidateQueries({ queryKey: ["m-dossiers"] }); };
  const vente = useMutation({
    mutationFn: () => base44.request("POST", `${url}/vente`),
    onSuccess: () => {
      ["m-dossiers", "m-marches", "m-dossier-vente"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success("Le bien est en vente");
    },
    onError: (e) => toast.error(e?.message || "Pas encore"),
  });

  if (isLoading) return <Loader titre="Le dossier…" />;
  if (!v) return null;

  return (
    <section aria-label="Le dossier" className="mt-2 rounded-[16px] bg-rail p-5 max-md:-mx-1 max-md:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-normal text-encre">Le dossier</h2>
          <p className={`m-0 mt-0.5 text-[13.5px] ${v.pret ? "text-menthe" : "text-ambre"}`}>{v.phrase}</p>
        </div>
        <button type="button" onClick={() => vente.mutate()} disabled={!v.pret || vente.isPending} title={v.pret ? undefined : v.raisons.join(" ")} className={`${boutonPlein} max-md:w-full max-md:justify-center`}>
          {vente.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Mettre en vente
        </button>
      </div>

      <Pieces v={v} url={url} relire={relire} />
      <Photos photos={v.dossier.photos} url={url} relire={relire} />
      {v.points.length > 0 && <Points points={v.points} decisions={v.decisions} url={url} relire={relire} />}
      <Preference v={v} />
    </section>
  );
}

/** Les pièces, une ligne chacune : l'état, le fichier, « Déposer ». Puis le dépôt groupé et la demande au propriétaire. */
function Pieces({ v, url, relire }) {
  const groupe = useRef(null);
  const [aClasser, setAClasser] = useState([]);
  const deposer = useMutation({
    mutationFn: async ({ fichiers, categorie = null }) => {
      const corps = new FormData();
      if (categorie) {
        corps.append("fichier", fichiers[0]);
        await base44.request("POST", `${url}/pieces/${encodeURIComponent(categorie)}`, { body: corps });
        return { rangees: [{ nom: fichiers[0].name }], a_classer: [] };
      }
      fichiers.forEach((f) => corps.append("fichiers", f));
      return base44.request("POST", `${url}/pieces`, { body: corps });
    },
    onSuccess: (r, { fichiers, categorie }) => {
      if (categorie) setAClasser((l) => l.filter((f) => f !== fichiers[0]));
      else setAClasser((l) => [...l, ...fichiers.filter((f) => (r.a_classer || []).includes(f.name))]);
      if (r.rangees?.length) toast.success(r.rangees.length > 1 ? `${r.rangees.length} pièces rangées` : "Pièce rangée");
      relire();
    },
    onError: (e) => toast.error(e?.message || "Dépôt refusé"),
  });
  const categories = v.pieces.map((p) => [p.cle, p.mot]);
  // Haka écrit au vendeur (27 oct. 2026) : le premier mail porte le lien de son espace de dépôt, les suivants relancent.
  const manque = v.pieces.some((p) => p.requise && p.etat === "manquante");
  const ecrire = () => window.dispatchEvent(new CustomEvent("klocka:lancer", { detail: { texte: v.depot?.propose_le ? "Prépare la relance du vendeur pour les pièces qui manquent." : "Prépare le premier mail au vendeur, avec le lien de son espace de dépôt et la liste des pièces." } }));
  const copier = async () => {
    try {
      const r = v.depot?.url ? v.depot : await base44.request("POST", `${url}/depot`);
      await navigator.clipboard.writeText(r.url);
      toast.success("Lien du vendeur copié");
      relire();
    } catch { toast.error("Copie impossible"); }
  };

  return (
    <div className="mt-4">
      <ul className="m-0 list-none overflow-hidden rounded-bloc border border-trait p-0">
        {/* « Autres documents » ne se montre qu'une fois rempli (ce que le vendeur dépose hors liste). */}
        {v.pieces.filter((p) => p.cle !== "autres" || p.fichiers?.length).map((p) => {
          const [couleur, mot] = ETATS[p.etat] || ETATS.manquante;
          return (
            <li key={p.cle} className="flex items-center gap-3 border-b border-trait px-4 py-2.5 last:border-b-0 max-md:pr-12">
              <span className={`grid h-4 w-4 flex-none place-items-center rounded-full ${p.etat === "manquante" ? "border border-bord-vif" : p.etat === "a_verifier" ? "bg-ambre" : "bg-menthe"}`}>
                {p.etat !== "manquante" && <Check className="h-2.5 w-2.5 text-sur-menthe" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[14px] text-encre">{p.mot}</span>
                {!p.requise && <span className="text-[12.5px] text-brume"> · facultatif</span>}
                {p.fichiers?.length > 0 && <span className="block truncate text-[12.5px] text-ardoise">{p.fichiers.map((f) => f.nom).join(", ")}</span>}
                {/* Au téléphone, l'état passe sous le nom : la ligne garde la place du bouton. */}
                <span className={`block text-[12.5px] md:hidden ${p.etat === "manquante" && p.requise ? "text-ambre" : couleur}`}>{mot}</span>
              </span>
              <span className={`flex-none text-[12.5px] max-md:hidden ${p.etat === "manquante" && p.requise ? "text-ambre" : couleur}`}>{mot}</span>
              <DeposerUne onFichier={(f) => deposer.mutate({ fichiers: [f], categorie: p.cle })} />
            </li>
          );
        })}
      </ul>
      {aClasser.length > 0 && (
        <ul className="m-0 mt-2 list-none p-0">
          {aClasser.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px] text-craie">
              <span className="min-w-0 flex-1 truncate">À classer : {f.name}</span>
              <select aria-label={`La pièce ${f.name}`} defaultValue="" onChange={(e) => e.target.value && deposer.mutate({ fichiers: [f], categorie: e.target.value })} className={champ}>
                <option value="" disabled>Quelle pièce ?</option>
                {categories.map(([k, m]) => <option key={k} value={k}>{m}</option>)}
              </select>
              <button type="button" aria-label="Ne pas déposer" onClick={() => setAClasser((l) => l.filter((x) => x !== f))} className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={groupe} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; if (l.length) deposer.mutate({ fichiers: l }); }} />
        <button type="button" onClick={() => groupe.current?.click()} disabled={deposer.isPending} className={bouton}>
          {deposer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}Déposer des pièces
        </button>
        {manque && <button type="button" onClick={ecrire} className={bouton}><Mail className="h-4 w-4" />{v.depot?.propose_le ? "Relancer le vendeur" : "Écrire au vendeur"}</button>}
        <button type="button" onClick={copier} className={bouton}><Copy className="h-4 w-4" />Lien du vendeur</button>
      </div>
      <p className="m-0 mt-1.5 text-[12.5px] text-brume">
        {v.depot?.ouvert_le
          ? `Le vendeur a ouvert son espace de dépôt le ${jour(v.depot.ouvert_le)}${v.depot.deposes ? ` et déposé ${v.depot.deposes} fichier${v.depot.deposes > 1 ? "s" : ""}` : ""}. `
          : v.depot?.propose_le ? "Le lien de dépôt est proposé au vendeur ; il ne l'a pas encore ouvert. " : ""}
        Chaque pièce se range d'après son nom, puis se lit : ce qu'un acheteur relèvera apparaît dessous.
      </p>
    </div>
  );
}

function DeposerUne({ onFichier }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFichier(f); }} />
      <button type="button" onClick={() => ref.current?.click()} className="flex-none text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Déposer</button>
    </>
  );
}

/** Les photos du bien : le projet les reprend à la mise en vente. */
function Photos({ photos = [], url, relire }) {
  const ref = useRef(null);
  const ajouter = useMutation({
    mutationFn: async (fichiers) => { for (const f of fichiers) { const corps = new FormData(); corps.append("fichier", f); await base44.request("POST", `${url}/photos`, { body: corps }); } },
    onSuccess: relire,
    onError: (e) => toast.error(e?.message || "Photo refusée"),
  });
  const retirer = useMutation({ mutationFn: (u) => base44.request("DELETE", `${url}/photos?url=${encodeURIComponent(u)}`), onSuccess: relire });
  return (
    <div className="mt-6">
      <h3 className="m-0 text-[14px] font-normal text-encre">Photos{photos.length ? <span className="text-ardoise"> · {photos.length}</span> : null}</h3>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; if (l.length) ajouter.mutate(l); }} />
        <button type="button" onClick={() => ref.current?.click()} aria-label="Ajouter des photos" className="grid h-[72px] w-[96px] flex-none place-items-center rounded-[10px] border border-dashed border-bord-vif text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          {ajouter.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
        </button>
        {photos.map((p) => (
          <span key={p.url} className="group relative h-[72px] w-[96px] flex-none overflow-hidden rounded-[10px] border border-trait">
            <img src={p.url} alt={p.nom} className="h-full w-full object-cover" />
            <button type="button" aria-label="Retirer la photo" onClick={() => retirer.mutate(p.url)} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-fond/80 text-encre opacity-0 group-hover:opacity-100 max-md:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Les points relevés sur les pièces : bloquants d'abord ; chacun se tranche d'un clic. */
function Points({ points, decisions, url, relire }) {
  const decider = useMutation({
    mutationFn: ({ cle, decision }) => base44.request("POST", `${url}/points`, { body: { cle, decision } }),
    onSuccess: relire,
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const restants = points.filter((p) => !p.decision).length;
  return (
    <div className="mt-6">
      <h3 className="m-0 text-[14px] font-normal text-encre">Ce que les pièces montrent{restants ? <span className="text-ambre"> · {restants} à trancher</span> : null}</h3>
      <ul className="m-0 mt-2 list-none overflow-hidden rounded-bloc border border-trait p-0">
        {points.map((p) => {
          const [couleur, niveau] = NIVEAUX[p.niveau] || NIVEAUX.signale;
          // Un bloquant ne s'explique pas à l'acheteur : il se corrige.
          const choix = Object.entries(decisions).filter(([k]) => p.niveau !== "bloquant" || k !== "expliquer");
          return (
            <li key={p.cle} className="border-b border-trait px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`text-[12.5px] ${couleur}`}>{niveau}</span>
                <span className="text-[14px] text-encre">{p.ligne}</span>
                <span className="text-[12.5px] text-brume">{p.onglet}</span>
              </div>
              {p.motif && <p className={`m-0 mt-0.5 text-[13.5px] leading-[1.5] ${p.niveau === "bloquant" ? "text-alerte" : "text-ambre"}`}>{p.motif}</p>}
              {p.valeur && <p className="m-0 mt-0.5 text-[13px] text-craie">{p.valeur}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {choix.map(([k, mot]) => {
                  const actif = p.decision === k;
                  return (
                    <button key={k} type="button" onClick={() => decider.mutate({ cle: p.cle, decision: actif ? null : k })} aria-pressed={actif}
                      className={`h-8 rounded-full px-3 text-[12.5px] transition-colors ${actif ? "bg-menthe text-sur-menthe" : "border border-trait text-craie hover:text-encre"}`} style={actif ? undefined : { background: "transparent" }}>{mot}</button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Le droit de préférence du locataire (article L. 145-46-1 du Code de commerce) : ici, son état seul. Haka le propose à
 * gauche, prépare la notification et note la date et la réponse (28 oct. 2026, Jules : « Haka doit direct le proposer »).
 */
function Preference({ v }) {
  const p = v.preference;
  const regle = ["ne_s_applique_pas", "refuse", "expire", "notifie"].includes(p.statut);
  return (
    <div className="mt-6">
      <h3 className="m-0 text-[14px] font-normal text-encre">Droit de préférence du locataire</h3>
      <p className={`m-0 mt-0.5 text-[13.5px] leading-[1.5] ${regle ? "text-craie" : "text-ambre"}`}>{p.phrase}</p>
      {p.statut === "a_notifier" && <p className="m-0 mt-1 text-[12.5px] text-brume">L'Assistant KPartners prépare la notification ; dites-lui la date où le locataire l'a reçue, puis sa réponse.</p>}
    </div>
  );
}

/**
 * Le mail que Haka a préparé (28 oct. 2026, Jules : « il reste les PV d'AG, ça fait deux jours, j'ai préparé un mail :
 * envoyer ? »). Il part de la boîte connectée du mandataire ; sans elle, sa messagerie s'ouvre, puis « C'est envoyé ».
 */
export function MailPropose({ dossierId, mail, boite }) {
  const queryClient = useQueryClient();
  const url = `/api/mandataire/dossiers/${encodeURIComponent(dossierId)}`;
  const [m, setM] = useState({ a: mail.a || "", objet: mail.objet, corps: mail.corps });
  const [ouvert, setOuvert] = useState(false);
  const [parti, setParti] = useState(false);
  const relire = () => ["m-dossier-vente", "m-dossiers"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const envoyer = useMutation({
    mutationFn: (marquer = false) => base44.request("POST", `${url}/mail`, { body: { ...m, marquer } }),
    onSuccess: (r) => {
      if (r?.sans_boite) {
        window.location.href = `mailto:${encodeURIComponent(m.a)}?subject=${encodeURIComponent(m.objet)}&body=${encodeURIComponent(m.corps)}`;
        setParti(true);
        return;
      }
      toast.success(r?.envoye ? `Mail envoyé${boite ? ` de ${boite}` : ""}` : "C'est noté");
      relire();
    },
    onError: (e) => { toast.error(e?.message || "Le mail n'est pas parti"); setOuvert(true); },
  });
  const ecarter = useMutation({ mutationFn: () => base44.request("POST", `${url}/mail/ecarter`), onSuccess: relire });
  return (
    <div className="text-left">
      <p className="m-0 text-[15px] leading-[1.55] text-encre">{mail.raison} Envoyer ?</p>
      <div className="mt-3 rounded-[14px] border border-trait bg-surface px-4 py-3">
        {ouvert ? (
          <div className="flex flex-col gap-2">
            <input value={m.a} onChange={(e) => setM({ ...m, a: e.target.value })} placeholder="L'adresse du vendeur" aria-label="À" className={`${champ} w-full rounded-[10px]`} />
            <input value={m.objet} onChange={(e) => setM({ ...m, objet: e.target.value })} aria-label="Objet" className={`${champ} w-full rounded-[10px]`} />
            <textarea value={m.corps} onChange={(e) => setM({ ...m, corps: e.target.value })} aria-label="Le mail" rows={10} className="w-full resize-y rounded-[10px] border border-bord-vif bg-fond px-3 py-2 text-[13.5px] leading-[1.6] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
          </div>
        ) : (
          <button type="button" onClick={() => setOuvert(true)} className="block w-full text-left" style={{ background: "transparent" }}>
            <span className="block text-[12.5px] text-ardoise">À {m.a || "(adresse à ajouter)"}</span>
            <span className="block text-[13.5px] text-encre">{m.objet}</span>
            <span className="mt-1 line-clamp-3 block whitespace-pre-line text-[13px] leading-[1.5] text-craie">{m.corps}</span>
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {parti ? (
          <>
            <span className="text-[13px] text-craie">Votre messagerie s'est ouverte. Le mail est parti ?</span>
            <button type="button" onClick={() => envoyer.mutate(true)} className={boutonPlein}><Check className="h-4 w-4" />C'est envoyé</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => envoyer.mutate(false)} disabled={envoyer.isPending || !m.a.includes("@")} title={m.a.includes("@") ? undefined : "Ajoutez l'adresse du vendeur"} className={boutonPlein}>
              {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Envoyer
            </button>
            {!ouvert && <button type="button" onClick={() => setOuvert(true)} className={bouton}>Modifier</button>}
            <button type="button" onClick={() => ecarter.mutate()} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Pas maintenant</button>
          </>
        )}
      </div>
      <p className="m-0 mt-1.5 text-[12px] text-brume">{boite ? `Il part de ${boite}.` : "Aucune boîte connectée : il s'ouvre dans votre messagerie."}</p>
    </div>
  );
}
