import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { User, Mail, Phone, Save, Loader2, Users, Trash2 } from "lucide-react";
import LinkPartnerDialog from "../components/partner/LinkPartnerDialog";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function MonCompte() {
  const user = useUser();
  const [formData, setFormData] = useState({
    full_name: "",
    telephone: "",
  });
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || "",
        telephone: user.telephone || "",
      });
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
      toast.success("Profil mis à jour avec succès");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour");
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (!user) return null;

  const userEtape = user.etape_actuelle || 1;
  const isAdmin = user.role === "admin";
  const previewClientMode = localStorage.getItem('previewClientMode') === 'true';
  const showAsClient = !isAdmin || previewClientMode;


  return (
    <div className="min-h-screen bg-[#000000] p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-montserrat text-[#f2f3f5] mb-2">Mon Compte</h1>
              <div className="h-0.5 w-32 bg-[#96c0b8] mb-2"></div>
              <p className="text-[#9298a6] text-lg">
                Gérez vos informations personnelles
              </p>
            </div>

            {/* User Avatar */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-montserrat text-[#f2f3f5]">
                  {user.full_name || user.email.split('@')[0]}
                </p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-[#96c0b8] to-[#c3ddd6] rounded-full flex items-center justify-center">
                <span className="text-[#f2f3f5] font-montserrat text-lg">
                  {(user.full_name || user.email).charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            {/* Profil Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="bg-gradient-to-br from-[#000000] to-black border-[#96c0b8]/30 hover:border-[#96c0b8]/60 transition-all duration-300">
                <CardHeader>
                  <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
                    <User className="w-5 h-5 text-[#96c0b8]" />
                    Informations personnelles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="full_name" className="text-[#c9cdd6]">Nom complet</Label>
                      <Input
                        id="full_name"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="bg-[#0f1114] border-[#22262d] text-[#f2f3f5]"
                        placeholder="Votre nom complet"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[#c9cdd6]">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9298a6]" />
                        <Input
                          id="email"
                          value={user.email}
                          disabled
                          className="bg-[#0f1114] border-[#22262d] text-[#9298a6] pl-10 cursor-not-allowed"
                        />
                      </div>
                      <p className="text-xs text-[#9298a6]">L'email ne peut pas être modifié</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="telephone" className="text-[#c9cdd6]">Téléphone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9298a6]" />
                        <Input
                          id="telephone"
                          value={formData.telephone}
                          onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                          className="bg-[#0f1114] border-[#22262d] text-[#f2f3f5] pl-10"
                          placeholder="+33 6 12 34 56 78"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="w-full bg-gradient-to-r from-[#96c0b8] to-[#c3ddd6] hover:from-[#96c0b8]/90 hover:to-[#c3ddd6]/90 transition-all duration-300"
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Enregistrer les modifications
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>

            {/* Partenaires liés */}
            {!user.est_compte_shadow && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="bg-gradient-to-br from-[#000000] to-black border-[#96c0b8]/30">
                  <CardHeader>
                    <CardTitle className="text-[#f2f3f5] flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#96c0b8]" />
                      Investir à deux
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-[#9298a6] text-sm">
                      Gérez les partenaires liés à votre compte d'investissement.
                    </p>
                    
                    {user.comptes_lies && user.comptes_lies.length > 0 ? (
                      <div className="space-y-2">
                        {user.comptes_lies.map((email) => (
                          <div key={email} className="p-3 bg-[#0f1114]/50 rounded-lg border border-[#22262d] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-[#96c0b8]" />
                              <span className="text-[#f2f3f5]">{email}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#9298a6] text-sm">Aucun partenaire lié pour le moment.</p>
                    )}

                    <Button
                      onClick={() => setLinkDialogOpen(true)}
                      className="w-full bg-[#96c0b8]/20 text-[#96c0b8] hover:bg-[#96c0b8]/30 border border-[#96c0b8]/50"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Gérer les partenaires
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {user.est_compte_shadow && user.compte_maitre_email && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="bg-gradient-to-br from-purple-900/20 to-black border-purple-500/30">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <Users className="w-8 h-8 text-purple-400" />
                      <div>
                        <p className="text-[#f2f3f5] font-medium">Compte lié</p>
                        <p className="text-[#9298a6] text-sm">Vous voyez les projets de {user.compte_maitre_email}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Profil investisseur Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card className="bg-gradient-to-br from-[#000000] to-black border-[#96c0b8]/30">
                <CardHeader>
                  <CardTitle className="text-[#f2f3f5]">Votre profil investisseur</CardTitle>
                </CardHeader>
                <CardContent>
                  {user.profil_investisseur ? (
                    <div className="p-4 bg-[#96c0b8]/10 rounded-lg border border-[#96c0b8]/30">
                      <p className="text-lg font-semibold text-[#96c0b8] capitalize">
                        {user.profil_investisseur.replace('_', ' ')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[#9298a6]">Profil non défini</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Suppression du compte */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="bg-gradient-to-br from-[#000000] to-black border-red-500/20">
                <CardHeader>
                  <CardTitle className="text-red-400 flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Zone dangereuse
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[#9298a6] text-sm mb-4">
                    La suppression de votre compte est irréversible. Toutes vos données seront définitivement effacées.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer mon compte
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#000000] border-[#22262d]">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-[#f2f3f5]">Supprimer votre compte ?</AlertDialogTitle>
                        <AlertDialogDescription className="text-[#9298a6]">
                          Cette action est irréversible. Votre compte et toutes vos données seront définitivement supprimés.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-[#0f1114] border-[#22262d] text-[#f2f3f5] hover:bg-[#22262d]">Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-[#f2f3f5]"
                          onClick={() => base44.auth.deleteMe()}
                        >
                          Supprimer définitivement
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <LinkPartnerDialog 
        open={linkDialogOpen} 
        onOpenChange={setLinkDialogOpen} 
        user={user}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['current-user'] });
        }}
      />
    </div>
  );
}