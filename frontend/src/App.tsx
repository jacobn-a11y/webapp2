import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
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

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="app-nav">
          <Link to="/" className="app-nav__logo">
            StoryEngine
          </Link>
          <Link to="/" className="app-nav__link">
            Dashboard
          </Link>
          <Link to="/dashboard/pages" className="app-nav__link">
            Pages
          </Link>
          <Link to="/analytics" className="app-nav__link">
            Analytics
          </Link>
          <Link to="/chat" className="app-nav__link">
            Chat
          </Link>
          <Link to="/admin/permissions" className="app-nav__link">
            Admin
          </Link>
          <Link to="/admin/roles" className="app-nav__link">
            Roles
          </Link>
          <Link to="/admin/story-context" className="app-nav__link">
            Story Context
          </Link>
          <Link to="/admin/audit-logs" className="app-nav__link">
            Audit Logs
          </Link>
          <Link to="/admin/sessions" className="app-nav__link">
            Sessions
          </Link>
          <Link to="/admin/integration-health" className="app-nav__link">
            Integrations
          </Link>
          <Link to="/admin/governance" className="app-nav__link">
            Governance
          </Link>
          <Link to="/admin/automation" className="app-nav__link">
            Automation
          </Link>
          <Link to="/admin/onboarding" className="app-nav__link">
            Onboarding
          </Link>
          <Link to="/admin/kpi" className="app-nav__link">
            KPI
          </Link>
          <Link to="/admin/billing" className="app-nav__link">
            Billing
          </Link>
          <Link to="/admin/dr" className="app-nav__link">
            DR
          </Link>
          <Link to="/admin/support" className="app-nav__link">
            Support
          </Link>
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
