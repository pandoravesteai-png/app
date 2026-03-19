importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC_sua_api_key",
  authDomain: "pandora-ai-7c070.firebaseapp.com",
  projectId: "pandora-ai-7c070",
  storageBucket: "pandora-ai-7c070.appspot.com",
  messagingSenderId: "1014929216057",
  appId: "1:1014929216057:web:00ffdc506d81313ea2b3e8"
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
