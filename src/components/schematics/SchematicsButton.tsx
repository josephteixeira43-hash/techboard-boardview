"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

interface Props {
  deviceId: string;
}

/**
 * Adicione este componente na página do BoardView do dispositivo.
 * Exemplo de uso no seu BoardView existente:
 *
 * import SchematicsButton from "@/components/schematics/SchematicsButton";
 * ...
 * <SchematicsButton deviceId={device.id} />
 */
export default function SchematicsButton({ deviceId }: Props) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/schematics/${deviceId}`)}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all group"
    >
      <FileText size={16} className="text-yellow-400 group-hover:scale-110 transition-transform" />
      <span className="text-sm font-medium text-yellow-300">
        Esquemas Elétricos
      </span>
      <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-mono">
        PDF
      </span>
    </button>
  );
}
