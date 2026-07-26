import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "../validation/filePathValidator.js";

function upsertFileContent(
  project: GeneratedProjectV1,
  path: string,
  content: string,
  language: GeneratedProjectV1["files"][number]["language"] = path.endsWith(".tsx")
    ? "tsx"
    : path.endsWith(".css")
      ? "css"
      : path.endsWith(".js")
        ? "js"
        : "json",
  purpose = "Dashboard visual fidelity patch",
): GeneratedProjectV1 {
  const normalizedPath = normalizeProjectPath(path);
  const files = project.files.map((file) =>
    normalizeProjectPath(file.path) === normalizedPath ? { ...file, content, language } : file,
  );

  if (!files.some((file) => normalizeProjectPath(file.path) === normalizedPath)) {
    files.push({ path: normalizedPath, language, content, purpose });
  }

  return { ...project, files };
}

const INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
  font-family: 'Inter', system-ui, sans-serif;
  background-color: #001e38;
  color: #FFFFFF;
  overflow: hidden;
}

#root {
  display: flex;
  flex-direction: column;
}
`;

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dashboardBg: "#001e38",
        panelSurface: "#012640",
        panelBorder: "#163656",
        accentOrange: "#F57B00",
        accentPink: "#FF4081",
        backgroundDarkBlue: "#012640",
        textWhite: "#FFFFFF",
        textGrayLight: "#7A94B8",
        textGreen: "#00E676",
        textRed: "#FF5252",
        labelMuted: "#6B849F",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  safelist: ["text-textGreen", "text-textRed", "gap-2", "gap-3"],
  plugins: [],
};
`;

const DASHBOARD_TSX = `import React from 'react';
import MarketingSalesFunnelPanel from './MarketingSalesFunnelPanel';
import SalesCloseRatePanel from './SalesCloseRatePanel';
import BottomChartsContainer from './BottomChartsContainer';

const Dashboard: React.FC = () => (
  <main className="box-border h-screen w-full overflow-hidden bg-dashboardBg text-textWhite p-2">
    <div className="mx-auto grid h-full w-full max-w-[1410px] grid-rows-[minmax(0,42fr)_minmax(0,58fr)] gap-2">
      <section className="grid min-h-0 grid-cols-1 gap-2 md:grid-cols-2" aria-label="Top dashboard row">
        <MarketingSalesFunnelPanel />
        <SalesCloseRatePanel />
      </section>
      <BottomChartsContainer />
    </div>
  </main>
);

export default Dashboard;
`;

const FUNNEL_PANEL_TSX = `import React from 'react';

const DATE_FILTER = 'Month to Date (Jul 1 - 13)';

const PanelHeader: React.FC<{ title: string; dateFilter?: string }> = ({ title, dateFilter = DATE_FILTER }) => (
  <div className="mb-1">
    <div className="text-[8px] leading-tight text-labelMuted">{dateFilter} ▾</div>
    <h2 className="text-[9px] font-semibold uppercase tracking-wide text-textWhite">{title}</h2>
  </div>
);

const Metric: React.FC<{ value: string; label: string; change?: number }> = ({ value, label, change }) => {
  const up = change !== undefined && change > 0;
  const down = change !== undefined && change < 0;
  return (
    <div className="min-w-0 text-left">
      <div className="text-sm font-bold leading-tight text-textWhite">{value}</div>
      <div className="text-[8px] text-labelMuted">{label}</div>
      {change !== undefined && (
        <div className={\`text-[8px] font-semibold \${up ? 'text-textGreen' : down ? 'text-textRed' : 'text-labelMuted'}\`}>
          {up ? '▲' : down ? '▼' : ''} {Math.abs(change)}%
        </div>
      )}
    </div>
  );
};

const FunnelVisualization: React.FC = () => (
  <figure className="mt-0.5 flex flex-col justify-end" aria-label="Marketing funnel">
    <svg viewBox="0 0 640 56" width="100%" height="56" preserveAspectRatio="none" className="block w-full">
      <defs>
        <linearGradient id="funnelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF8C1A" />
          <stop offset="55%" stopColor="#F57B00" />
          <stop offset="100%" stopColor="#C86200" />
        </linearGradient>
      </defs>
      <rect x="0" y="16" width="88" height="24" rx="12" fill="url(#funnelGrad)" />
      <path
        d="M 108 16 C 220 16 380 26 540 34 C 590 36 628 37 638 37.5 L 638 40.5 C 628 41 590 42 540 44 C 380 48 220 42 108 40 Z"
        fill="url(#funnelGrad)"
      />
      <rect x="420" y="38" width="218" height="3" rx="1.5" fill="url(#funnelGrad)" opacity="0.9" />
      <rect x="200" y="31" width="44" height="11" rx="5.5" fill="#163656" stroke="#1E4468" strokeWidth="0.5" />
      <text x="222" y="39" textAnchor="middle" fill="#8BA4C4" fontSize="6.5" fontFamily="Inter, sans-serif">0.11%</text>
      <rect x="368" y="31" width="50" height="11" rx="5.5" fill="#163656" stroke="#1E4468" strokeWidth="0.5" />
      <text x="393" y="39" textAnchor="middle" fill="#8BA4C4" fontSize="6.5" fontFamily="Inter, sans-serif">330.77%</text>
    </svg>
    <p className="mt-0.5 text-center text-[8px] text-labelMuted">
      Overall conversion rate <span className="text-textWhite">0.35%</span>{' '}
      <span className="text-textGreen">▲ 0.57%</span>
    </p>
  </figure>
);

const MarketingSalesFunnelPanel: React.FC = () => (
  <section
    aria-label="Marketing and sales funnel panel"
    className="flex min-h-0 flex-col rounded-sm border border-panelBorder bg-panelSurface p-2"
  >
    <PanelHeader title="Marketing & Sales Funnel" />
    <div className="mb-1 grid grid-cols-3 gap-1.5">
      <Metric value="86,109" label="Sessions" change={29} />
      <Metric value="91" label="Deals Created" change={75} />
      <Metric value="301" label="Closed Won Deals" change={-47} />
    </div>
    <FunnelVisualization />
  </section>
);

export default MarketingSalesFunnelPanel;
`;

const SALES_CLOSE_RATE_TSX = `import React from 'react';

const MONTHS = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul'];
const VALUES = [71600, 48200, 55000, 58000, 60000, 65000, 75000, 84300, 97000, 80000, 65000, 45200];
const MAX = 120000;

const SalesCloseRateChart: React.FC = () => {
  const width = 640;
  const height = 152;
  const padL = 36;
  const padR = 6;
  const padT = 8;
  const padB = 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const points = VALUES.map((v, i) => ({
    x: padL + (i / (VALUES.length - 1)) * chartW,
    y: padT + chartH - (v / MAX) * chartH,
    v,
    month: i === 0 ? '2023 Aug' : i >= 5 ? \`2024 \${MONTHS[i]}\` : MONTHS[i],
    showMonth: i % 2 === 0 || i === VALUES.length - 1,
  }));

  const linePoints = points.map((p) => \`\${p.x},\${p.y}\`).join(' ');
  const areaPoints = \`\${padL},\${padT + chartH} \${linePoints} \${width - padR},\${padT + chartH}\`;

  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} width="100%" height="100%" className="block h-full w-full" role="img" aria-label="Sales close rate chart">
      {[0, 20000, 40000, 60000, 80000, 100000, 120000].map((tick) => {
        const y = padT + chartH - (tick / MAX) * chartH;
        return (
          <g key={tick}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#163656" strokeWidth={0.75} />
            <text x={padL - 2} y={y + 2.5} textAnchor="end" fill="#6B849F" fontSize="6">
              {tick === 0 ? '0%' : \`\${tick / 1000}k%\`}
            </text>
          </g>
        );
      })}
      <polygon points={areaPoints} fill="#F57B00" fillOpacity="0.07" />
      <polyline points={linePoints} fill="none" stroke="#F57B00" strokeWidth={1.5} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2} fill="#F57B00" />
          <text x={p.x} y={p.y - 4} textAnchor="middle" fill="#FFFFFF" fontSize="5.5" fontWeight="500">
            {p.v.toLocaleString()}%
          </text>
          {p.showMonth && (
            <text x={p.x} y={padT + chartH + 10} textAnchor="middle" fill="#6B849F" fontSize="6">{p.month}</text>
          )}
        </g>
      ))}
    </svg>
  );
};

const SalesCloseRatePanel: React.FC = () => (
  <section aria-label="Sales close rate panel" className="flex min-h-0 flex-col rounded-sm border border-panelBorder bg-panelSurface p-2">
    <div className="mb-0.5">
      <div className="text-[8px] leading-tight text-labelMuted">Last 12 months (2023 Aug - 2024 Jul) ▾</div>
      <h2 className="text-[9px] font-semibold uppercase tracking-wide text-textWhite">Sales Close Rate</h2>
    </div>
    <div className="min-h-0 flex-1"><SalesCloseRateChart /></div>
  </section>
);

export default SalesCloseRatePanel;
`;

const BOTTOM_CHARTS_TSX = `import React from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DATE_FILTER = 'Last 12 months (2023 Aug - 2024 Jul)';

const PanelShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex min-h-0 flex-col rounded-sm border border-panelBorder bg-panelSurface p-2">
    <div className="mb-0.5">
      <div className="text-[8px] leading-tight text-labelMuted">{DATE_FILTER} ▾</div>
      <h3 className="text-[9px] font-semibold uppercase tracking-wide text-textWhite">{title}</h3>
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </section>
);

const OrangeBarChart: React.FC<{ data: number[]; yTicks: number[]; maxValue: number; id: string; showEveryLabel?: boolean }> = ({
  data,
  yTicks,
  maxValue,
  id,
  showEveryLabel = false,
}) => {
  const width = 420;
  const height = 148;
  const padL = 28;
  const padR = 4;
  const padT = 4;
  const padB = 18;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const barGap = 1.5;
  const barW = (chartW - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} width="100%" height="100%" className="block h-full w-full" role="img" aria-labelledby={id}>
      <title id={id}>Bar chart</title>
      {yTicks.map((tick) => {
        const y = padT + chartH - (tick / maxValue) * chartH;
        return (
          <g key={tick}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#163656" strokeWidth={0.75} />
            <text x={padL - 2} y={y + 2.5} textAnchor="end" fill="#6B849F" fontSize="6">
              {tick >= 1000 ? \`\${Math.round(tick / 1000)}k\` : tick}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke="#163656" strokeWidth={0.75} />
      {data.map((value, i) => {
        const barH = (value / maxValue) * chartH;
        const x = padL + i * (barW + barGap);
        const y = padT + chartH - barH;
        const showMonth = showEveryLabel || i % 2 === 0;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill="#F57B00" />
            <text x={x + barW / 2} y={y - 2} textAnchor="middle" fill="#FFFFFF" fontSize="5" fontWeight="600">
              {value.toLocaleString()}
            </text>
            {showMonth && (
              <text x={x + barW / 2} y={padT + chartH + 9} textAnchor="middle" fill="#6B849F" fontSize="5">{MONTHS[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const SESSIONS = [55754, 88093, 72243, 69274, 62860, 57754, 53420, 58900, 61200, 59800, 62100, 64500];
const NEW_SESSIONS = [672, 315, 571, 722, 580, 490, 620, 550, 680, 520, 698, 640];
const CLOSED_WON = [58, 42, 65, 52, 68, 62, 48, 55, 66, 60, 50, 54];
const DEALS_CREATED = [12, 8, 14, 10, 16, 13, 9, 11, 15, 12, 8, 10];

const DealsChart: React.FC = () => {
  const width = 420;
  const height = 148;
  const padL = 28;
  const padR = 4;
  const padT = 26;
  const padB = 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxValue = 72;
  const barGap = 1.5;
  const groupW = (chartW - barGap * (CLOSED_WON.length - 1)) / CLOSED_WON.length;
  const barW = (groupW - 1) / 2;

  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} width="100%" height="100%" className="block h-full w-full" role="img" aria-label="Deals chart">
      <text x={padL} y={10} fill="#6B849F" fontSize="5.5">Closed Won Deals</text>
      <text x={padL} y={18} fill="#FFFFFF" fontSize="7.5" fontWeight="700">923</text>
      <text x={padL + 72} y={10} fill="#6B849F" fontSize="5.5">Deals Created</text>
      <text x={padL + 72} y={18} fill="#FFFFFF" fontSize="7.5" fontWeight="700">63</text>
      {[0, 20, 40, 60].map((tick) => {
        const y = padT + chartH - (tick / maxValue) * chartH;
        return <line key={tick} x1={padL} y1={y} x2={width - padR} y2={y} stroke="#163656" strokeWidth={0.75} />;
      })}
      <line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke="#163656" strokeWidth={0.75} />
      {CLOSED_WON.map((cw, i) => {
        const dc = DEALS_CREATED[i];
        const xGroup = padL + i * (groupW + barGap);
        const cwH = (cw / maxValue) * chartH;
        const dcH = (dc / maxValue) * chartH;
        return (
          <g key={i}>
            <rect x={xGroup} y={padT + chartH - cwH} width={barW} height={cwH} fill="#F57B00" />
            <rect x={xGroup + barW + 1} y={padT + chartH - dcH} width={barW} height={dcH} fill="#FF4081" />
            {(i % 2 === 0) && (
              <text x={xGroup + groupW / 2} y={padT + chartH + 9} textAnchor="middle" fill="#6B849F" fontSize="5">{MONTHS[i]}</text>
            )}
          </g>
        );
      })}
      <g transform={\`translate(\${width / 2 - 66}, \${height - 7})\`}>
        <rect x={0} y={-5} width={6} height={6} fill="#F57B00" />
        <text x={9} y={0} fill="#6B849F" fontSize="5.5">Closed Won Deals</text>
        <rect x={78} y={-5} width={6} height={6} fill="#FF4081" />
        <text x={87} y={0} fill="#6B849F" fontSize="5.5">Deals Created</text>
      </g>
    </svg>
  );
};

const BottomChartsContainer: React.FC = () => (
  <section aria-label="Bottom row charts" className="grid min-h-0 grid-cols-1 gap-2 md:grid-cols-3">
    <PanelShell title="Sessions">
      <OrangeBarChart id="sessions" data={SESSIONS} yTicks={[20000, 40000, 60000, 80000, 100000]} maxValue={100000} />
    </PanelShell>
    <PanelShell title="Deals Created & Closed Won">
      <DealsChart />
    </PanelShell>
    <PanelShell title="New Subscriptions">
      <OrangeBarChart id="new-subscriptions" data={NEW_SESSIONS} yTicks={[200, 400, 600, 800]} maxValue={800} showEveryLabel />
    </PanelShell>
  </section>
);

export default BottomChartsContainer;
`;

export function applyDashboardLayoutPatches(project: GeneratedProjectV1): GeneratedProjectV1 {
  let next = project;
  next = upsertFileContent(next, "src/index.css", INDEX_CSS, "css", "Global dashboard styles");
  next = upsertFileContent(next, "tailwind.config.js", TAILWIND_CONFIG, "js", "Tailwind dashboard tokens");
  next = upsertFileContent(next, "src/components/Dashboard.tsx", DASHBOARD_TSX);
  next = upsertFileContent(next, "src/components/MarketingSalesFunnelPanel.tsx", FUNNEL_PANEL_TSX);
  next = upsertFileContent(next, "src/components/SalesCloseRatePanel.tsx", SALES_CLOSE_RATE_TSX);
  next = upsertFileContent(next, "src/components/BottomChartsContainer.tsx", BOTTOM_CHARTS_TSX);
  return next;
}

export function isSalesDashboardProject(project: GeneratedProjectV1): boolean {
  return project.files.some((file) => normalizeProjectPath(file.path) === "src/components/Dashboard.tsx");
}
