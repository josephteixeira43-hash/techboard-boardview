'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDevices } from '@/lib/queries'

export default function Home() {
  const router = useRouter()
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDevices().then(data => {
      setDevices(data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-[#060c18] text-white font-mono">
      <div className="border-b border-cyan-500/20 p-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-xl">⚡</div>
        <div>
          <h1 className="text-xl font-bold">TECH<span className="text-cyan-400">BOARD</span> PRO</h1>
          <p className="text-xs text-white/30">BoardView Profissional</p>
        </div>
      </div>
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-2">Selecione um <span className="text-cyan-400">Dispositivo</span></h2>
        <p className="text-white/40 text-sm mb-8">Escolha o modelo para abrir o BoardView interativo</p>
        {loading ? (
          <div className="flex items-center gap-3 text-white/40">
            <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"/>
            Carregando dispositivos...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map(device => (
              <div key={device.id} onClick={() => router.push(`/boardview?id=${device.id}`)}
                className="bg-white/2 border border-white/10 rounded-2xl p-6 cursor-pointer hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-lg">📱</div>
                  <div>
                    <div className="font-bold text-sm">{device.brand} {device.model}</div>
                    <div className="text-xs text-white/40">{device.model_code}</div>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-white/40">
                  <div>CPU: {device.chipset}</div>
                  <div>RAM: {device.ram}</div>
                  <div>Bateria: {device.battery}</div>
                </div>
                <div className="mt-4 w-full py-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-xs text-center group-hover:bg-cyan-500/15 transition-all">
                  Abrir BoardView →
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
