import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Tech Board Pro — BoardView Profissional',
  description:
    'Plataforma GSM profissional para técnicos em manutenção de celulares. BoardView interativo, schematics, OCR, diagnóstico IA e test points.',
  keywords: ['boardview', 'gsm', 'schematic', 'reparo celular', 'tech board pro'],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#060c18] text-white">
        {children}
      </body>
    </html>
  )
}
