import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";

describe("GET /health", () => {
  it("returns ok status with version and ISO timestamp", async () => {
    const app = await buildServer({ PORT: 3001, NODE_ENV: "test" });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      status: string;
      version: string;
      timestamp: string;
    };

    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    await app.close();
  });
});
