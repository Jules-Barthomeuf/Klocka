import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Mail, Calendar, Crown } from "lucide-react";

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users-leads'],
    queryFn: () => base44.entities.User.list("-created_date"),
    initialData: []
  });

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#000000]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8fa0f2]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-montserrat text-[#f2f3f5] mb-2">
            Leads
          </h1>
          <div className="h-0.5 w-32 bg-[#8fa0f2] mb-2"></div>
          <p className="text-[#9298a6] text-lg">
            Liste de tous les emails des personnes inscrites
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-[#000000] to-black border-black">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#8fa0f2]/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#8fa0f2]" />
                </div>
                <div>
                  <p className="text-[#9298a6] text-sm">Total inscrits</p>
                  <p className="text-2xl text-[#f2f3f5]">{users.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#000000] to-black border-black">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#a9c5b9]/20 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-[#a9c5b9]" />
                </div>
                <div>
                  <p className="text-[#9298a6] text-sm">Admins</p>
                  <p className="text-2xl text-[#f2f3f5]">{users.filter(u => u.role === 'admin').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#000000] to-black border-black">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-[#9298a6] text-sm">Clients</p>
                  <p className="text-2xl text-[#f2f3f5]">{users.filter(u => u.role !== 'admin').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="bg-gradient-to-br from-[#000000] to-black border-[#8fa0f2]/30 mb-6">
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#9298a6] w-5 h-5" />
              <Input
                placeholder="Rechercher par nom ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 text-base bg-[#000000] text-[#f2f3f5] border-[#22262d]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-gradient-to-br from-[#000000] to-black border-[#8fa0f2]/30">
          <CardHeader>
            <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#8fa0f2]" />
              Liste des emails ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#22262d]">
                    <th className="text-left p-3 text-[#9298a6] font-medium">Email</th>
                    <th className="text-left p-3 text-[#9298a6] font-medium">Nom</th>
                    <th className="text-left p-3 text-[#9298a6] font-medium">Rôle</th>
                    <th className="text-left p-3 text-[#9298a6] font-medium">Date d'inscription</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-[#0f1114] hover:bg-[#0f1114]/50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-[#8fa0f2]" />
                          <span className="text-[#f2f3f5]">{user.email}</span>
                        </div>
                      </td>
                      <td className="p-3 text-[#c9cdd6]">
                        {user.full_name || "-"}
                      </td>
                      <td className="p-3">
                        {user.role === 'admin' ? (
                          <Badge className="bg-amber-100 text-amber-800 border border-[#a9c5b9]">
                            <Crown className="w-3 h-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800 border border-blue-300">
                            Client
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-[#9298a6]">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {user.created_date ? new Date(user.created_date).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          }) : "-"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <Mail className="w-12 h-12 text-[#6a7180] mx-auto mb-4" />
                <p className="text-[#9298a6]">Aucun lead trouvé</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}