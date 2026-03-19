importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: self.FIREBASE_API_KEY || 
    "VITE_FIREBASE_API_KEY_PLACEHOLDER",
  authDomain: "pandora-ai-7c070.firebaseapp.com",
  projectId: "pandora-ai-7c070",
  storageBucket: "pandora-ai-7c070.firebasestorage.app",
  messagingSenderId: "1014929216057",
  appId: "1:1014929216057:web:00ffdc506d81313ea2b3e8"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: 'https://i.postimg.cc/G2DYHjrv/P-(1).png',
    badge: 'https://i.postimg.cc/G2DYHjrv/P-(1).png',
    vibrate: [200, 100, 200]
  });
});
