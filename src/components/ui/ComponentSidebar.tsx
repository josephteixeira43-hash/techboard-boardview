'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, AlertTriangle, Layout, Upload, Loader2, Trash2, ChevronRight, Zap, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_COLORS } from '@/lib/constants'

export interface SchematicFile {
  id: string | null
  name: string
  type: 'electrical_list' | 'troubleshooting' | 'schematic'
  url: string
  device_id: string
}

interface ComponentInfo {
  name: string
  category: string
  description?: string
  voltages?: { node: string; value: string }[]
  commonFaults?: string[]
}

interface Props {
  files: SchematicFile[]
  selectedFile: SchematicFile | null
  onSelect: (f: SchematicFile) => void
  loading: boolean
  deviceId: string
  onFilesUpdated: () => void
  selectedComponent?: ComponentInfo | null
  onClearComponent?: () => void
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  electrical_list: <FileText size={14} className="text-yellow-400 shrink-0" />,
  troubleshooting: <AlertTriangle size={14} className="text-blue-400 shrink-0" />,
  schematic:       <Layout size={14} className="text-green-400 shrink-0" />,
}

const TYPE_LABELS: Record<string, string> = {
  electrical_list: 'Lista Elétrica',
  troubleshooting: 'Troubleshooting',
  schematic:       'Esquema',
}

export default function ComponentSidebar({
  files, selectedFile, onSelect, loading, deviceId,
  onFilesUpdated, selectedComponent, onClearComponent,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  const groups = {
    electrical_list: files.filter(f => f.type === 'electrical_list'),
    troubleshooting: files.filter(f => f.type === 'troubleshooting'),
    schematic:       files.filter(f => f.type === 'schematic'),
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploadFiles = Array.from(e.target.files || [])
    if (!uploadFiles.length) return
    setUploading(true)
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i]
      await supabase.storage.from('schematics').upload(`${deviceId}/${file.name}`, file, { upsert: true })
      setProgress(Math.round(((i + 1) / uploadFiles.length) * 100))
    }
    setUploading(false)
    setProgress(0)
    onFilesUpdated()
    if (e.target) e.target.value = ''
  }

  async function handleDelete(file: SchematicFile) {
    if (!confirm(`Remover "${file.name}"?`)) return
    await supabase.storage.from('schematics').remove([`${deviceId}/${file.name}.pdf`])
    onFilesUpdated()
  }

  if (collapsed) {
    return (
      <div className="w-10 bg-gray-900 border-r border-gray-800 flex flex-col items-center pt-4">
        <button onClick={() => setCollapsed(false)} className="p-2 rounded hover:bg-gray-800 text-gray-500">
          <ChevronRight size={15} />
        </button>
      </div>
    )
  }

  const compColor = selectedComponent
    ? (CATEGORY_COLORS[selectedComponent.category] || CATEGORY_COLORS.OTHER)
    : CATEGORY_COLORS.OTHER

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Documentos</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-gray-800 text-gray-600">
          <ChevronRight size={13} className="rotate-180" />
        </button>
      </div>

      <AnimatePresence>
        {selectedComponent && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="border-b border-gray-800 overflow-hidden">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Componente</span>
                <button onClick={onClearComponent} className="text-gray-600 hover:text-white"><X size={12} /></button>
              </div>
              <div className="rounded-lg p-3 border" style={{ background: `${compColor}15`, borderColor: `${compColor}40` }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: `${compColor}25`, color: compColor }}>
                    {selectedComponent.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white font-mono">{selectedComponent.name}</p>
                    <span className="text-xs px-1.5 rounded font-medium"
                      style={{ background: `${compColor}25`, color: compColor }}>
                      {selectedComponent.category}
                    </span>
                  </div>
                </div>
                {selectedComponent.description && (
                  <p className="text-xs text-gray-400 leading-relaxed">{selectedComponent.description}</p>
                )}
                {selectedComponent.voltages && selectedComponent.voltages.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-600 uppercase tracking-wider">Tensões</p>
                    {selectedComponent.voltages.map((v, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-500">{v.node}</span>
                        <span className="text-cyan-400 font-mono font-bold">{v.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedComponent.commonFaults && selectedComponent.commonFaults.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Defeitos comuns</p>
                    {selectedComponent.commonFaults.map((f, i) => (
                      <p key={i} className="text-xs text-red-400/80">• {f}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 py-3 border-b border-gray-800">
        <input type="file" accept=".pdf" multiple onChange={handleUpload} className="hidden" id="pdf-upload-pro" />
        <label htmlFor="pdf-upload-pro"
          className={`flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-dashed cursor-pointer transition-all text-xs font-medium ${
            uploading ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10'
            : 'border-gray-700 text-gray-500 hover:border-yellow-500/50 hover:text-yellow-400 hover:bg-yellow-500/5'}`}>
          {uploading ? <><Loader2 size={13} className="animate-spin" />Enviando... {progress}%</>
            : <><Upload size={13} />Adicionar PDF</>}
        </label>
        {uploading && (
          <div className="mt-2 bg-gray-800 rounded-full h-1 overflow-hidden">
            <motion.div className="h-full bg-yellow-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="animate-spin text-gray-700" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileText size={28} className="text-gray-800 mx-auto mb-3" />
            <p className="text-xs text-gray-600">Nenhum PDF. Faça upload dos esquemas.</p>
          </div>
        ) : (
          Object.entries(groups).map(([type, groupFiles]) => {
            if (!groupFiles.length) return null
            return (
              <div key={type} className="mb-3">
                <div className="flex items-center gap-2 px-4 py-1.5">
                  {TYPE_ICONS[type]}
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{TYPE_LABELS[type]}</span>
                </div>
                {groupFiles.map((file) => (
                  <motion.div key={file.id} whileHover={{ x: 2 }} onClick={() => onSelect(file)}
                    className={`group flex items-center gap-2 mx-2 px-3 py-2 rounded-xl cursor-pointer transition-all mb-0.5 ${
                      selectedFile?.id === file.id ? 'bg-yellow-500/12 border border-yellow-500/30' : 'hover:bg-gray-800/60'}`}>
                    {selectedFile?.id === file.id && <div className="w-1 h-4 rounded-full bg-yellow-400 shrink-0" />}
                    <span className={`text-xs flex-1 truncate font-mono ${selectedFile?.id === file.id ? 'text-yellow-300' : 'text-gray-500'}`}>
                      {file.name}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(file) }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 text-gray-600 transition-all">
                      <Trash2 size={11} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )
          })
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs text-gray-700">Supabase Storage</span>
        </div>
      </div>
    </div>
  )
}
