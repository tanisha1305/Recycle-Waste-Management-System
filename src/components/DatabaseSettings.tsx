import { useState } from 'react';
import { Database, Trash2, FileUp, AlertTriangle, CheckCircle, XCircle, UserX } from 'lucide-react';
import { clearDatabase, addMockData, cleanupOldDemoUsers } from '../services/databaseService';

export default function DatabaseSettings() {
  const [isClearing, setIsClearing] = useState(false);
  const [isAddingMock, setIsAddingMock] = useState(false);
  const [isCleaningUsers, setIsCleaningUsers] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMockConfirm, setShowMockConfirm] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleClearDatabase = async () => {
    setIsClearing(true);
    setMessage(null);
    try {
      await clearDatabase();
      setMessage({ type: 'success', text: 'Database cleared successfully! All data has been removed.' });
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Error clearing database:', error);
      setMessage({ type: 'error', text: 'Failed to clear database. Please try again.' });
    } finally {
      setIsClearing(false);
    }
  };

  const handleAddMockData = async () => {
    setIsAddingMock(true);
    setMessage(null);
    try {
      await addMockData();
      setMessage({ type: 'success', text: 'Mock data added successfully! Sample data has been populated.' });
      setShowMockConfirm(false);
    } catch (error) {
      console.error('Error adding mock data:', error);
      setMessage({ type: 'error', text: 'Failed to add mock data. Please try again.' });
    } finally {
      setIsAddingMock(false);
    }
  };

  const handleCleanupOldUsers = async () => {
    setIsCleaningUsers(true);
    setMessage(null);
    try {
      await cleanupOldDemoUsers();
      setMessage({ type: 'success', text: 'Old demo users removed successfully!' });
      setShowCleanupConfirm(false);
    } catch (error) {
      console.error('Error cleaning up users:', error);
      setMessage({ type: 'error', text: 'Failed to cleanup old users. Please try again.' });
    } finally {
      setIsCleaningUsers(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Database Settings</h1>
        </div>
        <p className="text-gray-600">
          Manage your database by clearing all data or adding sample mock data for testing purposes.
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <p className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {message.text}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Clear Database Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Clear Database</h2>
              <p className="text-gray-600 mb-4">
                Remove all data from the database. This action will delete all shipments, inventory items, 
                customers, suppliers, invoices, transactions, and other records. This action cannot be undone.
              </p>
              
              {!showClearConfirm ? (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All Data
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-900 mb-1">Are you absolutely sure?</p>
                      <p className="text-sm text-red-800">
                        This will permanently delete all data from your database. This action cannot be undone.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleClearDatabase}
                      disabled={isClearing}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isClearing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Clearing...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Yes, Clear Database
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      disabled={isClearing}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Add Mock Data Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileUp className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Add Mock Data</h2>
              <p className="text-gray-600 mb-4">
                Populate the database with sample data for testing and demonstration purposes. This includes 
                suppliers, customers, inventory items, shipments, transactions, and more.
              </p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-900">
                  <strong>Note:</strong> Mock data will be added to existing data. If you want a fresh start, 
                  clear the database first, then add mock data.
                </p>
              </div>
              
              {!showMockConfirm ? (
                <button
                  onClick={() => setShowMockConfirm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                >
                  <FileUp className="w-4 h-4" />
                  Add Sample Data
                </button>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">Confirm Action</p>
                      <p className="text-sm text-blue-800">
                        This will add sample data to your database including suppliers, customers, inventory items, 
                        shipments, and transactions. Are you sure you want to proceed?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleAddMockData}
                      disabled={isAddingMock}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isAddingMock ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Adding Data...
                        </>
                      ) : (
                        <>
                          <FileUp className="w-4 h-4" />
                          Yes, Add Mock Data
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowMockConfirm(false)}
                      disabled={isAddingMock}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Information Section */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-2">Important Information:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Only administrators can access these database management features</li>
                <li>Always backup your data before performing database operations</li>
                <li>Clearing the database is permanent and cannot be undone</li>
                <li>Mock data is useful for testing and demonstrations</li>
                <li>Consider clearing the database before adding mock data for a clean state</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
