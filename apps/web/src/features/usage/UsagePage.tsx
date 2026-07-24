import { NavLink } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { AppHeader } from "../layout/AppHeader";
import { BudgetWarning } from "./BudgetWarning";
import { UsageLimits } from "./UsageLimits";
import { UsageOperationList } from "./UsageOperationList";
import { UsageProgress } from "./UsageProgress";
import { UsageSummaryCard } from "./UsageSummaryCard";
import { useUsage } from "./useUsage";

function AccountNav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"}`;

  return (
    <nav aria-label="Account sections" className="flex flex-wrap gap-2">
      <NavLink to="/account" className={linkClass} end>
        Profile
      </NavLink>
      <NavLink to="/account" className={linkClass} end>
        Sessions
      </NavLink>
      <NavLink to="/account/usage" className={linkClass}>
        Usage
      </NavLink>
    </nav>
  );
}

export function UsagePage() {
  const { accountUsage, operations, loading, error } = useUsage();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <AppHeader />
        <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Usage</h1>
            <p className="mt-2 text-slate-300">
              Track AI token usage, estimated and actual costs, and remaining monthly allowance. Billing periods use UTC
              calendar months.
            </p>
          </div>

          <AccountNav />

          {loading ? <p>Loading usage…</p> : null}
          {error ? <p role="alert">{error}</p> : null}

          {accountUsage ? (
            <>
              {accountUsage.limits.warningMessage ? (
                <BudgetWarning message={accountUsage.limits.warningMessage} />
              ) : null}
              <UsageSummaryCard summary={accountUsage.summary} />
              <UsageProgress limits={accountUsage.limits} />
              <UsageLimits limits={accountUsage.limits} />
            </>
          ) : null}

          {operations ? <UsageOperationList items={operations.items} /> : null}
        </main>
      </div>
    </ProtectedRoute>
  );
}
