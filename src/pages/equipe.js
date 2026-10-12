import '../style.css'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import QrScanner from 'qr-scanner'
import { auth, db } from '../lib/firebase.js'

const STAMPS_FOR_REWARD = 10
const COOLDOWN_MS = 60 * 60 * 1000
const SLOW_NETWORK_MS = 10_000
// Identifiant Firestore généré automatiquement : 20 caractères alphanumériques.
const CARD_ID_PATTERN = /^[A-Za-z0-9]{20}$/

const loginForm = document.getElementById('loginForm')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const loginError = document.getElementById('loginError')
const loginBtn = document.getElementById('loginBtn')
const staffPanel = document.getElementById('staffPanel')
const video = document.getElementById('scanVideo')
const scanBtn = document.getElementById('scanBtn')
const scanResult = document.getElementById('scanResult')
const clientName = document.getElementById('clientName')
const clientStamps = document.getElementById('clientStamps')
const stampBtn = document.getElementById('stampBtn')
const rewardBtn = document.getElementById('rewardBtn')
const staffMessage = document.getElementById('staffMessage')
const logoutBtn = document.getElementById('logoutBtn')

let scanner = null
let current = null // { id, data } de la carte scannée

function setVisible(element, visible) {
  element.classList.toggle('hidden', !visible)
  element.classList.toggle('flex', visible)
}

function say(text, isError = false) {
  staffMessage.textContent = text
  staffMessage.classList.toggle('text-crousty-pink', isError)
  staffMessage.classList.toggle('text-crousty-cyan', !isError)
}

// --- Connexion -------------------------------------------------------------

// Renvoie true / false, ou lève une erreur si la vérification est impossible (réseau, App Check).
async function isStaff(user) {
  if (!user || user.isAnonymous) return false
  return (await getDoc(doc(db, 'staff', user.uid))).exists()
}

function showStaffPanel(visible) {
  setVisible(loginForm, !visible)
  setVisible(staffPanel, visible)
  if (!visible) resetScan()
}

onAuthStateChanged(auth, async (user) => {
  let allowed
  try {
    allowed = await isStaff(user)
  } catch {
    // Erreur technique : ne pas déconnecter un équipier légitime.
    showStaffPanel(false)
    loginError.textContent = 'Vérification du compte impossible. Vérifie la connexion puis recharge la page.'
    return
  }
  if (user && !user.isAnonymous && !allowed) {
    // Le panneau reste masqué même si la déconnexion échoue : les règles refusent tout à ce compte.
    await signOut(auth).catch(() => {})
    loginError.textContent = "Ce compte n'a pas accès à l'espace équipe."
  }
  showStaffPanel(allowed)
})

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  loginError.textContent = ''
  loginBtn.disabled = true
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
    passwordInput.value = ''
  } catch {
    loginError.textContent = 'Email ou mot de passe incorrect.'
  } finally {
    loginBtn.disabled = false
  }
})

logoutBtn.addEventListener('click', () =>
  signOut(auth).catch(() => say('Déconnexion impossible. Vérifie la connexion puis réessaie.', true)),
)

// --- Scan ------------------------------------------------------------------

// Chaque chargement de carte reçoit un numéro : seul le plus récent a le droit de s'afficher.
// Sinon une lecture lente (scan précédent, rafraîchissement) pourrait réafficher une autre carte.
let loadSeq = 0

function resetScan() {
  scanner?.stop()
  loadSeq++
  current = null
  setVisible(scanResult, false)
}

scanBtn.addEventListener('click', async () => {
  resetScan()
  say('')
  try {
    scanner ??= new QrScanner(video, (result) => onScan(result.data), {
      returnDetailedScanResult: true,
      preferredCamera: 'environment',
    })
    await scanner.start()
  } catch {
    say("Caméra indisponible. Autorise l'accès à la caméra puis réessaie.", true)
  }
})

async function onScan(data) {
  scanner.stop()
  if (!CARD_ID_PATTERN.test(data)) {
    resetScan()
    say("Ce QR code n'est pas une carte de fidélité.", true)
    return
  }
  try {
    await loadCard(data)
  } catch {
    say('Impossible de lire cette carte. Réessaie.', true)
  }
}

// Affiche la carte ; renvoie true si c'est bien elle qui est affichée à la fin de la lecture.
async function loadCard(id) {
  const seq = ++loadSeq
  let snapshot
  try {
    snapshot = await getDoc(doc(db, 'cards', id))
  } catch (error) {
    // L'échec d'une lecture dépassée (autre carte scannée depuis) ne doit rien afficher.
    if (seq !== loadSeq) return false
    throw error
  }
  if (seq !== loadSeq) return false
  if (!snapshot.exists()) {
    current = null
    setVisible(scanResult, false)
    say('Carte introuvable.', true)
    return false
  }
  current = { id, data: snapshot.data() }
  renderCard()
  return true
}

function renderCard() {
  const { stamps, lastStamp, firstName } = current.data
  clientName.textContent = firstName
  clientStamps.textContent = String(stamps)
  setVisible(scanResult, true)

  const full = stamps >= STAMPS_FOR_REWARD
  // Indication seulement : le délai d'une heure est imposé par les règles Firestore.
  const tooSoon = lastStamp && Date.now() - lastStamp.toMillis() < COOLDOWN_MS
  stampBtn.classList.toggle('hidden', full)
  stampBtn.disabled = Boolean(tooSoon)
  rewardBtn.classList.toggle('hidden', !full)
  rewardBtn.disabled = false

  if (full) say('Carte pleine : remets le cadeau puis valide.')
  else if (tooSoon) say('Déjà tamponnée il y a moins d’une heure.', true)
}

// --- Tampon et cadeau ------------------------------------------------------

// Modifie la carte et journalise l'événement dans le même batch (exigé par les règles).
async function commitCardChange(cardId, type, changes) {
  const cardRef = doc(db, 'cards', cardId)
  const eventRef = doc(collection(cardRef, 'history'))
  const batch = writeBatch(db)
  batch.set(eventRef, { type, at: serverTimestamp(), staffUid: auth.currentUser.uid })
  batch.update(cardRef, { ...changes, lastEventId: eventRef.id })
  await batch.commit()
}

// La carte visée est figée avant le premier await, et le scan / la déconnexion restent bloqués
// jusqu'à la fin du rafraîchissement : le résultat ne peut pas être attribué à une autre carte.
async function runAction(button, buildChanges, type, successText) {
  if (!current) return
  const { id, data } = current
  for (const control of [button, scanBtn, logoutBtn]) control.disabled = true
  say('Envoi en cours…')
  // Hors ligne, l'envoi reste en attente au lieu d'échouer : prévenir plutôt que laisser l'écran figé.
  const slowTimer = setTimeout(() => say('Connexion lente… ne recharge pas la page.', true), SLOW_NETWORK_MS)

  let failure = null
  try {
    await commitCardChange(id, type, buildChanges(data))
  } catch (error) {
    failure = error
  }
  clearTimeout(slowTimer)

  const refreshed = await refresh(id)
  scanBtn.disabled = false
  logoutBtn.disabled = false
  if (!refreshed) {
    // Carte non rechargée : boutons dans un état inconnu, on repart d'un nouveau scan.
    resetScan()
  }

  if (!failure) {
    say(refreshed ? successText(current.data) : `${successText(null)} Rescanne la carte pour la revoir.`)
    return
  }
  const reason =
    failure.code === 'permission-denied'
      ? 'Action refusée : la carte a déjà été mise à jour. Vérifie le nombre de tampons.'
      : 'Erreur réseau : rien n’a été enregistré.'
  say(refreshed ? reason : `${reason} Rescanne la carte.`, true)
}

// Recharge la carte affichée ; renvoie false si la lecture échoue.
async function refresh(id) {
  if (current?.id !== id) return false
  try {
    return await loadCard(id)
  } catch {
    return false
  }
}

stampBtn.addEventListener('click', () =>
  runAction(
    stampBtn,
    (card) => ({ stamps: card.stamps + 1, lastStamp: serverTimestamp() }),
    'stamp',
    (card) => (card ? `Tampon ajouté ✔ (${card.stamps}/10)` : 'Tampon ajouté ✔'),
  ),
)

rewardBtn.addEventListener('click', () =>
  runAction(rewardBtn, () => ({ stamps: 0 }), 'reward', () => 'Cadeau remis 🎁 La carte repart à 0.'),
)
