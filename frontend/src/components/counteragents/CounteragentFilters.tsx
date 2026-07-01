function CounteragentFilters() {
  return (
    <div className="card">

      <h3>Search & Filters</h3>

      <div className="filtersGrid">

        <input
          type="text"
          placeholder="Search company, contact, email..."
        />

        <select>
          <option>All Countries</option>
          <option>Tajikistan</option>
          <option>Uzbekistan</option>
          <option>Kazakhstan</option>
          <option>Russia</option>
          <option>Maldives</option>
        </select>

        <select>
          <option>All Status</option>
          <option>Pending</option>
          <option>Approved</option>
          <option>Blocked</option>
        </select>

        <select>
          <option>AI Rating</option>
          <option>VIP</option>
          <option>Good</option>
          <option>Growing</option>
          <option>Payment Risk</option>
          <option>Fraud Risk</option>
        </select>

      </div>

    </div>
  );
}

export default CounteragentFilters;