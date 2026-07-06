const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'agent-secret-change-this';
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return []; } };
const writeJSON = (f, d) => fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2));

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Auth required' });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  const users = readJSON('users.json');
  if (users.find(u => u.email === email.toLowerCase())) return res.status(400).json({ error: 'Email exists' });
  const user = { id: Date.now().toString(), name, email: email.toLowerCase(), password: await bcrypt.hash(password, 12) };
  users.push(user); writeJSON('users.json', users);
  res.status(201).json({ token: jwt.sign({ id: user.id }, JWT_SECRET), user: { id: user.id, name, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = readJSON('users.json').find(u => u.email === email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: jwt.sign({ id: user.id }, JWT_SECRET), user: { id: user.id, name: user.name } });
});

const SITES = {
  youtube: 'https://youtube.com', facebook: 'https://facebook.com', twitter: 'https://twitter.com',
  instagram: 'https://instagram.com', amazon: 'https://amazon.com', github: 'https://github.com',
  gmail: 'https://mail.google.com', netflix: 'https://netflix.com', spotify: 'https://open.spotify.com',
  reddit: 'https://reddit.com', linkedin: 'https://linkedin.com', whatsapp: 'https://web.whatsapp.com',
  chatgpt: 'https://chat.openai.com', wikipedia: 'https://wikipedia.org', twitch: 'https://twitch.tv',
  discord: 'https://discord.com', pinterest: 'https://pinterest.com', ebay: 'https://ebay.com',
  google: 'https://google.com', maps: 'https://maps.google.com'
};

const APPS = {
  calculator: { cmd: 'gnome-calculator', name: 'Calculator' },
  notepad: { cmd: 'gedit', name: 'Notepad' },
  terminal: { cmd: 'gnome-terminal', name: 'Terminal' },
  files: { cmd: 'nautilus', name: 'Files' },
  settings: { cmd: 'gnome-control-center', name: 'Settings' },
  firefox: { cmd: 'firefox', name: 'Firefox' },
  chrome: { cmd: 'google-chrome', name: 'Chrome' },
  vscode: { cmd: 'code', name: 'VS Code' }
};

async function askAI(question) {
  try {
    const res = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(question)}&format=json&no_html=1`);
    if (res.data.Abstract) return res.data.Abstract;
    if (res.data.AbstractText) return res.data.AbstractText;
    if (res.data.Answer) return res.data.Answer;
    return null;
  } catch (e) { return null; }
}

async function processMessage(msg) {
  const m = msg.toLowerCase().trim();
  
  for (const [key, url] of Object.entries(SITES)) {
    if (m.includes(key)) return { type: 'command', action: 'open', value: url, message: 'Opening ' + key };
  }
  
  if (m.startsWith('open ') || m.startsWith('go to ')) {
    const target = m.replace(/^(open|go to)\s+/i, '');
    for (const [key, app] of Object.entries(APPS)) {
      if (target.includes(key)) return { type: 'command', action: 'app', value: app.cmd, message: 'Opening ' + app.name };
    }
    if (target.match(/\.(com|org|net|io)/)) {
      const url = target.startsWith('http') ? target : 'https://' + target;
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + target };
    }
    return { type: 'command', action: 'search', value: target, message: 'Searching for "' + target + '"' };
  }
  
  if (m.startsWith('search ') || m.startsWith('find ')) {
    const query = m.replace(/^(search|find)\s+(for\s+)?/i, '');
    return { type: 'command', action: 'search', value: query, message: 'Searching for "' + query + '"' };
  }
  
  if (m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '');
    return { type: 'command', action: 'open', value: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing "' + query + '" on YouTube' };
  }
  
  for (const [key, app] of Object.entries(APPS)) {
    if (m.includes(key)) return { type: 'command', action: 'app', value: app.cmd, message: 'Opening ' + app.name };
  }
  
  if (m.includes('weather')) {
    const loc = m.replace(/weather|what'?s?\s+the\s+weather|check\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }
  
  if (m.includes('time') || m.includes('clock')) {
    const now = new Date();
    return { type: 'chat', message: 'It\'s ' + now.toLocaleTimeString() + ' on ' + now.toLocaleDateString() };
  }
  
  // Try AI for everything else
  const aiAnswer = await askAI(msg);
  if (aiAnswer) return { type: 'chat', message: aiAnswer };
  
  return { type: 'command', action: 'search', value: msg, message: 'Let me search that for you' };
}

function executeAction(action, value) {
  return new Promise((resolve) => {
    if (!action) return resolve('');
    let cmd = '';
    if (action === 'open') cmd = 'xdg-open "' + value + '"';
    else if (action === 'search') cmd = 'xdg-open "https://www.google.com/search?q=' + encodeURIComponent(value) + '"';
    else if (action === 'app') cmd = value;
    exec(cmd, { timeout: 10000 }, (err) => resolve(err ? 'Error' : 'Done'));
  });
}

app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    const result = await processMessage(message);
    let execResult = '';
    if (result.type === 'command' && result.action) {
      execResult = await executeAction(result.action, result.value);
    }
    
    const history = readJSON('history.json');
    history.push({ userId: req.userId, input: message, response: result.message, type: result.type, timestamp: new Date().toISOString() });
    writeJSON('history.json', history);
    
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('AI Agent running on http://localhost:' + PORT));
