import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Loader2, CheckCircle2 } from "lucide-react";

export default function ExportClients() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(null);

  const handleExport = async () => {
    setLoading(true);
    setDone(false);
    try {
      let all = [];
      let skip = 0;
      const limit = 200;
      while (true) {
        const batch = await base44.entities.User.list("-created_date", limit, skip);
        if (!batch || batch.length === 0) break;
        all = all.concat(batch);
        if (batch.length < limit) break;
        skip += limit;
      }

      setCount(all.length);

      const json = JSON.stringify({ clients: all }, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `klocka_clients_export_${new Date().toISOString().slice(0, 10)}.json`;
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
    <div className="min-h-screen bg-[#050807] flex items-center justify-center p-8">
      <div className="bg-[#0a0f0e] border border-[#16201f] rounded-md p-10 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-[#33d6c0]/10 rounded-md flex items-center justify-center mx-auto">
          <Download className="w-8 h-8 text-[#33d6c0]" />
        </div>
        <div>
          <h1 className="text-2xl font-light text-white mb-2">Export Clients</h1>
          <p className="text-gray-500 text-sm">Télécharge l'intégralité de l'entité User (clients) en JSON brut, tous champs inclus.</p>
        </div>

        {done && count !== null && (
          <div className="flex items-center gap-2 justify-center text-[#5ee7d4] text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>{count} client(s) exporté(s) avec succès</span>
          </div>
        )}

        <Button
          onClick={handleExport}
          disabled={loading}
          className="w-full h-12 bg-[#33d6c0]/15 border border-[#33d6c0]/30 hover:bg-[#33d6c0]/25 text-white text-sm"
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