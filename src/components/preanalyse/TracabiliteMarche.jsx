import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, XCircle } from "lucide-react";

// D'où vient chaque chiffre du marché.
//
// Avant, cette information vivait douze secondes dans un toast : passé le
// délai, plus personne ne pouvait dire si le loyer affiché venait d'Equimmox
// ou d'un repli sur Data-B, ni pourquoi une case était vide. Le serveur garde
// désormais chaque passage ; cet écran le relit.
//
// Trois choses, dans cet ordre : ce qui manque et pourquoi, d'où vient chaque
// chiffre, et le détail des tentatives pour qui veut vérifier.

const MOTIFS = {
  temporaire: { mot: "panne passagère", teinte: "#d9b46a" },
  definitive: { mot: "à corriger", teinte: "#e8746a" },
  sans_donnee: { mot: "rien sur cette adresse", teinte: "#6a7180" },
};

const ECHELLES = { rue: "à la rue", quartier: "au quartier", ville: "à la ville", commune: "à la commune", rayon: "sur le rayon" };

const heure = (iso) =>
  !iso ? "—" : new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const duree = (ms) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

const fourchette = (v) => {
  const n = (x) => (x == null ? null : Math.round(x).toLocaleString("fr-FR"));
  const [b, m, h] = [n(v.bas), n(v.median), n(v.haut)];
  if (b && h) return m ? `${b} – ${m} – ${h}` : `${b} – ${h}`;
  return m || b || h || "—";
};

function Manquantes({ passage }) {
  const enPanne = (passage.sources_en_echec || []).filter((s) => s.classe === "temporaire");
  const aCorriger = passage.notifications || [];
  const sansDonnee = (passage.sources_en_echec || []).filter((s) => s.classe === "sans_donnee");

  return (
    <div className="rounded-[12px] border border-[#4a3a22] bg-[#1a1409] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#d9b46a]" />
        <div className="min-w-0">
          <p className="m-0 text-[13.5px] font-semibold text-[#e6d3a8]">Données de marché incomplètes</p>
          <ul className="mt-2 mb-0 space-y-1 list-none p-0">
            {[...enPanne, ...sansDonnee].map((s) => (
              <li key={s.source} className="text-[12.5px] text-[#a89878]">
                <span className="text-[#c9b892]">{s.service}</span> — {s.erreur}
                <span className="text-[#6a7180]"> · {MOTIFS[s.classe]?.mot} · {s.essais} essai{s.essais > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
          {aCorriger.length > 0 && (
            <p className="m-0 mt-2 text-[12.5px] text-[#e8746a]">
              À corriger vous-même : {aCorriger.map((n) => `${n.service} — ${n.message}`).join(" · ")}
            </p>
          )}
          {passage.nouvelle_tentative_le && !passage.reprise_faite && (
            <p className="m-0 mt-2 text-[12.5px] text-[#8d918f] inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Nouvelle tentative automatique le {heure(passage.nouvelle_tentative_le)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Provenance({ indicateurs }) {
  const lignes = Object.values(indicateurs || {});
  if (!lignes.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-[#6a7180]">
            <th className="font-normal py-1.5 pr-4">Indicateur</th>
            <th className="font-normal py-1.5 pr-4">Valeur</th>
            <th className="font-normal py-1.5 pr-4">Source</th>
            <th className="font-normal py-1.5">Relevé le</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((v) => (
            <tr key={v.cle} className="border-t border-[#1f2228]">
              <td className="py-1.5 pr-4 text-[#c6ccd3] whitespace-nowrap">{v.titre}</td>
              <td className="py-1.5 pr-4 text-[#f2f3f5] whitespace-nowrap">
                {fourchette(v)} <span className="text-[#6a7180]">{v.unite}</span>
                {v.echelle && <span className="text-[#6a7180]"> · {ECHELLES[v.echelle] || v.echelle}</span>}
                {v.precision && <span className="text-[#6a7180]"> ({v.precision})</span>}
              </td>
              <td className="py-1.5 pr-4 text-[#96c0b8] whitespace-nowrap">
                {v.source}
                {v.du_cache && <span className="text-[#6a7180]"> · en cache</span>}
              </td>
              <td className="py-1.5 text-[#6a7180] whitespace-nowrap">{heure(v.collecte_le)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tentatives({ tentatives }) {
  if (!tentatives?.length) return null;
  return (
    <ul className="list-none p-0 m-0 space-y-1">
      {tentatives.map((t, i) => (
        <li key={`${t.source}-${t.essai}-${i}`} className="flex items-start gap-2 text-[12.5px]">
          {t.ok ? (
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#96c0b8]" />
          ) : (
            <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: MOTIFS[t.classe]?.teinte || "#6a7180" }} />
          )}
          <span className="text-[#6a7180]">{heure(t.debut)}</span>
          <span className="text-[#c6ccd3]">{t.service}</span>
          {t.essai > 1 && <span className="text-[#6a7180]">essai {t.essai}</span>}
          <span className="text-[#6a7180]">· {duree(t.ms)}</span>
          {!t.ok && (
            <span className="min-w-0" style={{ color: MOTIFS[t.classe]?.teinte || "#6a7180" }}>
              · {t.erreur}
              {t.attente_ms ? ` — nouvel essai dans ${Math.round(t.attente_ms / 1000)} s` : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function TracabiliteMarche({ dossier, lotIndex = 0 }) {
  const [ouvert, setOuvert] = useState(false);
  const dealId = dossier?.deal_id;
  const { data } = useQuery({
    queryKey: ["marche-journal", dealId, lotIndex],
    queryFn: () => base44.request("GET", `/api/marche/journal?deal_id=${encodeURIComponent(dealId)}&index=${lotIndex}`),
    enabled: !!dealId,
  });

  const passage = data?.dernier;
  if (!passage) return null;

  const sources = passage.sources_utilisees || [];
  return (
    <section className="border border-[#2c3139] rounded-[16px] bg-[#0f1114] px-5 py-4 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">D'où viennent ces chiffres</h3>
        <p className="m-0 text-[12.5px] text-[#6a7180]">
          Lecture du {heure(passage.fin)} · {passage.besoins ? Object.values(passage.besoins).filter((b) => b.servi_par).length : 0}/
          {passage.besoins ? Object.keys(passage.besoins).length : 0} question(s) couverte(s) · {sources.length} source(s) · {duree(passage.ms)}
          {passage.automatique && " · reprise automatique"}
        </p>
      </div>

      {!passage.complet && <Manquantes passage={passage} />}

      <Provenance indicateurs={passage.indicateurs} />

      <div>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[#6a7180] hover:text-[#c6ccd3] bg-transparent border-0 p-0 cursor-pointer"
        >
          {ouvert ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Le détail des tentatives ({passage.tentatives?.length || 0})
        </button>
        {ouvert && (
          <div className="mt-2.5">
            <Tentatives tentatives={passage.tentatives} />
          </div>
        )}
      </div>
    </section>
  );
}
