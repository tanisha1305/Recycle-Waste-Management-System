import { useState } from 'react';
import { Users, Plus, Download, Search, Edit2, Trash2, X } from 'lucide-react';
import { addCustomer, updateCustomer, deleteCustomer } from '../services/customerService';

export interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  address: string;
  contactNumber: string;
  email: string;
  pin: string;
  vatNo: string;
  openingBalance?: number;
  createdAt: string;
}

interface CustomerListProps {
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
}

export default function CustomerList({ customers, setCustomers }: CustomerListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    customerCode: '',
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
      
      if (editingCustomer) {
        // Update existing customer
        const updatedCustomer = { 
          ...editingCustomer, 
          ...formData,
          openingBalance
        };
        await updateCustomer(editingCustomer.id, updatedCustomer);
        setCustomers(customers.map(c => 
          c.id === editingCustomer.id 
            ? updatedCustomer
            : c
        ));
        setEditingCustomer(null);
      } else {
        // Add new customer
        const newCustomer: Customer = {
          id: Date.now().toString(),
          ...formData,
          openingBalance,
          createdAt: new Date().toISOString(),
        };
        const firestoreId = await addCustomer(newCustomer);
        // Use Firestore ID if needed
        newCustomer.id = firestoreId;
        setCustomers([...customers, newCustomer]);
      }
      
      resetForm();
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Failed to save customer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerCode: '',
      companyName: '',
      address: '',
      contactNumber: '',
      email: '',
      pin: '',
      vatNo: '',
      openingBalance: '',
    });
    setShowAddForm(false);
    setEditingCustomer(null);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      customerCode: customer.customerCode,
      companyName: customer.companyName,
      address: customer.address,
      contactNumber: customer.contactNumber,
      email: customer.email,
      pin: customer.pin,
      vatNo: customer.vatNo,
      openingBalance: customer.openingBalance?.toString() || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this customer?')) {
      try {
        await deleteCustomer(id);
        setCustomers(customers.filter(c => c.id !== id));
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Failed to delete customer. Please try again.');
      }
    }
  };

  const downloadExcel = () => {
    const headers = ['Customer Code', 'Company Name', 'Address', 'Contact Number', 'Email', 'PIN', 'VAT Number', 'Opening Balance'];
    const rows = filteredCustomers.map(c => [
      c.customerCode,
      c.companyName,
      c.address,
      c.contactNumber,
      c.email,
      c.pin,
      c.vatNo,
      c.openingBalance?.toString() || '0',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredCustomers = customers.filter(customer => 
    searchTerm === '' ||
    customer.customerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.contactNumber.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            Customer List
          </h1>
          <p className="text-gray-600 mt-2">
            Manage your customer database
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Customer
        </button>
      </div>

      {/* Add/Edit Customer Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              {editingCustomer ? 'Edit Customer' : 'New Customer'}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Company Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.customerCode}
                onChange={(e) => setFormData({ ...formData, customerCode: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
                placeholder="E.G., C001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="0.00"
                step="0.01"
              />
              <p className="text-xs text-gray-500 mt-1">
                Initial balance for this customer (leave empty if starting from zero)
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  editingCustomer ? 'Update Customer' : 'Add Customer'
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
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
          {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredCustomers.length > 0 ? (
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
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-center font-semibold text-blue-600">
                      {customer.customerCode}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-900">
                      {customer.companyName}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {customer.address}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {customer.contactNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {customer.email || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {customer.pin || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">
                      {customer.vatNo || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-semibold text-emerald-600">
                      KSh {customer.openingBalance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(customer)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(customer.id)}
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
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No customers found</p>
            <p className="text-sm text-gray-400 mt-2">
              {searchTerm ? 'Try adjusting your search' : 'Add your first customer to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
