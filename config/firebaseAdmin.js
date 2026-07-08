import admin from 'firebase-admin'
import fs from 'fs'

let initialized = false

// Le fichier de clé de compte de service se télécharge dans :
// Firebase Console → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée
// Mets-le dans backend/config/serviceAccountKey.json (et ajoute-le à .gitignore !)
const keyPath = new URL('./serviceAccountKey.json', import.meta.url)

try {
  if (fs.existsSync(keyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'))
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    initialized = true
    console.log('✅ Firebase Admin initialisé.')
  } else {
    console.warn('⚠️  serviceAccountKey.json introuvable — les push FCM seront désactivées.')
  }
} catch (err) {
  console.error('❌ Échec initialisation Firebase Admin:', err.message)
}

export async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!initialized || !fcmToken) return

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    })
  } catch (err) {
    console.warn('⚠️  Échec envoi push FCM:', err.message)
  }
}