const menu = [
  "Dashboard",
  "Counteragents",
  "Hotels",
  "Contracts",
  "Rates",
  "Bookings",
  "Finance",
  "Reports",
  "AI Assistant",
  "Settings",
];

function DashboardSidebar() {
  return (
    <aside className="dashboardSidebar">
      <h3>Main Menu</h3>

      <ul>
        {menu.map((item) => (
          <li key={item}>
            <button className="sidebarButton">
              {item}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default DashboardSidebar;