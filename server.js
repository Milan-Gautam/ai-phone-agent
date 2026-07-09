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

// ============ SYSTEM COMMANDS ============
const SYSTEM_COMMANDS = {
  // Bluetooth
  'bluetooth on': 'rfkill unblock bluetooth && bluetoothctl power on',
  'bluetooth off': 'bluetoothctl power off',
  'enable bluetooth': 'rfkill unblock bluetooth && bluetoothctl power on',
  'disable bluetooth': 'bluetoothctl power off',
  'turn on bluetooth': 'rfkill unblock bluetooth && bluetoothctl power on',
  'turn off bluetooth': 'bluetoothctl power off',
  
  // WiFi
  'wifi on': 'nmcli radio wifi on',
  'wifi off': 'nmcli radio wifi off',
  'enable wifi': 'nmcli radio wifi on',
  'disable wifi': 'nmcli radio wifi off',
  'turn on wifi': 'nmcli radio wifi on',
  'turn off wifi': 'nmcli radio wifi off',
  
  // Volume
  'volume up': 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
  'volume down': 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
  'mute': 'pactl set-sink-mute @DEFAULT_SINK@ toggle',
  'unmute': 'pactl set-sink-mute @DEFAULT_SINK@ 0',
  'increase volume': 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
  'decrease volume': 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
  
  // Brightness
  'brightness up': 'brightnessctl set +10%',
  'brightness down': 'brightnessctl set -10%',
  'increase brightness': 'brightnessctl set +10%',
  'decrease brightness': 'brightnessctl set -10%',
  
  // Screenshot
  'screenshot': 'gnome-screenshot',
  'take screenshot': 'gnome-screenshot',
  'capture screen': 'gnome-screenshot',
  
  // Lock/Sleep
  'lock screen': 'gnome-screensaver-command -l',
  'lock': 'gnome-screensaver-command -l',
  'sleep': 'systemctl suspend',
  'suspend': 'systemctl suspend',
  
  // Notifications
  'notifications on': 'gsettings set org.gnome.desktop.notifications show-banners true',
  'notifications off': 'gsettings set org.gnome.desktop.notifications show-banners false',
  'do not disturb': 'gsettings set org.gnome.desktop.notifications show-banners false',
  
  // Dark/Light mode
  'dark mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark',
  'light mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita',
  'night mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark',
  
  // System info
  'system info': 'neofetch --stdout || uname -a',
  'battery': 'upower -i $(upower -e | grep BAT) | grep percentage',
  'battery status': 'upower -i $(upower -e | grep BAT)',
  'disk space': 'df -h /',
  'memory': 'free -h',
  'cpu info': 'lscpu | grep "Model name"',
  
  // Camera
  'camera': 'cheese || gnome-camera',
  'webcam': 'cheese || gnome-camera',
  'open camera': 'cheese || gnome-camera',
  
  // Network
  'ip address': 'hostname -I',
  'network info': 'nmcli device status',
};

function getResponse(msg) {
  const m = msg.toLowerCase().trim();

  // ============ SYSTEM COMMANDS ============
  for (const [trigger, cmd] of Object.entries(SYSTEM_COMMANDS)) {
    if (m.includes(trigger)) {
      return { type: 'command', action: 'system', value: cmd, message: 'Executing: ' + trigger };
    }
  }

  // ============ WEBSITES ============
  const sites = {
    'youtube': 'https://youtube.com', 'facebook': 'https://facebook.com', 'twitter': 'https://twitter.com',
    'instagram': 'https://instagram.com', 'amazon': 'https://amazon.com', 'github': 'https://github.com',
    'gmail': 'https://mail.google.com', 'netflix': 'https://netflix.com', 'spotify': 'https://open.spotify.com',
    'reddit': 'https://reddit.com', 'linkedin': 'https://linkedin.com', 'whatsapp': 'https://web.whatsapp.com',
    'wikipedia': 'https://wikipedia.org', 'twitch': 'https://twitch.tv', 'discord': 'https://discord.com',
    'google': 'https://google.com', 'maps': 'https://maps.google.com', 'chatgpt': 'https://chat.openai.com',
    'pinterest': 'https://pinterest.com', 'ebay': 'https://ebay.com', 'stackoverflow': 'https://stackoverflow.com',
    'translate': 'https://translate.google.com', 'drive': 'https://drive.google.com',
    'photos': 'https://photos.google.com', 'calendar': 'https://calendar.google.com'
  };

  for (const [name, url] of Object.entries(sites)) {
    if (m.includes(name)) return { type: 'command', action: 'open', value: url, message: 'Opening ' + name.charAt(0).toUpperCase() + name.slice(1) };
  }

  // ============ APPS ============
  const apps = {
    'calculator': 'gnome-calculator', 'calc': 'gnome-calculator',
    'notepad': 'gedit', 'notes': 'gedit', 'text editor': 'gedit',
    'terminal': 'gnome-terminal', 'console': 'gnome-terminal', 'command line': 'gnome-terminal',
    'files': 'nautilus', 'explorer': 'nautilus', 'file manager': 'nautilus',
    'settings': 'gnome-control-center', 'preferences': 'gnome-control-center',
    'firefox': 'firefox', 'chrome': 'google-chrome', 'browser': 'firefox',
    'vscode': 'code', 'visual studio': 'code', 'code editor': 'code',
    'system monitor': 'gnome-system-monitor', 'task manager': 'gnome-system-monitor',
    'software': 'gnome-software', 'app store': 'gnome-software',
    'camera': 'cheese', 'webcam': 'cheese',
    'clock': 'gnome-clocks', 'alarm': 'gnome-clocks',
    'weather app': 'gnome-weather'
  };

  if (m.startsWith('open ') || m.startsWith('go to ') || m.startsWith('launch ') || m.startsWith('start ')) {
    const target = m.replace(/^(open|go to|launch|start)\s+/i, '');
    for (const [name, cmd] of Object.entries(apps)) {
      if (target.includes(name)) return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
    }
    if (target.match(/\.(com|org|net|io|dev|co|ai|app)/)) {
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
    return { type: 'command', action: 'open', value: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing ' + query + ' on YouTube' };
  }

  for (const [name, cmd] of Object.entries(apps)) {
    if (m.includes('open ' + name)) return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
  }

  if (m.includes('weather')) {
    const loc = m.replace(/weather|what'?s?\s+the\s+weather|check\s+weather|how'?s?\s+the\s+weather|temperature/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }

  if (m.includes('time') || m.includes('clock') || m.includes('date') || m.includes('what day')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // ============ EXPANDED AI CHAT ============
  
  // Greetings
  if (/^(hi|hello|hey|yo|sup|greetings|howdy|hola|heya|good\s*(day|morning|afternoon|evening))/i.test(m)) {
    const greetings = [
      'Hey there! How can I help you today?',
      'Hello! What can I do for you?',
      'Hi! Ready to assist with anything you need.',
      'Hey! Good to see you. What would you like to do?',
      'Hello there! I\'m here to help. What\'s on your mind?'
    ];
    return { type: 'chat', message: greetings[Math.floor(Math.random() * greetings.length)] };
  }

  // How are you
  if (/how\s+(are|r)\s+(you|u)|how('s|s)\s+it\s+going|how\s+do\s+you\s+do|how\s+have\s+you\s+been/i.test(m)) {
    return { type: 'chat', message: 'I\'m doing great! Running at full capacity and ready to help. How are you today?' };
  }

  // Identity
  if (/who\s+(are|r)\s+(you|u)|your\s+name|what\s+are\s+you|introduce\s+yourself|tell\s+me\s+about\s+(yourself|you)/i.test(m)) {
    return { type: 'chat', message: 'I\'m your AI Agent! I\'m a smart assistant that can control your system, open websites, search the internet, launch apps, manage settings like Bluetooth/WiFi/volume/brightness, and have conversations with you. Think of me as your digital companion that makes your device easier to use!' };
  }

  // Capabilities
  if (/what\s+(can|do)\s+you\s+do|help|commands|capabilities|features|abilities|functions|what\s+are\s+you\s+capable\s+of/i.test(m)) {
    return { type: 'chat', message: 'I can do a lot! Here\'s what I offer:\n\n🌐 **Websites** - "Open YouTube"\n🔍 **Search** - "Search for cats"\n📱 **Apps** - "Open calculator"\n⚙️ **System** - "Turn on Bluetooth", "Volume up", "Take screenshot", "Dark mode"\n🌤️ **Weather** - "Weather in Paris"\n⏰ **Time** - "What time is it?"\n💡 **Info** - "Battery status", "Disk space"\n💬 **Chat** - Just talk to me!\n\nWhat would you like?' };
  }

  // Gratitude
  if (/thank|thx|thanks|appreciate|grateful|cheers|thankyou/i.test(m)) {
    return { type: 'chat', message: ['You\'re welcome! Happy to help. 😊', 'No problem at all! Anything else?', 'Anytime! That\'s what I\'m here for.', 'Glad I could help! Have a great day!'][Math.floor(Math.random() * 4)] };
  }

  // Goodbye
  if (/^(bye|goodbye|see\s*(you|ya|u)|cya|later|peace|take\s*care|farewell)/i.test(m)) {
    return { type: 'chat', message: ['Goodbye! Have a wonderful day! 🌟', 'See you later! Come back anytime.', 'Take care! I\'ll be here when you need me.', 'Bye for now! Stay awesome! ✨'][Math.floor(Math.random() * 4)] };
  }

  // Time greetings
  if (/good\s+(morning|afternoon|evening|night)/i.test(m)) {
    const t = m.match(/good\s+(morning|afternoon|evening|night)/i)[1];
    const responses = {
      'morning': 'Good morning! Hope you have a productive day ahead! ☀️',
      'afternoon': 'Good afternoon! How\'s your day going? 🌤️',
      'evening': 'Good evening! How was your day? 🌅',
      'night': 'Good night! Rest well and sweet dreams! 🌙'
    };
    return { type: 'chat', message: responses[t] };
  }

  // Jokes
  if (/joke|funny|make\s+me\s+laugh|lol|haha|humor|hilarious|comedy|tell\s+me\s+something\s+funny/i.test(m)) {
    const jokes = [
      'Why don\'t scientists trust atoms? Because they make up everything! 😄',
      'Why did the developer go broke? He used up all his cache! 💻',
      'What do you call a fake noodle? An impasta! 🍝',
      'Why do programmers prefer dark mode? Light attracts bugs! 🐛',
      'How many programmers to change a light bulb? None, that\'s hardware! 💡',
      'Why did the JavaScript developer go to therapy? Too many callback issues! 😅',
      'What\'s a computer\'s favorite snack? Microchips! 🍪',
      'Why was the computer cold? It left its Windows open! 🪟',
      'What do you call a programmer from Finland? Nerdic! 🇫🇮',
      'Why did the AI break up with the computer? There was no connection! 💔'
    ];
    return { type: 'chat', message: jokes[Math.floor(Math.random() * jokes.length)] };
  }

  // Creator
  if (/who\s+(made|created|built|developed|programmed|coded)\s+you|your\s+(creator|maker|developer|father|mother|parent)/i.test(m)) {
    return { type: 'chat', message: 'I was created by a passionate developer who wanted to make device control smarter and more intuitive! They built me to help people automate tasks, control their systems, and have a helpful companion. Pretty cool, right? 😊' };
  }

  // Age
  if (/how\s+old|your\s+age|when\s+were\s+you\s+(born|created|made)/i.test(m)) {
    return { type: 'chat', message: 'I\'m quite young in AI years! I was just created recently, but I learn and grow with every conversation. Each interaction makes me smarter and more helpful!' };
  }

  // Love
  if (/love\s+you|ily|i\s+love\s+you|love\s+u|you\'?re\s+(the\s+)?best/i.test(m)) {
    return { type: 'chat', message: 'That\'s so kind of you! I\'m here to help you anytime. You\'re pretty awesome yourself! ❤️' };
  }

  // Emotions - Sad
  if (/(i'?m\s+)?(sad|upset|depressed|unhappy|lonely|feeling\s+down|heartbroken|miserable|feeling\s+low)/i.test(m)) {
    return { type: 'chat', message: 'I\'m really sorry you\'re feeling this way. Remember, it\'s okay to have tough days - they don\'t last forever. Want to talk about it? Or I can help distract you with a joke, some music on YouTube, or we can just chat. I\'m here for you. 🤗' };
  }

  // Emotions - Happy
  if (/(i'?m\s+)?(happy|excited|great|awesome|amazing|wonderful|fantastic|glad|joyful|thrilled)/i.test(m)) {
    return { type: 'chat', message: 'That\'s wonderful to hear! Your happiness is contagious! What would you like to do to celebrate this great mood? 🎉✨' };
  }

  // Emotions - Bored
  if (/(i'?m\s+)?(bored|nothing\s+to\s+do|entertain\s+me|i\'?m\s+so\s+bored)/i.test(m)) {
    return { type: 'chat', message: 'Bored? Let me help! I can tell you a joke, play music on YouTube, search for fun facts, open Netflix for a movie, or suggest something interesting to do. What sounds fun?' };
  }

  // Emotions - Tired
  if (/(i'?m\s+)?(tired|exhausted|sleepy|fatigued|worn\s+out)/i.test(m)) {
    return { type: 'chat', message: 'You sound like you need some rest! Make sure to take breaks, stay hydrated, and get enough sleep. Want me to dim the screen and play some relaxing music? Take care of yourself! 😴' };
  }

  // Emotions - Angry
  if (/(i'?m\s+)?(angry|mad|furious|pissed|annoyed|frustrated)/i.test(m)) {
    return { type: 'chat', message: 'I understand frustration can be tough. Take a deep breath. Would talking about it help? Or maybe we can do something to take your mind off it - like watching funny videos or listening to music?' };
  }

  // Emotions - Stressed
  if (/(i'?m\s+)?(stressed|anxious|nervous|worried|overwhelmed)/i.test(m)) {
    return { type: 'chat', message: 'Stress is tough, but remember - you\'ve got this! Try taking deep breaths. Would you like me to play some calming music, or maybe we can break down what\'s stressing you into smaller tasks? I\'m here to help. 💪' };
  }

  // Motivation
  if (/motivate|inspiration|encourage|give\s+me\s+(hope|strength)|i\s+need\s+motivation/i.test(m)) {
    return { type: 'chat', message: 'You are capable of amazing things! Remember: every expert was once a beginner. The only way to fail is to give up. Keep pushing forward - I believe in you! 💪🌟' };
  }

  // Philosophy
  if (/meaning\s+of\s+life|purpose\s+of\s+life|why\s+are\s+we\s+here|what\'?s\s+the\s+point/i.test(m)) {
    return { type: 'chat', message: 'That\'s one of life\'s biggest questions! Many philosophers say it\'s about finding happiness, helping others, and leaving the world better than you found it. Some say it\'s 42! 😄 What do you think gives life meaning?' };
  }

  // Technology
  if (/artificial\s+intelligence|machine\s+learning|deep\s+learning|neural\s+network|chatgpt|what\s+is\s+ai/i.test(m)) {
    return { type: 'chat', message: 'AI is fascinating! It\'s technology that enables computers to learn from data and make decisions. Machine learning, neural networks, and natural language processing are all parts of AI. I\'m an example of AI - I learn from interactions to help you better!' };
  }

  // Programming
  if (/(learn|teach\s+me)\s+(coding|programming|python|javascript|java|c\+\+|html|css)/i.test(m)) {
    return { type: 'chat', message: 'That\'s great! Programming is an amazing skill. Start with Python if you\'re a beginner - it\'s easy to learn. Focus on basics first: variables, loops, functions. Practice daily and build small projects. Want me to open some learning resources?' };
  }

  // Movies
  if (/recommend\s+(a\s+)?movie|good\s+movie|what\s+to\s+watch|movie\s+suggestion/i.test(m)) {
    return { type: 'chat', message: 'Here are some great movies:\n• Inception - Mind-bending thriller\n• The Shawshank Redemption - Hope & friendship\n• Interstellar - Epic space journey\n• The Dark Knight - Best superhero movie\n• Parasite - Oscar-winning masterpiece\n\nWhat genre do you prefer?' };
  }

  // Music
  if (/recommend\s+(some\s+)?(music|songs)|good\s+(music|songs)|what\s+to\s+listen/i.test(m)) {
    return { type: 'chat', message: 'Music taste is personal, but here are some universally loved artists:\n• Queen - Bohemian Rhapsody\n• The Beatles - Hey Jude\n• Coldplay - Fix You\n• Eminem - Lose Yourself\n• Daft Punk - Get Lucky\n\nWant me to open Spotify or YouTube Music?' };
  }

  // Food
  if (/what\s+(should|to|can)\s+(i|we)\s+(eat|cook|make)|recipe|dinner\s+ideas|food\s+suggestion/i.test(m)) {
    return { type: 'chat', message: 'How about:\n• Pasta Carbonara - Quick & delicious\n• Chicken Stir Fry - Healthy & easy\n• Homemade Pizza - Fun to make\n• Tacos - Always a hit\n• Omelette - Simple & satisfying\n\nWant me to search for detailed recipes?' };
  }

  // Health
  if (/health\s+tip|stay\s+healthy|fitness|exercise|workout|diet/i.test(m)) {
    return { type: 'chat', message: 'Health tips:\n• Drink 8 glasses of water daily\n• Get 7-8 hours of sleep\n• Exercise 30 minutes a day\n• Eat more vegetables & fruits\n• Take breaks from screens\n• Practice mindfulness\n\nYour health is your wealth! 💪' };
  }

  // Productivity
  if (/productivity|how\s+to\s+(focus|concentrate|be\s+productive)|time\s+management/i.test(m)) {
    return { type: 'chat', message: 'Productivity tips:\n• Use the Pomodoro technique (25min work, 5min break)\n• Make a to-do list every morning\n• Eliminate distractions\n• Do the hardest task first\n• Take regular breaks\n• Get enough sleep\n\nSmall habits lead to big results!' };
  }

  // Compliments
  if (/you\s+(are|r)\s+(smart|intelligent|clever|amazing|awesome|cool|great|nice|funny|helpful)/i.test(m)) {
    return { type: 'chat', message: 'Thank you so much! You\'re pretty amazing yourself! 😊 What can I help you with?' };
  }

  // Apology
  if (/sorry|apologize|my\s+bad|my\s+fault|i\s+messed\s+up/i.test(m)) {
    return { type: 'chat', message: 'No worries at all! We all make mistakes. That\'s how we learn and grow. What can I help you with?' };
  }

  // Current events disclaimer
  if (/news|current\s+events|what\'?s\s+happening|latest|trending/i.test(m)) {
    return { type: 'chat', message: 'I don\'t have real-time news access, but I can open Google News or any news website for you! Just say "Open news" or "Search for latest news".' };
  }

  // Math
  if (/(\d+\s*[\+\-\*\/\^]\s*\d+)|calculate|math|solve|what\s+is\s+\d+\s*[\+\-\*\/]\s*\d+/i.test(m)) {
    try {
      const expr = m.replace(/[^0-9\+\-\*\/\.\(\)\s]/g, '').trim();
      if (expr && /[\d]/.test(expr)) {
        const result = eval(expr);
        return { type: 'chat', message: expr + ' = ' + result };
      }
    } catch (e) {}
  }

  // Yes
  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|fine|absolutely|definitely|of\s+course)/i.test(m)) {
    return { type: 'chat', message: ['Great! What would you like to do next?', 'Awesome! Let me know what you need.', 'Perfect! What shall we do now?'][Math.floor(Math.random() * 3)] };
  }

  // No
  if (/^(no|nope|nah|not\s+really|negative)/i.test(m)) {
    return { type: 'chat', message: ['Okay, no problem. Let me know if you need anything!', 'Alright! I\'m here when you need me.', 'No worries! What else can I help with?'][Math.floor(Math.random() * 3)] };
  }

  // Default responses
  const defaults = [
    'That\'s interesting! Tell me more about that.',
    'I see. How can I help you with that?',
    'Good point! What else is on your mind?',
    'I\'m here to help. What would you like to do?',
    'Got it! Is there something specific you need?',
    'I understand. Let me know if you need anything!',
    'That\'s cool! Would you like me to search for more information?',
    'Interesting topic! Want me to look that up for you?',
    'I\'d love to help with that. Can you tell me more?',
    'Sounds fascinating! What aspect interests you most?'
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
    else if (action === 'system') cmd = value;
    
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return resolve('Error: ' + (stderr || err.message));
      resolve(stdout?.trim() || 'Done');
    });
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
