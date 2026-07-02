function parseCommand(message) {
  const msg = message.toLowerCase().trim();
  
  // Helper: extract website from command
  const extractSite = (text) => {
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
      'whatsapp': 'https://web.whatsapp.com'
    };
    
    for (const [name, url] of Object.entries(sites)) {
      if (text.includes(name)) return { url, name };
    }
    return null;
  };
  
  // Website commands
  if (msg.startsWith('open ') || msg.startsWith('go to ') || msg.startsWith('visit ')) {
    const target = msg.replace(/^(open|go to|visit)\s+/i, '');
    const site = extractSite(target);
    
    if (site) {
      return { action: 'open', value: site.url, message: `Opening ${site.name}` };
    }
    
    if (target.match(/\.(com|org|net|io|dev|app)/)) {
      const url = target.startsWith('http') ? target : `https://${target}`;
      return { action: 'open', value: url, message: `Opening ${target}` };
    }
    
    return { action: 'search', value: target, message: `Searching for "${target}"` };
  }
  
  // Search commands
  if (msg.startsWith('search ') || msg.startsWith('find ') || msg.startsWith('google ')) {
    const query = msg.replace(/^(search|find|google)\s+(for\s+)?/i, '');
    return { action: 'search', value: query, message: `Searching for "${query}"` };
  }
  
  // YouTube
  if (msg.includes('youtube') || msg.startsWith('play ') || msg.startsWith('watch ')) {
    const query = msg.replace(/^(play|watch)\s+/i, '').replace(/\s+on\s+youtube/i, '');
    if (query && query !== 'youtube') {
      return { action: 'open', value: `https://youtube.com/results?search_query=${encodeURIComponent(query)}`, message: `Playing "${query}" on YouTube` };
    }
    return { action: 'open', value: 'https://youtube.com', message: 'Opening YouTube' };
  }
  
  // System apps
  const apps = {
    'calculator': { cmd: 'gnome-calculator', name: 'Calculator' },
    'notepad': { cmd: 'gedit', name: 'Text Editor' },
    'terminal': { cmd: 'gnome-terminal', name: 'Terminal' },
    'files': { cmd: 'nautilus', name: 'File Manager' },
    'settings': { cmd: 'gnome-control-center', name: 'Settings' }
  };
  
  for (const [key, app] of Object.entries(apps)) {
    if (msg.includes(key)) {
      return { action: 'app', value: app.cmd, message: `Opening ${app.name}` };
    }
  }
  
  // Weather
  if (msg.includes('weather')) {
    const location = msg.replace(/weather\s*(in\s*)?/i, '').trim() || '';
    return { 
      action: 'search', 
      value: `weather ${location}`, 
      message: `Checking weather${location ? ' for ' + location : ''}` 
    };
  }
  
  // Time
  if (msg.includes('time') || msg.includes('clock') || msg.includes('date')) {
    const now = new Date();
    return { 
      action: null, 
      value: null, 
      message: `It's ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}` 
    };
  }
  
  // Default: search
  return { action: 'search', value: message, message: `Let me find that for you` };
}

module.exports = { parseCommand };
