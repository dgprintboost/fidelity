// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) : 31 caractères, identique à firestore.rules.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LENGTH = 10
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`)

// Tirage uniforme : les octets >= 248 (8 × 31) sont rejetés pour ne pas biaiser l'alphabet.
export function generateRecoveryCode() {
  let code = ''
  while (code.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH * 2))) {
      if (byte < ALPHABET.length * 8 && code.length < LENGTH) {
        code += ALPHABET[byte % ALPHABET.length]
      }
    }
  }
  return code
}

// Saisie libre (minuscules, tirets, espaces) → forme stockée, ou null si invalide.
export function normalizeRecoveryCode(input) {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return CODE_PATTERN.test(code) ? code : null
}

// K7P2QX9M4T → K7P2-QX9M-4T
export function formatRecoveryCode(code) {
  return [code.slice(0, 4), code.slice(4, 8), code.slice(8)].join('-')
}
