import { useState } from 'react';
import { UserCheck, Plus, Download, Search, Edit2, Trash2, X } from 'lucide-react';
import { addSupplier, updateSupplier, deleteSupplier } from '../services/supplierService';

export interface Supplier {
  id: string;
  supplierCode: string;
  companyName: string;
  address: string;
  contactNumber: string;
  email: string;
  pin: string;
  vatNo: string;
  openingBalance?: number;
  createdAt: string;
}

interface SupplierListProps {
  suppliers: Supplier[];
  setSuppliers: (suppliers: Supplier[]) => void;
}

export default function SupplierList({ suppliers, setSuppliers }: SupplierListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    supplierCode: '',
    companyName: '',
    address: '',
    contactNumber: '',
    email: '',
    pin: '',
    vatNo: '',
    openingBalance: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      // Parse opening balance
      const openingBalance = formData.openingBalance ? parseFloat(formData.openingBalance) : undefined;
      
      if (editingSupplier) {
        // Update existing supplier
        const updatedSupplier = { 
          ...editingSupplier, 
          ...formData,
          openingBalance
        };
        await updateSupplier(editingSupplier.id, updatedSupplier);
        setSuppliers(suppliers.map(s => 
          s.id === editingSupplier.id 
            ? updatedSupplier
            : s
        ));
        setEditingSupplier(null);
      } else {
        // Add new supplier
        const newSupplier: Supplier = {
          id: Date.now().toString(),
          ...formData,
          openingBalance,
          createdAt: new Date().toISOString(),
        };
        const firestoreId = await addSupplier(newSupplier);
        // Use Firestore ID if needed
        newSupplier.id = firestoreId;
        setSuppliers([...suppliers, newSupplier]);
      }
      
      resetForm();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Failed to save supplier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      supplierCode: '',
      companyName: '',
      address: '',
      contactNumber: '',
      email: '',
      pin: '',
      vatNo: '',
      openingBalance: '',
    });
    setShowAddForm(false);
    setEditingSupplier(null);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      supplierCode: supplier.supplierCode,
      companyName: supplier.companyName,
      address: supplier.address,
      contactNumber: supplier.contactNumber,
      email: supplier.email,
      pin: supplier.pin,
      vatNo: supplier.vatNo,
      openingBalance: supplier.openingBalance?.toString() || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this supplier?')) {
      try {
        await deleteSupplier(id);
        setSuppliers(suppliers.filter(s => s.id !== id));
      } catch (error) {
        console.error('Error deleting supplier:', error);
        alert('Failed to delete supplier. Please try again.');
      }
    }
  };

  const downloadExcel = () => {
    const headers = ['Supplier Code', 'Company Name', 'Address', 'Contact Number', 'Email', 'PIN', 'VAT Number', 'Opening Balance'];
    const rows = filteredSuppliers.map(s => [
      s.supplierCode,
      s.companyName,
      s.address,
      s.contactNumber,
      s.email,
      s.pin,
      s.vatNo,
      s.openingBalance?.toString() || '0',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `suppliers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredSuppliers = suppliers.filter(supplier => 
    searchTerm === '' ||
    supplier.supplierCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.contactNumber.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-xl">
              <UserCheck className="w-8 h-8 text-emerald-600" />
            </div>
            Supplier List
          </h1>
          <p className="text-gray-600 mt-2">
            Manage your supplier database and codes for shipments
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Supplier
        </button>
      </div>

      {/* Add/Edit Supplier Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier Company Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.supplierCode}
                onChange={(e) => setFormData({ ...formData, supplierCode: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase"
                placeholder="E.G., S001"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Used in shipment forms for auto-fill
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="Company name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Address <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                placeholder="Full address"
                rows={2}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="+254 XXX XXX XXX"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PIN
              </label>
              <input
                type="text"
                value={formData.pin}
                onChange={(e) => setFormData({ ...formData, pin: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase"
                placeholder="PIN (OPTIONAL)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                VAT Number
              </label>
              <input
                type="text"
                value={formData.vatNo}
                onChange={(e) => setFormData({ ...formData, vatNo: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none uppercase"
                placeholder="VAT NUMBER (OPTIONAL)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opening Balance
              </label>
              <input
                type="number"
                value={formData.openingBalance}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="0.00"
                step="0.01"
              />
              <p className="text-xs text-gray-500 mt-1">
                Initial balance for this supplier (leave empty if starting from zero)
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  editingSupplier ? 'Update Supplier' : 'Add Supplier'
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Download */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by code, name, company, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <button
            onClick={downloadExcel}
            className="px-4 py-2.5 bg-[#10b981] text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-[#059669] transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredSuppliers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Code</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Company Name</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Address</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Contact</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Email</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">PIN</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">VAT No</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Opening Balance</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-center font-semibold text-emerald-600">
                      {supplier.supplierCode}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-900">
                      {supplier.companyName}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {supplier.address}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {supplier.contactNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {supplier.email || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {supplier.pin || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {supplier.vatNo || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-semibold text-emerald-600">
                      KSh {supplier.openingBalance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(supplier.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <UserCheck className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No suppliers found</p>
            <p className="text-sm text-gray-400 mt-2">
              {searchTerm ? 'Try adjusting your search' : 'Add your first supplier to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
