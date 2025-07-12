import React from "react";

const Loader = ({ size = "medium" }) => {
  const sizeClasses = {
    small: "w-4 h-4",
    medium: "w-8 h-8",
    large: "w-12 h-12",
  };

  return (
    <div className="flex justify-center items-center">
      <div
        className={`animate-spin rounded-full border-t-2 border-blue-500 border-opacity-50 ${sizeClasses[size]}`}
      ></div>
    </div>
  );
};

export default Loader;
