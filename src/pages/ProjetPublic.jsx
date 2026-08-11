import React, { useState, useEffect } from "react";
import { getPublicProject } from "@/functions/getPublicProject";
import ProjetContent from "@/components/projet/ProjetContent";

export default function ProjetPublic() {
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setStatus("error");
      return;
    }
    getPublicProject({ id })
      .then((res) => {
        if (res?.data?.success && res.data.project) {
          setProject(res.data.project);
          setStatus("ok");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#2A9D8F]/30 border-t-[#2A9D8F] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (status === "error" || !project) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <p className="text-white/30">Ce projet est introuvable ou le lien n'est plus valide.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <ProjetContent project={project} isPublic />
      <div className="max-w-7xl mx-auto px-3 md:px-6 pb-10 flex justify-center">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
          alt="Klocka"
          className="h-8 w-auto object-contain opacity-60"
        />
      </div>
    </div>
  );
}