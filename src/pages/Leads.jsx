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
      <div className="flex items-center justify-center min-h-screen bg-[#0a0f0e]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#33d6c0]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f0e] p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-montserrat text-white mb-2">
            Leads
          </h1>
          <div className="h-0.5 w-32 bg-[#33d6c0] mb-2"></div>
          <p className="text-gray-400 text-lg">
            Liste de tous les emails des personnes inscrites
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-gray-900 to-black border-black">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#33d6c0]/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#33d6c0]" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Total inscrits</p>
                  <p className="text-2xl text-white">{users.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-900 to-black border-black">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Admins</p>
                  <p className="text-2xl text-white">{users.filter(u => u.role === 'admin').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-900 to-black border-black">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Clients</p>
                  <p className="text-2xl text-white">{users.filter(u => u.role !== 'admin').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="bg-gradient-to-br from-gray-900 to-black border-[#33d6c0]/30 mb-6">
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Rechercher par nom ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 text-base bg-gray-900 text-white border-gray-700"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-gradient-to-br from-gray-900 to-black border-[#33d6c0]/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#33d6c0]" />
              Liste des emails ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-3 text-gray-400 font-medium">Email</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Nom</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Rôle</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Date d'inscription</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-[#33d6c0]" />
                          <span className="text-white">{user.email}</span>
                        </div>
                      </td>
                      <td className="p-3 text-gray-300">
                        {user.full_name || "-"}
                      </td>
                      <td className="p-3">
                        {user.role === 'admin' ? (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-300">
                            <Crown className="w-3 h-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800 border border-blue-300">
                            Client
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-gray-400">
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
                <Mail className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Aucun lead trouvé</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}