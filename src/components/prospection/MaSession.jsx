import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// « Ma session » sous la carte d'appel (17 nov. 2026, maquette de Jules). Une ligne « Ma session » à gauche, les
// commandes à droite ; dessous, selon l'état : pas commencée (les records, Commencer sur la ligne), en cours ou
// en pause (les chiffres), terminée (le bilan). La carte d'appel, au-dessus, reste toujours là.
// À la couleur du système (17 nov. 2026, Jules) : l'accent du compte (`menthe`), plus la pervenche de la maquette ;
// le record reste en `ambre`.
// Les chiffres viennent du serveur (server/prospection/ma-session.js) ; le chronomètre tourne ici, pauses ôtées.
// Le record, la moyenne et l'équipe se lisent aussi au journal des appels, comme Suivi > Appels (18 nov. 2026, Jules).
// En deux morceaux (27 nov. 2026, Jules : « on arrive, en haut déjà Ma session, la carte on la voit en bas ; on ne voit
// pas “Commencer ma session”, juste un bouton Commencer, mais surtout mon record : le record d'appels en une journée,
// mon record de pourcentage de joints ; le but, c'est de motiver ») : `partie="haut"`, au-dessus de la carte, la ligne
// Ma session avec Commencer (ou le chrono, Pause, Terminer), les records avant de commencer, le bilan à la fin ;
// `partie="bas"`, sous la carte, les chiffres pendant la session, pour que la carte reste à portée pendant les appels.

const API = "/api/prospection/mode-appel";
const SANS_PERSONNE = new Set(["pas_de_reponse", "repondeur"]);

/** Le temps passé à appeler, pauses ôtées (ms). */
function tempsActif(s, maintenant) {
  if (!s?.demarree_le) return 0;
  const fin = Date.parse(s.terminee_le || "") || maintenant;
  const pauses = (s.pauses || []).reduce((t, p) => t + Math.max(0, (Date.parse(p.a || "") || fin) - Date.parse(p.de)), 0);
  return Math.max(0, fin - Date.parse(s.demarree_le) - pauses);
}
const deux = (n) => String(n).padStart(2, "0");
function chrono(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  return h ? `${h} h ${deux(Math.floor((s % 3600) / 60))} min` : `${deux(Math.floor(s / 60))} min ${deux(s % 60)} s`;
}
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

const CADRE = "k-verre";
const BOUTON = "inline-flex h-9 items-center gap-2 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50";
const BOUTON_ACCENT = "inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-opacity hover:opacity-90 disabled:opacity-50";

/**
 * @param {{ session: {id, liste_id, ville}|null, ville: string|null, progression: {appelees, agences}|null,
 *   onNouvelle: (session) => void }} props
 */
export default function MaSession({ session, ville, progression, onNouvelle, partie = "haut" }) {
  const queryClient = useQueryClient();
  const stats = useQuery({
    queryKey: ["ma-session", session?.id],
    queryFn: () => base44.request("GET", `${API}/sessions/${session.id}/stats`),
    enabled: !!session?.id,
    refetchInterval: (q) => (q.state.data?.etat === "en_cours" ? 20_000 : false),
  });
  const d = stats.data;
  const etat = d?.etat || "pas_commencee";
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    if (etat !== "en_cours") return undefined;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [etat]);

  const changer = useMutation({
    mutationFn: (action) => base44.request("POST", `${API}/sessions/${session.id}/etat`, { body: { action } }),
    onSuccess: () => { setMaintenant(Date.now()); queryClient.invalidateQueries({ queryKey: ["ma-session", session?.id] }); },
    onError: (e) => toast.error(e?.message || "Impossible pour l'instant"),
  });
  // Commencer : la session de la ville si elle n'a encore aucun appel, sinon une neuve (les appels d'avant ne comptent pas).
  const commencer = useMutation({
    mutationFn: async () => {
      if (!d?.appels) return { session: (await base44.request("POST", `${API}/sessions/${session.id}/etat`, { body: { action: "demarrer" } })).session, neuve: false };
      return { session: (await base44.request("POST", `${API}/sessions`, { body: { liste_id: session.liste_id, demarrer: true } })).session, neuve: true };
    },
    onSuccess: (r) => {
      setMaintenant(Date.now());
      if (r.neuve || r.session?.id !== session.id) onNouvelle?.(r.session);
      else queryClient.invalidateQueries({ queryKey: ["ma-session", session?.id] });
    },
    onError: (e) => toast.error(e?.message || "Impossible de commencer"),
  });
  const nouvelle = useMutation({
    mutationFn: () => base44.request("POST", `${API}/sessions`, { body: { liste_id: session.liste_id, demarrer: true } }),
    onSuccess: (r) => { setMaintenant(Date.now()); onNouvelle?.(r.session); },
    onError: (e) => toast.error(e?.message || "Impossible de commencer"),
  });

  if (!session?.id) return null;
  const nomVille = ville || d?.ville || "";
  const appelees = progression?.appelees ?? d?.progression?.contactees ?? 0;
  const total = progression?.agences ?? d?.progression?.agences ?? 0;
  const reste = Math.max(0, total - appelees);
  const temps = tempsActif(d, maintenant);
  const occupe = changer.isPending || commencer.isPending || nouvelle.isPending;

  if (partie === "bas") {
    if (stats.isLoading || !d || (etat !== "en_cours" && etat !== "en_pause")) return null;
    return (
      <section aria-label="Les chiffres de ma session" className="grid gap-3 md:grid-cols-2">
        <CarteAppels d={d} />
        <div className="flex flex-col gap-3">
          <CarteTaux d={d} />
          <CarteVille ville={nomVille} appelees={appelees} total={total} reste={reste} />
          <CarteEquipe j={d.journal} />
        </div>
        <CarteFichesMoi f={d.fiches} />
        <CarteFichesEquipe f={d.fiches} />
      </section>
    );
  }

  return (
    <section aria-label="Ma session" className="flex flex-col gap-3">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 px-1">
        <span className="text-[13px] text-ardoise">Ma session</span>
        {!stats.isLoading && etat === "pas_commencee" && (
          <button type="button" className={`${BOUTON_ACCENT} h-10 px-5 text-[14px]`} disabled={occupe} onClick={() => commencer.mutate()}>
            <Play className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />Commencer
          </button>
        )}
        {(etat === "en_cours" || etat === "en_pause") && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-1 inline-flex items-center gap-2 text-[13px] tabular-nums text-craie">
              {etat === "en_cours"
                ? <span aria-hidden className="h-2 w-2 rounded-full bg-menthe" />
                : <span aria-hidden className="h-2 w-2 rounded-full border border-craie" />}
              {etat === "en_cours" ? "En cours" : "En pause"} · {chrono(temps)}
            </span>
            {etat === "en_cours"
              ? <button type="button" className={BOUTON} style={{ background: "transparent" }} disabled={occupe} onClick={() => changer.mutate("pause")}><Pause className="h-3.5 w-3.5" strokeWidth={2} />Pause</button>
              : <button type="button" className={BOUTON_ACCENT} disabled={occupe} onClick={() => changer.mutate("reprendre")}><Play className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />Reprendre</button>}
            <button type="button" className={BOUTON} style={{ background: "transparent" }} disabled={occupe} onClick={() => changer.mutate("terminer")}>Terminer</button>
          </div>
        )}
      </div>

      {stats.isLoading && <div className={`${CADRE} h-[132px] animate-pulse`} />}

      {!stats.isLoading && etat === "pas_commencee" && d && <Records d={d} />}

      {!stats.isLoading && etat === "terminee" && d && (
        <Bilan d={d} temps={temps} ville={nomVille} appelees={appelees} total={total} occupe={occupe} onNouvelle={() => nouvelle.mutate()} />
      )}
    </section>
  );
}

/**
 * Les records avant de commencer : le plus d'appels en une journée et le meilleur taux de décroché d'une journée (cinq
 * appels au moins), au journal des appels. Le chiffre en héros, « Record, le 12 nov. » en ambre dessous ; sans record,
 * ce que la première journée fera.
 */
function Records({ d }) {
  const j = d.journal || {};
  const jour = j.record_jour || (d.record ? { appels: d.record, le: null } : null);
  const taux = j.taux_record || (d.taux_record != null ? { taux: d.taux_record, le: null } : null);
  const cases = [
    {
      cle: "appels",
      chiffre: jour ? String(jour.appels) : "–",
      unite: jour ? (jour.appels > 1 ? "appels" : "appel") : null,
      dit: "en une journée",
      record: jour ? `Record${jour.le ? `, le ${jour.le.replace(/\.$/, "")}` : ""}` : "Votre première journée fera le record",
    },
    {
      cle: "taux",
      chiffre: taux ? String(taux.taux) : "–",
      unite: taux ? "%" : null,
      dit: "de décroché sur une journée",
      record: taux ? `Record${taux.le ? `, le ${taux.le.replace(/\.$/, "")}` : ""}` : "Dès une journée de cinq appels",
    },
  ];
  return (
    <div className={`${CADRE} grid grid-cols-2`}>
      {cases.map((c, i) => (
        <div key={c.cle} className={`flex min-w-0 flex-col gap-1 px-6 py-5 max-md:px-4 max-md:py-4 ${i ? "border-l border-trait" : ""}`}>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[44px] font-light leading-none max-md:text-[34px] tracking-[-0.02em] tabular-nums text-encre">{c.chiffre}</span>
            {c.unite && <span className="text-[17px] text-ardoise">{c.unite}</span>}
          </span>
          <span className="text-[14px] text-craie max-md:text-[13px]">{c.dit}</span>
          <span className="text-[12.5px] text-ambre">{c.record}</span>
        </div>
      ))}
    </div>
  );
}

function Anneau({ valeur, max, taille = 132 }) {
  const r = (taille - 12) / 2;
  const c = 2 * Math.PI * r;
  const part = max ? Math.min(1, valeur / max) : valeur ? 1 : 0;
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="flex-none -rotate-90" aria-hidden>
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth="10" className="stroke-trait" />
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-menthe transition-[stroke-dashoffset] duration-700"
        strokeDasharray={c} strokeDashoffset={c * (1 - part)} />
    </svg>
  );
}

/** Le jour du record : celui du journal quand c'est lui qui le tient. */
const jourDuRecord = (d) => (d.journal?.record_jour && d.journal.record_jour.appels === d.record ? d.journal.record_jour.le : null);

function CarteAppels({ d }) {
  const titre = !d.record ? "Votre première session fait le record"
    : d.record_battu ? `Record battu : ${pluriel(d.appels, "appel")}`
      : d.reste_pour_record === 0 ? "Encore un pour battre votre record"
        : `Encore ${d.reste_pour_record} pour battre votre record`;
  const le = jourDuRecord(d);
  return (
    <div className="k-verre flex flex-col gap-5 px-6 py-6">
      <div className="flex items-center gap-7 max-md:flex-col max-md:items-start max-md:gap-4">
        <div className="relative grid place-items-center">
          <Anneau valeur={d.appels} max={d.record || d.appels} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[36px] leading-none tabular-nums text-encre">{d.appels}</span>
            <span className="mt-1 text-[12.5px] text-ardoise">{d.record ? `appels sur ${d.record}` : pluriel(d.appels, "appel")}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] text-ardoise">Appels</span>
          <span className="text-[17px] leading-snug text-encre">{titre}</span>
          {d.record > 0 && (
            <span className="text-[12.5px] text-ardoise">
              <span className="text-ambre">Record {d.record}{le ? `, le ${le}` : ""}</span>
              {d.record_vers ? ` · à ce rythme vers ${d.record_vers}` : ""}
            </span>
          )}
        </div>
      </div>
      {d.journal && <ChiffresDuJournal j={d.journal} />}
    </div>
  );
}

/** Les chiffres du journal des appels, ceux de Suivi > Appels par analyste : la journée, la moyenne, les biens, la semaine. */
function ChiffresDuJournal({ j }) {
  const cases = [
    ["Aujourd'hui", pluriel(j.aujourdhui.appels, "appel"), j.aujourdhui.appels ? `${j.aujourdhui.decroches} décroché${j.aujourdhui.decroches > 1 ? "s" : ""}` : "aucun encore"],
    ["Moyenne", j.moyenne_jour == null ? "–" : `${String(j.moyenne_jour).replace(".", ",")} par jour`, j.jours_actifs ? `sur ${pluriel(j.jours_actifs, "jour")} d'appels` : "pas encore de jour passé"],
    ["Biens trouvés", String(j.biens + j.aujourdhui.biens), j.record_biens ? `record ${j.record_biens.biens} en un jour, le ${j.record_biens.le}` : "pas encore de record"],
    ["Cette semaine", pluriel(j.semaine.appels, "appel"), j.semaine.meilleure ? `meilleure : ${j.semaine.meilleure.appels}, semaine du ${j.semaine.meilleure.le}` : "première semaine mesurée"],
  ];
  return (
    <div className="border-t border-trait pt-4">
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {cases.map(([k, v, sous]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[12.5px] text-ardoise">{k}</span>
            <span className="text-[17px] leading-snug tabular-nums text-encre">{v}</span>
            <span className="text-[12px] text-craie">{sous}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** L'équipe cette semaine, au journal des appels : qui a appelé, combien, et son taux de décroché. */
function CarteEquipe({ j }) {
  const equipe = j?.equipe_semaine || [];
  if (equipe.length < 2) return null;
  return (
    <div className="k-verre flex flex-col gap-2 px-5 py-4">
      <span className="text-[13px] text-ardoise">L'équipe cette semaine</span>
      {equipe.map((m, i) => (
        <div key={m.prenom} className="grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-baseline gap-3 text-[13px] tabular-nums">
          <span className="text-ardoise">{i + 1}</span>
          <span className={m.moi ? "font-medium text-encre" : "text-encre"}>{m.moi ? "Vous" : m.prenom}</span>
          <span className="text-encre">{pluriel(m.appels, "appel")}</span>
          <span className="w-[92px] text-right text-ardoise">{m.taux == null ? "–" : `${m.taux} % décroché`}</span>
        </div>
      ))}
    </div>
  );
}

function CarteTaux({ d }) {
  const ecarts = [
    d.ecart_moyenne == null ? null : `${d.ecart_moyenne >= 0 ? "+" : "−"}${Math.abs(d.ecart_moyenne)} pts ${d.ecart_moyenne >= 0 ? "au-dessus de" : "sous"} votre moyenne`,
    d.ecart_record == null ? null : d.ecart_record >= 0 ? "votre record de décroché" : `${Math.abs(d.ecart_record)} pts sous votre record`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="k-verre flex flex-col gap-2 px-5 py-4">
      <span className="text-[13px] text-ardoise">Taux de décroché</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[26px] leading-none tabular-nums text-encre">{d.taux == null ? "–" : `${d.taux} %`}</span>
        {d.appels > 0 && <span className="text-[13px] tabular-nums text-ardoise">{d.decroches} sur {d.appels}</span>}
      </span>
      <Barre part={(d.taux || 0) / 100} repere={d.taux_record != null ? { part: d.taux_record / 100, texte: `Record ${d.taux_record} %` } : null} />
      {ecarts && <span className="text-[12.5px] text-ardoise">{ecarts}</span>}
    </div>
  );
}

function Barre({ part, repere = null }) {
  return (
    <div className={`relative ${repere ? "mt-5" : "mt-2"}`}>
      <div className="h-2 overflow-hidden rounded-full bg-trait">
        <div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.round(Math.min(1, Math.max(0, part)) * 100)}%` }} />
      </div>
      {repere && (
        <>
          <span aria-hidden className="absolute -top-1.5 h-5 w-0.5 rounded-full bg-ambre" style={{ left: `calc(${Math.round(repere.part * 100)}% - 1px)` }} />
          <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[11.5px] tabular-nums text-ambre" style={{ left: `${Math.round(repere.part * 100)}%` }}>{repere.texte}</span>
        </>
      )}
    </div>
  );
}

function CarteVille({ ville, appelees, total, reste }) {
  return (
    <div className="k-verre flex flex-col gap-2 px-5 py-4">
      <span className="text-[13px] text-ardoise">Progression sur la ville</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[26px] leading-none text-encre">{ville || "–"}</span>
        {total > 0 && <span className="text-[13px] tabular-nums text-ardoise">{appelees} / {total} agences</span>}
      </span>
      <Barre part={total ? appelees / total : 0} />
      {total > 0 && <span className="text-[12.5px] text-ardoise">{reste ? `Encore ${pluriel(reste, "agence")} pour finir ${ville}` : `${ville} est finie`}</span>}
    </div>
  );
}

/** Une graduation lisible : 0 et trois paliers jusqu'à un multiple de 3 au-dessus du maximum. */
const paliers = (max) => { const m = Math.max(3, Math.ceil(max / 3) * 3); return [0, m / 3, (2 * m) / 3, m]; };

function CarteFichesMoi({ f }) {
  if (!f) return <div className="k-verre px-5 py-4 text-[13px] text-ardoise">Fiches reçues par vous cette semaine : indisponibles pour l'instant.</div>;
  const L = 520; const H = 150; const G = 28; const B = 22;
  const ys = paliers(Math.max(f.moi.total, f.record?.total || 0));
  const max = ys[3];
  const x = (i) => G + 12 + (i * (L - G - 24)) / 4;
  const y = (v) => H - B - (v / max) * (H - B - 10);
  const jusqua = f.moi.cumul.slice(0, f.aujourdhui + 1);
  const ligne = (t) => t.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <div className="k-verre flex flex-col gap-1 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="text-[13px] text-ardoise">Fiches reçues par vous cette semaine</span>
        <span className="flex items-center gap-4 text-[12px] text-craie">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3.5 rounded-full bg-menthe" />Cette semaine</span>
          {f.record && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-2 border-dotted border-ambre" />Semaine record</span>}
        </span>
      </div>
      <span className="flex items-baseline gap-2">
        <span className="text-[26px] leading-none tabular-nums text-encre">{f.moi.total}</span>
        <span className="text-[13px] text-ardoise">{f.record ? `record : ${f.record.total} sur une semaine` : "première semaine mesurée"}</span>
      </span>
      <svg viewBox={`0 0 ${L} ${H}`} className="mt-2 w-full" role="img" aria-label={`Fiches reçues par vous, cumul de la semaine : ${f.moi.total}`}>
        {ys.map((v) => (
          <g key={v}>
            <line x1={G} x2={L} y1={y(v)} y2={y(v)} className="stroke-trait" strokeWidth="1" />
            <text x={G - 8} y={y(v) + 4} textAnchor="end" className="fill-ardoise text-[11px] tabular-nums">{v}</text>
          </g>
        ))}
        {f.record && <path d={ligne(f.record.cumul)} fill="none" className="stroke-ambre" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" />}
        <path d={ligne(jusqua)} fill="none" className="stroke-menthe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {jusqua.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === jusqua.length - 1 ? 5 : 9} className={i === jusqua.length - 1 ? "fill-menthe stroke-surface" : "fill-transparent"} strokeWidth="2">
            <title>{`${f.jours[i]} : ${v} au total${f.moi.par_jour[i] ? ` (+${f.moi.par_jour[i]})` : ""}`}</title>
          </circle>
        ))}
        {f.jours.map((j, i) => (
          <text key={j} x={x(i)} y={H - 4} textAnchor="middle" className={`text-[11.5px] ${i === f.aujourdhui ? "fill-encre font-medium" : "fill-ardoise"}`}>{j}</text>
        ))}
      </svg>
    </div>
  );
}

function CarteFichesEquipe({ f }) {
  if (!f) return <div className="k-verre px-5 py-4 text-[13px] text-ardoise">Fiches reçues par l'équipe cette semaine : indisponibles pour l'instant.</div>;
  const L = 520; const H = 150; const G = 28; const B = 22;
  const ys = paliers(Math.max(...f.equipe.par_jour, 1));
  const max = ys[3];
  const pas = (L - G) / 5;
  const larg = Math.min(56, pas * 0.56);
  const y = (v) => H - B - (v / max) * (H - B - 18);
  return (
    <div className="k-verre flex flex-col gap-1 px-5 py-4">
      <span className="text-[13px] text-ardoise">Fiches reçues par toute l'équipe cette semaine</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[26px] leading-none tabular-nums text-encre">{f.equipe.total}</span>
        <span className="text-[13px] text-ardoise">dont {f.moi.total} par vous</span>
      </span>
      <svg viewBox={`0 0 ${L} ${H}`} className="mt-2 w-full" role="img" aria-label={`Fiches reçues par l'équipe cette semaine : ${f.equipe.total}`}>
        {ys.map((v) => (
          <g key={v}>
            <line x1={G} x2={L} y1={y(v)} y2={y(v)} className="stroke-trait" strokeWidth="1" />
            <text x={G - 8} y={y(v) + 4} textAnchor="end" className="fill-ardoise text-[11px] tabular-nums">{v}</text>
          </g>
        ))}
        {f.equipe.par_jour.map((v, i) => {
          const cx = G + pas * i + pas / 2;
          if (i > f.aujourdhui) return <rect key={i} x={cx - larg / 2} y={y(max * 0.2)} width={larg} height={y(0) - y(max * 0.2)} rx="4" fill="none" className="stroke-bord-doux" strokeDasharray="4 4" />;
          const h = Math.max(v ? 3 : 0, y(0) - y(v));
          return (
            <g key={i}>
              {v > 0 && <path d={`M${cx - larg / 2},${y(0)} V${y(0) - h + 4} Q${cx - larg / 2},${y(0) - h} ${cx - larg / 2 + 4},${y(0) - h} H${cx + larg / 2 - 4} Q${cx + larg / 2},${y(0) - h} ${cx + larg / 2},${y(0) - h + 4} V${y(0)} Z`} className="fill-menthe"><title>{`${f.jours[i]} : ${v} pour l'équipe, ${f.moi.par_jour[i]} par vous`}</title></path>}
              {v > 0 && <text x={cx} y={y(0) - h - 6} textAnchor="middle" className="fill-encre text-[12px] tabular-nums">{v}</text>}
            </g>
          );
        })}
        {f.jours.map((j, i) => (
          <text key={j} x={G + pas * i + pas / 2} y={H - 4} textAnchor="middle" className={`text-[11.5px] ${i === f.aujourdhui ? "fill-encre font-medium" : "fill-ardoise"}`}>{j}</text>
        ))}
      </svg>
    </div>
  );
}

function Bilan({ d, temps, ville, appelees, total, occupe, onNouvelle }) {
  const pi = d.par_issue || {};
  const lignes = [
    ["Appels", `${d.appels}${d.record_battu ? " · nouveau record" : d.record ? ` · record ${d.record}` : ""}`],
    ["Décroché", d.appels ? `${d.decroches} sur ${d.appels} · ${d.taux} %` : "–"],
    ["A un bien", pi.a_des_murs || 0],
    ["Pas de bien pour l'instant", pi.pas_de_murs || 0],
    ["Pas intéressé", pi.pas_interesse || 0],
    ["Sans réponse", Object.entries(pi).filter(([k]) => SANS_PERSONNE.has(k)).reduce((t, [, n]) => t + n, 0)],
    ["Ville", total ? `${ville} · ${appelees} / ${total} agences` : ville || "–"],
  ];
  return (
    <div className="k-verre flex flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ardoise">Session terminée · {chrono(temps)} d'appels</span>
          <h2 className="m-0 text-[22px] font-normal leading-[1.25] text-encre">
            {d.record_battu ? `Nouveau record : ${pluriel(d.appels, "appel")}` : `${pluriel(d.appels, "appel")}${d.appels && d.decroches ? `, ${d.decroches} décroché${d.decroches > 1 ? "s" : ""}` : ""}`}
          </h2>
        </div>
        <button type="button" className={BOUTON_ACCENT} disabled={occupe} onClick={onNouvelle}>
          <Play className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />Nouvelle session
        </button>
      </div>
      <div>
        {lignes.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[200px_minmax(0,1fr)] gap-3 border-t border-trait py-2.5 text-[14px] max-md:grid-cols-[140px_minmax(0,1fr)]">
            <span className="text-[13px] text-ardoise">{k}</span>
            <span className="tabular-nums text-encre">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
