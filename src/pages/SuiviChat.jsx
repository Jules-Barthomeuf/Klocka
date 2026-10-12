import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";

// Suivi > Chat (12 oct. 2026) : chaque échange des chats (AK dans
// l'application et dans Google Chat, les quatre chats des mandataires), ce
// qui a été envoyé au modèle, ce qu'il a répondu à chaque tour, les outils
// appelés avec leurs arguments et leurs résultats, l'erreur, le coût.

const req = (chemin) => base44.request("GET", `/api/monitoring/chat${chemin}`);
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const euros = (usd) => (usd == null ? "—" : `${(usd * 0.92).toFixed(3).replace(".", ",")} €`);
const secondes = (ms) => (ms == null ? "—" : `${Math.round(ms / 100) / 10} s`);
const CHATS = [["", "Tous"], ["admin", "AK · application"], ["google-chat", "AK · Google Chat"], ["mandataire", "Mandataire"], ["mandataire-estimation", "Estimation"], ["mandataire-mandat", "Mandat"], ["mandataire-prospection", "Prospection"]];
const nomDuChat = Object.fromEntries(CHATS);
const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";
const bloc = "m-0 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-bloc border border-trait bg-surface p-4 font-mono text-[12.5px] leading-[1.5] text-craie";

function Echange({ id, onFerme }) {
  const q = useQuery({ queryKey: ["suivi-chat", id], queryFn: () => req(`/${id}`) });
  const [voirConsigne, setVoirConsigne] = useState(false);
  const e = q.data?.echange;
  if (!e) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">{nomDuChat[e.chat] || e.chat} · {quand(e.le)} · {e.par || "?"}{e.page ? ` · page ${e.page}` : ""}</p>
          <h2 className="m-0 mt-1 text-[22px] font-normal leading-[1.2] text-encre">{e.demande || "(sans texte)"}</h2>
          <p className="m-0 mt-1 text-[13px] text-ardoise">{e.modele} · {(e.tours || []).length} tour{(e.tours || []).length > 1 ? "s" : ""} · {e.n_outils} outil{e.n_outils > 1 ? "s" : ""}{e.n_echecs ? `, ${e.n_echecs} en échec` : ""} · {euros(e.cout_usd)} · {secondes(e.duree_ms)}</p>
        </div>
        <button type="button" onClick={onFerme} className={bouton}>Tous les échanges</button>
      </div>
      {e.erreur && <p className="m-0 rounded-bloc border border-alerte/40 px-4 py-3 text-[14px] text-craie">Erreur : {e.erreur}</p>}
      {e.limite && <p className="m-0 rounded-bloc border border-ambre/40 px-4 py-3 text-[14px] text-craie">Arrêté à la limite de tours.</p>}
      <section>
        <h3 className={titreCase}>La réponse</h3>
        <p className="m-0 whitespace-pre-wrap text-[14.5px] leading-[1.6] text-encre">{e.reponse || "(vide)"}</p>
      </section>
      <section>
        <h3 className={titreCase}>Les outils, dans l'ordre</h3>
        {(e.appels || []).length ? (
          <div className="flex flex-col">
            {e.appels.map((a, i) => (
              <article key={i} className="border-t border-trait py-3 first:border-t-0">
                <p className="m-0 text-[14px] text-encre">{a.outil}<span className={`ml-2 text-[12px] ${a.echec ? "text-alerte" : "text-ardoise"}`}>{a.echec ? "échec" : "ok"} · {secondes(a.duree_ms)}</span></p>
                <pre className="m-0 mt-1.5 whitespace-pre-wrap font-mono text-[12px] text-ardoise">{JSON.stringify(a.arguments)}</pre>
                <pre className="m-0 mt-1 max-h-[180px] overflow-y-auto whitespace-pre-wrap font-mono text-[12px] text-craie">{a.erreur || a.resultat}</pre>
              </article>
            ))}
          </div>
        ) : <p className="m-0 text-[13.5px] text-brume">Aucun outil appelé.</p>}
      </section>
      <section>
        <h3 className={titreCase}>Les tours du modèle</h3>
        <div className="flex flex-col gap-2">
          {(e.tours || []).map((t, i) => (
            <div key={i} className="rounded-bloc border border-trait px-4 py-3">
              <p className="m-0 text-[12px] text-ardoise">Tour {i + 1} · {t.stop_reason} · {t.jetons?.entree ?? 0} jetons en entrée, {t.jetons?.cache_lecture ?? 0} lus du cache, {t.jetons?.sortie ?? 0} en sortie{t.outils?.length ? ` · demande ${t.outils.join(", ")}` : ""}</p>
              {t.texte && <p className="m-0 mt-1.5 whitespace-pre-wrap text-[13.5px] text-craie">{t.texte}</p>}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className={titreCase}>Les messages envoyés</h3>
        <div className="flex flex-col gap-2">
          {(e.messages || []).map((m, i) => (
            <div key={i} className="text-[13.5px]"><span className="text-ardoise">{m.role === "user" ? "Demande" : "Réponse d'avant"} · </span><span className="whitespace-pre-wrap text-craie">{m.texte}</span></div>
          ))}
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className={titreCase}>La consigne ({(e.systeme_longueur || 0).toLocaleString("fr-FR")} caractères, {e.outils_declares} outils déclarés)</h3>
          <button type="button" onClick={() => setVoirConsigne((x) => !x)} className={bouton}>{voirConsigne ? "Masquer" : "Afficher"}</button>
        </div>
        {voirConsigne && <pre className={bloc}>{e.systeme || "(non gardée)"}</pre>}
      </section>
    </div>
  );
}

export default function SuiviChat() {
  const { search } = useLocation();
  const [ouvert, setOuvert] = useState(() => new URLSearchParams(search).get("echange"));
  useEffect(() => { const id = new URLSearchParams(search).get("echange"); if (id) setOuvert(id); }, [search]);
  const [chat, setChat] = useState("");
  const [echecs, setEchecs] = useState(false);
  const q = useQuery({ queryKey: ["suivi-chat", "liste", chat, echecs], queryFn: () => req(`?${new URLSearchParams({ ...(chat ? { chat } : {}), ...(echecs ? { echecs: "1" } : {}) })}`) });
  const lignes = q.data?.echanges || [];
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
      <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">Suivi</h1>
      <OngletsSuivi className="mt-4 mb-6" />
      {ouvert ? <Echange id={ouvert} onFerme={() => setOuvert(null)} /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {CHATS.map(([k, mot]) => (
              <button key={k} type="button" onClick={() => setChat(k)} className={`h-8 rounded-full border px-3 text-[13px] ${chat === k ? "border-menthe text-encre" : "border-trait text-craie hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
            ))}
            <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-craie"><input type="checkbox" checked={echecs} onChange={(e) => setEchecs(e.target.checked)} />Seulement les échecs</label>
          </div>
          <div className="overflow-x-auto rounded-bloc border border-trait">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead><tr>{["Quand", "Qui", "Demande", "Outils", "Tours", "Coût", "Durée"].map((h) => <th key={h} className="border-b border-trait px-3 py-3 text-[12px] font-normal text-ardoise">{h}</th>)}</tr></thead>
              <tbody>
                {lignes.map((e) => (
                  <tr key={e.id} className="cursor-pointer align-top hover:bg-relief/40" onClick={() => setOuvert(e.id)}>
                    <td className="border-b border-trait px-3 py-3 whitespace-nowrap text-craie">{quand(e.le)}<span className="block text-[12px] text-ardoise">{nomDuChat[e.chat] || e.chat}</span></td>
                    <td className="border-b border-trait px-3 py-3 text-craie">{(e.par || "?").split("@")[0]}</td>
                    <td className="max-w-[460px] border-b border-trait px-3 py-3"><span className="block truncate text-encre">{e.demande || "(sans texte)"}</span><span className="block truncate text-[12px] text-ardoise">{e.erreur ? <span className="text-alerte">Erreur : {e.erreur}</span> : e.reponse}</span></td>
                    <td className="border-b border-trait px-3 py-3 tabular-nums text-craie">{e.n_outils}{e.n_echecs ? <span className="text-alerte"> · {e.n_echecs} échec{e.n_echecs > 1 ? "s" : ""}</span> : null}</td>
                    <td className="border-b border-trait px-3 py-3 tabular-nums text-craie">{e.tours}{e.limite ? <span className="text-ambre"> · limite</span> : null}</td>
                    <td className="border-b border-trait px-3 py-3 tabular-nums text-ardoise">{euros(e.cout_usd)}</td>
                    <td className="border-b border-trait px-3 py-3 tabular-nums text-ardoise">{secondes(e.duree_ms)}</td>
                  </tr>
                ))}
                {!lignes.length && !q.isLoading && <tr><td colSpan={7} className="px-3 py-10 text-center text-[14px] text-brume">Aucun échange enregistré pour l'instant : ils arrivent ici dès la prochaine question posée à un chat.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
