import React, { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const SmartTokenLogs = () => {
  const {
    smartTokenLogs,
    smartTokenLogsPagination,
    loading,
    error,
    fetchSmartTokenLogs,
  } = useAdmin();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    fetchSmartTokenLogs(currentPage, pageSize);
  }, [currentPage, pageSize, fetchSmartTokenLogs]);

  // Safety check for pagination data
  const safeLogsPagination = smartTokenLogsPagination || {
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 50,
  };

  const safeLogs = smartTokenLogs || [];

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const handleRefresh = () => {
    fetchSmartTokenLogs(currentPage, pageSize, true); // Force refresh
  };

  const truncateId = (tokenId) => {
    if (!tokenId || tokenId.length < 16) return tokenId;
    return `${tokenId.substring(0, 8)}...${tokenId.substring(
      tokenId.length - 8
    )}`;
  };

  const getAccessModeColor = (mode) => {
    switch (mode) {
      case "online":
        return "text-green-600 bg-green-100";
      case "offline":
        return "text-yellow-600 bg-yellow-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getTokenStatusColor = (status) => {
    switch (status) {
      case "assigned":
        return "text-green-600 bg-green-100";
      case "revoked":
        return "text-red-600 bg-red-100";
      case "unclaimed":
        return "text-yellow-600 bg-yellow-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const renderPaginationButton = (
    page,
    text = null,
    disabled = false,
    keyPrefix = ""
  ) => (
    <button
      key={`${keyPrefix}${page}`}
      onClick={() => !disabled && handlePageChange(page)}
      disabled={disabled}
      className={`px-3 py-2 text-sm font-medium border ${
        page === currentPage
          ? "bg-blue-600 text-white border-blue-600"
          : disabled
          ? "bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
      } first:rounded-l-md last:rounded-r-md`}
    >
      {text || page}
    </button>
  );

  const renderPagination = () => {
    const { currentPage: activePage, totalPages } = safeLogsPagination;
    const pages = [];

    // Previous button
    pages.push(
      renderPaginationButton(
        activePage - 1,
        "Previous",
        activePage === 1,
        "prev-"
      )
    );

    // Page numbers
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(renderPaginationButton(i, null, false, "page-"));
      }
    } else {
      // Show condensed pagination for more than 7 pages
      pages.push(renderPaginationButton(1, null, false, "page-"));

      if (activePage > 4) {
        pages.push(
          <span key="ellipsis1" className="px-3 py-2 text-gray-500">
            ...
          </span>
        );
      }

      const start = Math.max(2, activePage - 2);
      const end = Math.min(totalPages - 1, activePage + 2);

      for (let i = start; i <= end; i++) {
        pages.push(renderPaginationButton(i, null, false, "page-"));
      }

      if (activePage < totalPages - 3) {
        pages.push(
          <span key="ellipsis2" className="px-3 py-2 text-gray-500">
            ...
          </span>
        );
      }

      if (totalPages > 1) {
        pages.push(renderPaginationButton(totalPages, null, false, "page-"));
      }
    }

    // Next button
    pages.push(
      renderPaginationButton(
        activePage + 1,
        "Next",
        activePage === totalPages,
        "next-"
      )
    );

    return pages;
  };

  if (loading.smartTokenLogs) return <Loader size="large" />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          SmartToken Access Logs
        </h1>

        <div className="flex items-center space-x-4">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={loading.smartTokenLogs}
            className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              loading.smartTokenLogs ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <svg
              className={`h-4 w-4 mr-2 ${
                loading.smartTokenLogs ? "animate-spin" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {loading.smartTokenLogs ? "Refreshing..." : "Refresh"}
          </button>

          {/* Page Size Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-600">entries</span>
          </div>
        </div>
      </div>

      {error.smartTokenLogs && (
        <Alert message={error.smartTokenLogs} type="error" />
      )}

      {/* Summary Info */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {safeLogs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{" "}
        {Math.min(currentPage * pageSize, safeLogsPagination.totalCount)} of{" "}
        {safeLogsPagination.totalCount} entries
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        {safeLogs.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                  Token ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/8">
                  IP Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/8">
                  Access Mode
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/8">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                  Access Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {safeLogs.map((log, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 truncate">
                    <span className="font-mono text-xs">
                      {truncateId(log.tokenId)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 truncate">
                    {log.patientName || "Unknown"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate">
                    {log.containerName}/{log.folderName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate">
                    {log.ipAddress}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getAccessModeColor(
                        log.accessMode
                      )}`}
                    >
                      {log.accessMode}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getTokenStatusColor(
                        log.tokenStatus
                      )}`}
                    >
                      {log.tokenStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(log.accessTime).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No SmartToken access logs found
          </div>
        )}
      </div>

      {/* Pagination */}
      {safeLogsPagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {safeLogsPagination.currentPage} of{" "}
            {safeLogsPagination.totalPages}
          </div>
          <div className="flex items-center space-x-1">
            {renderPagination()}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartTokenLogs;
