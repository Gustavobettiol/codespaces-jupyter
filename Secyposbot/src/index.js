import cron from "node-cron";
import { config } from "./config.js";
import { db, migrate } from "./db.js";
import { createBot } from "./bot.js";
import { sweep } from "./sweep.js";

migrate();
const bot = createBot();

await bot.api.deleteWebhook({ drop_pending_updates: false });

try {
  await bot.api.setMyCommands([
    { command: "start", description: "Iniciar y consultar mi acceso" },
    { command: "planes", description: "Ver los planes disponibles" },
    { command: "pagar", description: "Elegir un plan y enviar comprobante" },
    { command: "estado", description: "Consultar estado y vencimiento" },
    { command: "acceso", description: "Obtener enlace si tengo acceso activo" },
  ]);
} catch (error) {
  console.error("No se pudieron actualizar los comandos del bot:", error.message);
}

try {
  await bot.api.setChatMenuButton({
    menu_button: {
      type: "web_app",
      text: "Abrir app",
      web_app: { url: config.studioUrl },
    },
  });
} catch (error) {
  console.error("No se pudo actualizar el botón Abrir app; revisá STUDIO_URL:", error.message);
}

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

console.log("Bot iniciado con long polling; los updates pendientes se conservaron.");
await bot.start({
  allowed_updates: ["message", "channel_post", "callback_query", "chat_join_request"],
});