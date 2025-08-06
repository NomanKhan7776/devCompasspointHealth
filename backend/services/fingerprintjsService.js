// services/fingerprintjsService.js
const {
  FingerprintJsServerApiClient,
  Region,
} = require("@fingerprintjs/fingerprintjs-pro-server-api");

class FingerprintJSService {
  constructor() {
    if (!process.env.FINGERPRINTJS_SECRET_KEY) {
      console.warn("⚠️ FingerprintJS Pro secret key not configured");
      this.client = null;
      return;
    }

    try {
      this.client = new FingerprintJsServerApiClient({
        apiKey: process.env.FINGERPRINTJS_SECRET_KEY,
        region:
          process.env.FINGERPRINTJS_REGION === "eu" ? Region.EU : Region.US,
      });
      console.log("✅ FingerprintJS Pro Server API client initialized");
    } catch (error) {
      console.error("❌ Failed to initialize FingerprintJS Pro client:", error);
      this.client = null;
    }
  }

  isAvailable() {
    return this.client !== null;
  }

  async getVisitorHistory(visitorId, limit = 10) {
    if (!this.client) {
      throw new Error("FingerprintJS Pro client not available");
    }

    try {
      console.log(`🔍 Fetching visitor history for: ${visitorId}`);
      const response = await this.client.getVisitorHistory(visitorId, {
        limit: limit,
        before: Date.now(),
      });

      console.log(
        `✅ Retrieved ${response.visits.length} visits for visitor ${visitorId}`
      );
      return response;
    } catch (error) {
      console.error("❌ Error fetching visitor history:", error.message);
      throw error;
    }
  }

  async validateFingerprint(visitorId, requestId) {
    if (!this.client) {
      console.warn(
        "⚠️ FingerprintJS Pro client not available, skipping validation"
      );
      return {
        isValid: true, // Allow through if service unavailable
        confidence: 0.5,
        validated: false,
        reason: "service_unavailable",
      };
    }

    try {
      console.log(
        `🔐 Validating fingerprint - Visitor: ${visitorId}, Request: ${requestId}`
      );

      const event = await this.client.getEvent(requestId);

      // ✅ FIX: Safely access confidence score with fallbacks
      let confidenceScore = 0.5; // Default fallback

      if (event.confidence && typeof event.confidence.score === "number") {
        confidenceScore = event.confidence.score;
      } else if (typeof event.confidence === "number") {
        // Sometimes confidence is directly a number
        confidenceScore = event.confidence;
      } else if (
        event.confidenceScore &&
        typeof event.confidenceScore === "number"
      ) {
        // Alternative field name
        confidenceScore = event.confidenceScore;
      } else {
        console.warn("⚠️ No valid confidence score found in event:", {
          confidenceType: typeof event.confidence,
          confidenceValue: event.confidence,
          availableFields: Object.keys(event),
        });
      }

      const validation = {
        isValid: event.visitorId === visitorId,
        confidence: confidenceScore,
        timestamp: event.timestamp,
        ipAddress: event.ip,
        browserDetails: event.browserDetails,
        validated: true,
        event: {
          visitorId: event.visitorId,
          requestId: event.requestId,
          url: event.url,
          userAgent: event.userAgent,
          timestamp: event.timestamp,
          originalConfidence: event.confidence, // Keep original for debugging
        },
      };

      if (validation.isValid) {
        console.log(
          `✅ Fingerprint validation successful - Confidence: ${validation.confidence}`
        );
      } else {
        console.warn(
          `⚠️ Fingerprint validation failed - Expected: ${visitorId}, Got: ${event.visitorId}`
        );
      }

      return validation;
    } catch (error) {
      console.error("❌ Error validating fingerprint:", error.message);

      // ✅ Enhanced error handling for different scenarios
      if (error.status === 404) {
        console.warn("⚠️ Event not found - might be too recent or expired");
        return {
          isValid: false,
          error: "Request not found or expired",
          validated: false,
          reason: "request_not_found",
          confidence: 0,
        };
      } else if (error.status === 403) {
        console.warn("⚠️ Access forbidden - check API key permissions");
        return {
          isValid: true, // Allow through to avoid blocking legitimate users
          error: "API access forbidden",
          validated: false,
          reason: "api_forbidden",
          confidence: 0.5,
        };
      } else if (error.status === 429) {
        console.warn("⚠️ Rate limit exceeded - too many requests");
        return {
          isValid: true, // Allow through to avoid blocking legitimate users
          error: "Rate limit exceeded",
          validated: false,
          reason: "rate_limited",
          confidence: 0.5,
        };
      }

      // For other errors, allow through but log the issue
      console.warn(
        "⚠️ Validation error - allowing request through:",
        error.message
      );
      return {
        isValid: true,
        error: error.message,
        validated: false,
        reason: "validation_error",
        confidence: 0.5,
      };
    }
  }

  // Enhanced validation with retry logic for new events
  async validateFingerprintWithRetry(visitorId, requestId, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔄 Validation attempt ${attempt}/${maxRetries} for request: ${requestId}`
        );

        const result = await this.validateFingerprint(visitorId, requestId);

        // If validation succeeded or failed with a definitive result, return it
        if (result.validated || result.reason !== "request_not_found") {
          return result;
        }

        // If it's a 404 (request not found) and we have retries left, wait and try again
        if (result.reason === "request_not_found" && attempt < maxRetries) {
          console.log(
            `⏳ Request not found, waiting ${attempt * 2}s before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000)); // 2s, 4s delay
          continue;
        }

        return result;
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Validation attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000)); // 1s, 2s delay
        }
      }
    }

    // All retries failed
    console.error("❌ All validation attempts failed:", lastError?.message);
    return {
      isValid: true, // Allow through to avoid blocking users
      error: `Validation failed after ${maxRetries} attempts: ${lastError?.message}`,
      validated: false,
      reason: "validation_exhausted",
      confidence: 0.5,
    };
  }

  async checkForSuspiciousActivity(visitorId, timeWindowHours = 24) {
    if (!this.client) {
      return { suspicious: false, reason: "service_unavailable" };
    }

    try {
      const history = await this.getVisitorHistory(visitorId, 50);
      const now = Date.now();
      const timeWindow = timeWindowHours * 60 * 60 * 1000;

      const recentVisits = history.visits.filter(
        (visit) => now - visit.timestamp < timeWindow
      );

      // Check for suspicious patterns
      const uniqueIPs = new Set(recentVisits.map((v) => v.ip));
      const uniqueCountries = new Set(
        recentVisits.map((v) => v.ipLocation?.country)
      );
      const lowConfidenceVisits = recentVisits.filter(
        (v) => v.confidence.score < 0.7
      );

      const analysis = {
        suspicious: false,
        totalVisits: recentVisits.length,
        uniqueIPs: uniqueIPs.size,
        uniqueCountries: uniqueCountries.size,
        lowConfidenceCount: lowConfidenceVisits.length,
        averageConfidence:
          recentVisits.reduce((sum, v) => sum + v.confidence.score, 0) /
          recentVisits.length,
        flags: [],
      };

      // Flag suspicious patterns
      if (uniqueIPs.size > 5 && recentVisits.length > 10) {
        analysis.flags.push("multiple_ips");
        analysis.suspicious = true;
      }

      if (uniqueCountries.size > 2) {
        analysis.flags.push("multiple_countries");
        analysis.suspicious = true;
      }

      if (lowConfidenceVisits.length > recentVisits.length * 0.3) {
        analysis.flags.push("low_confidence_pattern");
        analysis.suspicious = true;
      }

      if (recentVisits.length > 30) {
        analysis.flags.push("high_frequency");
        analysis.suspicious = true;
      }

      console.log(`🔍 Suspicious activity check for ${visitorId}:`, {
        suspicious: analysis.suspicious,
        flags: analysis.flags,
        visits: analysis.totalVisits,
      });

      return analysis;
    } catch (error) {
      console.error("❌ Error checking suspicious activity:", error);
      return { suspicious: false, error: error.message };
    }
  }

  // Extract device info from FingerprintJS Pro data
  extractDeviceInfo(fingerprintData) {
    const details = fingerprintData.details || {};
    const metadata = fingerprintData.metadata || {};

    return {
      // FingerprintJS Pro specific data
      visitorId: details.visitorId || fingerprintData.hash,
      requestId: details.requestId,
      confidence: details.confidence || metadata.confidenceScore || 0,

      // Browser/Device data
      userAgent: details.userAgent || "",
      platform: details.platform || "",
      screen: details.screen || {},
      isAndroid: details.isAndroid || false,
      isMobile: details.isMobile || false,

      // Extracted metadata
      deviceName:
        metadata.deviceName || this.inferDeviceName(details.userAgent),
      browserName:
        metadata.browserName || this.inferBrowserName(details.userAgent),
      osName: metadata.osName || this.inferOSName(details.userAgent),
      deviceType:
        metadata.deviceType || (details.isMobile ? "mobile" : "desktop"),

      // Service tracking
      method: metadata.method || "fingerprintjs_pro",
      service: metadata.service || "fingerprintjs_pro",

      // Additional FingerprintJS Pro data
      fpjsComponents: details.fpjsComponents,
      fpjsRawResult: details.fpjsRawResult,
    };
  }

  inferDeviceName(userAgent = "") {
    if (/iPhone/i.test(userAgent)) return "iPhone";
    if (/iPad/i.test(userAgent)) return "iPad";
    if (/Android/i.test(userAgent)) {
      const match = userAgent.match(/Android.*?;\s*(.*?)\s*Build/);
      return match ? match[1] : "Android Device";
    }
    if (/Mac/i.test(userAgent)) return "Mac";
    if (/Windows/i.test(userAgent)) return "Windows PC";
    return "Unknown Device";
  }

  inferBrowserName(userAgent = "") {
    if (/Edg/i.test(userAgent)) return "Edge";
    if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return "Chrome";
    if (/Firefox/i.test(userAgent)) return "Firefox";
    if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent))
      return "Safari";
    if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
    return "Unknown Browser";
  }

  inferOSName(userAgent = "") {
    if (/iPhone|iPad/i.test(userAgent)) {
      const match = userAgent.match(/OS ([0-9_]+)/);
      return match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
    }
    if (/Android/i.test(userAgent)) {
      const match = userAgent.match(/Android\s([0-9\.]+)/);
      return match ? `Android ${match[1]}` : "Android";
    }
    if (/Mac OS X/i.test(userAgent)) return "macOS";
    if (/Windows/i.test(userAgent)) return "Windows";
    return "Unknown OS";
  }

  // Create a comprehensive device report
  async createDeviceReport(fingerprintData, requestInfo = {}) {
    const deviceInfo = this.extractDeviceInfo(fingerprintData);

    let validation = null;
    let suspiciousActivity = null;

    if (deviceInfo.visitorId && deviceInfo.requestId) {
      try {
        validation = await this.validateFingerprint(
          deviceInfo.visitorId,
          deviceInfo.requestId
        );
        suspiciousActivity = await this.checkForSuspiciousActivity(
          deviceInfo.visitorId
        );
      } catch (error) {
        console.warn("⚠️ Could not complete device analysis:", error.message);
      }
    }

    return {
      fingerprint: {
        visitorId: deviceInfo.visitorId,
        confidence: deviceInfo.confidence,
        method: deviceInfo.method,
        timestamp: new Date().toISOString(),
      },
      device: {
        name: deviceInfo.deviceName,
        type: deviceInfo.deviceType,
        browser: deviceInfo.browserName,
        os: deviceInfo.osName,
        platform: deviceInfo.platform,
        isMobile: deviceInfo.isMobile,
        isAndroid: deviceInfo.isAndroid,
      },
      validation: validation,
      security: {
        suspicious: suspiciousActivity?.suspicious || false,
        flags: suspiciousActivity?.flags || [],
        confidence: deviceInfo.confidence,
      },
      request: {
        ip: requestInfo.ip,
        userAgent: requestInfo.userAgent,
        timestamp: requestInfo.timestamp || new Date().toISOString(),
      },
    };
  }

  // Health check for the service
  async healthCheck() {
    if (!this.client) {
      return {
        status: "unavailable",
        message: "FingerprintJS Pro client not configured",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Try to make a simple API call to check connectivity
      const testVisitorId = "health_check_test";
      await this.client.getVisitorHistory(testVisitorId, { limit: 1 });

      return {
        status: "healthy",
        service: "fingerprintjs_pro_server_api",
        region: process.env.FINGERPRINTJS_REGION || "us",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // If it's a 404, that's actually fine - it means the API is responding
      if (error.status === 404) {
        return {
          status: "healthy",
          service: "fingerprintjs_pro_server_api",
          region: process.env.FINGERPRINTJS_REGION || "us",
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = new FingerprintJSService();
