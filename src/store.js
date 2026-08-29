import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR || "./data";
const filePath = path.join(dataDir, "roles.json");

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  ensureDir();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export function getRoleId(guildId, userId) {
  return readAll()[guildId]?.[userId] ?? null;
}

export function setRoleId(guildId, userId, roleId) {
  const data = readAll();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = roleId;
  writeAll(data);
}

export function deleteRoleId(guildId, userId) {
  const data = readAll();
  if (!data[guildId]?.[userId]) return;
  delete data[guildId][userId];
  if (Object.keys(data[guildId]).length === 0) delete data[guildId];
  writeAll(data);
}

export function findOwner(guildId, roleId) {
  const guild = readAll()[guildId];
  if (!guild) return null;
  return Object.keys(guild).find((userId) => guild[userId] === roleId) ?? null;
}
