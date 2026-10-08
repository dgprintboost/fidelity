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

export default defineConfig({
  // Chemin du dépôt GitHub Pages : https://<user>.github.io/fidelity/ a changer en fonction du nom du repo donc du nom de la boite
  base: '/fidelity/',
  plugins: [cspMeta],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(pages).map(([name, file]) => [name, resolve(import.meta.dirname, file)]),
      ),
    },
  },
})
