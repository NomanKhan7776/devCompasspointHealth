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
   * ✅ FIXED: Enhanced IP location lookup with better IPInfo lite handling
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

      // ✅ FIXED: Try IPInfo.io first with better lite account handling
      try {
        console.log("🔍 Trying IPInfo.io...");
        const ipinfoUrl = this.ipinfoToken
          ? `https://ipinfo.io/${ipAddress}?token=${this.ipinfoToken}`
          : `https://ipinfo.io/${ipAddress}/json`;

        const response = await axios.get(ipinfoUrl, {
          timeout: 8000, // Increased timeout for lite accounts
          headers: {
            "User-Agent": "CompassPointHealth-PRMS/2.1.0",
            Accept: "application/json",
          },
        });

        console.log("✅ IPInfo.io raw response:", response.data);

        if (response.data && typeof response.data === "object") {
          // ✅ BETTER: Handle IPInfo lite account responses
          const data = response.data;

          // Check for error responses from IPInfo
          if (data.error || data.message) {
            console.log(
              "⚠️ IPInfo error response:",
              data.error || data.message
            );
            throw new Error(data.error || data.message);
          }

          // ✅ FIXED: Better validation for IPInfo lite data
          const hasValidCity =
            data.city &&
            data.city !== "undefined" &&
            data.city !== "" &&
            data.city.toLowerCase() !== "null" &&
            !data.city.includes("N/A");

          const hasValidRegion =
            data.region &&
            data.region !== "undefined" &&
            data.region !== "" &&
            data.region.toLowerCase() !== "null";

          const hasValidCountry =
            data.country && data.country !== "undefined" && data.country !== "";

          console.log("🔍 IPInfo data validation:", {
            hasValidCity,
            hasValidRegion,
            hasValidCountry,
            cityValue: `"${data.city}"`,
            regionValue: `"${data.region}"`,
            countryValue: `"${data.country}"`,
          });

          if (hasValidCity || hasValidRegion || hasValidCountry) {
            const [lat, lon] = (data.loc || "0,0").split(",");

            const locationResult = {
              type: "ip",
              ipAddress: ipAddress,
              isPrivate: false,
              city: hasValidCity ? data.city : "Unknown",
              region: hasValidRegion ? data.region : "Unknown",
              country: hasValidCountry ? data.country : "Unknown",
              latitude: parseFloat(lat) || null,
              longitude: parseFloat(lon) || null,
              org: data.org,
              postal: data.postal,
              timezone: data.timezone,
              accuracy: "medium",
              source: this.ipinfoToken ? "ipinfo_paid" : "ipinfo_free",
              timestamp: new Date().toISOString(),
            };

            console.log("✅ IPInfo location result:", locationResult);
            return locationResult;
          } else {
            console.log("⚠️ IPInfo returned invalid location data");
            throw new Error("Invalid location data from IPInfo");
          }
        } else {
          console.log("⚠️ IPInfo returned invalid response format");
          throw new Error("Invalid response format from IPInfo");
        }
      } catch (ipinfoError) {
        console.log("❌ IPInfo.io failed:", ipinfoError.message);

        // ✅ Check if it's a rate limit or quota issue
        if (ipinfoError.response?.status === 429) {
          console.log("⚠️ IPInfo rate limit exceeded");
        } else if (ipinfoError.response?.status === 403) {
          console.log("⚠️ IPInfo quota exceeded or invalid token");
        }
      }

      // ✅ IMPROVED: Try ip-api.com (free, good accuracy)
      try {
        console.log("🔍 Trying ip-api.com...");
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
            data.city &&
            data.city !== "undefined" &&
            data.city !== "" &&
            !data.city.includes("N/A");

          const hasValidRegion =
            data.regionName &&
            data.regionName !== "undefined" &&
            data.regionName !== "";

          if (hasValidCity || hasValidRegion) {
            const locationResult = {
              type: "ip",
              ipAddress: ipAddress,
              isPrivate: false,
              city: hasValidCity ? data.city : "Unknown",
              region: hasValidRegion
                ? data.regionName
                : data.region || "Unknown",
              country: data.country || "Unknown",
              countryCode: data.countryCode,
              latitude: data.lat,
              longitude: data.lon,
              timezone: data.timezone,
              isp: data.isp,
              accuracy: "medium",
              source: "ip_api",
              timestamp: new Date().toISOString(),
            };

            console.log("✅ ip-api location result:", locationResult);
            return locationResult;
          }
        } else {
          console.log("❌ ip-api.com failed:", response.data.message);
        }
      } catch (error) {
        console.log("❌ ip-api.com failed:", error.message);
      }

      // ✅ IMPROVED: Try ipapi.co as another fallback
      try {
        console.log("🔍 Trying ipapi.co...");
        const response = await axios.get(
          `https://ipapi.co/${ipAddress}/json/`,
          {
            timeout: 8000,
            headers: {
              "User-Agent": "CompassPointHealth-PRMS/2.1.0",
            },
          }
        );

        console.log("✅ ipapi.co response:", response.data);

        if (response.data && !response.data.error) {
          const data = response.data;

          const hasValidCity =
            data.city &&
            data.city !== "undefined" &&
            data.city !== "" &&
            !data.city.includes("N/A");

          const hasValidRegion =
            data.region && data.region !== "undefined" && data.region !== "";

          if (hasValidCity || hasValidRegion) {
            const locationResult = {
              type: "ip",
              ipAddress: ipAddress,
              isPrivate: false,
              city: hasValidCity ? data.city : "Unknown",
              region: hasValidRegion ? data.region : "Unknown",
              country: data.country_name || "Unknown",
              countryCode: data.country_code,
              latitude: data.latitude,
              longitude: data.longitude,
              timezone: data.timezone,
              org: data.org,
              accuracy: "medium",
              source: "ipapi_co",
              timestamp: new Date().toISOString(),
            };

            console.log("✅ ipapi.co location result:", locationResult);
            return locationResult;
          }
        }
      } catch (error) {
        console.log("❌ ipapi.co failed:", error.message);
      }

      // ✅ IMPROVED: Final fallback with ISP info if available
      console.log(
        "⚠️ All geolocation services failed, using enhanced fallback"
      );

      // Try to get at least ISP info from a simple service
      let ispInfo = null;
      try {
        const response = await axios.get(`https://httpbin.org/ip`, {
          timeout: 3000,
        });
        if (response.data?.origin) {
          ispInfo = `Connection from ${response.data.origin}`;
        }
      } catch (error) {
        console.log("ISP lookup also failed");
      }

      return {
        type: "ip",
        ipAddress: ipAddress,
        isPrivate: false,
        city: "Location Unavailable",
        region: "Unknown Region",
        country: "Unknown Country",
        accuracy: "low",
        source: "fallback",
        error: "All geolocation services failed",
        isp: ispInfo,
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
   * ✅ IMPROVED: Format location for SMS alert message
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
        // ✅ IMPROVED: Better location message formatting
        const hasSpecificCity =
          locationData.city &&
          locationData.city !== "Unknown" &&
          locationData.city !== "Location Unavailable" &&
          locationData.city !== "Location Error";

        const hasSpecificRegion =
          locationData.region &&
          locationData.region !== "Unknown" &&
          locationData.region !== "Unknown Region";

        if (hasSpecificCity && hasSpecificRegion) {
          return `🚨 SECURITY ALERT: Someone in the ${locationData.city}, ${locationData.region} area just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. Location determined from internet connection. If this was not authorized, please contact medical staff immediately.`;
        } else if (hasSpecificCity) {
          return `🚨 SECURITY ALERT: Someone in the ${locationData.city} area just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. Location determined from internet connection. If this was not authorized, please contact medical staff immediately.`;
        } else {
          return `🚨 SECURITY ALERT: Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. Location could not be determined from internet connection. If this was not authorized, please contact medical staff immediately.`;
        }
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
