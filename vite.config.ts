import { defineConfig } from 'vite'
import { alphaTab } from '@coderline/alphatab-vite'

export default defineConfig({
  plugins: [alphaTab()],
})
