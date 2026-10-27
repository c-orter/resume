import tailwindcss from '@tailwindcss/vite'
import icon from 'astro-icon'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://carter.grimmeisen.xyz',
  integrations: [icon()],
  vite: { plugins: [tailwindcss()] },
})
