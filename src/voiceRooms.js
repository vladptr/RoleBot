import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

export const VOICE_KICK = "voice:kick";

const HUB_ID = process.env.VOICE_HUB_CHANNEL_ID || "1543696647953846345";
const NAME_RE = /^🎙️・Голосовая рума №(\d+)$/;

/** @type {Map<string, { channelId: string, guildId: string, ownerId: string, joinOrder: string[], number: number, panelId: string | null }>} */
const rooms = new Map();
const queues = new Map();

function roomName(number) {
  return `🎙️・Голосовая рума №${number}`;
}

function parseNumber(name) {
  const match = NAME_RE.exec(name);
  return match ? Number(match[1]) : null;
}

function enqueue(guildId, task) {
  const previous = queues.get(guildId) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(guildId, next.catch((error) => console.error("Voice room queue:", error)));
  return next;
}

function humansIn(channel) {
  return channel.members.filter((member) => !member.user.bot);
}

function roomByChannel(channelId) {
  return rooms.get(channelId) ?? null;
}

function roomsInGuild(guildId) {
  return [...rooms.values()].filter((room) => room.guildId === guildId);
}

function panelPayload(channel, room) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Управление комнатой №${room.number}`)
    .setDescription(`Владелец: <@${room.ownerId}>\nВыбери, кого выгнать из голосового канала.`);

  const kickable = humansIn(channel).filter((member) => member.id !== room.ownerId);
  const options =
    kickable.size === 0
      ? [
          new StringSelectMenuOptionBuilder()
            .setLabel("Некого выгнать")
            .setValue("none")
            .setDescription("В комнате никого кроме владельца"),
        ]
      : [...kickable.values()].slice(0, 25).map((member) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(member.displayName.slice(0, 100))
            .setValue(member.id)
            .setDescription(member.user.username.slice(0, 100)),
        );

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(VOICE_KICK)
      .setPlaceholder("Кого выгнать")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );

  return { embeds: [embed], components: [row] };
}

async function refreshPanel(channel, room) {
  const payload = panelPayload(channel, room);
  if (room.panelId) {
    const existing = await channel.messages.fetch(room.panelId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return;
    }
  }

  if (typeof channel.send !== "function") return;
  const sent = await channel.send(payload).catch((error) => {
    console.error("Failed to post voice panel:", error);
    return null;
  });
  if (sent) room.panelId = sent.id;
}

async function findExistingPanel(channel, clientId) {
  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!messages) return null;
  return (
    messages.find(
      (message) =>
        message.author.id === clientId &&
        message.components.some((row) => row.components.some((item) => item.customId === VOICE_KICK)),
    ) ?? null
  );
}

async function renumberGuild(guild) {
  const list = roomsInGuild(guild.id).sort((a, b) => a.number - b.number);
  for (let index = 0; index < list.length; index += 1) {
    const room = list[index];
    const nextNumber = index + 1;
    if (room.number === nextNumber) continue;

    const channel = guild.channels.cache.get(room.channelId) ?? (await guild.channels.fetch(room.channelId).catch(() => null));
    if (!channel) {
      rooms.delete(room.channelId);
      continue;
    }

    room.number = nextNumber;
    if (channel.name !== roomName(nextNumber)) {
      await channel.setName(roomName(nextNumber)).catch((error) => {
        console.error("Failed to renumber voice room:", error);
      });
    }
    await refreshPanel(channel, room);
  }
}

async function deleteRoom(guild, room) {
  rooms.delete(room.channelId);
  const channel = guild.channels.cache.get(room.channelId);
  if (channel) await channel.delete("Голосовая комната пуста").catch(() => null);
  await renumberGuild(guild);
}

function rememberJoin(room, userId) {
  if (!room.joinOrder.includes(userId)) room.joinOrder.push(userId);
}

function forgetMember(room, userId) {
  room.joinOrder = room.joinOrder.filter((id) => id !== userId);
}

async function createRoom(member, hub) {
  const guild = member.guild;
  const number = roomsInGuild(guild.id).length + 1;
  const channel = await guild.channels.create({
    name: roomName(number),
    type: ChannelType.GuildVoice,
    parent: hub.parentId ?? null,
    reason: `Голосовая комната для ${member.user.tag}`,
  });

  const room = {
    channelId: channel.id,
    guildId: guild.id,
    ownerId: member.id,
    joinOrder: [member.id],
    number,
    panelId: null,
  };
  rooms.set(channel.id, room);

  try {
    await member.voice.setChannel(channel);
  } catch (error) {
    rooms.delete(channel.id);
    await channel.delete("Не удалось переместить пользователя").catch(() => null);
    throw error;
  }

  await refreshPanel(channel, room);
}

async function handleJoinHub(member) {
  if (member.user.bot) return;
  try {
    const hub =
      member.guild.channels.cache.get(HUB_ID) ?? (await member.guild.channels.fetch(HUB_ID).catch(() => null));
    if (!hub || hub.type !== ChannelType.GuildVoice) return;
    await createRoom(member, hub);
  } catch (error) {
    console.error("Failed to create voice room:", error);
  }
}

async function handleJoinRoom(channel, member) {
  const room = roomByChannel(channel.id);
  if (!room || member.user.bot) return;
  rememberJoin(room, member.id);
  await refreshPanel(channel, room);
}

async function handleLeaveRoom(channel, member) {
  const room = roomByChannel(channel.id);
  if (!room || member.user.bot) return;

  const leftover = humansIn(channel).filter((person) => person.id !== member.id);
  forgetMember(room, member.id);

  if (leftover.size === 0) {
    await deleteRoom(channel.guild, room);
    return;
  }

  if (room.ownerId === member.id) {
    const nextOwner = room.joinOrder.find((id) => leftover.has(id)) ?? leftover.first()?.id;
    if (nextOwner) room.ownerId = nextOwner;
  }

  await refreshPanel(channel, room);
}

export async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const oldId = oldState.channelId;
  const newId = newState.channelId;
  if (oldId === newId) return;

  const guildId = member.guild.id;

  await enqueue(guildId, async () => {
    if (newId === HUB_ID) {
      await handleJoinHub(member);
    }

    if (newId && newId !== HUB_ID && rooms.has(newId)) {
      const channel = newState.channel ?? (await member.guild.channels.fetch(newId).catch(() => null));
      if (channel) await handleJoinRoom(channel, member);
    }

    if (oldId && oldId !== HUB_ID && rooms.has(oldId)) {
      const channel = oldState.channel ?? (await member.guild.channels.fetch(oldId).catch(() => null));
      if (channel) await handleLeaveRoom(channel, member);
    }
  });
}

export async function handleVoiceKick(interaction) {
  const channel = interaction.channel;
  const room = channel ? roomByChannel(channel.id) : null;
  if (!room) {
    await interaction.reply({
      content: "Эта панель больше не действует.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== room.ownerId) {
    await interaction.reply({
      content: "Выгонять может только владелец комнаты.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetId = interaction.values[0];
  if (targetId === "none") {
    await interaction.reply({
      content: "В комнате сейчас некого выгонять.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (targetId === room.ownerId) {
    await interaction.reply({
      content: "Себя выгнать нельзя.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target =
    interaction.members?.get(targetId) ??
    (await interaction.guild.members.fetch(targetId).catch(() => null));

  if (!target?.voice.channelId || target.voice.channelId !== room.channelId) {
    await interaction.reply({
      content: "Этот пользователь сейчас не в этой комнате.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  try {
    await target.voice.disconnect("Владелец комнаты выгнал из голосового канала");
  } catch (error) {
    console.error("Failed to kick from voice:", error);
    await interaction.followUp({
      content: "Не удалось выгнать. Проверь право бота **Перемещать участников**.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function recoverVoiceRooms(client) {
  for (const guild of client.guilds.cache.values()) {
    await guild.channels.fetch().catch(() => null);
    const hub = guild.channels.cache.get(HUB_ID) ?? (await guild.channels.fetch(HUB_ID).catch(() => null));
    if (!hub || hub.type !== ChannelType.GuildVoice) continue;

    const siblings = guild.channels.cache.filter(
      (channel) =>
        channel.type === ChannelType.GuildVoice &&
        channel.parentId === hub.parentId &&
        channel.id !== hub.id &&
        parseNumber(channel.name) !== null,
    );

    for (const channel of siblings.values()) {
      const people = humansIn(channel);
      if (people.size === 0) {
        await channel.delete("Пустая голосовая комната").catch(() => null);
        continue;
      }

      const joinOrder = [...people.keys()];
      const room = {
        channelId: channel.id,
        guildId: guild.id,
        ownerId: joinOrder[0],
        joinOrder,
        number: parseNumber(channel.name) ?? 1,
        panelId: null,
      };
      rooms.set(channel.id, room);

      const existing = await findExistingPanel(channel, client.user.id);
      room.panelId = existing?.id ?? null;
      await refreshPanel(channel, room);
    }

    await renumberGuild(guild);
    console.log(`Голосовые комнаты восстановлены на сервере ${guild.id}`);
  }
}

export function forgetVoiceChannel(channelId) {
  rooms.delete(channelId);
}
