// 오프라인용 간단한 서비스 워커: 네트워크 우선, 실패하면 캐시
const CACHE = 'mc-pet-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // 페이지(HTML)는 브라우저 HTTP 캐시(GitHub Pages 는 10분)를 건너뛰고 항상 서버에 새 버전을 확인한다.
  // 그래야 업데이트 직후 앱을 다시 열면 바로 새 화면이 나온다. (나머지 파일은 이름에 해시가 붙어 있어 그대로 둔다)
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  e.respondWith(
    fresh
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
  );
});
