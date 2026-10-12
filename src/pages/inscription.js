import '../style.css'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db, ensureClientUser, getStoredCardId, storeCardId } from '../lib/client.js'
import { isStandalone, registerServiceWorker } from '../lib/pwa.js'
import { generateRecoveryCode } from '../lib/recovery-code.js'

const MAX_ATTEMPTS = 3
const SLOW_NETWORK_MS = 10_000

const form = document.getElementById('signupForm')
const firstNameInput = document.getElementById('firstName')
const errorEl = document.getElementById('signupError')
const submitBtn = document.getElementById('signupBtn')
const installedHint = document.getElementById('installedHint')

registerServiceWorker()

// Une carte existe déjà sur ce téléphone : pas de doublon, on l'affiche.
if (getStoredCardId()) {
  location.replace('./carte.html')
} else if (isStandalone()) {
  // Sur iPhone, l'app de l'écran d'accueil ne partage pas le stockage de Safari :
  // la carte créée dans Safari se relie ici avec le code de secours.
  installedHint.classList.remove('hidden')
}

// Crée la carte, son code de secours et sa copie privée dans le même batch (exigé par les règles).
// Un code déjà pris fait échouer le batch en permission-denied : on retente avec un nouveau code.
async function createCard(uid, firstName) {
  let lastError
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cardRef = doc(collection(db, 'cards'))
    const code = generateRecoveryCode()
    const batch = writeBatch(db)
    batch.set(cardRef, {
      ownerUid: uid,
      firstName,
      stamps: 0,
      lastStamp: null,
      createdAt: serverTimestamp(),
    })
    batch.set(doc(cardRef, 'private', 'recovery'), { code })
    batch.set(doc(db, 'recovery', code), { cardId: cardRef.id })
    try {
      await batch.commit()
      return cardRef.id
    } catch (error) {
      if (error.code !== 'permission-denied') throw error
      lastError = error
    }
  }
  throw lastError
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const firstName = firstNameInput.value.trim()
  if (!firstName || firstName.length > 40) {
    errorEl.textContent = 'Indique ton prénom (40 caractères maximum).'
    return
  }

  errorEl.textContent = ''
  submitBtn.disabled = true
  // Hors ligne, l'envoi reste en attente au lieu d'échouer : on prévient au lieu de laisser un bouton figé.
  const slowTimer = setTimeout(() => {
    errorEl.textContent = 'Connexion lente… ne recharge pas la page.'
  }, SLOW_NETWORK_MS)

  let cardId
  try {
    const user = await ensureClientUser()
    cardId = await createCard(user.uid, firstName)
  } catch {
    errorEl.textContent = 'Impossible de créer la carte pour le moment. Réessaie dans un instant.'
    submitBtn.disabled = false
    return
  } finally {
    clearTimeout(slowTimer)
  }

  try {
    storeCardId(cardId)
  } catch {
    // La carte existe déjà : ne pas proposer d'en recréer une (elle resterait orpheline).
    errorEl.textContent =
      "Ta carte est créée mais ce navigateur bloque l'enregistrement (navigation privée ?). Ouvre le site dans un navigateur classique."
    return
  }
  location.assign('./carte.html')
})
