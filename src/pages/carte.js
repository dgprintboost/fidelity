import '../style.css'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import QRCode from 'qrcode'
import { db, clearStoredCardId, ensureClientUser, getStoredCardId } from '../lib/client.js'
import { isIos, isStandalone, registerServiceWorker } from '../lib/pwa.js'
import { formatRecoveryCode } from '../lib/recovery-code.js'

const greetingEl = document.getElementById('greeting')
const stampCountEl = document.getElementById('stampCount')
const stampEls = [...document.querySelectorAll('#stamps .stamp')]
const rewardBanner = document.getElementById('rewardBanner')
const qrCanvas = document.getElementById('cardQr')
const recoveryCodeEl = document.getElementById('recoveryCode')
const errorEl = document.getElementById('cardError')
const lostCardActions = document.getElementById('lostCardActions')
const newCardBtn = document.getElementById('newCardBtn')
const installCard = document.getElementById('installCard')
const installIos = document.getElementById('installIos')
const installBtn = document.getElementById('installBtn')

registerServiceWorker()
setupInstallInvite()

const cardId = getStoredCardId()
if (!cardId) {
  location.replace('./index.html')
} else {
  showCard(cardId)
}

function render(card) {
  greetingEl.textContent = `Carte de ${card.firstName}`
  stampCountEl.textContent = String(card.stamps)
  stampEls.forEach((el, index) => el.classList.toggle('stamp-on', index < card.stamps))
  rewardBanner.classList.toggle('hidden', card.stamps < 10)
}

function showError(text, offerRecovery = false) {
  errorEl.textContent = text
  lostCardActions.classList.toggle('hidden', !offerRecovery)
  lostCardActions.classList.toggle('flex', offerRecovery)
}

// Sortie de secours quand la carte n'est plus accessible et que le code est perdu :
// sans ça, index.html renverrait sans fin vers cette carte illisible.
newCardBtn.addEventListener('click', () => {
  if (!confirm('Créer une nouvelle carte ? Tu ne pourras plus retrouver l’ancienne sans son code de secours.')) return
  clearStoredCardId()
  location.assign('./index.html')
})

async function showCard(id) {
  try {
    await ensureClientUser()
    // Le QR ne contient que l'identifiant de la carte : c'est l'équipe qui tamponne.
    await QRCode.toCanvas(qrCanvas, id, { width: 200, margin: 1 })
  } catch {
    showError('Impossible de charger ta carte. Vérifie ta connexion puis recharge la page.')
    return
  }

  onSnapshot(
    doc(db, 'cards', id),
    (snapshot) => {
      // Cas défensif : pour un client, une carte supprimée arrive en pratique comme un refus d'accès
      // (la règle get lit resource.data), donc par la branche d'erreur ci-dessous.
      if (!snapshot.exists()) {
        // Hors ligne, Firestore renvoie d'abord son cache : « absente du cache » ne veut pas dire supprimée.
        // Aucune action destructive proposée tant que le serveur n'a pas répondu.
        if (snapshot.metadata.fromCache) {
          showError('Connexion impossible pour le moment. Ta carte s’affichera dès que le réseau revient.')
          return
        }
        showError("Cette carte n'existe plus. Utilise ton code de secours ou crée une nouvelle carte.", true)
        return
      }
      showError('')
      render(snapshot.data())
    },
    (error) => {
      // permission-denied est ambigu (carte reprise ailleurs, mais aussi App Check ou session passagère) :
      // on garde l'identifiant de la carte, qui ne donne aucun droit, et on propose la récupération.
      showError(
        error.code === 'permission-denied'
          ? "Ta carte n'est pas accessible ici : elle a peut-être été reprise ailleurs (app installée ou autre téléphone). Recharge la page ; si ça persiste, utilise ton code de secours."
          : 'Connexion perdue. Recharge la page pour voir ta carte à jour.',
        error.code === 'permission-denied',
      )
    },
  )

  try {
    const recovery = await getDoc(doc(db, 'cards', id, 'private', 'recovery'))
    if (recovery.exists()) recoveryCodeEl.textContent = formatRecoveryCode(recovery.data().code)
  } catch {
    recoveryCodeEl.textContent = 'Indisponible pour le moment, recharge la page.'
  }
}

// Android : bouton d'installation natif. iPhone : instructions (Safari n'a pas de bouton programmable).
function setupInstallInvite() {
  if (isStandalone()) return
  if (isIos()) {
    installIos.classList.remove('hidden')
    installCard.classList.replace('hidden', 'flex')
    return
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installCard.classList.replace('hidden', 'flex')
    installBtn.classList.remove('hidden')
    installBtn.addEventListener(
      'click',
      async () => {
        // L'invite native ne sert qu'une fois : l'encart disparaît quel que soit le choix
        // (Chrome renverra beforeinstallprompt plus tard s'il juge l'installation de nouveau possible).
        installCard.classList.replace('flex', 'hidden')
        installBtn.classList.add('hidden')
        try {
          await event.prompt()
        } catch {
          // Invite refusée par le navigateur : rien à faire, l'encart reviendra au prochain événement.
        }
      },
      { once: true },
    )
  })
}
