import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getDatabase } from 'firebase-admin/database';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

let isFirebaseConfigured = false;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
    const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DB_URL || 'https://taskflow-c01c8-default-rtdb.firebaseio.com'
      });
    }
    isFirebaseConfigured = true;
    console.log('Firebase Admin initialized successfully.');
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DB_URL || 'https://taskflow-c01c8-default-rtdb.firebaseio.com'
      });
    }
    isFirebaseConfigured = true;
    console.log('Firebase Admin initialized successfully.');
  } else {
    console.warn('Firebase Admin NOT initialized. Please set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in your .env file.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
}

// ── Realtime Database helpers ─────────────────────────────────────────────────

export const getDb = () => {
  if (!isFirebaseConfigured) return null;
  return getDatabase();
};

/**
 * Create a notification in Firebase Realtime Database.
 * Returns the generated key.
 */
export async function createNotification(data) {
  const db = getDb();
  if (!db) return null;
  try {
    const ref = db.ref('notifications').push();
    await ref.set({
      ...data,
      isRead: false,
      createdAt: new Date().toISOString()
    });
    return ref.key;
  } catch (err) {
    console.error('Firebase DB Error in createNotification:', err.message);
    return null;
  }
}

/**
 * Get a single notification by key.
 */
export async function getNotification(key) {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await db.ref(`notifications/${key}`).get();
    if (!snap.exists()) return null;
    return { id: key, ...snap.val() };
  } catch (err) {
    console.error('Firebase DB Error in getNotification:', err.message);
    return null;
  }
}

/**
 * Update fields of a notification.
 */
export async function updateNotification(key, fields) {
  const db = getDb();
  if (!db) return;
  try {
    await db.ref(`notifications/${key}`).update(fields);
  } catch (err) {
    console.error('Firebase DB Error in updateNotification:', err.message);
  }
}

/**
 * Delete a notification by key.
 */
export async function deleteNotification(key) {
  const db = getDb();
  if (!db) return;
  try {
    await db.ref(`notifications/${key}`).remove();
  } catch (err) {
    console.error('Firebase DB Error in deleteNotification:', err.message);
  }
}

/**
 * Get all unread notifications for a given recipient userId.
 * - Admin sees: REOPEN_REQUEST (forAdmin=true), DEADLINE_ALERT, COMMENT
 * - User sees: their own notifications (APPROVE, IGNORE, COMMENT, DEADLINE_ALERT)
 *   but NOT REOPEN_REQUEST (those are admin-only)
 */
export async function getNotificationsForUser(userId, isAdmin) {
  const db = getDb();
  if (!db) return [];

  try {
    const snap = await db.ref('notifications').orderByChild('isRead').equalTo(false).get();
    if (!snap.exists()) return [];

    const results = [];
    snap.forEach(child => {
      const n = child.val();
      const id = child.key;
      const uidStr = String(userId);
      if (isAdmin) {
        // Admin sees REOPEN_REQUEST (forAdmin=true) + DEADLINE_ALERT + COMMENT addressed to admin
        if ((n.forAdmin === true && n.type !== 'APPROVE' && n.type !== 'IGNORE') || n.recipient === uidStr) {
          results.push({ id, ...n });
        }
      } else {
        // User sees their own notifications (recipient matches) except REOPEN_REQUEST
        if (n.recipient === uidStr && n.type !== 'REOPEN_REQUEST') {
          results.push({ id, ...n });
        }
      }
    });

    // Sort newest first
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results;
  } catch (err) {
    console.error('Firebase DB Error in getNotificationsForUser:', err.message);
    return [];
  }
}

// ── FCM Push Notification ─────────────────────────────────────────────────────

export const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!isFirebaseConfigured || !fcmToken) return;

  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  const message = {
    notification: { title, body },
    data: stringData,
    token: fcmToken,
  };

  try {
    const messaging = getMessaging();
    const response = await messaging.send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.error('Error sending message:', error);
  }
};
