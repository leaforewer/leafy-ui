import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
};

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary" ? "leafy-btn leafy-btn-primary" : "leafy-btn";

  return (
    <button
      className={`bg-red-500 ${variantClass} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
