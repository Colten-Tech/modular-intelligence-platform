import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans, Bebas_Neue } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'sonner'

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Modular Intelligence Platform',
  description: 'Your intelligence, automated.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} ${ibmPlexSans.variable} ${bebasNeue.variable}`}
    >
      <body className="bg-bg-base text-text-primary font-mono antialiased">
        <Providers>
          {children}
        </Providers>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              borderRadius: '2px',
            },
          }}
        />
      </body>
    </html>
  )
}
