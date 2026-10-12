// Tests des règles Firestore contre l'émulateur (npm run test:rules).
// Chaque tentative de fraude doit être refusée, chaque action normale du site acceptée.
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const CARD = 'cardAliceXXXXXXXXXXX'
const OTHER_CARD = 'cardCarolXXXXXXXXXXX'
const CODE = 'ABCDEFGHJK'
const OTHER_CODE = 'MNPQRSTUVW'
const HOUR = 60 * 60 * 1000

let env

// Identités : clients anonymes (comme le site) et compte équipe connecté par email.
const anon = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore()
const staff = () => env.authenticatedContext('staff1', { firebase: { sign_in_provider: 'password' } }).firestore()
const alice = () => anon('alice')
const bob = () => anon('bob')

// Données de départ écrites sans les règles.
async function seed({ stamps = 0, lastStamp = null, extraHistory = false } = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'staff/staff1'), { name: 'Gérant' })
    // Un compte anonyme avec un document staff ne doit jamais être considéré comme équipe.
    await setDoc(doc(db, 'staff/fakeStaff'), { name: 'Imposteur' })
    for (const [id, owner, code] of [
      [CARD, 'alice', CODE],
      [OTHER_CARD, 'carol', OTHER_CODE],
    ]) {
      await setDoc(doc(db, 'cards', id), {
        ownerUid: owner,
        firstName: owner,
        stamps,
        lastStamp: lastStamp === null ? null : Timestamp.fromMillis(lastStamp),
        createdAt: Timestamp.now(),
      })
      await setDoc(doc(db, 'cards', id, 'private', 'recovery'), { code })
      await setDoc(doc(db, 'recovery', code), { cardId: id })
    }
    if (extraHistory) {
      await setDoc(doc(db, 'cards', CARD, 'history', 'oldEvent'), {
        type: extraHistory === true ? 'stamp' : extraHistory,
        at: Timestamp.fromMillis(Date.now() - 3 * HOUR),
        staffUid: 'staff1',
      })
    }
  })
}

// Tamponnage / cadeau tel que le fait l'espace équipe : carte + événement d'historique dans le même batch.
function cardChange(db, { type = 'stamp', changes, staffUid = 'staff1', cardId = CARD, eventId, eventExtra = {} } = {}) {
  const cardRef = doc(db, 'cards', cardId)
  const eventRef = eventId ? doc(cardRef, 'history', eventId) : doc(collection(cardRef, 'history'))
  const batch = writeBatch(db)
  batch.set(eventRef, { type, at: serverTimestamp(), staffUid, ...eventExtra })
  batch.update(cardRef, { ...changes, lastEventId: eventRef.id })
  return batch.commit()
}

// Inscription telle que la fait le site : carte + copie privée du code + recovery/{code}.
function signup(
  db,
  {
    uid = 'dave',
    cardId = 'cardDaveXXXXXXXXXXXX',
    code = 'XYZ2345678',
    card = {},
    omit = [],
    skip = [],
    privateExtra = {},
    recoveryExtra = {},
    extraPrivateDoc = false,
  } = {},
) {
  const cardRef = doc(db, 'cards', cardId)
  const cardData = { ownerUid: uid, firstName: 'Dave', stamps: 0, lastStamp: null, createdAt: serverTimestamp(), ...card }
  for (const key of omit) delete cardData[key]
  const batch = writeBatch(db)
  batch.set(cardRef, cardData)
  if (!skip.includes('private')) batch.set(doc(cardRef, 'private', 'recovery'), { code, ...privateExtra })
  if (!skip.includes('recovery')) batch.set(doc(db, 'recovery', code), { cardId, ...recoveryExtra })
  if (extraPrivateDoc) batch.set(doc(cardRef, 'private', 'other'), { code })
  return batch.commit()
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fidelity',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
})

afterAll(async () => {
  await env?.cleanup()
})

describe('Inscription (création de carte)', () => {
  beforeEach(() => seed())

  it('accepte une carte neuve créée avec son code de secours', async () => {
    await assertSucceeds(signup(anon('dave')))
  })

  it('refuse une carte qui commence avec des tampons', async () => {
    await assertFails(signup(anon('dave'), { card: { stamps: 1 } }))
  })

  it('refuse une carte créée au nom de quelqu’un d’autre', async () => {
    await assertFails(signup(anon('dave'), { uid: 'alice' }))
  })

  it('refuse une carte sans copie privée du code de secours', async () => {
    await assertFails(signup(anon('dave'), { skip: ['private'] }))
  })

  it('refuse une carte sans document recovery', async () => {
    await assertFails(signup(anon('dave'), { skip: ['recovery'] }))
  })

  it('refuse de réutiliser un code de secours déjà pris', async () => {
    await assertFails(signup(anon('dave'), { code: CODE }))
  })

  it('refuse un code de secours au mauvais format', async () => {
    await assertFails(signup(anon('dave'), { code: 'abc0001111' }))
  })

  it('refuse un champ inconnu sur la carte', async () => {
    await assertFails(signup(anon('dave'), { card: { admin: true } }))
  })

  it('refuse une création sans être connecté', async () => {
    await assertFails(signup(env.unauthenticatedContext().firestore()))
  })

  it('refuse un prénom vide', async () => {
    await assertFails(signup(anon('dave'), { card: { firstName: '' } }))
  })

  it('accepte un prénom de 40 caractères et refuse 41', async () => {
    await assertSucceeds(signup(anon('dave'), { card: { firstName: 'x'.repeat(40) } }))
    await assertFails(
      signup(anon('erin'), { uid: 'erin', cardId: 'cardErinXXXXXXXXXXXX', code: 'ERN2345678', card: { firstName: 'x'.repeat(41) } }),
    )
  })

  it('refuse un prénom qui n’est pas du texte', async () => {
    await assertFails(signup(anon('dave'), { card: { firstName: 42 } }))
    await assertFails(signup(anon('dave'), { card: { firstName: ['Dave'] } }))
  })

  it('refuse une carte sans prénom', async () => {
    await assertFails(signup(anon('dave'), { omit: ['firstName'] }))
  })

  it('refuse une carte avec une date de dernier tampon déjà remplie', async () => {
    await assertFails(signup(anon('dave'), { card: { lastStamp: Timestamp.now() } }))
  })

  it('refuse une date de création choisie par le client', async () => {
    await assertFails(signup(anon('dave'), { card: { createdAt: Timestamp.fromMillis(0) } }))
  })
})

describe('Codes de secours et documents privés', () => {
  beforeEach(() => seed())

  it('refuse de créer un code de secours pour la carte d’un autre', async () => {
    await assertFails(setDoc(doc(bob(), 'recovery', 'NEWCADE234'), { cardId: CARD }))
  })

  it('refuse un document recovery avec un champ en plus', async () => {
    await assertFails(signup(anon('dave'), { recoveryExtra: { note: 'x' } }))
  })

  it('refuse un code privé avec un champ en plus', async () => {
    await assertFails(signup(anon('dave'), { privateExtra: { note: 'x' } }))
  })

  it('refuse un document privé autre que le code de secours', async () => {
    await assertFails(signup(anon('dave'), { extraPrivateDoc: true }))
  })

  it('personne ne supprime un code de secours ni un code privé', async () => {
    await assertFails(deleteDoc(doc(alice(), 'recovery', CODE)))
    await assertFails(deleteDoc(doc(alice(), 'cards', CARD, 'private', 'recovery')))
  })

  it('refuse un code de secours au mauvais format, même pour sa propre carte', async () => {
    await assertFails(setDoc(doc(alice(), 'recovery', 'abc'), { cardId: CARD }))
  })

  it('refuse de remplacer le code privé d’une carte existante', async () => {
    await assertFails(setDoc(doc(alice(), 'cards', CARD, 'private', 'recovery'), { code: CODE }))
  })
})

describe('Comptes équipe (staff)', () => {
  beforeEach(() => seed())

  it('personne ne se crée un document staff depuis le site', async () => {
    await assertFails(setDoc(doc(alice(), 'staff/alice'), { name: 'Alice' }))
    const eve = env.authenticatedContext('eve', { firebase: { sign_in_provider: 'password' } }).firestore()
    await assertFails(setDoc(doc(eve, 'staff/eve'), { name: 'Eve' }))
  })

  it('un équipier ne modifie pas son document staff', async () => {
    await assertFails(setDoc(doc(staff(), 'staff/staff1'), { name: 'Patron' }))
  })

  it('un équipier ne lit pas le document staff d’un autre', async () => {
    await assertFails(getDoc(doc(staff(), 'staff/fakeStaff')))
  })
})

describe('Lecture et cloisonnement', () => {
  beforeEach(() => seed())

  it('le client lit sa propre carte', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'cards', CARD)))
  })

  it('un client ne lit pas la carte d’un autre', async () => {
    await assertFails(getDoc(doc(bob(), 'cards', CARD)))
  })

  it('un client ne peut pas lister les cartes', async () => {
    await assertFails(getDocs(collection(alice(), 'cards')))
  })

  it('l’équipe lit et liste les cartes', async () => {
    await assertSucceeds(getDoc(doc(staff(), 'cards', CARD)))
    await assertSucceeds(getDocs(collection(staff(), 'cards')))
  })

  it('le client lit son code de secours', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'cards', CARD, 'private', 'recovery')))
  })

  it('ni l’équipe ni un autre client ne lisent un code de secours', async () => {
    await assertFails(getDoc(doc(staff(), 'cards', CARD, 'private', 'recovery')))
    await assertFails(getDoc(doc(bob(), 'cards', CARD, 'private', 'recovery')))
  })

  it('personne ne modifie ni ne supprime un événement d’historique', async () => {
    await env.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), 'cards', CARD, 'history', 'ev'), {
        type: 'stamp',
        at: Timestamp.now(),
        staffUid: 'staff1',
      }),
    )
    await assertFails(updateDoc(doc(staff(), 'cards', CARD, 'history', 'ev'), { type: 'reward' }))
    await assertFails(deleteDoc(doc(staff(), 'cards', CARD, 'history', 'ev')))
  })

  it('un client ne crée pas d’événement d’historique, même référencé par sa carte', async () => {
    await env.withSecurityRulesDisabled((context) =>
      updateDoc(doc(context.firestore(), 'cards', CARD), { lastEventId: 'ghost' }),
    )
    await assertFails(
      setDoc(doc(alice(), 'cards', CARD, 'history', 'ghost'), { type: 'stamp', at: serverTimestamp(), staffUid: 'alice' }),
    )
  })

  it('personne ne lit l’historique depuis le site', async () => {
    await assertFails(getDocs(collection(alice(), 'cards', CARD, 'history')))
    await assertFails(getDocs(collection(staff(), 'cards', CARD, 'history')))
  })

  it('un visiteur non connecté ne lit pas un code de secours', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'recovery', CODE)))
  })

  it('un code de secours se lit par sa valeur exacte, jamais en liste', async () => {
    await assertSucceeds(getDoc(doc(bob(), 'recovery', CODE)))
    await assertFails(getDocs(collection(bob(), 'recovery')))
  })

  it('seul le compte équipe lit son propre document staff', async () => {
    await assertSucceeds(getDoc(doc(staff(), 'staff/staff1')))
    await assertFails(getDoc(doc(alice(), 'staff/staff1')))
  })

  it('personne ne supprime une carte', async () => {
    await assertFails(deleteDoc(doc(alice(), 'cards', CARD)))
    await assertFails(deleteDoc(doc(staff(), 'cards', CARD)))
  })
})

describe('Tampons', () => {
  const stamp = (db, changes = {}, options = {}) =>
    cardChange(db, { changes: { stamps: 4, lastStamp: serverTimestamp(), ...changes }, ...options })

  it('l’équipe ajoute un tampon journalisé (carte jamais tamponnée)', async () => {
    await seed({ stamps: 3 })
    await assertSucceeds(stamp(staff()))
  })

  it('l’équipe ajoute un tampon plus d’une heure après le précédent', async () => {
    await seed({ stamps: 3, lastStamp: Date.now() - 2 * HOUR })
    await assertSucceeds(stamp(staff()))
  })

  it('refuse un deuxième tampon moins d’une heure après le précédent', async () => {
    await seed({ stamps: 3, lastStamp: Date.now() - 10 * 60 * 1000 })
    await assertFails(stamp(staff()))
  })

  it('refuse +2 tampons d’un coup', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(staff(), { stamps: 5 }))
  })

  it('refuse un tampon sans événement d’historique', async () => {
    await seed({ stamps: 3 })
    await assertFails(updateDoc(doc(staff(), 'cards', CARD), { stamps: 4, lastStamp: serverTimestamp() }))
  })

  it('refuse de réutiliser un ancien événement d’historique', async () => {
    await seed({ stamps: 3, extraHistory: true })
    await assertFails(
      updateDoc(doc(staff(), 'cards', CARD), { stamps: 4, lastStamp: serverTimestamp(), lastEventId: 'oldEvent' }),
    )
  })

  it('refuse un tampon au-delà de 10', async () => {
    await seed({ stamps: 10 })
    await assertFails(stamp(staff(), { stamps: 11 }))
  })

  it('refuse un événement attribué à un autre équipier', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(staff(), {}, { staffUid: 'someoneElse' }))
  })

  it('refuse un tampon dont la date n’est pas l’heure du serveur', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(staff(), { lastStamp: Timestamp.fromMillis(Date.now() - 2 * HOUR) }))
  })

  it('refuse un tampon qui ne met pas à jour la date du dernier tampon', async () => {
    await seed({ stamps: 3 })
    await assertFails(cardChange(staff(), { changes: { stamps: 4 } }))
  })

  it('refuse qu’un tampon change le propriétaire de la carte', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(staff(), { ownerUid: 'staff1' }))
  })

  it('refuse un tampon journalisé comme cadeau', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(staff(), {}, { type: 'reward' }))
  })

  it('refuse un événement d’historique avec un champ en plus', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(staff(), {}, { eventExtra: { note: 'x' } }))
  })

  it('refuse un événement d’historique isolé, sans modification de la carte', async () => {
    await seed({ stamps: 3 })
    await assertFails(
      setDoc(doc(staff(), 'cards', CARD, 'history', 'lonely'), { type: 'stamp', at: serverTimestamp(), staffUid: 'staff1' }),
    )
  })

  // Les refus côté client tiennent aussi au fait que seul un compte équipe peut créer un événement
  // d'historique (exigé à chaque modification) : impossible d'isoler la seule condition isStaff() de la carte.
  it('un client ne peut pas se tamponner lui-même', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(alice(), {}, { staffUid: 'alice' }))
  })

  it('un compte anonyme avec un document staff n’est pas l’équipe', async () => {
    await seed({ stamps: 3 })
    await assertFails(stamp(anon('fakeStaff'), {}, { staffUid: 'fakeStaff' }))
  })
})

describe('Cadeau', () => {
  const reward = (db) => cardChange(db, { type: 'reward', changes: { stamps: 0 } })

  it('l’équipe remet le cadeau sur une carte pleine', async () => {
    await seed({ stamps: 10 })
    await assertSucceeds(reward(staff()))
  })

  it('refuse le cadeau sur une carte qui n’est pas pleine', async () => {
    await seed({ stamps: 9 })
    await assertFails(reward(staff()))
  })

  it('refuse de réutiliser un ancien événement de cadeau', async () => {
    await seed({ stamps: 10, extraHistory: 'reward' })
    await assertFails(updateDoc(doc(staff(), 'cards', CARD), { stamps: 0, lastEventId: 'oldEvent' }))
  })

  it('refuse un cadeau qui ne remet pas la carte à zéro', async () => {
    await seed({ stamps: 10 })
    await assertFails(cardChange(staff(), { type: 'reward', changes: { stamps: 5 } }))
  })

  it('refuse qu’un cadeau efface la date du dernier tampon', async () => {
    await seed({ stamps: 10, lastStamp: Date.now() - 2 * HOUR })
    await assertFails(cardChange(staff(), { type: 'reward', changes: { stamps: 0, lastStamp: null } }))
  })

  it('refuse un cadeau journalisé comme tampon', async () => {
    await seed({ stamps: 10 })
    await assertFails(cardChange(staff(), { type: 'stamp', changes: { stamps: 0 } }))
  })

  it('un client ne peut pas remettre sa carte à zéro', async () => {
    await seed({ stamps: 10 })
    await assertFails(cardChange(alice(), { type: 'reward', changes: { stamps: 0 }, staffUid: 'alice' }))
  })
})

describe('Récupération par code de secours', () => {
  beforeEach(() => seed({ stamps: 6 }))

  const transfer = (db, uid, code, extra = {}) =>
    updateDoc(doc(db, 'cards', CARD), { ownerUid: uid, recoveredWith: code, ...extra })

  it('le nouveau téléphone reprend la carte avec le bon code, puis lit son code de secours', async () => {
    await assertSucceeds(transfer(bob(), 'bob', CODE))
    await assertSucceeds(getDoc(doc(bob(), 'cards', CARD)))
    await assertSucceeds(getDoc(doc(bob(), 'cards', CARD, 'private', 'recovery')))
  })

  it('l’ancien téléphone perd l’accès après le transfert', async () => {
    await assertSucceeds(transfer(bob(), 'bob', CODE))
    await assertFails(getDoc(doc(alice(), 'cards', CARD)))
  })

  it('refuse un transfert avec le code d’une autre carte', async () => {
    await assertFails(transfer(bob(), 'bob', OTHER_CODE))
  })

  it('refuse un transfert vers une identité qui n’est pas la sienne', async () => {
    await assertFails(transfer(bob(), 'mallory', CODE))
  })

  it('refuse de modifier les tampons pendant un transfert', async () => {
    await assertFails(transfer(bob(), 'bob', CODE, { stamps: 10 }))
  })

  it('refuse un transfert avec un code inexistant', async () => {
    await assertFails(transfer(bob(), 'bob', 'ZZZZZZZZZZ'))
  })

  it('refuse un transfert sans code de secours', async () => {
    await assertFails(updateDoc(doc(bob(), 'cards', CARD), { ownerUid: 'bob' }))
  })

  it('refuse un transfert sans être connecté', async () => {
    await assertFails(transfer(env.unauthenticatedContext().firestore(), 'bob', CODE))
  })
})
