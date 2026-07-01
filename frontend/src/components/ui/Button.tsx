// 📁 frontend/src/components/ui/Button.tsx

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "success" | "warning"; // ⬅️ НОВОЕ
};

function Button({
  children,
  onClick,
  type = "button",
  className = "",
  variant = "primary", // ⬅️ НОВОЕ
}: ButtonProps) {
  // Базовый класс + вариант
  const buttonClass = `btn btn-${variant} ${className}`;

  return (
    <button
      type={type}
      onClick={onClick}
      className={buttonClass}
    >
      {children}
    </button>
  );
}

export default Button;