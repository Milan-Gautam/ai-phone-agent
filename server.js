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

// ============ COMMAND PARSER ============
function parseCommand(input) {
  const msg = input.trim();
  const lower = msg.toLowerCase();

  // 1. SEARCH COMMANDS (check first)
  if (lower.startsWith('search for ') || lower.startsWith('search ') || 
      lower.startsWith('find ') || lower.startsWith('google ')) {
    let query = lower.replace(/^(search for |search |find |google )/, '').trim();
    return { type: 'command', action: 'search', value: query, message: 'Searching for: ' + query };
  }

  // 2. OPEN APP COMMANDS
  const appMap = {
    'calculator': 'gnome-calculator',
    'calc': 'gnome-calculator',
    'notepad': 'gedit',
    'notes': 'gedit',
    'terminal': 'gnome-terminal',
    'console': 'gnome-terminal',
    'files': 'nautilus',
    'file manager': 'nautilus',
    'explorer': 'nautilus',
    'settings': 'gnome-control-center',
    'control panel': 'gnome-control-center',
    'firefox': 'firefox',
    'browser': 'firefox',
    'chrome': 'google-chrome',
    'vscode': 'code',
    'code': 'code',
    'camera': 'cheese',
    'webcam': 'cheese',
    'system monitor': 'gnome-system-monitor',
    'task manager': 'gnome-system-monitor'
  };

  const openAppMatch = lower.match(/^(open|launch|start|run) (.+)/);
  if (openAppMatch) {
    const target = openAppMatch[2];
    for (const [name, cmd] of Object.entries(appMap)) {
      if (target === name || target.includes(name)) {
        return { type: 'command', action: 'app', value: cmd, message: 'Opening ' + name };
      }
    }
    // If not an app, check if website
    if (target.includes('.')) {
      const url = target.startsWith('http') ? target : 'https://' + target;
      return { type: 'command', action: 'open', value: url, message: 'Opening ' + target };
    }
    // Otherwise search
    return { type: 'command', action: 'search', value: target, message: 'Searching for: ' + target };
  }

  // 3. WEBSITE COMMANDS
  const siteMap = {
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
    'wikipedia': 'https://wikipedia.org'
  };

  const openSiteMatch = lower.match(/^(open|go to|visit) (.+)/);
  if (openSiteMatch) {
    const target = openSiteMatch[2];
    for (const [name, url] of Object.entries(siteMap)) {
      if (target === name || target.includes(name)) {
        return { type: 'command', action: 'open', value: url, message: 'Opening ' + name };
      }
    }
  }

  // 4. SYSTEM COMMANDS - Exact matches only
  const systemCommands = {
    'turn on bluetooth': 'rfkill unblock bluetooth && bluetoothctl power on',
    'turn off bluetooth': 'bluetoothctl power off',
    'enable bluetooth': 'rfkill unblock bluetooth && bluetoothctl power on',
    'disable bluetooth': 'bluetoothctl power off',
    'bluetooth on': 'rfkill unblock bluetooth && bluetoothctl power on',
    'bluetooth off': 'bluetoothctl power off',
    'turn on wifi': 'nmcli radio wifi on',
    'turn off wifi': 'nmcli radio wifi off',
    'wifi on': 'nmcli radio wifi on',
    'wifi off': 'nmcli radio wifi off',
    'volume up': 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
    'volume down': 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
    'increase volume': 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
    'decrease volume': 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
    'mute': 'pactl set-sink-mute @DEFAULT_SINK@ 1',
    'unmute': 'pactl set-sink-mute @DEFAULT_SINK@ 0',
    'brightness up': 'brightnessctl set +10%',
    'brightness down': 'brightnessctl set -10%',
    'take screenshot': 'gnome-screenshot',
    'screenshot': 'gnome-screenshot',
    'lock screen': 'gnome-screensaver-command -l',
    'lock': 'gnome-screensaver-command -l',
    'sleep': 'systemctl suspend',
    'dark mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark',
    'light mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita',
    'do not disturb on': 'gsettings set org.gnome.desktop.notifications show-banners false',
    'do not disturb off': 'gsettings set org.gnome.desktop.notifications show-banners true',
    'battery status': 'upower -i $(upower -e | grep BAT) | grep -E "percentage|state"',
    'disk space': 'df -h /',
    'memory usage': 'free -h',
    'shutdown': 'shutdown now',
    'restart': 'reboot'
  };

  for (const [phrase, cmd] of Object.entries(systemCommands)) {
    if (lower === phrase || lower.includes(phrase)) {
      return { type: 'command', action: 'system', value: cmd, message: 'Executing: ' + phrase };
    }
  }

  // 5. YOUTUBE
  if (lower.startsWith('play ') || lower.startsWith('watch ')) {
    const query = lower.replace(/^(play|watch) /, '');
    return { type: 'command', action: 'open', value: 'https://youtube.com/results?search_query=' + encodeURIComponent(query), message: 'Playing: ' + query };
  }

  // 6. WEATHER
  if (lower.startsWith('weather') || lower.includes('weather in') || lower.includes('weather for')) {
    const loc = lower.replace(/^(weather|weather in|weather for|what is the weather|what's the weather|check weather) /, '').trim();
    return { type: 'command', action: 'search', value: 'weather ' + (loc || 'today'), message: 'Checking weather for ' + (loc || 'today') };
  }

  // 7. TIME
  if (lower === 'time' || lower === 'what time is it' || lower === 'what is the time' || lower === 'current time') {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // 8. CHAT
  if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'yo') {
    return { type: 'chat', message: 'Hey! How can I help you?' };
  }
  if (lower === 'how are you' || lower === 'how are u') {
    return { type: 'chat', message: 'I am great! Ready to help you.' };
  }
  if (lower === 'who are you' || lower === 'what is your name') {
    return { type: 'chat', message: 'I am your AI Agent. I can control your system, open apps, search the web, and help you with tasks.' };
  }
  if (lower === 'what can you do' || lower === 'help') {
    return { type: 'chat', message: 'I can:\n- Turn on/off Bluetooth & WiFi\n- Control volume & brightness\n- Open apps (calculator, terminal, files)\n- Open websites (YouTube, Facebook)\n- Search the web\n- Take screenshots\n- Lock screen\n- And chat with you!' };
  }
  if (lower.includes('thank')) {
    return { type: 'chat', message: 'You are welcome!' };
  }
  if (lower === 'bye' || lower === 'goodbye') {
    return { type: 'chat', message: 'Goodbye! Have a great day!' };
  }
  if (lower.includes('joke')) {
    return { type: 'chat', message: 'Why do programmers prefer dark mode? Because light attracts bugs! 😄' };
  }

  // 9. DEFAULT - Ask user to clarify
  return { type: 'chat', message: 'I am not sure what you want. Try:\n- "Open calculator"\n- "Search for cats"\n- "Turn on Bluetooth"\n- "What time is it?"\n- "Help"' };
}

function executeCommand(action, value) {
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
    
    console.log('Input:', message);
    const result = parseCommand(message);
    console.log('Result:', result.type, '-', result.message);
    
    let execResult = '';
    if (result.type === 'command' && result.action) {
      execResult = await executeCommand(result.action, result.value);
    }
    
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    console.error('Error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('Server: http://localhost:' + PORT));
