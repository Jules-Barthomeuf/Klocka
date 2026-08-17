import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Building2, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ProfilProjects({ budgetMin, budgetMax, color }) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-profil", budgetMin, budgetMax],
    queryFn: async () => {
      const all = await base44.entities.Project.list();
      return all
        .filter((p) => {
          if (p.archived) return false;
          const prix = p.sim_prix_bien_negocie || p.sim_prix_revient || p.prix_acquisition || 0;
          return prix >= budgetMin && prix <= budgetMax;
        })
        .slice(0, 2);
    },
  });

  const formatCurrency = (v) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v || 0));

  // Extract city only (first word or up to comma)
  const getVille = (project) => {
    const addr = project.adresse_complete || project.ville_secteur_champ1 || "";
    // Try to get just the city name from the address
    const parts = addr.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last && last.length > 2) return last;
    if (parts[0]) return parts[0].trim().split(" ").slice(-1)[0];
    return null;
  };

  const getActivite = (project) => {
    return project.activite_locataire || project.nom_locataire || "Commerce";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-10 h-10 text-white/10 mx-auto mb-3" />
        <p className="text-white/30 text-sm">Aucun exemple dans cette tranche pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {projects.map((project) => {
        const prix = project.sim_prix_bien_negocie || project.sim_prix_revient || project.prix_acquisition || 0;
        const loyer = project.sim_loyer_initial_ht || project.loyer_annuel_ht || 0;
        const rendement = prix > 0 && loyer > 0 ? ((loyer / prix) * 100).toFixed(1) : null;
        const ville = getVille(project);
        const activite = getActivite(project);

        return (
          <Card key={project.id} className="bg-white/[0.03] border-[#16201f]">
            <CardContent className="p-5">
              {/* Photo */}
              {project.photos && project.photos.length > 0 ? (
                <div className="h-36 rounded-lg overflow-hidden mb-4">
                  <img src={project.photos[0]} alt="Exemple" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-36 rounded-lg bg-white/[0.03] flex items-center justify-center mb-4">
                  <Building2 className="w-8 h-8 text-white/10" />
                </div>
              )}

              {/* Description anonymisée */}
              <p className="text-white text-sm leading-relaxed">
                <span className="font-medium">{activite}</span>
                {ville && <span className="text-white/50"> à {ville}</span>}
                <span className="text-white/50"> — vendu pour </span>
                <span className="font-medium">{formatCurrency(prix)}</span>
                {rendement && (
                  <>
                    <span className="text-white/50"> avec une rentabilité de </span>
                    <span className="font-medium" style={{ color }}>{rendement}%</span>
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}