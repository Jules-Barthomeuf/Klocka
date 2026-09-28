import React, { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileJson, Loader2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";

// Importer des projets depuis Base44 : un export JSON de l'entité Project
// (ou { projects: [...] }, ou un tableau brut). L'import est idempotent côté
// serveur : un projet dont l'id existe déjà est mis à jour, les autres sont
// créés. Réservé aux admins.

export default function ImportProjets() {
  const user = useUser();
  const queryClient = useQueryClient();
  const champ = useRef(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [glisse, setGlisse] = useState(false);
  const [fichier, setFichier] = useState(null);

  if (user?.role !== "admin") return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée aux administrateurs.</p>;

  const importer = async (f) => {
    if (!f) return;
    setFichier(f.name);
    setEnCours(true);
    setResultat(null);
    setErreur(null);
    try {
      let data;
      try { data = JSON.parse(await f.text()); } catch { throw new Error("Ce fichier n'est pas un JSON valide."); }
      // Formats acceptés : tableau brut, { projects }, { projets }, ou { Project } (export Base44).
      const projets = Array.isArray(data) ? data : data?.projects || data?.projets || data?.Project;
      if (!Array.isArray(projets)) throw new Error("Le fichier doit contenir un tableau de projets (export Base44 de l'entité Project).");
      const r = await base44.request("POST", "/api/admin/import-projets", { body: { projets } });
      setResultat(r);
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
    } catch (e) {
      setErreur(e?.message || "Import impossible.");
    } finally {
      setEnCours(false);
      if (champ.current) champ.current.value = "";
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-10 md:px-8">
      <h1 className="m-0 text-[30px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[24px]">Importer des projets</h1>
      <p className="m-0 mt-2 max-w-[60ch] text-[14px] leading-[1.6] text-ardoise">
        Déposez l'export JSON de l'entité Project de Base44. Un projet déjà présent (même identifiant) est mis à jour, les autres sont créés. Les accents abîmés par l'export sont réparés.
      </p>

      <label
        onDragOver={(e) => { e.preventDefault(); setGlisse(true); }}
        onDragLeave={() => setGlisse(false)}
        onDrop={(e) => { e.preventDefault(); setGlisse(false); importer(e.dataTransfer?.files?.[0]); }}
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed px-6 py-14 text-center transition-colors ${glisse ? "border-menthe bg-menthe/[0.06]" : "border-bord-doux bg-surface-pleine hover:border-bord-vif"}`}
      >
        <input ref={champ} type="file" accept=".json,application/json" className="hidden" onChange={(e) => importer(e.target.files?.[0])} />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-menthe/[0.12] text-menthe">
          {enCours ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        </span>
        <span className="text-[15px] text-encre">{enCours ? "Import en cours…" : "Choisir le fichier JSON, ou le déposer ici"}</span>
        {fichier && <span className="inline-flex items-center gap-1.5 text-[13px] text-ardoise"><FileJson className="h-3.5 w-3.5" />{fichier}</span>}
      </label>

      {resultat && (
        <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-trait bg-surface-pleine px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-menthe" />
          <p className="m-0 text-[14px] text-encre">
            {resultat.crees} projet{resultat.crees > 1 ? "s" : ""} créé{resultat.crees > 1 ? "s" : ""}, {resultat.maj} mis à jour
            {resultat.invalides ? <span className="text-ardoise">, {resultat.invalides} ligne{resultat.invalides > 1 ? "s" : ""} ignorée{resultat.invalides > 1 ? "s" : ""}</span> : null}.
          </p>
        </div>
      )}
      {erreur && (
        <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-alerte/40 px-5 py-4">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-alerte" />
          <p className="m-0 text-[14px] text-alerte">{erreur}</p>
        </div>
      )}
    </div>
  );
}
