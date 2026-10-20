import cron from "node-cron";
import { config } from "./config.js";
import { db, migrate } from "./db.js";
import { createBot } from "./bot.js";
import { sweep } from "./sweep.js";

migrate();
const bot = createBot();

bot.catch((error) => {
  console.error("Error procesando update:", error);
});

cron.schedule("0 * * * *", async () => {
  try {
    console.log("Barrido periódico:", await sweep(bot));
  } catch (error) {
    console.error("Falló el barrido periódico:", error);
  }
}, { timezone: config.timezone });

const shutdown = async (signal) => {
  console.log(`Recibida señal ${signal}; cerrando bot.`);
  bot.stop();
  db.close();
  process.exit(0);
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

console.log("Bot iniciado con long polling.");
await bot.start();