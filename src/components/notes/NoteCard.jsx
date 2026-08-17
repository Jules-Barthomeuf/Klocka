import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Check, X, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import moment from "moment";

export default function NoteCard({ note, isOwner, admins = [], onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [titre, setTitre] = useState(note.titre);
  const [contenu, setContenu] = useState(note.contenu || "");
  const [showShare, setShowShare] = useState(false);
  const sharedEmails = note.shared_with_emails || [];

  const handleSave = () => {
    onUpdate(note.id, { titre, contenu });
    setEditing(false);
  };

  const toggleShare = (email) => {
    const next = sharedEmails.includes(email)
      ? sharedEmails.filter(e => e !== email)
      : [...sharedEmails, email];
    onUpdate(note.id, { shared_with_emails: next });
  };

  const handleCancel = () => {
    setTitre(note.titre);
    setContenu(note.contenu || "");
    setEditing(false);
  };

  const sharedNames = sharedEmails
    .map(email => admins.find(a => a.email === email)?.full_name || email)
    .join(", ");

  return (
    <Card className="bg-[#101715] border-white/[0.1] p-4 space-y-3">
      {editing ? (
        <>
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="bg-white/[0.03] text-white border-[#16201f]"
            placeholder="Titre"
          />
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            className="bg-white/[0.03] text-white border-[#16201f] min-h-[120px]"
            placeholder="Contenu de la note..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-[#93aca7] hover:text-white">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-[#33d6c0] hover:bg-[#33d6c0]/80 text-white">
              <Check className="w-4 h-4 mr-1" /> Sauvegarder
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-white font-medium text-sm">{note.titre}</h3>
            <div className="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)} className="h-7 w-7 text-[#7f9995] hover:text-white">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {isOwner && (
                <Button variant="ghost" size="icon" onClick={() => setShowShare(s => !s)} className={`h-7 w-7 ${showShare || sharedEmails.length > 0 ? "text-[#33d6c0]" : "text-[#7f9995]"} hover:text-[#33d6c0]`}>
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onDelete(note.id)} className="h-7 w-7 text-[#7f9995] hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {note.contenu && (
            <p className="text-[#93aca7] text-sm whitespace-pre-wrap leading-relaxed">{note.contenu}</p>
          )}
          <p className="text-[#5e7672] text-[10px]">{moment(note.created_date).format("DD/MM/YYYY HH:mm")}</p>

          {isOwner && showShare && (
            <div className="pt-3 border-t border-[#16201f] space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[#7f9995]">Partager avec un admin</p>
              {admins.length === 0 ? (
                <p className="text-xs text-[#7f9995]">Aucun autre admin disponible</p>
              ) : (
                <div className="space-y-1">
                  {admins.map(admin => (
                    <label key={admin.id} className="flex items-center gap-2 cursor-pointer text-sm text-[#c4d5d1] hover:text-white py-1">
                      <input
                        type="checkbox"
                        checked={sharedEmails.includes(admin.email)}
                        onChange={() => toggleShare(admin.email)}
                        className="accent-[#33d6c0] w-4 h-4"
                      />
                      <span>{admin.full_name || admin.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOwner && sharedEmails.length > 0 && (
            <p className="text-[11px] text-[#33d6c0]">Cette note sera partagée à {sharedNames}</p>
          )}
        </>
      )}
    </Card>
  );
}