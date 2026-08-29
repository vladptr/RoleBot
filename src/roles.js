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
import * as store from "./store.js";

export const IDS = {
  PANEL: "role:panel",
  RENAME: "role:rename",
  COLOR: "role:color",
  RENAME_MODAL: "role:rename:modal",
  NAME_INPUT: "role:name",
};

const NAME_MAX = 100;

export function panelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Персональная роль")
    .setDescription(
      [
        "Нажми кнопку ниже, чтобы **создать свою роль** на сервере.",
        "Повторное нажатие откроет меню изменения названия и цвета — его увидишь **только ты**.",
        "",
        "Менять можно только название и цвет. Права роли изменить нельзя.",
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
  return `Не удалось изменить ${what}. Проверь право **Управлять ролями** у роли бота.`;
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

function botCanManage(guild, role) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "У бота нет права **Управлять ролями**. Включи его у роли бота в настройках сервера.";
  }
  if (role && !role.editable) {
    return "Бот не может изменить эту роль. Его роль должна стоять выше персональной, и у неё должно быть право **Управлять ролями**.";
  }
  if (role && role.position >= me.roles.highest.position) {
    return "Роль бота должна быть **выше** персональной роли в списке ролей сервера.";
  }
  return null;
}

function manageComponents(role) {
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

  return [renameRow, colorRow];
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
        "Эти кнопки видишь только ты. Можно изменить только название и цвет.",
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
      content: [
        `Роль **${created.role.name}** создана и выдана тебе.`,
        "Нажми кнопку ещё раз, чтобы изменить название или цвет.",
      ].join("\n"),
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

  const modal = new ModalBuilder()
    .setCustomId(IDS.RENAME_MODAL)
    .setTitle("Название роли");

  const input = new TextInputBuilder()
    .setCustomId(IDS.NAME_INPUT)
    .setLabel("Новое название")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(NAME_MAX)
    .setRequired(true)
    .setValue(role.name.slice(0, NAME_MAX))
    .setPlaceholder("Как будет называться роль");

  modal.addComponents(new ActionRowBuilder().addComponents(input));
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

  const name = sanitizeName(interaction.fields.getTextInputValue(IDS.NAME_INPUT));
  if (!name) {
    await interaction.editReply({ content: "Название не может быть пустым." });
    return;
  }

  try {
    await role.setName(name, `Смена названия персональной роли ${interaction.user.tag}`);
    const updated = await role.fetch();
    await interaction.editReply({
      content: `Название роли изменено на **${name}**.`,
      ...managePayload(updated),
    });
  } catch (error) {
    console.error("Failed to rename role:", error);
    await interaction.editReply({
      content: editErrorMessage(error, "название"),
    });
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
    await role.setColors(
      { primaryColor: selected.hex },
      `Смена цвета персональной роли ${interaction.user.tag}`,
    );
    const updated = await role.fetch();
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
