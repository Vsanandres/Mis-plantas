// sw.js — Service Worker para notificaciones de riego
var CACHE = 'plantas-v3';

// ── INSTALL & CACHE ───────────────────────────────────
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  // Clean old caches
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    }).then(function(){ return self.clients.claim(); })
  );
});

// ── FETCH (offline support) ───────────────────────────
self.addEventListener('fetch', function(e){
  e.respondWith(
    caches.match(e.request).then(function(r){
      return r || fetch(e.request).then(function(resp){
        var clone=resp.clone();
        caches.open(CACHE).then(function(c){c.put(e.request,clone);});
        return resp;
      });
    }).catch(function(){ return caches.match('./index.html'); })
  );
});

// ── SCHEDULE STORAGE ──────────────────────────────────
// We store next-water timestamps so they survive SW sleep
var DB_KEY = 'plant_schedule';

function getSchedule(){
  return new Promise(function(res){
    try{
      var d = self.__schedule || null;
      res(d ? JSON.parse(d) : []);
    }catch(e){ res([]); }
  });
}
function setSchedule(arr){
  self.__schedule = JSON.stringify(arr);
}

// ── RECEIVE SCHEDULE FROM APP ─────────────────────────
self.addEventListener('message', function(e){
  if(!e.data) return;

  if(e.data.type === 'SCHEDULE'){
    // Save schedule: [{id, name, nextWaterAt (timestamp ms)}]
    setSchedule(e.data.schedule);
    // Check immediately in case something is already due
    checkAndNotify();
  }

  if(e.data.type === 'PING'){
    // App is open, check for due plants
    checkAndNotify();
  }
});

// ── PERIODIC CHECK ────────────────────────────────────
// Use a stored interval approach: check every time SW activates
self.addEventListener('periodicsync', function(e){
  if(e.tag === 'water-check'){
    e.waitUntil(checkAndNotify());
  }
});

// Also check on SW activate (covers most Android wake-ups)
self.addEventListener('activate', function(e){
  e.waitUntil(checkAndNotify());
});

function checkAndNotify(){
  return getSchedule().then(function(schedule){
    if(!schedule || !schedule.length) return;
    var now = Date.now();
    var promises = [];
    schedule.forEach(function(item){
      // Notify if due time has passed and not already notified today
      if(item.nextWaterAt && now >= item.nextWaterAt){
        var lastNotified = item.lastNotified || 0;
        var hoursSince = (now - lastNotified) / 3600000;
        // Only re-notify every 12h max to avoid spam
        if(hoursSince > 12){
          item.lastNotified = now;
          promises.push(
            self.registration.showNotification(item.name + ' necesita agua', {
              body: 'Lleva ' + item.daysSince + ' dias sin regar. Abre la app para marcarla.',
              icon: './icon-192.png',
              badge: './icon-192.png',
              tag: 'planta-' + item.id,
              renotify: true,
              vibrate: [200, 100, 200],
              data: { plantId: item.id },
              actions: [
                { action: 'open', title: 'Ver planta' },
                { action: 'dismiss', title: 'Ignorar' }
              ]
            })
          );
        }
      }
    });
    setSchedule(schedule); // save updated lastNotified
    return Promise.all(promises);
  });
}

// ── NOTIFICATION CLICK ────────────────────────────────
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  if(e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cs){
      for(var i=0;i<cs.length;i++){
        if('focus' in cs[i]) return cs[i].focus();
      }
      return clients.openWindow('./');
    })
  );
});
