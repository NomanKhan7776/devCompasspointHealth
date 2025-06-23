import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "../../../hooks/useAdmin.js"; 
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const AdminContainers = () => {
  const { containers, loading, error, fetchContainers, lastFetched } =
    useAdmin();

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredContainers, setFilteredContainers] = useState([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12; // Fixed items per page
  const [totalPages, setTotalPages] = useState(1);

  // Natural sort function for proper numeric sequence
  const naturalSort = (a, b) => {
    // Extract prefix and number parts
    const aMatch = a.match(/^(.+?)(\d+)$/);
    const bMatch = b.match(/^(.+?)(\d+)$/);

    if (aMatch && bMatch) {
      const [, aPrefixA, aNumberA] = aMatch;
      const [, aPrefixB, aNumberB] = bMatch;
      
      // If prefixes are the same, sort by number
      if (aPrefixA === aPrefixB) {
        return parseInt(aNumberA, 10) - parseInt(aNumberB, 10);
      }
    }
    
    // Fallback to alphabetical sorting
    return a.localeCompare(b, undefined, { 
      numeric: true, 
      sensitivity: 'base' 
    });
  };

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  // Update filtered containers when containers or search term changes with proper sorting
  useEffect(() => {
    let filtered = [...containers]; // Create a copy to avoid mutating original
    
    // Apply search filter if search term exists
    if (searchTerm.trim() !== "") {
      filtered = filtered.filter((container) =>
        container.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Always sort the containers in natural order
    filtered.sort(naturalSort);
    
    setFilteredContainers(filtered);
    
    // Update pagination
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
    
    // Reset to first page if current page is beyond available pages
    if (currentPage > Math.ceil(filtered.length / itemsPerPage)) {
      setCurrentPage(1);
    }
  }, [containers, searchTerm, currentPage]);

  // Handle search input changes
  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    // Reset to first page when search changes
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    fetchContainers(true); // Force refresh
  };

  // Get current page items
  const getCurrentItems = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredContainers.slice(startIndex, endIndex);
  };

  if (loading.containers && containers.length === 0)
    return <Loader size="large" />;
  if (error.containers)
    return <Alert message={error.containers} type="error" />;

  return (
    <div className="container mx-auto px-2 sm:px-0">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          Container Management (Admin)
        </h1>

        <div className="flex items-center">
          {lastFetched.containers && (
            <span className="text-xs text-gray-500 mr-2">
              Last updated:{" "}
              {new Date(lastFetched.containers).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 px-3 rounded flex items-center disabled:opacity-50 transition-colors duration-200"
            disabled={loading.containers}
          >
            <svg
              className={`w-3 h-3 sm:w-4 sm:h-4 mr-1 ${loading.containers ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">Sync</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4 sm:mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search containers..."
            value={searchTerm}
            onChange={handleSearch}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          />
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
        
        {/* Results Summary */}
        {filteredContainers.length > 0 && (
          <div className="mt-2">
            <p className="text-xs sm:text-sm text-gray-600">
              Showing {getCurrentItems().length} of {filteredContainers.length} containers
              {searchTerm && ` matching "${searchTerm}"`}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">
          All Storage Containers
        </h2>

        {filteredContainers.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-gray-600 mt-2">
              {searchTerm ? `No containers match "${searchTerm}"` : "No containers found"}
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {getCurrentItems().map((containerName) => (
                <div
                  key={containerName}
                  className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <div className="flex-shrink-0 mr-3">
                        <svg 
                          className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 group-hover:text-blue-600 transition-colors duration-200" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" 
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-medium text-gray-800 mb-1 sm:mb-2 group-hover:text-blue-600 transition-colors duration-200 truncate">
                          {containerName}
                        </h3>
                        <Link
                          to={`/admin/containers/${containerName}`}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm sm:text-base inline-flex items-center group/link"
                        >
                          View Patient Folders
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 ml-1 group-hover/link:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <nav className="flex items-center">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 sm:px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 mr-2"
                  >
                    Previous
                  </button>
                  
                  <div className="flex space-x-1">
                    {totalPages <= 7 ? (
                      // Show all page numbers if 7 or fewer pages
                      [...Array(totalPages).keys()].map(num => (
                        <button
                          key={num + 1}
                          onClick={() => setCurrentPage(num + 1)}
                          className={`px-3 py-1 rounded-md ${
                            currentPage === num + 1
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {num + 1}
                        </button>
                      ))
                    ) : (
                      // Show limited page numbers with ellipsis for many pages
                      <>
                        {/* First page */}
                        <button
                          onClick={() => setCurrentPage(1)}
                          className={`px-3 py-1 rounded-md ${
                            currentPage === 1
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          1
                        </button>
                        
                        {/* Ellipsis or page 2 */}
                        {currentPage > 3 && (
                          <span className="px-3 py-1">...</span>
                        )}
                        
                        {/* Pages around current page */}
                        {[...Array(5).keys()]
                          .map(num => currentPage - 2 + num)
                          .filter(num => num > 1 && num < totalPages)
                          .map(num => (
                            <button
                              key={num}
                              onClick={() => setCurrentPage(num)}
                              className={`px-3 py-1 rounded-md ${
                                currentPage === num
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {num}
                            </button>
                          ))
                        }
                        
                        {/* Ellipsis or second-to-last page */}
                        {currentPage < totalPages - 2 && (
                          <span className="px-3 py-1">...</span>
                        )}
                        
                        {/* Last page */}
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`px-3 py-1 rounded-md ${
                            currentPage === totalPages
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 sm:px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 ml-2"
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminContainers;