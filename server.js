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

function getResponse(msg) {
  const m = msg.toLowerCase().trim();

  // ============ 1. SYSTEM SETTINGS (Highest Priority) ============
  const systemActions = {
    // Bluetooth
    'bluetooth': { check: /bluetooth/i, actions: [
      { words: ['on', 'enable', 'turn on', 'start', 'connect'], cmd: 'rfkill unblock bluetooth && bluetoothctl power on', msg: 'Turning Bluetooth ON' },
      { words: ['off', 'disable', 'turn off', 'stop', 'disconnect'], cmd: 'bluetoothctl power off', msg: 'Turning Bluetooth OFF' },
      { words: ['toggle', 'switch'], cmd: 'bluetoothctl show | grep -q "Powered: yes" && bluetoothctl power off || bluetoothctl power on', msg: 'Toggling Bluetooth' }
    ]},
    // WiFi
    'wifi': { check: /wifi|wi-fi|wireless/i, actions: [
      { words: ['on', 'enable', 'turn on', 'start', 'connect'], cmd: 'nmcli radio wifi on', msg: 'Turning WiFi ON' },
      { words: ['off', 'disable', 'turn off', 'stop', 'disconnect'], cmd: 'nmcli radio wifi off', msg: 'Turning WiFi OFF' }
    ]},
    // Volume
    'volume': { check: /volume|sound|audio/i, actions: [
      { words: ['up', 'increase', 'higher', 'raise', 'louder'], cmd: 'pactl set-sink-volume @DEFAULT_SINK@ +10%', msg: 'Volume increased' },
      { words: ['down', 'decrease', 'lower', 'reduce', 'softer'], cmd: 'pactl set-sink-volume @DEFAULT_SINK@ -10%', msg: 'Volume decreased' },
      { words: ['mute', 'silent', 'quiet', 'off'], cmd: 'pactl set-sink-mute @DEFAULT_SINK@ 1', msg: 'Muted' },
      { words: ['unmute', 'on', 'sound on'], cmd: 'pactl set-sink-mute @DEFAULT_SINK@ 0', msg: 'Unmuted' }
    ]},
    // Brightness
    'brightness': { check: /brightness|screen brightness|display brightness/i, actions: [
      { words: ['up', 'increase', 'higher', 'raise', 'brighter'], cmd: 'brightnessctl set +10%', msg: 'Brightness increased' },
      { words: ['down', 'decrease', 'lower', 'reduce', 'dimmer'], cmd: 'brightnessctl set -10%', msg: 'Brightness decreased' }
    ]},
    // Screenshot
    'screenshot': { check: /screenshot|capture screen|screen shot|snap screen/i, actions: [
      { words: [], cmd: 'gnome-screenshot', msg: 'Taking screenshot' }
    ]},
    // Lock
    'lock': { check: /lock\s*(screen|computer|pc|device)?$/i, actions: [
      { words: [], cmd: 'gnome-screensaver-command -l', msg: 'Locking screen' }
    ]},
    // Sleep
    'sleep': { check: /sleep|suspend|hibernate/i, actions: [
      { words: [], cmd: 'systemctl suspend', msg: 'Putting system to sleep' }
    ]},
    // Dark/Light mode
    'dark mode': { check: /dark mode|night mode|dark theme/i, actions: [
      { words: [], cmd: 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark', msg: 'Switching to Dark Mode' }
    ]},
    'light mode': { check: /light mode|day mode|light theme/i, actions: [
      { words: [], cmd: 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita', msg: 'Switching to Light Mode' }
    ]},
    // Do Not Disturb
    'do not disturb': { check: /do not disturb|dnd|silence notifications/i, actions: [
      { words: ['on', 'enable', 'turn on'], cmd: 'gsettings set org.gnome.desktop.notifications show-banners false', msg: 'Do Not Disturb ON' },
      { words: ['off', 'disable', 'turn off'], cmd: 'gsettings set org.gnome.desktop.notifications show-banners true', msg: 'Do Not Disturb OFF' }
    ]},
    // Location
    'location': { check: /location|gps|location services/i, actions: [
      { words: ['on', 'enable', 'turn on', 'open', 'start'], cmd: 'gsettings set org.gnome.system.location enabled true', msg: 'Location services ON' },
      { words: ['off', 'disable', 'turn off', 'stop'], cmd: 'gsettings set org.gnome.system.location enabled false', msg: 'Location services OFF' },
      { words: [], cmd: 'gnome-maps || gnome-weather', msg: 'Opening location/maps' }
    ]},
    // Camera
    'camera': { check: /camera|webcam/i, actions: [
      { words: ['open', 'start', 'launch', 'on', 'enable'], cmd: 'cheese || gnome-camera || camorama', msg: 'Opening camera' },
      { words: ['off', 'close', 'stop'], cmd: 'pkill cheese || pkill camorama', msg: 'Closing camera' }
    ]},
    // Bluetooth devices
    'bluetooth devices': { check: /bluetooth devices|paired devices|bt devices/i, actions: [
      { words: [], cmd: 'bluetoothctl devices', msg: 'Listing Bluetooth devices' }
    ]},
    // Network info
    'network': { check: /network|ip address|internet status/i, actions: [
      { words: ['info', 'status', 'show', 'details'], cmd: 'nmcli device status', msg: 'Showing network info' },
      { words: ['ip', 'address'], cmd: 'hostname -I', msg: 'Showing IP address' }
    ]},
    // Battery
    'battery': { check: /battery|power|charge/i, actions: [
      { words: ['status', 'level', 'percentage', 'info', 'show'], cmd: 'upower -i $(upower -e | grep BAT) | grep -E "percentage|state|time"', msg: 'Checking battery' }
    ]},
    // Storage
    'storage': { check: /disk|storage|hard drive|space/i, actions: [
      { words: ['space', 'info', 'status', 'show', 'check'], cmd: 'df -h /', msg: 'Checking disk space' }
    ]},
    // Memory
    'memory': { check: /memory|ram|system memory/i, actions: [
      { words: ['info', 'status', 'show', 'check', 'usage'], cmd: 'free -h', msg: 'Checking memory' }
    ]},
    // System info
    'system info': { check: /system info|computer info|device info|about this (computer|pc|device)/i, actions: [
      { words: [], cmd: 'echo "OS: $(uname -o) | Kernel: $(uname -r) | CPU: $(lscpu | grep "Model name" | cut -d: -f2 | xargs) | RAM: $(free -h | grep Mem | awk "{print \$2}")"', msg: 'System Information' }
    ]},
    // Notifications
    'notifications': { check: /notifications/i, actions: [
      { words: ['on', 'enable', 'show'], cmd: 'gsettings set org.gnome.desktop.notifications show-banners true', msg: 'Notifications ON' },
      { words: ['off', 'disable', 'hide'], cmd: 'gsettings set org.gnome.desktop.notifications show-banners false', msg: 'Notifications OFF' }
    ]},
    // Power
    'power': { check: /power off|shutdown|restart|reboot|log off|sign out/i, actions: [
      { words: ['off', 'shutdown'], cmd: 'shutdown now', msg: 'Shutting down...' },
      { words: ['restart', 'reboot'], cmd: 'reboot', msg: 'Restarting...' },
      { words: ['log off', 'sign out', 'logout'], cmd: 'gnome-session-quit --no-prompt', msg: 'Logging off...' }
    ]},
  };

  // Check system actions
  for (const [key, config] of Object.entries(systemActions)) {
    if (config.check.test(m)) {
      // If specific action words found
      for (const action of config.actions) {
        if (action.words.length === 0 || action.words.some(w => m.includes(w))) {
          return { type: 'command', action: 'system', value: action.cmd, message: action.msg };
        }
      }
      // If no specific action matched, use first/default
      if (config.actions.length > 0 && config.actions[0].words.length === 0) {
        return { type: 'command', action: 'system', value: config.actions[0].cmd, message: config.actions[0].msg };
      }
    }
  }

  // ============ 2. APPS (Second Priority) ============
  const apps = {
    'calculator': { cmd: 'gnome-calculator', keywords: ['calculator', 'calc'] },
    'notepad': { cmd: 'gedit', keywords: ['notepad', 'notes', 'text editor', 'gedit'] },
    'terminal': { cmd: 'gnome-terminal', keywords: ['terminal', 'console', 'command line', 'bash', 'shell'] },
    'files': { cmd: 'nautilus', keywords: ['files', 'explorer', 'file manager', 'nautilus', 'folders', 'documents'] },
    'settings': { cmd: 'gnome-control-center', keywords: ['settings', 'preferences', 'control panel', 'configuration'] },
    'browser': { cmd: 'firefox', keywords: ['browser', 'firefox', 'web browser'] },
    'chrome': { cmd: 'google-chrome', keywords: ['chrome', 'google chrome'] },
    'vscode': { cmd: 'code', keywords: ['vscode', 'vs code', 'visual studio', 'code editor', 'ide'] },
    'system monitor': { cmd: 'gnome-system-monitor', keywords: ['system monitor', 'task manager', 'process monitor'] },
    'software': { cmd: 'gnome-software', keywords: ['software', 'app store', 'software center'] },
    'camera app': { cmd: 'cheese', keywords: ['camera app', 'cheese', 'webcam app'] },
    'clock': { cmd: 'gnome-clocks', keywords: ['clock app', 'alarms', 'timer', 'stopwatch'] },
    'weather app': { cmd: 'gnome-weather', keywords: ['weather app', 'gnome weather'] },
    'maps': { cmd: 'gnome-maps', keywords: ['maps app', 'gnome maps', 'navigation'] },
    'music player': { cmd: 'rhythmbox', keywords: ['music player', 'rhythmbox', 'audio player'] },
    'video player': { cmd: 'totem', keywords: ['video player', 'totem', 'media player', 'videos app'] },
    'image viewer': { cmd: 'eog', keywords: ['image viewer', 'photos app', 'picture viewer', 'eog'] },
    'document viewer': { cmd: 'evince', keywords: ['document viewer', 'pdf viewer', 'evince', 'pdf reader'] },
    'disk usage': { cmd: 'baobab', keywords: ['disk usage', 'disk analyzer', 'baobab', 'storage analyzer'] },
    'text editor': { cmd: 'gedit', keywords: ['text editor', 'gedit', 'editor'] },
    'screenshot tool': { cmd: 'gnome-screenshot --interactive', keywords: ['screenshot tool', 'screenshot app'] },
  };

  // Check if trying to open an app
  const openAppMatch = m.match(/^(open|launch|start|run)\s+(.+)/i);
  if (openAppMatch) {
    const target = openAppMatch[2];
    for (const [name, config] of Object.entries(apps)) {
      if (config.keywords.some(kw => target.includes(kw))) {
        return { type: 'command', action: 'app', value: config.cmd, message: 'Opening ' + name };
      }
    }
    // If "open" but not an app, check if it's a website request
    if (target.match(/\.(com|org|net|io|dev|co|ai|app|gov|edu)/)) {
      const url = target.startsWith('http') ? target : 'https://' + target;
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + target };
    }
    // Otherwise search
    return { type: 'command', action: 'search', value: target, message: 'Searching for: ' + target };
  }

  // Check for app keywords in the message
  for (const [name, config] of Object.entries(apps)) {
    for (const kw of config.keywords) {
      if (m.includes(kw) && (m.includes('open') || m.includes('launch') || m.includes('start') || m.includes('run') || m === kw)) {
        return { type: 'command', action: 'app', value: config.cmd, message: 'Opening ' + name };
      }
    }
  }

  // ============ 3. WEBSITES (Third Priority) ============
  const sites = {
    'youtube': 'https://youtube.com', 'facebook': 'https://facebook.com', 'twitter': 'https://twitter.com',
    'instagram': 'https://instagram.com', 'amazon': 'https://amazon.com', 'github': 'https://github.com',
    'gmail': 'https://mail.google.com', 'netflix': 'https://netflix.com', 'spotify': 'https://open.spotify.com',
    'reddit': 'https://reddit.com', 'linkedin': 'https://linkedin.com', 'whatsapp': 'https://web.whatsapp.com',
    'wikipedia': 'https://wikipedia.org', 'twitch': 'https://twitch.tv', 'discord': 'https://discord.com',
    'google': 'https://google.com', 'chatgpt': 'https://chat.openai.com',
    'pinterest': 'https://pinterest.com', 'ebay': 'https://ebay.com',
    'stackoverflow': 'https://stackoverflow.com', 'translate': 'https://translate.google.com',
    'drive': 'https://drive.google.com', 'photos': 'https://photos.google.com',
    'calendar': 'https://calendar.google.com', 'news': 'https://news.google.com',
    'meet': 'https://meet.google.com', 'classroom': 'https://classroom.google.com'
  };

  for (const [name, url] of Object.entries(sites)) {
    if (m.includes(name)) {
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + name.charAt(0).toUpperCase() + name.slice(1) };
    }
  }

  // ============ 4. SEARCH (Only when explicitly asked) ============
  if (m.startsWith('search ') || m.startsWith('find ') || m.startsWith('google ') || m.startsWith('look up ') || m.startsWith('look for ')) {
    const query = m.replace(/^(search|find|google|look up|look for)\s+(for\s+)?/i, '');
    return { type: 'command', action: 'search', value: query, message: 'Searching: ' + query };
  }

  // ============ 5. YOUTUBE PLAYBACK ============
  if (m.startsWith('play ') || m.startsWith('watch ') || m.startsWith('listen to ')) {
    const query = m.replace(/^(play|watch|listen to)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    return { type: 'command', action: 'open', value: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing ' + query };
  }

  // ============ 6. WEATHER ============
  if (m.includes('weather') || m.includes('temperature') || m.includes('forecast')) {
    const loc = m.replace(/weather|what'?s?\s+the\s+weather|check\s+weather|how'?s?\s+the\s+weather|temperature|forecast/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }

  // ============ 7. TIME/DATE ============
  if (/^(what\s+)?(time|clock|date|day)(\s+is\s+it)?\??$/i.test(m) || m.includes('what time') || m.includes('what day') || m.includes('current time') || m.includes('current date')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // ============ 8. CHAT RESPONSES ============
  if (/^(hi|hello|hey|yo|sup|greetings|howdy|hola|heya)\b/i.test(m)) {
    return { type: 'chat', message: ['Hey there! How can I help you?', 'Hello! What can I do for you?', 'Hi! Ready to assist.', 'Hey! What do you need?'][Math.floor(Math.random() * 4)] };
  }

  if (/how\s+(are|r)\s+(you|u)/i.test(m)) return { type: 'chat', message: 'I am great! Ready to help. How are you?' };
  
  if (/who\s+(are|r)\s+(you|u)|your\s+name|what\s+are\s+you/i.test(m)) {
    return { type: 'chat', message: 'I am your AI Agent! I can control system settings (Bluetooth, WiFi, volume, brightness), open apps, websites, and chat with you. What would you like me to do?' };
  }

  if (/what\s+(can|do)\s+you\s+do|help|commands/i.test(m)) {
    return { type: 'chat', message: 'I can:\n\n⚙️ **System** - Bluetooth, WiFi, volume, brightness, camera, location\n📱 **Apps** - Calculator, terminal, files, settings, browser\n🌐 **Websites** - YouTube, Facebook, GitHub, Gmail\n🔍 **Search** - Just say "search for..."\n💬 **Chat** - Talk to me!\n\nTry: "Turn on Bluetooth", "Open calculator", "Volume up"' };
  }

  if (/thank|thx|thanks/i.test(m)) return { type: 'chat', message: 'You\'re welcome! 😊' };
  if (/bye|goodbye|see you/i.test(m)) return { type: 'chat', message: 'Goodbye! Have a great day!' };
  if (/joke|funny/i.test(m)) return { type: 'chat', message: 'Why did the AI cross the road? To optimize the other side! 😄' };
  if (/love you|ily/i.test(m)) return { type: 'chat', message: 'Thank you! You\'re awesome too! ❤️' };
  
  // Default - respond with chat, don't search
  return { type: 'chat', message: 'I understand. You can ask me to:\n• "Open calculator" - to launch apps\n• "Turn on Bluetooth" - to control settings\n• "Search for cats" - to search the web\n• "Open YouTube" - to open websites\n\nWhat would you like to do?' };
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
      if (err) return resolve(stderr?.trim() || err.message);
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
