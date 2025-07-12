import React, { useState, useEffect } from "react";

const Alert = ({ message, type = "info", duration = 5000, onClose }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        if (onClose) onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!visible) return null;

  const alertStyles = {
    success: "bg-green-100 border-green-500 text-green-700",
    error: "bg-red-100 border-red-500 text-red-700",
    warning: "bg-yellow-100 border-yellow-500 text-yellow-700",
    info: "bg-blue-100 border-blue-500 text-blue-700",
  };

  return (
    <div className={`border-l-4 p-4 mb-4 rounded-md ${alertStyles[type]}`}>
      <div className="flex justify-between">
        <p>{message}</p>
        <button
          onClick={() => {
            setVisible(false);
            if (onClose) onClose();
          }}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Alert;
