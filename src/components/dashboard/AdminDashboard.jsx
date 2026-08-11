import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import {
  Building2, Users, CheckCircle2, MessageSquare, Clock, Target,
  DollarSign, Briefcase, BookOpen, MapPin, TrendingUp
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
});

const etapes = [
  { numero: 0, titre: "Compte" },
  { numero: 1, titre: "Acculturation" },
  { numero: 2, titre: "Stratégie" },
  { numero: 3, titre: "Recherche" },
  { numero: 4, titre: "Financement" },
  { numero: 5, titre: "Signature" },
];

const cityCoordinates = {
  "Paris": [48.8566, 2.3522], "Marseille": [43.2965, 5.3698], "Lyon": [45.7640, 4.8357],
  "Toulouse": [43.6047, 1.4442], "Nice": [43.7102, 7.2620], "Nantes": [47.2184, -1.5536],
  "Bordeaux": [44.8378, -0.5792], "Lille": [50.6292, 3.0573], "Rennes": [48.1173, -1.6778],
  "Reims": [49.2583, 4.0317], "Strasbourg": [48.5734, 7.7521], "Montpellier": [43.6108, 3.8767],
  "Grenoble": [45.1885, 5.7245], "Dijon": [47.3220, 5.0415], "Angers": [47.4784, -0.5632],
  "Tours": [47.3941, 0.6848], "Clermont-Ferrand": [45.7772, 3.0870], "Nancy": [48.6921, 6.1844],
  "Rouen": [49.4432, 1.0993], "Cannes": [43.5528, 7.0174], "Brest": [48.3904, -4.4861],
  "Pays Basque": [43.3932, -1.4755], "Anglet": [43.4833, -1.5167], "Arcachon": [44.6606, -1.1659],
  "Montrouge": [48.8167, 2.3167], "Mougins": [43.6000, 7.0000], "Martigues": [43.4048, 5.0522],
  "Bandol": [43.1350, 5.7558], "Courbevoie": [48.8969, 2.2539], "Annecy": [45.8992, 6.1294],
  "Amiens": [49.8941, 2.2958], "La Rochelle": [46.1591, -1.1520], "Metz": [49.1193, 6.1757],
  "Le Havre": [49.4944, 0.1079], "Nimes": [43.8367, 4.3601], "Toulon": [43.1242, 5.9280],
  "Bayonne": [43.4933, -1.4750], "Pau": [43.2951, -0.3708], "Le Mans": [48.0077, 0.1984],
  "Mulhouse": [47.7508, 7.3359], "Saint-Etienne": [45.4397, 4.3872], "Antibes": [43.5808, 7.1251],
  "France": [46.603354, 1.888334], "Fréjus": [43.4333, 6.7333], "Saint Nazaire": [47.2736, -2.2131],
};

function StatCard({ icon: Icon, value, label, color = "text-[#2A9D8F]", sublabel }) {
  return (
    <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.10] transition-all">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.03]`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl text-white font-light">{value}</p>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
          {sublabel && <p className="text-[10px] text-white/20">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, color, onClick }) {
  return (
    <button onClick={onClick}
      className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all flex flex-col items-center gap-2 text-center">
      <Icon className={`w-5 h-5 ${color}`} />
      <span className="text-xs text-white/60">{label}</span>
    </button>
  );
}

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function AdminDashboard({ user, navigate }) {
  const { data: allUsers = [] } = useQuery({
    queryKey: ['admin-users'], queryFn: () => base44.entities.User.list(), enabled: !!user && user.role === 'admin', initialData: []
  });
  const { data: allProjects = [] } = useQuery({
    queryKey: ['admin-projects'], queryFn: () => base44.entities.Project.list(), enabled: !!user && user.role === 'admin', initialData: []
  });
  const { data: allSuggestions = [] } = useQuery({
    queryKey: ['admin-suggestions'], queryFn: () => base44.entities.Suggestion.list(), enabled: !!user && user.role === 'admin', initialData: []
  });
  const { data: crmClients = [] } = useQuery({
    queryKey: ['crm-clients-crm'], queryFn: () => base44.entities.ClientCRM.list(), enabled: !!user && user.role === 'admin', initialData: []
  });
  const { data: crmTransactions = [] } = useQuery({
    queryKey: ['crm-transactions'], queryFn: () => base44.entities.Transaction.list(), enabled: !!user && user.role === 'admin', initialData: []
  });
  const { data: crmProprietes = [] } = useQuery({
    queryKey: ['crm-proprietes'], queryFn: () => base44.entities.Propriete.list(), enabled: !!user && user.role === 'admin', initialData: []
  });
  const { data: crmContacts = [] } = useQuery({
    queryKey: ['crm-contacts'], queryFn: () => base44.entities.Contact.list(), enabled: !!user && user.role === 'admin', initialData: []
  });

  const stats = {
    totalClients: allUsers.filter(u => u.role !== 'admin').length,
    totalProjets: allProjects.length,
    projetsParStatut: {
      prospect: allProjects.filter(p => p.statut === 'prospect').length,
      analyse: allProjects.filter(p => p.statut === 'analyse').length,
      negociation: allProjects.filter(p => p.statut === 'negociation').length,
      financement: allProjects.filter(p => p.statut === 'financement').length,
      signe: allProjects.filter(p => p.statut === 'signe').length,
    },
    suggestionsNouvelles: allSuggestions.filter(s => s.statut === 'nouveau').length,
    clientsParEtape: Object.fromEntries([0,1,2,3,4,5].map(n => [n, allUsers.filter(u => u.role !== 'admin' && (u.etape_actuelle ?? 0) === n).length])),
  };

  const crmFinalisees = crmTransactions.filter(t => t.categorie === 'finalisee');
  const crmVolume = crmFinalisees.reduce((s, t) => s + (t.prix_negocie || t.prix_affiche || 0), 0);
  const crmTotalHon = crmTransactions.reduce((s, t) => s + (t.honoraires || 0), 0);
  const crmHonFin = crmFinalisees.reduce((s, t) => s + (t.honoraires || 0), 0);
  const crmEnCours = crmTransactions.filter(t => t.categorie === 'en_cours').length;

  const contactsByCity = useMemo(() => {
    const m = new Map();
    crmContacts.forEach(c => { if (c.localisation) { const city = c.localisation.trim(); if (!m.has(city)) m.set(city, []); m.get(city).push(c); }});
    return Array.from(m.entries());
  }, [crmContacts]);

  const pipelineItems = [
    { key: 'prospect', label: 'Prospect', color: 'bg-white/20' },
    { key: 'analyse', label: 'Analyse', color: 'bg-blue-500' },
    { key: 'negociation', label: 'Négociation', color: 'bg-amber-500' },
    { key: 'financement', label: 'Financement', color: 'bg-purple-500' },
    { key: 'signe', label: 'Signé', color: 'bg-green-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} value={stats.totalClients} label="Clients" />
        <StatCard icon={Building2} value={stats.totalProjets} label="Projets" color="text-blue-400" />
        <StatCard icon={CheckCircle2} value={stats.projetsParStatut.signe} label="Signés" color="text-green-400" />
        <StatCard icon={MessageSquare} value={stats.suggestionsNouvelles} label="Suggestions" color="text-amber-400" />
      </div>

      {/* Pipeline + Clients par étape */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-[#2A9D8F]" />
            <h3 className="text-white text-sm font-medium">Pipeline Projets</h3>
          </div>
          <div className="space-y-3">
            {pipelineItems.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-white/40 text-sm flex-1">{label}</span>
                <span className="text-white font-light text-lg">{stats.projetsParStatut[key]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-[#2A9D8F]" />
            <h3 className="text-white text-sm font-medium">Clients par étape</h3>
          </div>
          <div className="space-y-3">
            {etapes.map(e => (
              <div key={e.numero} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#2A9D8F]/10 flex items-center justify-center text-[10px] text-[#2A9D8F] font-medium">{e.numero}</div>
                <span className="text-white/40 text-sm flex-1 truncate">{e.titre}</span>
                <span className="text-white font-light text-lg">{stats.clientsParEtape[e.numero]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink icon={Users} label="Clients" color="text-[#2A9D8F]" onClick={() => navigate(createPageUrl("AdminClients"))} />
        <QuickLink icon={Building2} label="Projets" color="text-blue-400" onClick={() => navigate(createPageUrl("AdminProjets"))} />
        <QuickLink icon={BookOpen} label="Ressources" color="text-purple-400" onClick={() => navigate(createPageUrl("AdminRessources"))} />
        <QuickLink icon={MessageSquare} label="Suggestions" color="text-amber-400" onClick={() => navigate(createPageUrl("AdminSuggestions"))} />
      </div>

      {/* CRM Section */}
      <div>
        <div className="mb-5">
          <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-2">CRM</p>
          <h2 className="text-xl font-light text-white">Vue d'ensemble commerciale</h2>
          <div className="h-px w-12 bg-[#2A9D8F] mt-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard icon={Users} value={crmClients.length} label="Clients CRM" color="text-blue-400" />
          <StatCard icon={TrendingUp} value={crmTransactions.length} label="Transactions" color="text-green-400" sublabel={`${crmEnCours} en cours`} />
          <StatCard icon={Building2} value={crmProprietes.length} label="Propriétés" color="text-purple-400" />
          <StatCard icon={Briefcase} value={crmContacts.length} label="Agents" color="text-orange-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-white/30 text-xs mb-1">Volume Finalisé</p>
            <p className="text-xl text-white font-light">{fmt(crmVolume)}</p>
            <p className="text-[10px] text-green-400 mt-1">{crmFinalisees.length} transactions</p>
          </div>
          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-white/30 text-xs mb-1">Total Honoraires</p>
            <p className="text-xl text-white font-light">{fmt(crmTotalHon)}</p>
            <p className="text-[10px] text-[#2A9D8F] mt-1">Toutes catégories</p>
          </div>
          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-white/30 text-xs mb-1">Honoraires Finalisées</p>
            <p className="text-xl text-white font-light">{fmt(crmHonFin)}</p>
            <p className="text-[10px] text-amber-400 mt-1">Transactions finalisées</p>
          </div>
        </div>

        {/* Map */}
        {contactsByCity.length > 0 && (
          <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-[#2A9D8F]" />
              <h3 className="text-white text-sm font-medium">Agents Immobiliers</h3>
            </div>
            <div style={{ height: '400px' }} className="rounded-xl overflow-hidden border border-white/[0.06]">
              <MapContainer center={[46.603354, 1.888334]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {contactsByCity.map(([city, contacts]) => {
                  const coords = cityCoordinates[city];
                  if (!coords) return null;
                  return (
                    <Marker key={city} position={coords}>
                      <Popup>
                        <div className="text-sm">
                          <h3 className="font-bold mb-1">{city}</h3>
                          <p className="text-gray-600 mb-1">{contacts.length} agent{contacts.length > 1 ? 's' : ''}</p>
                          {contacts.slice(0, 5).map(c => (
                            <div key={c.id} className="text-xs">
                              <strong>{c.nom}</strong>{c.entreprise && <span className="text-gray-500"> - {c.entreprise}</span>}
                            </div>
                          ))}
                          {contacts.length > 5 && <p className="text-xs text-gray-500 italic">+{contacts.length - 5} autre(s)</p>}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>
        )}

        {/* CRM Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <QuickLink icon={Users} label="Clients CRM" color="text-blue-400" onClick={() => navigate(createPageUrl("CRMClients"))} />
          <QuickLink icon={DollarSign} label="Transactions" color="text-green-400" onClick={() => navigate(createPageUrl("CRMTransactions"))} />
          <QuickLink icon={Building2} label="Propriétés" color="text-purple-400" onClick={() => navigate(createPageUrl("CRMProprietes"))} />
          <QuickLink icon={Briefcase} label="Agents" color="text-orange-400" onClick={() => navigate(createPageUrl("CRMAgents"))} />
        </div>
      </div>
    </div>
  );
}