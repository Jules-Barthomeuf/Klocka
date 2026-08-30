import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Mail, Phone, MapPin } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

const etapeLabels = [
  "Compte créé",
  "Acculturation",
  "Stratégie",
  "Recherche projet",
  "Financement",
  "Signé"
];

export default function MandataireClients() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['mandataire-clients'],
    queryFn: () => base44.entities.User.list(),
    initialData: []
  });

  const clients = allUsers.filter(u => u.role === 'user');

  const filteredClients = clients.filter(client => {
    const searchLower = searchQuery.toLowerCase();
    return (
      client.full_name?.toLowerCase().includes(searchLower) ||
      client.email?.toLowerCase().includes(searchLower)
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#f2f3f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8fa0f2]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-geist tracking-tighter text-[#f2f3f5] mb-2">
              Mes Clients
            </h1>
            <div className="h-0.5 w-32 bg-[#8fa0f2]"></div>
          </div>
          <Badge className="bg-[#8fa0f2] text-[#f2f3f5] text-lg px-4 py-2">
            {clients.length} clients
          </Badge>
        </div>

        {/* Recherche */}
        <div className="mb-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9298a6]" />
          <Input
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 bg-[#000000] border-[#22262d] text-[#f2f3f5]"
          />
        </div>

        {/* Liste des clients */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <div key={client.id} className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <Card className="relative bg-gradient-to-br from-[#000000]/95 via-[#8fa0f2]/5 to-[#000000]/95 border-none">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 bg-[#8fa0f2] rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[#f2f3f5] font-semibold text-lg">
                        {(client.full_name || client.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[#f2f3f5] font-semibold mb-1 truncate">
                        {client.full_name || 'Utilisateur'}
                      </h3>
                      <Badge className="bg-[#8fa0f2]/20 text-[#8fa0f2] text-xs">
                        {etapeLabels[client.etape_actuelle || 0]}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-[#9298a6]">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    {client.profil_investisseur && (
                      <div className="flex items-center gap-2 text-[#9298a6]">
                        <Users className="w-4 h-4" />
                        <span className="capitalize">{client.profil_investisseur.replace('_', ' ')}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-16 h-16 mx-auto text-[#6a7180] mb-4" />
            <p className="text-[#9298a6] text-lg">Aucun client trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}