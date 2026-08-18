import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Users, CheckCircle2, MessageSquare, Target, Clock,
  DollarSign, TrendingUp, Briefcase, MapPin, BookOpen, ArrowRight, UserPlus
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import FeedbackWidget from "../FeedbackWidget";

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
  "Vincenne": [48.8480, 2.4394], "Amiens": [49.8941, 2.2958], "La Rochelle": [46.1591, -1.1520],
  "Metz": [49.1193, 6.1757], "Bègles": [44.8076, -0.5474], "Le Havre": [49.4944, 0.1079],
  "AIx en Provence": [43.5297, 5.4474], "Nimes": [43.8367, 4.3601], "Toulon": [43.1242, 5.9280],
  "Bayonne": [43.4933, -1.4750], "Pau": [43.2951, -0.3708], "Le Mans": [48.0077, 0.1984],
  "Quimper": [47.9960, -4.0970], "Mulhouse": [47.7508, 7.3359], "Saint-Etienne": [45.4397, 4.3872],
  "Hyères": [43.1206, 6.1286], "Antibes": [43.5808, 7.1251], "Colombes": [48.9225, 2.2531],
  "France": [46.603354, 1.888334], "CANET EN ROUSSILLON": [42.6992, 3.0178], "Fréjus": [43.4333, 6.7333],
  "St Adresse": [49.5081, 0.0789], "Saint Nazaire": [47.2736, -2.2131], "GRENOBLE": [45.1885, 5.7245],
  "Frejus": [43.4333, 6.7333]
};

function StatCard({ icon: Icon, value, label, color = "text-[#35a79b]", delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-[#edeae5]/[0.03] flex items-center justify-center flex-shrink-0">
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-xl font-medium text-[#edeae5] tabular-nums">{value}</p>
          <p className="text-[#edeae5]/25 text-[10px] uppercase tracking-[0.15em]">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

function QuickAccessButton({ icon: Icon, label, onClick, color = "text-[#35a79b]" }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-4 bg-[#0e100f] border border-[#edeae5]/[0.12] hover:border-[#edeae5]/[0.1] hover:bg-[#edeae5]/[0.025] transition-all"
    >
      <Icon className={`w-5 h-5 ${color}`} />
      <span className="text-[#edeae5]/60 text-xs group-hover:text-[#edeae5] transition-colors">{label}</span>
    </button>
  );
}

export default function AdminDashboardView({ user }) {
  const navigate = useNavigate();

  const { data: allUsers = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => base44.entities.User.list(),
    initialData: []
  });
  const { data: allProjects = [] } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: () => base44.entities.Project.list(),
    initialData: []
  });
  const { data: allSuggestions = [] } = useQuery({
    queryKey: ['admin-suggestions'],
    queryFn: () => base44.entities.Suggestion.list(),
    initialData: []
  });
  const { data: crmClients = [] } = useQuery({
    queryKey: ['crm-clients-crm'],
    queryFn: () => base44.entities.ClientCRM.list(),
    initialData: []
  });
  const { data: crmTransactions = [] } = useQuery({
    queryKey: ['crm-transactions'],
    queryFn: () => base44.entities.Transaction.list(),
    initialData: []
  });
  const { data: crmProprietes = [] } = useQuery({
    queryKey: ['crm-proprietes'],
    queryFn: () => base44.entities.Propriete.list(),
    initialData: []
  });
  const { data: crmContacts = [] } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => base44.entities.Contact.list(),
    initialData: []
  });

  const totalClients = allUsers.filter(u => u.role !== 'admin').length;
  const projetsParStatut = {
    prospect: allProjects.filter(p => p.statut === 'prospect').length,
    analyse: allProjects.filter(p => p.statut === 'analyse').length,
    negociation: allProjects.filter(p => p.statut === 'negociation').length,
    financement: allProjects.filter(p => p.statut === 'financement').length,
    signe: allProjects.filter(p => p.statut === 'signe').length
  };
  const suggestionsNouvelles = allSuggestions.filter(s => s.statut === 'nouveau').length;
  const clientsParEtape = etapes.reduce((acc, e) => {
    acc[e.numero] = allUsers.filter(u => u.role !== 'admin' && (u.etape_actuelle ?? 0) === e.numero).length;
    return acc;
  }, {});

  const crmTransactionsFinalisees = crmTransactions.filter(t => t.categorie === 'finalisee');
  const crmVolumeFinalisees = crmTransactionsFinalisees.reduce((s, t) => s + (t.prix_negocie || t.prix_affiche || 0), 0);
  const crmTotalHonoraires = crmTransactions.reduce((s, t) => s + (t.honoraires || 0), 0);
  const crmHonorairesFinalisees = crmTransactionsFinalisees.reduce((s, t) => s + (t.honoraires || 0), 0);
  const crmTransactionsEnCours = crmTransactions.filter(t => t.categorie === 'en_cours').length;

  const contactsByCity = useMemo(() => {
    const map = new Map();
    crmContacts.forEach(c => {
      if (c.localisation) {
        const city = c.localisation.trim();
        if (!map.has(city)) map.set(city, []);
        map.get(city).push(c);
      }
    });
    return Array.from(map.entries());
  }, [crmContacts]);

  const fmtCur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  const pipelineItems = [
    { key: 'prospect', label: 'Prospect', color: 'bg-[#edeae5]/20' },
    { key: 'analyse', label: 'Analyse', color: 'bg-blue-500' },
    { key: 'negociation', label: 'Négociation', color: 'bg-[#e0c9a0]' },
    { key: 'financement', label: 'Financement', color: 'bg-purple-500' },
    { key: 'signe', label: 'Signé', color: 'bg-[#35a79b]' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0c0c]">
      <FeedbackWidget />
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8 md:mb-10">
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5] m-0">Dashboard</h1>
          <p className="text-[13.5px] leading-[1.7] text-[#8b9391] mt-2 mb-0">L'activité de la plateforme en un coup d'œil.</p>
        </motion.div>

        {/* Stats principales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Users} value={totalClients} label="Clients" delay={0.05} />
          <StatCard icon={Building2} value={allProjects.length} label="Projets" color="text-blue-400" delay={0.1} />
          <StatCard icon={CheckCircle2} value={projetsParStatut.signe} label="Signés" color="text-[#7fd3c9]" delay={0.15} />
          <StatCard icon={MessageSquare} value={suggestionsNouvelles} label="Suggestions" color="text-[#e0c9a0]" delay={0.2} />
        </div>

        {/* Pipeline + Clients par étape */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5">
            <p className="text-[#edeae5]/60 uppercase tracking-[0.2em] text-[9px] mb-4 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-[#35a79b]" /> Pipeline Projets
            </p>
            <div className="space-y-2.5">
              {pipelineItems.map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-[#edeae5]/40 text-xs flex-1">{label}</span>
                  <span className="text-[#edeae5] text-sm font-medium tabular-nums">{projetsParStatut[key]}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5">
            <p className="text-[#edeae5]/60 uppercase tracking-[0.2em] text-[9px] mb-4 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#35a79b]" /> Clients par étape
            </p>
            <div className="space-y-2.5">
              {etapes.map(etape => (
                <div key={etape.numero} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#35a79b]/15 flex items-center justify-center text-[10px] text-[#35a79b] font-medium">
                    {etape.numero}
                  </div>
                  <span className="text-[#edeae5]/40 text-xs flex-1 truncate">{etape.titre}</span>
                  <span className="text-[#edeae5] text-sm font-medium tabular-nums">{clientsParEtape[etape.numero]}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Accès rapides */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <QuickAccessButton icon={Users} label="Clients" onClick={() => navigate(createPageUrl("AdminClients"))} />
          <QuickAccessButton icon={Building2} label="Projets" color="text-blue-400" onClick={() => navigate(createPageUrl("AdminProjets"))} />
          <QuickAccessButton icon={BookOpen} label="Ressources" color="text-purple-400" onClick={() => navigate(createPageUrl("AdminRessources"))} />
          <QuickAccessButton icon={MessageSquare} label="Suggestions" color="text-[#e0c9a0]" onClick={() => navigate(createPageUrl("AdminSuggestions"))} />
        </div>

        {/* CRM Section */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="mb-6">
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#7fd3c9] mb-2">CRM</p>
            <h2 className="text-xl font-light text-[#edeae5]">Activité commerciale</h2>
          </div>

          {/* CRM Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard icon={Users} value={crmClients.length} label="Clients CRM" color="text-blue-400" />
            <StatCard icon={TrendingUp} value={crmTransactions.length} label="Transactions" color="text-[#7fd3c9]" />
            <StatCard icon={Building2} value={crmProprietes.length} label="Propriétés" color="text-purple-400" />
            <StatCard icon={Briefcase} value={crmContacts.length} label="Agents" color="text-orange-400" />
          </div>

          {/* CRM Financials */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#edeae5]/25 text-[9px] uppercase tracking-[0.15em] mb-1">Vol. Transactions Finalisées</p>
                  <p className="text-[#edeae5] text-lg font-medium">{fmtCur(crmVolumeFinalisees)}</p>
                  <p className="text-[#7fd3c9]/60 text-[10px] mt-1">{crmTransactionsFinalisees.length} transactions</p>
                </div>
                <DollarSign className="w-7 h-7 text-[#7fd3c9]/30" />
              </div>
            </div>
            <div className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#edeae5]/25 text-[9px] uppercase tracking-[0.15em] mb-1">Total Honoraires</p>
                  <p className="text-[#edeae5] text-lg font-medium">{fmtCur(crmTotalHonoraires)}</p>
                  <p className="text-[#35a79b]/60 text-[10px] mt-1">Toutes catégories</p>
                </div>
                <DollarSign className="w-7 h-7 text-[#35a79b]/30" />
              </div>
            </div>
            <div className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#edeae5]/25 text-[9px] uppercase tracking-[0.15em] mb-1">Honoraires Finalisées</p>
                  <p className="text-[#edeae5] text-lg font-medium">{fmtCur(crmHonorairesFinalisees)}</p>
                  <p className="text-[#e0c9a0]/60 text-[10px] mt-1">Transactions finalisées</p>
                </div>
                <DollarSign className="w-7 h-7 text-[#e0c9a0]/30" />
              </div>
            </div>
          </div>

          {/* Map */}
          {contactsByCity.length > 0 && (
            <div className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5 mb-6">
              <p className="text-[#edeae5]/60 uppercase tracking-[0.2em] text-[9px] mb-4 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#35a79b]" /> Agents Immobiliers
              </p>
              <div style={{ height: '400px' }} className="rounded-md overflow-hidden">
                <MapContainer center={[46.603354, 1.888334]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {contactsByCity.map(([city, contacts]) => {
                    const coords = cityCoordinates[city] || cityCoordinates[city.split('/')[0]] || cityCoordinates[city.split(',')[0].trim()];
                    if (!coords) return null;
                    return (
                      <Marker key={city} position={coords}>
                        <Popup>
                          <div className="text-sm">
                            <h3 className="font-bold text-base mb-1">{city}</h3>
                            <p className="text-[#6b7270] mb-2">{contacts.length} agent{contacts.length > 1 ? 's' : ''}</p>
                            {contacts.slice(0, 5).map(c => (
                              <div key={c.id} className="text-xs">
                                <strong>{c.nom}</strong>
                                {c.entreprise && <span className="text-[#8b9391]"> - {c.entreprise}</span>}
                              </div>
                            ))}
                            {contacts.length > 5 && <p className="text-xs text-[#8b9391] italic">+{contacts.length - 5} autres...</p>}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Clients", icon: Users, color: "text-blue-400", page: "CRMClients", count: crmClients.length },
              { label: "Transactions", icon: DollarSign, color: "text-[#7fd3c9]", page: "CRMTransactions", count: crmTransactions.length },
              { label: "Propriétés", icon: Building2, color: "text-purple-400", page: "CRMProprietes", count: crmProprietes.length },
              { label: "Agents", icon: Briefcase, color: "text-orange-400", page: "CRMAgents", count: crmContacts.length },
            ].map(item => (
              <button
                key={item.page}
                onClick={() => navigate(createPageUrl(item.page))}
                className="group bg-[#0e100f] border border-[#edeae5]/[0.12] p-5 text-left hover:border-[#edeae5]/[0.1] hover:bg-[#edeae5]/[0.025] transition-all"
              >
                <div className="w-10 h-10 rounded-md bg-[#edeae5]/[0.03] flex items-center justify-center mb-3 group-hover:bg-[#edeae5]/[0.05] transition-colors">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <p className="text-[#edeae5] text-sm font-medium mb-0.5">{item.label}</p>
                <p className="text-[#edeae5]/20 text-lg font-light tabular-nums">{item.count}</p>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}