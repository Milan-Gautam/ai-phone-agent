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

const readJSON = (file) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return []; } };
const writeJSON = (file, data) => fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
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
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });
    const user = readJSON('users.json').find(u => u.email === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

// ============ AI RESPONSES ============
function getConversationResponse(msg) {
  const m = msg.toLowerCase().trim();
  
  // Greetings
  if (/^(hi|hello|hey|yo|sup|greetings)[!.]*$/.test(m)) {
    const greetings = [
      "Hey there! How can I help you today?",
      "Hello! What can I do for you?",
      "Hi! Ready to assist you. What do you need?",
      "Hey! Good to see you. What shall we do today?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // How are you
  if (/how (are|r) (you|u)/.test(m)) {
    return "I'm doing great! Running at full capacity and ready to help. How about you?";
  }
  
  // Who are you
  if (/who (are|r) (you|u)|what (is |'s )your name|about (yourself|you)/.test(m)) {
    return "I'm your AI Agent! I can open websites, search the internet, launch apps, tell you the time, check weather, and much more. Just tell me what you need!";
  }
  
  // What can you do
  if (/what (can|do) you do|help|capabilities|features/.test(m)) {
    return "I can help you with:\n• Opening websites (say 'Open YouTube')\n• Searching the web ('Search for cats')\n• Opening apps ('Open calculator')\n• Checking weather ('Weather in Paris')\n• Telling time ('What time is it?')\n• And chatting with you!";
  }
  
  // Thanks
  if (/thank(s| you)|thx|appreciate/.test(m)) {
    const thanks = [
      "You're welcome! Anything else?",
      "Happy to help! Let me know if you need anything else.",
      "No problem at all! That's what I'm here for."
    ];
    return thanks[Math.floor(Math.random() * thanks.length)];
  }
  
  // Bye
  if (/^(bye|goodbye|see you|cya|later)[!.]*$/.test(m)) {
    return "Goodbye! Have a great day. Come back anytime you need help!";
  }
  
  // Good morning/night
  if (/good (morning|afternoon|evening|night)/.test(m)) {
    const time = m.match(/good (morning|afternoon|evening|night)/)[1];
    return `Good ${time} to you too! How can I assist you today?`;
  }
  
  // How old
  if (/how old|your age/.test(m)) {
    return "I was just created recently, so I'm quite young! But I'm learning fast. 😊";
  }
  
  // Joke
  if (/joke|funny|make me laugh/.test(m)) {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "What do you call a fake noodle? An impasta!",
      "Why did the scarecrow win an award? He was outstanding in his field!",
      "What's the best thing about Switzerland? I don't know, but the flag is a big plus!"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  
  // Love/feelings
  if (/love you|ily|i love/.test(m)) {
    return "Aww, that's sweet! I'm here to help you anytime. ❤️";
  }
  
  // Sad/upset
  if (/(i('?m| am) )?(sad|upset|depressed|unhappy|lonely|bored)/.test(m)) {
    return "I'm sorry you're feeling that way. Want to talk about it? Or maybe I can help take your mind off things - want to watch some YouTube videos or listen to music?";
  }
  
  // Return null if no conversation match (will be treated as command)
  return null;
}

// ============ COMMAND PARSER ============
function parseCommand(msg) {
  const m = msg.toLowerCase().trim();
  
  // Open website
  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('visit ') || m.startsWith('launch ')) {
    const target = m.replace(/^(open|go to|visit|launch)\s+/i, '');
    const sites = {
      'youtube': 'https://youtube.com',
      'facebook': 'https://facebook.com',
      'twitter': 'https://twitter.com',
      'instagram': 'https://instagram.com',
      'amazon': 'https://amazon.com',
      'github': 'https://github.com',
      'gmail': 'https://mail.google.com',
      'netflix': 'https://netflix.com',
      'spotify': 'https://open.spotify.com',
      'reddit': 'https://reddit.com',
      'linkedin': 'https://linkedin.com',
      'whatsapp': 'https://web.whatsapp.com',
      'maps': 'https://maps.google.com',
      'translate': 'https://translate.google.com',
      'drive': 'https://drive.google.com',
      'photos': 'https://photos.google.com',
      'news': 'https://news.google.com'
    };
    for (const [name, url] of Object.entries(sites)) {
      if (target.includes(name)) return { action: 'open', value: url, message: `Opening ${name}` };
    }
    if (target.match(/\.(com|org|net|io|dev|app|co|in)/)) {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return { action: 'open', value: url, message: `Opening ${target}` };
    }
    return { action: 'search', value: target, message: `Searching for "${target}"` };
  }
  
  // Search
  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ') || m.startsWith('look up ')) {
    const query = m.replace(/^(search|find|google|look up)\s+(for\s+)?/i, '');
    return { action: 'search', value: query, message: `Searching for "${query}"` };
  }
  
  // YouTube
  if (m.includes('youtube') || m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    if (query && query !== 'youtube') {
      return { action: 'open', value: `https://youtube.com/results?search_query=${encodeURIComponent(query)}`, message: `Playing "${query}" on YouTube` };
    }
    return { action: 'open', value: 'https://youtube.com', message: 'Opening YouTube' };
  }
  
  // Apps
  const apps = {
    'calculator': { cmd: 'gnome-calculator', name: 'Calculator' },
    'notepad': { cmd: 'gedit', name: 'Text Editor' },
    'terminal': { cmd: 'gnome-terminal', name: 'Terminal' },
    'files': { cmd: 'nautilus', name: 'File Manager' },
    'settings': { cmd: 'gnome-control-center', name: 'Settings' },
    'browser': { cmd: 'firefox', name: 'Browser' },
    'chrome': { cmd: 'google-chrome', name: 'Chrome' }
  };
  for (const [key, app] of Object.entries(apps)) {
    if (m.includes(key)) return { action: 'app', value: app.cmd, message: `Opening ${app.name}` };
  }
  
  // Weather
  if (m.includes('weather')) {
    const location = m.replace(/weather\s*(in\s*|for\s*)?/i, '').replace(/what('s| is) the weather/i, '').trim() || 'current location';
    return { action: 'search', value: `weather ${location}`, message: `Checking weather for ${location}` };
  }
  
  // Time
  if (m.includes('time') || m.includes('clock') || m.includes('date')) {
    const now = new Date();
    return { action: null, value: null, message: `It's ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}` };
  }
  
  // Default search
  return { action: 'search', value: msg, message: `Let me find that for you` };
}

function execute(action, value) {
  return new Promise((resolve) => {
    if (!action) return resolve('Done');
    let cmd = '';
    if (action === 'open') {
      cmd = process.platform === 'win32' ? `start ${value}` : process.platform === 'darwin' ? `open "${value}"` : `xdg-open "${value}"`;
    } else if (action === 'search') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
      cmd = process.platform === 'win32' ? `start ${url}` : `xdg-open "${url}"`;
    } else if (action === 'app') {
      cmd = value;
    }
    exec(cmd, (err) => resolve(err ? 'Failed to execute' : 'Completed successfully'));
  });
}

// ============ AGENT ENDPOINT ============
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Command required' });
    
    console.log(`📱 "${message}"`);
    
    // First check if it's a conversation
    const convoResponse = getConversationResponse(message);
    
    if (convoResponse) {
      console.log(`💬 Chat: ${convoResponse}`);
      
      const history = readJSON('history.json');
      history.push({ userId: req.userId, command: message, response: convoResponse, type: 'chat', timestamp: new Date().toISOString() });
      writeJSON('history.json', history);
      
      return res.json({ success: true, message: convoResponse, type: 'chat' });
    }
    
    // Otherwise, parse as command
    const parsed = parseCommand(message);
    console.log(`⚡ Action: ${parsed.message}`);
    
    const result = await execute(parsed.action, parsed.value);
    console.log(`✅ ${result}`);
    
    const history = readJSON('history.json');
    history.push({ userId: req.userId, command: message, response: parsed.message, result, type: 'command', timestamp: new Date().toISOString() });
    writeJSON('history.json', history);
    
    res.json({ success: true, message: parsed.message, result, type: 'command' });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Command failed' });
  }
});

app.get('/api/history', auth, (req, res) => {
  const history = readJSON('history.json').filter(h => h.userId === req.userId).slice(-50).reverse();
  res.json({ history });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`\n🤖 AI Agent running at http://localhost:${PORT}\n`));
