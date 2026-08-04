import { defineConfig } from 'vitest/config'

// Unit tests run on the pure-logic modules in src/lib (pricing, schedule, format).
// Node environment is enough — no DOM, no Supabase.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
