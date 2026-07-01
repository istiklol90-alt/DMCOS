import Button from "../ui/Button";

function CounteragentToolbar() {
  return (
    <div className="toolbar">
      <div className="toolbarLeft">
        <h2>Counteragents</h2>
        <p>Manage all partner agencies from one place.</p>
      </div>

      <div className="toolbarRight">
        <Button>+ Add Counteragent</Button>
        <Button>Export Excel</Button>
        <Button>Export PDF</Button>
        <Button>AI Analysis</Button>
      </div>
    </div>
  );
}

export default CounteragentToolbar;