import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, LogIn, AlertCircle } from "lucide-react";

// Token secret pour l'accès admin
const ADMIN_TOKEN = "KLOCKA_ADMIN_2025_SECRET";

export default function AdminSignup() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [hasValidToken, setHasValidToken] = useState(false);

  useEffect(() => {
    const checkAndUpgradeUser = async () => {
      try {
        // Vérifier si l'URL contient le token
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        
        // Vérifier si le token est stocké dans localStorage
        const storedToken = localStorage.getItem('admin_token');
        
        const validToken = tokenFromUrl === ADMIN_TOKEN || storedToken === ADMIN_TOKEN;
        setHasValidToken(validToken);

        // Si token valide dans l'URL, le stocker
        if (tokenFromUrl === ADMIN_TOKEN) {
          localStorage.setItem('admin_token', tokenFromUrl);
        }

        // Vérifier si l'utilisateur est authentifié
        const isAuth = await base44.auth.isAuthenticated();
        
        if (isAuth) {
          const user = await base44.auth.me();
          
          // Si token valide et pas admin, transformer en admin
          if (validToken && user.role !== "admin") {
            await base44.entities.User.update(user.id, { role: "admin" });
            // Nettoyer le token après utilisation
            localStorage.removeItem('admin_token');
            // Recharger pour avoir les nouvelles permissions
            window.location.href = createPageUrl("Dashboard");
            return;
          }
          
          // Si déjà admin, rediriger vers le dashboard
          if (user.role === "admin") {
            localStorage.removeItem('admin_token');
            navigate(createPageUrl("Dashboard"));
            return;
          }
          
          // Si authentifié mais pas de token valide et pas admin
          if (!validToken) {
            setIsChecking(false);
            return;
          }
        }
        
        // Si pas authentifié mais token valide, on attend l'action de l'utilisateur
        setIsChecking(false);
      } catch (error) {
        console.log("Error checking auth:", error);
        setIsChecking(false);
      }
    };
    checkAndUpgradeUser();
  }, [navigate]);

  const handleLogin = () => {
    // Rediriger vers la page de login avec retour vers cette page (avec token)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const returnUrl = token ? `${window.location.origin}${window.location.pathname}?token=${token}` : window.location.href;
    base44.auth.redirectToLogin(returnUrl);
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#33d6c0]"></div>
      </div>
    );
  }

  // Si pas de token valide, afficher un message d'erreur
  if (!hasValidToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-none shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-red-500 to-red-600 text-white pb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-montserrat text-center">
              Accès refusé
            </CardTitle>
          </CardHeader>
          
          <CardContent className="p-8 text-center space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Lien d'invitation invalide
              </h2>
              <p className="text-gray-600">
                Ce lien n'est pas valide ou a expiré. Veuillez contacter l'administrateur pour obtenir un nouveau lien d'invitation.
              </p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                <strong>⚠️ Erreur :</strong> Token d'administration manquant ou incorrect
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-none shadow-2xl">
        <CardHeader className="bg-gradient-to-r from-[#33d6c0] to-[#5ee7d4] text-white pb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-montserrat text-center">
            Espace Administrateur
          </CardTitle>
        </CardHeader>
        
        <CardContent className="p-8 text-center space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Accès administrateur validé
            </h2>
            <p className="text-gray-600">
              Créez votre compte ou connectez-vous pour accéder à l'espace administrateur avec tous les droits
            </p>
          </div>

          <Button
            onClick={handleLogin}
            className="w-full h-12 bg-gradient-to-r from-[#33d6c0] to-[#5ee7d4] text-white hover:from-[#33d6c0]/90 hover:to-[#5ee7d4]/90"
          >
            <LogIn className="w-5 h-5 mr-2" />
            Créer un compte / Se connecter
          </Button>

          <div className="bg-[#33d6c0]/10 border border-[#33d6c0]/40 rounded-lg p-4">
            <p className="text-sm text-[#2bb8a5]">
              ✅ Lien d'invitation valide. Votre compte sera automatiquement configuré en tant qu'administrateur.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Après avoir créé votre compte ou vous être connecté, vous aurez accès à toutes les fonctionnalités d'administration de Klocka.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}