import { defineConfig } from 'vitest/config'

// Configuration propre aux tests : elle n'hérite pas de vite.config.js (qui exige la configuration
// Firebase du site et injecte la CSP), inutile pour tester les règles contre l'émulateur.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // Un seul émulateur partagé : les fichiers de test ne doivent pas tourner en parallèle.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
