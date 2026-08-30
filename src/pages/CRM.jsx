import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, Building2, DollarSign, MapPin, Briefcase } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

export default function CRM() {
  const navigate = useNavigate();

  const { data: transactions = [] } = useQuery({
    queryKey: ['crm-transactions'],
    queryFn: () => base44.entities.Transaction.list(),
    initialData: []
  });

  const { data: proprietes = [] } = useQuery({
    queryKey: ['crm-proprietes'],
    queryFn: () => base44.entities.Propriete.list(),
    initialData: []
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: () => base44.entities.Contact.list(),
    initialData: []
  });

  // Calculs statistiques
  const transactionsFinalisees = transactions.filter(t => t.categorie === 'finalisee');
  const volumeTransactionsFinalisees = transactionsFinalisees.reduce((sum, t) => sum + (t.prix_negocie || t.prix_affiche || 0), 0);
  const totalHonoraires = transactions.reduce((sum, t) => sum + (t.honoraires || 0), 0);
  const honorairesFinalisees = transactionsFinalisees.reduce((sum, t) => sum + (t.honoraires || 0), 0);
  const transactionsEnCours = transactions.filter(t => t.categorie === 'en_cours').length;

  // Coordonnées des villes
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

  // Grouper les contacts par ville
  const contactsByCity = useMemo(() => {
    const cityMap = new Map();
    contacts.forEach(contact => {
      if (contact.localisation) {
        const city = contact.localisation.trim();
        if (!cityMap.has(city)) {
          cityMap.set(city, []);
        }
        cityMap.get(city).push(contact);
      }
    });
    return Array.from(cityMap.entries());
  }, [contacts]);

  // Extraire la ville du nom de la transaction ou des propriétés
  const extractCity = (transaction) => {
    if (!transaction) return null;
    
    // Essayer d'extraire depuis le nom de la transaction
    const name = transaction.name || '';
    const proprietes = transaction.proprietes || '';
    const combined = `${name} ${proprietes}`;
    
    // Chercher dans les villes connues
    for (const city of Object.keys(cityCoordinates)) {
      const cityLower = city.toLowerCase();
      const combinedLower = combined.toLowerCase();
      
      if (combinedLower.includes(cityLower)) {
        return city;
      }
    }
    
    // Extraire depuis une virgule si présent
    const parts = combined.split(',').map(p => p.trim());
    for (const part of parts) {
      for (const city of Object.keys(cityCoordinates)) {
        if (part.toLowerCase().includes(city.toLowerCase())) {
          return city;
        }
      }
    }
    
    return null;
  };

  // Transactions par ville avec catégorie
  const transactionsByCity = useMemo(() => {
    const cityMap = new Map();
    transactions.filter(t => t.categorie === 'en_cours' || t.categorie === 'finalisee').forEach(transaction => {
      const city = extractCity(transaction);
      if (city && cityCoordinates[city]) {
        if (!cityMap.has(city)) {
          cityMap.set(city, { enCours: [], finalisees: [] });
        }
        if (transaction.categorie === 'en_cours') {
          cityMap.get(city).enCours.push(transaction);
        } else {
          cityMap.get(city).finalisees.push(transaction);
        }
      }
    });
    return Array.from(cityMap.entries());
  }, [transactions]);

  const crmSections = [
    {
      title: "Transactions",
      icon: DollarSign,
      count: transactions.length,
      subtitle: `${transactionsFinalisees.length} finalisées`,
      color: "from-[#96c0b8]/20 to-[#96c0b8]/10",
      iconBg: "bg-[#96c0b8]/20",
      iconColor: "text-[#c3ddd6]",
      url: "CRMTransactions"
    },
    {
      title: "Propriétés",
      icon: Building2,
      count: proprietes.length,
      color: "from-purple-500/20 to-pink-500/10",
      iconBg: "bg-purple-500/20",
      iconColor: "text-purple-400",
      url: "CRMProprietes"
    },
    {
      title: "Agents Immobiliers",
      icon: Briefcase,
      count: contacts.length,
      color: "from-orange-500/20 to-red-500/10",
      iconBg: "bg-orange-500/20",
      iconColor: "text-orange-400",
      url: "CRMAgents"
    }
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-geist tracking-tighter text-[#f2f3f5] mb-2">
            CRM
          </h1>
          <div className="h-0.5 w-32 bg-[#96c0b8]"></div>
          <p className="text-[#9298a6] mt-4">
            Vue d'ensemble de votre activité commerciale
          </p>
        </div>

        {/* Stats principales */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#000000]/95 to-[#0f1114]/95 border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#9298a6] text-sm">Transactions</p>
                    <p className="text-3xl font-bold text-[#f2f3f5] mt-1">{transactions.length}</p>
                    <p className="text-xs text-[#9298a6] mt-1">{transactionsEnCours} en cours</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-[#c3ddd6]" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#000000]/95 to-[#0f1114]/95 border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#9298a6] text-sm">Propriétés</p>
                    <p className="text-3xl font-bold text-[#f2f3f5] mt-1">{proprietes.length}</p>
                  </div>
                  <Building2 className="w-10 h-10 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#000000]/95 to-[#0f1114]/95 border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#9298a6] text-sm">Agents Immobiliers</p>
                    <p className="text-3xl font-bold text-[#f2f3f5] mt-1">{contacts.length}</p>
                  </div>
                  <Briefcase className="w-10 h-10 text-orange-400" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Stats financières */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#96c0b8]/10 to-[#7fada4]/20 border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#9298a6] text-sm">Volume Transactions Finalisées</p>
                    <p className="text-2xl font-bold text-[#f2f3f5] mt-1">
                      {new Intl.NumberFormat('fr-FR', { 
                        style: 'currency', 
                        currency: 'EUR',
                        maximumFractionDigits: 0 
                      }).format(volumeTransactionsFinalisees)}
                    </p>
                    <p className="text-xs text-[#c3ddd6] mt-1">{transactionsFinalisees.length} transactions</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-[#c3ddd6]" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#96c0b8]/20 to-[#c3ddd6]/20 border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#9298a6] text-sm">Total Honoraires</p>
                    <p className="text-2xl font-bold text-[#f2f3f5] mt-1">
                      {new Intl.NumberFormat('fr-FR', { 
                        style: 'currency', 
                        currency: 'EUR',
                        maximumFractionDigits: 0 
                      }).format(totalHonoraires)}
                    </p>
                    <p className="text-xs text-[#96c0b8] mt-1">Toutes catégories</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-[#96c0b8]" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-yellow-900/20 to-yellow-800/20 border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[#9298a6] text-sm">Honoraires Finalisées</p>
                    <p className="text-2xl font-bold text-[#f2f3f5] mt-1">
                      {new Intl.NumberFormat('fr-FR', { 
                        style: 'currency', 
                        currency: 'EUR',
                        maximumFractionDigits: 0 
                      }).format(honorairesFinalisees)}
                    </p>
                    <p className="text-xs text-[#96c0b8] mt-1">Transactions finalisées</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-[#96c0b8]" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Cartes */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Carte des agents */}
          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#000000]/95 to-[#0f1114]/95 border-none">
              <CardHeader>
                <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#96c0b8]" />
                  Agents Immobiliers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: '500px', width: '100%' }} className="rounded-lg overflow-hidden">
                  <MapContainer 
                    center={[46.603354, 1.888334]} 
                    zoom={6} 
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {contactsByCity.map(([city, cityContacts]) => {
                      const coords = cityCoordinates[city] || cityCoordinates[city.split('/')[0]] || cityCoordinates[city.split(',')[0].trim()];
                      if (!coords) return null;
                      
                      return (
                        <Marker key={city} position={coords}>
                          <Popup>
                            <div className="text-sm">
                              <h3 className="font-bold text-base mb-2">{city}</h3>
                              <p className="text-[#6a7180] mb-2">{cityContacts.length} agent{cityContacts.length > 1 ? 's' : ''}</p>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {cityContacts.slice(0, 5).map(contact => (
                                  <div key={contact.id} className="text-xs">
                                    <strong>{contact.nom}</strong>
                                    {contact.entreprise && <span className="text-[#9298a6]"> - {contact.entreprise}</span>}
                                  </div>
                                ))}
                                {cityContacts.length > 5 && (
                                  <p className="text-xs text-[#9298a6] italic">
                                    +{cityContacts.length - 5} autre{cityContacts.length - 5 > 1 ? 's' : ''}...
                                  </p>
                                )}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Carte des transactions */}
          <div className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <Card className="relative bg-gradient-to-br from-[#000000]/95 to-[#0f1114]/95 border-none">
              <CardHeader>
                <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#c3ddd6]" />
                  Transactions
                  <div className="flex gap-3 ml-auto text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span>En cours</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-[#96c0b8]"></div>
                      <span>Finalisées</span>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: '500px', width: '100%' }} className="rounded-lg overflow-hidden">
                  <MapContainer 
                    center={[46.603354, 1.888334]} 
                    zoom={6} 
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {transactionsByCity.map(([city, { enCours, finalisees }]) => {
                      const coords = cityCoordinates[city];
                      if (!coords) return null;

                      const greenIcon = new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                      });

                      const blueIcon = new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                      });
                      
                      const icon = finalisees.length > 0 ? greenIcon : blueIcon;
                      const total = enCours.length + finalisees.length;

                      return (
                        <Marker key={city} position={coords} icon={icon}>
                          <Popup>
                            <div className="text-sm">
                              <h3 className="font-bold text-base mb-2">{city}</h3>
                              <p className="text-[#6a7180] mb-2">{total} transaction{total > 1 ? 's' : ''}</p>
                              {enCours.length > 0 && (
                                <div className="mb-2">
                                  <p className="font-semibold text-blue-600 mb-1">En cours ({enCours.length})</p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {enCours.slice(0, 3).map(t => (
                                      <div key={t.id} className="text-xs">
                                        {t.name}
                                      </div>
                                    ))}
                                    {enCours.length > 3 && <p className="text-xs text-[#9298a6] italic">+{enCours.length - 3} autre{enCours.length - 3 > 1 ? 's' : ''}...</p>}
                                  </div>
                                </div>
                              )}
                              {finalisees.length > 0 && (
                                <div>
                                  <p className="font-semibold text-[#7fada4] mb-1">Finalisées ({finalisees.length})</p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {finalisees.slice(0, 3).map(t => (
                                      <div key={t.id} className="text-xs">
                                        {t.name}
                                      </div>
                                    ))}
                                    {finalisees.length > 3 && <p className="text-xs text-[#9298a6] italic">+{finalisees.length - 3} autre{finalisees.length - 3 > 1 ? 's' : ''}...</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sections */}
        <div className="grid md:grid-cols-4 gap-6">
          {crmSections.map((section, index) => {
            const Icon = section.icon;
            return (
              <div key={index} className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <Card 
                  className={`relative bg-gradient-to-br ${section.color} hover:opacity-90 transition-all cursor-pointer border-none h-full`}
                  onClick={() => navigate(createPageUrl(section.url))}
                >
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between mb-6">
                      <div className={`w-16 h-16 ${section.iconBg} rounded-md flex items-center justify-center`}>
                        <Icon className={`w-8 h-8 ${section.iconColor}`} />
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-[#f2f3f5] mb-2">
                      {section.title}
                    </h3>
                    <div className="text-3xl font-bold text-[#f2f3f5] mb-2">
                      {section.count}
                    </div>
                    {section.subtitle && (
                      <p className="text-[#9298a6] text-sm">{section.subtitle}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}