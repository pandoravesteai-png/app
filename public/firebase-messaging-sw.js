importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCawb-KljzrsoDYkJRoA--JJo4TlSK9yc0",
  authDomain: "pandora-ai-7c070.firebaseapp.com",
  projectId: "pandora-ai-7c070",
  storageBucket: "pandora-ai-7c070.firebasestorage.app",
  messagingSenderId: "1014929216057",
  appId: "1:1014929216057:web:a31819774acda4dca2b3e8"
});

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
