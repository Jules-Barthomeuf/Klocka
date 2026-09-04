import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/components/providers/UserProvider";
import ClientDashboardView from "@/components/dashboard/ClientDashboardView";
import AdminDashboardView from "@/components/dashboard/AdminDashboardView";

const etapes = [
  { numero: 0, titre: "Compte", description: "Création du compte" },
  { numero: 1, titre: "Acculturation", description: "Acculturation à l'immobilier commercial" },
  { numero: 2, titre: "Stratégie", description: "Définition de la stratégie" },
  { numero: 3, titre: "Recherche", description: "Recherche & analyse d'un projet" },
  { numero: 4, titre: "Financement", description: "Recherche du financement bancaire" },
  { numero: 5, titre: "Signature", description: "Signature de l'acte authentique" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useUser();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', user?.email, user?.projet_selectionne_id, user?.compte_maitre_email],
    queryFn: async () => {
      if (!user) return [];
      const emailToCheck = user.est_compte_shadow && user.compte_maitre_email
        ? user.compte_maitre_email : user.email;
      const userEtape = user.etape_actuelle || 1;

      if (userEtape >= 4 && user.projet_selectionne_id) {
        const allProjects = await base44.entities.Project.list();
        const selected = allProjects.find(p => p.id === user.projet_selectionne_id);
        if (!selected) {
          return allProjects.filter(p =>
            p.client_email === emailToCheck || p.client_emails?.includes(emailToCheck) ||
            p.client_email === user.email || p.client_emails?.includes(user.email)
          );
        }
        return [selected];
      }

      const allProjects = await base44.entities.Project.list();
      return allProjects.filter(p =>
        p.client_email === emailToCheck || p.client_emails?.includes(emailToCheck) ||
        p.client_email === user.email || p.client_emails?.includes(user.email)
      );
    },
    enabled: !!user,
    initialData: []
  });

  const { data: resources = [] } = useQuery({
    queryKey: ['resources'],
    queryFn: () => base44.entities.Resource.list("-created_date", 3),
    initialData: []
  });

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategy', user?.email],
    queryFn: () => user ? base44.entities.Strategy.filter({ client_email: user.email }) : [],
    enabled: !!user,
    initialData: []
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => base44.entities.AppSettings.list(),
    initialData: []
  });

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const previewClientMode = localStorage.getItem('previewClientMode') === 'true';
  const showAsClient = !isAdmin || previewClientMode;
  const userEtape = user.etape_actuelle ?? 0;
  const userStrategy = strategies.length > 0 ? strategies[0] : null;

  const getEmbedUrl = (url) => {
    if (!url) return null;
    if (url.includes('/preview') || url.includes('/embed')) return url;
    const match = url.match(/[-\w]{25,}/);
    if (match) return `https://drive.google.com/file/d/${match[0]}/preview`;
    return url;
  };
  const videoAccueilUrl = getEmbedUrl(appSettings.find(s => s.setting_key === 'global')?.video_accueil_url);

  // Admin view
  if (isAdmin && !previewClientMode) {
    return <AdminDashboardView user={user} />;
  }

  // Client view
  return (
    <ClientDashboardView
      user={user}
      userEtape={userEtape}
      etapes={etapes}
      projects={projects}
      resources={resources}
      userStrategy={userStrategy}
      videoAccueilUrl={videoAccueilUrl}
    />
  );
}