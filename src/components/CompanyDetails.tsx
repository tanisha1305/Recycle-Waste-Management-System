import { useState, useEffect } from 'react';
import { Save, Building2 } from 'lucide-react';
import { CompanyDetails as CompanyDetailsType, subscribeToCompanyDetails, updateCompanyDetails } from '../services/companyService';
import { useAuth } from '../contexts/AuthContext';

export default function CompanyDetails() {
  const { user } = useAuth();
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsType>({
    id: 'company',
    companyPIN: '',
    companyName: '',
    address: '',
    mobile: '',
    email: '',
    updatedAt: new Date().toISOString()
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedDetails, setEditedDetails] = useState<CompanyDetailsType>(companyDetails);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToCompanyDetails(
      (details) => {
        setCompanyDetails(details);
        setEditedDetails(details);
      },
      (error) => {
        console.error('Error subscribing to company details:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!user) return;
    
    try {
      setSaving(true);
      await updateCompanyDetails(
        {
          companyPIN: editedDetails.companyPIN,
          companyName: editedDetails.companyName,
          address: editedDetails.address,
          mobile: editedDetails.mobile,
          email: editedDetails.email
        },
        user.fullName
      );
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving company details:', error);
      alert('Failed to save company details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedDetails(companyDetails);
    setIsEditing(false);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Building2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Company Details</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditing ? 'Edit company information' : 'View company information'}
            </p>
          </div>
        </div>
        
        {isAdmin && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors text-sm"
          >
            Edit
          </button>
        )}
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company PIN
          </label>
          <input
            type="text"
            value={isEditing ? editedDetails.companyPIN : companyDetails.companyPIN}
            onChange={(e) => setEditedDetails({ ...editedDetails, companyPIN: e.target.value })}
            disabled={!isEditing}
            className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 outline-none ${
              isEditing
                ? 'focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                : 'bg-gray-50 text-gray-600 cursor-not-allowed'
            }`}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Name
          </label>
          <input
            type="text"
            value={isEditing ? editedDetails.companyName : companyDetails.companyName}
            onChange={(e) => setEditedDetails({ ...editedDetails, companyName: e.target.value })}
            disabled={!isEditing}
            className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 outline-none ${
              isEditing
                ? 'focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                : 'bg-gray-50 text-gray-600 cursor-not-allowed'
            }`}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Address
          </label>
          <input
            type="text"
            value={isEditing ? editedDetails.address : companyDetails.address}
            onChange={(e) => setEditedDetails({ ...editedDetails, address: e.target.value })}
            disabled={!isEditing}
            className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 outline-none ${
              isEditing
                ? 'focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                : 'bg-gray-50 text-gray-600 cursor-not-allowed'
            }`}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mobile
          </label>
          <input
            type="text"
            value={isEditing ? editedDetails.mobile : companyDetails.mobile}
            onChange={(e) => setEditedDetails({ ...editedDetails, mobile: e.target.value })}
            disabled={!isEditing}
            className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 outline-none ${
              isEditing
                ? 'focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                : 'bg-gray-50 text-gray-600 cursor-not-allowed'
            }`}
          />
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={isEditing ? editedDetails.email : companyDetails.email}
            onChange={(e) => setEditedDetails({ ...editedDetails, email: e.target.value })}
            disabled={!isEditing}
            className={`w-full px-4 py-2.5 rounded-lg border border-gray-300 outline-none ${
              isEditing
                ? 'focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                : 'bg-gray-50 text-gray-600 cursor-not-allowed'
            }`}
            placeholder="abc@mail.com"
          />
        </div>
      </div>

      {/* Last Updated Info */}
      {companyDetails.updatedAt && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Last updated: {new Date(companyDetails.updatedAt).toLocaleString()}
            {companyDetails.updatedBy && ` by ${companyDetails.updatedBy}`}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {isEditing && (
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}

      {/* Admin Only Notice */}
      {!isAdmin && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            <strong>Note:</strong> Only administrators can edit company details.
          </p>
        </div>
      )}
    </div>
  );
}
