// controllers/userController.js
const bcrypt = require("bcryptjs");
const { pool, sql } = require("../config/database");

// @route   GET api/users
// @desc    Get all users
// @access  Private/Admin
exports.getAllUsers = async (req, res) => {
  try {
    await pool.connect();

    const result = await pool
      .request()
      .query("SELECT userId, name, username, role FROM Users");

    res.json({
      success: true,
      users: result.recordset,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.getAllUsersWithAssignments = async (req, res) => {
  try {
    await pool.connect();

    // Get all users except admin
    const usersResult = await pool
      .request()
      .query(
        "SELECT userId, name, username, role FROM Users WHERE role != 'admin'"
      );

    const users = usersResult.recordset;

    // For each user, get their assignments
    const usersWithAssignments = await Promise.all(
      users.map(async (user) => {
        // Get container assignments
        const containerResult = await pool
          .request()
          .input("userId", user.userId)
          .query(
            "SELECT ca.id, ca.containerName, ca.createdAt FROM ContainerAssignments ca WHERE ca.userId = @userId"
          );

        // Get folder assignments
        const folderResult = await pool
          .request()
          .input("userId", user.userId)
          .query(
            "SELECT fa.id, fa.containerName, fa.folderName, fa.createdAt FROM FolderAssignments fa WHERE fa.userId = @userId"
          );

        return {
          ...user,
          containerAssignments: containerResult.recordset,
          folderAssignments: folderResult.recordset,
        };
      })
    );

    res.json({
      success: true,
      users: usersWithAssignments,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/users/:id
// @desc    Get user by ID
// @access  Private/Admin

// In controllers/userController.js - modify the getUserById function

exports.getUserById = async (req, res) => {
  try {
    await pool.connect();

    const result = await pool
      .request()
      .input("id", req.params.id)
      .query(
        "SELECT userId, name, username, role FROM Users WHERE userId = @id"
      );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.recordset[0];

    // Get container assignments
    const containerResult = await pool
      .request()
      .input("userId", user.userId)
      .query(
        "SELECT id, containerName, createdAt FROM ContainerAssignments WHERE userId = @userId"
      );

    // Get folder assignments
    const folderResult = await pool
      .request()
      .input("userId", user.userId)
      .query(
        "SELECT id, containerName, folderName, createdAt FROM FolderAssignments WHERE userId = @userId"
      );

    res.json({
      success: true,
      user: {
        ...user,
        containerAssignments: containerResult.recordset,
        folderAssignments: folderResult.recordset,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   PUT api/users/:id
// @desc    Update user
// @access  Private/Admin
exports.updateUser = async (req, res) => {
  const { name, username, password, role } = req.body;

  // Validate role
  if (role && !["doctor", "nurse", "assistant"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Invalid role",
    });
  }

  try {
    await pool.connect();

    // Check if user exists
    const userCheck = await pool
      .request()
      .input("id", req.params.id)
      .query("SELECT * FROM Users WHERE userId = @id");

    if (userCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update fields
    let query = "UPDATE Users SET ";
    const inputs = [];

    if (name) {
      inputs.push("name = @name");
    }

    if (username) {
      // Check if username is already taken by another user
      const usernameCheck = await pool
        .request()
        .input("username", username)
        .input("id", req.params.id)
        .query(
          "SELECT * FROM Users WHERE username = @username AND UserId != @id"
        );

      if (usernameCheck.recordset.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Username already exists",
        });
      }

      inputs.push("username = @username");
    }

    if (password) {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      inputs.push("password = @password");
      req.body.password = hashedPassword;
    }

    if (role) {
      inputs.push("role = @role");
    }

    if (inputs.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    query += inputs.join(", ") + " WHERE UserId = @id";

    // Execute update query
    const request = pool.request().input("id", req.params.id);

    if (name) request.input("name", name);
    if (username) request.input("username", username);
    if (password) request.input("password", req.body.password);
    if (role) request.input("role", role);

    await request.query(query);

    // Get updated user
    const result = await pool
      .request()
      .input("id", req.params.id)
      .query(
        "SELECT UserId, name, username, role FROM Users WHERE userId = @id"
      );

    res.json({
      success: true,
      user: result.recordset[0],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   DELETE api/users/:id
// @desc    Delete user
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    await pool.connect();

    // Start a transaction to ensure all operations succeed or fail together
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Check if user exists
      const userCheck = await new sql.Request(transaction)
        .input("id", req.params.id)
        .query("SELECT * FROM Users WHERE userId = @id");

      if (userCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const userToDelete = userCheck.recordset[0];

      // FIXED: Handle PatientRequests foreign key constraints properly
      // Set foreign key references to NULL (preserves history)
      await new sql.Request(transaction).input("userId", req.params.id).query(`
          UPDATE PatientRequests 
          SET createdPatientId = NULL 
          WHERE createdPatientId = @userId
        `);

      await new sql.Request(transaction).input("userId", req.params.id).query(`
          UPDATE PatientRequests 
          SET doctorId = NULL 
          WHERE doctorId = @userId
        `);

      await new sql.Request(transaction).input("userId", req.params.id).query(`
          UPDATE PatientRequests 
          SET approvedBy = NULL 
          WHERE approvedBy = @userId
        `);

      // Handle FileAudit records - delete them
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query("DELETE FROM FileAudit WHERE userId = @userId");

      // Delete user assignments
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query("DELETE FROM ContainerAssignments WHERE userId = @userId");

      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query("DELETE FROM FolderAssignments WHERE userId = @userId");

      // Finally, delete the user
      await new sql.Request(transaction)
        .input("id", req.params.id)
        .query("DELETE FROM Users WHERE userId = @id");

      // Commit the transaction if all operations succeed
      await transaction.commit();

      res.json({
        success: true,
        message: `User ${userToDelete.name} (${userToDelete.username}) deleted successfully`,
        deletedUser: {
          userId: userToDelete.userId,
          name: userToDelete.name,
          username: userToDelete.username,
          role: userToDelete.role,
        },
      });
    } catch (err) {
      // Roll back the transaction if any operation fails
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
