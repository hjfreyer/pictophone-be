import admin from 'firebase-admin';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

export const db = admin.firestore();
export const braids = db.collection('braids');
export const root = braids.doc('root');
// (global as any)['db'] = db;