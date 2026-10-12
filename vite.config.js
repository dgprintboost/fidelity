import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Une page HTML par écran : GitHub Pages ne sait pas réécrire les URLs d'une SPA.
const pages = {
  inscription: 'index.html',
  carte: 'carte.html',
  recuperer: 'recuperer.html',
  equipe: 'equipe.html',
}

// GitHub Pages ne permet pas de poser d'en-têtes HTTP : la CSP passe par une balise <meta>.
// Elle n'est injectée qu'au build, car le serveur de dev de Vite a besoin de WebSocket et de scripts inline.
const csp = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/",
  'frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// Placée juste après <meta charset> : avant tout script ou style qu'elle doit couvrir.
const charsetMeta = '<meta charset="UTF-8">'
const cspMeta = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml(html, { filename }) {
    if (!html.includes(charsetMeta)) {
      throw new Error(`${filename} : ${charsetMeta} manquant, impossible de placer la CSP`)
    }
    return html.replace(charsetMeta, `${charsetMeta}\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`)
  },
}

// Le cache du service worker porte un identifiant propre à chaque build (empreinte des fichiers produits) :
// à la mise en ligne suivante, sw.js change, se réinstalle et purge les anciens fichiers en cache.
const BUILD_ID_PLACEHOLDER = '__BUILD_ID__'
function swBuildId() {
  let outDir
  let buildId
  return {
    name: 'sw-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    generateBundle(_, bundle) {
      buildId = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 12)
    },
    closeBundle() {
      const swPath = resolve(outDir, 'sw.js')
      const source = readFileSync(swPath, 'utf8')
      if (source.split(BUILD_ID_PLACEHOLDER).length !== 2) {
        throw new Error(`sw.js : ${BUILD_ID_PLACEHOLDER} doit apparaître exactement une fois`)
      }
      writeFileSync(swPath, source.replace(BUILD_ID_PLACEHOLDER, buildId))
    },
  }
}

// Configuration Firebase obligatoire (.env.local) : vérifiée ici, dans le terminal, plutôt que
// dans le navigateur. `npm run dev`, `npm run build` et `npm run preview` échouent tant qu'une variable manque.
const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_RECAPTCHA_SITE_KEY',
]
const requireFirebaseEnv = {
  name: 'require-firebase-env',
  configResolved(config) {
    const missing = REQUIRED_ENV.filter((key) => !config.env[key])
    if (missing.length) {
      throw new Error(`Configuration Firebase incomplète dans .env.local : ${missing.join(', ')}`)
    }
  },
}

export default defineConfig({
  // Chemin du dépôt GitHub Pages : https://<user>.github.io/fidelity/ a changer en fonction du nom du repo donc du nom de la boite
  base: '/fidelity/',
  plugins: [requireFirebaseEnv, cspMeta, swBuildId()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(pages).map(([name, file]) => [name, resolve(import.meta.dirname, file)]),
      ),
    },
  },
})
