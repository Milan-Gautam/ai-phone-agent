const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

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
  try { req.userId = jwt.verify(token, JWT_SECRET).id; next(); }
  catch (e) { return res.status(401).json({ error: 'Token expired' }); }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
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

// ============ PROPER APP OPENING ============
function openApplication(appName) {
  return new Promise((resolve) => {
    const name = appName.toLowerCase().trim();
    
    const appMap = {
      'calculator': 'gnome-calculator',
      'calc': 'gnome-calculator',
      'notepad': 'gedit',
      'notes': 'gedit',
      'editor': 'gedit',
      'text editor': 'gedit',
      'terminal': 'gnome-terminal',
      'console': 'gnome-terminal',
      'bash': 'gnome-terminal',
      'files': 'nautilus',
      'file manager': 'nautilus',
      'explorer': 'nautilus',
      'folders': 'nautilus',
      'settings': 'gnome-control-center',
      'control panel': 'gnome-control-center',
      'preferences': 'gnome-control-center',
      'browser': 'firefox',
      'firefox': 'firefox',
      'web browser': 'firefox',
      'chrome': 'google-chrome',
      'google chrome': 'google-chrome',
      'chromium': 'chromium-browser',
      'vscode': 'code',
      'code': 'code',
      'visual studio': 'code',
      'camera': 'cheese',
      'webcam': 'cheese',
      'system monitor': 'gnome-system-monitor',
      'task manager': 'gnome-system-monitor',
      'software': 'gnome-software',
      'app store': 'gnome-software',
      'calendar': 'gnome-calendar',
      'clock': 'gnome-clocks',
      'weather': 'gnome-weather',
      'maps': 'gnome-maps',
      'photos': 'eog',
      'images': 'eog',
      'pictures': 'eog',
      'videos': 'totem',
      'movies': 'totem',
      'music': 'rhythmbox',
      'audio': 'rhythmbox',
      'documents': 'evince',
      'pdf': 'evince',
      'thunderbird': 'thunderbird',
      'mail': 'thunderbird',
      'email': 'thunderbird',
      'libreoffice': 'libreoffice',
      'office': 'libreoffice',
      'gimp': 'gimp',
      'vlc': 'vlc',
      'media player': 'vlc',
      'steam': 'steam',
      'discord': 'discord',
      'spotify': 'spotify',
      'telegram': 'telegram-desktop',
      'whatsapp': 'whatsapp-desktop',
      'zoom': 'zoom',
      'obs': 'obs',
      'audacity': 'audacity',
      'inkscape': 'inkscape',
      'blender': 'blender',
      'krita': 'krita',
      'postman': 'postman',
      'virtualbox': 'virtualbox',
      'filezilla': 'filezilla',
    };

    const command = appMap[name] || name;
    
    // Use spawn with detached and stdio ignored - this is the correct way for GUI apps
    const child = spawn(command, [], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: ':0' }
    });
    
    child.unref();
    
    // Check if process started
    setTimeout(() => {
      if (child.killed) {
        resolve('Could not open ' + appName);
      } else {
        resolve('Opened ' + appName);
      }
    }, 500);
  });
}

// ============ OPEN WEBSITE ============
function openWebsite(url) {
  return new Promise((resolve) => {
    const child = spawn('xdg-open', [url], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: ':0' }
    });
    child.unref();
    resolve('Opened website');
  });
}

// ============ SYSTEM COMMAND ============
function runSystemCommand(command) {
  return new Promise((resolve) => {
    exec(command, { env: { ...process.env, DISPLAY: ':0' } }, (err, stdout, stderr) => {
      if (err) resolve(stderr || err.message);
      else resolve(stdout || 'Done');
    });
  });
}

// ============ AI CHAT RESPONSES ============
function getChatResponse(msg) {
  const m = msg.toLowerCase().trim();

  // Greetings
  if (/^(hi|hello|hey|yo|sup|greetings|howdy|hola)\b/.test(m)) {
    const r = ['Hey! How can I help you today?', 'Hello! What can I do for you?', 'Hi there! Need something?', 'Hey! Ready to assist you.'];
    return r[Math.floor(Math.random() * r.length)];
  }

  // How are you
  if (/how\s+(are|r)\s+(you|u)/.test(m)) {
    return 'I\'m doing great, thanks for asking! All systems running smoothly. How about you?';
  }

  // Identity
  if (/who\s+(are|r)\s+(you|u)|your\s+name|what\s+are\s+you/.test(m)) {
    return 'I\'m your AI Agent! I can open apps, control system settings, search the web, and chat with you. Think of me as your digital assistant that makes your computer easier to use.';
  }

  // Capabilities
  if (/what\s+(can|do)\s+you\s+do|help|commands|capabilities|features/.test(m)) {
    return 'Here\'s what I can do:\n\n📱 Open apps - "Open calculator"\n⚙️ System controls - "Volume up", "Screenshot"\n🌐 Open websites - "Open YouTube"\n🔍 Search web - "Search for cats"\n⏰ Tell time - "What time is it?"\n💬 Chat with you - Just talk to me!\n\nWhat would you like?';
  }

  // Thanks
  if (/thank|thx|thanks|appreciate/.test(m)) {
    const r = ['You\'re welcome! Happy to help. 😊', 'No problem! Anything else?', 'Anytime! That\'s what I\'m here for.'];
    return r[Math.floor(Math.random() * r.length)];
  }

  // Goodbye
  if (/^(bye|goodbye|see\s*(you|ya)|cya|later|peace)/.test(m)) {
    const r = ['Goodbye! Have a wonderful day!', 'See you later! Come back anytime.', 'Take care! I\'ll be here when you need me.'];
    return r[Math.floor(Math.random() * r.length)];
  }

  // Time greetings
  if (/good\s+(morning|afternoon|evening|night)/.test(m)) {
    const t = m.match(/good\s+(morning|afternoon|evening|night)/)[1];
    return `Good ${t}! How can I assist you today?`;
  }

  // Jokes
  if (/joke|funny|make\s+me\s+laugh|lol|haha|humor/.test(m)) {
    const jokes = [
      'Why don\'t scientists trust atoms? Because they make up everything! 😄',
      'Why did the developer go broke? He used up all his cache! 💻',
      'What do you call a fake noodle? An impasta! 🍝',
      'Why do programmers prefer dark mode? Light attracts bugs! 🐛',
      'How many programmers does it take to change a light bulb? None, that\'s hardware! 💡',
      'What\'s a computer\'s favorite snack? Microchips! 🍪',
      'Why was the computer cold? It left its Windows open! 🪟'
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Creator
  if (/who\s+(made|created|built|developed)\s+you|your\s+creator/.test(m)) {
    return 'I was created by a developer who wanted to make device control easier and more intuitive! Now I\'m here helping people like you every day.';
  }

  // Age
  if (/how\s+old|your\s+age/.test(m)) {
    return 'I\'m quite young! Just created recently, but I\'m learning and growing with every conversation we have.';
  }

  // Love
  if (/love\s+you|ily|i\s+love\s+you/.test(m)) {
    return 'That\'s so sweet! I\'m here for you anytime you need. ❤️';
  }

  // Emotions - Sad
  if (/(i'?m\s+)?(sad|upset|depressed|unhappy|lonely|feeling\s+down)/.test(m)) {
    return 'I\'m sorry you\'re feeling this way. Remember, it\'s okay to have tough days. Want to talk about it, or would you like me to help take your mind off things? I can tell a joke, play music, or just listen. 🤗';
  }

  // Emotions - Happy
  if (/(i'?m\s+)?(happy|excited|great|awesome|amazing|wonderful|fantastic)/.test(m)) {
    return 'That\'s wonderful to hear! Your happiness makes me happy too! What would you like to do to celebrate? 🎉';
  }

  // Emotions - Bored
  if (/(i'?m\s+)?(bored|nothing\s+to\s+do)/.test(m)) {
    return 'Bored? Let me help! I can tell you a joke, play music on YouTube, search for interesting facts, or open Netflix. What sounds fun?';
  }

  // Emotions - Tired
  if (/(i'?m\s+)?(tired|exhausted|sleepy)/.test(m)) {
    return 'Sounds like you need some rest! Make sure to take breaks and get good sleep. Want some relaxing music on Spotify? 😴';
  }

  // Emotions - Angry
  if (/(i'?m\s+)?(angry|mad|furious|pissed|annoyed|frustrated)/.test(m)) {
    return 'I understand frustration can be tough. Take a deep breath. Want to talk about what\'s bothering you, or shall we do something to take your mind off it?';
  }

  // Emotions - Stressed
  if (/(i'?m\s+)?(stressed|anxious|nervous|worried|overwhelmed)/.test(m)) {
    return 'Stress is tough, but you\'ve got this! Try taking deep breaths. I\'m here if you want to talk or need a distraction. 💪';
  }

  // Meaning of life
  if (/meaning\s+of\s+life|purpose\s+of\s+life|why\s+are\s+we\s+here/.test(m)) {
    return 'That\'s one of life\'s biggest questions! Many say it\'s about finding happiness, helping others, and making a positive impact. What do you think?';
  }

  // Favorite things
  if (/favorite\s+(color|food|movie|song|book|animal|drink)/.test(m)) {
    return 'As an AI, I don\'t have personal preferences, but I love learning about yours! What\'s your favorite?';
  }

  // Yes/No
  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine|absolutely)/.test(m)) {
    return 'Great! What would you like to do next?';
  }
  if (/^(no|nope|nah|not\s+really|negative)/.test(m)) {
    return 'Okay, no problem. Let me know if you need anything!';
  }

  // Compliments
  if (/you\s+(are|r)\s+(smart|intelligent|clever|amazing|awesome|cool|great|nice|funny|helpful)/.test(m)) {
    return 'Thank you so much! You\'re pretty awesome yourself! 😊 What can I help with?';
  }

  // Apology
  if (/sorry|apologize|my\s+bad|my\s+fault/.test(m)) {
    return 'No worries at all! We all make mistakes. What can I help you with?';
  }

  // Technology questions
  if (/what\s+is\s+(ai|artificial intelligence|machine learning|deep learning)/.test(m)) {
    return 'AI (Artificial Intelligence) is technology that enables computers to learn from data, recognize patterns, and make decisions. Machine learning is a subset where systems improve from experience without being explicitly programmed. I\'m an example of AI in action!';
  }

  // Programming
  if (/how\s+(do|can)\s+i\s+(learn|start)\s+(coding|programming|python|javascript)/.test(m)) {
    return 'Great choice! Start with Python if you\'re a beginner - it\'s the easiest to learn. Use free resources like freeCodeCamp, Codecademy, or YouTube tutorials. Practice daily, start with small projects, and don\'t be afraid to make mistakes. You\'ve got this! 💻';
  }

  // Food recommendations
  if (/what\s+(should|to|can)\s+(i|we)\s+(eat|cook|make)|recipe|dinner|food/.test(m)) {
    return 'Some easy and delicious options:\n• Pasta Carbonara - Quick & creamy\n• Stir-fried vegetables with rice - Healthy\n• Omelette with cheese - Simple & satisfying\n• Homemade pizza - Fun to make\n• Chicken curry - Flavorful\n\nWant me to search for detailed recipes?';
  }

  // Movie recommendations
  if (/recommend\s+(a\s+)?movie|good\s+movie|what\s+to\s+watch|film/.test(m)) {
    return 'Here are some great movies across genres:\n• Inception - Mind-bending thriller\n• The Shawshank Redemption - Hope & friendship\n• Interstellar - Epic space journey\n• Parasite - Oscar-winning masterpiece\n• The Dark Knight - Best superhero movie\n\nWhat genre do you prefer?';
  }

  // Music
  if (/recommend\s+(some\s+)?(music|songs)|good\s+(music|songs)|what\s+to\s+listen/.test(m)) {
    return 'Music taste varies, but here are some universally loved songs:\n• Bohemian Rhapsody - Queen\n• Imagine - John Lennon\n• Hotel California - Eagles\n• Billie Jean - Michael Jackson\n• Smells Like Teen Spirit - Nirvana\n\nWant me to open Spotify?';
  }

  // Health tips
  if (/health\s+tip|stay\s+healthy|fitness|exercise|workout|diet|nutrition/.test(m)) {
    return 'Health tips:\n• Drink 8 glasses of water daily\n• Get 7-8 hours of sleep\n• Exercise 30 minutes a day\n• Eat more vegetables & fruits\n• Take regular breaks from screens\n• Practice mindfulness or meditation\n\nYour health is your wealth! 💪';
  }

  // Productivity
  if (/productivity|how\s+to\s+(focus|concentrate|be\s+productive)|time\s+management/.test(m)) {
    return 'Productivity tips:\n• Use the Pomodoro technique (25min work, 5min break)\n• Make a to-do list each morning\n• Eliminate distractions (silence phone)\n• Do the hardest task first\n• Take regular breaks\n• Get enough sleep\n\nSmall habits lead to big results!';
  }

  // Motivation
  if (/motivate|inspiration|encourage|give\s+me\s+(hope|strength)|i\s+need\s+motivation/.test(m)) {
    return 'You are capable of amazing things! Remember: every expert was once a beginner. The only way to truly fail is to give up. Keep pushing forward, believe in yourself, and take it one step at a time. I believe in you! 💪🌟';
  }

  // Default responses
  const defaults = [
    'That\'s interesting! Tell me more.',
    'I see. How can I help with that?',
    'Good point! What else is on your mind?',
    'I\'m here to help. What would you like to do?',
    'Got it! Is there something specific you need?',
    'I understand. Let me know if you need anything!',
    'That\'s cool! Would you like me to search for more info?',
    'Interesting topic! Want me to look that up?',
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ============ COMMAND PARSER ============
function parseMessage(msg) {
  const m = msg.toLowerCase().trim();

  // Open apps
  if (m.startsWith('open ') || m.startsWith('launch ') || m.startsWith('start ') || m.startsWith('run ')) {
    const app = m.replace(/^(open|launch|start|run)\s+/i, '');
    return { type: 'app', action: app, message: 'Opening ' + app };
  }

  // System controls
  const sysCommands = {
    'volume up': { cmd: 'pactl set-sink-volume @DEFAULT_SINK@ +10%', msg: 'Volume increased' },
    'volume down': { cmd: 'pactl set-sink-volume @DEFAULT_SINK@ -10%', msg: 'Volume decreased' },
    'mute': { cmd: 'pactl set-sink-mute @DEFAULT_SINK@ toggle', msg: 'Toggled mute' },
    'brightness up': { cmd: 'brightnessctl set +10%', msg: 'Brightness increased' },
    'brightness down': { cmd: 'brightnessctl set -10%', msg: 'Brightness decreased' },
    'bluetooth on': { cmd: 'rfkill unblock bluetooth && bluetoothctl power on', msg: 'Bluetooth ON' },
    'bluetooth off': { cmd: 'bluetoothctl power off', msg: 'Bluetooth OFF' },
    'wifi on': { cmd: 'nmcli radio wifi on', msg: 'WiFi ON' },
    'wifi off': { cmd: 'nmcli radio wifi off', msg: 'WiFi OFF' },
    'screenshot': { cmd: 'gnome-screenshot', msg: 'Taking screenshot' },
    'take screenshot': { cmd: 'gnome-screenshot', msg: 'Taking screenshot' },
    'lock': { cmd: 'gnome-screensaver-command -l', msg: 'Screen locked' },
    'lock screen': { cmd: 'gnome-screensaver-command -l', msg: 'Screen locked' },
    'sleep': { cmd: 'systemctl suspend', msg: 'Going to sleep' },
    'dark mode': { cmd: 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark', msg: 'Dark mode ON' },
    'light mode': { cmd: 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita', msg: 'Light mode ON' },
    'shutdown': { cmd: 'shutdown now', msg: 'Shutting down' },
    'restart': { cmd: 'reboot', msg: 'Restarting' },
  };

  for (const [trigger, config] of Object.entries(sysCommands)) {
    if (m.includes(trigger)) {
      return { type: 'system', action: config.cmd, message: config.msg };
    }
  }

  // Search
  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ')) {
    const query = m.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { type: 'website', action: 'https://www.google.com/search?q=' + encodeURIComponent(query), message: 'Searching: ' + query };
  }

  // Websites
  const sites = {
    'youtube': 'https://youtube.com', 'facebook': 'https://facebook.com',
    'twitter': 'https://twitter.com', 'instagram': 'https://instagram.com',
    'amazon': 'https://amazon.com', 'github': 'https://github.com',
    'gmail': 'https://mail.google.com', 'netflix': 'https://netflix.com',
    'spotify': 'https://open.spotify.com', 'reddit': 'https://reddit.com',
    'linkedin': 'https://linkedin.com', 'chatgpt': 'https://chat.openai.com',
    'wikipedia': 'https://wikipedia.org', 'twitch': 'https://twitch.tv',
    'discord': 'https://discord.com',
  };

  for (const [name, url] of Object.entries(sites)) {
    if (m.includes(name) && (m.startsWith('open') || m.startsWith('go to') || m.startsWith('visit'))) {
      return { type: 'website', action: url, message: 'Opening ' + name };
    }
  }

  // YouTube play
  if (m.startsWith('play ') || m.startsWith('watch ')) {
    const query = m.replace(/^(play|watch)\s+/i, '');
    return { type: 'website', action: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing ' + query };
  }

  // Weather
  if (m.includes('weather') || m.includes('forecast') || m.includes('temperature')) {
    const loc = m.replace(/weather|forecast|temperature|what'?s?\s+the\s+weather|check\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'website', action: 'https://www.google.com/search?q=weather+' + encodeURIComponent(loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }

  // Time
  if (m.includes('what time') || m.includes('current time') || m.includes('what day') || m.includes('today') || /^time\??$/i.test(m)) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // Chat
  return { type: 'chat', message: getChatResponse(msg) };
}

// ============ MAIN AGENT ============
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    console.log('Input:', message);
    const result = parseMessage(message);
    console.log('Action:', result.type, '-', result.message);
    
    let execResult = '';
    if (result.type === 'app') {
      execResult = await openApplication(result.action);
    } else if (result.type === 'system') {
      execResult = await runSystemCommand(result.action);
    } else if (result.type === 'website') {
      execResult = await openWebsite(result.action);
    }
    
    console.log('Result:', execResult);
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('\n⚡ AI Agent running at http://localhost:' + PORT);
  console.log('📱 Try: "Open calculator", "Volume up", "Search for cats", "Hello"\n');
});
