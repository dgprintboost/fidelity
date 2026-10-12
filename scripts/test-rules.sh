#!/bin/sh
# Lance les tests des règles Firestore contre l'émulateur local (projet fictif demo-fidelity).
# Utilise les outils installés dans le projet (npx --no-install) : fonctionne via npm run test:rules
# comme en lancement direct.
# firebase-tools exige Java 21 ou plus, alors que le JAVA_HOME global de la machine peut rester
# sur une version plus ancienne : on choisit une JVM >= 21 pour cette commande seulement.
set -e

JAVA_HOME=$(/usr/libexec/java_home -v 21+ 2>/dev/null || true)
# java_home renvoie la JVM par défaut s'il ne trouve rien : on vérifie la version réellement obtenue.
MAJOR=$("$JAVA_HOME/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)
if [ -z "$MAJOR" ] || [ "$MAJOR" -lt 21 ]; then
  echo "Java 21 ou plus est requis pour l'émulateur Firebase (trouvé : ${MAJOR:-aucun})." >&2
  echo "Installe-le (ex. brew install --cask temurin) puis relance npm run test:rules." >&2
  exit 1
fi
export JAVA_HOME

exec npx --no-install firebase emulators:exec --only firestore --project demo-fidelity 'npx --no-install vitest run'
