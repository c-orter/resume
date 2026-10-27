import tailwindcss from '@tailwindcss/vite'
import icon from 'astro-icon'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://cartergrimmeisen.com',
  integrations: [icon()],
  vite: { plugins: [tailwindcss()] },
})
