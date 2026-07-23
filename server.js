require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATA_DIR = path.join(__dirname, 'data');

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET in .env — refusing to start.');
  process.exit(1);
}

// ---------- Multi-provider AI config ----------
// Tried in this order; first configured+working provider wins.
const PROVIDERS = [
  {
    name: 'groq',
    key: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    build: (key, model, system, messages) => ({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: { model, messages: [{ role: 'system', content: system }, ...messages] }
    }),
    extract: (data) => data.choices?.[0]?.message?.content
  },
  {
    name: 'gemini',
    key: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',
    build: (key, model, system, messages) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
      }
    }),
    extract: (data) => data.candidates?.[0]?.content?.parts?.map(p => p.text).join('')
  },
  {
    name: 'deepseek',
    key: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat',
    build: (key, model, system, messages) => ({
      url: 'https://api.deepseek.com/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: { model, messages: [{ role: 'system', content: system }, ...messages] }
    }),
    extract: (data) => data.choices?.[0]?.message?.content
  },
  {
    name: 'together',
    key: process.env.TOGETHER_API_KEY,
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    build: (key, model, system, messages) => ({
      url: 'https://api.together.xyz/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: { model, messages: [{ role: 'system', content: system }, ...messages] }
    }),
    extract: (data) => data.choices?.[0]?.message?.content
  }
];

const configured = PROVIDERS.filter(p => p.key);
if (configured.length === 0) {
  console.warn('Warning: no AI provider keys set in .env — AI chat replies will fail until you add at least one.');
} else {
  console.log('AI providers active (in fallback order): ' + configured.map(p => p.name).join(' -> '));
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return []; } };
const writeJSON = (f, d) => fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2));

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.userId = jwt.verify(token, JWT_SECRET).id; next(); }
  catch (e) { return res.status(401).json({ error: 'Token expired' }); }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
    const users = readJSON('users.json');
    if (users.find(u => u.email === email.toLowerCase())) return res.status(400).json({ error: 'Email exists' });
    const user = { id: Date.now().toString(), name, email: email.toLowerCase(), password: await bcrypt.hash(password, 12) };
    users.push(user); writeJSON('users.json', users);
    res.json({ token: jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' }), user: { id: user.id, name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = readJSON('users.json').find(u => u.email === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' }), user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

// ---------- System / app control (unchanged logic) ----------

function openApp(name) {
  return new Promise((resolve) => {
    const apps = {
      'calculator':'gnome-calculator','calc':'gnome-calculator','notepad':'gedit','notes':'gedit',
      'editor':'gedit','terminal':'gnome-terminal','console':'gnome-terminal','files':'nautilus',
      'file manager':'nautilus','explorer':'nautilus','settings':'gnome-control-center',
      'control panel':'gnome-control-center','browser':'firefox','firefox':'firefox',
      'chrome':'google-chrome','chromium':'chromium-browser','vscode':'code','code':'code',
      'camera':'cheese','webcam':'cheese','system monitor':'gnome-system-monitor',
      'task manager':'gnome-system-monitor','software':'gnome-software','calendar':'gnome-calendar',
      'clock':'gnome-clocks','weather':'gnome-weather','maps':'gnome-maps','photos':'eog',
      'images':'eog','videos':'totem','music':'rhythmbox','documents':'evince','pdf':'evince',
      'thunderbird':'thunderbird','mail':'thunderbird','libreoffice':'libreoffice','gimp':'gimp',
      'vlc':'vlc','steam':'steam','discord':'discord','spotify':'spotify',
      'telegram':'telegram-desktop','whatsapp':'whatsapp-desktop','zoom':'zoom','obs':'obs',
      'audacity':'audacity','inkscape':'inkscape','blender':'blender','krita':'krita',
      'postman':'postman','virtualbox':'virtualbox','filezilla':'filezilla'
    };
    const cmd = apps[name.toLowerCase()] || name;
    const child = spawn(cmd, [], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } });
    child.unref();
    setTimeout(() => resolve(child.killed ? 'Could not open '+name : 'Opened '+name), 500);
  });
}

function openSite(url) {
  return new Promise((resolve) => {
    const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } });
    child.unref();
    resolve('Opened');
  });
}

function runCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { env: { ...process.env, DISPLAY: ':0' } }, (err, stdout, stderr) => resolve(err ? (stderr || err.message) : (stdout || 'Done')));
  });
}

// ---------- Real AI chat (replaces old regex chatReply) ----------

// Keep a short rolling history per user so the AI has conversational context.
const chatHistory = new Map(); // userId -> [{role, content}, ...]
const MAX_HISTORY_MESSAGES = 12; // trim so requests stay cheap/fast

const SYSTEM_PROMPT = 'You are a helpful assistant embedded in a desktop app. Keep answers concise and conversational unless the user asks for depth or detail.';

async function callProvider(provider, system, messages) {
  const { url, headers, body } = provider.build(provider.key, provider.model, system, messages);
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || data.error || `HTTP ${response.status}`);
  const text = provider.extract(data);
  if (!text) throw new Error('empty response');
  return text.trim();
}

async function getAIReply(userId, message) {
  if (configured.length === 0) {
    return "AI isn't configured yet — add at least one provider key (GROQ_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, or TOGETHER_API_KEY) to your .env file and restart the server.";
  }

  const history = chatHistory.get(userId) || [];
  const messages = [...history, { role: 'user', content: message }];

  const errors = [];
  for (const provider of configured) {
    try {
      const replyText = await callProvider(provider, SYSTEM_PROMPT, messages);
      const updated = [...messages, { role: 'assistant', content: replyText }].slice(-MAX_HISTORY_MESSAGES);
      chatHistory.set(userId, updated);
      return replyText;
    } catch (e) {
      errors.push(`${provider.name}: ${e.message}`);
      console.warn(`AI provider ${provider.name} failed, trying next —`, e.message);
    }
  }

  return 'All AI providers failed. (' + errors.join(' | ') + ')';
}

// ---------- Command parsing ----------

function parseCommand(msg) {
  const m = msg.toLowerCase().trim();
  if (m.startsWith('open ') || m.startsWith('launch ') || m.startsWith('start ')) {
    const target = m.replace(/^(open|launch|start)\s+/i, '');
    return { type: 'app', action: target, message: 'Opening ' + target };
  }
  const sys = {
    'volume up':{c:'pactl set-sink-volume @DEFAULT_SINK@ +10%',m:'Volume up'},
    'volume down':{c:'pactl set-sink-volume @DEFAULT_SINK@ -10%',m:'Volume down'},
    'mute':{c:'pactl set-sink-mute @DEFAULT_SINK@ toggle',m:'Toggled mute'},
    'brightness up':{c:'brightnessctl set +10%',m:'Brightness up'},
    'brightness down':{c:'brightnessctl set -10%',m:'Brightness down'},
    'bluetooth on':{c:'rfkill unblock bluetooth && bluetoothctl power on',m:'Bluetooth ON'},
    'bluetooth off':{c:'bluetoothctl power off',m:'Bluetooth OFF'},
    'wifi on':{c:'nmcli radio wifi on',m:'WiFi ON'},
    'wifi off':{c:'nmcli radio wifi off',m:'WiFi OFF'},
    'screenshot':{c:'gnome-screenshot',m:'Screenshot taken'},
    'lock':{c:'gnome-screensaver-command -l',m:'Screen locked'},
    'sleep':{c:'systemctl suspend',m:'Sleeping'},
    'dark mode':{c:'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark',m:'Dark mode ON'},
    'light mode':{c:'gsettings set org.gnome.desktop.interface gtk-theme Adwaita',m:'Light mode ON'},
    'shutdown':{c:'shutdown now',m:'Shutting down'},
    'restart':{c:'reboot',m:'Restarting'}
  };
  for (const [t, c] of Object.entries(sys)) { if (m.includes(t)) return { type: 'system', action: c.c, message: c.m }; }

  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ')) {
    const q = m.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { type: 'site', action: 'https://www.google.com/search?q=' + encodeURIComponent(q), message: 'Searching: ' + q };
  }

  const sites = { youtube:'https://youtube.com', facebook:'https://facebook.com', twitter:'https://twitter.com', instagram:'https://instagram.com', amazon:'https://amazon.com', github:'https://github.com', gmail:'https://mail.google.com', netflix:'https://netflix.com', spotify:'https://open.spotify.com', reddit:'https://reddit.com', linkedin:'https://linkedin.com', wikipedia:'https://wikipedia.org', twitch:'https://twitch.tv', discord:'https://discord.com' };
  for (const [n, u] of Object.entries(sites)) { if (m.includes(n) && (m.startsWith('open') || m.startsWith('go to'))) return { type: 'site', action: u, message: 'Opening ' + n }; }

  if (m.startsWith('play ') || m.startsWith('watch ')) {
    const q = m.replace(/^(play|watch)\s+/i, '');
    return { type: 'site', action: 'https://youtube.com/results?search_query=' + encodeURIComponent(q), message: 'Playing ' + q };
  }

  if (m.includes('weather') || m.includes('forecast')) {
    const l = m.replace(/weather|forecast|what'?s?\s+the\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'site', action: 'https://www.google.com/search?q=weather+' + encodeURIComponent(l || 'today'), message: 'Checking weather' + (l ? ' for ' + l : '') };
  }

  if (m.includes('time') || m.includes('clock') || m.includes('date')) {
    const n = new Date();
    return { type: 'chat_direct', message: 'It is ' + n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + n.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // No recognized command → hand off to the real AI
  return { type: 'chat_ai' };
}

app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const r = parseCommand(message);
    let x = '';
    let replyMessage = r.message;
    let replyType = r.type;

    if (r.type === 'app') x = await openApp(r.action);
    else if (r.type === 'system') x = await runCmd(r.action);
    else if (r.type === 'site') x = await openSite(r.action);
    else if (r.type === 'chat_direct') { replyType = 'chat'; }
    else if (r.type === 'chat_ai') { replyMessage = await getAIReply(req.userId, message); replyType = 'chat'; }

    res.json({ success: true, type: replyType, message: replyMessage, result: x || '' });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log('\n⚡ http://localhost:' + PORT + '\n'));
