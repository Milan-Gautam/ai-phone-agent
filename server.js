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

// ============ SMART AI BRAIN ============
function processMessage(msg) {
  const m = msg.toLowerCase().trim();
  
  // COMMAND PATTERNS - These trigger device actions
  const commands = [
    // Open websites
    { pattern: /^(open|go to|visit|launch|start|show me)\s+(.+)/i, handler: (match) => {
      const target = match[2].toLowerCase();
      const sites = {
        'youtube': 'https://youtube.com', 'facebook': 'https://facebook.com',
        'twitter': 'https://twitter.com', 'instagram': 'https://instagram.com',
        'amazon': 'https://amazon.com', 'github': 'https://github.com',
        'gmail': 'https://mail.google.com', 'netflix': 'https://netflix.com',
        'spotify': 'https://open.spotify.com', 'reddit': 'https://reddit.com',
        'linkedin': 'https://linkedin.com', 'whatsapp': 'https://web.whatsapp.com',
        'maps': 'https://maps.google.com', 'drive': 'https://drive.google.com',
        'photos': 'https://photos.google.com', 'calendar': 'https://calendar.google.com',
        'chatgpt': 'https://chat.openai.com', 'claude': 'https://claude.ai',
        'stackoverflow': 'https://stackoverflow.com', 'wikipedia': 'https://wikipedia.org',
        'twitch': 'https://twitch.tv', 'discord': 'https://discord.com',
        'pinterest': 'https://pinterest.com', 'ebay': 'https://ebay.com'
      };
      for (const [name, url] of Object.entries(sites)) {
        if (target.includes(name)) return { type: 'command', action: 'open', value: url, message: `Opening ${name}` };
      }
      if (target.match(/\.(com|org|net|io|dev|app|co|in|ai)/)) {
        const url = target.startsWith('http') ? target : `https://${target}`;
        return { type: 'command', action: 'open', value: url, message: `Opening ${target}` };
      }
      return { type: 'command', action: 'search', value: target, message: `Searching for "${target}"` };
    }},
    
    // Search
    { pattern: /^(search|find|google|look up|look for)\s+(?:for\s+)?(.+)/i, handler: (match) => {
      return { type: 'command', action: 'search', value: match[2], message: `Searching for "${match[2]}"` };
    }},
    
    // YouTube
    { pattern: /^(play|watch)\s+(.+?)(?:\s+on\s+youtube)?$/i, handler: (match) => {
      return { type: 'command', action: 'open', value: `https://youtube.com/results?search_query=${encodeURIComponent(match[2])}`, message: `Playing "${match[2]}" on YouTube` };
    }},
    { pattern: /youtube/i, handler: () => {
      return { type: 'command', action: 'open', value: 'https://youtube.com', message: 'Opening YouTube' };
    }},
    
    // Apps
    { pattern: /(?:open|start|launch)\s+(calculator|calc|notepad|editor|terminal|console|files|explorer|settings|preferences)/i, handler: (match) => {
      const apps = {
        'calculator': { cmd: 'gnome-calculator', name: 'Calculator' },
        'calc': { cmd: 'gnome-calculator', name: 'Calculator' },
        'notepad': { cmd: 'gedit', name: 'Text Editor' },
        'editor': { cmd: 'gedit', name: 'Text Editor' },
        'terminal': { cmd: 'gnome-terminal', name: 'Terminal' },
        'console': { cmd: 'gnome-terminal', name: 'Terminal' },
        'files': { cmd: 'nautilus', name: 'File Manager' },
        'explorer': { cmd: 'nautilus', name: 'File Manager' },
        'settings': { cmd: 'gnome-control-center', name: 'Settings' },
        'preferences': { cmd: 'gnome-control-center', name: 'Settings' }
      };
      const app = apps[match[1].toLowerCase()];
      if (app) return { type: 'command', action: 'app', value: app.cmd, message: `Opening ${app.name}` };
      return null;
    }},
    
    // Weather
    { pattern: /weather(?:\s+(?:in|for|at))?\s+(.+)/i, handler: (match) => {
      return { type: 'command', action: 'search', value: `weather ${match[1]}`, message: `Checking weather for ${match[1]}` };
    }},
    { pattern: /(?:what's|what is|hows|how is)\s+the\s+weather/i, handler: () => {
      return { type: 'command', action: 'search', value: 'weather today', message: 'Checking weather' };
    }},
    
    // Time/Date
    { pattern: /(?:what\s+(?:is\s+)?(?:the\s+)?)?(time|date|day)(?:\s+is\s+it)?\??$/i, handler: () => {
      const now = new Date();
      return { type: 'chat', message: `It's ${now.toLocaleTimeString()} on ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` };
    }},
    
    // System info
    { pattern: /(?:system|computer|device|machine)\s+(?:info|information|specs|details)/i, handler: () => {
      const info = `OS: ${process.platform}, Architecture: ${process.arch}, Node: ${process.version}, Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB used`;
      return { type: 'chat', message: info };
    }},
    
    // Shutdown/Restart commands
    { pattern: /^(shutdown|restart|reboot|log off|lock)\s*(?:the\s+)?(?:computer|pc|system|device)?$/i, handler: (match) => {
      const actions = {
        'shutdown': { cmd: 'shutdown now', msg: 'Shutting down...' },
        'restart': { cmd: 'reboot', msg: 'Restarting...' },
        'reboot': { cmd: 'reboot', msg: 'Rebooting...' },
        'log off': { cmd: 'gnome-session-quit --no-prompt', msg: 'Logging off...' },
        'lock': { cmd: 'gnome-screensaver-command -l', msg: 'Locking screen...' }
      };
      const action = actions[match[1].toLowerCase()];
      if (action) return { type: 'command', action: 'system', value: action.cmd, message: action.msg };
      return null;
    }},
  ];
  
  // Check commands first
  for (const cmd of commands) {
    const match = m.match(cmd.pattern);
    if (match) {
      const result = cmd.handler(match);
      if (result) return result;
    }
  }
  
  // If not a command, it's a conversation
  return { type: 'chat', message: getChatResponse(m) };
}

// ============ CHAT RESPONSES ============
function getChatResponse(m) {
  // Greetings
  if (/^(hi+|hello+|hey+|yo+|sup+|greetings+|howdy)[!.]*$/.test(m)) {
    const g = ["Hey! How can I help you today?", "Hello! What can I do for you?", "Hi there! Ready to assist.", "Hey! Good to see you. What do you need?"];
    return g[Math.floor(Math.random() * g.length)];
  }
  
  // How are you
  if (/how\s+(are|r)\s+(you|u)/i.test(m)) {
    return "I'm running perfectly! All systems operational. How are you doing?";
  }
  
  // Identity
  if (/who\s+(are|r)\s+(you|u)|what\s+(is\s+)?your\s+name|about\s+(yourself|you)/i.test(m)) {
    return "I'm your AI Assistant. I can open websites, search the internet, launch applications, check weather, tell time, control system settings, and chat with you. Just tell me what you need!";
  }
  
  // Capabilities
  if (/what\s+(can|do)\s+you\s+do|help|commands|capabilities|features|functions/i.test(m)) {
    return "Here's what I can do:\n\n🌐 Open websites - Say \"Open YouTube\"\n🔍 Search - Say \"Search for cats\"\n📱 Launch apps - Say \"Open calculator\"\n🌤️ Weather - Say \"Weather in Paris\"\n⏰ Time - Say \"What time is it?\"\n💻 System - Say \"System info\"\n💬 Chat - Just talk to me!\n\nWhat would you like to do?";
  }
  
  // Thanks
  if (/thank(s| you)|thx|thanks|appreciate/i.test(m)) {
    const t = ["You're welcome! 😊", "Happy to help!", "No problem at all!", "Anytime! That's what I'm here for."];
    return t[Math.floor(Math.random() * t.length)];
  }
  
  // Goodbye
  if (/^(bye|goodbye|see\s*(you|ya|u)|cya|later|peace)[!.]*$/i.test(m)) {
    return "Goodbye! Have a great day. I'll be here when you need me.";
  }
  
  // Time-based greetings
  if (/good\s+(morning|afternoon|evening|night)/i.test(m)) {
    const t = m.match(/good\s+(morning|afternoon|evening|night)/i)[1];
    return `Good ${t}! How can I assist you?`;
  }
  
  // Jokes
  if (/joke|funny|make\s+me\s+laugh|lol|haha/i.test(m)) {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything! 😄",
      "Why did the developer go broke? Because he used up all his cache! 💻",
      "What's a computer's favorite beat? An algo-rhythm! 🎵",
      "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
      "How many programmers does it take to change a light bulb? None, that's a hardware problem! 💡"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  
  // How old
  if (/how\s+old|your\s+age/i.test(m)) return "I was born when you started me up! Every restart is a rebirth. 😄";
  
  // Creator
  if (/who\s+(made|created|built|developed)\s+you/i.test(m)) return "I was created by a developer who wanted to make device control easier and more intuitive!";
  
  // Love
  if (/love\s+you|ily|i\s+love\s+you/i.test(m)) return "Thank you! I'm here to make your life easier. ❤️";
  
  // Feelings
  if (/(i('?m| am)\s+)?(sad|upset|depressed|unhappy|lonely|bored|tired)/i.test(m)) {
    return "I understand. Sometimes we all have those days. Want to talk about it, or would you like me to help distract you? I can play music, show you something funny, or just listen.";
  }
  
  // Name
  if (/what('?s| is)\s+my\s+name/i.test(m)) return "I don't know your name yet, but I'd love to learn more about you!";
  
  // Meaning of life
  if (/meaning\s+of\s+life/i.test(m)) return "42. Just kidding! The meaning of life is what you make of it. For me, it's helping you!";
  
  // Yes/No responses
  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine)[!.]*$/i.test(m)) return "Great! What would you like to do?";
  if (/^(no|nope|nah|not really)[!.]*$/i.test(m)) return "Okay, no problem. Let me know if you need anything!";
  
  // Default conversational responses
  const defaults = [
    "Interesting! Tell me more about that.",
    "I see. How can I help you with that?",
    "That's fascinating! What else is on your mind?",
    "I'm here to help. What would you like to do?",
    "Got it. Is there something specific you need?",
    "I understand. Let me know if you need anything!",
    "Cool! Would you like me to search for more information?",
    "Noted! Feel free to ask me anything."
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ============ EXECUTE COMMAND ============
function executeAction(action, value) {
  return new Promise((resolve) => {
    if (!action) return resolve('Done');
    let cmd = '';
    
    if (action === 'open') {
      cmd = process.platform === 'win32' ? `start "" "${value}"` :
            process.platform === 'darwin' ? `open "${value}"` : 
            `xdg-open "${value}"`;
    } else if (action === 'search') {
      const url = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
      cmd = process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    } else if (action === 'app') {
      cmd = value;
    } else if (action === 'system') {
      cmd = value;
    }
    
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      resolve(err ? `Error: ${stderr || err.message}` : (stdout || 'Completed'));
    });
  });
}

// ============ MAIN AGENT ENDPOINT ============
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
    
    console.log(`\n📩 Input: "${message}"`);
    
    // Process the message
    const result = processMessage(message);
    console.log(`🤖 Type: ${result.type}, Response: ${result.message}`);
    
    let execResult = '';
    
    // Execute if it's a command
    if (result.type === 'command' && result.action) {
      execResult = await executeAction(result.action, result.value);
      console.log(`✅ Execution: ${execResult}`);
    }
    
    // Save to history
    const history = readJSON('history.json');
    history.push({
      userId: req.userId,
      input: message,
      type: result.type,
      response: result.message,
      action: result.action || null,
      value: result.value || null,
      result: execResult || null,
      timestamp: new Date().toISOString()
    });
    writeJSON('history.json', history);
    
    res.json({
      success: true,
      type: result.type,
      message: result.message,
      result: execResult || undefined
    });
    
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.get('/api/history', auth, (req, res) => {
  const history = readJSON('history.json')
    .filter(h => h.userId === req.userId)
    .slice(-100)
    .reverse();
  res.json({ history });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════╗`);
  console.log(`║   🤖 AI Agent Ready         ║`);
  console.log(`║   http://localhost:${PORT}      ║`);
  console.log(`╚══════════════════════════════╝\n`);
});
