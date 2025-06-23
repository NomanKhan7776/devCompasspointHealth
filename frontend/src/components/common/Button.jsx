// Fixed Button.jsx - Added support for polymorphic rendering with 'as' prop

import React from "react";

const Button = ({
  children,
  onClick,
  type = "button",
  color = "blue",
  size = "md",
  disabled = false,
  loading = false,
  isLoading = false, // Handle both loading and isLoading props
  className = "",
  as: Component = "button", // ADD: Support for polymorphic rendering
  ...props
}) => {
  // Use either loading or isLoading prop
  const isLoadingState = loading || isLoading;

  // Remove isLoading and 'as' from props that get passed to DOM element
  const { isLoading: _, as: __, ...domProps } = props;

  const baseClasses =
    "inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const colorClasses = {
    blue: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 active:bg-blue-800",
    red: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800",
    green:
      "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 active:bg-green-800",
    yellow:
      "bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500 active:bg-yellow-800",
    gray: "bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 active:bg-gray-800",
    white:
      "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-blue-500 active:bg-gray-100",
    outline:
      "bg-transparent text-blue-600 border border-blue-600 hover:bg-blue-50 focus:ring-blue-500 active:bg-blue-100",
  };

  const sizeClasses = {
    xs: "px-2.5 py-1.5 text-xs",
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-4 py-2 text-base",
    xl: "px-6 py-3 text-base",
  };

  const finalClassName = `${baseClasses} ${colorClasses[color]} ${sizeClasses[size]} ${className}`;

  // Prepare common props
  const commonProps = {
    className: finalClassName,
    disabled: disabled || isLoadingState,
    ...domProps,
  };

  // Add type and onClick only for button elements
  if (Component === "button") {
    commonProps.type = type;
    commonProps.onClick = onClick;
  }

  return (
    <Component {...commonProps}>
      {isLoadingState && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
      {children}
    </Component>
  );
};

export default Button;
