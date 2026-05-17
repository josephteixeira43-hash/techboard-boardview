"use client";

import { useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { SchematicFile } from "@/app/schematics/[deviceId]/page";
import {
  FileText,
  AlertTriangle,
  Layout,
  Upload,
  Loader2,
  ChevronRight,
  Trash2,
} from "lucide-react";

interface Props {
  files: SchematicFile[];
  selectedFile: SchematicFile | null;
  onSelect: (f: SchematicFile) => void;
  loading: boolean;
  deviceId: string;
  onFilesUpdated: () => void;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TYPE_ICONS: Record<SchematicFile["type"], React.ReactNode> = {
  electrical_list: <FileText size={15} className="text-yellow-400 shrink-0" />,
  troubleshooting: <AlertTriangle size={15} className="text-blue-400 shrink-0" />,
  schematic: <Layout size={15} className="text-green-400 shrink-0" />,
};

const TYPE_LABELS: Record<SchematicFile["type"], string> = {
  electrical_list: "Lista Elétrica",
  troubleshooting: "Troubleshooting",
  schematic: "Esquema",
};

export default function SchematicSidebar({
  files,
  selectedFile,
  onSelect,
  loading,
  deviceId,
  onFilesUpdated,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // Agrupa por tipo
  const groups = {
    electrical_list: files.filter((f) => f.type === "electrical_list"),
    troubleshooting: files.filter((f) => f.type === "troubleshooting"),
    schematic: files.filter((f) => f.type === "schematic"),
  };

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploadFiles = Array.from(e.target.files || []);
    if (!uploadFiles.length) return;

    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      const path = `${deviceId}/${file.name}`;

      await supabase.storage
        .from("schematics")
        .upload(path, file, { upsert: true });

      setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100));
    }

    setUploading(false);
    setUploadProgress(0);
    onFilesUpdated();

    // Limpa input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(file: SchematicFile) {
    if (!confirm(`Remover "${file.name}"?`)) return;
    await supabase.storage
      .from("schematics")
      .remove([`${deviceId}/${file.name}.pdf`]);
    onFilesUpdated();
  }

  if (collapsed) {
    return (
      <div className="w-10 bg-gray-900 border-r border-gray-800 flex flex-col items-center pt-4 gap-3">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          title="Expandir sidebar"
        >
          <ChevronRight size={16} />
        </button>
        <div className="w-px flex-1 bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      {/* Header da sidebar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Documentos
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded hover:bg-gray-800 text-gray-600 hover:text-gray-400 transition-colors"
          title="Recolher"
        >
          <ChevronRight size={14} className="rotate-180" />
        </button>
      </div>

      {/* Upload */}
      <div className="px-3 py-3 border-b border-gray-800">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleUpload}
          className="hidden"
          id="pdf-upload"
        />
        <label
          htmlFor="pdf-upload"
          className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-dashed cursor-pointer transition-colors text-xs font-medium ${
            uploading
              ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
              : "border-gray-700 text-gray-500 hover:border-yellow-500/50 hover:text-yellow-400 hover:bg-yellow-500/5"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Enviando... {uploadProgress}%
            </>
          ) : (
            <>
              <Upload size={14} />
              Adicionar PDF
            </>
          )}
        </label>
        {uploading && (
          <div className="mt-2 bg-gray-800 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-yellow-500 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Lista de arquivos */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-gray-600" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileText size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-xs text-gray-600">
              Nenhum PDF ainda.
              <br />
              Faça upload dos esquemas do A12.
            </p>
          </div>
        ) : (
          Object.entries(groups).map(([type, groupFiles]) => {
            if (!groupFiles.length) return null;
            return (
              <div key={type} className="mb-4">
                <div className="flex items-center gap-2 px-4 py-1.5">
                  {TYPE_ICONS[type as SchematicFile["type"]]}
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {TYPE_LABELS[type as SchematicFile["type"]]}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {groupFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`group flex items-center gap-2 mx-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedFile?.id === file.id
                          ? "bg-yellow-500/15 border border-yellow-500/30"
                          : "hover:bg-gray-800"
                      }`}
                      onClick={() => onSelect(file)}
                    >
                      <FileText
                        size={13}
                        className={
                          selectedFile?.id === file.id
                            ? "text-yellow-400"
                            : "text-gray-600"
                        }
                      />
                      <span
                        className={`text-xs flex-1 truncate ${
                          selectedFile?.id === file.id
                            ? "text-yellow-300"
                            : "text-gray-400"
                        }`}
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 text-gray-600 transition-all"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-600">Supabase Storage ativo</span>
        </div>
      </div>
    </div>
  );
}
