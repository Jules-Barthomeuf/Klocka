import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Mic, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee } from "@/lib/dictee";
import { VERRE } from "@/lib/verre";
import { Barres } from "@/components/outils/visuels";

// Juger le passage (13 nov. 2026, Jules : « tu me donnes une adresse, je regarde, je te dis ce que j'en pense ; t'en
// fais dix ou vingt, et on fait un fine-tuning »). Une adresse de la file, à l'aveugle : on la regarde (photos gardées,
// Street View, plan), on la note de 0 à 10 et on dit pourquoi, au clavier ou à la voix ; la note de Klocka et ses
// critères s'affichent ensuite. Sous la file : les notes de l'équipe, l'écart de Klocka, et le réglage des poids appris
// de ces notes, mesuré sur des notes mises de côté, qu'on adopte d'un clic (server/outils/passage.js).

const dec = (n) => (n == null ? "—" : String(n).replace(".", ","));
const ecartDe = (klocka, vous) => (klocka == null || vous == null ? null : Math.round((klocka - vous) * 2) / 2);
const signe = (n) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${dec(Math.abs(n))}`);
const lien = "inline-flex items-center gap-1 text-[13.5px] text-menthe hover:underline";

export default function JugerPassage() {
  const qc = useQueryClient();
  const [sauf, setSauf] = useState([]);
  const [devoile, setDevoile] = useState(null);
  const tableau = useQuery({
    queryKey: ["passage-tableau"],
    queryFn: () => base44.request("GET", "/api/outils/passage"),
    refetchInterval: (q) => (q.state.data?.file?.en_cours || q.state.data?.file?.a_preparer ? 5000 : false),
  });
  const suivante = useQuery({
    queryKey: ["passage-suivante", sauf.join(",")],
    queryFn: () => base44.request("GET", `/api/outils/passage/suivante?sauf=${encodeURIComponent(sauf.join(","))}`),
    enabled: !devoile,
  });
  // Les adresses arrivent pendant qu'on juge : quand la file grandit, on redemande la suivante.
  const prets = tableau.data?.file?.prets;
  useEffect(() => { if (!suivante.data?.candidat && !devoile) suivante.refetch(); }, [prets]);
  const proposer = useMutation({
    mutationFn: (demande) => base44.request("POST", "/api/outils/passage/proposer", { body: demande || {} }),
    onSuccess: (r, demande) => {
      if (r.erreurs?.length) toast.error(r.erreurs.join(" ; "));
      toast.success(demande?.adresse ? "Adresse ajoutée : elle se lit" : r.ajoutees ? `${r.ajoutees} adresses proposées${r.communes?.length ? ` (${r.communes.join(", ")})` : ""} : elles se lisent une à une` : "Rien de nouveau à proposer");
      qc.invalidateQueries({ queryKey: ["passage-tableau"] });
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Impossible"),
  });
  const adopter = useMutation({
    mutationFn: () => base44.request("POST", "/api/outils/passage/adopter"),
    onSuccess: (r) => { toast.success(`Nouveaux poids en service : ${r.version}`); qc.invalidateQueries({ queryKey: ["passage-tableau"] }); },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Impossible"),
  });
  const t = tableau.data;
  const c = suivante.data?.candidat || null;
  const suivre = () => { setDevoile(null); qc.invalidateQueries({ queryKey: ["passage-suivante"] }); qc.invalidateQueries({ queryKey: ["passage-tableau"] }); };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="m-0 text-[20px] font-normal text-encre">Juger le passage</h2>
          <span className="text-[12.5px] text-brume">
            {t?.file?.en_cours || t?.file?.a_preparer ? `${t.file.a_preparer} adresse${t.file.a_preparer > 1 ? "s" : ""} en lecture · ` : ""}
            {suivante.data?.reste ? `${suivante.data.reste} à juger` : "Rien à juger"}
          </span>
        </div>
        <p className="m-0 max-w-[720px] text-[13.5px] text-ardoise">Regardez l'adresse, donnez votre note du passage piéton en journée, et dites pourquoi. La note de Klocka ne s'affiche qu'après la vôtre.</p>
        {devoile ? <Devoile d={devoile} signaux={t?.signaux || []} onSuivante={suivre} />
          : c ? <Carte key={c.id} c={c} onJuge={setDevoile} onPasser={() => setSauf((s) => [...s, c.id])} />
            : <Vide charge={suivante.isLoading} onProposer={() => proposer.mutate(null)} propose={proposer.isPending} enLecture={!!(t?.file?.en_cours || t?.file?.a_preparer)} />}
        <Ajouter onAjouter={(adresse) => proposer.mutate({ adresse })} onVilles={(villes) => proposer.mutate({ villes })} occupe={proposer.isPending} onProposer={c || devoile ? () => proposer.mutate(null) : null} />
      </section>
      {t && <Notes t={t} />}
      {t && <Reglage t={t} onAdopter={() => adopter.mutate()} adopte={adopter.isPending} />}
    </div>
  );
}

/** L'adresse à juger : ce qu'on peut regarder, la note de 0 à 10, le pourquoi. */
function Carte({ c, onJuge, onPasser }) {
  const [note, setNote] = useState(null);
  const [texte, setTexte] = useState("");
  const base = useRef("");
  const { supporte, ecoute, demarrer, arreter, finalisation } = useDictee({ onTexte: (x) => setTexte([base.current, x].filter(Boolean).join(base.current ? " " : "")) });
  const dicter = () => { if (ecoute) { arreter(); return; } base.current = texte.trim(); demarrer(); };
  const juger = useMutation({
    mutationFn: () => base44.request("POST", `/api/outils/passage/juger/${c.id}`, { body: { note, commentaire: texte.trim() } }),
    onSuccess: (r) => onJuge({ ...r, adresse: c.adresse }),
    onError: (e) => toast.error(e?.data?.error || e?.message || "Impossible"),
  });
  const point = c.lat != null ? `${c.lat},${c.lon}` : null;
  const pret = note != null && !ecoute && !finalisation && !juger.isPending;
  return (
    <div className={`${VERRE} flex flex-col gap-5 p-6 max-md:p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[24px] font-normal leading-[1.2] text-encre">{c.adresse}</p>
          {(c.ville || c.lot) && <p className="m-0 mt-1 text-[13.5px] text-ardoise">{[c.ville, c.lot && c.lot !== c.ville ? `lot ${c.lot}` : null].filter(Boolean).join(" · ")}</p>}
        </div>
        {point && (
          <div className="flex flex-wrap gap-4">
            <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point}`} target="_blank" rel="noreferrer" className={lien}>Street View <ArrowUpRight className="h-3.5 w-3.5" /></a>
            <a href={`https://www.google.com/maps/search/?api=1&query=${point}`} target="_blank" rel="noreferrer" className={lien}>Plan <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
        )}
      </div>
      {c.photos ? (
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {[c.photos.rue, c.photos.local].filter(Boolean).map((src) => <img key={src} src={src} alt="" className="aspect-[16/10] w-full rounded-[12px] border border-trait object-cover" />)}
          {c.photo_date && <p className="col-span-2 m-0 text-[12.5px] text-brume max-md:col-span-1">Photo {c.photo_source || "Street View"} du {c.photo_date}</p>}
        </div>
      ) : <p className="m-0 text-[12.5px] text-brume">Pas de photo de la rue gardée pour cette adresse : ouvrez Street View.</p>}
      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] text-brume">Votre note du passage</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Votre note du passage, de 0 à 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={note === n} onClick={() => setNote(n)}
              className={`grid h-10 w-10 place-items-center rounded-full border text-[15px] tabular-nums transition-colors ${note === n ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-craie hover:border-menthe hover:text-encre"}`}
              style={note === n ? undefined : { background: "transparent" }}>{n}</button>
          ))}
        </div>
        <span className="text-[12.5px] text-brume">0 : personne ne passe · 5 : une rue de quartier · 10 : la meilleure rue de la ville</span>
      </div>
      <div className={`flex flex-col rounded-[12px] border bg-transparent transition-colors ${ecoute ? "border-menthe/60" : "border-bord-doux focus-within:border-bord-vif"}`}>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} aria-label="Pourquoi"
          placeholder="Pourquoi ? Dites-le librement : « rue piétonne, mais en retrait du cœur ; beaucoup de rideaux baissés »"
          className="resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          {supporte ? (
            <button type="button" onClick={dicter} aria-label={ecoute ? "Arrêter la dictée" : "Dicter"} title={ecoute ? "Arrêter la dictée" : "Dicter le pourquoi"}
              className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${ecoute ? "bg-menthe text-sur-menthe" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={ecoute ? undefined : { background: "transparent" }}>
              {ecoute ? <Square className="h-3 w-3" fill="currentColor" /> : finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </button>
          ) : <span />}
          <div className="flex items-center gap-4">
            <button type="button" onClick={onPasser} className="p-0 text-[13.5px] text-brume underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Passer</button>
            <button type="button" disabled={!pret} onClick={() => juger.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-opacity hover:bg-menthe-survol disabled:opacity-40">
              {juger.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Enregistrer<span className="max-md:hidden">&nbsp;et voir la note de Klocka</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Après la note : la vôtre, celle de Klocka, l'écart, et ce sur quoi Klocka s'est fondé. */
function Devoile({ d, onSuivante }) {
  const k = d.klocka;
  const e = ecartDe(k.note, d.jugement.note);
  const lignes = (k.signaux || []).map((x) => ({ nom: x.nom, valeur: x.valeur != null ? Math.round(x.valeur * 20) / 2 : null, max: 10 }));
  return (
    <div className={`${VERRE} flex flex-col gap-5 p-6 max-md:p-4`}>
      <p className="m-0 text-[15px] text-craie">{d.adresse}</p>
      <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1 max-md:gap-3">
        {[["Vous", dec(d.jugement.note)], ["Klocka", k.note != null ? dec(k.note) : "pas de note"], ["Écart de Klocka", e != null ? signe(e) : "—"]].map(([mot, v]) => (
          <div key={mot}>
            <p className="m-0 text-[12.5px] text-brume">{mot}</p>
            <p className="m-0 mt-1 text-[24px] tabular-nums text-encre">{v}</p>
          </div>
        ))}
      </div>
      {k.raison && <p className="m-0 text-[13.5px] text-ardoise">{k.raison}</p>}
      {lignes.length > 0 && <Barres largeurLibelle="minmax(0,220px)" lignes={lignes} max={10} format={(v) => `${dec(v)} / 10`} />}
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-ardoise">
        {(k.signaux || []).filter((x) => x.texte).map((x) => <li key={x.cle}>{x.texte}</li>)}
      </ul>
      <div className="flex justify-end">
        <button type="button" onClick={onSuivante} className="inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">Adresse suivante</button>
      </div>
    </div>
  );
}

function Vide({ charge, onProposer, propose, enLecture }) {
  if (charge) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  return (
    <div className={`${VERRE} flex flex-col items-start gap-3 p-6 max-md:p-4`}>
      <p className="m-0 text-[15px] text-encre">{enLecture ? "Les adresses se lisent, une à une : la première arrive dans un instant." : "Aucune adresse prête à juger."}</p>
      <p className="m-0 max-w-[640px] text-[13.5px] text-ardoise">Klocka propose des rues de toute la gamme dans les villes déjà lues (la plus commerçante, puis des rues aux trois quarts, à la moitié et au quart du classement), avec les adresses des dossiers. Vous pouvez aussi en ajouter une.</p>
      {!enLecture && (
        <button type="button" onClick={onProposer} disabled={propose} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {propose && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Proposer des adresses
        </button>
      )}
    </div>
  );
}

function Ajouter({ onAjouter, onVilles, occupe, onProposer }) {
  const [a, setA] = useState("");
  const [v, setV] = useState("");
  return (
    <div className="flex flex-col gap-3">
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onVilles(v.split(",").map((x) => x.trim()).filter(Boolean)); setV(""); } }} className="flex flex-wrap items-center gap-3">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Des villes que vous connaissez : Antibes, Nice, Cannes" aria-label="Villes où proposer dix adresses"
        className="h-9 w-full max-w-[420px] rounded-full border border-trait bg-transparent px-4 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
      <button type="submit" disabled={occupe || !v.trim()} className="h-9 rounded-full border border-bord-vif px-4 text-[13.5px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Dix adresses par ville</button>
    </form>
    <form onSubmit={(e) => { e.preventDefault(); if (a.trim()) { onAjouter(a.trim()); setA(""); } }} className="flex flex-wrap items-center gap-3">
      <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Ajouter une adresse à juger : 12 rue de la République, Lyon" aria-label="Ajouter une adresse à juger"
        className="h-9 w-full max-w-[420px] rounded-full border border-trait bg-transparent px-4 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
      <button type="submit" disabled={occupe || !a.trim()} className="h-9 rounded-full border border-bord-vif px-4 text-[13.5px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Ajouter</button>
      {onProposer && <button type="button" onClick={onProposer} disabled={occupe} className="p-0 text-[13.5px] text-brume underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Proposer d'autres adresses</button>}
    </form>
    </div>
  );
}

/** Les notes de l'équipe face à Klocka : alors (quand la note a été donnée) et aujourd'hui (avec les poids en service). */
function Notes({ t }) {
  if (!t.lignes.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-[20px] font-normal text-encre">Vos notes</h2>
        <span className="text-[12.5px] text-brume">
          {t.lignes.length} note{t.lignes.length > 1 ? "s" : ""} · Klocka s'écarte de {dec(t.ecart_moyen)} point{t.ecart_moyen > 1 ? "s" : ""} en moyenne
          {t.biais ? ` · note trop ${t.biais > 0 ? "haut" : "bas"} de ${dec(Math.abs(t.biais))} en moyenne` : ""}
        </span>
      </div>
      <div className={`${VERRE} overflow-hidden`}>
        <div className="grid grid-cols-[minmax(0,1fr)_64px_80px_80px_72px] gap-3 border-b border-trait px-4 py-2.5 text-[12.5px] text-ardoise max-md:hidden">
          <span>Adresse</span><span className="text-right">Vous</span><span className="text-right">Klocka alors</span><span className="text-right">Klocka</span><span className="text-right">Écart</span>
        </div>
        {t.lignes.map((l) => {
          const e = ecartDe(l.note_klocka, l.note);
          return (
            <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_64px_80px_80px_72px] items-baseline gap-3 border-b border-trait px-4 py-2.5 text-[13.5px] last:border-b-0 max-md:grid-cols-[minmax(0,1fr)_auto]">
              <span className="min-w-0">
                <span className="block truncate text-encre">{l.adresse}</span>
                {l.commentaire && <span className="block truncate text-[12.5px] text-ardoise">« {l.commentaire} »</span>}
              </span>
              <span className="text-right tabular-nums text-encre">{dec(l.note)}</span>
              <span className="text-right tabular-nums text-ardoise max-md:hidden">{dec(l.note_klocka_alors)}</span>
              <span className="text-right tabular-nums text-ardoise max-md:hidden">{dec(l.note_klocka)}</span>
              <span className={`text-right tabular-nums max-md:hidden ${e != null && Math.abs(e) >= 3 ? "text-alerte" : "text-ardoise"}`}>{signe(e)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Le réglage appris des notes : les poids proposés, mesurés à part, et le bouton pour les mettre en service. */
function Reglage({ t, onAdopter, adopte }) {
  const r = t.reglage;
  const total = (coefs) => Object.values(coefs || {}).reduce((a, b) => a + b, 0) || 1;
  const part = (coefs, k) => `${Math.round(((coefs?.[k] || 0) / total(coefs)) * 100)} %`;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-[20px] font-normal text-encre">Le réglage</h2>
        <span className="text-[12.5px] text-brume">En service : {t.modele.version}</span>
      </div>
      {!r.pret ? (
        <p className="m-0 text-[13.5px] text-ardoise">Encore {r.manque} note{r.manque > 1 ? "s" : ""} avant de proposer un réglage des poids.</p>
      ) : (
        <div className={`${VERRE} flex flex-col gap-4 p-5`}>
          <p className="m-0 text-[13.5px] text-craie">
            Sur vos {r.n} notes, Klocka s'écarte aujourd'hui de <span className="tabular-nums text-encre">{dec(r.actuel.ecart_moyen)}</span> point en moyenne ; avec les poids proposés, de <span className="tabular-nums text-encre">{dec(r.ecart_propose)}</span>, mesuré sur des notes mises de côté.
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-x-3 gap-y-1.5 text-[13.5px]">
            <span className="text-[12.5px] text-ardoise">Critère</span><span className="text-right text-[12.5px] text-ardoise">Aujourd'hui</span><span className="text-right text-[12.5px] text-ardoise">Proposé</span>
            {t.signaux.map((s) => (
              <React.Fragment key={s.cle}>
                <span className="text-craie">{s.nom}</span>
                <span className="text-right tabular-nums text-ardoise">{part(t.modele.coefs, s.cle)}</span>
                <span className="text-right tabular-nums text-encre">{part(r.propose.coefs, s.cle)}</span>
              </React.Fragment>
            ))}
          </div>
          {r.par_ville?.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
              <p className="m-0 text-[13.5px] text-craie">Dans une ville qu'il n'a jamais vue : pour chaque ville, les poids appris sur les autres seulement.</p>
              {r.par_ville.map((v) => (
                <p key={v.ville} className="m-0 text-[13.5px] text-ardoise">
                  <span className="text-encre">{v.ville}</span> ({v.n} notes) : écart de {dec(v.ecart_actuel)} aujourd'hui, <span className={v.ecart_appris_ailleurs < v.ecart_actuel ? "text-encre" : "text-alerte"}>{dec(v.ecart_appris_ailleurs)}</span> appris ailleurs
                </p>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-brume">{r.ecart_propose < r.actuel.ecart_moyen ? "Les poids proposés collent mieux à vos notes." : "Les poids proposés ne font pas mieux : gardez ceux en service."}</span>
            <button type="button" onClick={onAdopter} disabled={adopte || !(r.ecart_propose < r.actuel.ecart_moyen)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
              {adopte && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Adopter ces poids
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
