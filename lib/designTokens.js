/**
 * GRAV-CMS/lib/designTokens.js
 * Central design system — import this for consistent tokens everywhere.
 * Government-SaaS aesthetic: IBM Plex Sans, slate palette, authoritative.
 */

export const FONT_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap";

export const COLORS = {

  // Primary — institutional blue
  primary: "#1B4F8A",
  primaryLight: "#EBF2FA",
  primaryMid: "#BEDAF5",
  primaryDark: "#0F3460",

  // Semantic
  success: "#166534",
  successLight: "#F0FDF4",
  successMid: "#BBF7D0",

  warning: "#92400E",
  warningLight: "#FFFBEB",
  warningMid: "#FDE68A",

  danger: "#991B1B",
  dangerLight: "#FEF2F2",
  dangerMid: "#FECACA",

  purple: "#5B21B6",
  purpleLight: "#F5F3FF",
  purpleMid: "#DDD6FE",

  // Neutrals — slate scale
  gray900: "#0F172A",
  gray800: "#1E293B",
  gray700: "#334155",
  gray600: "#475569",
  gray500: "#64748B",
  gray400: "#94A3B8",
  gray300: "#CBD5E1",
  gray200: "#E2E8F0",
  gray100: "#F1F5F9",
  gray50: "#F8FAFC",
  white: "#FFFFFF",

  // Surface
  surface: "#FFFFFF",
  bg: "#F4F6FA",
};

export const RADIUS = {
  sm: "4px",
  md: "6px",
  lg: "10px",
  xl: "14px",
  xxl: "18px",
  full: "9999px",
};

export const SHADOW = {
  xs: "0 1px 2px rgba(0,0,0,0.05)",
  sm: "0 1px 4px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
  md: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
  lg: "0 12px 32px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.05)",
  xl: "0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)",
};

export const FONT = {
  family: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};

// Inject global styles once (call from CoworkingShell)
export function injectGlobalStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("grav-global")) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_URL;
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.id = "grav-global";
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary:       ${COLORS.primary};
      --primary-light: ${COLORS.primaryLight};
      --primary-mid:   ${COLORS.primaryMid};
      --primary-dark:  ${COLORS.primaryDark};
      --success:       ${COLORS.success};
      --success-light: ${COLORS.successLight};
      --warning:       ${COLORS.warning};
      --warning-light: ${COLORS.warningLight};
      --danger:        ${COLORS.danger};
      --danger-light:  ${COLORS.dangerLight};
      --gray-900:      ${COLORS.gray900};
      --gray-800:      ${COLORS.gray800};
      --gray-700:      ${COLORS.gray700};
      --gray-600:      ${COLORS.gray600};
      --gray-500:      ${COLORS.gray500};
      --gray-400:      ${COLORS.gray400};
      --gray-300:      ${COLORS.gray300};
      --gray-200:      ${COLORS.gray200};
      --gray-100:      ${COLORS.gray100};
      --gray-50:       ${COLORS.gray50};
      --surface:       ${COLORS.surface};
      --bg:            ${COLORS.bg};
      --font:          ${FONT.family};
      --font-mono:     ${FONT.mono};
      --radius-sm:     ${RADIUS.sm};
      --radius-md:     ${RADIUS.md};
      --radius-lg:     ${RADIUS.lg};
      --radius-xl:     ${RADIUS.xl};
      --shadow-sm:     ${SHADOW.sm};
      --shadow-md:     ${SHADOW.md};
      --shadow-lg:     ${SHADOW.lg};
      --transition:    0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }

    body { font-family: var(--font); background: var(--bg); color: var(--gray-800); }

    /* Scrollbars */
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--gray-300); border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gray-400); }

    /* Keyframes */
    @keyframes grav-spin   { to { transform: rotate(360deg); } }
    @keyframes grav-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes grav-slidein{ from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes grav-pulse  { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }

    /* Utility classes */
    .grav-spin    { animation: grav-spin 0.85s linear infinite; }
    .grav-fadein  { animation: grav-fadein 0.2s ease forwards; }
    .grav-slidein { animation: grav-slidein 0.2s ease forwards; }

    /* Interactive states */
    .grav-btn { transition: all var(--transition); }
    .grav-btn:hover:not(:disabled) { filter: brightness(0.92); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    .grav-btn:active:not(:disabled) { transform: translateY(0); }
    .grav-btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .grav-nav-item { transition: all var(--transition); }
    .grav-nav-item:hover { background: var(--primary-light) !important; color: var(--primary) !important; }

    .grav-card { transition: box-shadow var(--transition); }
    .grav-card:hover { box-shadow: var(--shadow-md) !important; }

    .grav-input:focus {
      outline: none;
      border-color: var(--primary) !important;
      box-shadow: 0 0 0 3px var(--primary-light) !important;
    }

    .grav-select:focus {
      outline: none;
      border-color: var(--primary) !important;
      box-shadow: 0 0 0 3px var(--primary-light) !important;
    }

    /* Missing vars */
    :root {
      --radius-full:   9999px;
      --radius-xxl:    18px;
      --shadow-xs:     0 1px 2px rgba(0,0,0,0.05);
      --shadow-xl:     0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06);
      --danger-mid:    #FECACA;
      --success-mid:   #BBF7D0;
      --warning-mid:   #FDE68A;
    }

    /* Mobile responsive helpers */
    @media (max-width: 768px) {
      .grav-hide-mobile { display: none !important; }
      .grav-full-mobile { width: 100% !important; }

      /* Sidebar hidden off-screen on mobile */
      .grav-sidebar {
        position: fixed !important;
        transform: translateX(-100%);
        z-index: 50;
        height: 100vh;
        top: 0; left: 0;
      }
      .grav-sidebar.open {
        transform: translateX(0) !important;
      }

      /* Content padding */
      .grav-content { padding: 16px !important; }

      /* Stats grid responsive */
      .grav-stats-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }

      /* Two-column layouts become single column */
      .grav-two-col {
        grid-template-columns: 1fr !important;
      }

      /* Task tree: full width left panel */
      .grav-task-split {
        flex-direction: column !important;
      }
      .grav-tree-panel {
        width: 100% !important;
        max-height: 240px !important;
        border-right: none !important;
        border-bottom: 1px solid var(--gray-200) !important;
      }

      /* Chat pages fill screen */
      .grav-chat-container {
        height: calc(100vh - 80px) !important;
      }
    }

    @media (max-width: 480px) {
      .grav-stats-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .grav-welcome-banner {
        flex-direction: column !important;
        gap: 16px;
      }
    }

    @media (min-width: 769px) {
      .grav-hide-desktop { display: none !important; }
    }

    /* Tablet */
    @media (max-width: 1024px) and (min-width: 769px) {
      .grav-content-grid {
        grid-template-columns: 1fr !important;
      }
    }
  `;
  document.head.appendChild(style);
}