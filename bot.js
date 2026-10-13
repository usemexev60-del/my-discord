const { Client, GatewayIntentBits, Events } = require('discord.js');
const http = require('http');

// قراءة الإعدادات من Fly.io Secrets
const config = {
  token: process.env.DISCORD_TOKEN,
  siteUrl: process.env.SITE_URL,
  botSecret: process.env.BOT_SECRET,
  prefix: "-",
  adminUserIds: (process.env.ADMIN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean)
};

// سيرفر صغير (Fly.io يحتاج منفذ)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('J1 Studio Bot is running');
});
server.listen(process.env.PORT || 8080, () => {
  console.log('HTTP server listening on port ' + (process.env.PORT || 8080));
});

// البوت
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

function isAdmin(message) {
  return config.adminUserIds.includes(message.author.id);
}

async function callApi(action, body = null) {
  const url = `${config.siteUrl}?action=${action}`;
  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Key': config.botSecret
    }
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return { error: 'network_error' };
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ البوت شغال: ${c.user.tag}`);
  c.user.setActivity('J1 Studio', { type: 3 });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;
  
  const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  
  if (command === 'reset') {
    if (!isAdmin(message)) return message.reply('❌ ما عندك صلاحية.');
    
    if (args.length === 0) {
      const confirmMsg = await message.reply('⚠️ تصفير **جميع** العملات؟ اكتب `نعم` خلال 15 ثانية.');
      try {
        const filter = m => m.author.id === message.author.id && m.content.trim() === 'نعم';
        await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });
      } catch (e) {
        return confirmMsg.edit('❌ تم الإلغاء.');
      }
      
      await confirmMsg.edit('⏳ جاري التصفير...');
      const res = await callApi('reset_all');
      if (res.error) return confirmMsg.edit(`❌ خطأ: ${res.error}`);
      return confirmMsg.edit(`✅ تم تصفير عملات **${res.affected}** عضو.`);
    }
    
    const target = resolveTarget(args[0]);
    const res = await callApi('reset_user', { query: target });
    if (res.error === 'user_not_found') return message.reply('❌ ما لقيت العضو.');
    if (res.error) return message.reply(`❌ خطأ: ${res.error}`);
    
    return message.reply(
      `✅ تم تصفير عملات العضو:\n` +
      `**الاسم:** ${res.user.discord_username || res.user.name}\n` +
      `**البريد:** ${res.user.email}\n` +
      `**الرصيد السابق:** ${res.user.old_coins}`
    );
  }
  
  if (command === 'add') {
    if (!isAdmin(message)) return message.reply('❌ ما عندك صلاحية.');
    
    if (args.length < 2) return message.reply('⚠️ الاستخدام: `-add @user amount`');
    
    const target = resolveTarget(args[0]);
    const amount = parseInt(args[1], 10);
    
    if (!amount || amount <= 0) return message.reply('❌ الرجاء إدخال رقم صحيح.');
    
    const res = await callApi('add_coins', {
      query: target,
      amount: amount,
      reason: `Discord Bot - by ${message.author.username}`
    });
    
    if (res.error === 'user_not_found') return message.reply('❌ ما لقيت العضو.');
    if (res.error) return message.reply(`❌ خطأ: ${res.error}`);
    
    return message.reply(
      `✅ تمت إضافة **${amount}** عملة:\n` +
      `**الاسم:** ${res.user.discord_username || res.user.name}\n` +
      `**البريد:** ${res.user.email}\n` +
      `**الرصيد السابق:** ${res.user.old_coins}\n` +
      `**الرصيد الجديد:** ${res.user.new_coins}`
    );
  }
  
  if (command === 'help') {
    return message.reply(
      `📋 **أوامر البوت:**\n\n` +
      `\`-reset\` — تصفير الكل\n` +
      `\`-reset @user\` — تصفير عضو\n` +
      `\`-reset ID\` — تصفير بالـ ID\n` +
      `\`-reset email\` — تصفير بالإيميل\n` +
      `\`-add @user amount\` — إضافة عملات\n` +
      `\`-help\` — هذه القائمة`
    );
  }
});

function resolveTarget(input) {
  input = input.trim();
  const mentionMatch = input.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d{17,19}$/.test(input)) return input;
  if (input.startsWith('@')) return input.slice(1);
  return input;
}

client.login(config.token);
