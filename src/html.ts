export function renderDashboardHTML(status: {
  service: string;
  hasWebhook: boolean;
  webhookSource: string;
  minImpact: string;
  lastRun?: any;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forex & Commodity AI Sentinel Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #090d16;
      --card-bg: rgba(18, 24, 38, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-gold: #f59e0b;
      --accent-red: #ef4444;
      --accent-green: #10b981;
      --accent-blue: #3b82f6;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    body {
      background: radial-gradient(circle at top right, #1e1b4b 0%, var(--bg-dark) 50%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 2rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .brand-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--accent-gold), var(--accent-red));
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      box-shadow: 0 8px 16px rgba(245, 158, 11, 0.25);
    }

    .title {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(90deg, #fff, #94a3b8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.9rem;
      border-radius: 2rem;
      font-size: 0.825rem;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      box-shadow: 0 0 10px var(--accent-green);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .card-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .input-field {
      width: 100%;
      background: rgba(10, 15, 26, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.6rem;
      padding: 0.8rem 1rem;
      color: #fff;
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s ease;
    }

    .input-field:focus {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    .btn {
      cursor: pointer;
      border: none;
      border-radius: 0.6rem;
      padding: 0.8rem 1.4rem;
      font-weight: 600;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent-blue), #2563eb);
      color: #fff;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .alert-banner {
      padding: 1rem;
      border-radius: 0.75rem;
      margin-top: 0.5rem;
      font-size: 0.85rem;
      display: none;
    }

    .alert-success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }

    .tag {
      padding: 0.25rem 0.6rem;
      border-radius: 0.4rem;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.08);
    }

    .pair-badge {
      display: inline-block;
      padding: 0.3rem 0.6rem;
      border-radius: 0.4rem;
      font-size: 0.8rem;
      font-weight: 600;
      background: rgba(245, 158, 11, 0.15);
      color: var(--accent-gold);
      border: 1px solid rgba(245, 158, 11, 0.3);
      margin-right: 0.4rem;
      margin-bottom: 0.4rem;
    }

    .console-box {
      background: #060911;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 0.75rem;
      padding: 1rem;
      font-family: monospace;
      font-size: 0.8rem;
      color: #94a3b8;
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>

  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="brand">
        <div class="brand-icon">📈</div>
        <div>
          <h1 class="title">Forex & Commodity AI Sentinel</h1>
          <p class="subtitle">Cloudflare Workers AI • 3-Min Cron • 30-Min Pre-Alerts</p>
        </div>
      </div>
      <div class="status-badge">
        <span class="status-dot"></span>
        <span>SYSTEM LIVE</span>
      </div>
    </div>

    <!-- Active Traded Pairs & Features -->
    <div class="card">
      <div class="card-title">🎯 MONITORED ASSETS & COVERAGE</div>
      <div>
        <span class="pair-badge">💵 USD Correlated</span>
        <span class="pair-badge">💶 EURUSD</span>
        <span class="pair-badge">💷 GBPUSD</span>
        <span class="pair-badge">🥇 XAUUSD (Gold)</span>
        <span class="pair-badge">🛢️ USOIL (WTI)</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.75rem;">
        ⚡ <strong>Features</strong>: Scrapes ForexLive & Investing.com | ⏰ 30-Min ForexFactory Red Folder Pre-Alerts | 📊 Instant CPI & Fed Rate Data Release Verdicts.
      </p>
    </div>

    <!-- Discord Webhook Configuration GUI -->
    <div class="card">
      <div class="card-title">
        <span>🔗 DISCORD WEBHOOK CONFIGURATION</span>
        <span class="tag" id="webhook-source-tag">${status.hasWebhook ? 'SAVED PERMANENTLY' : 'NOT CONFIGURED'}</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
        Enter your Discord channel Webhook URL below. It will remain saved permanently across code updates, deployments, and cron jobs.
      </p>
      <form id="webhook-form" class="form-group">
        <input 
          type="url" 
          id="webhook-input" 
          class="input-field" 
          placeholder="https://discord.com/api/webhooks/123456789/abcxyz..."
          required
        />
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <button type="submit" class="btn btn-primary">💾 Save Webhook URL</button>
          <button type="button" id="trigger-btn" class="btn btn-secondary">⚡ Test / Trigger News Run Now</button>
        </div>
      </form>
      <div id="alert-msg" class="alert-banner alert-success"></div>
    </div>

    <!-- Live Execution Status & Logs -->
    <div class="card">
      <div class="card-title">
        <span>📋 SYSTEM LOGS & LAST CYCLE RESULTS</span>
        <button id="refresh-btn" class="btn btn-secondary" style="padding: 0.3rem 0.75rem; font-size: 0.75rem;">🔄 Refresh Status</button>
      </div>
      <div class="console-box" id="console-output">Loading status log...</div>
    </div>
  </div>

  <script>
    const webhookInput = document.getElementById('webhook-input');
    const webhookForm = document.getElementById('webhook-form');
    const alertMsg = document.getElementById('alert-msg');
    const triggerBtn = document.getElementById('trigger-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const consoleOutput = document.getElementById('console-output');
    const webhookSourceTag = document.getElementById('webhook-source-tag');

    async function loadStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        consoleOutput.textContent = JSON.stringify(data, null, 2);
        if (data.hasWebhook) {
          webhookSourceTag.textContent = 'CONNECTED (' + data.webhookSource + ')';
          webhookSourceTag.style.background = 'rgba(16, 185, 129, 0.2)';
          webhookSourceTag.style.color = '#34d399';
        } else {
          webhookSourceTag.textContent = 'WEBHOOK MISSING';
          webhookSourceTag.style.background = 'rgba(239, 68, 68, 0.2)';
          webhookSourceTag.style.color = '#f87171';
        }
      } catch (err) {
        consoleOutput.textContent = 'Error fetching status: ' + err.message;
      }
    }

    webhookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = webhookInput.value.trim();
      if (!url) return;

      alertMsg.style.display = 'block';
      alertMsg.textContent = 'Saving Webhook URL...';

      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: url })
        });
        const data = await res.json();
        if (res.ok) {
          alertMsg.textContent = '✅ Success: Discord Webhook URL saved permanently!';
          alertMsg.className = 'alert-banner alert-success';
          webhookInput.value = '';
          loadStatus();
        } else {
          alertMsg.textContent = '❌ Failed to save: ' + (data.error || 'Unknown error');
        }
      } catch (err) {
        alertMsg.textContent = '❌ Connection Error: ' + err.message;
      }
    });

    triggerBtn.addEventListener('click', async () => {
      consoleOutput.textContent = '⏳ Executing live news scraping & AI evaluation cycle...';
      try {
        const res = await fetch('/trigger');
        const data = await res.json();
        consoleOutput.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        consoleOutput.textContent = 'Error triggering cycle: ' + err.message;
      }
    });

    refreshBtn.addEventListener('click', loadStatus);

    loadStatus();
  </script>
</body>
</html>`;
}
