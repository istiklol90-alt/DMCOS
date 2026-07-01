function CounteragentStats() {
  const stats = [
    { title: "Total Counteragents", value: "0" },
    { title: "Approved", value: "0" },
    { title: "Pending", value: "0" },
    { title: "Blocked", value: "0" },
    { title: "Countries", value: "0" },
    { title: "Bookings", value: "0" },
    { title: "Revenue", value: "$0" },
    { title: "AI Risk", value: "0" },
  ];

  return (
    <div className="statsGrid">
      {stats.map((item) => (
        <div className="card" key={item.title}>
          <h3>{item.value}</h3>
          <p>{item.title}</p>
        </div>
      ))}
    </div>
  );
}

export default CounteragentStats;