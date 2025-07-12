import React, { useState, useEffect } from "react";
import { blobsAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        setLoading(true);
        const res = await blobsAPI.getAuditLogs();
        setLogs(res.data.auditLogs);
      } catch (err) {
        setError("Failed to load audit logs");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, []);

  if (loading) return <Loader size="large" />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Audit Logs</h1>

      {error && <Alert message={error} type="error" />}

      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        {logs.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                  Operation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/5">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 truncate">
                    {log.name} ({log.role})
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate">
                    {log.operation}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate">
                    {log.containerName}/{log.folderName}/{log.blobName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-500">
            No audit logs found
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
