import React, { useEffect, useState } from "react";
import { Check, FileText, Loader2 } from "lucide-react";
import LogoKP from "@/components/mandataire/LogoKP";
import Loader from "@/components/ui/Loader";

// La data room côté acquéreur (7 nov. 2026, Jules) : publique, ouverte par le lien que le mandataire lui donne
// (/data-room/:jeton), sans compte. Le bien, puis les pièces visibles des acquéreurs, chacune s'ouvre dans un nouvel
// onglet ; une pièce qui manque se demande d'un tap, le mandataire le voit dans sa Data room (« Demandé par »).
// Le serveur : GET /api/data-room/:jeton, GET …/fichier/:fid, POST …/demande.

const API = "/api/data-room";

/** Le jeton : dans le chemin (/data-room/abc), sinon en paramètre (?jeton=abc). */
function jetonDeLAdresse() {
  const m = window.location.pathname.match(/\/data-room\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get("jeton") || "";
}

function Cadre({ children }) {
  return (
    <div className="min-h-[100dvh] bg-fond px-4 pb-16 pt-8">
      <div className="mx-auto w-full max-w-[640px]">
        <LogoKP fond="theme" className="text-[26px]" />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export default function DataRoomAcquereur() {
  const jeton = jetonDeLAdresse();
  const [v, setV] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  useEffect(() => {
    if (!jeton) { setErreur("Ce lien est incomplet."); return; }
    fetch(`${API}/${encodeURIComponent(jeton)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Ce lien ne s'ouvre pas.");
      setV(j);
    }).catch((e) => setErreur(e.message));
  }, [jeton]);

  const demander = async (cle) => {
    setEnvoi(cle);
    try {
      const r = await fetch(`${API}/${encodeURIComponent(jeton)}/demande`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cle }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "La demande n'est pas partie.");
      setV((d) => ({ ...d, cases: d.cases.map((c) => (c.cle === cle ? { ...c, demandee: true } : c)) }));
    } catch (e) { setErreur(e.message); } finally { setEnvoi(null); }
  };

  if (!v && !erreur) return <Cadre><Loader titre="La data room s'ouvre" /></Cadre>;
  if (!v) return <Cadre><p className="m-0 text-[15px] text-encre">{erreur}</p></Cadre>;
  const cases = v.cases || [];
  return (
    <Cadre>
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Data room</p>
      <h1 className="m-0 mt-2 text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre">{v.bien?.titre || "Le bien"}</h1>
      <p className="m-0 mt-2 text-[14px] leading-[1.6] text-ardoise">Les pièces du dossier. Une pièce manque ? Demandez-la : votre conseiller est prévenu.</p>
      {erreur && <p className="m-0 mt-4 text-[13.5px] text-alerte">{erreur}</p>}
      {cases.length ? (
        <ul className="m-0 mt-6 list-none border-y border-trait p-0">
          {cases.map((c) => {
            const fichiers = c.fichiers || [];
            return (
              <li key={c.cle} className="border-t border-trait py-4 first:border-t-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="m-0 min-w-0 flex-1 text-[16px] text-encre">{c.mot}</p>
                  {!fichiers.length && (c.demandee
                    ? <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-ambre"><Check className="h-3.5 w-3.5" />Demandée</span>
                    : (
                      <button type="button" onClick={() => demander(c.cle)} disabled={envoi === c.cle}
                        className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[12.5px] text-craie hover:border-pervenche hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
                        {envoi === c.cle && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Demander cette pièce
                      </button>
                    ))}
                </div>
                {fichiers.length > 0 && (
                  <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                    {fichiers.map((f) => (
                      <li key={f.id}>
                        <a href={`${API}/${encodeURIComponent(jeton)}/fichier/${encodeURIComponent(f.id)}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-2 text-[14px] text-pervenche hover:text-encre">
                          <FileText className="h-4 w-4 flex-none" /><span className="truncate">{f.nom}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="m-0 mt-6 border-y border-trait py-6 text-[14px] text-brume">Les pièces arrivent ici dès que votre conseiller les partage.</p>}
    </Cadre>
  );
}
