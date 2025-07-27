// services/locationService.js - Enhanced Location Service with Better IP Geolocation
const axios = require("axios");

class LocationService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.ipinfoToken = process.env.IPINFO_TOKEN;
    console.log(
      this.googleMapsApiKey
        ? "✅ Google Maps API configured"
        : "⚠️ Google Maps API not configured - will use fallback services"
    );
    console.log(
      this.ipinfoToken
        ? "✅ IPInfo token configured"
        : "⚠️ IPInfo token not configured - using free tier"
    );
  }

  /**
   * Get location from GPS coordinates with Google Maps reverse geocoding
   */
  async getLocationFromGPS(latitude, longitude) {
    try {
      if (!this.isValidCoordinates(latitude, longitude)) {
        throw new Error("Invalid GPS coordinates");
      }

      const address = await this.reverseGeocode(latitude, longitude);

      return {
        type: "gps",
        latitude: latitude,
        longitude: longitude,
        address: address,
        accuracy: "high",
        source: "gps_device",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("GPS location lookup error:", error);
      return {
        type: "gps",
        latitude: latitude,
        longitude: longitude,
        address: `GPS coordinates ${latitude}, ${longitude}`,
        accuracy: "medium",
        source: "gps_device",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Enhanced IP location lookup with multiple fallbacks
   */
  async getLocationFromIP(ipAddress) {
    try {
      console.log(`🌍 Getting location for IP: ${ipAddress}`);

      // Check if IP is private/local
      if (this.isPrivateIP(ipAddress)) {
        console.log(`🏠 Private IP detected: ${ipAddress}`);
        return {
          type: "ip",
          ipAddress: ipAddress,
          isPrivate: true,
          city: "Local Network",
          region: "Private Network",
          country: "Unknown",
          accuracy: "low",
          source: "ip_private",
          timestamp: new Date().toISOString(),
        };
      }

      // Try IPInfo.io first (best accuracy)
      try {
        console.log("🔍 Trying IPInfo.io...");
        const ipinfoUrl = this.ipinfoToken
          ? `https://ipinfo.io/${ipAddress}?token=${this.ipinfoToken}`
          : `https://ipinfo.io/${ipAddress}/json`;

        const response = await axios.get(ipinfoUrl, {
          timeout: 5000,
          headers: {
            "User-Agent": "CompassPointHealth-PRMS/2.1.0",
          },
        });

        console.log("✅ IPInfo.io response:", response.data);

        if (
          response.data &&
          response.data.city &&
          response.data.city !== "undefined"
        ) {
          const [lat, lon] = (response.data.loc || "0,0").split(",");

          return {
            type: "ip",
            ipAddress: ipAddress,
            isPrivate: false,
            city: response.data.city || "Unknown",
            region: response.data.region || "Unknown",
            country: response.data.country || "Unknown",
            latitude: parseFloat(lat) || null,
            longitude: parseFloat(lon) || null,
            org: response.data.org,
            postal: response.data.postal,
            timezone: response.data.timezone,
            accuracy: "medium",
            source: "ipinfo",
            timestamp: new Date().toISOString(),
          };
        }
      } catch (error) {
        console.log("❌ IPInfo.io failed:", error.message);
      }

      // Try ip-api.com (free, good accuracy)
      try {
        console.log("🔍 Trying ip-api.com...");
        const response = await axios.get(
          `http://ip-api.com/json/${ipAddress}`,
          {
            params: {
              fields:
                "status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,query",
            },
            timeout: 5000,
            headers: {
              "User-Agent": "CompassPointHealth-PRMS/2.1.0",
            },
          }
        );

        console.log("✅ ip-api.com response:", response.data);

        if (
          response.data.status === "success" &&
          response.data.city &&
          response.data.city !== "undefined"
        ) {
          return {
            type: "ip",
            ipAddress: ipAddress,
            isPrivate: false,
            city: response.data.city || "Unknown",
            region:
              response.data.regionName || response.data.region || "Unknown",
            country: response.data.country || "Unknown",
            countryCode: response.data.countryCode,
            latitude: response.data.lat,
            longitude: response.data.lon,
            timezone: response.data.timezone,
            isp: response.data.isp,
            accuracy: "medium",
            source: "ip_api",
            timestamp: new Date().toISOString(),
          };
        }
      } catch (error) {
        console.log("❌ ip-api.com failed:", error.message);
      }

      // Try ipapi.co as another fallback
      try {
        console.log("🔍 Trying ipapi.co...");
        const response = await axios.get(
          `https://ipapi.co/${ipAddress}/json/`,
          {
            timeout: 5000,
            headers: {
              "User-Agent": "CompassPointHealth-PRMS/2.1.0",
            },
          }
        );

        console.log("✅ ipapi.co response:", response.data);

        if (
          response.data &&
          response.data.city &&
          response.data.city !== "undefined" &&
          !response.data.error
        ) {
          return {
            type: "ip",
            ipAddress: ipAddress,
            isPrivate: false,
            city: response.data.city || "Unknown",
            region: response.data.region || "Unknown",
            country: response.data.country_name || "Unknown",
            countryCode: response.data.country_code,
            latitude: response.data.latitude,
            longitude: response.data.longitude,
            timezone: response.data.timezone,
            org: response.data.org,
            accuracy: "medium",
            source: "ipapi_co",
            timestamp: new Date().toISOString(),
          };
        }
      } catch (error) {
        console.log("❌ ipapi.co failed:", error.message);
      }

      // Final fallback - basic info with ISP if possible
      console.log("⚠️ All geolocation services failed, using fallback");
      return {
        type: "ip",
        ipAddress: ipAddress,
        isPrivate: false,
        city: "Unknown Location",
        region: "Unknown",
        country: "Unknown",
        accuracy: "low",
        source: "fallback",
        error: "All geolocation services failed",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ IP location lookup error:", error);
      return {
        type: "ip",
        ipAddress: ipAddress,
        city: "Unknown Location",
        region: "Unknown",
        country: "Unknown",
        accuracy: "low",
        error: "Location service unavailable",
        source: "error",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test IP geolocation with a known public IP
   */
  async testIPGeolocation() {
    console.log("🧪 Testing IP geolocation services...");

    // Test with Google's public DNS IP
    const testIP = "8.8.8.8";
    const result = await this.getLocationFromIP(testIP);

    console.log("🧪 Test result for", testIP, ":", result);
    return result;
  }

  /**
   * Get comprehensive location data (try GPS first, fallback to IP)
   */
  async getComprehensiveLocation(request, gpsCoordinates = null) {
    let primaryLocation = null;
    let fallbackLocation = null;

    console.log("📍 Getting comprehensive location...");
    console.log("   - GPS provided:", !!gpsCoordinates);
    console.log("   - Request IP:", this.extractIPAddress(request));

    // Try GPS first if available
    if (gpsCoordinates && gpsCoordinates.latitude && gpsCoordinates.longitude) {
      try {
        console.log("📍 Processing GPS coordinates...");
        primaryLocation = await this.getLocationFromGPS(
          gpsCoordinates.latitude,
          gpsCoordinates.longitude
        );
        primaryLocation.priority = "primary";
        console.log("✅ GPS location obtained");
      } catch (error) {
        console.error("❌ GPS location failed:", error);
      }
    }

    // Get IP-based location as fallback or primary
    try {
      const ipAddress = this.extractIPAddress(request);
      console.log("📍 Processing IP location for:", ipAddress);
      fallbackLocation = await this.getLocationFromIP(ipAddress);
      fallbackLocation.priority = primaryLocation ? "fallback" : "primary";
      console.log("✅ IP location obtained:", fallbackLocation.city);
    } catch (error) {
      console.error("❌ IP location failed:", error);
    }

    const result = {
      primary: primaryLocation,
      fallback: fallbackLocation,
      best: primaryLocation || fallbackLocation,
      hasGPS: !!primaryLocation,
      hasIP: !!fallbackLocation,
    };

    console.log("📍 Comprehensive location result:", {
      hasGPS: result.hasGPS,
      hasIP: result.hasIP,
      bestSource: result.best?.source,
      bestCity: result.best?.city,
    });

    return result;
  }

  /**
   * Format location for SMS alert message
   */
  formatLocationForAlert(locationData, patientName, deviceType = "device") {
    if (locationData.type === "gps") {
      const coords = `${locationData.latitude}, ${locationData.longitude}`;
      if (
        locationData.address &&
        !locationData.address.includes("GPS coordinates")
      ) {
        return `Someone at GPS coordinates ${coords} (${locationData.address}) just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
      } else {
        return `Someone at GPS coordinates ${coords} just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
      }
    } else if (locationData.type === "ip") {
      if (locationData.isPrivate) {
        return `Someone on a local network just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
      } else if (
        locationData.city &&
        locationData.city !== "Unknown" &&
        locationData.city !== "Unknown Location"
      ) {
        return `Someone in the ${locationData.city}, ${locationData.region} area just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. Location determined from internet connection.`;
      } else {
        return `Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
      }
    }

    return `Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
  }

  /**
   * Extract IP address from request object
   */
  extractIPAddress(request) {
    const ip =
      request.ip ||
      request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      request.headers["x-real-ip"] ||
      request.headers["cf-connecting-ip"] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.req?.connection?.remoteAddress ||
      "unknown";

    // Clean IPv6 prefix if present
    return ip.replace(/^::ffff:/, "");
  }

  /**
   * Check if IP address is private/internal
   */
  isPrivateIP(ip) {
    if (!ip || ip === "unknown") return false;

    // Remove IPv6 prefix if present
    const cleanIP = ip.replace(/^::ffff:/, "");

    // Private IP ranges
    const privateRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^127\./, // 127.0.0.0/8 (localhost)
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 unique local
      /^fe80:/, // IPv6 link-local
    ];

    return privateRanges.some((range) => range.test(cleanIP));
  }

  /**
   * Validate GPS coordinates
   */
  isValidCoordinates(latitude, longitude) {
    return (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  /**
   * Reverse geocode GPS coordinates to human-readable address
   */
  async reverseGeocode(latitude, longitude) {
    // Try Google Maps API first (most accurate)
    if (this.googleMapsApiKey) {
      try {
        const response = await axios.get(
          "https://maps.googleapis.com/maps/api/geocode/json",
          {
            params: {
              latlng: `${latitude},${longitude}`,
              key: this.googleMapsApiKey,
              result_type: "street_address|route|neighborhood|locality",
            },
            timeout: 5000,
          }
        );

        if (response.data.status === "OK" && response.data.results.length > 0) {
          const result = response.data.results[0];
          return result.formatted_address;
        }
      } catch (error) {
        console.error("Google Maps geocoding error:", error.message);
      }
    }

    // Fallback to OpenStreetMap Nominatim (free service)
    try {
      const response = await axios.get(
        "https://nominatim.openstreetmap.org/reverse",
        {
          params: {
            lat: latitude,
            lon: longitude,
            format: "json",
            addressdetails: 1,
          },
          headers: {
            "User-Agent": "CompassPointHealth-PRMS/2.1.0",
          },
          timeout: 5000,
        }
      );

      if (response.data && response.data.display_name) {
        return response.data.display_name;
      }
    } catch (error) {
      console.error("Nominatim geocoding error:", error.message);
    }

    // Final fallback - return coordinates
    return `GPS coordinates ${latitude}, ${longitude}`;
  }

  /**
   * Calculate distance between two GPS coordinates (Haversine formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get service status and test all services
   */
  async getServiceStatus() {
    const status = {
      googleMaps: !!this.googleMapsApiKey,
      ipinfo: !!this.ipinfoToken,
      services: {
        gps: "Google Maps API + OpenStreetMap fallback",
        ip: "IPInfo.io + ip-api.com + ipapi.co fallback",
      },
    };

    // Test IP geolocation
    try {
      const testResult = await this.testIPGeolocation();
      status.ipTestResult = testResult;
    } catch (error) {
      status.ipTestError = error.message;
    }

    return status;
  }
}

// Create singleton instance
const locationService = new LocationService();

module.exports = locationService;
