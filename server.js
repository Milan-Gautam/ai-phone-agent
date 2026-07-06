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
  if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
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

// ============ SMART RESPONSE SYSTEM ============
function getResponse(msg) {
  const m = msg.toLowerCase().trim();
  
  // WEBSITE COMMANDS
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
    'chatgpt': 'https://chat.openai.com',
    'wikipedia': 'https://wikipedia.org',
    'twitch': 'https://twitch.tv',
    'discord': 'https://discord.com',
    'google': 'https://google.com'
  };
  
  for (const [name, url] of Object.entries(sites)) {
    if (m.includes(name)) {
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + name.charAt(0).toUpperCase() + name.slice(1) };
    }
  }
  
  // OPEN COMMAND
  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('visit ') || m.startsWith('launch ')) {
    const target = m.replace(/^(open|go to|visit|launch)\s+/i, '');
    
    const apps = {
      'calculator': 'gnome-calculator',
      'calc': 'gnome-calculator',
      'notepad': 'gedit',
      'notes': 'gedit',
      'terminal': 'gnome-terminal',
      'console': 'gnome-terminal',
      'files': 'nautilus',
      'explorer': 'nautilus',
      'settings': 'gnome-control-center',
      'firefox': 'firefox',
      'chrome': 'google-chrome',
      'vscode': 'code'
    };
    
    for (const [name, cmd] of Object.entries(apps)) {
      if (target.includes(name)) return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
    }
    
    if (target.includes('.')) {
      const url = target.startsWith('http') ? target : 'https://' + target;
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + target };
    }
    
    return { type: 'command', action: 'search', value: target, message: 'Searching for: ' + target };
  }
  
  // SEARCH COMMAND
  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ')) {
    const query = m.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { type: 'command', action: 'search', value: query, message: 'Searching for: ' + query };
  }
  
  // PLAY/YOUTUBE
  if (m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    return { type: 'command', action: 'open', value: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing ' + query + ' on YouTube' };
  }
  
  // WEATHER
  if (m.includes('weather')) {
    const loc = m.replace(/weather|what'?s?\s+the\s+weather|check\s+weather|how'?s?\s+the\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }
  
  // TIME
  if (m.includes('time') || m.includes('clock') || m.includes('date')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }
  
  // GREETINGS
  if (/^(hi|hello|hey|yo|sup|greetings|howdy)\b/.test(m)) {
    const greetings = ['Hey there! How can I help you today?', 'Hello! What can I do for you?', 'Hi! I\'m ready to assist. What do you need?', 'Hey! Good to see you. How can I help?'];
    return { type: 'chat', message: greetings[Math.floor(Math.random() * greetings.length)] };
  }
  
  // HOW ARE YOU
  if (/how\s+(are|r)\s+(you|u)/.test(m)) {
    return { type: 'chat', message: 'I\'m doing great, thanks for asking! How are you?' };
  }
  
  // WHO ARE YOU
  if (/who\s+(are|r)\s+(you|u)|your\s+name|what\s+are\s+you/.test(m)) {
    return { type: 'chat', message: 'I\'m your AI Agent! I can open websites, search the internet, launch apps, check weather, tell time, and have conversations with you. Just tell me what you need!' };
  }
  
  // WHAT CAN YOU DO
  if (/what\s+(can|do)\s+you\s+do|help|commands|capabilities/.test(m)) {
    return { type: 'chat', message: 'Here\'s what I can do:\n\n• Open websites - Say "Open YouTube"\n• Search the web - Say "Search for cats"\n• Launch apps - Say "Open calculator"\n• Check weather - Say "Weather in Paris"\n• Tell time - Say "What time is it?"\n• Chat with you - Just talk to me!\n\nWhat would you like to do?' };
  }
  
  // THANK YOU
  if (/thank|thx|thanks|appreciate/.test(m)) {
    const thanks = ['You\'re welcome! Happy to help.', 'No problem at all!', 'Anytime! That\'s what I\'m here for.', 'Glad I could help!'];
    return { type: 'chat', message: thanks[Math.floor(Math.random() * thanks.length)] };
  }
  
  // GOODBYE
  if (/^(bye|goodbye|see\s*(you|ya|u)|cya|later|peace)/.test(m)) {
    return { type: 'chat', message: 'Goodbye! Have a wonderful day. Come back anytime you need help!' };
  }
  
  // GOOD MORNING/AFTERNOON/EVENING/NIGHT
  if (/good\s+(morning|afternoon|evening|night)/.test(m)) {
    const time = m.match(/good\s+(morning|afternoon|evening|night)/)[1];
    return { type: 'chat', message: 'Good ' + time + ' to you too! How can I assist you today?' };
  }
  
  // JOKE
  if (/joke|funny|make\s+me\s+laugh|lol|haha|humor/.test(m)) {
    const jokes = [
      'Why don\'t scientists trust atoms? Because they make up everything! 😄',
      'Why did the developer go broke? Because he used up all his cache! 💻',
      'What do you call a fake noodle? An impasta! 🍝',
      'Why do programmers prefer dark mode? Because light attracts bugs! 🐛',
      'How many programmers does it take to change a light bulb? None, that\'s a hardware problem! 💡'
    ];
    return { type: 'chat', message: jokes[Math.floor(Math.random() * jokes.length)] };
  }
  
  // CREATOR
  if (/who\s+(made|created|built|developed)\s+you/.test(m)) {
    return { type: 'chat', message: 'I was created by a passionate developer who wanted to make device control easier and more fun! Now I\'m here to help you every day.' };
  }
  
  // AGE
  if (/how\s+old|your\s+age/.test(m)) {
    return { type: 'chat', message: 'I was just created recently, so I\'m quite young! But I\'m learning and growing every day with every conversation.' };
  }
  
  // LOVE
  if (/love\s+you|ily|i\s+love\s+you/.test(m)) {
    return { type: 'chat', message: 'That\'s so sweet! I\'m here to help you anytime you need. ❤️' };
  }
  
  // SAD/UPSET
  if (/(i'?m\s+)?(sad|upset|depressed|unhappy|lonely|bored|tired)/.test(m)) {
    return { type: 'chat', message: 'I\'m sorry you\'re feeling that way. Remember, tough times don\'t last forever. Want to talk about it, or would you like me to help take your mind off things? I can tell you a joke, play some music, or just listen.' };
  }
  
  // MEANING OF LIFE
  if (/meaning\s+of\s+life/.test(m)) {
    return { type: 'chat', message: 'The meaning of life is a deep question! Many philosophers say it\'s about finding happiness, helping others, and making a positive impact. What do you think it is?' };
  }
  
  // FAVORITE COLOR/FOOD/MOVIE
  if (/favorite\s+(color|food|movie|song|book)/.test(m)) {
    return { type: 'chat', message: 'As an AI, I don\'t have personal preferences, but I love helping you discover new things! What\'s your favorite?' };
  }
  
  // YES/NO
  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine)/.test(m)) {
    return { type: 'chat', message: 'Great! What would you like to do next?' };
  }
  if (/^(no|nope|nah|not\s+really)/.test(m)) {
    return { type: 'chat', message: 'Okay, no problem. Let me know if you need anything!' };
  }
  
  // DEFAULT CHAT
  const defaults = [
    'That\'s interesting! Tell me more.',
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
    if (action === 'open') {
      cmd = process.platform === 'win32' ? 'start "" "' + value + '"' : 'xdg-open "' + value + '"';
    } else if (action === 'search') {
      cmd = 'xdg-open "https://www.google.com/search?q=' + encodeURIComponent(value) + '"';
    } else if (action === 'app') {
      cmd = value;
    }
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
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('AI Agent running on http://localhost:' + PORT));
