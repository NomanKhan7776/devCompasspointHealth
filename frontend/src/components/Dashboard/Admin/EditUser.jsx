import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usersAPI } from "../../../api";
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";

const EditUser = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "", // Optional, only if changing password
    role: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const res = await usersAPI.getUserById(userId);
        const user = res.data.user;

        setFormData({
          name: user.name,
          username: user.username,
          password: "", // Don't populate password
          role: user.role,
        });
      } catch (err) {
        setError("Failed to load user data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Create update object (only include password if provided)
    const updateData = {
      name: formData.name,
      username: formData.username,
      role: formData.role,
    };

    if (formData.password) {
      updateData.password = formData.password;
    }

    try {
      setSaving(true);
      setError("");

      await usersAPI.updateUser(userId, updateData);
      navigate("/users", { state: { message: "User updated successfully" } });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader size="large" />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Edit User</h1>

      {error && <Alert message={error} type="error" />}

      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter full name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password{" "}
              <span className="text-gray-500">
                (Leave blank to keep current password)
              </span>
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select role</option>
              <option value="doctor">Doctor</option>
              <option value="nurse">Nurse</option>
              <option value="assistant">Assistant</option>
            </select>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              color="gray"
              onClick={() => navigate("/users")}
            >
              Cancel
            </Button>
            <Button type="submit" color="blue" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditUser;
