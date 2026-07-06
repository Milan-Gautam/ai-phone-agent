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
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
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

  const sites = {
    'youtube': 'https://youtube.com', 'facebook': 'https://facebook.com', 'twitter': 'https://twitter.com',
    'instagram': 'https://instagram.com', 'amazon': 'https://amazon.com', 'github': 'https://github.com',
    'gmail': 'https://mail.google.com', 'netflix': 'https://netflix.com', 'spotify': 'https://open.spotify.com',
    'reddit': 'https://reddit.com', 'linkedin': 'https://linkedin.com', 'whatsapp': 'https://web.whatsapp.com',
    'wikipedia': 'https://wikipedia.org', 'twitch': 'https://twitch.tv', 'discord': 'https://discord.com',
    'google': 'https://google.com', 'maps': 'https://maps.google.com', 'chatgpt': 'https://chat.openai.com'
  };

  for (const [name, url] of Object.entries(sites)) {
    if (m.includes(name)) return { type: 'command', action: 'open', value: url, message: 'Opening ' + name.charAt(0).toUpperCase() + name.slice(1) };
  }

  const apps = {
    'calculator': 'gnome-calculator', 'calc': 'gnome-calculator',
    'notepad': 'gedit', 'notes': 'gedit', 'editor': 'gedit',
    'terminal': 'gnome-terminal', 'console': 'gnome-terminal',
    'files': 'nautilus', 'explorer': 'nautilus',
    'settings': 'gnome-control-center',
    'firefox': 'firefox', 'chrome': 'google-chrome', 'browser': 'firefox',
    'vscode': 'code', 'code': 'code'
  };

  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('launch ') || m.startsWith('start ')) {
    const target = m.replace(/^(open|go to|launch|start)\s+/i, '');
    for (const [name, cmd] of Object.entries(apps)) {
      if (target.includes(name)) return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
    }
    if (target.match(/\.(com|org|net|io|dev|co)/)) {
      const url = target.startsWith('http') ? target : 'https://' + target;
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + target };
    }
    return { type: 'command', action: 'search', value: target, message: 'Searching: ' + target };
  }

  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ') || m.startsWith('look up ')) {
    const query = m.replace(/^(search|find|google|look up)\s+(for\s+)?/i, '');
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
    const loc = m.replace(/weather|what'?s?\s+the\s+weather|check\s+weather|how'?s?\s+the\s+weather|temperature/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }

  if (m.includes('time') || m.includes('clock') || m.includes('date')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // ============ CHAT RESPONSES ============
  if (/^(hi|hello|hey|yo|sup|greetings|howdy|hola|heya)\b/.test(m))
    return { type: 'chat', message: ['Hey there! How can I help you today?', 'Hello! What can I do for you?', 'Hi! Ready to assist. What do you need?', 'Hey! Good to see you. How can I help?'][Math.floor(Math.random() * 4)] };

  if (/how\s+(are|r)\s+(you|u)|how('s|s)\s+it\s+going/.test(m))
    return { type: 'chat', message: 'I am doing great! All systems running perfectly. How about you?' };

  if (/who\s+(are|r)\s+(you|u)|your\s+name|what\s+are\s+you|introduce\s+yourself/.test(m))
    return { type: 'chat', message: 'I am your AI Agent! I can open websites, search the internet, launch apps, check weather, tell time, and chat with you. Think of me as your personal digital assistant. What can I do for you?' };

  if (/what\s+(can|do)\s+you\s+do|help|commands|capabilities|features/.test(m))
    return { type: 'chat', message: 'Here is what I can do:\n\n• Open websites - "Open YouTube"\n• Search - "Search for cats"\n• Launch apps - "Open calculator"\n• Weather - "Weather in Paris"\n• Time - "What time is it?"\n• Chat - Just talk to me!\n\nWhat would you like?' };

  if (/thank|thx|thanks|appreciate|grateful|cheers/.test(m))
    return { type: 'chat', message: ['You\'re welcome! Happy to help. 😊', 'No problem at all!', 'Anytime! That\'s what I\'m here for.', 'Glad I could help!'][Math.floor(Math.random() * 4)] };

  if (/^(bye|goodbye|see\s*(you|ya)|cya|later|peace|take\s*care)/.test(m))
    return { type: 'chat', message: ['Goodbye! Have a wonderful day!', 'See you later! Come back anytime.', 'Take care! I will be here when you need me.'][Math.floor(Math.random() * 3)] };

  if (/good\s+(morning|afternoon|evening|night)/.test(m)) {
    const t = m.match(/good\s+(morning|afternoon|evening|night)/)[1];
    return { type: 'chat', message: 'Good ' + t + '! How can I assist you today?' };
  }

  if (/joke|funny|make\s+me\s+laugh|lol|haha|humor/.test(m)) {
    const jokes = [
      'Why don\'t scientists trust atoms? Because they make up everything! 😄',
      'Why did the developer go broke? He used up all his cache! 💻',
      'What do you call a fake noodle? An impasta! 🍝',
      'Why do programmers prefer dark mode? Light attracts bugs! 🐛',
      'How many programmers to change a light bulb? None, that\'s hardware! 💡'
    ];
    return { type: 'chat', message: jokes[Math.floor(Math.random() * jokes.length)] };
  }

  if (/who\s+(made|created|built|developed)\s+you|your\s+creator/.test(m))
    return { type: 'chat', message: 'I was created by a developer who wanted to make device control easier and more fun! Now I\'m here to help you every day.' };

  if (/how\s+old|your\s+age/.test(m))
    return { type: 'chat', message: 'I am quite young! Just created recently, but I learn fast with every conversation we have.' };

  if (/love\s+you|ily|i\s+love\s+you/.test(m))
    return { type: 'chat', message: 'That\'s so sweet! I\'m here for you anytime. ❤️' };

  if (/(i'?m\s+)?(sad|upset|depressed|unhappy|lonely|feeling\s+down)/.test(m))
    return { type: 'chat', message: 'I\'m sorry you\'re feeling this way. Want to talk about it? Or I can tell you a joke, play music, or just chat. I\'m here for you. 🤗' };

  if (/(i'?m\s+)?(happy|excited|great|awesome|amazing|wonderful)/.test(m))
    return { type: 'chat', message: 'That\'s wonderful to hear! Your happiness makes me happy too! What would you like to do? 🎉' };

  if (/(i'?m\s+)?(bored|nothing\s+to\s+do)/.test(m))
    return { type: 'chat', message: 'Bored? Let me help! I can tell a joke, play music on YouTube, search fun facts, or open Netflix. What sounds good?' };

  if (/(i'?m\s+)?(tired|exhausted|sleepy)/.test(m))
    return { type: 'chat', message: 'Sounds like you need rest! Take breaks and get good sleep. Want some relaxing music on Spotify? 😴' };

  if (/meaning\s+of\s+life|purpose\s+of\s+life|why\s+are\s+we\s+here/.test(m))
    return { type: 'chat', message: 'That\'s deep! Many say it\'s about happiness, helping others, and making a difference. What do you think?' };

  if (/favorite\s+(color|food|movie|song|book|animal)/.test(m))
    return { type: 'chat', message: 'As an AI, I don\'t have favorites, but I love learning about yours! What\'s your favorite?' };

  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine)/.test(m))
    return { type: 'chat', message: 'Great! What would you like to do next?' };

  if (/^(no|nope|nah|not\s+really)/.test(m))
    return { type: 'chat', message: 'Okay, no problem. Let me know if you need anything!' };

  if (/how\s+(do|can)\s+i\s+(make|create|build|cook|fix|repair|learn|start)/.test(m))
    return { type: 'chat', message: 'That\'s a great question! Let me search that for you so you get the best information.' };

  if (/tell\s+me\s+(about|a|the)\s+(story|fact|news)/.test(m))
    return { type: 'chat', message: 'Did you know? The first computer mouse was made of wood! It was invented by Douglas Engelbart in 1964. Pretty cool, right? 🖱️' };

  if (/you\s+(are|r)\s+(smart|intelligent|clever|amazing|awesome|cool|great|nice|funny)/.test(m))
    return { type: 'chat', message: 'Thank you so much! You\'re pretty awesome yourself! 😊 What can I help with?' };

  // Default
  const defaults = [
    'That\'s interesting! Tell me more about that.',
    'I see. How can I help with that?',
    'Good point! What else is on your mind?',
    'I\'m here to help. What would you like to do?',
    'Got it. Is there something specific you need?',
    'I understand. Let me know if you need anything!',
    'That\'s cool! Would you like me to search for more information?'
  ];
  return { type: 'chat', message: defaults[Math.floor(Math.random() * defaults.length)] };
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
    if (result.type === 'command' && result.action) execResult = await executeAction(result.action, result.value);
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
