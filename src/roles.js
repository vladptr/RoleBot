import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { COLORS, colorName, findColor } from "./colors.js";
import { ROLE_EMOJIS, findRoleEmoji } from "./emojis.js";
import * as store from "./store.js";

export const IDS = {
  PANEL: "role:panel",
  RENAME: "role:rename",
  COLOR: "role:color",
  RENAME_MODAL: "role:rename:modal",
  NAME_INPUT: "role:name",
  EMOJI_LEFT: "role:emoji:left",
  EMOJI_RIGHT: "role:emoji:right",
};

const NAME_MAX = 100;
const EMOJI_CHARS =
  /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Emoji_Modifier_Base}|\p{Emoji_Component}|\p{Regional_Indicator}|\uFE0F|\u200D|\u20E3/gu;

export function panelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Персональная роль")
    .setDescription(
      [
        "Нажми кнопку ниже, чтобы **создать свою роль** на сервере.",
        "Повторное нажатие откроет меню — его увидишь **только ты**.",
        "Можно изменить название, эмодзи по краям и цвет. Права роли менять нельзя.",
      ].join("\n"),
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.PANEL)
      .setLabel("Моя роль")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎨"),
  );

  return { embeds: [embed], components: [row] };
}

function sanitizeName(raw) {
  const name = String(raw ?? "")
    .replace(/@everyone/gi, "everyone")
    .replace(/@here/gi, "here")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);

  return name;
}

function isEmojiToken(token) {
  if (!token) return false;
  if (token.replace(EMOJI_CHARS, "").length !== 0) return false;

  return (
    /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(token) ||
    /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(token) ||
    token.includes("\u20E3")
  );
}

function parseRoleName(fullName) {
  const tokens = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { left: "", name: "", right: "" };

  let start = 0;
  let end = tokens.length;
  let left = "";
  let right = "";

  if (tokens.length >= 2 && isEmojiToken(tokens[0])) {
    left = tokens[0];
    start = 1;
  }

  if (end - start >= 2 && isEmojiToken(tokens[end - 1])) {
    right = tokens[end - 1];
    end -= 1;
  }

  return {
    left,
    name: tokens.slice(start, end).join(" "),
    right,
  };
}

function buildRoleName(left, name, right) {
  return [left, name, right].filter(Boolean).join(" ").slice(0, NAME_MAX);
}

function ephemeral(payload) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function editErrorMessage(error, what) {
  const code = error?.code;
  if (code === 50013) {
    return `Не удалось изменить ${what}: нет права **Управлять ролями**, или роль бота стоит не выше персональной.`;
  }
  if (code === 50035) {
    return `Не удалось изменить ${what}: Discord отклонил значение. Попробуй другой цвет или название.`;
  }
  return `Не удалось изменить ${what}. Попробуй ещё раз.`;
}

async function fetchOwnedRole(guild, userId) {
  const roleId = store.getRoleId(guild.id, userId);
  if (!roleId) return null;
  const role =
    guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    store.deleteRoleId(guild.id, userId);
    return null;
  }
  return role;
}

function roleColor(role) {
  return role.colors?.primaryColor ?? role.color ?? 0;
}

async function applyRoleColor(role, hex, reason) {
  if (typeof role.setColors === "function") {
    try {
      return await role.setColors(
        { primaryColor: hex, secondaryColor: null, tertiaryColor: null },
        reason,
      );
    } catch {
      return role.setColors({ primaryColor: hex }, reason);
    }
  }
  return role.setColor(hex, reason);
}

function botCanManage(guild, role) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "У бота нет права **Управлять ролями**. Включи его у роли бота в настройках сервера.";
  }
  if (role && !role.editable) {
    return "Роль бота должна быть **выше** персональной роли в списке ролей сервера.";
  }
  return null;
}

function emojiSelectRow(customId, placeholder, current) {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel("Без эмодзи")
      .setValue("none")
      .setEmoji("🚫")
      .setDefault(!current),
  ];

  const list = [...ROLE_EMOJIS];
  if (current && !list.some((item) => item.emoji === current)) {
    list.unshift({ id: `raw:${current}`, emoji: current, label: "Текущий" });
  }

  for (const item of list.slice(0, 24)) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(item.label)
        .setValue(item.id)
        .setEmoji(item.emoji)
        .setDefault(item.emoji === current),
    );
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options),
  );
}

function manageComponents(role) {
  const parsed = parseRoleName(role.name);
  const current = findColor(roleColor(role));

  const renameRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.RENAME)
      .setLabel("Изменить название")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),
  );

  const colorRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(IDS.COLOR)
      .setPlaceholder("Выбери цвет роли")
      .addOptions(
        COLORS.map((color) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(color.label)
            .setValue(color.value)
            .setEmoji(color.emoji)
            .setDescription(color.value === "DEFAULT" ? "Цвет Discord по умолчанию" : `#${color.value}`)
            .setDefault(current?.value === color.value),
        ),
      ),
  );

  return [
    renameRow,
    emojiSelectRow(IDS.EMOJI_LEFT, "Эмодзи слева", parsed.left),
    emojiSelectRow(IDS.EMOJI_RIGHT, "Эмодзи справа", parsed.right),
    colorRow,
  ];
}

function manageEmbed(role) {
  const hex = roleColor(role);
  return new EmbedBuilder()
    .setColor(hex || 0x99aab5)
    .setTitle("Управление ролью")
    .setDescription(
      [
        `Название: **${role.name}**`,
        `Цвет: **${colorName(hex)}**`,
        "",
        "Эти кнопки видишь только ты. Название, эмодзи по краям и цвет выбираются здесь.",
      ].join("\n"),
    );
}

function managePayload(role) {
  return {
    embeds: [manageEmbed(role)],
    components: manageComponents(role),
  };
}

async function createPersonalRole(member) {
  const guild = member.guild;
  const permissionError = botCanManage(guild, null);
  if (permissionError) return { error: permissionError };

  if (guild.roles.cache.size >= 250) {
    return { error: "На сервере достигнут лимит ролей (250)." };
  }

  const name = sanitizeName(member.displayName) || "Роль";

  try {
    const role = await guild.roles.create({
      name,
      colors: { primaryColor: 0x3498db },
      permissions: [],
      mentionable: false,
      hoist: false,
      reason: `Персональная роль для ${member.user.tag} (${member.id})`,
    });

    await member.roles.add(role, "Выдача персональной роли");
    store.setRoleId(guild.id, member.id, role.id);
    return { role };
  } catch (error) {
    console.error("Failed to create role:", error);
    return {
      error:
        "Не удалось создать роль. Проверь, что у бота есть право **Управлять ролями**, и его роль стоит выше остальных.",
    };
  }
}

export async function handlePanelClick(interaction) {
  await interaction.deferReply(ephemeral({}));

  const member = interaction.member;
  const guild = interaction.guild;
  const role = await fetchOwnedRole(guild, member.id);

  if (!role) {
    const created = await createPersonalRole(member);
    if (created.error) {
      await interaction.editReply({ content: created.error });
      return;
    }

    await interaction.editReply({
      content: `Роль **${created.role.name}** создана и выдана тебе.`,
      ...managePayload(created.role),
    });
    return;
  }

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Возврат персональной роли").catch(() => null);
  }

  const permissionError = botCanManage(guild, role);
  if (permissionError) {
    await interaction.editReply({ content: permissionError });
    return;
  }

  await interaction.editReply(managePayload(role));
}

export async function handleRenameButton(interaction) {
  const role = await fetchOwnedRole(interaction.guild, interaction.user.id);
  if (!role) {
    await interaction.reply(
      ephemeral({
        content: "У тебя ещё нет персональной роли. Нажми **Моя роль** на панели.",
      }),
    );
    return;
  }

  const parsed = parseRoleName(role.name);
  const nameValue = (parsed.name || role.name || "Роль").slice(0, NAME_MAX) || "Роль";

  const modal = new ModalBuilder().setCustomId(IDS.RENAME_MODAL).setTitle("Название роли");

  const nameInput = new TextInputBuilder()
    .setCustomId(IDS.NAME_INPUT)
    .setLabel("Название роли")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(NAME_MAX)
    .setRequired(true)
    .setValue(nameValue)
    .setPlaceholder("Как будет называться роль");

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);
}

export async function handleRenameModal(interaction) {
  await interaction.deferReply(ephemeral({}));

  const role = await fetchOwnedRole(interaction.guild, interaction.user.id);
  if (!role) {
    await interaction.editReply({
      content: "У тебя ещё нет персональной роли. Нажми **Моя роль** на панели.",
    });
    return;
  }

  const permissionError = botCanManage(interaction.guild, role);
  if (permissionError) {
    await interaction.editReply({ content: permissionError });
    return;
  }

  const parsed = parseRoleName(role.name);
  const name = sanitizeName(interaction.fields.getTextInputValue(IDS.NAME_INPUT));
  if (!name) {
    await interaction.editReply({ content: "Название не может быть пустым." });
    return;
  }

  const fullName = buildRoleName(parsed.left, name, parsed.right);
  if (!fullName) {
    await interaction.editReply({ content: "Название не может быть пустым." });
    return;
  }

  try {
    const updated = await role.setName(
      fullName,
      `Смена названия персональной роли ${interaction.user.tag}`,
    );
    await interaction.editReply({
      content: `Название роли изменено на **${fullName}**.`,
      ...managePayload(updated),
    });
  } catch (error) {
    console.error("Failed to rename role:", error);
    await interaction.editReply({
      content: editErrorMessage(error, "название"),
    });
  }
}

export async function handleEmojiSelect(interaction) {
  await interaction.deferUpdate();

  const role = await fetchOwnedRole(interaction.guild, interaction.user.id);
  if (!role) {
    await interaction.editReply({
      content: "У тебя ещё нет персональной роли. Нажми **Моя роль** на панели.",
      embeds: [],
      components: [],
    });
    return;
  }

  const permissionError = botCanManage(interaction.guild, role);
  if (permissionError) {
    await interaction.followUp(ephemeral({ content: permissionError }));
    return;
  }

  const parsed = parseRoleName(role.name);
  const name = parsed.name || role.name || "Роль";
  const selected = interaction.values[0];
  const emoji =
    selected === "none"
      ? ""
      : selected.startsWith("raw:")
        ? selected.slice(4)
        : findRoleEmoji(selected)?.emoji || "";

  const fullName =
    interaction.customId === IDS.EMOJI_LEFT
      ? buildRoleName(emoji, name, parsed.right)
      : buildRoleName(parsed.left, name, emoji);

  try {
    const updated = await role.setName(
      fullName,
      `Смена эмодзи персональной роли ${interaction.user.tag}`,
    );
    await interaction.editReply(managePayload(updated));
  } catch (error) {
    console.error("Failed to set role emoji:", error);
    await interaction.followUp(
      ephemeral({
        content: editErrorMessage(error, "эмодзи"),
      }),
    );
  }
}

export async function handleColorSelect(interaction) {
  await interaction.deferUpdate();

  const role = await fetchOwnedRole(interaction.guild, interaction.user.id);
  if (!role) {
    await interaction.editReply({
      content: "У тебя ещё нет персональной роли. Нажми **Моя роль** на панели.",
      embeds: [],
      components: [],
    });
    return;
  }

  const permissionError = botCanManage(interaction.guild, role);
  if (permissionError) {
    await interaction.followUp(ephemeral({ content: permissionError }));
    return;
  }

  const selected = findColor(interaction.values[0]);
  if (!selected) {
    await interaction.followUp(ephemeral({ content: "Неизвестный цвет." }));
    return;
  }

  try {
    const updated = await applyRoleColor(
      role,
      selected.hex,
      `Смена цвета персональной роли ${interaction.user.tag}`,
    );
    await interaction.editReply(managePayload(updated));
  } catch (error) {
    console.error("Failed to recolor role:", error);
    await interaction.followUp(
      ephemeral({
        content: editErrorMessage(error, "цвет"),
      }),
    );
  }
}

export async function restoreRoleOnJoin(member) {
  const role = await fetchOwnedRole(member.guild, member.id);
  if (!role) return;
  if (member.roles.cache.has(role.id)) return;
  await member.roles.add(role, "Возврат персональной роли после входа").catch(() => null);
}
