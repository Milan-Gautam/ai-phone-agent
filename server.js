const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'agent-secret-key-2024';
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return []; } };
const writeJSON = (f, d) => fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2));

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token expired' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const users = readJSON('users.json');
    if (users.find(u => u.email === email.toLowerCase())) return res.status(400).json({ error: 'Email exists' });
    const user = { id: Date.now().toString(), name, email: email.toLowerCase(), password: await bcrypt.hash(password, 12) };
    users.push(user); writeJSON('users.json', users);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = readJSON('users.json').find(u => u.email === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

function getResponse(msg) {
  const m = msg.toLowerCase().trim();
  
  // Websites
  const sites = { youtube:'https://youtube.com', facebook:'https://facebook.com', twitter:'https://twitter.com', instagram:'https://instagram.com', amazon:'https://amazon.com', github:'https://github.com', gmail:'https://mail.google.com', netflix:'https://netflix.com', spotify:'https://open.spotify.com', reddit:'https://reddit.com', linkedin:'https://linkedin.com', whatsapp:'https://web.whatsapp.com', chatgpt:'https://chat.openai.com', wikipedia:'https://wikipedia.org', twitch:'https://twitch.tv', discord:'https://discord.com', google:'https://google.com' };
  
  for (const [name, url] of Object.entries(sites)) {
    if (m.includes(name)) return { type: 'command', action: 'open', value: url, message: 'Opening ' + name };
  }
  
  // Apps
  const apps = { calculator:'gnome-calculator', calc:'gnome-calculator', notepad:'gedit', notes:'gedit', terminal:'gnome-terminal', files:'nautilus', explorer:'nautilus', settings:'gnome-control-center', firefox:'firefox', chrome:'google-chrome', vscode:'code', code:'code' };
  
  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('launch ')) {
    const target = m.replace(/^(open|go to|launch)\s+/i, '');
    for (const [name, cmd] of Object.entries(apps)) {
      if (target.includes(name)) return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
    }
    if (target.match(/\.(com|org|net|io)/)) {
      const url = target.startsWith('http') ? target : 'https://' + target;
      return { type: 'command', action: 'open', value: url, message: 'Opening website' };
    }
    return { type: 'command', action: 'search', value: target, message: 'Searching for: ' + target };
  }
  
  if (m.startsWith('search ') || m.startsWith('find ')) {
    const query = m.replace(/^(search|find)\s+(for\s+)?/i, '');
    return { type: 'command', action: 'search', value: query, message: 'Searching: ' + query };
  }
  
  if (m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    return { type: 'command', action: 'open', value: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing ' + query };
  }
  
  for (const [name, cmd] of Object.entries(apps)) {
    if (m.includes(name)) return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
  }
  
  if (m.includes('weather')) {
    const loc = m.replace(/weather|what'?s?\s+the\s+weather|check\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }
  
  if (m.includes('time') || m.includes('clock')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString() + ' on ' + now.toLocaleDateString() };
  }
  
  // Chat responses
  if (/^(hi|hello|hey|yo|sup)\b/.test(m)) return { type: 'chat', message: 'Hey! How can I help you today?' };
  if (/how\s+are\s+you/.test(m)) return { type: 'chat', message: 'I am doing great, thanks for asking! How are you?' };
  if (/who\s+are\s+you|your\s+name/.test(m)) return { type: 'chat', message: 'I am your AI Agent! I can open websites, search, launch apps, check weather, and chat with you.' };
  if (/what\s+can\s+you\s+do/.test(m)) return { type: 'chat', message: 'I can: Open websites, Search the web, Launch apps, Check weather, Tell time, and Chat with you!' };
  if (/thank/.test(m)) return { type: 'chat', message: 'You are welcome! Happy to help.' };
  if (/bye|goodbye/.test(m)) return { type: 'chat', message: 'Goodbye! Have a great day!' };
  if (/joke|funny/.test(m)) return { type: 'chat', message: 'Why did the developer go broke? Because he used up all his cache! 😄' };
  if (/good\s+(morning|afternoon|evening|night)/.test(m)) return { type: 'chat', message: 'Good ' + m.match(/good\s+(morning|afternoon|evening|night)/)[1] + '! How can I help?' };
  if (/love\s+you/.test(m)) return { type: 'chat', message: 'That is sweet! I am here to help you anytime. ❤️' };
  
  return { type: 'chat', message: 'I understand you said: "' + msg + '". How can I help with that? You can ask me to open websites, search, or just chat!' };
}

function executeAction(action, value) {
  return new Promise((resolve) => {
    if (!action) return resolve('');
    let cmd = '';
    if (action === 'open') cmd = 'xdg-open "' + value + '"';
    else if (action === 'search') cmd = 'xdg-open "https://www.google.com/search?q=' + encodeURIComponent(value) + '"';
    else if (action === 'app') cmd = value;
    exec(cmd, { timeout: 10000 }, (err) => resolve(err ? 'Failed' : 'Done'));
  });
}

app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    const result = getResponse(message);
    let execResult = '';
    
    if (result.type === 'command' && result.action) {
      execResult = await executeAction(result.action, result.value);
    }
    
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
