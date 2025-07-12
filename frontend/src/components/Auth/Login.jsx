import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import Button from "../common/Button";
import Alert from "../common/Alert";
import Footer from "../Layout/Footer";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for session expired parameter
    const params = new URLSearchParams(location.search);
    if (params.get("session") === "expired") {
      setSessionExpired(true);
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSessionExpired(false);

      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            {/* Logo image with background */}
            <div className="flex justify-center mb-4">
              <div className="bg-zinc-100 rounded-full p-2 inline-block">
                <img
                  src="/image2.png"
                  alt="Compass Point Health Logo"
                  className="h-24"
                />
              </div>
            </div>

            <h1 className="text-xl font-bold text-gray-600">
              Patient Records Management System
            </h1>
            <p className="text-gray-600">Login to access your dashboard</p>
          </div>

          {sessionExpired && (
            <Alert
              message="Your session has expired or your account has been deleted. Please log in again."
              type="warning"
            />
          )}

          {error && <Alert message={error} type="error" />}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
              />
            </div>

            <Button
              type="submit"
              color="blue"
              disabled={loading}
              className="w-full"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Login;
