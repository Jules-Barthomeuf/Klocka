import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Loader2, CheckCircle2 } from "lucide-react";

export default function ExportProjects() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(null);

  const handleExport = async () => {
    setLoading(true);
    setDone(false);
    try {
      // Fetch all projects (paginate by 200 until done)
      let all = [];
      let skip = 0;
      const limit = 200;
      while (true) {
        const batch = await base44.entities.Project.list("-created_date", limit, skip);
        if (!batch || batch.length === 0) break;
        all = all.concat(batch);
        if (batch.length < limit) break;
        skip += limit;
      }

      setCount(all.length);

      const json = JSON.stringify({ projects: all }, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `klocka_projects_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-8">
      <div className="bg-[#000000] border border-[#1f2228] rounded-md p-10 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-[#8fa0f2]/10 rounded-md flex items-center justify-center mx-auto">
          <Download className="w-8 h-8 text-[#8fa0f2]" />
        </div>
        <div>
          <h1 className="text-2xl font-light text-[#f2f3f5] mb-2">Export Projets</h1>
          <p className="text-[#9298a6] text-sm">Télécharge l'intégralité de l'entité Project en JSON brut, tous champs inclus.</p>
        </div>

        {done && count !== null && (
          <div className="flex items-center gap-2 justify-center text-[#aab6f5] text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>{count} projet(s) exporté(s) avec succès</span>
          </div>
        )}

        <Button
          onClick={handleExport}
          disabled={loading}
          className="w-full h-12 bg-[#8fa0f2]/15 border border-[#8fa0f2]/30 hover:bg-[#8fa0f2]/25 text-[#f2f3f5] text-sm"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Chargement en cours...</>
          ) : (
            <><Download className="w-4 h-4 mr-2" />Télécharger le JSON</>
          )}
        </Button>
      </div>
    </div>
  );
}