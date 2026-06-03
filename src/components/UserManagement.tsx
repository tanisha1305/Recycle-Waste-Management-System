import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, X, Save, Key, Shield, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { User, SystemRole } from '../types';
import { createUser, updateUser, deleteUser } from '../services/authService';
import { subscribeToUsers, generateLoginId, generatePassword, getRoleDisplayName, getRoleColor } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

export default function UserManagement() {
  const { user: currentUser, hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    loginId: '',
    password: '',
    fullName: '',
    email: '',
    role: 'operator' as SystemRole,
  });

  // Subscribe to users
  useEffect(() => {
    if (!hasPermission('canManageUsers')) return;
    
    const unsubscribe = subscribeToUsers(
      (updatedUsers) => {
        setUsers(updatedUsers);
      },
      (error) => {
        console.error('Error subscribing to users:', error);
      }
    );

    return () => unsubscribe();
  }, [hasPermission]);

  // Auto-generate login ID when role changes
  useEffect(() => {
    if (showModal && !editingUser) {
      const loginId = generateLoginId(formData.role, users);
      setFormData(prev => ({ ...prev, loginId }));
    }
  }, [formData.role, showModal, editingUser, users]);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        loginId: user.loginId,
        password: '', // Don't populate password for editing
        fullName: user.fullName,
        email: user.email || '',
        role: user.role,
      });
    } else {
      setEditingUser(null);
      const loginId = generateLoginId('operator', users);
      setFormData({
        loginId,
        password: generatePassword(),
        fullName: '',
        email: '',
        role: 'operator',
      });
    }
    setError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setError('');
    setFormData({
      loginId: '',
      password: '',
      fullName: '',
      email: '',
      role: 'operator',
    });
  };

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    setFormData(prev => ({ ...prev, password: newPassword }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.loginId.trim() || !formData.fullName.trim()) {
      setError('Login ID and Full Name are required');
      return;
    }

    if (!editingUser && !formData.password.trim()) {
      setError('Password is required for new users');
      return;
    }

    try {
      setLoading(true);

      if (editingUser) {
        // Update existing user
        const updateData: any = {
          fullName: formData.fullName,
          email: formData.email,
          role: formData.role,
        };

        // Only update password if provided
        if (formData.password.trim()) {
          updateData.password = formData.password;
        }

        await updateUser(editingUser.id, updateData);
        alert('User updated successfully!');
      } else {
        // Create new user
        await createUser({
          loginId: formData.loginId,
          password: formData.password,
          fullName: formData.fullName,
          email: formData.email,
          role: formData.role,
          isActive: true,
        });
        alert(`User created successfully!\n\nLogin ID: ${formData.loginId}\nPassword: ${formData.password}\n\nPlease save these credentials securely.`);
      }

      handleCloseModal();
    } catch (err: any) {
      setError(err.message || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('You cannot delete your own account');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete user "${user.fullName}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteUser(user.id);
      alert('User deleted successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    }
  };

  const handleToggleStatus = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('You cannot deactivate your own account');
      return;
    }

    try {
      await updateUser(user.id, { isActive: !user.isActive });
      alert(`User ${user.isActive ? 'deactivated' : 'activated'} successfully!`);
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  if (!hasPermission('canManageUsers')) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Users className="w-8 h-8 text-purple-600" />
            </div>
            User Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage user accounts and assign roles with specific permissions
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Add User
        </button>
      </div>

      {/* Role Descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Administrator
          </h3>
          <ul className="text-sm text-purple-800 space-y-1">
            <li>• Complete system access</li>
            <li>• User management</li>
            <li>• System configuration</li>
            <li>• Financial oversight</li>
            <li>• Report generation</li>
          </ul>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Manager/Supervisor
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Monitor operations</li>
            <li>• Review reports</li>
            <li>• Approve activities</li>
            <li>• Oversee staff work</li>
            <li>• Track performance</li>
          </ul>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
            <Key className="w-5 h-5" />
            Operator/Staff
          </h3>
          <ul className="text-sm text-green-800 space-y-1">
            <li>• Enter material receipts</li>
            <li>• Record processing stages</li>
            <li>• Update inventory</li>
            <li>• Record expenses/income</li>
            <li>• Upload documents</li>
          </ul>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Login ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => {
                const roleColor = getRoleColor(user.role);
                const isCurrentUser = user.id === currentUser?.id;
                
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{user.fullName}</p>
                        {user.email && (
                          <p className="text-sm text-gray-500">{user.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-mono text-gray-900">{user.loginId}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${roleColor.bg} ${roleColor.text}`}>
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        disabled={isCurrentUser}
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        } ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">
                        {user.lastLogin
                          ? new Date(user.lastLogin).toLocaleString()
                          : 'Never'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                          title="Edit user"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          disabled={isCurrentUser}
                          className={`p-2 rounded-lg transition-colors ${
                            isCurrentUser
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'hover:bg-red-50 text-red-600'
                          }`}
                          title={isCurrentUser ? 'Cannot delete own account' : 'Delete user'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="Enter full name"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="Enter email address"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as SystemRole })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  disabled={editingUser !== null}
                >
                  <option value="operator">Operator/Staff</option>
                  <option value="manager">Manager/Supervisor</option>
                  <option value="admin">Administrator</option>
                </select>
                {editingUser && (
                  <p className="text-xs text-gray-500 mt-1">Role cannot be changed after creation</p>
                )}
              </div>

              {/* Login ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Login ID *
                </label>
                <input
                  type="text"
                  value={formData.loginId}
                  onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono"
                  placeholder="Enter login ID"
                  disabled={editingUser !== null}
                  required
                />
                {editingUser && (
                  <p className="text-xs text-gray-500 mt-1">Login ID cannot be changed</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password {!editingUser && '*'}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono pr-10"
                      placeholder={editingUser ? 'Leave empty to keep current' : 'Enter password'}
                      required={!editingUser}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {!editingUser && (
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2"
                      title="Generate random password"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {editingUser && (
                  <p className="text-xs text-gray-500 mt-1">Leave empty to keep the current password</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>{editingUser ? 'Update' : 'Create'} User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
