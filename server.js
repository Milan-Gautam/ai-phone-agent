const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT } = require('./src/config');
const { register, login, verifyToken } = require('./src/auth');
const { parseCommand } = require('./src/agent');
const { execute } = require('./src/executor');
const { getHistory, saveHistory } = require('./src/storage');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Auth routes
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// Agent route
app.post('/api/agent', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    console.log(`📱 Command: "${message}"`);
    
    // Parse command
    const parsed = parseCommand(message);
    console.log(`🤖 Action: ${parsed.action || 'none'}, Message: ${parsed.message}`);
    
    // Execute if needed
    let result = '';
    if (parsed.action) {
      result = await execute(parsed.action, parsed.value);
      console.log(`✅ Result: ${result}`);
    }
    
    // Save to history
    const history = getHistory();
    history.push({
      userId: req.userId,
      command: message,
      action: parsed.action,
      value: parsed.value,
      message: parsed.message,
      result,
      timestamp: new Date().toISOString()
    });
    saveHistory(history);
    
    res.json({
      success: true,
      message: parsed.message,
      result: result || 'Done'
    });
    
  } catch (error) {
    console.error('Agent error:', error);
    res.status(500).json({ error: 'Failed to process command' });
  }
});

// History route
app.get('/api/history', verifyToken, (req, res) => {
  const history = getHistory()
    .filter(h => h.userId === req.userId)
    .slice(-50)
    .reverse();
  res.json({ history });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║        🤖 AI PHONE AGENT          ║
║        v2.0 - Professional        ║
╠════════════════════════════════════╣
║  Server:  http://localhost:${PORT}    ║
║  Status:  Running                 ║
║  Storage: Local JSON files        ║
║  Auth:    JWT tokens              ║
╚════════════════════════════════════╝
  `);
});
