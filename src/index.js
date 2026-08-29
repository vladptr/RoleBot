import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { keepAlive } from "./keepAlive.js";
import * as store from "./store.js";
import {
  handleColorSelect,
  handleEmojiSelect,
  handlePanelClick,
  handleRenameButton,
  handleRenameModal,
  IDS,
  panelPayload,
  rebuildOwnership,
  restoreRoleOnJoin,
} from "./roles.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("Нужны переменные окружения DISCORD_TOKEN и CLIENT_ID.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Опубликовать панель создания персональной роли")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .toJSON();

async function registerGuildCommands(guildId) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [setupCommand],
  });
}

async function registerCommands(client) {
  for (const guild of client.guilds.cache.values()) {
    await registerGuildCommands(guild.id);
    console.log(`Команды зарегистрированы на сервере ${guild.id}`);
  }
}

async function handleSetup(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Эту команду могут использовать только администраторы сервера.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "Команду нужно вызывать в текстовом канале.",
      ephemeral: true,
    });
    return;
  }

  await interaction.channel.send(panelPayload());
  await interaction.reply({
    content: "Панель опубликована в этом канале.",
    ephemeral: true,
  });
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Бот запущен как ${readyClient.user.tag}`);
  try {
    await registerCommands(readyClient);
  } catch (error) {
    console.error("Не удалось зарегистрировать команды:", error);
  }
  try {
    await rebuildOwnership(readyClient);
    console.log("Привязки персональных ролей восстановлены");
  } catch (error) {
    console.error("Не удалось восстановить привязки ролей:", error);
  }
});

client.on(Events.GuildCreate, (guild) => {
  registerGuildCommands(guild.id)
    .then(() => console.log(`Команды зарегистрированы на сервере ${guild.id}`))
    .catch((error) => console.error(`Не удалось зарегистрировать команды на ${guild.id}:`, error));
});

client.on(Events.GuildMemberAdd, (member) => {
  restoreRoleOnJoin(member).catch((error) => {
    console.error("Failed to restore role on join:", error);
  });
});

client.on(Events.GuildRoleDelete, (role) => {
  const ownerId = store.findOwner(role.guild.id, role.id);
  if (ownerId) store.deleteRoleId(role.guild.id, ownerId);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
      await handleSetup(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === IDS.PANEL) {
      await handlePanelClick(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === IDS.RENAME) {
      await handleRenameButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === IDS.RENAME_MODAL) {
      await handleRenameModal(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === IDS.COLOR) {
      await handleColorSelect(interaction);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      (interaction.customId === IDS.EMOJI_LEFT || interaction.customId === IDS.EMOJI_RIGHT)
    ) {
      await handleEmojiSelect(interaction);
    }
  } catch (error) {
    console.error("Interaction error:", error);
    const payload = {
      content: "Что-то пошло не так. Попробуй ещё раз чуть позже.",
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
      return;
    }

    await interaction.reply(payload).catch(() => null);
  }
});

keepAlive(() => client.isReady());
await client.login(token);
