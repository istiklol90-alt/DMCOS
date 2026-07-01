import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <div className="dashboard">

      <DashboardHeader />

      <div className="dashboardBody">

        <DashboardSidebar />

        <main className="dashboardContent">
          {children}
        </main>

      </div>

    </div>
  );
}

export default DashboardLayout;