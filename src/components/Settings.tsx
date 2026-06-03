import { useState } from 'react';
import { Settings as SettingsIcon, Database, Trash2, PlusCircle, AlertTriangle } from 'lucide-react';

export default function Settings() {
  const [isClearing, setIsClearing] = useState(false);
  const [isAddingMock, setIsAddingMock] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMockConfirm, setShowMockConfirm] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleClearDatabase = async () => {
    setIsClearing(true);
    setResult(null);
    setShowClearConfirm(false);

    try {
      const response = await fetch('http://localhost:3000/clear-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          type: 'success',
          message: `✅ Database cleared successfully! ${data.successCount} collections cleared.`,
        });
      } else {
        setResult({
          type: 'error',
          message: `❌ Error: ${data.error || 'Failed to clear database'}`,
        });
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: `❌ Error: ${error instanceof Error ? error.message : 'Failed to connect to server'}`,
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleAddMockData = async () => {
    setIsAddingMock(true);
    setResult(null);
    setShowMockConfirm(false);

    try {
      const response = await fetch('http://localhost:3000/add-mock-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          type: 'success',
          message: `✅ Mock data added successfully! ${data.successCount} entries created.`,
        });
      } else {
        setResult({
          type: 'error',
          message: `❌ Error: ${data.error || 'Failed to add mock data'}`,
        });
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: `❌ Error: ${error instanceof Error ? error.message : 'Failed to connect to server'}`,
      });
    } finally {
      setIsAddingMock(false);
    }
  };

  return (
    <div className="w-full">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-600 rounded-lg">
            <SettingsIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Database Settings</h1>
            <p className="text-gray-600">Manage your database and test data</p>
          </div>
        </div>

        {/* Result Message */}
        {result && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              result.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <p className="font-medium">{result.message}</p>
          </div>
        )}

        {/* Settings Cards */}
        <div className="space-y-6">
          {/* Clear Database Card */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Clear Database</h2>
                  <p className="text-gray-600 mb-4">
                    Remove all data from the database to prepare for production or start fresh. This action is
                    <span className="font-semibold text-red-600"> IRREVERSIBLE</span>.
                  </p>
                  
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-800">
                        <p className="font-semibold mb-1">Warning:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>All shipments, inventory, and transactions will be deleted</li>
                          <li>All customers, suppliers, and invoices will be removed</li>
                          <li>All user accounts and permissions will be cleared</li>
                          <li>This action cannot be undone</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {!showClearConfirm ? (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      disabled={isClearing || isAddingMock}
                      className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      Clear Database
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-red-600">
                        Are you absolutely sure? This will delete everything!
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleClearDatabase}
                          disabled={isClearing}
                          className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                        >
                          {isClearing ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Clearing...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-5 h-5" />
                              Yes, Clear All Data
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          disabled={isClearing}
                          className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Add Mock Data Card */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <PlusCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Add Mock Data</h2>
                  <p className="text-gray-600 mb-4">
                    Populate the database with sample test data for development and testing purposes.
                  </p>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-semibold mb-1">This will add:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Sample suppliers and customers</li>
                          <li>Sample shipments with processing stages</li>
                          <li>Sample invoices, delivery notes, and transactions</li>
                          <li>Test entries in each collection for development</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {!showMockConfirm ? (
                    <button
                      onClick={() => setShowMockConfirm(true)}
                      disabled={isClearing || isAddingMock}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                    >
                      <PlusCircle className="w-5 h-5" />
                      Add Mock Data
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-blue-600">
                        Add sample data to all collections?
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleAddMockData}
                          disabled={isAddingMock}
                          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                        >
                          {isAddingMock ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Adding Data...
                            </>
                          ) : (
                            <>
                              <PlusCircle className="w-5 h-5" />
                              Yes, Add Mock Data
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setShowMockConfirm(false)}
                          disabled={isAddingMock}
                          className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Usage Notes */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Important Notes:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Always backup your data before clearing the database</li>
                  <li>Mock data is for testing purposes only</li>
                  <li>These operations require admin permissions</li>
                  <li>A local server must be running to execute these actions</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
