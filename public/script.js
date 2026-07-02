const API = '';
let token = localStorage.getItem('token');

const suggestions = [
  'Open YouTube',
  'Search for cats',
  'Weather in London',
  'Open calculator',
  'What time is it?',
  'Open github.com',
  'Play music on YouTube',
  'Open Facebook'
];

// Auth
function showRegister() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) return alert('Please fill all fields');
  
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    
    const data = await res.json();
    token = data.token;
    localStorage.setItem('token', token);
    showApp();
  } catch (e) {
    alert(e.message || 'Login failed');
  }
}

async function handleRegister() {
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  
  if (!name || !email || !password) return alert('Please fill all fields');
  if (password.length < 6) return alert('Password must be at least 6 characters');
  
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    
    const data = await res.json();
    token = data.token;
    localStorage.setItem('token', token);
    showApp();
  } catch (e) {
    alert(e.message || 'Registration failed');
  }
}

// App
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('commandInput').focus();
  
  // Load suggestions
  const sugDiv = document.getElementById('suggestions');
  sugDiv.innerHTML = suggestions.map(s => 
    `<span class="suggestion" onclick="quickCommand('${s}')">${s}</span>`
  ).join('');
}

function logout() {
  localStorage.removeItem('token');
  token = null;
  document.getElementById('appScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function quickCommand(cmd) {
  document.getElementById('commandInput').value = cmd;
  sendCommand();
}

async function sendCommand() {
  const input = document.getElementById('commandInput');
  const command = input.value.trim();
  if (!command) return;
  
  // Remove welcome message
  const welcome = document.querySelector('.welcome');
  if (welcome) welcome.remove();
  
  // Add user message
  addMessage(command, 'user');
  input.value = '';
  
  try {
    const res = await fetch(`${API}/api/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message: command })
    });
    
    if (!res.ok) throw new Error('Failed');
    
    const data = await res.json();
    addMessage(data.message, 'agent', data.result);
  } catch (e) {
    addMessage('Sorry, something went wrong.', 'agent');
  }
}

function addMessage(text, type, result) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  
  let html = `<div class="bubble">${escapeHtml(text)}`;
  if (result) {
    html += `<span class="result-text">✓ ${escapeHtml(result)}</span>`;
  }
  html += '</div>';
  
  div.innerHTML = html;
  document.getElementById('messages').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Enter key to send
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('commandInput') === document.activeElement) {
    sendCommand();
  }
});

// Check if logged in
if (token) showApp();
