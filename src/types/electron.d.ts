export interface ElectronAPI {
  ping: () => Promise<{ status: string; message?: string }>
  selectPdf: () => Promise<string | null>
  extractPDF: (params: {
    pdfPath: string
    deviceId: string
    pageIndex?: number
  }) => Promise<{
    status: string
    source?: string
    data?: unknown
    message?: string
  }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
