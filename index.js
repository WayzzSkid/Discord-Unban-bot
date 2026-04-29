require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });


client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const allunbanCommand = new SlashCommandBuilder()
    .setName('allunban')
    .setDescription('Unbans all banned members from the server')
    .setDefaultMemberPermissions('0'); // admin only

  const unbanCommand = new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unbans a specific user by ID, or all banned users if no ID is given')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The ID of the user to unban (leave blank to unban everyone)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions('0'); // admin only

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: [allunbanCommand.toJSON(), unbanCommand.toJSON()] }
      );
      console.log(`Registered commands in guild: ${guild.name}`);
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'unban') {
    if (!interaction.memberPermissions.has('BanMembers')) {
      return interaction.reply({ content: 'You need the **Ban Members** permission to use this.', ephemeral: true });
    }
    if (process.env.REQUIRED_ROLE_ID && !interaction.member.roles.cache.has(process.env.REQUIRED_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have the required role to use this command.', ephemeral: true });
    }

    const userId = interaction.options.getString('userid');
    await interaction.deferReply({ ephemeral: true });

    
    if (!userId) {
      try {
        const unbanned = await massUnban(interaction.guild, `Mass unban by ${interaction.user.tag}`);
        if (unbanned === 0) return interaction.editReply('There are no banned members to unban.');
        await sendWebhookLog(interaction.guild.name, unbanned, interaction.user.tag);
        return interaction.editReply(`Done. Unbanned **${unbanned}** member(s).`);
      } catch (err) {
        console.error('Mass unban error:', err);
        return interaction.editReply('Something went wrong while trying to unban members.');
      }
    }

    // ID provided — unban specific user
    try {
      await interaction.guild.members.unban(userId, `Unbanned by ${interaction.user.tag}`);
      await interaction.editReply(`Successfully unbanned <@${userId}> (\`${userId}\`).`);
    } catch (err) {
      if (err.code === 10026) {
        await interaction.editReply('That user is not banned or does not exist.');
      } else {
        console.error('Unban error:', err);
        await interaction.editReply('Failed to unban that user.');
      }
    }
    return;
  }

  if (interaction.commandName !== 'allunban') return;

  
  if (!interaction.memberPermissions.has('BanMembers')) {
    return interaction.reply({ content: 'You need the **Ban Members** permission to use this.', ephemeral: true });
  }
  if (process.env.REQUIRED_ROLE_ID && !interaction.member.roles.cache.has(process.env.REQUIRED_ROLE_ID)) {
    return interaction.reply({ content: 'You do not have the required role to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const unbanned = await massUnban(interaction.guild, `Mass unban via /allunban`);
    if (unbanned === 0) return interaction.editReply('There are no banned members to unban.');
    await sendWebhookLog(interaction.guild.name, unbanned, interaction.user.tag);
    await interaction.editReply(`Done. Unbanned **${unbanned}** member(s).`);
  } catch (err) {
    console.error('Error during unban:', err);
    await interaction.editReply('Something went wrong while trying to unban members.');
  }
});

async function massUnban(guild, reason) {
  const bans = await guild.bans.fetch();
  if (bans.size === 0) return 0;

  const results = await Promise.allSettled(
    bans.map(ban => guild.members.unban(ban.user.id, reason))
  );

  return results.filter(r => r.status === 'fulfilled').length;
}

async function sendWebhookLog(guildName, count, executedBy) {
  if (!process.env.WEBHOOK_URL) return;

  const payload = {
    embeds: [
      {
        title: 'Mass Unban Executed',
        color: 0x57f287,
        fields: [
          { name: 'Server', value: guildName, inline: true },
          { name: 'Unbanned', value: `${count} member(s)`, inline: true },
          { name: 'Executed by', value: executedBy, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('Webhook failed:', res.statusText);
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

client.login(process.env.BOT_TOKEN).then(() => {
  client.user.setPresence({ status: 'online' });
});
