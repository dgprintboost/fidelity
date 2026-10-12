import { initializeApp, setLogLevel } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Cette configuration est publique par nature (elle part dans le navigateur).
// La sécurité repose sur firestore.rules, App Check et la restriction de la clé d'API au domaine github.io.
const env = import.meta.env

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

// La présence de ces variables est vérifiée par vite.config.js (dev, build et preview échouent sinon) :
// aucune vérification ici, pour ne rien afficher dans la console du navigateur.

// Aucun message Firebase dans la console du navigateur : les erreurs sont présentées dans la page.
setLogLevel('silent')

// En dev uniquement, App Check utilise un jeton de debug fixe lu dans .env.development.local
// (fichier jamais chargé au build, donc jamais publié). Le SDK l'affiche dans la console en dev :
// accepté, la règle « rien dans la console » ne vise que le site publié.
// Sans jeton, App Check passe par reCAPTCHA (localhost déclaré dans la clé).
// import.meta.env.DEV écrit en toutes lettres : Vite remplace la condition par false au build et
// supprime le bloc, ce qui garantit que le jeton ne peut pas finir dans le site publié.
if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
}

// Deux instances Firebase indépendantes, chacune avec sa propre session :
//  - l'instance par défaut pour les pages client (identité anonyme invisible, propriétaire de la carte) ;
//  - l'instance « staff » pour l'espace équipe (connexion email).
// Dans un même navigateur, se connecter à l'espace équipe ne remplace donc jamais l'identité anonyme
// du client : sinon elle serait perdue définitivement, et la carte avec.
export const STAFF_APP_NAME = 'staff'

export function initFirebase(appName) {
  const app = initializeApp(firebaseConfig, appName)

  // App Check doit être initialisé avant toute requête vers Firestore ou Auth.
  // reCAPTCHA Enterprise (Google Cloud Fraud Defense, offre gratuite de 10 000 vérifications/mois) :
  // la version classique est obsolète. Durée de vie du jeton réglée à 1 jour dans la console App Check.
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })

  // initializeAuth plutôt que getAuth : pas de popup ni de redirection dans ce projet, donc pas de
  // popupRedirectResolver, qui chargerait apis.google.com et une iframe bloqués par la CSP sur mobile.
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  })
  return { auth, db: getFirestore(app) }
}
