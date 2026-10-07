// Trust Corp Bank — Service Worker
// Provides offline shell + API caching strategy

const CACHE_NAME = "trustcorp-v2";

const SHELL_ASSETS = [

  "/",

  "/index.html",

];

self.addEventListener("install", (event) => {

  event.waitUntil(

    caches.open(CACHE_NAME).then((cache) => {

      return cache.addAll(SHELL_ASSETS);

    })

  );

  self.skipWaiting();

});

self.addEventListener("activate", (event) => {

  event.waitUntil(

    caches.keys().then((keys) =>

      Promise.all(

        keys

          .filter((key) => key !== CACHE_NAME)

          .map((key) => caches.delete(key))

      )

    )

  );

  self.clients.claim();

});

self.addEventListener("fetch", (event) => {

  const request = event.request;

  const url = new URL(request.url);

  if (

    request.method !== "GET" ||

    url.origin !== self.location.origin

  ) {

    return;

  }

  if (url.pathname.startsWith("/api/")) {

    event.respondWith(fetch(request));

    return;

  }

  if (request.mode === "navigate") {

    event.respondWith(

      fetch(request, { cache: "no-store" })

        .then((response) => {

          if (response.ok) {

            const copy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {

              cache.put("/index.html", copy);

            });

          }

          return response;

        })

        .catch(() => caches.match("/index.html"))

    );

    return;

  }

  event.respondWith(

    caches.match(request).then((cached) => {

      if (cached) {

        return cached;

      }

      return fetch(request).then((response) => {

        if (response.ok) {

          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {

            cache.put(request, copy);

          });

        }

        return response;

      });

    })

  );

});
