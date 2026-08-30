import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Miroir de la page Export Projets : recharge un fichier JSON de projets
// (export de la plateforme { projects: [...] } ou export Base44 de l'entité
// Project). L'import est idempotent côté serveur : un projet dont l'id existe
// déjà est mis à jour, les autres sont créés.
export default function ImportProjects() {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  const handleFile = async (fichier) => {
    setLoading(true);
    setResultat(null);
    setErreur(null);
    try {
      let data;
      try {
        data = JSON.parse(await fichier.text());
      } catch {
        throw new Error("Ce fichier n'est pas un JSON valide.");
      }
      // Formats acceptés : tableau brut, { projects: [...] } (page Export
      // Projets), { projets: [...] }, ou { Project: [...] } (export Base44).
      const projets = Array.isArray(data) ? data : data?.projects || data?.projets || data?.Project;
      if (!Array.isArray(projets)) {
        throw new Error("Le fichier doit contenir un tableau de projets (ou un objet { \"projects\": [...] }).");
      }
      const r = await base44.request("POST", "/api/admin/import-projets", { body: { projets } });
      setResultat(r);
      queryClient.invalidateQueries();
    } catch (e) {
      setErreur(e?.message || "Import impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-8">
      <div className="bg-[#000000] border border-[#1f2228] rounded-md p-10 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-[#96c0b8]/10 rounded-md flex items-center justify-center mx-auto">
          <Upload className="w-8 h-8 text-[#96c0b8]" />
        </div>
        <div>
          <h1 className="text-2xl font-light text-[#f2f3f5] mb-2">Import Projets</h1>
          <p className="text-[#9298a6] text-sm">
            Recharge un export JSON de l'entité Project. Les projets dont l'id existe déjà sont mis à jour, les autres créés.
          </p>
        </div>

        {resultat && (
          <div className="flex items-center gap-2 justify-center text-[#c3ddd6] text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {resultat.crees} projet(s) créé(s), {resultat.maj} mis à jour
              {resultat.invalides ? `, ${resultat.invalides} entrée(s) invalide(s)` : ""}
            </span>
          </div>
        )}

        {erreur && (
          <div className="flex items-center gap-2 justify-center text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erreur}</span>
          </div>
        )}

        <Button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="w-full h-12 bg-[#96c0b8]/15 border border-[#96c0b8]/30 hover:bg-[#96c0b8]/25 text-[#f2f3f5] text-sm"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Import en cours...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" />Choisir le fichier JSON</>
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
