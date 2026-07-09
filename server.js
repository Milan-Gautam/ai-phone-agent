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

// ============ OPEN APP ============
function openApp(appName) {
  return new Promise((resolve) => {
    const lower = appName.toLowerCase().trim();
    
    const commonApps = {
      'calculator': 'gnome-calculator', 'calc': 'gnome-calculator',
      'notepad': 'gedit', 'notes': 'gedit', 'editor': 'gedit', 'text editor': 'gedit',
      'terminal': 'gnome-terminal', 'console': 'gnome-terminal',
      'files': 'nautilus', 'file manager': 'nautilus', 'explorer': 'nautilus',
      'settings': 'gnome-control-center', 'control panel': 'gnome-control-center',
      'firefox': 'firefox', 'browser': 'firefox',
      'chrome': 'google-chrome', 'google chrome': 'google-chrome',
      'vscode': 'code', 'code': 'code', 'visual studio': 'code',
      'camera': 'cheese', 'webcam': 'cheese',
      'system monitor': 'gnome-system-monitor', 'task manager': 'gnome-system-monitor',
      'software': 'gnome-software', 'app store': 'gnome-software',
      'calendar': 'gnome-calendar', 'clock': 'gnome-clocks',
      'weather': 'gnome-weather', 'maps': 'gnome-maps',
      'photos': 'eog', 'images': 'eog',
      'videos': 'totem', 'music': 'rhythmbox', 'audio': 'rhythmbox',
      'documents': 'evince', 'pdf': 'evince',
      'thunderbird': 'thunderbird', 'mail': 'thunderbird', 'email': 'thunderbird',
      'libreoffice': 'libreoffice', 'office': 'libreoffice',
      'gimp': 'gimp', 'vlc': 'vlc', 'media player': 'vlc',
      'steam': 'steam', 'discord': 'discord', 'spotify': 'spotify',
      'slack': 'slack', 'telegram': 'telegram-desktop',
      'whatsapp': 'whatsapp-desktop', 'zoom': 'zoom', 'skype': 'skype',
      'sublime': 'sublime_text', 'atom': 'atom',
      'pycharm': 'pycharm-community', 'android studio': 'android-studio',
      'transmission': 'transmission-gtk', 'obs': 'obs',
      'audacity': 'audacity', 'inkscape': 'inkscape', 'blender': 'blender',
      'krita': 'krita', 'postman': 'postman', 'virtualbox': 'virtualbox',
      'filezilla': 'filezilla', 'bitwarden': 'bitwarden',
      'teams': 'teams', 'signal': 'signal-desktop',
      'element': 'element-desktop', 'polari': 'polari',
      'boxes': 'gnome-boxes', 'disks': 'gnome-disks',
      'baobab': 'baobab', 'disk usage': 'baobab',
      'screenshot': 'gnome-screenshot --interactive',
    };

    let cmd = commonApps[lower] || lower;
    
    // Try direct command with nohup
    exec('nohup ' + cmd + ' > /dev/null 2>&1 &', (err) => {
      if (!err) return resolve('Opened ' + appName);
      
      // Try gtk-launch with original name
      exec('gtk-launch ' + lower + ' > /dev/null 2>&1 &', (err2) => {
        if (!err2) return resolve('Opened ' + appName);
        
        // Try gtk-launch with mapped command
        exec('gtk-launch ' + cmd + ' > /dev/null 2>&1 &', (err3) => {
          if (!err3) return resolve('Opened ' + appName);
          
          // Try xdg-open
          exec('xdg-open ' + cmd + ' > /dev/null 2>&1 &', (err4) => {
            if (!err4) return resolve('Opened ' + appName);
            
            resolve('Could not open ' + appName);
          });
        });
      });
    });
  });
}

// ============ SYSTEM CONTROL ============
function systemControl(command) {
  return new Promise((resolve) => {
    const commands = {
      'volume up': 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
      'volume down': 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
      'mute': 'pactl set-sink-mute @DEFAULT_SINK@ toggle',
      'brightness up': 'brightnessctl set +10%',
      'brightness down': 'brightnessctl set -10%',
      'bluetooth on': 'rfkill unblock bluetooth && bluetoothctl power on',
      'bluetooth off': 'bluetoothctl power off',
      'wifi on': 'nmcli radio wifi on',
      'wifi off': 'nmcli radio wifi off',
      'screenshot': 'gnome-screenshot',
      'lock': 'gnome-screensaver-command -l',
      'sleep': 'systemctl suspend',
      'dark mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark',
      'light mode': 'gsettings set org.gnome.desktop.interface gtk-theme Adwaita',
      'dnd on': 'gsettings set org.gnome.desktop.notifications show-banners false',
      'dnd off': 'gsettings set org.gnome.desktop.notifications show-banners true',
      'shutdown': 'shutdown now',
      'restart': 'reboot',
    };

    const cmd = commands[command];
    if (cmd) {
      exec(cmd + ' > /dev/null 2>&1 &', (err) => {
        resolve(err ? 'Failed: ' + err.message : 'Done');
      });
    } else {
      resolve('Unknown command');
    }
  });
}

// ============ AI RESPONSE ============
function getResponse(msg) {
  const lower = msg.toLowerCase().trim();

  // OPEN APPS
  if (lower.startsWith('open ') || lower.startsWith('launch ') || lower.startsWith('start ') || lower.startsWith('run ')) {
    const app = lower.replace(/^(open|launch|start|run)\s+/i, '');
    return { type: 'app', action: app, message: 'Opening ' + app };
  }

  // SYSTEM CONTROLS
  const systemTriggers = {
    'volume up': 'volume up', 'volume down': 'volume down',
    'mute': 'mute', 'unmute': 'mute',
    'brightness up': 'brightness up', 'brightness down': 'brightness down',
    'bluetooth on': 'bluetooth on', 'bluetooth off': 'bluetooth off',
    'wifi on': 'wifi on', 'wifi off': 'wifi off',
    'take screenshot': 'screenshot', 'screenshot': 'screenshot',
    'lock screen': 'lock', 'lock': 'lock',
    'sleep': 'sleep', 'suspend': 'sleep',
    'dark mode': 'dark mode', 'light mode': 'light mode',
    'do not disturb on': 'dnd on', 'do not disturb off': 'dnd off',
    'shutdown': 'shutdown', 'restart': 'restart',
  };

  for (const [trigger, cmd] of Object.entries(systemTriggers)) {
    if (lower.includes(trigger)) {
      return { type: 'system', action: cmd, message: 'Executing: ' + trigger };
    }
  }

  // SEARCH
  if (lower.startsWith('search ') || lower.startsWith('find ') || lower.startsWith('google ')) {
    const query = lower.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { type: 'search', action: query, message: 'Searching: ' + query };
  }

  // WEBSITES
  const sites = {
    'youtube': 'https://youtube.com', 'facebook': 'https://facebook.com',
    'twitter': 'https://twitter.com', 'instagram': 'https://instagram.com',
    'amazon': 'https://amazon.com', 'github': 'https://github.com',
    'gmail': 'https://mail.google.com', 'netflix': 'https://netflix.com',
    'spotify': 'https://open.spotify.com', 'reddit': 'https://reddit.com',
    'linkedin': 'https://linkedin.com', 'chatgpt': 'https://chat.openai.com',
  };

  for (const [name, url] of Object.entries(sites)) {
    if (lower.includes(name) && (lower.startsWith('open') || lower.startsWith('go to'))) {
      return { type: 'website', action: url, message: 'Opening ' + name };
    }
  }

  // WEATHER
  if (lower.includes('weather') || lower.includes('forecast')) {
    const loc = lower.replace(/weather|forecast|what'?s?\s+the\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'search', action: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }

  // TIME
  if (lower.includes('time') || lower.includes('clock') || lower.includes('date')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString() + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // CHAT
  if (/^(hi|hello|hey|yo|sup)\b/i.test(lower)) return { type: 'chat', message: 'Hey! How can I help?' };
  if (/how\s+are\s+you/i.test(lower)) return { type: 'chat', message: 'I am great! Ready to help you.' };
  if (/who\s+are\s+you|your\s+name/i.test(lower)) return { type: 'chat', message: 'I am your AI Agent. I can open apps, control system settings, search the web, and chat.' };
  if (/what\s+can\s+you\s+do|help/i.test(lower)) return { type: 'chat', message: 'I can:\n• Open any app - "Open calculator"\n• Control system - "Volume up"\n• Search web - "Search for cats"\n• Open websites - "Open YouTube"\n• Tell time & weather\n• Chat with you!' };
  if (/thank/i.test(lower)) return { type: 'chat', message: 'You\'re welcome! 😊' };
  if (/bye|goodbye/i.test(lower)) return { type: 'chat', message: 'Goodbye! Have a great day!' };
  if (/joke/i.test(lower)) return { type: 'chat', message: 'Why do programmers prefer dark mode? Light attracts bugs! 😄' };
  if (/love you/i.test(lower)) return { type: 'chat', message: 'Thank you! ❤️' };

  return { type: 'chat', message: 'I can help with:\n• "Open [app]" - Opens any app\n• "Volume up" - System control\n• "Search for [query]" - Web search\n• "What time is it?" - Info\n\nWhat do you need?' };
}

// ============ AGENT ENDPOINT ============
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    const result = getResponse(message);
    let execResult = '';
    
    if (result.type === 'app') {
      execResult = await openApp(result.action);
    } else if (result.type === 'system') {
      execResult = await systemControl(result.action);
    } else if (result.type === 'search') {
      const url = 'https://www.google.com/search?q=' + encodeURIComponent(result.action);
      exec('xdg-open "' + url + '" > /dev/null 2>&1 &', () => {});
      execResult = 'Opened search';
    } else if (result.type === 'website') {
      exec('xdg-open "' + result.action + '" > /dev/null 2>&1 &', () => {});
      execResult = 'Opened website';
    }
    
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('\n⚡ AI Agent: http://localhost:' + PORT + '\n'));
