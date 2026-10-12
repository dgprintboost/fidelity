import { signInAnonymously, signOut } from 'firebase/auth'
import { initFirebase } from './firebase.js'

// Instance Firebase des pages client (instance par défaut), distincte de celle de l'espace équipe.
export const { auth, db } = initFirebase()

// Le téléphone ne garde que l'identifiant de sa carte, jamais les tampons : la carte vit dans Firestore.
// Clé propre au projet Firebase : plusieurs enseignes publiées sur le même <compte>.github.io partagent
// le stockage du navigateur, et l'une ne doit jamais lire ni effacer la carte d'une autre.
const CARD_KEY = `fidelity:${import.meta.env.VITE_FIREBASE_PROJECT_ID}:cardId`

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

// Identité invisible du client : réutilise la session anonyme existante, sinon en ouvre une.
export async function ensureClientUser() {
  await auth.authStateReady()
  const user = auth.currentUser
  if (user?.isAnonymous) return user
  // Sur cette instance, une session non anonyme n'est jamais légitime (l'équipe a sa propre instance) :
  // c'est une session équipe héritée d'avant la séparation. Elle ne doit pas devenir propriétaire d'une carte.
  if (user) await signOut(auth)
  return (await signInAnonymously(auth)).user
}
