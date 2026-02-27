/**
 * Admin UI - Embedded SPA HTML/CSS/JS Generator
 *
 * Single-file admin UI that ships inside the binary.
 * No React, no build step — just template literals.
 *
 * ar.io brand theme — light background, dark sidebar, purple accents.
 */

const COLORS = {
  bg: "#F8F9FA",
  sidebar: "#23232D",
  card: "#FFFFFF",
  border: "#E2E2E8",
  primary: "#5427C8",
  primaryLight: "#DFD6F7",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  text: "#23232D",
  textMuted: "#6B7280",
  textBright: "#111118",
  sidebarText: "#A5A5B2",
  sidebarActive: "#DFD6F7",
};

function css(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: ${COLORS.bg};
      --sidebar: ${COLORS.sidebar};
      --card: ${COLORS.card};
      --border: ${COLORS.border};
      --primary: ${COLORS.primary};
      --primary-light: ${COLORS.primaryLight};
      --success: ${COLORS.success};
      --warning: ${COLORS.warning};
      --danger: ${COLORS.danger};
      --text: ${COLORS.text};
      --text-muted: ${COLORS.textMuted};
      --text-bright: ${COLORS.textBright};
    }

    body {
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      min-height: 100vh;
      overflow-x: hidden;
    }

    h1, h2, h3, .section-title {
      font-family: "Besley", Georgia, "Times New Roman", serif;
    }

    /* Sidebar */
    .sidebar {
      width: 220px;
      min-height: 100vh;
      background: var(--sidebar);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10;
    }
    .sidebar-brand {
      padding: 20px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sidebar-brand svg { flex-shrink: 0; }
    .sidebar-brand h1 {
      font-size: 18px;
      font-weight: 800;
      color: #FFFFFF;
      line-height: 1.2;
    }
    .sidebar-brand span {
      font-size: 11px;
      color: ${COLORS.sidebarText};
      display: block;
    }
    .sidebar-nav { flex: 1; padding: 8px 0; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      color: ${COLORS.sidebarText};
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover {
      color: #FFFFFF;
      background: rgba(255,255,255,0.05);
    }
    .nav-item.active {
      color: ${COLORS.sidebarActive};
      background: rgba(84,39,200,0.12);
      border-left-color: ${COLORS.primary};
    }
    .nav-icon { font-size: 18px; width: 22px; text-align: center; }
    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 11px;
      color: ${COLORS.sidebarText};
    }
    .sidebar-footer a { color: ${COLORS.sidebarActive}; text-decoration: none; }
    .sidebar-footer a:hover { text-decoration: underline; }

    /* Main Content */
    .main {
      flex: 1;
      margin-left: 220px;
      padding: 24px;
      max-width: 1200px;
    }
    .page-header {
      margin-bottom: 24px;
    }
    .page-header h2 {
      font-size: 24px;
      font-weight: 800;
      color: var(--text-bright);
      margin-bottom: 4px;
    }
    .page-header p {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .card-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .card-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-bright);
    }
    .card-value.small { font-size: 16px; font-weight: 600; }
    .card-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Colored left-border cards */
    .card-accent-green { border-left: 4px solid var(--success); }
    .card-accent-purple { border-left: 4px solid var(--primary); }
    .card-accent-amber { border-left: 4px solid var(--warning); }
    .card-accent-blue { border-left: 4px solid #3B82F6; }

    /* Dashboard grid - 12 column layout */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .dashboard-grid > * { grid-column: span 3; }
    .span-4 { grid-column: span 4 !important; }
    .span-6 { grid-column: span 6 !important; }
    .span-8 { grid-column: span 8 !important; }
    .span-12 { grid-column: span 12 !important; }

    /* Hero card - gradient accent */
    .card-hero {
      background: linear-gradient(135deg, var(--primary), #7C4DFF);
      border: none;
      color: white;
      padding: 24px;
    }
    .card-hero .card-label { color: rgba(255,255,255,0.7); }
    .card-hero .card-value { color: #FFFFFF; font-size: 32px; }
    .card-hero .card-sub { color: rgba(255,255,255,0.65); }
    .card-hero .dot { background: #4ADE80; }

    /* Stat rows - key/value pairs */
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-row-label { color: var(--text-muted); }
    .stat-row-value { font-weight: 600; color: var(--text-bright); }

    /* Top-border accent cards */
    .card-stat-green { border-top: 3px solid var(--success); }
    .card-stat-purple { border-top: 3px solid var(--primary); }
    .card-stat-blue { border-top: 3px solid #3B82F6; }
    .card-stat-amber { border-top: 3px solid var(--warning); }

    /* Gateway summary bar */
    .gateway-summary {
      display: flex;
      gap: 24px;
      padding: 16px 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .gateway-summary-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .gateway-summary-item strong {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-bright);
    }

    /* Health Bar */
    .health-bar-container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .health-bar-label {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .health-bar {
      height: 24px;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      background: var(--border);
    }
    .health-bar .segment {
      height: 100%;
      transition: width 0.5s ease;
    }
    .health-bar .healthy { background: var(--success); }
    .health-bar .unhealthy { background: var(--danger); }
    .health-bar .circuit-open { background: var(--warning); }
    .health-bar-legend {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
      vertical-align: middle;
    }

    /* Section */
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .section-title {
      font-size: 15px;
      font-weight: 800;
      color: var(--text-bright);
      margin-bottom: 12px;
    }

    /* Progress Bar */
    .progress-bar {
      height: 8px;
      background: var(--border);
      border-radius: 4px;
      overflow: hidden;
      margin: 8px 0;
    }
    .progress-bar .fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s;
      background: var(--primary);
    }
    .progress-bar .fill.high { background: var(--warning); }
    .progress-bar .fill.critical { background: var(--danger); }

    /* Table */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .data-table th:hover { color: var(--text); }
    .data-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .data-table tr:hover td {
      background: rgba(84,39,200,0.03);
    }

    /* Status dots */
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
      vertical-align: middle;
    }
    .dot.green { background: var(--success); }
    .dot.red { background: var(--danger); }
    .dot.orange { background: var(--warning); }
    .dot.purple { background: var(--primary); }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-proxy { background: rgba(84,39,200,0.1); color: var(--primary); }
    .badge-route { background: rgba(217,119,6,0.1); color: var(--warning); }
    .badge-on { background: rgba(22,163,74,0.1); color: var(--success); }
    .badge-off { background: rgba(220,38,38,0.1); color: var(--danger); }

    /* Buttons */
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .btn:hover { border-color: var(--primary); color: var(--primary); }
    .btn-primary {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }
    .btn-primary:hover { background: #4520A8; border-color: #4520A8; color: white; }
    .btn-danger {
      background: transparent;
      border-color: var(--danger);
      color: var(--danger);
    }
    .btn-danger:hover { background: rgba(220,38,38,0.06); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }

    /* Forms */
    .form-group { margin-bottom: 16px; }
    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 4px;
    }
    .form-input {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 13px;
      font-family: inherit;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(84,39,200,0.1);
    }
    select.form-input {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B7280' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 30px;
    }
    textarea.form-input {
      min-height: 64px;
      resize: vertical;
    }
    .toggle {
      position: relative;
      width: 40px;
      height: 22px;
      display: inline-block;
    }
    .toggle input { display: none; }
    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--border);
      border-radius: 11px;
      cursor: pointer;
      transition: 0.2s;
    }
    .toggle-slider:before {
      content: "";
      position: absolute;
      width: 16px;
      height: 16px;
      left: 3px;
      top: 3px;
      background: white;
      border-radius: 50%;
      transition: 0.2s;
    }
    .toggle input:checked + .toggle-slider { background: var(--primary); }
    .toggle input:checked + .toggle-slider:before { transform: translateX(18px); }

    /* Radio cards */
    .radio-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    }
    .radio-card {
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      background: var(--bg);
    }
    .radio-card:hover { border-color: var(--primary); }
    .radio-card.selected {
      border-color: var(--primary);
      background: rgba(84,39,200,0.04);
    }
    .radio-card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 4px;
    }
    .radio-card-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .radio-card .rec-badge {
      font-size: 9px;
      background: rgba(84,39,200,0.12);
      color: var(--primary);
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
    }

    /* Setup wizard */
    .wizard {
      max-width: 640px;
      margin: 0 auto;
    }
    .wizard-steps {
      display: flex;
      gap: 8px;
      margin-bottom: 32px;
    }
    .wizard-step {
      flex: 1;
      text-align: center;
      padding: 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      background: var(--card);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .wizard-step.active {
      background: rgba(84,39,200,0.06);
      color: var(--primary);
      border-color: var(--primary);
    }
    .wizard-step.done {
      background: rgba(22,163,74,0.06);
      color: var(--success);
      border-color: var(--success);
    }
    .wizard-body { margin-bottom: 24px; }
    .wizard-actions {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .wizard-result {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Moderation */
    .block-form {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-wrap: wrap;
    }
    .block-form .form-group { margin-bottom: 0; flex: 1; min-width: 120px; }

    /* Info card */
    .info-card {
      background: rgba(84,39,200,0.04);
      border: 1px solid rgba(84,39,200,0.15);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .info-card h3 {
      font-size: 14px;
      color: var(--primary);
      margin-bottom: 6px;
    }
    .info-card p {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Settings */
    .settings-group {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .settings-group-title {
      font-family: "Besley", Georgia, serif;
      font-size: 16px;
      font-weight: 800;
      color: var(--text-bright);
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .settings-group.collapsed .settings-group-body { display: none; }
    .settings-group.collapsed .settings-group-title {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
      cursor: pointer;
    }
    .setting-field {
      padding: 12px 0;
      border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .setting-field:last-child { border-bottom: none; }
    .setting-field-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .setting-field-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .setting-field-env {
      font-size: 11px;
      color: var(--text-muted);
      font-family: "SF Mono", "Fira Code", monospace;
    }
    .setting-field-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .setting-field-input {
      max-width: 400px;
    }
    .setting-field-input .form-input {
      font-size: 13px;
    }

    /* Save bar */
    .save-bar {
      position: fixed;
      bottom: 0;
      left: 220px;
      right: 0;
      background: var(--card);
      border-top: 2px solid var(--primary);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 100;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.08);
      transform: translateY(100%);
      transition: transform 0.2s ease;
    }
    .save-bar.visible { transform: translateY(0); }
    .save-bar-info {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .save-bar-actions {
      display: flex;
      gap: 8px;
    }

    /* Restart banner */
    .restart-banner {
      background: rgba(217,119,6,0.08);
      border: 1px solid rgba(217,119,6,0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 13px;
      color: var(--warning);
      font-weight: 600;
      display: none;
    }
    .restart-banner.visible { display: flex; align-items: center; gap: 12px; }
    .restart-banner .btn-restart {
      margin-left: auto;
      background: var(--warning);
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .restart-banner .btn-restart:hover { opacity: 0.9; }

    /* Restart overlay */
    .restart-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .restart-overlay-content {
      background: var(--card);
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      max-width: 360px;
    }
    .restart-overlay-content h3 {
      margin-top: 16px;
      font-size: 18px;
    }
    .restart-overlay-content p {
      margin-top: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .sidebar { width: 60px; }
      .sidebar-brand h1, .sidebar-brand span, .nav-label, .sidebar-footer { display: none; }
      .sidebar-brand { justify-content: center; padding: 12px; }
      .nav-item { justify-content: center; padding: 12px; }
      .main { margin-left: 60px; padding: 16px; }
      .card-grid { grid-template-columns: 1fr 1fr; }
      .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
      .dashboard-grid > *, .span-4, .span-6, .span-8, .span-12 { grid-column: span 2 !important; }
      .card-hero .card-value { font-size: 24px; }
      .gateway-summary { flex-wrap: wrap; gap: 12px; }
      .save-bar { left: 60px; }
    }
    @media (min-width: 769px) and (max-width: 1024px) {
      .dashboard-grid { grid-template-columns: repeat(6, 1fr); }
      .dashboard-grid > * { grid-column: span 3; }
      .card-hero { grid-column: span 3 !important; }
      .span-8 { grid-column: span 6 !important; }
      .span-12 { grid-column: span 6 !important; }
    }

    /* Auth screen */
    .auth-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100%;
      background: var(--bg);
    }
    .auth-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      width: 360px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .auth-box h2 {
      font-size: 18px;
      color: var(--text-bright);
      margin-bottom: 8px;
    }
    .auth-box p {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }
    .auth-error {
      color: var(--danger);
      font-size: 12px;
      margin-top: 8px;
      display: none;
    }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 13px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      animation: slideIn 0.3s ease;
    }
    .toast.success { border-color: var(--success); }
    .toast.error { border-color: var(--danger); }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* Page sections that are hidden by default */
    .page { display: none; }
    .page.active { display: block; }

    /* Time range selector */
    .time-range {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
    }
    .time-range button {
      padding: 4px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    .time-range button.active {
      background: rgba(84,39,200,0.06);
      border-color: var(--primary);
      color: var(--primary);
    }
  `;
}

function clientJs(): string {
  return `
    const BASE = '/api';
    let authToken = sessionStorage.getItem('wayfinder_admin_token') || '';
    let currentPage = 'status';
    let statusInterval = null;
    let gatewaysInterval = null;
    let setupData = {
      baseDomain: '',
      port: 3000,
      rootHostContent: '',
      defaultMode: 'proxy',
      routingStrategy: 'temperature',
      gatewaySource: 'network',
      verificationEnabled: true,
      verificationSource: 'top-staked',
      verificationCount: 3,
      consensusThreshold: 2,
    };
    let wizardStep = 0;

    // =========== SETTINGS STATE ===========
    let settingsState = {};
    let settingsOriginal = {};
    let settingsDirty = {};
    let settingsNeedsRestart = false;
    let settingsAdvancedExpanded = false;
    let lastGatewayData = null;

    const SETTINGS_SCHEMA = [
      // Server
      { group: 'Server', key: 'PORT', label: 'Port', type: 'number', configPath: 'server.port', description: 'Port the public router listens on.', default: 3000, min: 1, max: 65535 },
      { group: 'Server', key: 'HOST', label: 'Host', type: 'string', configPath: 'server.host', description: 'Bind address for the public server.', default: '0.0.0.0', placeholder: '0.0.0.0' },
      { group: 'Server', key: 'BASE_DOMAIN', label: 'Base Domain', type: 'string', configPath: 'server.baseDomain', description: 'Domain the router serves content on. Subdomains are used for ArNS names.', default: 'localhost', placeholder: 'e.g. permaweb.nexus' },
      { group: 'Server', key: 'ROOT_HOST_CONTENT', label: 'Root Host Content', type: 'string', configPath: 'server.rootHostContent', description: 'ArNS name or txId to serve at the root domain. Leave empty to show the default landing page.', default: '', placeholder: 'ArNS name or txId' },
      { group: 'Server', key: 'RESTRICT_TO_ROOT_HOST', label: 'Restrict to Root Host', type: 'boolean', configPath: 'server.restrictToRootHost', description: 'When enabled, only serves root host content. Blocks subdomain and txId path requests.', default: false },
      { group: 'Server', key: 'GRAPHQL_PROXY_URL', label: 'GraphQL Proxy URL', type: 'string', configPath: 'server.graphqlProxyUrl', description: 'Upstream GraphQL endpoint for /graphql proxy. Leave empty to disable.', default: '', placeholder: 'https://arweave.net/graphql' },

      // Mode
      { group: 'Mode', key: 'DEFAULT_MODE', label: 'Default Mode', type: 'enum', configPath: 'mode.default', description: 'How the router handles content requests.', default: 'proxy', options: [
        { value: 'proxy', label: 'Proxy', desc: 'Fetch, verify, cache, and serve content' },
        { value: 'route', label: 'Route', desc: 'Redirect clients to an ar.io gateway' }
      ]},
      { group: 'Mode', key: 'ALLOW_MODE_OVERRIDE', label: 'Allow Mode Override', type: 'boolean', configPath: 'mode.allowOverride', description: 'Allow clients to override the mode via X-Router-Mode header.', default: true },

      // Routing
      { group: 'Routing', key: 'ROUTING_STRATEGY', label: 'Routing Strategy', type: 'enum', configPath: 'routing.strategy', description: 'Algorithm for selecting gateways to fetch content from.', default: 'fastest', options: [
        { value: 'temperature', label: 'Temperature', desc: 'Learns best-performing gateways over time' },
        { value: 'fastest', label: 'Fastest', desc: 'Concurrent ping, use first responder' },
        { value: 'random', label: 'Random', desc: 'Random selection from healthy gateways' },
        { value: 'round-robin', label: 'Round Robin', desc: 'Sequential rotation through gateways' }
      ]},
      { group: 'Routing', key: 'ROUTING_GATEWAY_SOURCE', label: 'Gateway Source', type: 'enum', configPath: 'routing.gatewaySource', description: 'Where to discover gateways for routing.', default: 'network', options: [
        { value: 'network', label: 'Network', desc: 'Auto-discover from ar.io registry' },
        { value: 'trusted-peers', label: 'Trusted Peers', desc: 'Use a trusted gateway\\'s peer list' },
        { value: 'trusted-ario', label: 'Trusted ar.io', desc: 'Use specific trusted ar.io gateways' },
        { value: 'static', label: 'Static', desc: 'Manually specified gateways' }
      ]},
      { group: 'Routing', key: 'TRUSTED_PEER_GATEWAY', label: 'Trusted Peer Gateway', type: 'string', configPath: 'routing.trustedPeerGateway', description: 'Gateway to query for trusted peers (when source is trusted-peers).', default: 'https://turbo-gateway.com', placeholder: 'https://turbo-gateway.com' },
      { group: 'Routing', key: 'ROUTING_STATIC_GATEWAYS', label: 'Static Gateways', type: 'urllist', configPath: 'routing.staticGateways', description: 'Comma-separated gateway URLs (when source is static).', default: '', placeholder: 'https://gw1.com, https://gw2.com' },
      { group: 'Routing', key: 'TRUSTED_ARIO_GATEWAYS', label: 'Trusted ar.io Gateways', type: 'urllist', configPath: 'routing.trustedArioGateways', description: 'Comma-separated trusted ar.io gateway URLs (when source is trusted-ario).', default: '', placeholder: 'https://turbo-gateway.com, https://ardrive.net' },
      { group: 'Routing', key: 'RETRY_ATTEMPTS', label: 'Retry Attempts', type: 'number', configPath: 'routing.retryAttempts', description: 'Number of different gateways to try before giving up.', default: 3, min: 1, max: 10 },
      { group: 'Routing', key: 'RETRY_DELAY_MS', label: 'Retry Delay (ms)', type: 'number', configPath: 'routing.retryDelayMs', description: 'Delay between retry attempts in milliseconds.', default: 100, min: 0, max: 10000 },
      { group: 'Routing', key: 'TEMPERATURE_WINDOW_MS', label: 'Temperature Window (ms)', type: 'number', configPath: 'routing.temperatureWindowMs', description: 'Time window for temperature strategy scoring. Only relevant when using temperature routing.', default: 300000, min: 60000 },
      { group: 'Routing', key: 'TEMPERATURE_MAX_SAMPLES', label: 'Temperature Max Samples', type: 'number', configPath: 'routing.temperatureMaxSamples', description: 'Maximum samples tracked per gateway for temperature scoring.', default: 100, min: 10, max: 1000 },

      // Verification
      { group: 'Verification', key: 'VERIFICATION_ENABLED', label: 'Verification Enabled', type: 'boolean', configPath: 'verification.enabled', description: 'Verify content hashes against trusted gateways before serving. Highly recommended for security.', default: true },
      { group: 'Verification', key: 'VERIFICATION_GATEWAY_SOURCE', label: 'Verification Source', type: 'enum', configPath: 'verification.gatewaySource', description: 'Where to get trusted gateways for hash verification.', default: 'top-staked', options: [
        { value: 'top-staked', label: 'Top Staked', desc: 'Highest-staked ar.io gateways as trust anchors' },
        { value: 'static', label: 'Static', desc: 'Manually specified trusted gateways' }
      ]},
      { group: 'Verification', key: 'VERIFICATION_GATEWAY_COUNT', label: 'Gateway Count', type: 'number', configPath: 'verification.gatewayCount', description: 'Number of top-staked gateways to use for verification.', default: 3, min: 1, max: 50 },
      { group: 'Verification', key: 'VERIFICATION_STATIC_GATEWAYS', label: 'Static Gateways', type: 'urllist', configPath: 'verification.staticGateways', description: 'Comma-separated trusted gateway URLs (when source is static).', default: '', placeholder: 'https://turbo-gateway.com, https://ardrive.net' },
      { group: 'Verification', key: 'ARNS_CONSENSUS_THRESHOLD', label: 'Consensus Threshold', type: 'number', configPath: 'verification.consensusThreshold', description: 'Minimum gateways that must agree on an ArNS resolution. Must be at least 2 for security.', default: 2, min: 2, max: 10 },
      { group: 'Verification', key: 'VERIFICATION_RETRY_ATTEMPTS', label: 'Retry Attempts', type: 'number', configPath: 'verification.retryAttempts', description: 'Number of different gateways to try for verification.', default: 3, min: 1, max: 10 },

      // Network Gateways
      { group: 'Network Gateways', key: 'NETWORK_GATEWAY_REFRESH_MS', label: 'Refresh Interval (ms)', type: 'number', configPath: 'networkGateways.refreshIntervalMs', description: 'How often to refresh gateway lists from the ar.io network.', default: 86400000, min: 60000 },
      { group: 'Network Gateways', key: 'NETWORK_MIN_GATEWAYS', label: 'Minimum Gateways', type: 'number', configPath: 'networkGateways.minGateways', description: 'Minimum gateways required to operate (fail-safe).', default: 3, min: 1 },
      { group: 'Network Gateways', key: 'NETWORK_FALLBACK_GATEWAYS', label: 'Fallback Gateways', type: 'urllist', configPath: 'networkGateways.fallbackGateways', description: 'Fallback gateways if network discovery fails.', default: '', placeholder: 'https://turbo-gateway.com, https://ardrive.net' },

      // Cache
      { group: 'Cache', key: 'CONTENT_CACHE_ENABLED', label: 'Content Cache', type: 'boolean', configPath: 'cache.contentEnabled', description: 'Cache verified content for faster repeat requests.', default: true },
      { group: 'Cache', key: 'CONTENT_CACHE_MAX_SIZE_BYTES', label: 'Max Cache Size (bytes)', type: 'number', configPath: 'cache.contentMaxSizeBytes', description: 'Maximum total cache size in bytes.', default: 53687091200, min: 0 },
      { group: 'Cache', key: 'CONTENT_CACHE_MAX_ITEM_SIZE_BYTES', label: 'Max Item Size (bytes)', type: 'number', configPath: 'cache.contentMaxItemSizeBytes', description: 'Maximum size of a single cached item.', default: 2147483648, min: 0 },
      { group: 'Cache', key: 'CONTENT_CACHE_PATH', label: 'Disk Path', type: 'string', configPath: 'cache.contentPath', description: 'Disk path for persistent cache. Leave empty for in-memory only.', default: '', placeholder: './data/cache' },
      { group: 'Cache', key: 'ARNS_CACHE_TTL_MS', label: 'ArNS Cache TTL (ms)', type: 'number', configPath: 'cache.arnsTtlMs', description: 'Time-to-live for cached ArNS name resolutions.', default: 300000, min: 1000 },

      // Telemetry
      { group: 'Telemetry', key: 'TELEMETRY_ENABLED', label: 'Telemetry', type: 'boolean', configPath: 'telemetry.enabled', description: 'Collect performance metrics and gateway statistics.', default: true },
      { group: 'Telemetry', key: 'TELEMETRY_ROUTER_ID', label: 'Router ID', type: 'string', configPath: 'telemetry.routerId', description: 'Unique identifier for this router instance.', default: '', placeholder: 'my-router-1' },
      { group: 'Telemetry', key: 'TELEMETRY_SAMPLE_SUCCESS', label: 'Sample Rate (Success)', type: 'number', configPath: 'telemetry.sampling.successfulRequests', description: 'Fraction of successful requests to record (0.0-1.0).', default: 0.1, min: 0, max: 1 },
      { group: 'Telemetry', key: 'TELEMETRY_SAMPLE_ERRORS', label: 'Sample Rate (Errors)', type: 'number', configPath: 'telemetry.sampling.errors', description: 'Fraction of error requests to record (0.0-1.0).', default: 1.0, min: 0, max: 1 },
      { group: 'Telemetry', key: 'TELEMETRY_SAMPLE_LATENCY', label: 'Sample Rate (Latency)', type: 'number', configPath: 'telemetry.sampling.latencyMeasurements', description: 'Fraction of requests to measure latency for (0.0-1.0).', default: 0.1, min: 0, max: 1 },
      { group: 'Telemetry', key: 'TELEMETRY_RETENTION_DAYS', label: 'Retention Days', type: 'number', configPath: 'telemetry.retentionDays', description: 'How many days to keep telemetry data.', default: 30, min: 1 },

      // Rate Limiting
      { group: 'Rate Limiting', key: 'RATE_LIMIT_ENABLED', label: 'Rate Limiting', type: 'boolean', configPath: 'rateLimit.enabled', description: 'Enable per-IP rate limiting for public requests.', default: false },
      { group: 'Rate Limiting', key: 'RATE_LIMIT_WINDOW_MS', label: 'Window (ms)', type: 'number', configPath: 'rateLimit.windowMs', description: 'Time window for rate limit counting.', default: 60000, min: 1000 },
      { group: 'Rate Limiting', key: 'RATE_LIMIT_MAX_REQUESTS', label: 'Max Requests', type: 'number', configPath: 'rateLimit.maxRequests', description: 'Maximum requests per IP per window.', default: 1000, min: 1 },

      // Ping
      { group: 'Ping', key: 'PING_ENABLED', label: 'Ping Service', type: 'boolean', configPath: 'ping.enabled', description: 'Periodically ping gateways to measure performance.', default: true },
      { group: 'Ping', key: 'PING_INTERVAL_HOURS', label: 'Interval (hours)', type: 'number', configPath: 'ping.intervalHours', description: 'How often to run ping rounds.', default: 4, min: 1 },
      { group: 'Ping', key: 'PING_GATEWAY_COUNT', label: 'Gateway Count', type: 'number', configPath: 'ping.gatewayCount', description: 'Number of gateways to ping per round.', default: 50, min: 1, max: 200 },
      { group: 'Ping', key: 'PING_TIMEOUT_MS', label: 'Timeout (ms)', type: 'number', configPath: 'ping.timeoutMs', description: 'Ping timeout per gateway.', default: 5000, min: 1000, max: 30000 },
      { group: 'Ping', key: 'PING_CONCURRENCY', label: 'Concurrency', type: 'number', configPath: 'ping.concurrency', description: 'Max concurrent pings.', default: 10, min: 1, max: 50 },

      // Arweave API
      { group: 'Arweave API', key: 'ARWEAVE_API_ENABLED', label: 'Arweave API', type: 'boolean', configPath: 'arweaveApi.enabled', description: 'Proxy Arweave HTTP API endpoints (/info, /tx, /block, etc.).', default: false },
      { group: 'Arweave API', key: 'ARWEAVE_READ_NODES', label: 'Read Nodes', type: 'urllist', configPath: 'arweaveApi.readNodes', description: 'Arweave nodes for GET requests (chain state queries).', default: '', placeholder: 'http://tip-1.arweave.xyz:1984' },
      { group: 'Arweave API', key: 'ARWEAVE_WRITE_NODES', label: 'Write Nodes', type: 'urllist', configPath: 'arweaveApi.writeNodes', description: 'Arweave nodes for POST requests (tx submission). Falls back to read nodes.', default: '', placeholder: 'http://arweave-peer:1984' },
      { group: 'Arweave API', key: 'ARWEAVE_API_RETRY_ATTEMPTS', label: 'Retry Attempts', type: 'number', configPath: 'arweaveApi.retryAttempts', description: 'Retries for failed Arweave API requests.', default: 3, min: 1, max: 10 },
      { group: 'Arweave API', key: 'ARWEAVE_API_TIMEOUT_MS', label: 'Timeout (ms)', type: 'number', configPath: 'arweaveApi.timeoutMs', description: 'Timeout for Arweave API requests.', default: 30000, min: 1000 },

      // Advanced group
      { group: 'Advanced', key: 'GATEWAY_HEALTH_TTL_MS', label: 'Health TTL (ms)', type: 'number', configPath: 'resilience.gatewayHealthTtlMs', description: 'How long gateway health status is cached.', default: 300000, min: 1000 },
      { group: 'Advanced', key: 'CIRCUIT_BREAKER_THRESHOLD', label: 'Circuit Breaker Threshold', type: 'number', configPath: 'resilience.circuitBreakerThreshold', description: 'Consecutive failures before a gateway is circuit-broken.', default: 3, min: 1 },
      { group: 'Advanced', key: 'CIRCUIT_BREAKER_RESET_MS', label: 'Circuit Breaker Reset (ms)', type: 'number', configPath: 'resilience.circuitBreakerResetMs', description: 'Time before a circuit-broken gateway is retried.', default: 60000, min: 1000 },
      { group: 'Advanced', key: 'GATEWAY_HEALTH_MAX_ENTRIES', label: 'Health Max Entries', type: 'number', configPath: 'resilience.gatewayHealthMaxEntries', description: 'Max gateway health entries tracked.', default: 1000, min: 10 },
      { group: 'Advanced', key: 'STREAM_TIMEOUT_MS', label: 'Stream Timeout (ms)', type: 'number', configPath: 'resilience.streamTimeoutMs', description: 'Timeout per chunk when streaming content.', default: 120000, min: 10000 },
      { group: 'Advanced', key: 'HTTP_CONNECTIONS_PER_HOST', label: 'Connections/Host', type: 'number', configPath: 'http.connectionsPerHost', description: 'Max concurrent connections per gateway host.', default: 10, min: 1, max: 100 },
      { group: 'Advanced', key: 'HTTP_CONNECT_TIMEOUT_MS', label: 'Connect Timeout (ms)', type: 'number', configPath: 'http.connectTimeoutMs', description: 'TCP connection timeout.', default: 30000, min: 1000 },
      { group: 'Advanced', key: 'HTTP_REQUEST_TIMEOUT_MS', label: 'Request Timeout (ms)', type: 'number', configPath: 'http.requestTimeoutMs', description: 'Full request timeout including body transfer.', default: 30000, min: 5000 },
      { group: 'Advanced', key: 'HTTP_KEEPALIVE_TIMEOUT_MS', label: 'Keep-Alive Timeout (ms)', type: 'number', configPath: 'http.keepAliveTimeoutMs', description: 'Idle connection keep-alive timeout.', default: 60000, min: 10000 },
      { group: 'Advanced', key: 'SHUTDOWN_DRAIN_TIMEOUT_MS', label: 'Drain Timeout (ms)', type: 'number', configPath: 'shutdown.drainTimeoutMs', description: 'Grace period for in-flight requests during shutdown.', default: 15000, min: 1000 },
      { group: 'Advanced', key: 'SHUTDOWN_TIMEOUT_MS', label: 'Shutdown Timeout (ms)', type: 'number', configPath: 'shutdown.shutdownTimeoutMs', description: 'Max total shutdown wait before force exit.', default: 30000, min: 5000 },
      { group: 'Advanced', key: 'EXIT_ON_UNHANDLED_REJECTION', label: 'Exit on Unhandled Rejection', type: 'boolean', configPath: 'errorHandling.exitOnUnhandledRejection', description: 'Exit process on unhandled promise rejections.', default: true },
      { group: 'Advanced', key: 'EXIT_ON_UNCAUGHT_EXCEPTION', label: 'Exit on Uncaught Exception', type: 'boolean', configPath: 'errorHandling.exitOnUncaughtException', description: 'Exit process on uncaught exceptions.', default: true },
      { group: 'Advanced', key: 'EXIT_GRACE_PERIOD_MS', label: 'Exit Grace Period (ms)', type: 'number', configPath: 'errorHandling.exitGracePeriodMs', description: 'Grace period before force exit on fatal errors.', default: 3000, min: 0, max: 30000 },
      { group: 'Advanced', key: 'LOG_LEVEL', label: 'Log Level', type: 'enum', configPath: 'logging.level', description: 'Minimum log level to output.', default: 'info', options: [
        { value: 'trace', label: 'Trace' },
        { value: 'debug', label: 'Debug' },
        { value: 'info', label: 'Info' },
        { value: 'warn', label: 'Warn' },
        { value: 'error', label: 'Error' },
        { value: 'fatal', label: 'Fatal' }
      ]},
      { group: 'Advanced', key: 'MODERATION_ENABLED', label: 'Moderation', type: 'boolean', configPath: 'moderation.enabled', description: 'Enable content moderation and blocklist support.', default: false },
      { group: 'Advanced', key: 'MODERATION_BLOCKLIST_PATH', label: 'Blocklist Path', type: 'string', configPath: 'moderation.blocklistPath', description: 'Path to the blocklist JSON file.', default: './data/blocklist.json', placeholder: './data/blocklist.json' },
      { group: 'Advanced', key: 'ADMIN_UI_ENABLED', label: 'Admin UI', type: 'boolean', configPath: 'admin.enabled', description: 'Enable this admin dashboard.', default: true },
      { group: 'Advanced', key: 'ADMIN_PORT', label: 'Admin Port', type: 'number', configPath: 'admin.port', description: 'Port for the admin UI (must differ from public port).', default: 3001, min: 1, max: 65535 },
      { group: 'Advanced', key: 'ADMIN_HOST', label: 'Admin Host', type: 'string', configPath: 'admin.host', description: 'Bind address for admin UI. Use 127.0.0.1 for local-only access.', default: '127.0.0.1', placeholder: '127.0.0.1' },
    ];

    // Fetch wrapper with auth
    async function api(path, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const res = await fetch(BASE + path, { ...opts, headers });
      if (res.status === 401) {
        showAuth();
        throw new Error('Unauthorized');
      }
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (ct.includes('application/json')) {
          const err = await res.json();
          throw new Error(err.error || 'Request failed');
        }
        throw new Error('Request failed (' + res.status + ')');
      }
      return res.json();
    }

    // Router
    function navigate(page) {
      currentPage = page;
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.page === page);
      });
      document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === 'page-' + page);
      });

      clearInterval(statusInterval);
      clearInterval(gatewaysInterval);

      // Hide save bar when leaving settings page
      if (page !== 'settings') {
        const bar = document.getElementById('save-bar');
        if (bar) bar.classList.remove('visible');
      }

      if (page === 'status') loadStatus();
      else if (page === 'gateways') loadGateways();
      else if (page === 'telemetry') loadTelemetry();
      else if (page === 'moderation') loadModeration();
      else if (page === 'settings') loadSettings();
    }

    function showAuth() {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }

    function hideAuth() {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
    }

    async function doLogin() {
      const input = document.getElementById('auth-input');
      authToken = input.value.trim();
      sessionStorage.setItem('wayfinder_admin_token', authToken);
      try {
        await api('/status');
        hideAuth();
        navigate('status');
      } catch(e) {
        document.getElementById('auth-error').style.display = 'block';
      }
    }

    function toast(msg, type = 'success') {
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      const saveBar = document.querySelector('.save-bar.visible');
      if (saveBar) el.style.bottom = '80px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatUptime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return d + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm';
      if (h > 0) return h + 'h ' + (m % 60) + 'm';
      return m + 'm ' + (s % 60) + 's';
    }

    function formatNumber(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }

    function pct(v) { return (v * 100).toFixed(1) + '%'; }

    function escHtml(s) {
      if (typeof s !== 'string') s = String(s ?? '');
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Resolve nested config path like "server.port" -> value
    function resolveConfigPath(obj, path) {
      const parts = path.split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      // Treat null as undefined (empty)
      if (cur === null || cur === undefined) return undefined;
      // Convert URL arrays to comma-separated strings
      if (Array.isArray(cur)) return cur.join(', ');
      return cur;
    }

    // =========== STATUS PAGE ===========
    async function loadStatus() {
      try {
        const data = await api('/status');
        renderStatus(data);
        statusInterval = setInterval(async () => {
          try {
            const d = await api('/status');
            renderStatus(d);
          } catch(e) {}
        }, 10000);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('status-content').innerHTML = '<p style="color:var(--danger)">Failed to load status</p>';
      }
    }

    function renderStatus(d) {
      const el = document.getElementById('status-content');
      const gw = d.gateways || {};
      const cache = d.cache || {};
      const ping = d.ping || {};
      const total = gw.total || 0;
      const healthy = gw.healthy || 0;
      const unhealthy = gw.unhealthy || 0;
      const circuitOpen = gw.circuitOpen || 0;
      const healthyPct = total > 0 ? (healthy / total * 100) : 0;
      const unhealthyPct = total > 0 ? (unhealthy / total * 100) : 0;
      const circuitPct = total > 0 ? (circuitOpen / total * 100) : 0;
      const cacheUtil = cache.utilizationPercent || 0;
      const cacheClass = cacheUtil > 90 ? 'critical' : cacheUtil > 70 ? 'high' : '';

      el.innerHTML = \`
        <div class="dashboard-grid">
          <div class="card card-hero">
            <div class="card-label">Uptime</div>
            <div class="card-value">\${formatUptime(d.uptimeMs || 0)}</div>
            <div class="card-sub"><span class="dot"></span>Running</div>
          </div>
          <div class="card card-accent-purple">
            <div class="card-label">Mode</div>
            <div class="card-value small"><span class="badge \${d.mode === 'proxy' ? 'badge-proxy' : 'badge-route'}">\${d.mode || 'proxy'}</span></div>
            <div class="card-sub">\${d.mode === 'proxy' ? 'Fetch, verify, serve' : 'Redirect to gateway'}</div>
          </div>
          <div class="card card-accent-amber">
            <div class="card-label">Verification</div>
            <div class="card-value small"><span class="badge \${d.verificationEnabled ? 'badge-on' : 'badge-off'}">\${d.verificationEnabled ? 'Enabled' : 'Disabled'}</span></div>
            <div class="card-sub">\${d.verificationEnabled ? (d.verificationSource + ', ' + d.verificationCount + ' gateways') : 'Content served without verification'}</div>
          </div>
          <div class="card card-accent-blue">
            <div class="card-label">Routing</div>
            <div class="card-value small">\${d.routingStrategy || 'temperature'}</div>
            <div class="card-sub">\${total} gateways tracked</div>
          </div>

          <div class="health-bar-container span-12" style="margin-bottom:0;">
            <div class="health-bar-label">Gateway Health &mdash; \${total} gateways</div>
            <div class="health-bar">
              <div class="segment healthy" style="width:\${healthyPct}%"></div>
              <div class="segment unhealthy" style="width:\${unhealthyPct}%"></div>
              <div class="segment circuit-open" style="width:\${circuitPct}%"></div>
            </div>
            <div class="health-bar-legend">
              <span><span class="legend-dot" style="background:var(--success)"></span>\${healthy} healthy</span>
              <span><span class="legend-dot" style="background:var(--danger)"></span>\${unhealthy} unhealthy</span>
              <span><span class="legend-dot" style="background:var(--warning)"></span>\${circuitOpen} circuit-open</span>
            </div>
          </div>

          <div class="section span-8" style="margin-bottom:0;">
            <div class="section-title">Content Cache</div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span>\${formatBytes(cache.sizeBytes || 0)} / \${formatBytes(cache.maxSizeBytes || 0)}</span>
              <span>\${cacheUtil.toFixed(1)}%</span>
            </div>
            <div class="progress-bar"><div class="fill \${cacheClass}" style="width:\${cacheUtil}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:8px;">
              <span>\${cache.entries || 0} entries</span>
              <span>Hit rate: \${cache.hitRate !== undefined ? pct(cache.hitRate) : 'N/A'}</span>
              <span>\${cache.diskBacked ? 'Disk-backed' : 'In-memory'}</span>
            </div>
          </div>
          <div class="section span-4" style="margin-bottom:0;">
            <div class="section-title">Ping Service</div>
            \${ping.initialized ? \`
              <div class="stat-row">
                <span class="stat-row-label">Rounds</span>
                <span class="stat-row-value">\${ping.roundsCompleted}</span>
              </div>
              <div class="stat-row">
                <span class="stat-row-label">Success</span>
                <span class="stat-row-value">\${ping.successfulPings}/\${ping.totalPings}</span>
              </div>
              \${ping.nextPingInMs ? \`<div class="stat-row">
                <span class="stat-row-label">Next ping</span>
                <span class="stat-row-value">\${formatUptime(ping.nextPingInMs)}</span>
              </div>\` : ''}
            \` : '<div style="font-size:13px;color:var(--text-muted);">Not initialized</div>'}
          </div>
        </div>
      \`;
    }

    // =========== GATEWAYS PAGE ===========
    let gatewaySort = { col: 'gateway', asc: true };
    async function loadGateways() {
      try {
        const data = await api('/gateways');
        lastGatewayData = data;
        renderGateways(data);
        gatewaysInterval = setInterval(async () => {
          try {
            const d = await api('/gateways');
            lastGatewayData = d;
            renderGateways(d);
          } catch(e) {}
        }, 30000);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('gateways-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function sortGateways(gateways, col, asc) {
      return [...gateways].sort((a, b) => {
        let va = a[col], vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? (va - vb) : (vb - va);
      });
    }

    function renderGateways(data) {
      const el = document.getElementById('gateways-content');
      const gateways = data.gateways || [];
      const sorted = sortGateways(gateways, gatewaySort.col, gatewaySort.asc);

      const arrow = (col) => gatewaySort.col === col ? (gatewaySort.asc ? ' \\u25B2' : ' \\u25BC') : '';

      const healthyCount = gateways.filter(g => g.health === 'healthy').length;
      const unhealthyCount = gateways.filter(g => g.health === 'unhealthy').length;
      const circuitCount = gateways.filter(g => g.health === 'circuit-open').length;

      el.innerHTML = \`
        <div class="gateway-summary">
          <div class="gateway-summary-item"><strong>\${gateways.length}</strong> Total</div>
          <div class="gateway-summary-item"><span class="dot green"></span><strong>\${healthyCount}</strong> Healthy</div>
          <div class="gateway-summary-item"><span class="dot red"></span><strong>\${unhealthyCount}</strong> Unhealthy</div>
          <div class="gateway-summary-item"><span class="dot orange"></span><strong>\${circuitCount}</strong> Circuit Open</div>
        </div>
        <div class="section">
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th onclick="sortGatewayCol('gateway')">Gateway\${arrow('gateway')}</th>
                  <th onclick="sortGatewayCol('health')">Health\${arrow('health')}</th>
                  <th onclick="sortGatewayCol('score')">Score\${arrow('score')}</th>
                  <th onclick="sortGatewayCol('latencyMs')">Latency\${arrow('latencyMs')}</th>
                  <th onclick="sortGatewayCol('successRate')">Success\${arrow('successRate')}</th>
                  <th onclick="sortGatewayCol('requests')">Requests\${arrow('requests')}</th>
                  <th onclick="sortGatewayCol('bytesServed')">Bytes\${arrow('bytesServed')}</th>
                </tr>
              </thead>
              <tbody>
                \${sorted.map(g => \`
                  <tr>
                    <td>\${escHtml(g.gateway)}</td>
                    <td><span class="dot \${g.health === 'healthy' ? 'green' : g.health === 'circuit-open' ? 'orange' : 'red'}"></span>\${escHtml(g.health)}</td>
                    <td>\${g.score !== null && g.score !== undefined ? g.score.toFixed(0) : '-'}</td>
                    <td>\${g.latencyMs !== null && g.latencyMs !== undefined ? g.latencyMs.toFixed(0) + 'ms' : '-'}</td>
                    <td>\${g.successRate !== null && g.successRate !== undefined ? pct(g.successRate) : '-'}</td>
                    <td>\${formatNumber(g.requests || 0)}</td>
                    <td>\${formatBytes(g.bytesServed || 0)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    function sortGatewayCol(col) {
      if (gatewaySort.col === col) gatewaySort.asc = !gatewaySort.asc;
      else { gatewaySort.col = col; gatewaySort.asc = true; }
      // Sort locally using cached data instead of re-fetching
      if (lastGatewayData) {
        renderGateways(lastGatewayData);
      }
    }

    // =========== TELEMETRY PAGE ===========
    let telemetryRange = '24h';
    async function loadTelemetry() {
      try {
        const data = await api('/telemetry?range=' + telemetryRange);
        renderTelemetry(data);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('telemetry-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function renderTelemetry(data) {
      const el = document.getElementById('telemetry-content');
      if (!data.enabled) {
        el.innerHTML = '<div class="info-card"><h3>Telemetry Disabled</h3><p>Set TELEMETRY_ENABLED=true to collect performance data.</p></div>';
        return;
      }
      const stats = data.gateways || [];
      const totals = data.totals || {};

      el.innerHTML = \`
        <div class="time-range">
          \${['1h','6h','24h','7d'].map(r => \`<button class="\${telemetryRange === r ? 'active' : ''}" onclick="telemetryRange='\${r}';loadTelemetry()">\${r}</button>\`).join('')}
        </div>
        <div class="dashboard-grid">
          <div class="card card-stat-green">
            <div class="card-label">Total Requests</div>
            <div class="card-value">\${formatNumber(totals.totalRequests || 0)}</div>
          </div>
          <div class="card card-stat-purple">
            <div class="card-label">Success Rate</div>
            <div class="card-value">\${totals.totalRequests ? pct((totals.successfulRequests || 0) / totals.totalRequests) : 'N/A'}</div>
          </div>
          <div class="card card-stat-blue">
            <div class="card-label">Bytes Served</div>
            <div class="card-value">\${formatBytes(totals.totalBytesServed || 0)}</div>
          </div>
          <div class="card card-stat-amber">
            <div class="card-label">Active Gateways</div>
            <div class="card-value">\${totals.activeGateways || 0}</div>
          </div>
          <div class="section span-12" style="margin-bottom:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div class="section-title" style="margin:0;">Gateway Performance</div>
              <button class="btn btn-sm" onclick="exportTelemetry()">Export CSV</button>
            </div>
            <div style="overflow-x:auto;">
              <table class="data-table">
              <thead>
                <tr>
                  <th>Gateway</th>
                  <th>Requests</th>
                  <th>Success</th>
                  <th>Avg Latency</th>
                  <th>Bytes</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                \${stats.map(g => \`
                  <tr>
                    <td>\${escHtml(g.gateway)}</td>
                    <td>\${formatNumber(g.totalRequests || 0)}</td>
                    <td>\${g.successRate !== undefined ? pct(g.successRate) : '-'}</td>
                    <td>\${g.avgLatencyMs ? g.avgLatencyMs.toFixed(0) + 'ms' : '-'}</td>
                    <td>\${formatBytes(g.bytesServed || 0)}</td>
                    <td>\${g.availabilityRate !== undefined ? pct(g.availabilityRate) : '-'}</td>
                  </tr>
                \`).join('')}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      \`;
    }

    async function exportTelemetry() {
      try {
        const headers = authToken ? { 'Authorization': 'Bearer ' + authToken } : {};
        const res = await fetch(BASE + '/telemetry/export?format=csv&range=' + telemetryRange, { headers });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'telemetry-export.csv'; a.click();
        URL.revokeObjectURL(url);
        toast('Export downloaded');
      } catch(e) { toast('Export failed', 'error'); }
    }

    // =========== MODERATION PAGE ===========
    async function loadModeration() {
      try {
        const data = await api('/moderation');
        renderModeration(data);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('moderation-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function renderModeration(data) {
      const el = document.getElementById('moderation-content');
      if (!data.enabled) {
        el.innerHTML = \`
          <div class="info-card">
            <h3>Content Moderation Disabled</h3>
            <p>To enable content moderation, set these environment variables:<br><br>
            <code>MODERATION_ENABLED=true</code><br>
            <code>MODERATION_ADMIN_TOKEN=your-secret-token</code><br><br>
            Then restart the router.</p>
          </div>
        \`;
        return;
      }
      const stats = data.stats || {};
      const entries = data.entries || [];

      el.innerHTML = \`
        <div class="card-grid">
          <div class="card">
            <div class="card-label">Blocked ArNS Names</div>
            <div class="card-value">\${stats.arnsCount || 0}</div>
          </div>
          <div class="card">
            <div class="card-label">Blocked Transaction IDs</div>
            <div class="card-value">\${stats.txIdCount || 0}</div>
          </div>
          <div class="card">
            <div class="card-label">Total Entries</div>
            <div class="card-value">\${stats.totalEntries || 0}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Block Content</div>
          <div class="block-form">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-input" id="block-type">
                <option value="arns">ArNS Name</option>
                <option value="txid">Transaction ID</option>
              </select>
            </div>
            <div class="form-group" style="flex:2;">
              <label class="form-label">Value</label>
              <input class="form-input" id="block-value" placeholder="e.g. my-arns-name or txId...">
            </div>
            <div class="form-group" style="flex:2;">
              <label class="form-label">Reason</label>
              <input class="form-input" id="block-reason" placeholder="Reason for blocking">
            </div>
            <button class="btn btn-primary" onclick="blockContent()">Block</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Blocklist</div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr><th>Type</th><th>Value</th><th>Reason</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                \${entries.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No blocked content</td></tr>' :
                  entries.map(e => \`
                    <tr>
                      <td><span class="badge \${e.type === 'arns' ? 'badge-proxy' : 'badge-route'}">\${e.type}</span></td>
                      <td style="font-family:monospace;font-size:12px;">\${escHtml(e.value)}</td>
                      <td>\${escHtml(e.reason || '-')}</td>
                      <td>\${e.blockedAt ? new Date(e.blockedAt).toLocaleDateString() : '-'}</td>
                      <td><button class="btn btn-danger btn-sm" data-type="\${e.type}" data-value="\${e.value.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" onclick="unblockContent(this.dataset.type,this.dataset.value)">Remove</button></td>
                    </tr>
                  \`).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function blockContent() {
      const type = document.getElementById('block-type').value;
      const value = document.getElementById('block-value').value.trim();
      const reason = document.getElementById('block-reason').value.trim();
      if (!value) return toast('Value is required', 'error');
      try {
        await api('/moderation/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, value, reason })
        });
        toast('Content blocked');
        loadModeration();
      } catch(e) { toast('Failed to block content', 'error'); }
    }

    async function unblockContent(type, value) {
      try {
        await api('/moderation/unblock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, value })
        });
        toast('Content unblocked');
        loadModeration();
      } catch(e) { toast('Failed to unblock', 'error'); }
    }

    // =========== SETTINGS PAGE ===========
    async function loadSettings() {
      try {
        const data = await api('/config');
        settingsState = {};
        settingsDirty = {};
        settingsOriginal = {};
        settingsNeedsRestart = false;

        // Populate state from config API response
        for (const field of SETTINGS_SCHEMA) {
          const val = resolveConfigPath(data, field.configPath);
          const strVal = val != null ? String(val) : '';
          settingsState[field.key] = strVal;
          settingsOriginal[field.key] = strVal;
        }
        renderSettings();
        updateSaveBar();
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('settings-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function updateSetting(key, value) {
      settingsState[key] = String(value);
      if (settingsState[key] !== settingsOriginal[key]) {
        settingsDirty[key] = settingsState[key];
      } else {
        delete settingsDirty[key];
      }
      updateSaveBar();
    }

    function updateSaveBar() {
      const bar = document.getElementById('save-bar');
      const count = Object.keys(settingsDirty).length;
      if (count > 0) {
        bar.classList.add('visible');
        document.getElementById('save-bar-count').textContent = count + ' unsaved change' + (count > 1 ? 's' : '');
      } else {
        bar.classList.remove('visible');
      }
    }

    function discardSettings() {
      settingsState = { ...settingsOriginal };
      settingsDirty = {};
      renderSettings();
      updateSaveBar();
    }

    let settingsSaving = false;
    async function saveSettings() {
      if (settingsSaving) return;
      settingsSaving = true;
      const saveBtn = document.querySelector('.save-bar .btn-primary');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
      const changes = {};
      for (const [key, val] of Object.entries(settingsDirty)) {
        changes[key] = val;
      }
      try {
        await api('/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes })
        });
        settingsOriginal = { ...settingsState };
        settingsDirty = {};
        settingsNeedsRestart = true;
        renderSettings();
        updateSaveBar();
        toast('Settings saved — restart to apply');
      } catch(e) {
        toast('Failed to save settings', 'error');
      } finally {
        settingsSaving = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
      }
    }

    async function restartRouter() {
      if (!confirm('Restart the router now? In-flight requests will be drained.')) return;
      try {
        const res = await api('/restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (!res.ok) {
          toast(res.error || 'Restart failed', 'error');
          return;
        }
        showRestartOverlay();
      } catch(e) {
        toast(e.message || 'Restart failed', 'error');
      }
    }

    function showRestartOverlay() {
      const overlay = document.createElement('div');
      overlay.className = 'restart-overlay';
      overlay.innerHTML = '<div class="restart-overlay-content">' +
        '<div class="spinner"></div>' +
        '<h3>Restarting...</h3>' +
        '<p id="restart-status">Waiting for router to come back online</p>' +
        '</div>';
      document.body.appendChild(overlay);

      let attempts = 0;
      const maxAttempts = 60;
      const poll = setInterval(async () => {
        attempts++;
        try {
          await api('/status');
          clearInterval(poll);
          overlay.remove();
          settingsNeedsRestart = false;
          toast('Router restarted successfully');
          loadSettings();
        } catch(e) {
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            const status = document.getElementById('restart-status');
            if (status) status.innerHTML = 'Router did not respond after 30s.<br><a href="javascript:location.reload()" style="color:var(--primary)">Reload page</a>';
          }
        }
      }, 500);
    }

    function renderSettingInput(field) {
      const val = settingsState[field.key] || '';
      const id = 'setting-' + field.key;

      if (field.type === 'boolean') {
        const checked = val === 'true';
        return '<label class="toggle"><input type="checkbox" ' + (checked ? 'checked' : '') +
          ' onchange="updateSetting(\\'' + field.key + '\\', this.checked)"><span class="toggle-slider"></span></label>';
      }

      if (field.type === 'enum' && field.options && field.options.length <= 4) {
        return '<div class="radio-cards" style="max-width:400px;">' +
          field.options.map(o =>
            '<div class="radio-card ' + (val === o.value ? 'selected' : '') + '" onclick="updateSetting(\\'' + field.key + '\\', \\'' + o.value + '\\');renderSettings()">' +
            '<div class="radio-card-title">' + o.label + '</div>' +
            (o.desc ? '<div class="radio-card-desc">' + o.desc + '</div>' : '') +
            '</div>'
          ).join('') + '</div>';
      }

      if (field.type === 'enum' && field.options) {
        return '<div class="setting-field-input"><select class="form-input" id="' + id + '" onchange="updateSetting(\\'' + field.key + '\\', this.value)">' +
          field.options.map(o => '<option value="' + o.value + '"' + (val === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('') +
          '</select></div>';
      }

      if (field.type === 'number') {
        return '<div class="setting-field-input"><input class="form-input" type="number" id="' + id + '" value="' + escHtml(val) + '"' +
          (field.min !== undefined ? ' min="' + field.min + '"' : '') +
          (field.max !== undefined ? ' max="' + field.max + '"' : '') +
          ' onchange="updateSetting(\\'' + field.key + '\\', this.value)"></div>';
      }

      if (field.type === 'urllist') {
        return '<div class="setting-field-input"><textarea class="form-input" id="' + id + '" placeholder="' + (field.placeholder || '') + '" onchange="updateSetting(\\'' + field.key + '\\', this.value)">' + escHtml(val) + '</textarea></div>';
      }

      // Default: string
      return '<div class="setting-field-input"><input class="form-input" type="text" id="' + id + '" value="' + escHtml(val) + '"' +
        (field.placeholder ? ' placeholder="' + field.placeholder + '"' : '') +
        ' onchange="updateSetting(\\'' + field.key + '\\', this.value)"></div>';
    }

    function renderSettings() {
      const el = document.getElementById('settings-content');

      // Group fields by group name
      const groups = {};
      for (const field of SETTINGS_SCHEMA) {
        if (!groups[field.group]) groups[field.group] = [];
        groups[field.group].push(field);
      }

      let html = '';
      if (settingsNeedsRestart) {
        html += '<div class="restart-banner visible"><span>Settings saved. Restart the router to apply changes.</span><button class="btn-restart" onclick="restartRouter()">Restart Now</button></div>';
      }

      const advancedCollapsed = !settingsAdvancedExpanded;
      for (const [groupName, fields] of Object.entries(groups)) {
        const isAdvanced = groupName === 'Advanced';
        html += '<div class="settings-group' + (isAdvanced && advancedCollapsed ? ' collapsed' : '') + '" id="group-' + groupName.replace(/\\s+/g, '-') + '">';
        html += '<div class="settings-group-title"' + (isAdvanced ? ' onclick="settingsAdvancedExpanded=!settingsAdvancedExpanded;this.parentElement.classList.toggle(\\'collapsed\\')"' : '') + '>' +
          groupName + (isAdvanced ? ' <span style="font-size:12px;font-weight:400;color:var(--text-muted);margin-left:8px;">click to ' + (advancedCollapsed ? 'expand' : 'collapse') + '</span>' : '') + '</div>';
        html += '<div class="settings-group-body">';

        for (const field of fields) {
          html += '<div class="setting-field">';
          html += '<div class="setting-field-header">';
          html += '<span class="setting-field-label">' + field.label + '</span>';
          html += '<span class="setting-field-env">' + field.key + '</span>';
          html += '</div>';
          html += '<div class="setting-field-desc">' + field.description + '</div>';
          html += renderSettingInput(field);
          html += '</div>';
        }

        html += '</div></div>';
      }

      el.innerHTML = html;
    }

    // =========== SETUP WIZARD ===========
    function showSetup() {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-setup').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      wizardStep = 0;
      renderWizard();
    }

    function renderWizard() {
      const steps = ['Domain', 'Routing', 'Verification'];
      const stepsHtml = steps.map((s, i) =>
        '<div class="wizard-step ' + (i === wizardStep ? 'active' : (i < wizardStep ? 'done' : '')) + '">' +
        (i < wizardStep ? '\\u2713 ' : '') + s + '</div>'
      ).join('');

      let body = '';
      if (wizardStep === 0) {
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Your Domain</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">This is the domain your router will serve content on. Subdomains will be used for ArNS name resolution.</p>
          <div class="form-group">
            <label class="form-label">Base Domain</label>
            <input class="form-input" id="wiz-domain" value="\${setupData.baseDomain}" placeholder="e.g. permaweb.nexus">
          </div>
          <div class="form-group">
            <label class="form-label">Port</label>
            <input class="form-input" id="wiz-port" type="number" value="\${setupData.port}">
          </div>
          <div class="form-group">
            <label class="form-label">Root Host Content (optional)</label>
            <input class="form-input" id="wiz-root" value="\${setupData.rootHostContent}" placeholder="ArNS name or txId to serve at root">
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Content to serve when users visit your base domain directly</div>
          </div>
        \`;
      } else if (wizardStep === 1) {
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Routing & Gateways</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Choose how your router fetches and delivers content from the ar.io network.</p>

          <div class="form-group">
            <label class="form-label">Operating Mode</label>
            <div class="radio-cards">
              <div class="radio-card \${setupData.defaultMode === 'proxy' ? 'selected' : ''}" onclick="setupData.defaultMode='proxy';renderWizard()">
                <div class="radio-card-title">Proxy<span class="rec-badge">Recommended</span></div>
                <div class="radio-card-desc">Fetch content from ar.io gateways, verify it, cache it, and serve it to your users</div>
              </div>
              <div class="radio-card \${setupData.defaultMode === 'route' ? 'selected' : ''}" onclick="setupData.defaultMode='route';renderWizard()">
                <div class="radio-card-title">Route</div>
                <div class="radio-card-desc">Redirect users directly to an ar.io gateway (lower resource usage, no caching)</div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Routing Strategy</label>
            <div class="radio-cards">
              <div class="radio-card \${setupData.routingStrategy === 'temperature' ? 'selected' : ''}" onclick="setupData.routingStrategy='temperature';renderWizard()">
                <div class="radio-card-title">Temperature<span class="rec-badge">Recommended</span></div>
                <div class="radio-card-desc">Learns which ar.io gateways perform best and routes traffic intelligently</div>
              </div>
              <div class="radio-card \${setupData.routingStrategy === 'fastest' ? 'selected' : ''}" onclick="setupData.routingStrategy='fastest';renderWizard()">
                <div class="radio-card-title">Fastest</div>
                <div class="radio-card-desc">Ping all gateways concurrently, use the first to respond</div>
              </div>
              <div class="radio-card \${setupData.routingStrategy === 'random' ? 'selected' : ''}" onclick="setupData.routingStrategy='random';renderWizard()">
                <div class="radio-card-title">Random</div>
                <div class="radio-card-desc">Random selection from healthy gateways</div>
              </div>
              <div class="radio-card \${setupData.routingStrategy === 'round-robin' ? 'selected' : ''}" onclick="setupData.routingStrategy='round-robin';renderWizard()">
                <div class="radio-card-title">Round Robin</div>
                <div class="radio-card-desc">Rotate through gateways sequentially</div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Gateway Source</label>
            <div class="radio-cards">
              <div class="radio-card \${setupData.gatewaySource === 'network' ? 'selected' : ''}" onclick="setupData.gatewaySource='network';renderWizard()">
                <div class="radio-card-title">Network<span class="rec-badge">Recommended</span></div>
                <div class="radio-card-desc">Discovers all gateways from the ar.io registry automatically</div>
              </div>
              <div class="radio-card \${setupData.gatewaySource === 'trusted-peers' ? 'selected' : ''}" onclick="setupData.gatewaySource='trusted-peers';renderWizard()">
                <div class="radio-card-title">Trusted Peers</div>
                <div class="radio-card-desc">Use peers from a trusted gateway's peer list</div>
              </div>
              <div class="radio-card \${setupData.gatewaySource === 'static' ? 'selected' : ''}" onclick="setupData.gatewaySource='static';renderWizard()">
                <div class="radio-card-title">Static</div>
                <div class="radio-card-desc">Manually specify which gateways to use</div>
              </div>
            </div>
          </div>
        \`;
      } else if (wizardStep === 2) {
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Verification & Security</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Content verification ensures the data served is authentic by checking hashes against trusted ar.io gateways.</p>

          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <label class="form-label" style="margin:0;">Enable Verification</label>
              <label class="toggle">
                <input type="checkbox" \${setupData.verificationEnabled ? 'checked' : ''} onchange="setupData.verificationEnabled=this.checked;renderWizard()">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Verify content hashes against trusted ar.io gateways before serving</div>
          </div>

          \${setupData.verificationEnabled ? \`
            <div class="form-group">
              <label class="form-label">Verification Source</label>
              <div class="radio-cards">
                <div class="radio-card \${setupData.verificationSource === 'top-staked' ? 'selected' : ''}" onclick="setupData.verificationSource='top-staked';renderWizard()">
                  <div class="radio-card-title">Top Staked<span class="rec-badge">Recommended</span></div>
                  <div class="radio-card-desc">Use the highest-staked ar.io gateways as trust anchors</div>
                </div>
                <div class="radio-card \${setupData.verificationSource === 'static' ? 'selected' : ''}" onclick="setupData.verificationSource='static';renderWizard()">
                  <div class="radio-card-title">Static</div>
                  <div class="radio-card-desc">Manually specify trusted gateways</div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Verification Gateway Count (\${setupData.verificationCount})</label>
              <input type="range" min="1" max="5" value="\${setupData.verificationCount}" oninput="setupData.verificationCount=+this.value;renderWizard()" style="width:100%;">
            </div>

            <div class="form-group">
              <label class="form-label">ArNS Consensus Threshold (\${setupData.consensusThreshold})</label>
              <input type="range" min="2" max="3" value="\${setupData.consensusThreshold}" oninput="setupData.consensusThreshold=+this.value;renderWizard()" style="width:100%;">
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Minimum gateways that must agree on an ArNS resolution</div>
            </div>
          \` : ''}
        \`;
      } else {
        // Finish
        const env = generateEnv();
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Configuration Ready</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Copy the configuration below to your .env file and restart the router.</p>
          <div class="wizard-result">\${env}</div>
          <div style="margin-top:12px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="copyEnv()">Copy to Clipboard</button>
            <button class="btn" onclick="saveEnv()">Save to .env file</button>
          </div>
        \`;
      }

      document.getElementById('setup-content').innerHTML = \`
        <div class="wizard">
          <div class="wizard-steps">\${stepsHtml}</div>
          <div class="wizard-body">\${body}</div>
          <div class="wizard-actions">
            \${wizardStep > 0 ? '<button class="btn" onclick="wizardBack()">Back</button>' : '<div></div>'}
            \${wizardStep < 3 ? '<button class="btn btn-primary" onclick="wizardNext()">Next</button>' : ''}
          </div>
        </div>
      \`;
    }

    function wizardNext() {
      if (wizardStep === 0) {
        const d = document.getElementById('wiz-domain');
        const p = document.getElementById('wiz-port');
        const r = document.getElementById('wiz-root');
        if (d) setupData.baseDomain = d.value.trim();
        if (p) setupData.port = parseInt(p.value) || 3000;
        if (r) setupData.rootHostContent = r.value.trim();
      }
      wizardStep++;
      renderWizard();
    }

    function wizardBack() {
      wizardStep--;
      renderWizard();
    }

    function generateEnvChanges() {
      const changes = {};
      changes['PORT'] = String(setupData.port);
      changes['HOST'] = '0.0.0.0';
      changes['BASE_DOMAIN'] = setupData.baseDomain;
      if (setupData.rootHostContent) {
        changes['ROOT_HOST_CONTENT'] = setupData.rootHostContent;
      }
      changes['DEFAULT_MODE'] = setupData.defaultMode;
      changes['ROUTING_STRATEGY'] = setupData.routingStrategy;
      changes['ROUTING_GATEWAY_SOURCE'] = setupData.gatewaySource;
      changes['VERIFICATION_ENABLED'] = String(setupData.verificationEnabled);
      if (setupData.verificationEnabled) {
        changes['VERIFICATION_GATEWAY_SOURCE'] = setupData.verificationSource;
        changes['VERIFICATION_GATEWAY_COUNT'] = String(setupData.verificationCount);
        changes['ARNS_CONSENSUS_THRESHOLD'] = String(setupData.consensusThreshold);
      }
      changes['TELEMETRY_ENABLED'] = 'true';
      return changes;
    }

    function generateEnv() {
      const changes = generateEnvChanges();
      const lines = [
        '# Wayfinder Router Configuration',
        '# Generated by Setup Wizard',
        '',
      ];
      for (const [key, value] of Object.entries(changes)) {
        lines.push(key + '=' + value);
      }
      return lines.join('\\n');
    }

    function copyEnv() {
      navigator.clipboard.writeText(generateEnv()).then(() => toast('Copied to clipboard'));
    }

    async function saveEnv() {
      try {
        await api('/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: generateEnvChanges() })
        });
        toast('Saved to .env - restart router to apply');
      } catch(e) { toast('Could not save .env file', 'error'); }
    }

    // =========== INIT ===========
    async function init() {
      try {
        const data = await api('/status');
        hideAuth();
        // Check if setup wizard should show
        if (data.needsSetup) {
          showSetup();
        } else {
          navigate('status');
        }
      } catch(e) {
        if (e.message === 'Unauthorized') {
          showAuth();
        } else {
          hideAuth();
          navigate('status');
        }
      }
    }

    document.addEventListener('DOMContentLoaded', init);
  `;
}

function brandSvg(): string {
  return `<svg width="32" height="22" viewBox="0 0 400 260" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M200 0C89.54 0 0 89.54 0 200V260H60V220C60 142.68 122.68 80 200 80C277.32 80 340 142.68 340 220V260H400V200C400 89.54 310.46 0 200 0Z" fill="#FFFFFF"/>
    <circle cx="200" cy="220" r="40" fill="#FFFFFF"/>
  </svg>`;
}

export function renderAdminPage(version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ar.io — Wayfinder Router</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Besley:wght@800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
  <style>${css()}</style>
</head>
<body>
  <!-- Auth Screen -->
  <div id="auth-screen" class="auth-screen" style="display:none;">
    <div class="auth-box">
      <div style="background:${COLORS.sidebar};border-radius:12px;padding:16px;display:inline-block;margin-bottom:12px;">
        ${brandSvg()}
      </div>
      <h2 style="margin-top:8px;">Wayfinder Router</h2>
      <p>Enter your admin token to continue</p>
      <div class="form-group">
        <input class="form-input" id="auth-input" type="password" placeholder="Admin token" onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="doLogin()">Sign In</button>
      <div id="auth-error" class="auth-error">Invalid token. Please try again.</div>
    </div>
  </div>

  <!-- Main App -->
  <div id="app" style="display:flex;">
    <!-- Sidebar -->
    <nav class="sidebar">
      <div class="sidebar-brand">
        ${brandSvg()}
        <div>
          <h1>ar.io</h1>
          <span>Wayfinder Router</span>
        </div>
      </div>
      <div class="sidebar-nav">
        <a class="nav-item active" data-page="status" onclick="navigate('status')">
          <span class="nav-icon">&#x25C9;</span>
          <span class="nav-label">Status</span>
        </a>
        <a class="nav-item" data-page="gateways" onclick="navigate('gateways')">
          <span class="nav-icon">&#x25CB;</span>
          <span class="nav-label">Gateways</span>
        </a>
        <a class="nav-item" data-page="telemetry" onclick="navigate('telemetry')">
          <span class="nav-icon">&#x25A0;</span>
          <span class="nav-label">Telemetry</span>
        </a>
        <a class="nav-item" data-page="moderation" onclick="navigate('moderation')">
          <span class="nav-icon">&#x25B2;</span>
          <span class="nav-label">Moderation</span>
        </a>
        <a class="nav-item" data-page="settings" onclick="navigate('settings')">
          <span class="nav-icon">&#x2699;</span>
          <span class="nav-label">Settings</span>
        </a>
      </div>
      <div class="sidebar-footer">
        Wayfinder v${version}<br>
        <a href="https://ar.io" target="_blank">ar.io network</a> &middot;
        <a href="https://docs.ar.io" target="_blank">docs</a>
      </div>
    </nav>

    <!-- Content Area -->
    <main class="main">
      <!-- Status Page -->
      <div id="page-status" class="page active">
        <div class="page-header">
          <h2>Status</h2>
          <p>Router health and performance overview</p>
        </div>
        <div id="status-content"><div class="spinner"></div></div>
      </div>

      <!-- Gateways Page -->
      <div id="page-gateways" class="page">
        <div class="page-header">
          <h2>Gateways</h2>
          <p>ar.io network gateway peers and health</p>
        </div>
        <div id="gateways-content"><div class="spinner"></div></div>
      </div>

      <!-- Telemetry Page -->
      <div id="page-telemetry" class="page">
        <div class="page-header">
          <h2>Telemetry</h2>
          <p>Request metrics and gateway performance</p>
        </div>
        <div id="telemetry-content"><div class="spinner"></div></div>
      </div>

      <!-- Moderation Page -->
      <div id="page-moderation" class="page">
        <div class="page-header">
          <h2>Moderation</h2>
          <p>Content blocking and moderation controls</p>
        </div>
        <div id="moderation-content"><div class="spinner"></div></div>
      </div>

      <!-- Settings Page -->
      <div id="page-settings" class="page">
        <div class="page-header">
          <h2>Settings</h2>
          <p>Edit router configuration — changes are saved to .env</p>
        </div>
        <div id="settings-content"><div class="spinner"></div></div>
      </div>

      <!-- Setup Wizard -->
      <div id="page-setup" class="page">
        <div class="page-header">
          <h2>Setup Wizard</h2>
          <p>Configure your Wayfinder Router for the ar.io network</p>
        </div>
        <div id="setup-content"></div>
      </div>
    </main>
  </div>

  <!-- Save Bar -->
  <div id="save-bar" class="save-bar">
    <span class="save-bar-info" id="save-bar-count">0 unsaved changes</span>
    <div class="save-bar-actions">
      <button class="btn" onclick="discardSettings()">Discard</button>
      <button class="btn btn-primary" onclick="saveSettings()">Save Changes</button>
    </div>
  </div>

  <script>${clientJs()}</script>
</body>
</html>`;
}
