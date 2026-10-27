import tailwindcss from '@tailwindcss/vite'
import yaml from '@rollup/plugin-yaml'
import icon from 'astro-icon'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://cartergrimmeisen.com',
  integrations: [icon()],
  vite: { plugins: [tailwindcss(), yaml()] },
})
