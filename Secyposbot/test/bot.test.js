import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDirectory = mkdtempSync(join(tmpdir(), "secyposbot-bot-test-"));
process.env.BOT_TOKEN = "123456:testing-token";
process.env.CHANNEL_ID = "-1001234567890";
process.env.ADMIN_IDS = "123456789";
process.env.DB_PATH = join(testDirectory, "test.sqlite");

const { db, migrate } = await import("../src/db.js");
migrate();
const { createBot } = await import("../src/bot.js");
const bot = createBot();
bot.botInfo = {
  id: 987654321,
  is_bot: true,
  first_name: "Test bot",
  username: "test_bot",
};

const apiCalls = [];
let nextMessageId = 1;
bot.api.config.use(async (_previous, method, payload) => {
  apiCalls.push({ method, payload });
  const result = method === "copyMessage"
    ? { message_id: nextMessageId++ }
    : {
      message_id: nextMessageId++,
      date: 1,
      chat: { id: payload.chat_id, type: "private" },
      text: payload.text,
    };
  return { ok: true, result };
});

beforeEach(() => {
  apiCalls.length = 0;
  db.exec("DELETE FROM threads; DELETE FROM payments; DELETE FROM subscribers; UPDATE counters SET value = 0 WHERE name = 'alias';");
});

after(() => {
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

const user = { id: 42, is_bot: false, first_name: "Usuario", username: "usuario" };

test("/start responds with the active confirmation", async () => {
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: user.id, type: "private" },
      from: user,
      text: "/start",
      entities: [{ offset: 0, length: 6, type: "bot_command" }],
    },
  });

  assert.match(apiCalls[0].payload.text, /^OK \/ Bot Activo/);
});

test("group text is processed and receives the active confirmation", async () => {
  const groupId = -1009876543210;
  await bot.handleUpdate({
    update_id: 2,
    message: {
      message_id: 2,
      date: 1,
      chat: { id: groupId, type: "supergroup", title: "Grupo" },
      from: user,
      text: "Hola",
    },
  });

  assert.ok(apiCalls.some(({ method, payload }) =>
    method === "copyMessage" && payload.chat_id === 123456789 && payload.from_chat_id === groupId));
  assert.ok(apiCalls.some(({ method, payload }) =>
    method === "sendMessage" && payload.chat_id === groupId && payload.text === "OK / Bot Activo"));
});

test("channel posts receive the active confirmation", async () => {
  const channelId = -1009876543210;
  await bot.handleUpdate({
    update_id: 3,
    channel_post: {
      message_id: 3,
      date: 1,
      chat: { id: channelId, type: "channel", title: "Canal" },
      sender_chat: { id: channelId, type: "channel", title: "Canal" },
      text: "Publicación",
    },
  });

  assert.ok(apiCalls.some(({ method, payload }) =>
    method === "sendMessage" && payload.chat_id === channelId && payload.text === "OK / Bot Activo"));
});

test("channel posts containing a command do not require a user sender", async () => {
  const channelId = -1009876543210;
  await bot.handleUpdate({
    update_id: 4,
    channel_post: {
      message_id: 4,
      date: 1,
      chat: { id: channelId, type: "channel", title: "Canal" },
      sender_chat: { id: channelId, type: "channel", title: "Canal" },
      text: "/start",
      entities: [{ offset: 0, length: 6, type: "bot_command" }],
    },
  });

  assert.ok(apiCalls.some(({ method, payload }) =>
    method === "sendMessage" && payload.chat_id === channelId && payload.text === "OK / Bot Activo"));
});
