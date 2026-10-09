import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Lock, Phone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Ma journée : l'accueil de la prospection. À gauche, la ville (ses chiffres
// d'après sa liste de l'agent IA), l'avancement du jour, et qui appeler ou
// relancer aujourd'hui (un badge Rappel, Relance ou Nouveau, l'heure s'il y
// en a une, la raison) ; un agent qu'un collègue appelle porte son nom. À
// droite, ce qui attend dans « À envoyer » (rien ne part sans un clic), et la
// fiabilité d'AK : la part des cartes d'appel validées sans modification.

const initiales = (n = "") => String(n).split(/[\s.@-]+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
const ilYa = (iso) => {
  if (!iso) return "";
  const j = Math.round((Date.now() - Date.parse(iso)) / 86400000);
  return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`;
};

function ChoixVille({ villes, ville, onChoisir }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (!zone.current?.contains(e.target)) setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);
  return (
    <div ref={zone} className="relative">
      <button type="button" onClick={() => setOuvert((v) => !v)} className="inline-flex items-center gap-2 text-[26px] font-normal tracking-[-0.01em] text-encre" style={{ background: "transparent" }}>
        {ville || "Toutes les villes du jour"}<ChevronDown className="h-4 w-4 text-ardoise" />
      </button>
      {ouvert && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[260px] rounded-[14px] border border-trait bg-surface-pleine p-1.5 shadow-xl">
          <button type="button" onClick={() => { onChoisir(null); setOuvert(false); }} className="block w-full rounded-[8px] px-3 py-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre">Toutes les villes du jour</button>
          {villes.map((v) => (
            <button key={v.id} type="button" onClick={() => { onChoisir(v.ville); setOuvert(false); }} className="flex w-full items-baseline justify-between gap-4 rounded-[8px] px-3 py-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre">
              {v.ville}<span className="text-[12px] text-ardoise">{v.agences} agences</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children }) {
  return <span className="inline-flex h-[22px] flex-none items-center rounded-full border border-bord-doux px-2 text-[11.5px] text-craie">{children}</span>;
}

function LigneAppel({ a, onAppeler, enCours }) {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-trait bg-surface-pleine px-4 py-3.5">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-relief text-[12.5px] text-craie">{initiales(a.nom)}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px] text-encre">
          {a.nom}{a.agence && <span className="text-[13px] text-ardoise">{a.agence}</span>}
          <Badge>{a.badge}</Badge>{a.heure && <span className="text-[13px] tabular-nums text-craie">{a.heure}</span>}
        </p>
        <p className="m-0 mt-1 text-[13px] leading-[1.45] text-ardoise">{a.raison}</p>
      </div>
      {a.verrou && !a.a_moi ? (
        <span className="inline-flex flex-none items-center gap-1.5 text-[13px] text-ardoise"><Lock className="h-3.5 w-3.5" />{a.verrou.prenom} l'appelle</span>
      ) : (
        <button type="button" onClick={() => onAppeler(a)} disabled={enCours}
          className="inline-flex h-10 flex-none items-center gap-2 rounded-[10px] bg-encre px-4 text-[14px] text-fond transition-opacity hover:opacity-90 disabled:opacity-50">
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}Appeler
        </button>
      )}
    </div>
  );
}

function AEnvoyer({ envois }) {
  const queryClient = useQueryClient();
  const raf = () => ["prospection-ma-journee", "prospection-jour", "prospection-envois"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const envoyer = useMutation({
    mutationFn: (id) => base44.request("POST", "/api/prospection/envois/envoyer", { body: { ids: [id] } }),
    onSuccess: (r) => { toast.success(r.envoyes ? "Envoyé" : r.simules ? "Simulé : aucune boîte connectée" : "Non parti"); raf(); },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });
  const ecarter = useMutation({ mutationFn: (id) => base44.request("POST", `/api/prospection/envois/${id}/ecarter`, { body: {} }), onSuccess: raf });
  return (
    <section className="rounded-[16px] border border-trait bg-surface-pleine p-5">
      <div className="flex items-baseline justify-between"><p className="m-0 text-[15px] text-encre">À envoyer</p><span className="text-[13px] tabular-nums text-ardoise">{envois.length}</span></div>
      <p className="m-0 mt-1 text-[12.5px] text-ardoise">Mails et relances proposés par AK. Rien ne part sans un clic.</p>
      <div className="mt-3 flex max-h-[360px] flex-col gap-2 overflow-y-auto">
        {envois.map((m) => (
          <div key={m.id} className="rounded-[12px] border border-trait px-3.5 py-3">
            <p className="m-0 truncate text-[14px] text-encre">{[m.nom, m.agence].filter(Boolean).join(" · ") || m.a}</p>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{m.quoi} · proposé{m.genre === "relance" ? "e" : ""} {ilYa(m.cree_le)}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { if (window.confirm(`Envoyer à ${m.a || m.nom} ?`)) envoyer.mutate(m.id); }} disabled={envoyer.isPending || !m.a && m.genre !== "sms"}
                className="h-8 rounded-[8px] bg-encre px-3 text-[13px] text-fond hover:opacity-90 disabled:opacity-40">Envoyer</button>
              <button type="button" onClick={() => ecarter.mutate(m.id)} className="h-8 rounded-[8px] border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Écarter</button>
            </div>
          </div>
        ))}
        {!envois.length && <p className="m-0 py-3 text-[13px] text-brume">Rien n'attend.</p>}
      </div>
    </section>
  );
}

function Fiabilite({ f }) {
  if (!f) return null;
  const max = Math.max(...f.semaines.map((s) => s.taux ?? 0), 1);
  return (
    <section className="rounded-[16px] border border-trait bg-surface-pleine p-5">
      <p className="m-0 text-[15px] text-encre">Fiabilité d'AK</p>
      <p className="m-0 mt-3 flex items-baseline gap-3"><span className="text-[40px] leading-none tabular-nums text-encre">{f.taux != null ? `${f.taux} %` : "—"}</span><span className="text-[13px] text-ardoise">cette semaine</span></p>
      <p className="m-0 mt-2 text-[13px] text-craie">{f.cartes ? `${f.sans_modification} carte${f.sans_modification > 1 ? "s" : ""} sur ${f.cartes} validée${f.cartes > 1 ? "s" : ""} sans aucune modification` : "Aucune carte d'appel validée cette semaine."}</p>
      <div className="mt-4 flex h-[56px] items-end gap-1.5">
        {f.semaines.map((s, i) => (
          <div key={s.semaine} className="flex flex-1 flex-col items-center gap-1" title={s.cartes ? `${s.semaine} : ${s.taux} % (${s.sans_modification}/${s.cartes})` : `${s.semaine} : aucune carte`}>
            <div className={`w-full rounded-[3px] ${i === f.semaines.length - 1 ? "bg-menthe-clair" : "bg-relief"}`} style={{ height: `${Math.max(8, ((s.taux ?? 0) / max) * 44)}px` }} />
            <span className="text-[10.5px] text-ardoise">{s.semaine}</span>
          </div>
        ))}
      </div>
      {f.corrections?.length > 0 && (
        <>
          <p className="m-0 mt-4 text-[12.5px] text-ardoise">Dernières corrections</p>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
            {f.corrections.map((c, i) => (
              <li key={i} className="text-[13px] text-craie">
                <span className="text-ardoise">{c.champ}</span> · {c.avant ? <span className="text-brume line-through">{c.avant}</span> : null}{c.avant ? " → " : ""}<span className="text-encre">{c.apres}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** @param {{onAppeler: (agent) => void, enCours?: boolean}} props */
export default function MaJournee({ onAppeler, enCours = false, onCompte = null }) {
  const [ville, setVille] = useState(() => { try { return localStorage.getItem("prospection.ville") || null; } catch { return null; } });
  const { data, isLoading } = useQuery({
    queryKey: ["prospection-ma-journee", ville],
    queryFn: () => base44.request("GET", `/api/prospection/ma-journee${ville ? `?ville=${encodeURIComponent(ville)}` : ""}`),
    refetchInterval: 30_000,
  });
  useEffect(() => { onCompte?.(data?.a_appeler?.length || 0); }, [data, onCompte]);
  const choisir = (v) => { setVille(v); try { if (v) localStorage.setItem("prospection.ville", v); else localStorage.removeItem("prospection.ville"); } catch { /* sans gravité */ } };
  if (isLoading || !data) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const v = data.ville;
  const { faits, total } = data.appels;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <ChoixVille villes={data.villes} ville={v?.ville || null} onChoisir={choisir} />
            <p className="m-0 mt-1 text-[13.5px] text-ardoise">{v ? `${v.agences} agences · ${v.avec_telephone} numéros` : (data.villes_du_jour || []).join(", ") || "Aucune ville du jour : choisissez-en une."}</p>
          </div>
          <div className="min-w-[180px]">
            <p className="m-0 text-right text-[13px] text-craie">{faits} appel{faits > 1 ? "s" : ""} fait{faits > 1 ? "s" : ""} sur {total} aujourd'hui</p>
            <div className="mt-2 h-1 rounded-full bg-relief"><div className="h-1 rounded-full bg-menthe-clair transition-[width]" style={{ width: `${total ? (faits / total) * 100 : 0}%` }} /></div>
          </div>
        </div>
        <p className="m-0 mb-3 mt-8 text-[11.5px] uppercase tracking-[0.12em] text-ardoise">À appeler et à relancer aujourd'hui</p>
        <div className="flex flex-col gap-2.5">
          {data.a_appeler.map((a) => <LigneAppel key={a.id} a={a} onAppeler={onAppeler} enCours={enCours} />)}
          {!data.a_appeler.length && <p className="m-0 rounded-[14px] border border-dashed border-trait px-5 py-8 text-center text-[13.5px] text-brume">Personne à appeler aujourd'hui{v ? ` à ${v.ville}` : ""}. Mettez des agences au carnet depuis Listes.</p>}
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <AEnvoyer envois={data.a_envoyer} />
        <Fiabilite f={data.fiabilite} />
      </div>
    </div>
  );
}
