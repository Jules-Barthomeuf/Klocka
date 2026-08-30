import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/components/providers/UserProvider";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Plus, Trash2, Eye, Search } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Familles() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useUser();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newFamilleName, setNewFamilleName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate(createPageUrl("Dashboard"));
    }
  }, [user, navigate]);

  const { data: familles = [] } = useQuery({
    queryKey: ['familles'],
    queryFn: () => base44.entities.Famille.list("-created_date"),
    enabled: !!user && user.role === 'admin',
    initialData: []
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!user && user.role === 'admin',
    initialData: []
  });

  const deleteFamilleMutation = useMutation({
    mutationFn: (id) => base44.entities.Famille.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['familles'] })
  });

  const getUsersForFamille = (userIds) => {
    return allUsers.filter(u => userIds?.includes(u.id));
  };

  const filteredFamilles = familles.filter(f => 
    f.nom?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-[#000000] p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-montserrat text-[#f2f3f5] mb-2">Familles</h1>
            <div className="h-0.5 w-32 bg-[#96c0b8] mb-2"></div>
            <p className="text-[#9298a6] text-lg">
              Gérez les groupes de co-investisseurs
            </p>
          </div>
          <NeonButton
            onClick={() => navigate(createPageUrl("AdminClients"))}
            variant="solid"
            className="inline-flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer une famille
          </NeonButton>
        </div>

        {/* Search */}
        <Card className="bg-gradient-to-br from-[#000000] to-black border-[#96c0b8]/30 mb-6">
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#9298a6] w-5 h-5" />
              <Input
                placeholder="Rechercher une famille..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 text-base bg-[#000000] text-[#f2f3f5] border-[#22262d]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Liste des familles */}
        {filteredFamilles.length === 0 ? (
          <Card className="bg-gradient-to-br from-[#000000] to-black border-[#96c0b8]/30">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 text-[#6a7180] mx-auto mb-4" />
              <h2 className="text-xl text-[#f2f3f5] mb-2">Aucune famille créée</h2>
              <p className="text-[#9298a6] mb-6">
                Sélectionnez des utilisateurs dans la gestion clients pour créer une famille.
              </p>
              <NeonButton
                onClick={() => navigate(createPageUrl("AdminClients"))}
                variant="solid"
              >
                Aller à la gestion clients
              </NeonButton>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFamilles.map((famille) => {
              const familleUsers = getUsersForFamille(famille.user_ids);
              return (
                <Card 
                  key={famille.id} 
                  className="bg-gradient-to-br from-[#000000] to-black border-[#96c0b8]/30 hover:border-[#96c0b8]/60 transition-all cursor-pointer"
                  onClick={() => navigate(`${createPageUrl("Famille")}?users=${famille.user_ids?.join(',')}&familleId=${famille.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-[#f2f3f5] text-lg">{famille.nom}</CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFamilleMutation.mutate(famille.id);
                        }}
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {familleUsers.map(u => (
                        <Badge key={u.id} className="bg-[#96c0b8]/20 text-[#96c0b8] border border-[#96c0b8]/50">
                          {u.full_name || u.email.split('@')[0]}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#9298a6]">{familleUsers.length} membres</span>
                      <Button variant="ghost" size="sm" className="text-[#96c0b8] hover:text-[#96c0b8]">
                        <Eye className="w-4 h-4 mr-1" />
                        Voir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}