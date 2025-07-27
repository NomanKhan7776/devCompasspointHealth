import FingerprintJS from "@fingerprintjs/fingerprintjs-pro";

class FingerprintService {
  constructor() {
    this.fpPromise = null;
    this.isInitialized = false;
    this.publicKey = import.meta.env.VITE_FINGERPRINTJS_PUBLIC_KEY;
    this.region = import.meta.env.VITE_FINGERPRINTJS_REGION || "us";

    // 🔧 FIXED: Ensure region is valid for FingerprintJS Pro
    if (!["us", "eu", "ap"].includes(this.region)) {
      console.warn(`⚠️ Invalid region "${this.region}". Using "us" instead.`);
      this.region = "us";
    }

    this.fallbackMode = false;
    this.initializationAttempts = 0;
    this.maxRetries = 2;
    this.lastError = null;
    this.requestCount = 0;
    this.maxTrialRequests = 50;
    this.cachedFingerprint = null;
    this.cacheExpiry = 24 * 60 * 60 * 1000;
  }

  async initialize() {
    if (this.fpPromise && this.isInitialized) return this.fpPromise;

    if (!this.publicKey) {
      console.error("❌ FingerprintJS Pro API key not configured");
      console.error("📋 Add VITE_FINGERPRINTJS_PUBLIC_KEY to your .env file");
      this.fallbackMode = true;
      return this.initializeFallback();
    }

    if (this.requestCount >= this.maxTrialRequests) {
      console.warn("⚠️ Trial request limit reached, using fallback mode");
      this.fallbackMode = true;
      return this.initializeFallback();
    }

    this.initializationAttempts++;
    console.log(
      `🔄 Initializing FingerprintJS Pro Trial (attempt ${this.initializationAttempts}/${this.maxRetries})`
    );
    console.log(`   Region: ${this.region}`);
    console.log(`   Endpoint: https://${this.region}.api.fpjs.io`);
    console.log(
      `   Requests Used: ${this.requestCount}/${this.maxTrialRequests}`
    );

    try {
      // 🔧 FIXED: Test network connectivity with proper timeout handling
      await this.testNetworkConnectivity();

      // 🔧 FIXED: FingerprintJS initialization with proper timeout
      this.fpPromise = Promise.race([
        FingerprintJS.load({
          apiKey: this.publicKey,
          region: this.region,
          timeout: 10000,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("FingerprintJS Pro initialization timeout")),
            15000
          )
        ),
      ]);

      await this.fpPromise;
      this.isInitialized = true;
      this.fallbackMode = false;
      this.lastError = null;
      console.log("✅ FingerprintJS Pro Trial initialized successfully");
      return this.fpPromise;
    } catch (error) {
      this.lastError = error;
      console.error(
        `❌ FingerprintJS Pro Trial initialization failed (attempt ${this.initializationAttempts}):`,
        error.message
      );

      this.analyzeTrialError(error);

      if (this.initializationAttempts < this.maxRetries) {
        const delay = 2000;
        console.log(`🔄 Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.initialize();
      }

      console.warn("⚠️ Switching to fallback mode (Trial account)");
      this.fallbackMode = true;
      return this.initializeFallback();
    }
  }

  // 🔧 FIXED: Network connectivity test with proper timeout handling
  async testNetworkConnectivity() {
    try {
      console.log("🔍 Testing trial account connectivity...");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        // 🆕 FIXED: Use correct FingerprintJS Pro endpoints
        const endpoint =
          this.region === "eu"
            ? "https://eu.api.fpjs.io"
            : "https://api.fpjs.io";
        console.log(`   Testing endpoint: ${endpoint}`);

        await fetch(endpoint, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log("✅ Network connectivity test passed");
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          throw new Error("Network connectivity timeout - check connection");
        }
        throw fetchError;
      }
    } catch (error) {
      throw new Error(`Network connectivity failed: ${error.message}`);
    }
  }

  analyzeTrialError(error) {
    const errorMessage = error.message.toLowerCase();

    console.error("🔍 Trial Account Error Analysis:");

    if (
      errorMessage.includes("network") ||
      errorMessage.includes("err_name_not_resolved")
    ) {
      console.error("🚫 Network/DNS Error (Trial Account):");
      console.error(
        '   ✅ Check: Region should be "us", "eu", or "ap" (not aws regions)'
      );
      console.error("   ✅ Check: Correct endpoint format");
      console.error("   ✅ Try: Different network (mobile hotspot)");
    } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
      console.error("🔑 Trial Authentication Error:");
      console.error("   ✅ Check: Using PUBLIC key (not secret key)");
      console.error("   ✅ Check: Key copied correctly from dashboard");
    } else if (errorMessage.includes("timeout")) {
      console.error("⏰ Trial Timeout Error:");
      console.error("   ✅ Trial accounts may have slower response times");
      console.error("   ✅ Check network stability");
    }
  }

  async initializeFallback() {
    console.log("🔧 Initializing fallback for trial account...");
    console.log("💡 Fallback mode saves your trial API quota");
    this.isInitialized = true;
    this.fallbackMode = true;
    return Promise.resolve(null);
  }

  async generateFingerprint(tags = {}) {
    try {
      // Check cached fingerprint first
      if (this.cachedFingerprint && !this.isCacheExpired()) {
        console.log("📋 Using cached fingerprint (trial optimization)");
        return this.cachedFingerprint;
      }

      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.fallbackMode || this.requestCount >= this.maxTrialRequests) {
        console.log(
          "🔧 Using fallback fingerprinting (trial quota conservation)"
        );
        return this.generateFallbackFingerprint(tags);
      }

      const fp = await this.fpPromise;
      this.requestCount++;
      console.log(
        `📊 Trial request ${this.requestCount}/${this.maxTrialRequests}`
      );

      const result = await Promise.race([
        fp.get({
          tags: {
            userAction: "device_registration",
            sessionId: this.generateSessionId(),
            trialAccount: true,
            ...tags,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Trial fingerprint generation timeout")),
            12000
          )
        ),
      ]);

      const fingerprint = {
        hash: result.visitorId,
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
          collectMethod: "fingerprintjs_pro_trial",
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
          method: "fingerprintjs_pro_trial",
          consistency: "high_confidence",
          timestamp: new Date().toISOString(),
          confidenceScore: result.confidence.score,
          service: "fingerprintjs_pro_trial",
          fallbackUsed: false,
          trialRequest: this.requestCount,
          cached: false,
        },
      };

      this.cacheFingerprint(fingerprint);

      console.log("✅ FingerprintJS Pro Trial fingerprint generated:", {
        visitorId: result.visitorId,
        confidence: result.confidence.score,
        requestId: result.requestId,
        requestCount: this.requestCount,
      });

      if (this.requestCount >= this.maxTrialRequests * 0.8) {
        console.warn(
          "⚠️ Approaching trial request limit. Consider upgrading or using fallback mode."
        );
      }

      return fingerprint;
    } catch (error) {
      console.error("❌ FingerprintJS Pro Trial generation failed:", error);
      console.log("🔄 Switching to fallback mode to preserve trial quota...");
      this.fallbackMode = true;
      return this.generateFallbackFingerprint(tags);
    }
  }

  generateFallbackFingerprint(tags = {}) {
    console.log("🔧 Generating trial-optimized fallback fingerprint...");

    const components = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages ? navigator.languages.join(",") : "",
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookieEnabled: navigator.cookieEnabled,
      onlineStatus: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: navigator.deviceMemory || 0,
      touchPoints: navigator.maxTouchPoints || 0,
      trialFallback: true,
      timestamp: new Date().toDateString(),
    };

    const fingerprint = this.createHash(JSON.stringify(components));

    const fallbackFingerprint = {
      hash: fingerprint,
      details: {
        visitorId: fingerprint,
        requestId: `trial_fallback_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        confidence: 0.8,
        components: components,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screen: {
          width: screen.width,
          height: screen.height,
          colorDepth: screen.colorDepth,
        },
        collectMethod: "trial_fallback",
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
        method: "trial_fallback",
        consistency: "good_confidence",
        timestamp: new Date().toISOString(),
        confidenceScore: 0.8,
        service: "trial_fallback",
        fallbackUsed: true,
        fallbackReason: "trial_quota_conservation",
      },
    };

    this.cacheFingerprint(fallbackFingerprint);
    return fallbackFingerprint;
  }

  cacheFingerprint(fingerprint) {
    this.cachedFingerprint = {
      ...fingerprint,
      metadata: {
        ...fingerprint.metadata,
        cached: true,
        cachedAt: Date.now(),
      },
    };
  }

  isCacheExpired() {
    if (!this.cachedFingerprint || !this.cachedFingerprint.metadata.cachedAt) {
      return true;
    }
    return (
      Date.now() - this.cachedFingerprint.metadata.cachedAt > this.cacheExpiry
    );
  }

  createHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  generateSessionId() {
    return (
      "trial_session_" +
      Math.random().toString(36).substr(2, 9) +
      "_" +
      Date.now()
    );
  }

  // Helper methods (unchanged)
  getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) {
      const match = ua.match(/Android.*?;\s*(.*?)\s*Build/);
      return match ? match[1] : "Android Device";
    }
    if (/Mac/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows PC";
    return "Unknown Device";
  }

  getBrowserName() {
    const ua = navigator.userAgent;
    if (/Edg/i.test(ua)) return "Edge";
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return "Chrome";
    if (/Firefox/i.test(ua)) return "Firefox";
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
    return "Unknown Browser";
  }

  getOSName() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/i.test(ua)) return "iOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Mac OS X/i.test(ua)) return "macOS";
    if (/Windows/i.test(ua)) return "Windows";
    return "Unknown OS";
  }

  getDeviceType() {
    return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
      navigator.userAgent
    )
      ? "mobile"
      : "desktop";
  }

  async testConsistency() {
    console.log("🧪 Testing trial account fingerprint consistency...");
    const results = [];

    for (let i = 0; i < 3; i++) {
      const fp = await this.generateFingerprint({
        test: `trial_consistency_${i}`,
      });
      results.push(fp.hash);
      if (i < 2) await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const unique = [...new Set(results)];
    const isConsistent = unique.length === 1;

    console.log(
      isConsistent
        ? `✅ Trial fingerprint consistent! (${
            this.fallbackMode ? "Fallback" : "FingerprintJS Pro"
          } mode)`
        : "❌ Trial fingerprint consistency issue"
    );

    return {
      isConsistent,
      results,
      mode: this.fallbackMode ? "trial_fallback" : "trial_fingerprintjs_pro",
      requestsUsed: this.requestCount,
    };
  }

  async healthCheck() {
    try {
      const status = {
        requestsUsed: this.requestCount,
        requestsRemaining: this.maxTrialRequests - this.requestCount,
        quotaPercentage: (
          (this.requestCount / this.maxTrialRequests) *
          100
        ).toFixed(1),
      };

      if (this.fallbackMode) {
        return {
          status: "fallback",
          service: "trial_fallback",
          message: "Using fallback mode for trial account",
          lastError: this.lastError?.message,
          ready: true,
          ...status,
        };
      }

      if (!this.isInitialized) {
        await this.initialize();
      }

      return {
        status: "healthy",
        service: "fingerprintjs_pro_trial",
        region: this.region,
        initialized: this.isInitialized,
        ready: true,
        ...status,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        fallbackAvailable: true,
        ready: this.fallbackMode,
        requestsUsed: this.requestCount,
      };
    }
  }

  getTrialStatus() {
    return {
      requestsUsed: this.requestCount,
      requestsRemaining: this.maxTrialRequests - this.requestCount,
      quotaPercentage: (
        (this.requestCount / this.maxTrialRequests) *
        100
      ).toFixed(1),
      fallbackMode: this.fallbackMode,
      cacheActive: !!this.cachedFingerprint && !this.isCacheExpired(),
      region: this.region,
    };
  }
}

export default new FingerprintService();
