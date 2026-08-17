import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, StickyNote, X, Users } from "lucide-react";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import NoteCard from "@/components/notes/NoteCard";

export default function AdminNotes() {
  const { data: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newTitre, setNewTitre] = useState("");
  const [newContenu, setNewContenu] = useState("");
  const [showShared, setShowShared] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: () => base44.entities.Note.list("-created_date"),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["note-users"],
    queryFn: () => base44.entities.User.list(),
    enabled: currentUser?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Note.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setNewTitre("");
      setNewContenu("");
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Note.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Note.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const myNotes = notes.filter(n => n.created_by_id === currentUser?.id);
  const sharedNotes = notes.filter(n => n.created_by_id !== currentUser?.id && (n.shared_with_emails || []).includes(currentUser?.email));
  const admins = users.filter(u => u.role === "admin" && u.id !== currentUser?.id);

  const handleCreate = () => {
    if (!newTitre.trim()) return;
    const sharedEmails = admins.map(a => a.email);
    createMutation.mutate({ titre: newTitre, contenu: newContenu, shared_with_emails: sharedEmails });
  };

  const displayedNotes = showShared ? sharedNotes : myNotes;

  return (
    <div className="min-h-screen text-[#EAECEF] p-4 md:p-10" style={{ background: "linear-gradient(160deg,#0B0D0F 0%,#000000 90%)" }}>
      <div className="max-w-3xl mx-auto">
        {/* Header centré léger */}
        <div className="mb-9 flex flex-col items-center text-center gap-5">
          <div>
            <h1 className="text-[28px] md:text-[32px] font-light leading-[1.08] -tracking-[0.02em] m-0">Notes</h1>
            <p className="text-[#8D93A0] text-[14px] leading-[1.5] mt-2 max-w-[420px] mx-auto">Retrouvez vos notes et celles partagées avec votre équipe.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowShared(s => !s)}
              className={`inline-flex items-center gap-2 rounded-md px-5 py-3 text-[14px] font-semibold transition-all border ${showShared ? "bg-[#33d6c0]/15 border-[#33d6c0]/40 text-white" : "bg-[#171A21] border-[#1c2725] text-[#8D93A0] hover:text-[#EAECEF] hover:border-white/20"}`}
            >
              <Users className="w-4 h-4" /> Partagés avec moi
              {sharedNotes.length > 0 && <span className="ml-0.5 text-[10px] bg-white/20 rounded-full px-1.5 py-0.5">{sharedNotes.length}</span>}
            </button>
            {!showShared && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 text-white rounded-md px-5 py-3 text-[14px] font-bold hover:brightness-110 transition-all"
                style={{ background: "linear-gradient(120deg,#33d6c0,#238B7E)" }}
              >
                <Plus className="w-[18px] h-[18px]" strokeWidth={2.4} /> Nouvelle note
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {!showShared && showForm && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative overflow-hidden rounded-[18px] border border-[#33d6c0]/25 bg-[#12151B] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
            >
              {/* Accent bar */}
              <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg,#33d6c0,#238B7E,transparent)" }} />

              <div className="p-5 md:p-6">
                {/* En-tête */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-[#33d6c0]/12 border border-[#33d6c0]/25">
                    <StickyNote className="w-5 h-5 text-[#33d6c0]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white leading-tight">Nouvelle note</h3>
                    <p className="text-[12px] text-[#8D93A0]">Partagée automatiquement avec les admins</p>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); setNewTitre(""); setNewContenu(""); }}
                    className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[#8D93A0] hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Champs */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.14em] text-[#8D93A0] font-medium">Titre</label>
                    <Input
                      placeholder="Ex. Idée pour le projet…"
                      value={newTitre}
                      onChange={(e) => setNewTitre(e.target.value)}
                      className="h-11 bg-[#0B0D0F] text-white text-[15px] border-[#1c2725] rounded-md focus-visible:border-[#33d6c0] focus-visible:ring-0 placeholder:text-[#5B616E]"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.14em] text-[#8D93A0] font-medium">Contenu</label>
                    <Textarea
                      placeholder="Écrivez votre note ici…"
                      value={newContenu}
                      onChange={(e) => setNewContenu(e.target.value)}
                      className="bg-[#0B0D0F] text-white border-[#1c2725] rounded-md focus-visible:border-[#33d6c0] focus-visible:ring-0 min-h-[130px] leading-relaxed placeholder:text-[#5B616E] resize-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-[#16201f]">
                  <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setNewTitre(""); setNewContenu(""); }} className="text-[#8D93A0] hover:text-white">
                    Annuler
                  </Button>
                  <button onClick={handleCreate} disabled={!newTitre.trim() || createMutation.isPending} className="inline-flex items-center gap-2 text-white rounded-md px-5 py-2.5 text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-50" style={{ background: "linear-gradient(120deg,#33d6c0,#238B7E)" }}>
                    <Plus className="w-4 h-4" strokeWidth={2.6} /> Créer la note
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#33d6c0]/30 border-t-[#33d6c0] rounded-full animate-spin" />
            </div>
          ) : displayedNotes.length === 0 ? (
            <div className="text-center py-16 text-[#7f9995]">
              {showShared ? <Users className="w-10 h-10 mx-auto mb-3 opacity-30" /> : <StickyNote className="w-10 h-10 mx-auto mb-3 opacity-30" />}
              <p className="text-sm">{showShared ? "Aucune note partagée avec vous" : "Aucune note pour le moment"}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {displayedNotes.map((note, idx) => (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(idx * 0.04, 0.4) }}
                >
                  <NoteCard
                    note={note}
                    isOwner={note.created_by_id === currentUser?.id}
                    admins={admins}
                    onUpdate={(id, data) => updateMutation.mutate({ id, data })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}