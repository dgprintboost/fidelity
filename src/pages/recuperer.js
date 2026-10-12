import '../style.css'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db, ensureClientUser, getStoredCardId, storeCardId } from '../lib/client.js'
import { registerServiceWorker } from '../lib/pwa.js'
import { normalizeRecoveryCode } from '../lib/recovery-code.js'

const SLOW_NETWORK_MS = 10_000

const form = document.getElementById('recoverForm')
const codeInput = document.getElementById('recoveryInput')
const errorEl = document.getElementById('recoverError')
const submitBtn = document.getElementById('recoverBtn')

registerServiceWorker()

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const code = normalizeRecoveryCode(codeInput.value)
  if (!code) {
    errorEl.textContent = 'Le code fait 10 caractères, par exemple K7P2-QX9M-4T.'
    return
  }

  errorEl.textContent = ''
  submitBtn.disabled = true
  const slowTimer = setTimeout(() => {
    errorEl.textContent = 'Connexion lente… ne recharge pas la page.'
  }, SLOW_NETWORK_MS)

  try {
    const user = await ensureClientUser()
    const recovery = await getDoc(doc(db, 'recovery', code))
    if (!recovery.exists()) {
      errorEl.textContent = 'Code inconnu. Vérifie les caractères et réessaie.'
      submitBtn.disabled = false
      return
    }

    const { cardId } = recovery.data()
    const previous = getStoredCardId()
    if (
      previous &&
      previous !== cardId &&
      !confirm('Une autre carte est déjà enregistrée sur ce téléphone. La remplacer par celle de ce code ?')
    ) {
      submitBtn.disabled = false
      return
    }

    // Transfert de la carte à l'identité de ce téléphone (vérifié par les règles via le code).
    await updateDoc(doc(db, 'cards', cardId), { ownerUid: user.uid, recoveredWith: code })

    try {
      storeCardId(cardId)
    } catch {
      // Le transfert est fait : ne pas inviter à réessayer, le message serait faux.
      errorEl.textContent =
        "Ta carte est récupérée mais ce navigateur bloque l'enregistrement (navigation privée ?). Ouvre le site dans un navigateur classique et saisis à nouveau ton code."
      return
    }
    location.assign('./carte.html')
  } catch {
    errorEl.textContent = 'Impossible de retrouver la carte pour le moment. Réessaie dans un instant.'
    submitBtn.disabled = false
  } finally {
    clearTimeout(slowTimer)
  }
})
