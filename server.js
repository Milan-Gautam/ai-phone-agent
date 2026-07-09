const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec, spawn } = require('child_process');
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

// ============ LIST ALL INSTALLED APPS ============
function listInstalledApps() {
  return new Promise((resolve) => {
    exec('ls /usr/share/applications/*.desktop 2>/dev/null | head -50', (err, stdout) => {
      if (err) return resolve([]);
      const apps = stdout.trim().split('\n').map(f => {
        const name = path.basename(f, '.desktop');
        return { name: name, file: f };
      });
      resolve(apps);
    });
  });
}

// ============ OPEN ANY APP BY NAME ============
function openApp(appName) {
  return new Promise((resolve) => {
    const lower = appName.toLowerCase();
    
    // Common apps mapping
    const commonApps = {
      'calculator': 'gnome-calculator',
      'calc': 'gnome-calculator',
      'notepad': 'gedit',
      'notes': 'gedit',
      'editor': 'gedit',
      'text editor': 'gedit',
      'terminal': 'gnome-terminal',
      'console': 'gnome-terminal',
      'bash': 'gnome-terminal',
      'shell': 'gnome-terminal',
      'files': 'nautilus',
      'file manager': 'nautilus',
      'explorer': 'nautilus',
      'folders': 'nautilus',
      'settings': 'gnome-control-center',
      'control panel': 'gnome-control-center',
      'preferences': 'gnome-control-center',
      'firefox': 'firefox',
      'browser': 'firefox',
      'web': 'firefox',
      'chrome': 'google-chrome',
      'google chrome': 'google-chrome',
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
      'disk usage': 'baobab',
      'disks': 'gnome-disks',
      'network': 'gnome-control-center network',
      'wifi': 'gnome-control-center wifi',
      'bluetooth': 'gnome-control-center bluetooth',
      'display': 'gnome-control-center display',
      'sound': 'gnome-control-center sound',
      'power': 'gnome-control-center power',
      'printers': 'gnome-control-center printers',
      'users': 'gnome-control-center user-accounts',
      'background': 'gnome-control-center background',
      'appearance': 'gnome-control-center appearance',
      'notifications': 'gnome-control-center notifications',
      'privacy': 'gnome-control-center privacy',
      'sharing': 'gnome-control-center sharing',
      'mouse': 'gnome-control-center mouse',
      'keyboard': 'gnome-control-center keyboard',
      'screenshot': 'gnome-screenshot --interactive',
      'screen recorder': 'gnome-screen-recorder',
      'color': 'gnome-control-center color',
      'date': 'gnome-control-center datetime',
      'region': 'gnome-control-center region',
      'accessibility': 'gnome-control-center universal-access',
      'online accounts': 'gnome-control-center online-accounts',
      'thunderbird': 'thunderbird',
      'mail': 'thunderbird',
      'email': 'thunderbird',
      'libreoffice': 'libreoffice',
      'office': 'libreoffice',
      'word': 'libreoffice --writer',
      'excel': 'libreoffice --calc',
      'powerpoint': 'libreoffice --impress',
      'gimp': 'gimp',
      'photoshop': 'gimp',
      'vlc': 'vlc',
      'media player': 'vlc',
      'steam': 'steam',
      'discord': 'discord',
      'spotify': 'spotify',
      'slack': 'slack',
      'telegram': 'telegram-desktop',
      'whatsapp': 'whatsapp-desktop',
      'zoom': 'zoom',
      'skype': 'skype',
      'teams': 'teams',
      'postman': 'postman',
      'docker': 'docker-desktop',
      'virtualbox': 'virtualbox',
      'gitkraken': 'gitkraken',
      'sublime': 'sublime_text',
      'atom': 'atom',
      'intellij': 'intellij-idea-community',
      'pycharm': 'pycharm-community',
      'eclipse': 'eclipse',
      'netbeans': 'netbeans',
      'android studio': 'android-studio',
      'filezilla': 'filezilla',
      'transmission': 'transmission-gtk',
      'torrent': 'transmission-gtk',
      'bitwarden': 'bitwarden',
      'keepass': 'keepassxc',
      'password manager': 'keepassxc',
      'obs': 'obs',
      'kdenlive': 'kdenlive',
      'audacity': 'audacity',
      'inkscape': 'inkscape',
      'blender': 'blender',
      'krita': 'krita',
    };

    const cmd = commonApps[lower] || appName;
    
    exec(cmd + ' &', (err) => {
      if (err) {
        // Try desktop file
        exec('gtk-launch ' + appName + ' &', (err2) => {
          resolve(err2 ? 'Could not open ' + appName : 'Opened ' + appName);
        });
      } else {
        resolve('Opened ' + appName);
      }
    });
  });
}

// ============ SYSTEM CONTROL ============
function systemControl(command) {
  return new Promise((resolve) => {
    const commands = {
      'volume up': 'pactl set-sink-volume @DEFAULT_SINK@ +10%',
      'volume down': 'pactl set-sink-volume @DEFAULT_SINK@ -10%',
      'volume max': 'pactl set-sink-volume @DEFAULT_SINK@ 100%',
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
      exec(cmd, (err, stdout) => resolve(err ? err.message : (stdout || 'Done')));
    } else {
      resolve('Unknown command');
    }
  });
}

// ============ SMART AI RESPONSE ============
function getAIResponse(msg) {
  const lower = msg.toLowerCase().trim();

  // ========== OPEN APPS ==========
  if (lower.startsWith('open ') || lower.startsWith('launch ') || lower.startsWith('start ') || lower.startsWith('run ')) {
    const app = lower.replace(/^(open|launch|start|run)\s+/i, '');
    return { type: 'app', action: app, message: 'Opening ' + app };
  }

  // ========== SYSTEM CONTROLS ==========
  const systemTriggers = {
    'volume up': 'volume up', 'volume down': 'volume down', 'volume max': 'volume max',
    'mute': 'mute', 'unmute': 'mute',
    'brightness up': 'brightness up', 'brightness down': 'brightness down',
    'bluetooth on': 'bluetooth on', 'bluetooth off': 'bluetooth off',
    'wifi on': 'wifi on', 'wifi off': 'wifi off',
    'take screenshot': 'screenshot', 'screenshot': 'screenshot',
    'lock screen': 'lock', 'lock': 'lock',
    'sleep': 'sleep', 'suspend': 'sleep',
    'dark mode': 'dark mode', 'night mode': 'dark mode',
    'light mode': 'light mode', 'day mode': 'light mode',
    'do not disturb on': 'dnd on', 'do not disturb off': 'dnd off',
    'shutdown': 'shutdown', 'power off': 'shutdown',
    'restart': 'restart', 'reboot': 'restart',
  };

  for (const [trigger, cmd] of Object.entries(systemTriggers)) {
    if (lower.includes(trigger)) {
      return { type: 'system', action: cmd, message: 'Executing: ' + trigger };
    }
  }

  // ========== SEARCH ==========
  if (lower.startsWith('search ') || lower.startsWith('find ') || lower.startsWith('google ')) {
    const query = lower.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { type: 'search', action: query, message: 'Searching for: ' + query };
  }

  // ========== WEBSITES ==========
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

  // ========== WEATHER ==========
  if (lower.includes('weather') || lower.includes('forecast')) {
    const loc = lower.replace(/weather|forecast|what'?s?\s+the\s+weather|check\s+weather/gi, '').replace(/\s+(in|for|at)\s+/gi, '').trim();
    return { type: 'search', action: 'weather ' + (loc || 'today'), message: 'Checking weather' + (loc ? ' for ' + loc : '') };
  }

  // ========== TIME ==========
  if (lower.includes('time') || lower.includes('clock') || lower.includes('date')) {
    const now = new Date();
    return { type: 'chat', message: 'It is ' + now.toLocaleTimeString() + ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) };
  }

  // ========== CHAT ==========
  if (/^(hi|hello|hey|yo|sup)\b/i.test(lower)) return { type: 'chat', message: 'Hey! What can I do for you?' };
  if (/how\s+are\s+you/i.test(lower)) return { type: 'chat', message: 'I am running perfectly! Ready to help.' };
  if (/who\s+are\s+you|your\s+name/i.test(lower)) return { type: 'chat', message: 'I am your AI Agent. I can open ANY app on your device, control system settings, search the web, and chat with you.' };
  if (/what\s+can\s+you\s+do|help/i.test(lower)) return { type: 'chat', message: 'I can:\n• Open ANY app - "Open calculator", "Open chrome", "Open vscode"\n• Control system - "Volume up", "Turn on Bluetooth"\n• Search web - "Search for cats"\n• Open websites - "Open YouTube"\n• Tell time & weather\n• Chat with you!' };
  if (/thank/i.test(lower)) return { type: 'chat', message: 'You\'re welcome! 😊' };
  if (/bye|goodbye/i.test(lower)) return { type: 'chat', message: 'Goodbye! Have a great day!' };
  if (/joke/i.test(lower)) return { type: 'chat', message: 'Why do programmers prefer dark mode? Because light attracts bugs! 😄' };
  if (/love you/i.test(lower)) return { type: 'chat', message: 'Thank you! ❤️' };
  if (/how old/i.test(lower)) return { type: 'chat', message: 'I was just created! Still learning new things every day.' };
  if (/your creator|who made you/i.test(lower)) return { type: 'chat', message: 'I was created by a developer who wanted a smart device assistant!' };

  // Default
  return { type: 'chat', message: 'I can help with:\n• "Open [app name]" - Opens any app\n• "Volume up/down" - Control audio\n• "Search for [query]" - Web search\n• "Turn on Bluetooth" - System controls\n• "What time is it?" - Time & info\n\nWhat would you like?' };
}

// ============ MAIN AGENT ============
app.post('/api/agent', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    const result = getAIResponse(message);
    let execResult = '';
    
    if (result.type === 'app') {
      execResult = await openApp(result.action);
    } else if (result.type === 'system') {
      execResult = await systemControl(result.action);
    } else if (result.type === 'search') {
      const url = 'https://www.google.com/search?q=' + encodeURIComponent(result.action);
      exec('xdg-open "' + url + '"');
      execResult = 'Opened search results';
    } else if (result.type === 'website') {
      exec('xdg-open "' + result.action + '"');
      execResult = 'Opened website';
    }
    
    res.json({ success: true, type: result.type, message: result.message, result: execResult || '' });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/apps', auth, async (req, res) => {
  const apps = await listInstalledApps();
  res.json({ apps });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('\n⚡ AI Agent: http://localhost:' + PORT + '\n'));
