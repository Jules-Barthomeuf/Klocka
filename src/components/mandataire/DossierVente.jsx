import React, { useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Loader2, Mail, X } from "lucide-react";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
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
/**
 * `lecture` (2 nov. 2026, Jules : « c'est l'assistant qui demande et propose ce qu'il y a à faire, pas l'humain qui va
 * appuyer sur des boutons ») : ni « Mettre en vente » ni décision sur les points, l'assistant à gauche les propose. Les
 * pièces et les photos, elles, se déposent à la main dans leur zone, comme dans la Data Room de l'équipe (2 nov. 2026).
 */
export default function DossierVente({ dossierId, lecture = false }) {
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
    <section aria-label="La Data room" className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className={`m-0 min-w-0 flex-1 text-[13.5px] ${v.pret ? "text-menthe" : "text-ambre"}`}>{v.phrase}</p>
        {!lecture && (
          <button type="button" onClick={() => vente.mutate()} disabled={!v.pret || vente.isPending} title={v.pret ? undefined : v.raisons.join(" ")} className={`${boutonPlein} max-md:w-full max-md:justify-center`}>
            {vente.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Mettre en vente
          </button>
        )}
      </div>

      <MailDuDossier v={v} dossierId={dossierId} />
      <Pieces v={v} url={url} relire={relire} />
      {v.points.length > 0 && <Points points={v.points} decisions={v.decisions} url={url} relire={relire} lecture={lecture} />}
      <Preference v={v} />
    </section>
  );
}

/**
 * Le mail au propriétaire, en haut de la Data room (2 nov. 2026, Jules : « le mail est écrit dans l'écran de droite ») :
 * prêt, il s'envoie d'un tap ; parti, il se replie en une ligne, avec le jour de la relance tant qu'une pièce manque.
 */
function MailDuDossier({ v, dossierId }) {
  if (v.mail_propose) {
    return (
      <div className="mt-4 rounded-[20px] border border-bord-doux bg-barre p-4 max-md:p-3">
        <p className="m-0 mb-2 text-[12px] uppercase tracking-[.12em] text-brume">{v.mail_propose.genre === "relance" ? "Relance au propriétaire" : "Mail au propriétaire"}</p>
        <MailPropose key={v.mail_propose.le} dossierId={dossierId} mail={v.mail_propose} boite={v.boite} />
      </div>
    );
  }
  const dernier = v.depot?.relance_le || v.depot?.propose_le;
  if (!dernier) return null;
  const manque = v.pieces.some((p) => p.requise && p.etat === "manquante");
  const relance = new Date(Date.parse(dernier) + 3 * 86400000);
  const n = v.depot?.relances || 0;
  return (
    <p className="m-0 mt-4 flex items-center gap-2 text-[13px] text-ardoise">
      <Mail className="h-3.5 w-3.5 flex-none text-brume" />
      {v.depot?.relance_le ? `Relance ${n > 1 ? `n° ${n} ` : ""}envoyée le ${jour(v.depot.relance_le)}` : `Mail envoyé au propriétaire le ${jour(v.depot.propose_le)}`}
      {manque ? ` · relance prévue le ${jour(relance.toISOString())}` : ""}
    </p>
  );
}

/**
 * Les pièces, comme la Data Room des dossiers de l'équipe (2 nov. 2026, Jules : « la partie à droite comme dans Data
 * room de Dossiers ») : une zone de dépôt par pièce, toute la carte se clique ou reçoit le fichier glissé, la vignette
 * de chaque fichier, un check quand la pièce est là. Sous la grille, les pièces glissées sans nom clair, à classer.
 */
function Pieces({ v, url, relire }) {
  const [aClasser, setAClasser] = useState([]);
  const [enCours, setEnCours] = useState(null);
  const deposer = useMutation({
    mutationFn: async ({ fichiers, categorie = null }) => {
      const corps = new FormData();
      if (categorie) {
        for (const f of fichiers) {
          const un = new FormData();
          un.append("fichier", f);
          await base44.request("POST", `${url}/pieces/${encodeURIComponent(categorie)}`, { body: un });
        }
        return { rangees: fichiers.map((f) => ({ nom: f.name })), a_classer: [] };
      }
      fichiers.forEach((f) => corps.append("fichiers", f));
      return base44.request("POST", `${url}/pieces`, { body: corps });
    },
    onMutate: ({ categorie }) => setEnCours(categorie || "groupe"),
    onSuccess: (r, { fichiers, categorie }) => {
      if (categorie) setAClasser((l) => l.filter((f) => !fichiers.includes(f)));
      else setAClasser((l) => [...l, ...fichiers.filter((f) => (r.a_classer || []).includes(f.name))]);
      if (r.rangees?.length) toast.success(r.rangees.length > 1 ? `${r.rangees.length} pièces importées` : "Pièce importée");
      relire();
    },
    onError: (e) => toast.error(e?.message || "Dépôt refusé"),
    onSettled: () => setEnCours(null),
  });
  const retirer = useMutation({
    mutationFn: ({ cle, u }) => base44.request("DELETE", `${url}/pieces/${encodeURIComponent(cle)}?url=${encodeURIComponent(u)}`),
    onSuccess: () => { toast.success("Pièce retirée"); relire(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const categories = v.pieces.map((p) => [p.cle, p.mot]);

  return (
    <div className="mt-4">
      {/* Les zones dans une carte du fond de la saisie du chat (2 nov. 2026, Jules). */}
      <div className="grid gap-3 rounded-[20px] border border-trait bg-barre p-4 sm:grid-cols-2 xl:grid-cols-3 max-md:p-3">
        {v.pieces.map((p) => (
          <ZonePiece key={p.cle} p={p} occupe={enCours === p.cle}
            onDeposer={(fichiers) => fichiers.length && deposer.mutate({ fichiers, categorie: p.cle })}
            onRetirer={(f) => retirer.mutate({ cle: p.cle, u: f.url })} />
        ))}
        <ZonePhotos photos={v.dossier.photos} url={url} relire={relire} />
      </div>
      {aClasser.length > 0 && (
        <ul className="m-0 mt-3 list-none p-0">
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
      <p className="m-0 mt-2 text-[12.5px] text-brume">
        {v.depot?.ouvert_le
          ? `Le vendeur a ouvert son espace de dépôt le ${jour(v.depot.ouvert_le)}${v.depot.deposes ? ` et déposé ${v.depot.deposes} fichier${v.depot.deposes > 1 ? "s" : ""}` : ""}. `
          : v.depot?.propose_le ? "Le lien de dépôt est proposé au vendeur ; il ne l'a pas encore ouvert. " : ""}
        Chaque pièce se lit dès qu'elle arrive : ce qu'un acheteur relèvera apparaît dessous.
      </p>
    </div>
  );
}

const cadre = (survol, plein) => `flex min-h-[150px] flex-col rounded-[14px] border border-dashed p-4 text-left transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : plein ? "border-bord-doux hover:border-bord-vif" : "border-bord hover:border-bord-vif"}`;
const arreter = (ev) => ev.stopPropagation();

/** Une pièce : son nom, son état en haut à droite (check quand elle est là), ses fichiers avec leur vignette. */
function ZonePiece({ p, occupe, onDeposer, onRetirer }) {
  const ref = useRef(null);
  const [survol, setSurvol] = useState(false);
  const fichiers = p.fichiers || [];
  const n = fichiers.length;
  const [couleur, mot] = ETATS[p.etat] || ETATS.manquante;
  const ouvrir = () => !occupe && ref.current?.click();
  return (
    <section role="button" tabIndex={0} aria-label={`Importer : ${p.mot}`}
      onClick={ouvrir} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ouvrir(); } }}
      onDragOver={(ev) => { ev.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(ev) => { ev.preventDefault(); setSurvol(false); onDeposer([...ev.dataTransfer.files]); }}
      className={`cursor-pointer ${cadre(survol, n)}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">{p.mot}</p>
        {p.etat === "recue"
          ? <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-menthe/15 text-menthe" aria-label="Reçue"><Check className="h-3.5 w-3.5" /></span>
          : <span className={`flex-none text-[12.5px] ${p.etat === "manquante" ? (p.requise ? "text-ambre" : "text-brume") : couleur}`}>{p.etat === "manquante" ? (p.requise ? "Obligatoire" : "Facultatif") : mot}</span>}
      </div>
      {n > 0 && (
        <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
          {fichiers.map((f) => (
            <li key={f.url || f.nom} className="group flex items-center gap-2.5 text-[13px]">
              <MiniaturePiece url={f.url} largeur={32} />
              <span className="min-w-0 flex-1 truncate text-craie" title={f.nom}>{f.nom}</span>
              <button type="button" onClick={(ev) => { arreter(ev); onRetirer(f); }} className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise opacity-0 transition-opacity hover:text-encre group-hover:opacity-100 focus:opacity-100 max-md:opacity-100" style={{ background: "transparent" }} aria-label={`Retirer ${f.nom}`} title="Retirer"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <input ref={ref} type="file" multiple className="hidden" onClick={arreter} onChange={(ev) => { onDeposer([...ev.target.files]); ev.target.value = ""; }} />
      <p className="m-0 mt-auto flex items-center justify-center gap-1.5 pt-4 text-[12.5px] text-brume">
        {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {occupe ? "Import…" : n ? "Cliquez ou glissez pour en ajouter" : "Cliquez ou glissez un fichier"}
      </p>
    </section>
  );
}

/** Les photos du bien, une zone de la grille comme « Images du projet » dans la Data Room de l'équipe : le projet les reprend à la mise en vente. */
function ZonePhotos({ photos = [], url, relire }) {
  const ref = useRef(null);
  const [survol, setSurvol] = useState(false);
  const ajouter = useMutation({
    mutationFn: async (fichiers) => { for (const f of fichiers.filter((x) => /^image\//.test(x.type || ""))) { const corps = new FormData(); corps.append("fichier", f); await base44.request("POST", `${url}/photos`, { body: corps }); } },
    onSuccess: relire,
    onError: (e) => toast.error(e?.message || "Photo refusée"),
  });
  const retirer = useMutation({ mutationFn: (u) => base44.request("DELETE", `${url}/photos?url=${encodeURIComponent(u)}`), onSuccess: relire });
  const ouvrir = () => !ajouter.isPending && ref.current?.click();
  return (
    <section role="button" tabIndex={0} aria-label="Importer : Photos du bien"
      onClick={ouvrir} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ouvrir(); } }}
      onDragOver={(ev) => { ev.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(ev) => { ev.preventDefault(); setSurvol(false); ajouter.mutate([...ev.dataTransfer.files]); }}
      className={`cursor-pointer ${cadre(survol, photos.length)}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">Photos du bien</p>
        <span className="flex-none text-[12.5px] tabular-nums text-brume">{photos.length || ""}</span>
      </div>
      {photos.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {photos.map((p) => (
            <span key={p.url} className="group relative aspect-[4/3] overflow-hidden rounded-[8px] border border-trait">
              <img src={p.url} alt={p.nom} className="h-full w-full object-cover" />
              <button type="button" aria-label="Retirer la photo" onClick={(ev) => { arreter(ev); retirer.mutate(p.url); }} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-fond/80 text-encre opacity-0 group-hover:opacity-100 max-md:opacity-100"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onClick={arreter} onChange={(ev) => { const l = [...(ev.target.files || [])]; ev.target.value = ""; if (l.length) ajouter.mutate(l); }} />
      <p className="m-0 mt-auto flex items-center justify-center gap-1.5 pt-4 text-[12.5px] text-brume">
        {ajouter.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : !photos.length && <ImagePlus className="h-3.5 w-3.5" />}
        {ajouter.isPending ? "Import…" : photos.length ? "Cliquez ou glissez pour en ajouter" : "Cliquez ou glissez des photos"}
      </p>
    </section>
  );
}

/** Les points relevés sur les pièces : bloquants d'abord ; chacun se tranche d'un clic. */
function Points({ points, decisions, url, relire, lecture = false }) {
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
              {lecture ? (
                <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">{p.decision ? decisions[p.decision] : "À trancher avec l'assistant"}</p>
              ) : <div className="mt-2 flex flex-wrap gap-1.5">
                {choix.map(([k, mot]) => {
                  const actif = p.decision === k;
                  return (
                    <button key={k} type="button" onClick={() => decider.mutate({ cle: p.cle, decision: actif ? null : k })} aria-pressed={actif}
                      className={`h-8 rounded-full px-3 text-[12.5px] transition-colors ${actif ? "bg-menthe text-sur-menthe" : "border border-trait text-craie hover:text-encre"}`} style={actif ? undefined : { background: "transparent" }}>{mot}</button>
                  );
                })}
              </div>}
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
