// services/locationService.js - Location Service for GPS and IP Geolocation
const axios = require("axios");

class LocationService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    console.log(
      this.googleMapsApiKey
        ? "✅ Google Maps API configured"
        : "⚠️ Google Maps API not configured - will use fallback services"
    );
  }

  /**
   * Get location from GPS coordinates with Google Maps reverse geocoding
   * @param {number} latitude - GPS latitude
   * @param {number} longitude - GPS longitude
   * @returns {Object} Location information
   */
  async getLocationFromGPS(latitude, longitude) {
    try {
      // Validate coordinates
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
   * Reverse geocode GPS coordinates to human-readable address
   * @param {number} latitude - GPS latitude
   * @param {number} longitude - GPS longitude
   * @returns {string} Human-readable address
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
   * Get location from IP address using multiple services
   * @param {string} ipAddress - IP address to lookup
   * @returns {Object} Location information
   */
  async getLocationFromIP(ipAddress) {
    try {
      // Check if IP is private/local
      if (this.isPrivateIP(ipAddress)) {
        return {
          type: "ip",
          ipAddress: ipAddress,
          isPrivate: true,
          city: "Local Network",
          region: "Private",
          country: "Unknown",
          accuracy: "low",
          source: "ip_private",
          timestamp: new Date().toISOString(),
        };
      }

      // Try ip-api.com (free, good accuracy)
      try {
        const response = await axios.get(
          `http://ip-api.com/json/${ipAddress}`,
          {
            params: {
              fields:
                "status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp",
            },
            timeout: 5000,
          }
        );

        if (response.data.status === "success") {
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
        console.log("ip-api.com lookup failed, trying fallback...");
      }

      // Fallback to ipinfo.io (free tier with limits)
      try {
        const response = await axios.get(
          `https://ipinfo.io/${ipAddress}/json`,
          {
            timeout: 5000,
            headers: {
              Authorization: process.env.IPINFO_TOKEN
                ? `Bearer ${process.env.IPINFO_TOKEN}`
                : undefined,
            },
          }
        );

        if (response.data && response.data.city) {
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
            accuracy: "medium",
            source: "ipinfo",
            timestamp: new Date().toISOString(),
          };
        }
      } catch (error) {
        console.log("ipinfo.io lookup failed, trying final fallback...");
      }

      // Final fallback - basic geolocation
      return {
        type: "ip",
        ipAddress: ipAddress,
        isPrivate: false,
        city: "Unknown",
        region: "Unknown",
        country: "Unknown",
        accuracy: "low",
        source: "fallback",
        error: "Location services unavailable",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("IP location lookup error:", error);
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
   * Format location for SMS alert message
   * @param {Object} locationData - Location data object
   * @param {string} patientName - Patient name
   * @param {string} deviceType - Device type (mobile/desktop)
   * @returns {string} Formatted alert message
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
      } else if (locationData.city && locationData.city !== "Unknown") {
        return `Someone in the ${locationData.city}, ${locationData.region} area just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}. Location determined from internet connection.`;
      } else {
        return `Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
      }
    }

    return `Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceType}.`;
  }

  /**
   * Get comprehensive location data (try GPS first, fallback to IP)
   * @param {Object} request - Express request object
   * @param {Object} gpsCoordinates - Optional GPS coordinates from client
   * @returns {Object} Best available location information
   */
  async getComprehensiveLocation(request, gpsCoordinates = null) {
    let primaryLocation = null;
    let fallbackLocation = null;

    // Try GPS first if available
    if (gpsCoordinates && gpsCoordinates.latitude && gpsCoordinates.longitude) {
      try {
        primaryLocation = await this.getLocationFromGPS(
          gpsCoordinates.latitude,
          gpsCoordinates.longitude
        );
        primaryLocation.priority = "primary";
      } catch (error) {
        console.error("GPS location failed:", error);
      }
    }

    // Get IP-based location as fallback or primary
    try {
      const ipAddress = this.extractIPAddress(request);
      fallbackLocation = await this.getLocationFromIP(ipAddress);
      fallbackLocation.priority = primaryLocation ? "fallback" : "primary";
    } catch (error) {
      console.error("IP location failed:", error);
    }

    return {
      primary: primaryLocation,
      fallback: fallbackLocation,
      best: primaryLocation || fallbackLocation,
      hasGPS: !!primaryLocation,
      hasIP: !!fallbackLocation,
    };
  }

  /**
   * Extract IP address from request object
   * @param {Object} request - Express request object
   * @returns {string} IP address
   */
  extractIPAddress(request) {
    return (
      request.ip ||
      request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      request.headers["x-real-ip"] ||
      request.headers["cf-connecting-ip"] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Check if IP address is private/internal
   * @param {string} ip - IP address to check
   * @returns {boolean} True if IP is private
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
   * @param {number} latitude - Latitude value
   * @param {number} longitude - Longitude value
   * @returns {boolean} True if coordinates are valid
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
   * Calculate distance between two GPS coordinates (Haversine formula)
   * @param {number} lat1 - First latitude
   * @param {number} lon1 - First longitude
   * @param {number} lat2 - Second latitude
   * @param {number} lon2 - Second longitude
   * @returns {number} Distance in kilometers
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
   * @param {number} degrees - Degrees value
   * @returns {number} Radians value
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get service status
   * @returns {Object} Service configuration status
   */
  getServiceStatus() {
    return {
      googleMaps: !!this.googleMapsApiKey,
      ipinfo: !!process.env.IPINFO_TOKEN,
      services: {
        gps: "Google Maps API + OpenStreetMap fallback",
        ip: "ip-api.com + ipinfo.io fallback",
      },
    };
  }
}

// Create singleton instance
const locationService = new LocationService();

module.exports = locationService;
