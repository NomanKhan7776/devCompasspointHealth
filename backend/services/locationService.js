// services/locationService.js - FIXED VERSION with better IPInfo lite support
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
   * ✅ FIXED: IP location lookup using ipdata.co API with proper fields
   */
  async getLocationFromIP(ipAddress) {
    try {
      console.log(`🌐 Getting location for IP: ${ipAddress}`);

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
          latitude: null,
          longitude: null,
          accuracy: "low",
          source: "ip_private",
          timestamp: new Date().toISOString(),
        };
      }

      // ✅ FIXED: Use ipdata.co API with specific fields
      try {
        console.log("🔍 Trying ipdata.co with optimized fields...");

        const apiKey = process.env.IPDATA_API_KEY || "test";
        const fields =
          "ip,city,region,country_name,country_code,latitude,longitude,postal,timezone,organisation";
        const ipdataUrl = `https://api.ipdata.co/${ipAddress}?api-key=${apiKey}&fields=${fields}`;

        console.log(
          "🌐 ipdata.co URL:",
          ipdataUrl.replace(apiKey, "API_KEY_HIDDEN")
        );

        const response = await axios.get(ipdataUrl, {
          timeout: 10000,
          headers: {
            "User-Agent": "CompassPointHealth-PRMS/2.1.0",
            Accept: "application/json",
          },
        });

        console.log("✅ ipdata.co response:", response.data);

        if (response.data && !response.data.message && !response.data.error) {
          const data = response.data;

          // ✅ IMPROVED: Better validation
          const hasValidCity =
            data.city &&
            typeof data.city === "string" &&
            data.city.trim() !== "" &&
            data.city !== "null" &&
            !data.city.toLowerCase().includes("unknown");

          const hasValidRegion =
            data.region &&
            typeof data.region === "string" &&
            data.region.trim() !== "" &&
            data.region !== "null";

          const hasValidCountry =
            data.country_name &&
            typeof data.country_name === "string" &&
            data.country_name.trim() !== "";

          const hasValidCoordinates =
            typeof data.latitude === "number" &&
            typeof data.longitude === "number" &&
            !isNaN(data.latitude) &&
            !isNaN(data.longitude);

          console.log("🔍 ipdata.co validation:", {
            hasValidCity,
            hasValidRegion,
            hasValidCountry,
            hasValidCoordinates,
            city: data.city,
            latitude: data.latitude,
            longitude: data.longitude,
          });

          if (hasValidCity || hasValidRegion || hasValidCountry) {
            const locationResult = {
              type: "ip",
              ipAddress: ipAddress,
              isPrivate: false,
              city: hasValidCity ? data.city.trim() : "Unknown",
              region: hasValidRegion ? data.region.trim() : "Unknown",
              country: hasValidCountry ? data.country_name.trim() : "Unknown",
              countryCode: data.country_code,
              latitude: hasValidCoordinates ? data.latitude : null,
              longitude: hasValidCoordinates ? data.longitude : null,
              timezone: data.timezone,
              org: data.organisation,
              postal: data.postal,
              accuracy: hasValidCoordinates ? "high" : "medium",
              source: "ipdata_co",
              timestamp: new Date().toISOString(),
            };

            console.log("✅ ipdata.co location result:", locationResult);
            return locationResult;
          } else {
            console.log("⚠️ ipdata.co returned invalid location data");
          }
        } else {
          console.log(
            "⚠️ ipdata.co returned error:",
            response.data.message || response.data.error
          );
        }
      } catch (ipdataError) {
        console.log("❌ ipdata.co failed:", ipdataError.message);

        // Log more details about the error
        if (ipdataError.response) {
          console.log(
            "❌ ipdata.co error status:",
            ipdataError.response.status
          );
          console.log("❌ ipdata.co error data:", ipdataError.response.data);
        }
      }

      // ✅ FALLBACK: Try ip-api.com
      try {
        console.log("🔍 Trying ip-api.com fallback...");
        const response = await axios.get(
          `http://ip-api.com/json/${ipAddress}`,
          {
            params: {
              fields:
                "status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,query",
            },
            timeout: 8000,
            headers: {
              "User-Agent": "CompassPointHealth-PRMS/2.1.0",
            },
          }
        );

        console.log("✅ ip-api.com response:", response.data);

        if (response.data.status === "success") {
          const data = response.data;
          const hasValidCity =
            data.city && data.city !== "undefined" && data.city !== "";
          const hasValidRegion =
            data.regionName && data.regionName !== "undefined";

          if (hasValidCity || hasValidRegion) {
            return {
              type: "ip",
              ipAddress: ipAddress,
              isPrivate: false,
              city: hasValidCity ? data.city : "Unknown",
              region: hasValidRegion
                ? data.regionName
                : data.region || "Unknown",
              country: data.country || "Unknown",
              countryCode: data.countryCode,
              latitude: typeof data.lat === "number" ? data.lat : null,
              longitude: typeof data.lon === "number" ? data.lon : null,
              timezone: data.timezone,
              org: data.isp,
              accuracy: "medium",
              source: "ip_api_fallback",
              timestamp: new Date().toISOString(),
            };
          }
        }
      } catch (fallbackError) {
        console.log("❌ ip-api.com fallback failed:", fallbackError.message);
      }

      // ✅ FINAL FALLBACK
      console.log("⚠️ All geolocation services failed");
      return {
        type: "ip",
        ipAddress: ipAddress,
        isPrivate: false,
        city: "Location Unavailable",
        region: "Unknown Region",
        country: "Unknown Country",
        latitude: null,
        longitude: null,
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
        city: "Location Error",
        region: "Unknown",
        country: "Unknown",
        latitude: null,
        longitude: null,
        accuracy: "low",
        error: "Location service unavailable",
        source: "error",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * ✅ ADDED: Test IP geolocation with debugging
   */
  async testIPGeolocation() {
    console.log("🧪 Testing IP geolocation services...");

    // Test with multiple known IPs
    const testIPs = [
      "8.8.8.8", // Google DNS
      "1.1.1.1", // Cloudflare DNS
      "208.67.222.222", // OpenDNS
    ];

    for (const testIP of testIPs) {
      console.log(`🧪 Testing with IP: ${testIP}`);
      const result = await this.getLocationFromIP(testIP);
      console.log(`🧪 Result for ${testIP}:`, {
        city: result.city,
        region: result.region,
        country: result.country,
        source: result.source,
        accuracy: result.accuracy,
      });

      // If we get a good result, return it
      if (
        result.city &&
        result.city !== "Unknown" &&
        result.city !== "Location Unavailable"
      ) {
        return result;
      }
    }

    return null;
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
      console.log("✅ IP location obtained:", {
        city: fallbackLocation.city,
        source: fallbackLocation.source,
        accuracy: fallbackLocation.accuracy,
      });
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
      bestAccuracy: result.best?.accuracy,
    });

    return result;
  }

  /**
   * ✅ FIXED: Format location for SMS alert message with coordinates
   */
  formatLocationForAlert(locationData, patientName, deviceType = "device") {
    if (locationData.type === "gps") {
      const coords = `${locationData.latitude.toFixed(
        6
      )}, ${locationData.longitude.toFixed(6)}`;
      if (
        locationData.address &&
        !locationData.address.includes("GPS coordinates")
      ) {
        return `🚨 SECURITY ALERT: Someone at GPS coordinates ${coords} (${locationData.address}) just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. If this was not authorized, please contact medical staff immediately.`;
      } else {
        return `🚨 SECURITY ALERT: Someone at GPS coordinates ${coords} just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. If this was not authorized, please contact medical staff immediately.`;
      }
    } else if (locationData.type === "ip") {
      if (locationData.isPrivate) {
        return `🚨 SECURITY ALERT: Someone on a local network just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. If this was not authorized, please contact medical staff immediately.`;
      } else {
        const hasSpecificCity =
          locationData.city &&
          locationData.city !== "Unknown" &&
          locationData.city !== "Location Unavailable" &&
          locationData.city !== "Location Error";

        const hasSpecificRegion =
          locationData.region &&
          locationData.region !== "Unknown" &&
          locationData.region !== "Unknown Region";

        let locationText = "";
        let coordsText = "";

        // ✅ FIXED: Add coordinates if available from IP geolocation
        if (
          locationData.latitude &&
          locationData.longitude &&
          typeof locationData.latitude === "number" &&
          typeof locationData.longitude === "number"
        ) {
          coordsText = ` (Coordinates: ${locationData.latitude.toFixed(
            4
          )}, ${locationData.longitude.toFixed(4)})`;
        }

        if (hasSpecificCity && hasSpecificRegion) {
          locationText = `in the ${locationData.city}, ${locationData.region} area${coordsText}`;
        } else if (hasSpecificCity) {
          locationText = `in the ${locationData.city} area${coordsText}`;
        } else if (hasSpecificRegion) {
          locationText = `in the ${locationData.region} region${coordsText}`;
        } else {
          locationText = `from an unknown location${coordsText}`;
        }

        return `🚨 SECURITY ALERT: Someone ${locationText} just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. Location determined from internet connection. If this was not authorized, please contact medical staff immediately.`;
      }
    }

    return `🚨 SECURITY ALERT: Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. If this was not authorized, please contact medical staff immediately.`;
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
            timeout: 8000,
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
          timeout: 8000,
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
   * ✅ IMPROVED: Get service status and test all services
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
      status.ipTestSuccess = !!testResult;
    } catch (error) {
      status.ipTestError = error.message;
      status.ipTestSuccess = false;
    }

    return status;
  }
}

// Create singleton instance
const locationService = new LocationService();

module.exports = locationService;
