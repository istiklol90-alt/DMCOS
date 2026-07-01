import CounteragentToolbar from "../components/counteragents/CounteragentToolbar";
import CounteragentStats from "../components/counteragents/CounteragentStats";
import CounteragentFilters from "../components/counteragents/CounteragentFilters";
import CounteragentTable from "../components/counteragents/CounteragentTable";

function CounteragentDashboard() {
  return (
    <main className="dashboardPage">

      <CounteragentToolbar />

      <CounteragentStats />

      <CounteragentFilters />

      <CounteragentTable />

    </main>
  );
}

export default CounteragentDashboard;