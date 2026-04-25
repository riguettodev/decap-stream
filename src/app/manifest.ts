import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Decap Stream',
    short_name: 'DecapStream',
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: '#040f14',
    background_color: '#040f14',
    display: 'standalone',
  }
}