// controllers/assignmentController.js - FIXED VERSION FOR ACTUAL DATABASE SCHEMA
const { blobServiceClient } = require("../config/azure-storage.js");
const { pool, sql } = require("../config/database");

// ✅ FIXED: Get current user's assignments with structured data
exports.getMyAssignments = async (req, res) => {
  try {
    console.log("🔍 getMyAssignments called");

    // Enhanced authentication check
    if (!req.user) {
      console.error("❌ No req.user found");
      return res.status(401).json({
        success: false,
        message: "Authentication required - no user object",
      });
    }

    // Check if userId exists
    if (!req.user.userId) {
      console.error("❌ No userId in req.user:", req.user);
      return res.status(401).json({
        success: false,
        message: "Authentication required - no userId",
      });
    }

    console.log("✅ User authenticated:", {
      userId: req.user.userId,
      name: req.user.name,
      role: req.user.role,
    });

    // Test database connection
    try {
      await pool.connect();
      console.log("✅ Database connected successfully");
    } catch (dbError) {
      console.error("❌ Database connection failed:", dbError.message);
      return res.status(500).json({
        success: false,
        message: "Database connection failed",
        error:
          process.env.NODE_ENV === "development" ? dbError.message : undefined,
      });
    }

    // Test basic user query
    let userExists;
    try {
      const userCheck = await pool
        .request()
        .input("userId", req.user.userId)
        .query("SELECT userId, name, role FROM Users WHERE userId = @userId");

      userExists = userCheck.recordset.length > 0;
      console.log("✅ User exists check:", userExists);

      if (!userExists) {
        console.error("❌ User not found in database:", req.user.userId);
        return res.status(401).json({
          success: false,
          message: "User not found in database",
        });
      }
    } catch (userError) {
      console.error("❌ User check query failed:", userError.message);
      return res.status(500).json({
        success: false,
        message: "User validation failed",
        error:
          process.env.NODE_ENV === "development"
            ? userError.message
            : undefined,
      });
    }

    // FIXED: Get container assignments using only existing columns
    let containerResult;
    try {
      console.log("🔍 Fetching container assignments...");
      containerResult = await pool.request().input("userId", req.user.userId)
        .query(`
          SELECT 
            ca.id,
            ca.containerName,
            ca.createdAt,
            COUNT(fa.id) as folderCount
          FROM ContainerAssignments ca
          LEFT JOIN FolderAssignments fa ON ca.userId = fa.userId 
                                         AND ca.containerName = fa.containerName
          WHERE ca.userId = @userId
          GROUP BY ca.id, ca.containerName, ca.createdAt
          ORDER BY ca.createdAt DESC
        `);

      console.log(
        "✅ Container query successful, found:",
        containerResult.recordset.length,
        "containers"
      );
    } catch (containerError) {
      console.error("❌ Container query failed:", containerError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch container assignments",
        error:
          process.env.NODE_ENV === "development"
            ? containerError.message
            : undefined,
      });
    }

    // FIXED: For each container, get assigned folders using only existing columns
    let containersWithFolders;
    try {
      console.log("🔍 Fetching folder assignments for containers...");

      containersWithFolders = await Promise.all(
        containerResult.recordset.map(async (container, index) => {
          try {
            console.log(
              `  📁 Processing container ${index + 1}/${
                containerResult.recordset.length
              }: ${container.containerName}`
            );

            const folderResult = await pool
              .request()
              .input("userId", req.user.userId)
              .input("containerName", container.containerName).query(`
                SELECT 
                  fa.id,
                  fa.folderName,
                  fa.createdAt
                FROM FolderAssignments fa
                WHERE fa.userId = @userId AND fa.containerName = @containerName
                ORDER BY fa.folderName
              `);

            console.log(
              `    ✅ Found ${folderResult.recordset.length} folders for ${container.containerName}`
            );

            return {
              ...container,
              // Add missing fields for API compatibility
              assignedBy: "System", // Default value since column doesn't exist
              assignedAt: container.createdAt, // Use createdAt as assignedAt
              folders: folderResult.recordset.map((folder) => ({
                ...folder,
                assignedBy: "System", // Default value since column doesn't exist
                assignedAt: folder.createdAt, // Use createdAt as assignedAt
              })),
            };
          } catch (folderError) {
            console.error(
              `❌ Failed to get folders for container ${container.containerName}:`,
              folderError.message
            );
            // Return container with empty folders array instead of failing completely
            return {
              ...container,
              assignedBy: "System",
              assignedAt: container.createdAt,
              folders: [],
              folderError: folderError.message,
            };
          }
        })
      );

      console.log("✅ All folder assignments processed successfully");
    } catch (foldersError) {
      console.error("❌ Processing folders failed:", foldersError.message);
      return res.status(500).json({
        success: false,
        message: "Failed to process folder assignments",
        error:
          process.env.NODE_ENV === "development"
            ? foldersError.message
            : undefined,
      });
    }

    // Calculate assignment statistics
    const totalFolders = containersWithFolders.reduce(
      (total, container) =>
        total + (container.folders ? container.folders.length : 0),
      0
    );

    const stats = {
      totalContainers: containersWithFolders.length,
      totalFolders: totalFolders,
      latestAssignment:
        containersWithFolders.length > 0
          ? containersWithFolders[0].createdAt
          : null,
    };

    console.log("✅ Assignment stats calculated:", stats);

    const response = {
      success: true,
      user: {
        id: req.user.userId,
        name: req.user.name,
        role: req.user.role,
        username: req.user.username,
      },
      assignments: containersWithFolders,
      stats: stats,
      timestamp: new Date().toISOString(),
    };

    console.log(
      "✅ Sending successful response with",
      containersWithFolders.length,
      "assignments"
    );
    res.json(response);
  } catch (err) {
    console.error("❌ CRITICAL ERROR in getMyAssignments:", {
      message: err.message,
      stack: err.stack,
      userId: req.user?.userId,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      message: "Server error while fetching assignments",
      error:
        process.env.NODE_ENV === "development"
          ? {
              message: err.message,
              stack: err.stack,
            }
          : undefined,
    });
  }
};

// ✅ FIXED: Get user assignments (for admin use and SmartToken filtering)
exports.getUserAssignments = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID required",
      });
    }

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

    const user = userCheck.recordset[0];

    // FIXED: Get container assignments using only existing columns
    const containerAssignments = await pool.request().input("userId", userId)
      .query(`
        SELECT 
          ca.id,
          ca.containerName,
          ca.createdAt,
          COUNT(fa.id) as folderCount
        FROM ContainerAssignments ca
        LEFT JOIN FolderAssignments fa ON ca.userId = fa.userId 
                                       AND ca.containerName = fa.containerName
        WHERE ca.userId = @userId
        GROUP BY ca.id, ca.containerName, ca.createdAt
        ORDER BY ca.createdAt DESC
      `);

    // FIXED: Get folder assignments using only existing columns
    const folderAssignments = await pool.request().input("userId", userId)
      .query(`
        SELECT 
          fa.id,
          fa.containerName,
          fa.folderName,
          fa.createdAt
        FROM FolderAssignments fa
        WHERE fa.userId = @userId
        ORDER BY fa.containerName, fa.folderName
      `);

    // FIXED: Get structured assignments using only existing columns
    const structuredAssignments = await pool.request().input("userId", userId)
      .query(`
        SELECT 
          ca.containerName,
          ca.createdAt as containerCreatedAt,
          fa.folderName,
          fa.createdAt as folderCreatedAt
        FROM ContainerAssignments ca
        INNER JOIN FolderAssignments fa ON ca.userId = fa.userId 
                                        AND ca.containerName = fa.containerName
        WHERE ca.userId = @userId
        ORDER BY ca.containerName, fa.folderName
      `);

    // Group assignments by container for easier consumption
    const assignmentsByContainer = {};
    structuredAssignments.recordset.forEach((assignment) => {
      if (!assignmentsByContainer[assignment.containerName]) {
        assignmentsByContainer[assignment.containerName] = {
          containerName: assignment.containerName,
          containerAssignedAt: assignment.containerCreatedAt, // Use createdAt as assignedAt
          containerCreatedAt: assignment.containerCreatedAt,
          folders: [],
        };
      }

      assignmentsByContainer[assignment.containerName].folders.push({
        folderName: assignment.folderName,
        assignedAt: assignment.folderCreatedAt, // Use createdAt as assignedAt
        createdAt: assignment.folderCreatedAt,
      });
    });

    const assignmentsArray = Object.values(assignmentsByContainer);

    // Get assignment statistics
    const stats = {
      totalContainers: containerAssignments.recordset.length,
      totalFolders: folderAssignments.recordset.length,
      assignmentsByContainer: assignmentsArray.length,
      latestAssignment:
        folderAssignments.recordset.length > 0
          ? folderAssignments.recordset[folderAssignments.recordset.length - 1]
              .createdAt
          : null,
    };

    // Add missing fields for API compatibility
    const enhancedContainerAssignments = containerAssignments.recordset.map(
      (container) => ({
        ...container,
        assignedBy: "System",
        assignedAt: container.createdAt,
      })
    );

    const enhancedFolderAssignments = folderAssignments.recordset.map(
      (folder) => ({
        ...folder,
        assignedBy: "System",
        assignedAt: folder.createdAt,
      })
    );

    res.json({
      success: true,
      user: {
        id: user.userId,
        name: user.name,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
      // Legacy format for backward compatibility
      containerAssignments: enhancedContainerAssignments,
      folderAssignments: enhancedFolderAssignments,

      // Enhanced format for SmartToken UI
      structuredAssignments: assignmentsArray,
      stats: stats,

      // Quick access arrays for filtering
      containerNames: [
        ...new Set(folderAssignments.recordset.map((f) => f.containerName)),
      ],
      folderNames: folderAssignments.recordset.map((f) => ({
        containerName: f.containerName,
        folderName: f.folderName,
      })),

      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("getUserAssignments error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user assignments",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ✅ FIXED: Check if user has access to specific container/folder
exports.checkUserAccess = async (req, res) => {
  try {
    const { userId, containerName, folderName } = req.params;

    if (!userId || !containerName || !folderName) {
      return res.status(400).json({
        success: false,
        message: "User ID, container name, and folder name are required",
      });
    }

    await pool.connect();

    // FIXED: Use only existing columns
    const accessCheck = await pool
      .request()
      .input("userId", parseInt(userId))
      .input("containerName", containerName)
      .input("folderName", folderName).query(`
        SELECT 
          ca.containerName,
          fa.folderName,
          ca.createdAt as containerCreatedAt,
          fa.createdAt as folderCreatedAt
        FROM ContainerAssignments ca
        INNER JOIN FolderAssignments fa ON ca.userId = fa.userId 
                                        AND ca.containerName = fa.containerName
        WHERE ca.userId = @userId 
        AND ca.containerName = @containerName 
        AND fa.folderName = @folderName
      `);

    const hasAccess = accessCheck.recordset.length > 0;

    // Add missing fields for API compatibility
    const accessDetails = hasAccess
      ? {
          ...accessCheck.recordset[0],
          containerAssignedAt: accessCheck.recordset[0].containerCreatedAt,
          folderAssignedAt: accessCheck.recordset[0].folderCreatedAt,
          containerAssignedBy: "System",
          folderAssignedBy: "System",
        }
      : null;

    res.json({
      success: true,
      hasAccess: hasAccess,
      accessDetails: accessDetails,
      message: hasAccess
        ? "User has access to this container/folder"
        : "User does not have access to this container/folder",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("checkUserAccess error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while checking access",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ✅ ENHANCED: Get all containers with better error handling
exports.getAllContainers = async (req, res) => {
  try {
    // List all containers from Azure Storage
    const containers = [];

    try {
      const containerIterator = blobServiceClient.listContainers();

      for await (const container of containerIterator) {
        if (container.name.startsWith("cph-container")) {
          containers.push(container.name);
        }
      }
    } catch (azureError) {
      console.error("Azure Storage error:", azureError);
      return res.status(503).json({
        success: false,
        message: "Azure Storage service unavailable",
        error:
          process.env.NODE_ENV === "development"
            ? azureError.message
            : undefined,
      });
    }

    // Sort containers naturally (cph-container1, cph-container2, etc.)
    containers.sort((a, b) => {
      const aMatch = a.match(/^(.+?)(\d+)$/);
      const bMatch = b.match(/^(.+?)(\d+)$/);

      if (aMatch && bMatch) {
        const [, aPrefixA, aNumberA] = aMatch;
        const [, aPrefixB, aNumberB] = bMatch;

        if (aPrefixA === aPrefixB) {
          return parseInt(aNumberA, 10) - parseInt(aNumberB, 10);
        }
      }

      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    res.json({
      success: true,
      containers,
      count: containers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("getAllContainers error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching containers",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ✅ ENHANCED: Get all folders in a container with better error handling
exports.getContainerFolders = async (req, res) => {
  try {
    const containerName = req.params.containerName;

    if (!containerName) {
      return res.status(400).json({
        success: false,
        message: "Container name is required",
      });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Check if container exists
    let exists;
    try {
      exists = await containerClient.exists();
    } catch (azureError) {
      console.error("Azure Storage error:", azureError);
      return res.status(503).json({
        success: false,
        message: "Azure Storage service unavailable",
        error:
          process.env.NODE_ENV === "development"
            ? azureError.message
            : undefined,
      });
    }

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Container not found",
      });
    }

    // List all blobs with delimiter to get "folders"
    const folders = new Set();

    try {
      const blobIterator = containerClient.listBlobsByHierarchy("/");

      for await (const blob of blobIterator) {
        if (blob.kind === "prefix" && blob.name.startsWith("Patient_Data")) {
          // Remove trailing slash from folder name
          const folderName = blob.name.slice(0, -1);
          folders.add(folderName);
        }
      }
    } catch (azureError) {
      console.error("Azure Storage error listing blobs:", azureError);
      return res.status(503).json({
        success: false,
        message: "Error accessing container contents",
        error:
          process.env.NODE_ENV === "development"
            ? azureError.message
            : undefined,
      });
    }

    const folderArray = Array.from(folders);

    // Sort folders naturally (Patient_Data1, Patient_Data2, etc.)
    folderArray.sort((a, b) => {
      const aMatch = a.match(/^(.+?)(\d+)$/);
      const bMatch = b.match(/^(.+?)(\d+)$/);

      if (aMatch && bMatch) {
        const [, aPrefixA, aNumberA] = aMatch;
        const [, aPrefixB, aNumberB] = bMatch;

        if (aPrefixA === aPrefixB) {
          return parseInt(aNumberA, 10) - parseInt(aNumberB, 10);
        }
      }

      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    res.json({
      success: true,
      containerName,
      folders: folderArray,
      count: folderArray.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("getContainerFolders error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching folders",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ✅ FIXED: Assign container to user with only existing columns
exports.assignContainerToUser = async (req, res) => {
  try {
    const { containerName } = req.params;
    const userId = parseInt(req.params.userId);

    if (!containerName || !userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid container name and user ID are required",
      });
    }

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
    let exists;

    try {
      exists = await containerClient.exists();
    } catch (azureError) {
      console.error("Azure Storage error:", azureError);
      return res.status(503).json({
        success: false,
        message: "Azure Storage service unavailable",
      });
    }

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Container not found in Azure Storage",
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
      return res.status(409).json({
        success: false,
        message: "Container already assigned to user",
        existingAssignment: {
          ...assignmentCheck.recordset[0],
          assignedBy: "System",
          assignedAt: assignmentCheck.recordset[0].createdAt,
        },
      });
    }

    // FIXED: Create assignment using only existing columns
    const result = await pool
      .request()
      .input("userId", userId)
      .input("containerName", containerName)
      .input("createdAt", new Date()).query(`
        INSERT INTO ContainerAssignments (userId, containerName, createdAt)
        OUTPUT INSERTED.id, INSERTED.userId, INSERTED.containerName, INSERTED.createdAt
        VALUES (@userId, @containerName, @createdAt)
      `);

    // Add missing fields for API compatibility
    const assignment = {
      ...result.recordset[0],
      assignedBy: req.user?.name || "System",
      assignedAt: result.recordset[0].createdAt,
    };

    res.status(201).json({
      success: true,
      message: "Container assigned successfully",
      assignment: assignment,
      user: {
        id: userCheck.recordset[0].userId,
        name: userCheck.recordset[0].name,
        username: userCheck.recordset[0].username,
      },
    });
  } catch (err) {
    console.error("assignContainerToUser error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while assigning container",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ✅ FIXED: Assign folders to user using only existing columns
exports.assignFoldersToUser = async (req, res) => {
  const { containerName } = req.params;
  const { userId, folderNames } = req.body;

  // Enhanced validation
  if (!containerName) {
    return res.status(400).json({
      success: false,
      message: "Container name is required",
    });
  }

  if (!userId || isNaN(parseInt(userId))) {
    return res.status(400).json({
      success: false,
      message: "Valid user ID is required",
    });
  }

  if (!folderNames || !Array.isArray(folderNames) || folderNames.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Folder names array is required and cannot be empty",
    });
  }

  try {
    await pool.connect();

    // Start a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const userIdInt = parseInt(userId);

      // Check if user exists
      const userCheck = await new sql.Request(transaction)
        .input("id", userIdInt)
        .query("SELECT * FROM Users WHERE userId = @id");

      if (userCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if container is assigned to user
      const containerCheck = await new sql.Request(transaction)
        .input("userId", userIdInt)
        .input("containerName", containerName)
        .query(
          "SELECT * FROM ContainerAssignments WHERE userId = @userId AND containerName = @containerName"
        );

      if (containerCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Container not assigned to user. Assign container first.",
        });
      }

      const assignments = [];
      const skipped = [];
      const errors = [];

      // Insert folder assignments
      for (const folderName of folderNames) {
        try {
          // Check if assignment already exists
          const assignmentCheck = await new sql.Request(transaction)
            .input("userId", userIdInt)
            .input("containerName", containerName)
            .input("folderName", folderName).query(`
              SELECT * FROM FolderAssignments 
              WHERE userId = @userId AND containerName = @containerName AND folderName = @folderName
            `);

          if (assignmentCheck.recordset.length > 0) {
            skipped.push({
              folderName,
              reason: "Already assigned",
              existingAssignment: {
                ...assignmentCheck.recordset[0],
                assignedBy: "System",
                assignedAt: assignmentCheck.recordset[0].createdAt,
              },
            });
            continue;
          }

          // FIXED: Insert assignment using only existing columns
          const result = await new sql.Request(transaction)
            .input("userId", userIdInt)
            .input("containerName", containerName)
            .input("folderName", folderName)
            .input("createdAt", new Date()).query(`
              INSERT INTO FolderAssignments (userId, containerName, folderName, createdAt)
              OUTPUT INSERTED.id, INSERTED.userId, INSERTED.containerName, INSERTED.folderName, INSERTED.createdAt
              VALUES (@userId, @containerName, @folderName, @createdAt)
            `);

          if (result.recordset.length > 0) {
            // Add missing fields for API compatibility
            assignments.push({
              ...result.recordset[0],
              assignedBy: req.user?.name || "System",
              assignedAt: result.recordset[0].createdAt,
            });
          }
        } catch (folderError) {
          console.error(`Error assigning folder ${folderName}:`, folderError);
          errors.push({
            folderName,
            error: folderError.message,
          });
        }
      }

      await transaction.commit();

      const response = {
        success: true,
        message: `${assignments.length} folders assigned successfully`,
        assignments,
        summary: {
          requested: folderNames.length,
          assigned: assignments.length,
          skipped: skipped.length,
          errors: errors.length,
        },
      };

      if (skipped.length > 0) {
        response.skipped = skipped;
      }

      if (errors.length > 0) {
        response.errors = errors;
        response.message += ` (${errors.length} errors occurred)`;
      }

      res.status(201).json(response);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("assignFoldersToUser error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while assigning folders",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// ✅ ENHANCED: Revoke assignment with better validation
exports.revokeAssignment = async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const { type } = req.query; // 'container' or 'folder'

    if (!assignmentId || isNaN(assignmentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid assignment ID is required",
      });
    }

    if (!type || !["container", "folder"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Assignment type required (container or folder)",
      });
    }

    await pool.connect();

    let result;
    let deletedInfo = {};

    if (type === "container") {
      // Delete container assignment and related folder assignments
      const containerAssignment = await pool
        .request()
        .input("id", assignmentId)
        .query("SELECT * FROM ContainerAssignments WHERE id = @id");

      if (containerAssignment.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Container assignment not found",
        });
      }

      const { userId, containerName } = containerAssignment.recordset[0];
      deletedInfo = { userId, containerName, type: "container" };

      // Get count of folder assignments that will be deleted
      const folderCount = await pool
        .request()
        .input("userId", userId)
        .input("containerName", containerName)
        .query(
          "SELECT COUNT(*) as count FROM FolderAssignments WHERE userId = @userId AND containerName = @containerName"
        );

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

      deletedInfo.folderCount = folderCount.recordset[0].count;
    } else {
      // Delete folder assignment
      const folderAssignment = await pool
        .request()
        .input("id", assignmentId)
        .query("SELECT * FROM FolderAssignments WHERE id = @id");

      if (folderAssignment.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Folder assignment not found",
        });
      }

      deletedInfo = {
        userId: folderAssignment.recordset[0].userId,
        containerName: folderAssignment.recordset[0].containerName,
        folderName: folderAssignment.recordset[0].folderName,
        type: "folder",
      };

      result = await pool
        .request()
        .input("id", assignmentId)
        .query("DELETE FROM FolderAssignments WHERE id = @id");
    }

    const message =
      type === "container"
        ? `Container assignment revoked (${deletedInfo.folderCount} related folder assignments also removed)`
        : "Folder assignment revoked";

    res.json({
      success: true,
      message,
      deletedInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("revokeAssignment error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error while revoking assignment",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
