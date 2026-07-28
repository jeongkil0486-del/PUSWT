self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data?.json() || {};
    } catch {
        payload = { body: event.data?.text() || "" };
    }

    const title = typeof payload.title === "string" && payload.title
        ? payload.title
        : "TAS WT 알림";
    const url = typeof payload.url === "string" && payload.url.startsWith("/")
        ? payload.url
        : "/?notification=main";
    const options = {
        body: typeof payload.body === "string" ? payload.body : "",
        icon: "/assets/icon-192.png",
        badge: "/assets/icon-192.png",
        tag: typeof payload.tag === "string" ? payload.tag : undefined,
        data: {
            route: typeof payload.route === "string" ? payload.route : "main",
            url,
            type: typeof payload.type === "string" ? payload.type : "general",
            branchCode: typeof payload.branchCode === "string" ? payload.branchCode : ""
        },
        timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now()
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const requestedUrl = event.notification.data?.url || "/?notification=main";
    const targetUrl = new URL(requestedUrl, self.location.origin).href;

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
        if (existing) {
            existing.postMessage({
                type: "TASWT_NOTIFICATION_CLICK",
                route: event.notification.data?.route || "main",
                url: requestedUrl
            });
            await existing.focus();
            return existing.navigate(targetUrl);
        }
        return self.clients.openWindow(targetUrl);
    })());
});
