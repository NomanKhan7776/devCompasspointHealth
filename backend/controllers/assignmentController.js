// controllers/assignmentController.js
const { blobServiceClient } = require("../config/azure-storage.js");
const { pool, sql } = require("../config/database");

// In controllers/assignmentController.js

// Get current user's assignments
exports.getMyAssignments = async (req, res) => {
  try {
    await pool.connect();

    // Get container assignments
    const containerResult = await pool
      .request()
      .input("userId", req.user.userId)
      .query(
        "SELECT id, containerName, createdAt FROM ContainerAssignments WHERE userId = @userId"
      );

    // For each container, get assigned folders
    const containersWithFolders = await Promise.all(
      containerResult.recordset.map(async (container) => {
        const folderResult = await pool
          .request()
          .input("userId", req.user.userId)
          .input("containerName", container.containerName)
          .query(
            "SELECT id, folderName, createdAt FROM FolderAssignments WHERE userId = @userId AND containerName = @containerName"
          );

        return {
          ...container,
          folders: folderResult.recordset,
        };
      })
    );

    res.json({
      success: true,
      user: {
        id: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      },
      assignments: containersWithFolders,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/assignments/containers
// @desc    Get all containers
// @access  Private/Admin
exports.getAllContainers = async (req, res) => {
  try {
    // List all containers from Azure Storage
    const containers = [];
    const containerIterator = blobServiceClient.listContainers();

    for await (const container of containerIterator) {
      if (container.name.startsWith("cph-container")) {
        containers.push(container.name);
      }
    }

    res.json({
      success: true,
      containers,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/assignments/containers/:containerName/folders
// @desc    Get all folders in a container
// @access  Private/Admin
exports.getContainerFolders = async (req, res) => {
  try {
    const containerName = req.params.containerName;
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Check if container exists
    const exists = await containerClient.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    // List all blobs with delimiter to get "folders"
    const folders = new Set();
    const blobIterator = containerClient.listBlobsByHierarchy("/");

    for await (const blob of blobIterator) {
      if (blob.kind === "prefix" && blob.name.startsWith("Patient_Data")) {
        // Remove trailing slash from folder name
        const folderName = blob.name.slice(0, -1);
        folders.add(folderName);
      }
    }

    res.json({
      success: true,
      folders: Array.from(folders),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   POST api/assignments/containers/:containerName/users/:userId
// @desc    Assign container to user
// @access  Private/Admin
exports.assignContainerToUser = async (req, res) => {
  try {
    const { containerName } = req.params;
    const userId = parseInt(req.params.userId);

    await pool.connect();

    // Check if user exists
    const userCheck = await pool
      .request()
      .input("id", userId)
      .query("SELECT * FROM Users WHERE userId = @id");

    if (userCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if container exists in Azure
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const exists = await containerClient.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    // Check if assignment already exists
    const assignmentCheck = await pool
      .request()
      .input("userId", userId)
      .input("containerName", containerName)
      .query(
        "SELECT * FROM ContainerAssignments WHERE userId = @userId AND containerName = @containerName"
      );

    if (assignmentCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Container already assigned to user",
      });
    }

    // Create assignment
    const result = await pool
      .request()
      .input("userId", userId)
      .input("containerName", containerName).query(`
        INSERT INTO ContainerAssignments (userId, containerName)
        OUTPUT INSERTED.id, INSERTED.userId, INSERTED.containerName
        VALUES (@userId, @containerName)
      `);

    res.status(201).json({
      success: true,
      assignment: result.recordset[0],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   POST api/assignments/containers/:containerName/folders
// @desc    Assign folders to user
// @access  Private/Admin
exports.assignFoldersToUser = async (req, res) => {
  const { containerName } = req.params;
  const { userId, folderNames } = req.body;

  if (
    !userId ||
    !folderNames ||
    !Array.isArray(folderNames) ||
    folderNames.length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "User ID and folder names array required",
    });
  }

  try {
    await pool.connect();

    // Start a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Check if user exists
      const userCheck = await pool
        .request()
        .input("id", userId)
        .query("SELECT * FROM Users WHERE userId = @id");

      if (userCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if container is assigned to user
      const containerCheck = await pool
        .request()
        .input("userId", userId)
        .input("containerName", containerName)
        .query(
          "SELECT * FROM ContainerAssignments WHERE userId = @userId AND containerName = @containerName"
        );

      if (containerCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Container not assigned to user",
        });
      }

      const assignments = [];

      // Insert folder assignments
      for (const folderName of folderNames) {
        // Check if assignment already exists
        const assignmentCheck = await new sql.Request(transaction)
          .input("userId", userId)
          .input("containerName", containerName)
          .input("folderName", folderName).query(`
            SELECT * FROM FolderAssignments 
            WHERE userId = @userId AND containerName = @containerName AND folderName = @folderName
          `);

        if (assignmentCheck.recordset.length > 0) {
          continue; // Skip if already assigned
        }

        // Insert assignment
        const result = await new sql.Request(transaction)
          .input("userId", userId)
          .input("containerName", containerName)
          .input("folderName", folderName).query(`
            INSERT INTO FolderAssignments (userId, containerName, folderName)
            OUTPUT INSERTED.id, INSERTED.userId, INSERTED.containerName, INSERTED.folderName
            VALUES (@userId, @containerName, @folderName)
          `);

        if (result.recordset.length > 0) {
          assignments.push(result.recordset[0]);
        }
      }

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: `${assignments.length} folders assigned to user`,
        assignments,
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/assignments/users/:userId
// @desc    Get user assignments
// @access  Private/Admin
exports.getUserAssignments = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    await pool.connect();

    // Check if user exists
    const userCheck = await pool
      .request()
      .input("id", userId)
      .query("SELECT * FROM Users WHERE userId = @id");

    if (userCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get container assignments
    const containerAssignments = await pool
      .request()
      .input("userId", userId)
      .query("SELECT * FROM ContainerAssignments WHERE userId = @userId");

    // Get folder assignments
    const folderAssignments = await pool
      .request()
      .input("userId", userId)
      .query("SELECT * FROM FolderAssignments WHERE userId = @userId");

    res.json({
      success: true,
      user: {
        id: userCheck.recordset[0].userId,
        name: userCheck.recordset[0].name,
        username: userCheck.recordset[0].username,
        role: userCheck.recordset[0].role,
      },
      containerAssignments: containerAssignments.recordset,
      folderAssignments: folderAssignments.recordset,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   DELETE api/assignments/:assignmentId
// @desc    Revoke assignment
// @access  Private/Admin
exports.revokeAssignment = async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const { type } = req.query; // 'container' or 'folder'

    if (!type || !["container", "folder"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Assignment type required (container or folder)",
      });
    }

    await pool.connect();

    let result;

    if (type === "container") {
      // Delete container assignment and related folder assignments
      const containerAssignment = await pool
        .request()
        .input("id", assignmentId)
        .query("SELECT * FROM ContainerAssignments WHERE id = @id");

      if (containerAssignment.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Assignment not found",
        });
      }

      const { userId, containerName } = containerAssignment.recordset[0];

      // Delete related folder assignments first
      await pool
        .request()
        .input("userId", userId)
        .input("containerName", containerName)
        .query(
          "DELETE FROM FolderAssignments WHERE userId = @userId AND containerName = @containerName"
        );

      // Delete container assignment
      result = await pool
        .request()
        .input("id", assignmentId)
        .query("DELETE FROM ContainerAssignments WHERE id = @id");
    } else {
      // Delete folder assignment
      const folderAssignment = await pool
        .request()
        .input("id", assignmentId)
        .query("SELECT * FROM FolderAssignments WHERE id = @id");

      if (folderAssignment.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Assignment not found",
        });
      }

      result = await pool
        .request()
        .input("id", assignmentId)
        .query("DELETE FROM FolderAssignments WHERE id = @id");
    }

    res.json({
      success: true,
      message: `${type} assignment revoked`,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
