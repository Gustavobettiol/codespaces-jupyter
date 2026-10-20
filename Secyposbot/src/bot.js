import { Bot, InlineKeyboard } from "grammy";
import { config, isAdmin, planByCode, plans } from "./config.js";
import { isSubscriptionActive } from "./domain.js";
import {
  approvePayment,
  createPayment,
  ensureSubscriber,
  getPayment,
  getSubscriber,
  hasActiveAccess,
  listActiveSubscribers,
  rejectPayment,
  setPendingPlan,
} from "./store.js";
import { sweep } from "./sweep.js";

const date = (timestamp) => new Date(timestamp).toLocaleDateString("es-AR", {
  timeZone: config.timezone,
});

const planKeyboard = () => {
  const keyboard = new InlineKeyboard();
  for (const plan of plans) {
    keyboard.text(`${plan.label} · USD ${plan.priceUsd}`, `plan:${plan.code}`).row();
  }
  return keyboard;
};

const paymentKeyboard = (paymentId) => new InlineKeyboard()
  .text("Aprobar pago", `payment:approve:${paymentId}`)
  .text("Rechazar", `payment:reject:${paymentId}`);

async function notifyAdmins(bot, payment, subscriber) {
  const plan = planByCode(payment.plan_code);
  const caption = [
    "Comprobante para revisar",
    `Alias: ${subscriber.alias}`,
    `Usuario: ${subscriber.username ? `@${subscriber.username}` : "sin usuario"}`,
    `ID: ${subscriber.telegram_id}`,
    `Plan: ${plan.label} · USD ${plan.priceUsd}`,
    `Pago #${payment.id}`,
  ].join("\n");

  for (const adminId of config.adminIds) {
    try {
      if (payment.proof_file_id) {
        await bot.api.sendPhoto(adminId, payment.proof_file_id, {
          caption,
          reply_markup: paymentKeyboard(payment.id),
        });
      } else {
        await bot.api.sendMessage(adminId, `${caption}\n\nComprobante:\n${payment.proof_text}`, {
          reply_markup: paymentKeyboard(payment.id),
        });
      }
    } catch (error) {
      console.error(`No se pudo notificar al admin ${adminId}:`, error.message);
    }
  }
}

export function createBot() {
  const bot = new Bot(config.botToken);

  bot.command("start", async (ctx) => {
    const subscriber = ensureSubscriber(ctx.from.id, ctx.from.username);
    const status = isSubscriptionActive(subscriber)
      ? `Tu acceso está activo hasta el ${date(subscriber.expires_at)}.`
      : "Todavía no tenés un acceso activo.";
    await ctx.reply(
      `Acceso privado a ${config.modelName}.\n\nTu alias: ${subscriber.alias}\n${status}\n\nUsá /planes para ver opciones y /pagar para enviar un comprobante.`,
    );
  });

  bot.command("planes", async (ctx) => {
    const description = plans
      .map((plan) => `${plan.label}: USD ${plan.priceUsd} por ${plan.days} días`)
      .join("\n");
    await ctx.reply(`${description}\n\nElegí un plan para ver las instrucciones de pago.`, {
      reply_markup: planKeyboard(),
    });
  });

  bot.command("pagar", async (ctx) => {
    ensureSubscriber(ctx.from.id, ctx.from.username);
    await ctx.reply("Elegí el plan que querés pagar:", { reply_markup: planKeyboard() });
  });

  bot.command("estado", async (ctx) => {
    const subscriber = getSubscriber(ctx.from.id);
    if (!subscriber) return ctx.reply("Todavía no tenés un registro. Usá /start.");
    const expiration = subscriber.expires_at ? date(subscriber.expires_at) : "sin fecha";
    return ctx.reply(`Alias: ${subscriber.alias}\nEstado: ${subscriber.status}\nVencimiento: ${expiration}`);
  });

  bot.command("acceso", async (ctx) => {
    if (!hasActiveAccess(ctx.from.id)) {
      return ctx.reply("No tenés una suscripción activa. Usá /pagar para renovarla o solicitar acceso.");
    }
    const link = await bot.api.createChatInviteLink({
      chat_id: config.channelId,
      name: `acceso-${ctx.from.id}`,
      creates_join_request: true,
    });
    return ctx.reply(`Tu enlace de acceso: ${link.invite_link}`);
  });

  bot.command("link", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("No autorizado.");
    const link = await bot.api.createChatInviteLink({
      chat_id: config.channelId,
      name: "solicitud-de-acceso",
      creates_join_request: true,
    });
    return ctx.reply(`Enlace con solicitud de ingreso:\n${link.invite_link}`);
  });

  bot.command("lista", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("No autorizado.");
    const subscribers = listActiveSubscribers();
    const lines = subscribers.map((subscriber) => `${subscriber.alias} · ${subscriber.telegram_id} · vence ${date(subscriber.expires_at)}`);
    return ctx.reply(`Activos: ${subscribers.length}\n\n${lines.join("\n") || "ninguno"}`);
  });

  bot.command("sweep", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply("No autorizado.");
    const result = await sweep(bot);
    return ctx.reply(`Barrido terminado. Vencidos: ${result.expired}; avisos: ${result.warned}; errores: ${result.failed}.`);
  });

  bot.callbackQuery(/^plan:(.+)$/, async (ctx) => {
    const plan = planByCode(ctx.match[1]);
    if (!plan) return ctx.answerCallbackQuery({ text: "Plan no válido." });

    ensureSubscriber(ctx.from.id, ctx.from.username);
    setPendingPlan(ctx.from.id, plan.code);
    await ctx.answerCallbackQuery();
    const paymentAlias = config.payAlias || "pendiente de configurar";
    return ctx.reply(
      `Plan ${plan.label} · USD ${plan.priceUsd} por ${plan.days} días.\n\nTransferí al alias: ${paymentAlias}\nDespués enviá el comprobante como texto o foto en este chat. Un administrador revisará el pago antes de activar el acceso.`,
    );
  });

  bot.callbackQuery(/^payment:(approve|reject):(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.answerCallbackQuery({ text: "No autorizado.", show_alert: true });
    }

    const action = ctx.match[1];
    const paymentId = Number(ctx.match[2]);
    if (!Number.isSafeInteger(paymentId)) {
      return ctx.answerCallbackQuery({ text: "Pago no válido.", show_alert: true });
    }

    if (action === "reject") {
      const subscriber = rejectPayment(paymentId, ctx.from.id);
      if (!subscriber) return ctx.answerCallbackQuery({ text: "El pago ya fue procesado." });
      await ctx.answerCallbackQuery({ text: "Pago rechazado." });
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
      return bot.api.sendMessage(
        subscriber.telegram_id,
        "El comprobante no pudo aprobarse. Revisá el pago y usá /pagar para enviar otro.",
      );
    }

    const payment = getPayment(paymentId);
    const plan = payment ? planByCode(payment.plan_code) : null;
    if (!plan) return ctx.answerCallbackQuery({ text: "Pago o plan no válido.", show_alert: true });

    const subscriber = approvePayment(paymentId, ctx.from.id, Date.now(), plan);
    if (!subscriber) return ctx.answerCallbackQuery({ text: "El pago ya fue procesado." });

    await ctx.answerCallbackQuery({ text: `Activado: ${subscriber.alias}` });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});

    let accessText = "Usá /acceso para recibir tu enlace de ingreso.";
    try {
      const link = await bot.api.createChatInviteLink({
        chat_id: config.channelId,
        name: `acceso-${subscriber.telegram_id}`,
        creates_join_request: true,
      });
      accessText = `Solicitá el ingreso desde este enlace: ${link.invite_link}`;
    } catch (error) {
      console.error("No se pudo crear el enlace individual:", error.message);
    }

    return bot.api.sendMessage(
      subscriber.telegram_id,
      `Pago aprobado.\n\nTu alias es ${subscriber.alias}. Vencimiento: ${date(subscriber.expires_at)}.\n${accessText}`,
    );
  });

  bot.on("chat_join_request", async (ctx) => {
    const request = ctx.chatJoinRequest;
    if (String(request.chat.id) !== config.channelId) return;

    const subscriber = ensureSubscriber(request.from.id, request.from.username);
    if (!hasActiveAccess(request.from.id)) {
      await bot.api.declineChatJoinRequest({ chat_id: config.channelId, user_id: request.from.id });
      await bot.api.sendMessage(request.from.id, "La solicitud fue rechazada porque no hay un acceso activo. Abrí el bot y usá /pagar.").catch(() => {});
      return;
    }

    await bot.api.approveChatJoinRequest({ chat_id: config.channelId, user_id: request.from.id });
    await bot.api.sendMessage(
      request.from.id,
      `Acceso confirmado.\nTu alias es ${subscriber.alias}. Vencimiento: ${date(subscriber.expires_at)}.`,
    ).catch(() => {});
  });

  bot.on(["message:text", "message:photo"], async (ctx) => {
    if (ctx.message.text?.startsWith("/")) return;
    if (isAdmin(ctx.from.id)) return;

    const subscriber = getSubscriber(ctx.from.id);
    if (!subscriber?.pending_plan_code) return;

    const photo = ctx.message.photo?.at(-1);
    const result = createPayment({
      telegramId: ctx.from.id,
      proofText: ctx.message.text?.slice(0, 2000) ?? ctx.message.caption?.slice(0, 2000) ?? null,
      proofFileId: photo?.file_id ?? null,
    });
    if (!result.created) {
      if (result.reason === "already-pending") {
        return ctx.reply("Ya hay un comprobante pendiente de revisión. Te avisaremos cuando se procese.");
      }
      return ctx.reply("Elegí primero un plan con /pagar.");
    }

    await notifyAdmins(bot, result.payment, result.subscriber);
    return ctx.reply("Comprobante recibido. El acceso se activa cuando un administrador confirme el pago.");
  });

  return bot;
}