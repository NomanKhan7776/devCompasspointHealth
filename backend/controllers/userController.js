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

      // ✅ FIXED: Handle QRRegistrationTokens foreign key constraint
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query(
          "DELETE FROM QRRegistrationTokens WHERE patientUserId = @userId"
        );

      // ✅ Handle Users created by PatientRequests from this user
      // First, find any users that were created from patient requests made by this user
      const createdUsersCheck = await new sql.Request(transaction).input(
        "userId",
        req.params.id
      ).query(`
          SELECT u.userId, u.name, u.username 
          FROM Users u 
          INNER JOIN PatientRequests pr ON u.createdByRequest = pr.requestId 
          WHERE pr.doctorId = @userId
        `);

      // For each user created by this doctor's patient requests, we need to handle them
      for (const createdUser of createdUsersCheck.recordset) {
        console.log(
          `Handling user created by patient request: ${createdUser.name} (${createdUser.userId})`
        );

        // Set createdByRequest to NULL for these users (preserves the users but removes the constraint)
        await new sql.Request(transaction)
          .input("createdUserId", createdUser.userId)
          .query(
            "UPDATE Users SET createdByRequest = NULL WHERE userId = @createdUserId"
          );
      }

      // ✅ Handle SmartTokenEmergencyAlerts first (references enhancedLogId from EnhancedTokenAccessLog)
      await new sql.Request(transaction).input("userId", req.params.id).query(`
          DELETE FROM SmartTokenEmergencyAlerts 
          WHERE enhancedLogId IN (
            SELECT logId FROM EnhancedTokenAccessLog WHERE patientUserId = @userId
          )
        `);

      // ✅ Handle SmartTokenEmergencyAlerts direct patientUserId foreign key constraint
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query(
          "DELETE FROM SmartTokenEmergencyAlerts WHERE patientUserId = @userId"
        );

      // ✅ Handle EnhancedTokenAccessLog - this table exists and has foreign key constraints
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query(
          "DELETE FROM EnhancedTokenAccessLog WHERE patientUserId = @userId"
        );

      // ✅ Handle any other potential logs that reference users
      try {
        await new sql.Request(transaction)
          .input("userId", req.params.id)
          .query("DELETE FROM DeviceAccessLogs WHERE userId = @userId");
      } catch (logErr) {
        console.log(
          "DeviceAccessLogs cleanup - no userId column or table doesn't exist"
        );
      }

      // ✅ FIXED: Handle PatientRequests properly
      // Check if there are any PatientRequests referencing this user as doctor
      const patientRequestsCheck = await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query(
          "SELECT COUNT(*) as count FROM PatientRequests WHERE doctorId = @userId"
        );

      if (patientRequestsCheck.recordset[0].count > 0) {
        // Create a placeholder "deleted doctor" user for historical records
        const deletedDoctorCheck = await new sql.Request(transaction).query(
          "SELECT userId FROM Users WHERE username = 'deleted_doctor' AND role = 'doctor'"
        );

        let deletedDoctorId;
        if (deletedDoctorCheck.recordset.length === 0) {
          // Create a placeholder deleted doctor user
          const createDeleted = await new sql.Request(transaction)
            .input("name", "Deleted Doctor")
            .input("username", "deleted_doctor")
            .input("password", "N/A") // This account can't be logged into
            .input("role", "doctor").query(`
              INSERT INTO Users (name, username, password, role) 
              OUTPUT INSERTED.userId
              VALUES (@name, @username, @password, @role)
            `);
          deletedDoctorId = createDeleted.recordset[0].userId;
        } else {
          deletedDoctorId = deletedDoctorCheck.recordset[0].userId;
        }

        // Update PatientRequests to reference the deleted doctor placeholder
        await new sql.Request(transaction)
          .input("userId", req.params.id)
          .input("deletedDoctorId", deletedDoctorId).query(`
            UPDATE PatientRequests 
            SET doctorId = @deletedDoctorId 
            WHERE doctorId = @userId
          `);
      }

      // Handle other PatientRequests fields that can be set to NULL
      await new sql.Request(transaction).input("userId", req.params.id).query(`
          UPDATE PatientRequests 
          SET createdPatientId = NULL 
          WHERE createdPatientId = @userId
        `);

      await new sql.Request(transaction).input("userId", req.params.id).query(`
          UPDATE PatientRequests 
          SET approvedBy = NULL 
          WHERE approvedBy = @userId
        `);

      // ✅ Handle SmartTokens that reference this user
      await new sql.Request(transaction).input("userId", req.params.id).query(`
          UPDATE SmartTokens 
          SET patientUserId = NULL, doctorUserId = NULL 
          WHERE patientUserId = @userId OR doctorUserId = @userId
        `);

      // Handle FileAudit records - delete them
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query("DELETE FROM FileAudit WHERE userId = @userId");

      // ✅ Handle EmergencyContacts if they exist
      await new sql.Request(transaction)
        .input("userId", req.params.id)
        .query("DELETE FROM EmergencyContacts WHERE patientUserId = @userId");

      // ✅ Handle EmergencyContactAlerts - check if table exists and handle appropriately
      try {
        await new sql.Request(transaction)
          .input("userId", req.params.id)
          .query(
            "DELETE FROM EmergencyContactAlerts WHERE patientUserId = @userId"
          );
      } catch (alertsErr) {
        // Try alternative column name if first attempt fails
        try {
          await new sql.Request(transaction)
            .input("userId", req.params.id)
            .query("DELETE FROM EmergencyContactAlerts WHERE userId = @userId");
        } catch (tableErr) {
          // Table might not exist or different structure, continue
          console.log(
            "EmergencyContactAlerts table not found or different structure, skipping..."
          );
        }
      }

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
      console.error("Transaction rollback due to error:", err.message);
      throw err;
    }
  } catch (err) {
    console.error("Delete user error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message.includes("REFERENCE constraint")
        ? "Cannot delete user due to existing references. Please contact administrator."
        : "Server error occurred while deleting user",
      error: err.message,
    });
  }
};
