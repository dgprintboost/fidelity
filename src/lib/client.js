import { signInAnonymously } from 'firebase/auth'
import { auth } from './firebase.js'

// Le téléphone ne garde que l'identifiant de sa carte, jamais les tampons : la carte vit dans Firestore.
const CARD_KEY = 'fidelity:cardId'

export const STAFF_SESSION_MESSAGE =
  "Un compte équipe est connecté sur ce navigateur. Déconnecte-toi de l'espace équipe ou utilise un autre navigateur pour ta carte client."

export function getStoredCardId() {
  try {
    return localStorage.getItem(CARD_KEY)
  } catch {
    return null
  }
}

// Lève une erreur si le stockage du navigateur est indisponible : à traiter par l'appelant.
export function storeCardId(cardId) {
  localStorage.setItem(CARD_KEY, cardId)
}

export function clearStoredCardId() {
  try {
    localStorage.removeItem(CARD_KEY)
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

export class StaffSessionError extends Error {
  constructor() {
    super(STAFF_SESSION_MESSAGE)
    this.name = 'StaffSessionError'
  }
}

// Identité invisible du client : réutilise la session anonyme existante, sinon en ouvre une.
// Une session équipe (email) n'est jamais utilisée pour une carte client.
export async function ensureClientUser() {
  await auth.authStateReady()
  const user = auth.currentUser
  if (user && !user.isAnonymous) throw new StaffSessionError()
  return user ?? (await signInAnonymously(auth)).user
}
