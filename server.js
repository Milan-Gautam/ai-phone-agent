const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
    const users = readJSON('users.json');
    if (users.find(u => u.email === email.toLowerCase())) return res.status(400).json({ error: 'Email exists' });
    const user = { id: Date.now().toString(), name, email: email.toLowerCase(), password: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() };
    users.push(user); writeJSON('users.json', users);
    res.status(201).json({ token: jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' }), user: { id: user.id, name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = readJSON('users.json').find(u => u.email === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' }), user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

// ============ SITE MAP ============
const WEBSITES = {
  'youtube': 'https://youtube.com',
  'facebook': 'https://facebook.com',
  'fb': 'https://facebook.com',
  'twitter': 'https://twitter.com',
  'x': 'https://twitter.com',
  'instagram': 'https://instagram.com',
  'ig': 'https://instagram.com',
  'amazon': 'https://amazon.com',
  'github': 'https://github.com',
  'gmail': 'https://mail.google.com',
  'mail': 'https://mail.google.com',
  'email': 'https://mail.google.com',
  'netflix': 'https://netflix.com',
  'spotify': 'https://open.spotify.com',
  'music': 'https://open.spotify.com',
  'reddit': 'https://reddit.com',
  'linkedin': 'https://linkedin.com',
  'whatsapp': 'https://web.whatsapp.com',
  'maps': 'https://maps.google.com',
  'drive': 'https://drive.google.com',
  'photos': 'https://photos.google.com',
  'calendar': 'https://calendar.google.com',
  'chatgpt': 'https://chat.openai.com',
  'wikipedia': 'https://wikipedia.org',
  'wiki': 'https://wikipedia.org',
  'twitch': 'https://twitch.tv',
  'discord': 'https://discord.com',
  'pinterest': 'https://pinterest.com',
  'ebay': 'https://ebay.com',
  'stackoverflow': 'https://stackoverflow.com',
  'google': 'https://google.com'
};

const APPS = {
  'calculator': { cmd: 'gnome-calculator', name: 'Calculator' },
  'calc': { cmd: 'gnome-calculator', name: 'Calculator' },
  'notepad': { cmd: 'gedit', name: 'Text Editor' },
  'notes': { cmd: 'gedit', name: 'Text Editor' },
  'editor': { cmd: 'gedit', name: 'Text Editor' },
  'terminal': { cmd: 'gnome-terminal', name: 'Terminal' },
  'console': { cmd: 'gnome-terminal', name: 'Terminal' },
  'cmd': { cmd: 'gnome-terminal', name: 'Terminal' },
  'files': { cmd: 'nautilus', name: 'File Manager' },
  'explorer': { cmd: 'nautilus', name: 'File Manager' },
  'folders': { cmd: 'nautilus', name: 'File Manager' },
  'settings': { cmd: 'gnome-control-center', name: 'Settings' },
  'preferences': { cmd: 'gnome-control-center', name: 'Settings' },
  'browser': { cmd: 'firefox', name: 'Firefox' },
  'firefox': { cmd: 'firefox', name: 'Firefox' },
  'chrome': { cmd: 'google-chrome', name: 'Chrome' },
  'vscode': { cmd: 'code', name: 'VS Code' },
  'code': { cmd: 'code', name: 'VS Code' }
};

// ============ PROCESS MESSAGE ============
function processMessage(msg) {
  const m = msg.toLowerCase().trim();
  
  // Check for website keywords anywhere in the message
  for (const [key, url] of Object.entries(WEBSITES)) {
    if (m.includes(key)) {
      // If it also has a search-like pattern
      if (m.startsWith('search') || m.startsWith('find') || m.startsWith('google')) {
        const query = m.replace(/^(search|find|google)\s+(for\s+)?/i, '').replace(key, '').trim();
        if (query) return { type: 'command', action: 'search', value: `${query} ${key}`, message: `Searching for "${query}" on ${key}` };
      }
      return { type: 'command', action: 'open', value: url, message: `Opening ${key}` };
    }
  }
  
  // Open command
  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('visit ') || m.startsWith('launch ') || m.startsWith('start ')) {
    const target = m.replace(/^(open|go to|visit|launch|start)\s+/i, '');
    
    // Check if it's an app
    for (const [key, app] of Object.entries(APPS)) {
      if (target.includes(key)) return { type: 'command', action: 'app', value: app.cmd, message: `Opening ${app.name}` };
    }
    
    // Check if it's a URL
    if (target.match(/\.(com|org|net|io|dev|app|co|in|ai)/)) {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return { type: 'command', action: 'open', value: url, message: `Opening ${target}` };
    }
    
    // Default search
    return { type: 'command', action: 'search', value: target, message: `Searching for "${target}"` };
  }
  
  // Search command
  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ') || m.startsWith('look up ')) {
    const query = m.replace(/^(search|find|google|look up)\s+(for\s+)?/i, '');
    return { type: 'command', action: 'search', value: query, message: `Searching for "${query}"` };
  }
  
  // YouTube specific
  if (m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    return { type: 'command', action: 'open', value: `https://youtube.com/results?search_query=${encodeURIComponent(query)}`, message: `Playing "${query}" on YouTube` };
  }
  
  // App commands
  for (const [key, app] of Object.entries(APPS)) {
    if (m.includes(key)) return { type: 'command', action: 'app', value: app.cmd, message: `Opening ${app.name}` };
  }
  
  // Weather
  if (m.includes('weather')) {
    const location = m.replace(/weather|what'?s?\s+the\s+weather|how'?s?\s+the\s+weather|check\s+weather|show\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    const searchTerm = location ? `weather ${location}` : 'weather today';
    return { type: 'command', action: 'search', value: searchTerm, message: location ? `Checking weather for ${location}` : 'Checking weather' };
  }
  
  // Time
  if (m.includes('time') || m.includes('clock') || m.includes('date')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return { type: 'chat', message: `It's ${timeStr} on ${dateStr}` };
  }
  
  // System info
  if (m.includes('system info') || m.includes('computer info') || m.includes('device info')) {
    const info = `OS: ${process.platform}, Arch: ${process.arch}, Node: ${process.version}, Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`;
    return { type: 'chat', message: info };
  }
  
  // If no command matched, it's a conversation
  return { type: 'chat', message: getChatResponse(m) };
}

// ============ CHAT ============
function getChatResponse(m) {
  if (/^(hi+|hello+|hey+|yo+|sup+|greetings+|howdy)[!.]*$/i.test(m)) {
    return ["Hey! How can I help you?", "Hello! What can I do for you?", "Hi there! Ready to assist.", "Hey! What do you need?"][Math.floor(Math.random() * 4)];
  }
  if (/how\s+(are|r)\s+(you|u)/i.test(m)) return "I'm running perfectly! All systems operational. How are you?";
  if (/who\s+(are|r)\s+(you|u)|your\s+name/i.test(m)) return "I'm your AI Assistant. I can open websites, search, launch apps, check weather, tell time, and chat!";
  if (/what\s+(can|do)\s+you\s+do|help|commands/i.test(m)) return "I can:\n• Open websites (\"Open YouTube\")\n• Search (\"Search for cats\")\n• Launch apps (\"Open calculator\")\n• Weather (\"Weather in Paris\")\n• Time (\"What time is it?\")\n• Chat with you!";
  if (/thank/i.test(m)) return "You're welcome! 😊";
  if (/^(bye|goodbye|see\s*(you|ya)|cya|later)[!.]*$/i.test(m)) return "Goodbye! Have a great day!";
  if (/good\s+(morning|afternoon|evening|night)/i.test(m)) return `Good ${m.match(/good\s+(morning|afternoon|evening|night)/i)[1]}! How can I help?`;
  if (/joke|funny|laugh/i.test(m)) {
    const jokes = ["Why don't scientists trust atoms? They make up everything! 😄", "Why did the dev go broke? He used up all his cache! 💻", "What's a computer's favorite beat? An algo-rhythm! 🎵"];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  if (/love\s+you|ily/i.test(m)) return "Thank you! ❤️";
  if (/(i'?m\s+)?(sad|upset|depressed|lonely|bored)/i.test(m)) return "I understand. Want to talk or shall I help distract you?";
  
  return ["Interesting! How can I help with that?", "I see. What would you like to do?", "Got it. Need anything specific?", "Cool! Let me know what you need."][Math.floor(Math.random() * 4)];
}

// ============ EXECUTE ============
function executeAction(action, value) {
  return new Promise((resolve) => {
    if (!action) return resolve('');
    let cmd = '';
    if (action === 'open') {
      cmd = process.platform === 'win32' ? `start "" "${value}"` : process.platform === 'darwin' ? `open "${value}"` : `xdg-open "${value}"`;
    } else if (action === 'search') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
      cmd = process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    } else if (action === 'app') {
      cmd = value;
    }
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      resolve(err ? `Error: ${err.message}` : 'Done');
    });
  });
}

// ============ AGENT ENDPOINT ============
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
    
    console.log(`\n📩 "${message}"`);
    const result = processMessage(message);
    console.log(`🤖 Type: ${result.type}, Message: ${result.message}`);
    
    let execResult = '';
    if (result.type === 'command' && result.action) {
      execResult = await executeAction(result.action, result.value);
      console.log(`✅ ${execResult}`);
    }
    
    const history = readJSON('history.json');
    history.push({ userId: req.userId, input: message, type: result.type, response: result.message, action: result.action || null, value: result.value || null, result: execResult || null, timestamp: new Date().toISOString() });
    writeJSON('history.json', history);
    
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.get('/api/history', auth, (req, res) => {
  res.json({ history: readJSON('history.json').filter(h => h.userId === req.userId).slice(-100).reverse() });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`\n⚡ AI Agent running at http://localhost:${PORT}\n`));
