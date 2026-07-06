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

// Setup
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Storage helpers
const readJSON = (file) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return []; }
};
const writeJSON = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
};

// Auth middleware
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
    
    const users = readJSON('users.json');
    if (users.find(u => u.email === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const user = {
      id: Date.now().toString(),
      name,
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString()
    };
    
    users.push(user);
    writeJSON('users.json', users);
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });
    
    const user = readJSON('users.json').find(u => u.email === email.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Command parser
function parseCommand(msg) {
  const m = msg.toLowerCase().trim();
  
  // Open website
  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('visit ')) {
    const target = m.replace(/^(open|go to|visit)\s+/i, '');
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
      'linkedin': 'https://linkedin.com'
    };
    
    for (const [name, url] of Object.entries(sites)) {
      if (target.includes(name)) return { action: 'open', value: url, message: `Opening ${name}` };
    }
    
    if (target.match(/\.(com|org|net|io)/)) {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return { action: 'open', value: url, message: `Opening ${target}` };
    }
    
    return { action: 'search', value: target, message: `Searching for "${target}"` };
  }
  
  // Search
  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ')) {
    const query = m.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { action: 'search', value: query, message: `Searching for "${query}"` };
  }
  
  // YouTube
  if (m.includes('youtube') || m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    if (query && query !== 'youtube') {
      const url = `https://youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return { action: 'open', value: url, message: `Playing "${query}" on YouTube` };
    }
    return { action: 'open', value: 'https://youtube.com', message: 'Opening YouTube' };
  }
  
  // Apps
  if (m.includes('calculator')) return { action: 'app', value: 'gnome-calculator', message: 'Opening Calculator' };
  if (m.includes('notepad') || m.includes('editor')) return { action: 'app', value: 'gedit', message: 'Opening Text Editor' };
  if (m.includes('terminal')) return { action: 'app', value: 'gnome-terminal', message: 'Opening Terminal' };
  if (m.includes('files') || m.includes('explorer')) return { action: 'app', value: 'nautilus', message: 'Opening Files' };
  if (m.includes('settings')) return { action: 'app', value: 'gnome-control-center', message: 'Opening Settings' };
  
  // Weather
  if (m.includes('weather')) {
    const location = m.replace(/weather\s*(in\s*)?/i, '').trim() || 'current location';
    return { action: 'search', value: `weather ${location}`, message: `Checking weather for ${location}` };
  }
  
  // Time
  if (m.includes('time') || m.includes('clock')) {
    const now = new Date();
    return { action: null, value: null, message: `It's ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}` };
  }
  
  // Default search
  return { action: 'search', value: msg, message: `Let me find that for you` };
}

// Execute command
function execute(action, value) {
  return new Promise((resolve) => {
    if (!action) return resolve('Done');
    
    let cmd = '';
    if (action === 'open') {
      cmd = process.platform === 'win32' ? `start ${value}` :
            process.platform === 'darwin' ? `open "${value}"` : `xdg-open "${value}"`;
    } else if (action === 'search') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
      cmd = process.platform === 'win32' ? `start ${url}` : `xdg-open "${url}"`;
    } else if (action === 'app') {
      cmd = value;
    }
    
    exec(cmd, (err) => resolve(err ? 'Failed to execute' : 'Completed successfully'));
  });
}

// Agent endpoint
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Command required' });
    
    console.log(`📱 "${message}"`);
    
    const parsed = parseCommand(message);
    console.log(`🤖 ${parsed.message}`);
    
    const result = await execute(parsed.action, parsed.value);
    console.log(`✅ ${result}`);
    
    // Save history
    const history = readJSON('history.json');
    history.push({
      userId: req.userId,
      command: message,
      response: parsed.message,
      result,
      timestamp: new Date().toISOString()
    });
    writeJSON('history.json', history);
    
    res.json({ success: true, message: parsed.message, result });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Command failed' });
  }
});

// Get history
app.get('/api/history', auth, (req, res) => {
  const history = readJSON('history.json')
    .filter(h => h.userId === req.userId)
    .slice(-50)
    .reverse();
  res.json({ history });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🤖 AI Agent running at http://localhost:${PORT}\n`);
});
