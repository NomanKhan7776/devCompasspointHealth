// controllers/patientRequestController.js
const { pool, sql } = require("../config/database");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const config = require("../config/config");

// Email service configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: config.emailUser,
    pass: config.emailPassword,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// @route   POST api/patient-requests
// @desc    Create a new patient request
// @access  Private/Doctor
exports.createPatientRequest = async (req, res) => {
  // Only doctors can create patient requests
  if (req.user.role !== "doctor") {
    return res.status(403).json({
      success: false,
      message: "Only doctors can submit patient requests",
    });
  }

  const { patientName, patientEmail, patientPhone, containerName, folderName } =
    req.body;

  // Validate required fields
  if (
    !patientName ||
    !patientEmail ||
    !patientPhone ||
    !containerName ||
    !folderName
  ) {
    return res.status(400).json({
      success: false,
      message: "Required fields missing",
    });
  }

  try {
    await pool.connect();

    // Verify the doctor has access to this container and folder
    const accessCheck = await pool
      .request()
      .input("userId", req.user.userId)
      .input("containerName", containerName)
      .input("folderName", folderName).query(`
        SELECT ca.id FROM ContainerAssignments ca
        INNER JOIN FolderAssignments fa 
        ON ca.userId = fa.userId AND ca.containerName = fa.containerName
        WHERE ca.userId = @userId 
        AND ca.containerName = @containerName 
        AND fa.folderName = @folderName
      `);

    if (accessCheck.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this container/folder",
      });
    }

    // ✅ NEW: Check if folder is already requested or assigned to another patient

    const folderConflictCheck = await pool
      .request()
      .input("containerName", containerName)
      .input("folderName", folderName).query(`
    -- Check if folder is already in pending/approved requests (where patient still exists)
    SELECT 'request' as conflictType, patientName, requestStatus, requestDate, doctorName = u.name
    FROM PatientRequests pr
    INNER JOIN Users u ON pr.doctorId = u.userId
    WHERE pr.containerName = @containerName 
    AND pr.folderName = @folderName 
    AND pr.requestStatus IN ('pending', 'approved')
    AND (
      pr.requestStatus = 'pending' 
      OR (pr.requestStatus = 'approved' AND pr.createdPatientId IS NOT NULL 
          AND EXISTS (SELECT 1 FROM Users WHERE userId = pr.createdPatientId AND role = 'patient'))
    )
    
    UNION ALL
    
    -- Check if folder is already assigned to an existing patient
    SELECT 'assignment' as conflictType, patientName = u.name, requestStatus = 'assigned', 
           requestDate = u.createdAt, doctorName = 'System'
    FROM FolderAssignments fa
    INNER JOIN Users u ON fa.userId = u.userId
    WHERE fa.containerName = @containerName 
    AND fa.folderName = @folderName
    AND u.role = 'patient'
  `);

    if (folderConflictCheck.recordset.length > 0) {
      const conflict = folderConflictCheck.recordset[0];
      let conflictMessage = "";

      if (conflict.conflictType === "request") {
        conflictMessage = `This folder is already ${conflict.requestStatus} for patient "${conflict.patientName}" (requested by Dr. ${conflict.doctorName})`;
      } else {
        conflictMessage = `This folder is already assigned to patient "${conflict.patientName}"`;
      }

      return res.status(409).json({
        success: false,
        message: "Folder already in use",
        details: conflictMessage,
        conflictData: {
          patientName: conflict.patientName,
          status: conflict.requestStatus,
          type: conflict.conflictType,
        },
      });
    }

    // ✅ NEW: Also check if the same patient already has a request for any folder (optional business rule)
    const duplicatePatientCheck = await pool
      .request()
      .input("patientEmail", patientEmail).query(`
    SELECT patientName, containerName, folderName, requestStatus
    FROM PatientRequests 
    WHERE patientEmail = @patientEmail 
    AND (
      requestStatus = 'pending' 
      OR (requestStatus = 'approved' 
          AND createdPatientId IS NOT NULL 
          AND EXISTS (SELECT 1 FROM Users WHERE userId = PatientRequests.createdPatientId AND role = 'patient'))
    )
  `);

    if (duplicatePatientCheck.recordset.length > 0) {
      const existing = duplicatePatientCheck.recordset[0];
      return res.status(409).json({
        success: false,
        message: "Email already in use",
        details: `The email "${patientEmail}" is already assigned to "${existing.patientName}" for folder "${existing.folderName}" in container "${existing.containerName}". Each patient email can only be used for one folder assignment. Please use a different email address.`,
        conflictData: {
          existingPatient: existing.patientName,
          existingContainer: existing.containerName,
          existingFolder: existing.folderName,
          status: existing.requestStatus,
          requestedContainer: containerName,
          requestedFolder: folderName,
        },
      });
    }

    // Insert the request (original code continues...)
    const result = await pool
      .request()
      .input("doctorId", req.user.userId)
      .input("patientName", patientName)
      .input("patientEmail", patientEmail)
      .input("patientPhone", patientPhone)
      .input("containerName", containerName)
      .input("folderName", folderName).query(`
        INSERT INTO PatientRequests 
        (doctorId, patientName, patientEmail, patientPhone, containerName, folderName)
        OUTPUT INSERTED.requestId
        VALUES (@doctorId, @patientName, @patientEmail, @patientPhone, @containerName, @folderName)
      `);

    const requestId = result.recordset[0].requestId;

    res.status(201).json({
      success: true,
      message: "Patient request submitted successfully",
      requestId: requestId,
    });
  } catch (err) {
    console.error("Create patient request error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/patient-requests
// @desc    Get all patient requests (admin) or doctor's requests (doctor)
// @access  Private/Admin,Doctor
exports.getPatientRequests = async (req, res) => {
  try {
    await pool.connect();

    let query = `
  SELECT pr.requestId,
         pr.doctorId,
         pr.patientEmail,
         pr.patientPhone,
         pr.containerName,
         pr.folderName,
         pr.requestStatus,
         pr.requestDate,
         pr.approvedDate,
         pr.rejectionReason,
         pr.createdPatientId,
         pr.approvedBy,
         -- Use original patient name for pending, created user name for approved
         CASE 
           WHEN pr.requestStatus = 'pending' OR pu.name IS NULL 
           THEN pr.patientName 
           ELSE pu.name 
         END as patientName,
         u.name as doctorName,
         au.name as approvedByName,
         pu.username as patientUsername
  FROM PatientRequests pr
  INNER JOIN Users u ON pr.doctorId = u.userId
  LEFT JOIN Users au ON pr.approvedBy = au.userId
  LEFT JOIN Users pu ON pr.createdPatientId = pu.userId
  WHERE 1=1
`;

    // FIXED: Only show requests where patient still exists OR request is pending
    query += ` AND (
      pr.requestStatus = 'pending' 
      OR pr.requestStatus = 'rejected'
      OR (pr.requestStatus = 'approved' AND pr.createdPatientId IS NOT NULL AND pu.userId IS NOT NULL)
    )`;

    // Add filter for doctors - they can only see their own requests
    if (req.user.role === "doctor") {
      query += " AND pr.doctorId = @userId";
    }

    // Add sorting
    query += " ORDER BY pr.requestDate DESC";

    const result = await pool
      .request()
      .input("userId", req.user.userId)
      .query(query);

    res.json({
      success: true,
      requests: result.recordset,
    });
  } catch (err) {
    console.error("Get patient requests error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/patient-requests/:requestId
// @desc    Get a specific patient request
// @access  Private/Admin,Doctor(own)
exports.getPatientRequest = async (req, res) => {
  try {
    await pool.connect();

    // Get the request with join to doctor and patient information
    const result = await pool
      .request()
      .input("requestId", req.params.requestId)
      .input("userId", req.user.userId).query(`
        SELECT pr.requestId,
       pr.doctorId,
       pr.patientEmail,
       pr.patientPhone,
       pr.containerName,
       pr.folderName,
       pr.requestStatus,
       pr.requestDate,
       pr.approvedDate,
       pr.rejectionReason,
       pr.createdPatientId,
       pr.approvedBy,
       -- Use original patient name for pending, created user name for approved
       CASE 
         WHEN pr.requestStatus = 'pending' OR pu.name IS NULL 
         THEN pr.patientName 
         ELSE pu.name 
       END as patientName,
       u.name as doctorName,
       au.name as approvedByName,
       pu.username as patientUsername
        FROM PatientRequests pr
        INNER JOIN Users u ON pr.doctorId = u.userId
        LEFT JOIN Users au ON pr.approvedBy = au.userId
        LEFT JOIN Users pu ON pr.createdPatientId = pu.userId
        WHERE pr.requestId = @requestId
        ${req.user.role === "doctor" ? "AND pr.doctorId = @userId" : ""}
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    res.json({
      success: true,
      request: result.recordset[0],
    });
  } catch (err) {
    console.error("Get patient request error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   PUT api/patient-requests/:requestId/approve
// @desc    Approve a patient request and create patient account
// @access  Private/Admin
exports.approvePatientRequest = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only admins can approve patient requests",
    });
  }

  try {
    await pool.connect();

    // Start a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Get the request
      const requestResult = await new sql.Request(transaction)
        .input("requestId", req.params.requestId)
        .query(
          "SELECT * FROM PatientRequests WHERE requestId = @requestId AND requestStatus = 'pending'"
        );

      if (requestResult.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Pending request not found",
        });
      }

      const request = requestResult.recordset[0];

      // Generate a random password
      const password = Math.random().toString(36).slice(-8);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Username will be email address before @ symbol
      const username = request.patientEmail.split("@")[0] + "_patient";

      // Check if username already exists
      const usernameCheck = await new sql.Request(transaction)
        .input("username", username)
        .query("SELECT * FROM Users WHERE username = @username");

      let finalUsername = username;
      if (usernameCheck.recordset.length > 0) {
        // Add random number if username exists
        finalUsername = username + Math.floor(Math.random() * 1000);
      }

      // Create the patient user
      const userResult = await new sql.Request(transaction)
        .input("name", request.patientName)
        .input("username", finalUsername)
        .input("password", hashedPassword)
        .input("role", "patient")
        .input("userType", "patient")
        .input("requestId", request.requestId).query(`
          INSERT INTO Users (name, username, password, role, userType, createdByRequest)
          OUTPUT INSERTED.userId
          VALUES (@name, @username, @password, @role, @userType, @requestId)
        `);

      const patientUserId = userResult.recordset[0].userId;

      // Assign the container to the patient
      await new sql.Request(transaction)
        .input("userId", patientUserId)
        .input("containerName", request.containerName).query(`
          INSERT INTO ContainerAssignments (userId, containerName)
          VALUES (@userId, @containerName)
        `);

      // Assign the folder to the patient
      await new sql.Request(transaction)
        .input("userId", patientUserId)
        .input("containerName", request.containerName)
        .input("folderName", request.folderName).query(`
          INSERT INTO FolderAssignments (userId, containerName, folderName)
          VALUES (@userId, @containerName, @folderName)
        `);

      // Update the request status
      await new sql.Request(transaction)
        .input("requestId", req.params.requestId)
        .input("patientUserId", patientUserId)
        .input("adminId", req.user.userId).query(`
          UPDATE PatientRequests
          SET requestStatus = 'approved',
              createdPatientId = @patientUserId,
              approvedDate = GETDATE(),
              approvedBy = @adminId
          WHERE requestId = @requestId
        `);

      await transaction.commit();

      // Send email to patient with credentials
      const mailOptions = {
        from: `CompassPoint Health Support <${config.emailUser}>`,
        to: request.patientEmail,
        subject: "Your Patient Portal Account Has Been Created",
        html: `
          <h2>Welcome to the Patient Records Management System</h2>
          <p>Dear ${request.patientName},</p>
          <p>Your doctor has requested access for you to upload your medical files to our secure system.</p>
          <p>Your account has been created and you can now log in to the patient portal.</p>
          <p><b>Username:</b> ${finalUsername}</p>
          <p><b>Password:</b> ${password}</p>
          <p>Please log in at: <a href="${config.appUrl}">${config.appUrl}</a></p>
          <p>After logging in, you will be able to upload your medical files securely.</p>
          <p>If you have any questions, please contact your healthcare provider.</p>
          <p>Thank you,<br>Patient Records Management System</p>
        `,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Email sending error:", error);
        }
      });

      //   console.log("Patient credentials (for testing):");
      //   console.log("Username:", finalUsername);
      //   console.log("Password:", password);
      //   console.log("Email would be sent to:", request.patientEmail);

      res.json({
        success: true,
        message: "Patient request approved and account created",
        patientId: patientUserId,
        username: finalUsername,
        // Don't return the password in the response for security
      });
    } catch (err) {
      console.error("Transaction error:", err.message);
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("Approve patient request error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   PUT api/patient-requests/:requestId/reject
// @desc    Reject a patient request
// @access  Private/Admin
exports.rejectPatientRequest = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only admins can reject patient requests",
    });
  }

  try {
    await pool.connect();

    // Check if request exists and is pending
    const requestCheck = await pool
      .request()
      .input("requestId", req.params.requestId)
      .query(
        "SELECT * FROM PatientRequests WHERE requestId = @requestId AND requestStatus = 'pending'"
      );

    if (requestCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending request not found",
      });
    }

    // Update the request status
    await pool
      .request()
      .input("requestId", req.params.requestId)
      .input("adminId", req.user.userId)
      .input("rejectionReason", req.body.notes || null).query(`
        UPDATE PatientRequests
        SET requestStatus = 'rejected',
            approvedDate = GETDATE(),
            approvedBy = @adminId,
            rejectionReason = @rejectionReason
        WHERE requestId = @requestId
      `);

    res.json({
      success: true,
      message: "Patient request rejected",
    });
  } catch (err) {
    console.error("Reject patient request error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/patient-requests/available-folders/:containerName
// @desc    Get available folders for a container (excluding already requested/assigned)
// @access  Private/Doctor
exports.getAvailableFolders = async (req, res) => {
  // Only doctors can check folder availability
  if (req.user.role !== "doctor") {
    return res.status(403).json({
      success: false,
      message: "Only doctors can check folder availability",
    });
  }

  const { containerName } = req.params;

  try {
    await pool.connect();

    // Verify the doctor has access to this container
    const accessCheck = await pool
      .request()
      .input("userId", req.user.userId)
      .input("containerName", containerName).query(`
        SELECT ca.id FROM ContainerAssignments ca
        WHERE ca.userId = @userId AND ca.containerName = @containerName
      `);

    if (accessCheck.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this container",
      });
    }

    // Get all folders that are already taken (requested or assigned)
    const takenFoldersResult = await pool
      .request()
      .input("containerName", containerName).query(`
    -- Get folders from pending/approved patient requests (ONLY where patient still exists)
    SELECT DISTINCT
      folderName,
      'request' as sourceType,
      patientName,
      requestStatus as status,
      requestDate as date,
      doctorName = u.name
    FROM PatientRequests pr
    INNER JOIN Users u ON pr.doctorId = u.userId
    WHERE pr.containerName = @containerName 
    AND pr.requestStatus IN ('pending', 'approved')
    AND (
      pr.requestStatus = 'pending' 
      OR (pr.requestStatus = 'approved' 
          AND pr.createdPatientId IS NOT NULL 
          AND EXISTS (SELECT 1 FROM Users pu WHERE pu.userId = pr.createdPatientId AND pu.role = 'patient'))
    )
    
    UNION ALL
    
    -- Get folders from existing patient assignments (these should be valid)
    SELECT DISTINCT
      fa.folderName,
      'assignment' as sourceType,
      patientName = u.name,
      status = 'assigned',
      date = u.createdAt,
      doctorName = 'System'
    FROM FolderAssignments fa
    INNER JOIN Users u ON fa.userId = u.userId
    WHERE fa.containerName = @containerName
    AND u.role = 'patient'
    
    ORDER BY folderName
  `);

    const takenFolders = takenFoldersResult.recordset;

    // Get summary statistics
    const stats = {
      totalTaken: takenFolders.length,
      byStatus: {
        pending: takenFolders.filter((f) => f.status === "pending").length,
        approved: takenFolders.filter((f) => f.status === "approved").length,
        assigned: takenFolders.filter((f) => f.status === "assigned").length,
      },
    };

    res.json({
      success: true,
      containerName,
      takenFolders,
      stats,
      message: `Found ${takenFolders.length} folders that are already requested or assigned`,
    });
  } catch (err) {
    console.error("Get available folders error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
