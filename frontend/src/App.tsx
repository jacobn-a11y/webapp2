import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AccountDetailPage } from "./pages/AccountDetailPage";
import { LandingPageEditorPage } from "./pages/LandingPageEditorPage";
import { AdminAccountAccessPage } from "./pages/AdminAccountAccessPage";
import { AdminPermissionsPage } from "./pages/AdminPermissionsPage";
import { TranscriptViewerPage } from "./pages/TranscriptViewerPage";
import { DashboardPagesPage } from "./pages/DashboardPagesPage";
import { ChatbotConnectorPage } from "./pages/ChatbotConnectorPage";
import { AnalyticsDashboardPage } from "./pages/AnalyticsDashboardPage";
import { AccountJourneyPage } from "./pages/AccountJourneyPage";
import { AdminRolesPage } from "./pages/AdminRolesPage";
import { AdminStoryContextPage } from "./pages/AdminStoryContextPage";
import { AdminAuditLogsPage } from "./pages/AdminAuditLogsPage";
import { AdminSessionsPage } from "./pages/AdminSessionsPage";
import { AdminIntegrationHealthPage } from "./pages/AdminIntegrationHealthPage";
import { AdminGovernancePage } from "./pages/AdminGovernancePage";
import { AdminAutomationPage } from "./pages/AdminAutomationPage";
import { AdminOnboardingPage } from "./pages/AdminOnboardingPage";
import { AdminKpiPage } from "./pages/AdminKpiPage";
import { AdminBillingPage } from "./pages/AdminBillingPage";
import { AdminDrPage } from "./pages/AdminDrPage";
import { AdminSupportPage } from "./pages/AdminSupportPage";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return "app-nav__link" + (isActive ? " app-nav__link--active" : "");
}

function adminLinkClass({ isActive }: { isActive: boolean }) {
  return "app-nav__dropdown-item" + (isActive ? " app-nav__dropdown-item--active" : "");
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="app-nav">
          <NavLink to="/" className="app-nav__logo">
            StoryEngine
          </NavLink>
          <div className="app-nav__links">
            <NavLink to="/dashboard/pages" className={navLinkClass}>
              Pages
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass}>
              Analytics
            </NavLink>
            <NavLink to="/chat" className={navLinkClass}>
              Chat
            </NavLink>
            <div className="app-nav__dropdown">
              <button className="app-nav__dropdown-trigger">
                Admin ▾
              </button>
              <div className="app-nav__dropdown-menu">
                <NavLink to="/admin/permissions" className={adminLinkClass}>
                  Permissions
                </NavLink>
                <NavLink to="/admin/roles" className={adminLinkClass}>
                  Roles
                </NavLink>
                <NavLink to="/admin/account-access" className={adminLinkClass}>
                  Account Access
                </NavLink>
                <NavLink to="/admin/story-context" className={adminLinkClass}>
                  Story Context
                </NavLink>
                <NavLink to="/admin/audit-logs" className={adminLinkClass}>
                  Audit Logs
                </NavLink>
                <NavLink to="/admin/sessions" className={adminLinkClass}>
                  Sessions
                </NavLink>
                <NavLink to="/admin/integration-health" className={adminLinkClass}>
                  Integrations
                </NavLink>
                <NavLink to="/admin/governance" className={adminLinkClass}>
                  Governance
                </NavLink>
                <NavLink to="/admin/automation" className={adminLinkClass}>
                  Automation
                </NavLink>
                <NavLink to="/admin/onboarding" className={adminLinkClass}>
                  Onboarding
                </NavLink>
                <NavLink to="/admin/kpi" className={adminLinkClass}>
                  KPI
                </NavLink>
                <NavLink to="/admin/billing" className={adminLinkClass}>
                  Billing
                </NavLink>
                <NavLink to="/admin/dr" className={adminLinkClass}>
                  Disaster Recovery
                </NavLink>
                <NavLink to="/admin/support" className={adminLinkClass}>
                  Support
                </NavLink>
              </div>
            </div>
          </div>
        </nav>
        <main className="app-content">
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/accounts/acc_meridian" replace />}
            />
            <Route
              path="/accounts/:accountId"
              element={<AccountDetailPage />}
            />
            <Route
              path="/accounts/:accountId/journey"
              element={<AccountJourneyPage />}
            />
            <Route
              path="/pages/:pageId/edit"
              element={<LandingPageEditorPage />}
            />
            <Route
              path="/admin/account-access"
              element={<AdminAccountAccessPage />}
            />
            <Route
              path="/admin/permissions"
              element={<AdminPermissionsPage />}
            />
            <Route
              path="/admin/roles"
              element={<AdminRolesPage />}
            />
            <Route
              path="/admin/story-context"
              element={<AdminStoryContextPage />}
            />
            <Route
              path="/admin/audit-logs"
              element={<AdminAuditLogsPage />}
            />
            <Route
              path="/calls/:callId/transcript"
              element={<TranscriptViewerPage />}
            />
            <Route
              path="/dashboard/pages"
              element={<DashboardPagesPage />}
            />
            <Route
              path="/chat"
              element={<ChatbotConnectorPage />}
            />
            <Route
              path="/analytics"
              element={<AnalyticsDashboardPage />}
            />
            <Route
              path="/admin/sessions"
              element={<AdminSessionsPage />}
            />
            <Route
              path="/admin/integration-health"
              element={<AdminIntegrationHealthPage />}
            />
            <Route
              path="/admin/governance"
              element={<AdminGovernancePage />}
            />
            <Route
              path="/admin/automation"
              element={<AdminAutomationPage />}
            />
            <Route
              path="/admin/onboarding"
              element={<AdminOnboardingPage />}
            />
            <Route
              path="/admin/kpi"
              element={<AdminKpiPage />}
            />
            <Route
              path="/admin/billing"
              element={<AdminBillingPage />}
            />
            <Route
              path="/admin/dr"
              element={<AdminDrPage />}
            />
            <Route
              path="/admin/support"
              element={<AdminSupportPage />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
