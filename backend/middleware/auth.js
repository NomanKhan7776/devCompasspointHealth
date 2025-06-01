// middleware/auth.js - FIXED to handle 24-hour sessions properly
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

// In-memory session tracking (use Redis in production)
const activeSessions = new Map();

// Track logout/invalidated sessions to prevent reuse
const invalidatedSessions = new Set();

// FIXED: Clean up expired sessions every 30 minutes (instead of 2 minutes)
// This prevents premature session cleanup
setInterval(() => {
  const now = Date.now();

  // Clean up expired active sessions
  for (const [sessionId, sessionData] of activeSessions.entries()) {
    if (now > sessionData.expiresAt) {
      activeSessions.delete(sessionId);
      invalidatedSessions.add(sessionId);
    }
  }

  // Clear invalidated sessions to prevent memory leaks
  if (invalidatedSessions.size > 10000) {
    invalidatedSessions.clear();
  }
}, 30 * 60 * 1000); // FIXED: Changed from 2 minutes to 30 minutes

module.exports = async (req, res, next) => {
  try {
    // FIXED: Get token from header, query parameter, OR body (for file access)
    const token =
      req.header("x-auth-token") ||
      req.query.auth ||
      req.query.token ||
      req.body.auth_token;

    // Check if no token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token, authorization denied",
        debug:
          process.env.NODE_ENV === "development"
            ? {
                url: req.originalUrl,
                headers: Object.keys(req.headers),
                query: Object.keys(req.query),
              }
            : undefined,
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user from payload
    req.user = decoded.user;

    // ENHANCED: Handle file access with query parameter tokens
    if (req.query.auth && req.query.t) {
      // This is a file access request with temporary authentication
      const timestamp = parseInt(req.query.t);
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // Keep file access at 5 minutes

      // Check if the request is too old
      if (now - timestamp > maxAge) {
        return res.status(401).json({
          success: false,
          message: "File access link expired",
          code: "LINK_EXPIRED",
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  age: Math.floor((now - timestamp) / 1000),
                  maxAge: Math.floor(maxAge / 1000),
                }
              : undefined,
        });
      }

      // For file access, we'll validate the user exists but skip session tracking
      await pool.connect();
      const result = await pool
        .request()
        .input("userId", req.user.id || req.user.userId)
        .query("SELECT * FROM Users WHERE userId = @userId");

      if (result.recordset.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User no longer exists",
          code: "USER_NOT_FOUND",
        });
      }

      // Add full user object to request
      req.user = result.recordset[0];
      req.isFileAccess = true; // Flag to indicate this is file access

      next();
      return;
    }

    // REGULAR SESSION HANDLING (for non-file requests)
    // Generate session ID from token and user ID
    const sessionId = require("crypto")
      .createHash("sha256")
      .update(token + (req.user.id || req.user.userId))
      .digest("hex");

    // Check if session has been invalidated
    if (invalidatedSessions.has(sessionId)) {
      return res.status(401).json({
        success: false,
        message: "Session has been invalidated",
        code: "SESSION_INVALIDATED",
      });
    }

    // Check if session is active
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) {
      // Create new session - FIXED: Extended to 24 hours
      const newSession = {
        userId: req.user.id || req.user.userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // FIXED: 24 hours (was 24 hours before but may have been overridden)
        lastActivity: Date.now(),
        userAgent: req.get("User-Agent") || "unknown",
        ipAddress: req.ip || "unknown",
      };

      activeSessions.set(sessionId, newSession);
    } else {
      // FIXED: Update last activity and extend session if needed
      sessionData.lastActivity = Date.now();

      // FIXED: Extend session expiry on each request (sliding window)
      // This keeps the session alive as long as user is active
      sessionData.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // Reset to 24 hours from now
    }

    // Check if user still exists in database
    await pool.connect();
    const result = await pool
      .request()
      .input("userId", req.user.id || req.user.userId)
      .query("SELECT * FROM Users WHERE userId = @userId");

    if (result.recordset.length === 0) {
      // User doesn't exist, invalidate session
      activeSessions.delete(sessionId);
      invalidatedSessions.add(sessionId);

      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        code: "USER_NOT_FOUND",
      });
    }

    // Add full user object and session info to request
    req.user = result.recordset[0];
    req.sessionId = sessionId;

    // Add session invalidation methods to request
    req.invalidateSession = () => {
      activeSessions.delete(sessionId);
      invalidatedSessions.add(sessionId);
    };

    req.invalidateAllUserSessions = () => {
      const userId = req.user.userId;
      for (const [sId, sData] of activeSessions.entries()) {
        if (sData.userId === userId) {
          activeSessions.delete(sId);
          invalidatedSessions.add(sId);
        }
      }
    };

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);

    // Clean up any sessions on token errors
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      try {
        const tokenParts = (
          req.header("x-auth-token") ||
          req.query.auth ||
          req.query.token ||
          ""
        ).split(".");
        if (tokenParts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(tokenParts[1], "base64").toString()
          );
          if (payload.user) {
            const sessionId = require("crypto")
              .createHash("sha256")
              .update(
                (req.header("x-auth-token") || req.query.auth) +
                  (payload.user.id || payload.user.userId)
              )
              .digest("hex");

            activeSessions.delete(sessionId);
            invalidatedSessions.add(sessionId);
          }
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }

    res.status(401).json({
      success: false,
      message: "Token is not valid",
      code: err.name || "AUTH_ERROR",
      debug:
        process.env.NODE_ENV === "development"
          ? {
              error: err.message,
              url: req.originalUrl,
              tokenSource: req.header("x-auth-token")
                ? "header"
                : req.query.auth
                ? "query"
                : req.query.token
                ? "query_token"
                : "none",
            }
          : undefined,
    });
  }
};

// Export session management functions
module.exports.invalidateAllUserSessions = (userId) => {
  let invalidatedCount = 0;
  for (const [sessionId, sessionData] of activeSessions.entries()) {
    if (sessionData.userId === userId) {
      activeSessions.delete(sessionId);
      invalidatedSessions.add(sessionId);
      invalidatedCount++;
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`Invalidated ${invalidatedCount} sessions for user ${userId}`);
  }

  return invalidatedCount;
};

module.exports.invalidateSession = (sessionId) => {
  const wasActive = activeSessions.has(sessionId);
  activeSessions.delete(sessionId);
  invalidatedSessions.add(sessionId);
  return wasActive;
};

module.exports.getActiveSessionsCount = () => {
  return activeSessions.size;
};

module.exports.getInvalidatedSessionsCount = () => {
  return invalidatedSessions.size;
};

module.exports.getSessionInfo = () => {
  return {
    activeSessions: activeSessions.size,
    invalidatedSessions: invalidatedSessions.size,
    oldestSession:
      activeSessions.size > 0
        ? Math.min(
            ...Array.from(activeSessions.values()).map((s) => s.createdAt)
          )
        : null,
    newestSession:
      activeSessions.size > 0
        ? Math.max(
            ...Array.from(activeSessions.values()).map((s) => s.createdAt)
          )
        : null,
  };
};

module.exports.forceSessionCleanup = () => {
  const before = {
    active: activeSessions.size,
    invalidated: invalidatedSessions.size,
  };

  const now = Date.now();
  for (const [sessionId, sessionData] of activeSessions.entries()) {
    if (now > sessionData.expiresAt) {
      activeSessions.delete(sessionId);
      invalidatedSessions.add(sessionId);
    }
  }

  if (invalidatedSessions.size > 5000) {
    invalidatedSessions.clear();
  }

  const after = {
    active: activeSessions.size,
    invalidated: invalidatedSessions.size,
  };

  return { before, after };
};
