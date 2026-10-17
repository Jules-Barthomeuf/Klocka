import React from "react";
import { Database, FileText, FolderOpen, Globe, Mail, ScanSearch } from "lucide-react";

// Les sources d'une proposition de Haka (17 oct. 2026) : « Sources » en
// petites capitales, puis une ligne par source avec son icône et son lien,
// comme sous une réponse du chat (design-system, § 6).

const ICONES = { gmail: Mail, fiche: FileText, preanalyse: ScanSearch, dossiers: FolderOpen, web: Globe };
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

export default function ListeSources({ sources = [], className = "" }) {
  if (!sources.length) return null;
  return (
    <div className={className}>
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Sources</p>
      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
        {sources.map((s, i) => {
          const Icone = ICONES[s.outil] || Database;
          const contenu = (
            <>
              <Icone className="h-3.5 w-3.5 flex-none text-menthe" strokeWidth={1.8} />
              <span className={`min-w-0 truncate ${s.lien ? "underline underline-offset-4" : ""}`}>{s.libelle}</span>
              {s.le && <span className="flex-none text-[12px] text-brume">{quand(s.le)}</span>}
            </>
          );
          return (
            <li key={`${s.outil}-${i}`} className="text-[13.5px] text-craie">
              {s.lien ? <a href={s.lien} className="inline-flex max-w-full items-center gap-2 hover:text-encre">{contenu}</a> : <span className="inline-flex max-w-full items-center gap-2">{contenu}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
