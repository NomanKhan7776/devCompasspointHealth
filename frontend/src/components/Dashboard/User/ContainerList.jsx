import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { assignmentsAPI } from '../../../api';
import Loader from '../../common/Loader';
import Alert from '../../common/Alert';

const ContainerList = () => {
  const { containerName } = useParams();
  const [container, setContainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        setLoading(true);
        const res = await assignmentsAPI.getMyAssignments();
        const foundContainer = res.data.assignments.find(
          c => c.containerName === containerName
        );
        
        if (foundContainer) {
          setContainer(foundContainer);
        } else {
          setError('Container not found or not assigned to you');
        }
      } catch (err) {
        setError('Failed to load container data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignments();
  }, [containerName]);

  if (loading) return <Loader size="large" />;
  if (error) return <Alert message={error} type="error" />;
  if (!container) return <Alert message="Container not found" type="error" />;

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to="/my-assignments" className="text-blue-600 hover:text-blue-800 mr-2">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {container.containerName}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Patient Folders</h2>
        
        {container.folders.length === 0 ? (
          <p className="text-gray-600">No folders assigned in this container.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {container.folders.map((folder) => (
              <Link
                key={folder.id}
                to={`/containers/${containerName}/folders/${folder.folderName}`}
                className="block border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                  </svg>
                  <h3 className="text-md font-medium text-gray-800">
                    {folder.folderName}
                  </h3>
                </div>
                <p className="text-sm text-gray-600">
                  View patient data →
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContainerList;