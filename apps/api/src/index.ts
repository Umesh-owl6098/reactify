import { validateEnv } from "./env.js";
import { buildServer } from "./server.js";

async function main() {
  const env = validateEnv();
  const app = await buildServer(env);

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
