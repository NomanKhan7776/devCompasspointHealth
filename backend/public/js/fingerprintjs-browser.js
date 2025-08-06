// backend/public/js/fingerprintjs-browser.js - OFFICIAL FingerprintJS Pro CDN ONLY
// Fixed for cross-browser and mobile compatibility with ES Module support

(function (window) {
  "use strict";

  console.log(
    "🔧 Loading FingerprintJS Pro Browser Service (Official CDN Only - ES Module Fixed)..."
  );

  /**
   * Official FingerprintJS Pro Browser Service - Cross-Browser & Mobile Compatible
   * Uses ONLY the official FingerprintJS Pro CDN with ES Module support
   */
  class FingerprintJSBrowser {
    constructor() {
      this.initialized = false;
      this.fpInstance = null;
      this.publicKey = "9VIydhmCLQeWh0E3Oev5"; // Your actual FingerprintJS Pro public key
      this.region = "us";
      this.initPromise = null;
      this.maxRetries = 3;
      this.retryDelay = 1000; // 1 second

      console.log("🔧 Initializing FingerprintJS Pro Browser Service...");
      console.log(
        "   - Public Key:",
        this.publicKey ? "✅ Found" : "❌ Missing"
      );
      console.log("   - Region:", this.region);
      console.log("   - User Agent:", navigator.userAgent);
      console.log("   - Platform:", navigator.platform);
    }

    async initialize() {
      // Return existing promise if already initializing
      if (this.initPromise) {
        console.log("🔄 FingerprintJS Pro already initializing, waiting...");
        return this.initPromise;
      }

      // Return immediately if already initialized
      if (this.initialized && this.fpInstance) {
        console.log("✅ FingerprintJS Pro already initialized");
        return this.fpInstance;
      }

      console.log("🔄 Starting FingerprintJS Pro initialization...");
      this.initPromise = this._initializeInternal();
      return this.initPromise;
    }

    async _initializeInternal() {
      let lastError = null;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          console.log(
            `🔄 FingerprintJS Pro initialization attempt ${attempt}/${this.maxRetries}`
          );

          if (!this.publicKey) {
            throw new Error("FingerprintJS Pro public key not found");
          }

          console.log("🔐 Loading FingerprintJS Pro from OFFICIAL CDN...");

          // Check if FingerprintJS is already loaded globally
          if (typeof window.FingerprintJS === "undefined") {
            // Load the OFFICIAL FingerprintJS Pro script
            await this._loadFingerprintJSScript();
          }

          // Verify FingerprintJS is now available
          if (
            typeof window.FingerprintJS === "undefined" ||
            typeof window.FingerprintJS.load !== "function"
          ) {
            throw new Error(
              "FingerprintJS Pro not properly loaded after script load"
            );
          }

          console.log("✅ FingerprintJS Pro CDN script loaded successfully");

          const config = {
            apiKey: this.publicKey,
            region:
              this.region === "eu" ? "eu" : this.region === "ap" ? "ap" : "us",
            endpoint:
              this.region === "eu"
                ? "https://eu.api.fpjs.io"
                : this.region === "ap"
                ? "https://ap.api.fpjs.io"
                : "https://api.fpjs.io",
          };

          console.log("🔧 Initializing FingerprintJS Pro with config:", {
            apiKey: this.publicKey.substring(0, 8) + "...",
            region: config.region,
            endpoint: config.endpoint,
          });

          // Initialize FingerprintJS Pro with timeout
          this.fpInstance = await Promise.race([
            window.FingerprintJS.load(config),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(new Error("FingerprintJS Pro initialization timeout")),
                10000
              )
            ),
          ]);

          this.initialized = true;
          console.log("✅ FingerprintJS Pro initialized successfully");
          console.log("   - Instance created:", !!this.fpInstance);
          console.log("   - Available methods:", Object.keys(this.fpInstance));

          return this.fpInstance;
        } catch (error) {
          lastError = error;
          console.error(
            `❌ FingerprintJS Pro initialization attempt ${attempt} failed:`,
            error.message
          );

          if (attempt < this.maxRetries) {
            console.log(`🔄 Retrying in ${this.retryDelay}ms...`);
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelay)
            );
            this.retryDelay *= 2; // Exponential backoff
          }
        }
      }

      // All attempts failed
      console.error("❌ All FingerprintJS Pro initialization attempts failed");
      this.initialized = false;
      this.fpInstance = null;
      this.initPromise = null;
      throw new Error(
        `FingerprintJS Pro initialization failed after ${this.maxRetries} attempts: ${lastError?.message}`
      );
    }

    async _loadFingerprintJSScript() {
      // Check if FingerprintJS is already loaded
      if (typeof window.FingerprintJS !== "undefined") {
        console.log("✅ FingerprintJS Pro already loaded");
        return;
      }

      try {
        console.log("🔄 Loading FingerprintJS Pro using dynamic import...");

        // ✅ FIXED: Use dynamic import for ES modules
        const fpjsModule = await import(
          `https://fpjscdn.net/v3/${this.publicKey}`
        );

        console.log("✅ FingerprintJS Pro module imported successfully");
        console.log("   - Module:", fpjsModule);

        // Set the FingerprintJS on window for compatibility
        window.FingerprintJS = fpjsModule.default || fpjsModule;

        // Verify it's properly loaded
        if (
          typeof window.FingerprintJS === "undefined" ||
          typeof window.FingerprintJS.load !== "function"
        ) {
          throw new Error("FingerprintJS Pro not properly loaded from module");
        }

        console.log("✅ FingerprintJS Pro is now available globally");
        console.log("   - FingerprintJS object:", window.FingerprintJS);
      } catch (importError) {
        console.warn(
          "⚠️ Dynamic import failed, trying IIFE fallback:",
          importError.message
        );

        // ✅ FALLBACK: Try IIFE version for browsers that don't support dynamic imports
        try {
          await this._loadFingerprintJSIIFE();
        } catch (iifeError) {
          console.error("❌ Both dynamic import and IIFE loading failed");
          throw new Error(
            `FingerprintJS Pro loading failed: ${importError.message}, IIFE fallback: ${iifeError.message}`
          );
        }
      }
    }

    async _loadFingerprintJSIIFE() {
      return new Promise((resolve, reject) => {
        // Check if script is already loading or loaded
        const existingScript = document.querySelector(
          'script[data-fpjs="true"]'
        );
        if (existingScript) {
          if (typeof window.FingerprintJS !== "undefined") {
            console.log(
              "✅ FingerprintJS Pro already loaded from existing script"
            );
            resolve();
            return;
          }
          // Wait for existing script to load
          console.log(
            "🔄 Waiting for existing FingerprintJS Pro script to load..."
          );
          existingScript.addEventListener("load", resolve);
          existingScript.addEventListener("error", reject);
          return;
        }

        const script = document.createElement("script");

        // ✅ FIXED: Use IIFE version for script tag loading
        script.src = `https://fpjscdn.net/v3/${this.publicKey}/iife.min.js`;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.setAttribute("data-fpjs", "true");

        // Add timeout for script loading
        const timeoutId = setTimeout(() => {
          console.error("❌ FingerprintJS Pro IIFE script loading timeout");
          script.remove();
          reject(new Error("FingerprintJS Pro IIFE script loading timeout"));
        }, 15000);

        script.onload = () => {
          clearTimeout(timeoutId);
          console.log("✅ FingerprintJS Pro IIFE script loaded successfully");
          console.log("   - Loaded from:", script.src);

          // Wait for the script to initialize properly
          const checkFingerprintJS = () => {
            if (
              typeof window.FingerprintJS !== "undefined" &&
              typeof window.FingerprintJS.load === "function"
            ) {
              console.log(
                "✅ FingerprintJS Pro IIFE is now available globally"
              );
              resolve();
            } else {
              console.log(
                "🔄 Waiting for FingerprintJS Pro IIFE to become available..."
              );
              setTimeout(checkFingerprintJS, 100);
            }
          };

          // Start checking immediately
          checkFingerprintJS();
        };

        script.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error(
            "❌ Failed to load FingerprintJS Pro IIFE script:",
            error
          );
          console.error("   - Attempted URL:", script.src);
          reject(
            new Error(
              `Failed to load FingerprintJS Pro IIFE script: ${
                error.message || "Unknown error"
              }`
            )
          );
        };

        console.log(
          "📤 Adding FingerprintJS Pro IIFE script to document head..."
        );
        console.log("   - IIFE CDN URL:", script.src);

        if (!document.head) {
          reject(new Error("Document head not available"));
          return;
        }

        document.head.appendChild(script);
      });
    }

    async generateFingerprint(tags = {}) {
      try {
        console.log("🔐 Generating FingerprintJS Pro fingerprint...");
        console.log("   - Tags:", tags);

        if (!this.initialized || !this.fpInstance) {
          console.log(
            "🔄 FingerprintJS Pro not initialized, initializing now..."
          );
          await this.initialize();
        }

        if (!this.fpInstance || typeof this.fpInstance.get !== "function") {
          throw new Error(
            "FingerprintJS Pro instance not properly initialized"
          );
        }

        console.log("📡 Calling FingerprintJS Pro API...");

        // Add timeout to fingerprint generation
        const result = await Promise.race([
          this.fpInstance.get(tags),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("FingerprintJS Pro API call timeout")),
              30000
            )
          ),
        ]);

        if (!result || !result.visitorId) {
          throw new Error("Invalid response from FingerprintJS Pro API");
        }

        console.log("✅ FingerprintJS Pro fingerprint generated:", {
          visitorId: result.visitorId,
          confidence: result.confidence?.score,
          requestId: result.requestId,
        });

        const fingerprint = {
          // Use visitorId as hash for compatibility
          hash: result.visitorId,
          visitorId: result.visitorId,
          requestId: result.requestId,
          confidence: result.confidence?.score || 0,
          details: {
            visitorId: result.visitorId,
            requestId: result.requestId,
            confidence: result.confidence?.score || 0,
            components: result.components || {},
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            screen: {
              width: screen.width,
              height: screen.height,
              colorDepth: screen.colorDepth,
              pixelRatio: window.devicePixelRatio || 1,
            },
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
            collectMethod: "fingerprintjs_pro",
            isAndroid: /Android/i.test(navigator.userAgent),
            isiOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
            isMobile:
              /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
                navigator.userAgent
              ),
            timestamp: Date.now(),
            // Include full FingerprintJS Pro result
            fullResult: result,
          },
          metadata: {
            deviceName: this.getDeviceName(),
            browserName: this.getBrowserName(),
            osName: this.getOSName(),
            deviceType: this.getDeviceType(),
            method: "fingerprintjs_pro",
            consistency: "high_confidence",
            timestamp: new Date().toISOString(),
            confidenceScore: result.confidence?.score || 0,
            service: "fingerprintjs_pro",
            fallbackUsed: false,
            // Include additional FingerprintJS Pro metadata
            fpjsVersion: result.version || "unknown",
            fpjsRequestId: result.requestId,
            region: this.region,
            publicKey: this.publicKey.substring(0, 8) + "...",
          },
        };

        return fingerprint;
      } catch (error) {
        console.error("❌ FingerprintJS Pro generation failed:", error);
        console.error("   - Error stack:", error.stack);
        throw new Error(
          `FingerprintJS Pro fingerprint generation failed: ${error.message}`
        );
      }
    }

    // Enhanced helper methods for device detection
    getDeviceName() {
      const userAgent = navigator.userAgent;

      // iOS devices
      if (/iPhone/i.test(userAgent)) {
        const model = userAgent.match(/iPhone OS ([\d_]+)/);
        return model ? `iPhone (iOS ${model[1].replace(/_/g, ".")})` : "iPhone";
      }
      if (/iPad/i.test(userAgent)) {
        const model = userAgent.match(/OS ([\d_]+)/);
        return model ? `iPad (iOS ${model[1].replace(/_/g, ".")})` : "iPad";
      }

      // Android devices
      if (/Android/i.test(userAgent)) {
        const match = userAgent.match(/Android.*?;\s*(.*?)\s*Build/);
        const version = userAgent.match(/Android ([\d.]+)/);
        const device = match ? match[1] : "Android Device";
        const androidVersion = version ? ` (Android ${version[1]})` : "";
        return device + androidVersion;
      }

      // Desktop devices
      if (/Mac/i.test(userAgent)) return "Mac";
      if (/Windows NT 10/i.test(userAgent)) return "Windows 10/11 PC";
      if (/Windows NT 6.3/i.test(userAgent)) return "Windows 8.1 PC";
      if (/Windows NT 6.1/i.test(userAgent)) return "Windows 7 PC";
      if (/Windows/i.test(userAgent)) return "Windows PC";
      if (/Linux/i.test(userAgent)) return "Linux PC";

      return "Unknown Device";
    }

    getBrowserName() {
      const userAgent = navigator.userAgent;

      // Edge (must be checked before Chrome)
      if (/Edg\//i.test(userAgent)) {
        const version = userAgent.match(/Edg\/([\d.]+)/);
        return version ? `Edge ${version[1]}` : "Edge";
      }

      // Chrome (must be checked after Edge)
      if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
        const version = userAgent.match(/Chrome\/([\d.]+)/);
        return version ? `Chrome ${version[1]}` : "Chrome";
      }

      // Firefox
      if (/Firefox\//i.test(userAgent)) {
        const version = userAgent.match(/Firefox\/([\d.]+)/);
        return version ? `Firefox ${version[1]}` : "Firefox";
      }

      // Safari (must be checked after Chrome)
      if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
        const version = userAgent.match(/Version\/([\d.]+)/);
        return version ? `Safari ${version[1]}` : "Safari";
      }

      // Mobile browsers
      if (/SamsungBrowser/i.test(userAgent)) {
        const version = userAgent.match(/SamsungBrowser\/([\d.]+)/);
        return version ? `Samsung Internet ${version[1]}` : "Samsung Internet";
      }

      if (/OPR\//i.test(userAgent)) {
        const version = userAgent.match(/OPR\/([\d.]+)/);
        return version ? `Opera ${version[1]}` : "Opera";
      }

      return "Unknown Browser";
    }

    getOSName() {
      const userAgent = navigator.userAgent;

      // Mobile OS
      if (/iPhone|iPad|iPod/i.test(userAgent)) {
        const version = userAgent.match(/OS ([\d_]+)/);
        return version ? `iOS ${version[1].replace(/_/g, ".")}` : "iOS";
      }

      if (/Android/i.test(userAgent)) {
        const version = userAgent.match(/Android ([\d.]+)/);
        return version ? `Android ${version[1]}` : "Android";
      }

      // Desktop OS
      if (/Mac OS X/i.test(userAgent)) {
        const version = userAgent.match(/Mac OS X ([\d_]+)/);
        return version ? `macOS ${version[1].replace(/_/g, ".")}` : "macOS";
      }

      if (/Windows NT 10/i.test(userAgent)) return "Windows 10/11";
      if (/Windows NT 6.3/i.test(userAgent)) return "Windows 8.1";
      if (/Windows NT 6.1/i.test(userAgent)) return "Windows 7";
      if (/Windows/i.test(userAgent)) return "Windows";
      if (/Linux/i.test(userAgent)) return "Linux";

      return "Unknown OS";
    }

    getDeviceType() {
      const userAgent = navigator.userAgent;

      // Tablet check (must be before mobile)
      if (
        /iPad/i.test(userAgent) ||
        (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))
      ) {
        return "tablet";
      }

      // Mobile check
      if (
        /Mobile|Android|iPhone|iPod|BlackBerry|Windows Phone/i.test(userAgent)
      ) {
        return "mobile";
      }

      return "desktop";
    }

    isAvailable() {
      return (
        this.initialized &&
        this.fpInstance !== null &&
        typeof this.fpInstance.get === "function"
      );
    }

    async healthCheck() {
      try {
        console.log("🔍 Running FingerprintJS Pro health check...");

        if (!this.isAvailable()) {
          console.log("🔄 Service not available, attempting initialization...");
          await this.initialize();
        }

        // Try to generate a test fingerprint
        const testResult = await this.fpInstance.get({ tag: "health_check" });

        const healthResult = {
          status: "healthy",
          service: "fingerprintjs_pro",
          initialized: this.initialized,
          hasInstance: !!this.fpInstance,
          publicKey: !!this.publicKey,
          region: this.region,
          visitorId: testResult.visitorId,
          confidence: testResult.confidence?.score || 0,
          requestId: testResult.requestId,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          deviceType: this.getDeviceType(),
          browserName: this.getBrowserName(),
          osName: this.getOSName(),
        };

        console.log("✅ Health check passed:", healthResult);
        return healthResult;
      } catch (error) {
        const healthResult = {
          status: "unhealthy",
          service: "fingerprintjs_pro",
          error: error.message,
          initialized: this.initialized,
          hasInstance: !!this.fpInstance,
          publicKey: !!this.publicKey,
          region: this.region,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        };

        console.error("❌ Health check failed:", healthResult);
        return healthResult;
      }
    }
  }

  // Create global instance
  window.FingerprintJSBrowser = FingerprintJSBrowser;
  window.fingerprintService = new FingerprintJSBrowser();

  console.log("🚀 FingerprintJS Pro Browser Service loaded successfully");
  console.log("✅ Available on window.fingerprintService");
  console.log("✅ Available on window.FingerprintJSBrowser");
  console.log("🔧 Using official CDN with ES Module support");

  // Auto-initialize on load for better compatibility
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.log(
        "📱 Document loaded, FingerprintJS Pro ready for initialization"
      );
    });
  } else {
    console.log(
      "📱 Document already loaded, FingerprintJS Pro ready for initialization"
    );
  }
})(window);
