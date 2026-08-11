import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import NewUserWelcomeComponent from "@/components/dashboard/NewUserWelcome";

export default function NewUserWelcome() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch user immediately
    const fetchUser = async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
        // If etape changed (> 0), redirect to dashboard
        if ((u?.etape_actuelle ?? 0) > 0) {
          navigate("/Dashboard", { replace: true });
        }
      } catch {
        setUser(null);
      }
    };

    fetchUser();

    // Poll every 5 seconds to detect when admin unlocks access
    const interval = setInterval(fetchUser, 5000);
    return () => clearInterval(interval);
  }, [navigate]);

  return <NewUserWelcomeComponent user={user} />;
}