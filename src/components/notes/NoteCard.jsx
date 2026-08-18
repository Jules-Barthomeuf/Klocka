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
    <Card className="bg-[#171918] border-[#edeae5]/[0.1] p-4 space-y-3">
      {editing ? (
        <>
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726]"
            placeholder="Titre"
          />
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] min-h-[120px]"
            placeholder="Contenu de la note..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="text-[#9aa19e] hover:text-[#edeae5]">
              <X className="w-4 h-4 mr-1" /> Annuler
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-[#35a79b] hover:bg-[#35a79b]/80 text-[#edeae5]">
              <Check className="w-4 h-4 mr-1" /> Sauvegarder
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[#edeae5] font-medium text-sm">{note.titre}</h3>
            <div className="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)} className="h-7 w-7 text-[#8b9391] hover:text-[#edeae5]">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {isOwner && (
                <Button variant="ghost" size="icon" onClick={() => setShowShare(s => !s)} className={`h-7 w-7 ${showShare || sharedEmails.length > 0 ? "text-[#35a79b]" : "text-[#8b9391]"} hover:text-[#35a79b]`}>
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onDelete(note.id)} className="h-7 w-7 text-[#8b9391] hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {note.contenu && (
            <p className="text-[#9aa19e] text-sm whitespace-pre-wrap leading-relaxed">{note.contenu}</p>
          )}
          <p className="text-[#6b7270] text-[10px]">{moment(note.created_date).format("DD/MM/YYYY HH:mm")}</p>

          {isOwner && showShare && (
            <div className="pt-3 border-t border-[#242726] space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[#8b9391]">Partager avec un admin</p>
              {admins.length === 0 ? (
                <p className="text-xs text-[#8b9391]">Aucun autre admin disponible</p>
              ) : (
                <div className="space-y-1">
                  {admins.map(admin => (
                    <label key={admin.id} className="flex items-center gap-2 cursor-pointer text-sm text-[#d3d8d6] hover:text-[#edeae5] py-1">
                      <input
                        type="checkbox"
                        checked={sharedEmails.includes(admin.email)}
                        onChange={() => toggleShare(admin.email)}
                        className="accent-[#35a79b] w-4 h-4"
                      />
                      <span>{admin.full_name || admin.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {isOwner && sharedEmails.length > 0 && (
            <p className="text-[11px] text-[#35a79b]">Cette note sera partagée à {sharedNames}</p>
          )}
        </>
      )}
    </Card>
  );
}