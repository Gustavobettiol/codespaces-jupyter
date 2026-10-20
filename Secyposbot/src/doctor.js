import { Bot } from "grammy";
import { config } from "./config.js";

const bot = new Bot(config.botToken);
let failed = false;

try {
  const identity = await bot.api.getMe();
  console.log(`Token válido: @${identity.username}`);

  const channel = await bot.api.getChat(config.channelId);
  if (channel.type !== "channel") {
    throw new Error("CHANNEL_ID no corresponde a un canal de Telegram.");
  }
  console.log(`Canal encontrado: ${channel.title}`);

  const membership = await bot.api.getChatMember(config.channelId, identity.id);
  if (membership.status !== "administrator" && membership.status !== "creator") {
    throw new Error(`El bot no es administrador del canal (estado: ${membership.status}).`);
  }

  const canInvite = membership.status === "creator" || membership.can_invite_users === true;
  const canRestrict = membership.status === "creator" || membership.can_restrict_members === true;
  console.log(`Permiso para invitar usuarios: ${canInvite ? "OK" : "FALTA"}`);
  console.log(`Permiso para restringir miembros: ${canRestrict ? "OK" : "FALTA"}`);

  if (!canInvite || !canRestrict) failed = true;
} catch (error) {
  failed = true;
  console.error(`No se pudo validar Telegram: ${error.description ?? error.message}`);
}

if (failed) {
  console.error("Revisa BOT_TOKEN, CHANNEL_ID y los permisos del bot en el canal.");
  process.exitCode = 1;
} else {
  console.log("Configuración lista. Ya puedes ejecutar npm run migrate y npm run dev.");
}