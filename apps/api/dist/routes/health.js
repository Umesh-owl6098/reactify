import { APP_VERSION } from "@reactify/shared";
export async function registerHealthRoutes(app) {
    app.get("/health", async () => {
        return {
            status: "ok",
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
        };
    });
}
//# sourceMappingURL=health.js.map