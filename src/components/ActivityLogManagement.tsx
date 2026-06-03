import { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { ActivityLog, ActivityLogFilter, ActivityAction, ActivityModule } from '../types';
import { subscribeToActivityLogs, getActivityStats } from '../services/activityLogService';
import { useAuth } from '../contexts/AuthContext';

export default function ActivityLogManagement() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<ActivityAction | ''>('');
  const [moduleFilter, setModuleFilter] = useState<ActivityModule | ''>('');
  const [statusFilter, setStatusFilter] = useState<'success' | 'failure' | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Stats
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      alert('Access denied. Only admins can view activity logs.');
      window.history.back();
    }
  }, [user]);

  // Subscribe to real-time logs
  useEffect(() => {
    if (user?.role !== 'admin') return;

    setLoading(true);
    
    const filter: ActivityLogFilter = {};
    if (userIdFilter) filter.userId = userIdFilter;
    if (actionFilter) filter.action = actionFilter as ActivityAction;
    if (moduleFilter) filter.module = moduleFilter as ActivityModule;
    if (statusFilter) filter.status = statusFilter;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    if (searchTerm) filter.searchTerm = searchTerm;

    const unsubscribe = subscribeToActivityLogs(
      (fetchedLogs) => {
        setLogs(fetchedLogs);
        setLoading(false);
      },
      filter,
      1000,
      (error) => {
        console.error('Error loading logs:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, userIdFilter, actionFilter, moduleFilter, statusFilter, startDate, endDate, searchTerm]);

  // Load stats
  useEffect(() => {
    if (user?.role === 'admin') {
      loadStats();
    }
  }, [user]);

  // Update stats whenever logs change
  useEffect(() => {
    if (logs.length > 0) {
      updateStatsFromLogs();
    }
  }, [logs]);

  const updateStatsFromLogs = () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Filter logs from last 7 days
    const recentLogs = logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= sevenDaysAgo;
    });

    // Calculate stats
    const successCount = recentLogs.filter(l => l.status === 'success').length;
    const failureCount = recentLogs.filter(l => l.status === 'failure').length;
    
    // Count unique users
    const uniqueUsers = new Set(recentLogs.map(l => l.userId));

    setStats({
      totalActivities: recentLogs.length,
      successCount,
      failureCount,
      topUsers: Array.from(uniqueUsers).map(userId => {
        const userLogs = recentLogs.filter(l => l.userId === userId);
        return {
          userId,
          userName: userLogs[0]?.userName || 'Unknown',
          count: userLogs.length
        };
      }).sort((a, b) => b.count - a.count).slice(0, 10)
    });
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const activityStats = await getActivityStats(7);
      setStats(activityStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleApplyFilters = () => {
    // Filters are automatically applied via useEffect
  };

  const handleClearFilters = () => {
    setUserIdFilter('');
    setActionFilter('');
    setModuleFilter('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };

  const handleViewDetails = (log: ActivityLog) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  const handlePrintLogs = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Activity Logs Report</title>
          <style>
            @media print {
              @page { margin: 1cm; size: A4 landscape; }
              body { margin: 0; padding: 10px; }
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              font-size: 10px;
              color: #000;
              background: #fff;
            }
            h1 {
              text-align: center;
              font-size: 18px;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #000;
              padding: 6px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
              font-size: 9px;
            }
            td {
              font-size: 8px;
            }
            .footer {
              margin-top: 20px;
              text-align: center;
              font-size: 9px;
            }
            .footer-right {
              margin-top: 30px;
              text-align: right;
              font-size: 8px;
              color: #404040;
            }
          </style>
        </head>
        <body>
          <h1>Activity Logs Report</h1>
          <p style="text-align: center; margin-bottom: 10px;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Description</th>
                <th>Status</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td>${new Date(log.timestamp).toLocaleString()}</td>
                  <td>${log.userName}</td>
                  <td>${log.action.toUpperCase()}</td>
                  <td>${log.module}</td>
                  <td>${log.description}</td>
                  <td>${log.status}</td>
                  <td>${log.ipAddress || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            <p>Recycle Business Manager - Activity Log System</p>
          </div>
          <div class="footer-right">
            <p>2025 © All rights reserved with Sentiment AI</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    iframe.contentWindow?.addEventListener('afterprint', () => {
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 100);
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionBadgeColor = (action: ActivityAction) => {
    const colors: Record<ActivityAction, string> = {
      login: 'bg-green-100 text-green-800',
      logout: 'bg-gray-100 text-gray-800',
      create: 'bg-blue-100 text-blue-800',
      update: 'bg-yellow-100 text-yellow-800',
      delete: 'bg-red-100 text-red-800',
      view: 'bg-purple-100 text-purple-800',
      approve: 'bg-teal-100 text-teal-800',
      reject: 'bg-orange-100 text-orange-800',
      export: 'bg-indigo-100 text-indigo-800',
      import: 'bg-pink-100 text-pink-800',
      configure: 'bg-cyan-100 text-cyan-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadgeColor = (status: 'success' | 'failure') => {
    return status === 'success' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">User Activity Tracking</h1>
        <p className="text-gray-600">Monitor all user activities across the system</p>
      </div>

      {/* Statistics Cards */}
      {stats && !statsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Total Activities (7d)</div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalActivities}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Successful</div>
            <div className="text-2xl font-bold text-green-600">{stats.successCount}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failureCount}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Active Users</div>
            <div className="text-2xl font-bold text-blue-600">{stats.topUsers.length}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search logs..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as ActivityAction | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="view">View</option>
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
              <option value="export">Export</option>
              <option value="import">Import</option>
              <option value="configure">Configure</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Module</label>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value as ActivityModule | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Modules</option>
              <option value="authentication">Authentication</option>
              <option value="users">Users</option>
              <option value="shipments">Shipments</option>
              <option value="inventory">Inventory</option>
              <option value="processing">Processing</option>
              <option value="customers">Customers</option>
              <option value="suppliers">Suppliers</option>
              <option value="invoices">Invoices</option>
              <option value="delivery-notes">Delivery Notes</option>
              <option value="debit-credit-notes">Debit/Credit Notes</option>
              <option value="transactions">Transactions</option>
              <option value="ledgers">Ledgers</option>
              <option value="reports">Reports</option>
              <option value="settings">Settings</option>
              <option value="database">Database</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'success' | 'failure' | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleApplyFilters}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClearFilters}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Clear Filters
          </button>
          <button
            onClick={() => loadStats()}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
          >
            Refresh Stats
          </button>
        </div>
      </div>

      {/* Activity Logs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Activity Logs ({logs.length})</h2>
          <button
            onClick={handlePrintLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No activity logs found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="font-medium text-gray-900">{log.userName}</div>
                      <div className="text-gray-500 text-xs">{log.userRole}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {log.module}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-md truncate">
                      {log.description}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleViewDetails(log)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-semibold">Activity Log Details</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">User</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedLog.userName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">User ID</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedLog.userId}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Role</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedLog.userRole}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Timestamp</label>
                  <p className="mt-1 text-sm text-gray-900">{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Action</label>
                  <p className="mt-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeColor(selectedLog.action)}`}>
                      {selectedLog.action}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Module</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedLog.module}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Status</label>
                  <p className="mt-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(selectedLog.status)}`}>
                      {selectedLog.status}
                    </span>
                  </p>
                </div>
                {selectedLog.duration && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500">Duration</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.duration}ms</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500">Description</label>
                <p className="mt-1 text-sm text-gray-900">{selectedLog.description}</p>
              </div>

              {selectedLog.errorMessage && (
                <div>
                  <label className="block text-sm font-medium text-red-500">Error Message</label>
                  <p className="mt-1 text-sm text-red-700 bg-red-50 p-2 rounded">{selectedLog.errorMessage}</p>
                </div>
              )}

              {selectedLog.details && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Additional Details</label>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    {selectedLog.details.itemId && (
                      <div className="flex items-start">
                        <span className="text-sm font-medium text-gray-700 w-32">Item ID:</span>
                        <span className="text-sm text-gray-900">{selectedLog.details.itemId}</span>
                      </div>
                    )}
                    {selectedLog.details.itemName && (
                      <div className="flex items-start">
                        <span className="text-sm font-medium text-gray-700 w-32">Item Name:</span>
                        <span className="text-sm text-gray-900">{selectedLog.details.itemName}</span>
                      </div>
                    )}
                    {selectedLog.details.previousValue !== undefined && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 block mb-2">Previous Value:</span>
                        <div className="bg-white p-3 rounded border border-gray-200">
                          {typeof selectedLog.details.previousValue === 'object' ? (
                            <div className="space-y-1">
                              {Object.entries(selectedLog.details.previousValue).map(([key, value]) => {
                                // Format timestamps
                                if ((key === 'createdAt' || key === 'updatedAt') && typeof value === 'object' && value !== null && 'seconds' in value) {
                                  const timestamp = new Date((value as any).seconds * 1000);
                                  return (
                                    <div key={key} className="flex items-start py-1">
                                      <span className="text-xs font-medium text-gray-600 w-40">{key}:</span>
                                      <span className="text-xs text-gray-800 flex-1">{timestamp.toLocaleString()}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={key} className="flex items-start py-1">
                                    <span className="text-xs font-medium text-gray-600 w-40">{key}:</span>
                                    <span className="text-xs text-gray-800 flex-1">
                                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-800">{String(selectedLog.details.previousValue)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedLog.details.newValue !== undefined && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 block mb-2">New Value:</span>
                        <div className="bg-white p-3 rounded border border-gray-200">
                          {typeof selectedLog.details.newValue === 'object' ? (
                            <div className="space-y-1">
                              {Object.entries(selectedLog.details.newValue).map(([key, value]) => {
                                // Format timestamps
                                if ((key === 'createdAt' || key === 'updatedAt') && typeof value === 'object' && value !== null && 'seconds' in value) {
                                  const timestamp = new Date((value as any).seconds * 1000);
                                  return (
                                    <div key={key} className="flex items-start py-1">
                                      <span className="text-xs font-medium text-gray-600 w-40">{key}:</span>
                                      <span className="text-xs text-gray-800 flex-1">{timestamp.toLocaleString()}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={key} className="flex items-start py-1">
                                    <span className="text-xs font-medium text-gray-600 w-40">{key}:</span>
                                    <span className="text-xs text-gray-800 flex-1">
                                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-800">{String(selectedLog.details.newValue)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedLog.details.additionalInfo && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 block mb-2">Additional Information:</span>
                        <div className="bg-white p-3 rounded border border-gray-200">
                          {typeof selectedLog.details.additionalInfo === 'object' ? (
                            <div className="space-y-1">
                              {Object.entries(selectedLog.details.additionalInfo).map(([key, value]) => {
                                // Format timestamps
                                if ((key === 'createdAt' || key === 'updatedAt') && typeof value === 'object' && value !== null && 'seconds' in value) {
                                  const timestamp = new Date((value as any).seconds * 1000);
                                  return (
                                    <div key={key} className="flex items-start py-1">
                                      <span className="text-xs font-medium text-gray-600 w-40">{key}:</span>
                                      <span className="text-xs text-gray-800 flex-1">{timestamp.toLocaleString()}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={key} className="flex items-start py-1">
                                    <span className="text-xs font-medium text-gray-600 w-40">{key}:</span>
                                    <span className="text-xs text-gray-800 flex-1">
                                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-800">{String(selectedLog.details.additionalInfo)}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedLog.ipAddress && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500">IP Address</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.ipAddress}</p>
                  </div>
                )}
                {selectedLog.userAgent && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-500">User Agent</label>
                    <p className="mt-1 text-xs text-gray-900 break-all">{selectedLog.userAgent}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end sticky bottom-0 bg-white">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
