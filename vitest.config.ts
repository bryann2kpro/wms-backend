import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/features/**/*.test.ts'],
    environment: 'node',
    globals: true,
    env: loadEnv(mode, process.cwd(), ''),
  },
}))