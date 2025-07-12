import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { assignmentsAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import Button from "../../common/Button";

const AdminFolders = () => {
  const { containerName } = useParams();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredFolders, setFilteredFolders] = useState([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchAllFolders = async () => {
      try {
        setLoading(true);
        const res = await assignmentsAPI.getFolders(containerName);
        
        // Sort folders in numeric sequence
        const sortedFolders = [...res.data.folders].sort((a, b) => {
          // Extract numbers from folder names
          const numA = parseInt(a.replace(/\D/g, ''));
          const numB = parseInt(b.replace(/\D/g, ''));
          return numA - numB;
        });
        
        setFolders(sortedFolders);
        setFilteredFolders(sortedFolders);
        setTotalPages(Math.ceil(sortedFolders.length / itemsPerPage));
      } catch (err) {
        setError("Failed to load folders");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllFolders();
  }, [containerName, itemsPerPage]);

  // Handle search input changes
  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    if (term.trim() === "") {
      setFilteredFolders(folders);
    } else {
      const filtered = folders.filter(folder => 
        folder.toLowerCase().includes(term.toLowerCase())
      );
      setFilteredFolders(filtered);
    }
    
    // Reset to first page when search changes
    setCurrentPage(1);
    setTotalPages(Math.ceil(
      (term.trim() === "" ? folders.length : filteredFolders.length) / itemsPerPage
    ));
  };
  
  // Change page
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };
  
  // Get current page items
  const getCurrentItems = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFolders.slice(startIndex, endIndex);
  };

  if (loading) return <Loader size="large" />;
  if (error) return <Alert message={error} type="error" />;

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to="/admin/containers" className="text-blue-600 hover:text-blue-800 mr-2">
          ← Back to Containers
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {containerName}
        </h1>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search patient folders..."
            value={searchTerm}
            onChange={handleSearch}
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Patient Folders</h2>
        
        {filteredFolders.length === 0 ? (
          <p className="text-gray-600">No folders match your search.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {getCurrentItems().map((folderName) => (
                <Link
                  key={folderName}
                  to={`/admin/containers/${containerName}/folders/${folderName}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                    </svg>
                    <h3 className="text-md font-medium text-gray-800">
                      {folderName}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600">
                    View patient data →
                  </p>
                </Link>
              ))}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <nav className="flex items-center">
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    color="gray"
                    className="mr-2"
                  >
                    Previous
                  </Button>
                  
                  <div className="flex space-x-1">
                    {totalPages <= 7 ? (
                      // Show all page numbers if 7 or fewer pages
                      [...Array(totalPages).keys()].map(num => (
                        <button
                          key={num + 1}
                          onClick={() => handlePageChange(num + 1)}
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
                          onClick={() => handlePageChange(1)}
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
                              onClick={() => handlePageChange(num)}
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
                          onClick={() => handlePageChange(totalPages)}
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
                  
                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    color="gray"
                    className="ml-2"
                  >
                    Next
                  </Button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminFolders;