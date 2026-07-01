function CounteragentTable() {
  return (
    <div className="card">

      <table className="counteragentTable">

        <thead>
          <tr>
            <th>Company</th>
            <th>Country</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Bookings</th>
            <th>Revenue</th>
            <th>Balance</th>
            <th>AI Rating</th>
          </tr>
        </thead>

        <tbody>

          <tr>
            <td colSpan={8} style={{ textAlign: "center", padding: "40px" }}>
              No counteragents found.
            </td>
          </tr>

        </tbody>

      </table>

    </div>
  );
}

export default CounteragentTable;