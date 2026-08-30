import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, X, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function LinkPartnerDialog({ open, onOpenChange, user, onSuccess }) {
  const [partnerEmail, setPartnerEmail] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const queryClient = useQueryClient();

  const handleLinkPartner = async () => {
    if (!partnerEmail.trim()) {
      toast.error("Veuillez entrer une adresse email");
      return;
    }

    setIsLinking(true);
    try {
      // Mettre à jour le compte maître avec le nouveau partenaire
      const currentLinkedAccounts = user.comptes_lies || [];
      if (currentLinkedAccounts.includes(partnerEmail)) {
        toast.error("Ce partenaire est déjà lié à votre compte");
        setIsLinking(false);
        return;
      }

      await base44.auth.updateMe({
        comptes_lies: [...currentLinkedAccounts, partnerEmail]
      });

      toast.success(`Invitation envoyée à ${partnerEmail}. Le compte sera lié lorsque votre partenaire se connectera.`);
      setPartnerEmail("");
      queryClient.invalidateQueries({ queryKey: ['user'] });
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Erreur liaison partenaire:", error);
      toast.error("Erreur lors de la liaison du partenaire");
    } finally {
      setIsLinking(false);
    }
  };

  const handleRemovePartner = async (emailToRemove) => {
    try {
      const currentLinkedAccounts = user.comptes_lies || [];
      await base44.auth.updateMe({
        comptes_lies: currentLinkedAccounts.filter(e => e !== emailToRemove)
      });
      toast.success("Partenaire retiré");
      queryClient.invalidateQueries({ queryKey: ['user'] });
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const linkedPartners = user?.comptes_lies || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#000000] border-[#22262d] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#f2f3f5] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#96c0b8]" />
            Investir à deux
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <p className="text-[#9298a6] text-sm">
            Liez un partenaire pour qu'il puisse voir tous vos projets et informations d'investissement.
          </p>

          {/* Liste des partenaires liés */}
          {linkedPartners.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[#f2f3f5]">Partenaires liés</Label>
              <div className="space-y-2">
                {linkedPartners.map((email) => (
                  <div key={email} className="flex items-center justify-between p-3 bg-[#0f1114]/50 rounded-lg border border-[#22262d]">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[#96c0b8]" />
                      <span className="text-[#f2f3f5] text-sm">{email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePartner(email)}
                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ajouter un partenaire */}
          <div className="space-y-3">
            <Label className="text-[#f2f3f5]">Ajouter un partenaire</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@partenaire.com"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                className="flex-1 bg-[#000000] border-[#22262d] text-[#f2f3f5]"
              />
              <Button
                onClick={handleLinkPartner}
                disabled={isLinking || !partnerEmail.trim()}
                className="bg-[#96c0b8] hover:bg-[#96c0b8]/90"
              >
                {isLinking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-[#9298a6]">
              Votre partenaire recevra accès à tous vos projets et données d'investissement.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}