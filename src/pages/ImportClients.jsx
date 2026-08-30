import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Users, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Miroir de la page Import Projets, pour l'entité User : recharge un export
// JSON de clients (export Base44 ou export de la plateforme). Idempotent côté
// serveur : une adresse déjà en base est mise à jour (jamais son mot de passe
// ni son rôle), les autres comptes sont créés — sans mot de passe, chacun le
// définit à sa première connexion.
export default function ImportClients() {
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
      // Formats acceptés : tableau brut, { users / utilisateurs / clients :
      // [...] }, ou { User: [...] } (export Base44).
      const utilisateurs = Array.isArray(data)
        ? data
        : data?.users || data?.utilisateurs || data?.clients || data?.User;
      if (!Array.isArray(utilisateurs)) {
        throw new Error("Le fichier doit contenir un tableau d'utilisateurs (ou un objet { \"users\": [...] }).");
      }
      const r = await base44.request("POST", "/api/admin/import-utilisateurs", { body: { utilisateurs } });
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
        <div className="w-16 h-16 bg-[#f2f3f5]/[0.05] rounded-md flex items-center justify-center mx-auto">
          <Users className="w-8 h-8 text-[#9298a6]" />
        </div>
        <div>
          <h1 className="text-2xl font-light text-[#f2f3f5] mb-2">Import Clients</h1>
          <p className="text-[#9298a6] text-sm">
            Recharge un export JSON de l'entité User. Les adresses déjà en base sont mises à jour (mot de passe et rôle intacts), les autres comptes créés — chacun définit son mot de passe à sa première connexion.
          </p>
        </div>

        {resultat && (
          <div className="flex items-center gap-2 justify-center text-[#aab6f5] text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {resultat.crees.length} compte(s) créé(s), {resultat.existants.length} mis à jour
              {resultat.invalides.length ? `, ${resultat.invalides.length} invalide(s)` : ""}
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
          className="w-full h-12 bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] text-sm"
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
