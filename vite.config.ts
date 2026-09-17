import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { aiDetectPlugin } from './vite.ai-plugin.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), aiDetectPlugin(env)],
  }
})
