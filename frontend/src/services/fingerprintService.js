// services/fingerprintService.js - Optimized Version with Reduced API Calls

import FingerprintJS from "@fingerprintjs/fingerprintjs-pro";

class FingerprintService {
  constructor() {
    this.initialized = false;
    this.fpInstance = null;
    this.publicKey = import.meta.env.VITE_FINGERPRINTJS_PUBLIC_KEY;
    this.region = import.meta.env.VITE_FINGERPRINTJS_REGION || "us";
    this.initPromise = null;

    // Only log critical errors
    if (!this.publicKey) {
      console.error(
        "❌ CRITICAL: VITE_FINGERPRINTJS_PUBLIC_KEY environment variable is not set!"
      );
    }
  }

  async initialize() {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return immediately if already initialized
    if (this.initialized && this.fpInstance) {
      return this.fpInstance;
    }

    this.initPromise = this._initializeInternal();
    return this.initPromise;
  }

  async _initializeInternal() {
    try {
      if (!this.publicKey) {
        throw new Error(
          "FingerprintJS Pro public key not found in environment variables. Please set VITE_FINGERPRINTJS_PUBLIC_KEY"
        );
      }

      const config = {
        apiKey: this.publicKey,
        region:
          this.region === "eu" ? "eu" : this.region === "ap" ? "ap" : "us",
        // Add additional config for better reliability
        endpoint:
          this.region === "eu"
            ? "https://eu.api.fpjs.io"
            : "https://api.fpjs.io",
      };

      // Use the imported package directly
      this.fpInstance = await FingerprintJS.load(config);

      this.initialized = true;

      return this.fpInstance;
    } catch (error) {
      console.error("❌ FingerprintJS Pro initialization failed:", error);
      this.initialized = false;
      this.fpInstance = null;
      this.initPromise = null;
      throw new Error(
        `FingerprintJS Pro initialization failed: ${error.message}`
      );
    }
  }

  async generateFingerprint(tags = {}) {
    try {
      if (!this.initialized || !this.fpInstance) {
        await this.initialize();
      }

      const result = await this.fpInstance.get();

      const fingerprint = {
        // Use visitorId as hash for compatibility
        hash: result.visitorId,
        visitorId: result.visitorId,
        requestId: result.requestId,
        confidence: result.confidence.score,
        details: {
          visitorId: result.visitorId,
          requestId: result.requestId,
          confidence: result.confidence.score,
          components: result.components,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          screen: {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth,
          },
          collectMethod: "fingerprintjs_pro",
          isAndroid: /Android/i.test(navigator.userAgent),
          isMobile:
            /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
              navigator.userAgent
            ),
        },
        metadata: {
          deviceName: this.getDeviceName(),
          browserName: this.getBrowserName(),
          osName: this.getOSName(),
          deviceType: this.getDeviceType(),
          method: "fingerprintjs_pro",
          consistency: "high_confidence",
          timestamp: new Date().toISOString(),
          confidenceScore: result.confidence.score,
          service: "fingerprintjs_pro",
          fallbackUsed: false,
        },
      };

      return fingerprint;
    } catch (error) {
      console.error("❌ FingerprintJS Pro generation failed:", error);
      throw new Error(
        `FingerprintJS Pro fingerprint generation failed: ${error.message}`
      );
    }
  }

  // Helper methods for device detection
  getDeviceName() {
    const userAgent = navigator.userAgent;
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

  getBrowserName() {
    const userAgent = navigator.userAgent;
    if (/Edg/i.test(userAgent)) return "Edge";
    if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return "Chrome";
    if (/Firefox/i.test(userAgent)) return "Firefox";
    if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent))
      return "Safari";
    if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
    return "Unknown Browser";
  }

  getOSName() {
    const userAgent = navigator.userAgent;
    if (/iPhone|iPad/i.test(userAgent)) return "iOS";
    if (/Android/i.test(userAgent)) return "Android";
    if (/Mac OS X/i.test(userAgent)) return "macOS";
    if (/Windows/i.test(userAgent)) return "Windows";
    return "Unknown OS";
  }

  getDeviceType() {
    return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
      navigator.userAgent
    )
      ? "mobile"
      : "desktop";
  }

  isAvailable() {
    return this.initialized && this.fpInstance !== null;
  }

  healthCheck() {
    // Simple synchronous check - no API calls
    return {
      status: this.initialized && this.fpInstance ? "healthy" : "unhealthy",
      service: "fingerprintjs_pro",
      initialized: this.initialized,
      hasInstance: !!this.fpInstance,
      publicKey: !!this.publicKey,
      region: this.region,
    };
  }
}

// Create and export singleton instance
const fingerprintService = new FingerprintService();

export default fingerprintService;
