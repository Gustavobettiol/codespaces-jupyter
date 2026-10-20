import { config } from "./config.js";
import {
  listExpiredSubscribers,
  listSubscribersNeedingWarning,
  markExpired,
  markWarned,
} from "./store.js";

export async function sweep(bot, now = Date.now()) {
  const result = { expired: 0, warned: 0, failed: 0 };

  for (const subscriber of listExpiredSubscribers(now)) {
    try {
      await bot.api.banChatMember({
        chat_id: config.channelId,
        user_id: subscriber.telegram_id,
      });
      await bot.api.unbanChatMember({
        chat_id: config.channelId,
        user_id: subscriber.telegram_id,
      });
      if (markExpired(subscriber.telegram_id, now)) result.expired += 1;
      await bot.api.sendMessage(
        subscriber.telegram_id,
        `Tu acceso venció. Para renovar, usá /pagar. Tu alias sigue siendo ${subscriber.alias}.`,
      ).catch(() => {});
    } catch (error) {
      result.failed += 1;
      console.error(`No se pudo retirar el acceso a ${subscriber.telegram_id}:`, error.message);
    }
  }

  for (const subscriber of listSubscribersNeedingWarning(now)) {
    try {
      await bot.api.sendMessage(
        subscriber.telegram_id,
        "Te quedan 3 días de acceso. Para renovar, usá /pagar.",
      );
      if (markWarned(subscriber.telegram_id, now)) result.warned += 1;
    } catch (error) {
      result.failed += 1;
      console.error(`No se pudo enviar el recordatorio a ${subscriber.telegram_id}:`, error.message);
    }
  }

  return result;
}