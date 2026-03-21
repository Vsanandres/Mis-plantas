// sw.js — Service Worker para notificaciones de riego
var CACHE = 'plantas-v1';
var scheduleTimers = [];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(['./', './index.html']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e){
  e.respondWith(
    caches.match(e.request).then(function(r){
      return r || fetch(e.request).then(function(resp){
        var clone = resp.clone();
        caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
        return resp;
      });
    }).catch(function(){
      return caches.match('./index.html');
    })
  );
});

// Receive plant schedule from the main app
self.addEventListener('message', function(e){
  if(!e.data || e.data.type !== 'SCHEDULE') return;
  scheduleTimers.forEach(function(t){ clearTimeout(t); });
  scheduleTimers = [];

  e.data.schedule.forEach(function(item){
    var delay = Math.max(0, item.delayMs);
    var t = setTimeout(function(){
      self.registration.showNotification(item.name + ' necesita agua', {
        body: 'Toca para abrir la app y marcarla como regada.',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'planta-' + item.id,
        renotify: true,
        actions: [{ action: 'open', title: 'Abrir app' }]
      });
    }, delay);
    scheduleTimers.push(t);
  });
});

// On notification tap — open or focus the app
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs){
      for(var i = 0; i < cs.length; i++){
        if('focus' in cs[i]) return cs[i].focus();
      }
      return clients.openWindow('./');
    })
  );
});
