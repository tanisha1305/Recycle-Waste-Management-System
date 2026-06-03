import { useState, useEffect } from 'react';
import { Ship, Plus, Search, Download, Printer, Edit2, Trash2, X, FileText } from 'lucide-react';
import { formatKenyanNumber } from '../utils/numberFormat';

interface ImportExportRecord {
  id: string;
  recordNumber: string;
  type: 'import' | 'export';
  date: string;
  country: string;
  partyName: string;
  partyAddress: string;
  items: {
    description: string;
    hsCode: string; // Harmonized System Code
    quantity: number;
    unit: string;
    unitPrice: number;
    totalValue: number;
  }[];
  currency: string;
  exchangeRate: number;
  // Cost breakdown
  goodsValue: number;
  freightCharges: number;
  insuranceCharges: number;
  // Taxes and duties
  customsDuty: number;
  importExportTax: number;
  vat: number;
  otherCharges: number;
  totalCost: number;
  // Shipping details
  portOfLoading: string;
  portOfDischarge: string;
  shippingMethod: 'air' | 'sea' | 'road' | 'rail';
  containerNumber: string;
  billOfLadingNumber: string;
  // Documentation
  invoiceNumber: string;
  packingListNumber: string;
  certificateOfOrigin: string;
  remarks: string;
  status: 'pending' | 'in-transit' | 'customs-clearance' | 'completed' | 'cancelled';
  createdAt: string;
  createdBy: string;
}

export default function ImportExport() {
  const [records, setRecords] = useState<ImportExportRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ImportExportRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'import' | 'export'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in-transit' | 'customs-clearance' | 'completed' | 'cancelled'>('all');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    type: 'import' as 'import' | 'export',
    date: new Date().toISOString().split('T')[0],
    country: '',
    partyName: '',
    partyAddress: '',
    items: [{
      description: '',
      hsCode: '',
      quantity: 0,
      unit: 'KG',
      unitPrice: 0,
      totalValue: 0
    }],
    currency: 'USD',
    exchangeRate: 1,
    goodsValue: 0,
    freightCharges: 0,
    insuranceCharges: 0,
    customsDuty: 0,
    importExportTax: 0,
    vat: 0,
    otherCharges: 0,
    portOfLoading: '',
    portOfDischarge: '',
    shippingMethod: 'sea' as 'air' | 'sea' | 'road' | 'rail',
    containerNumber: '',
    billOfLadingNumber: '',
    invoiceNumber: '',
    packingListNumber: '',
    certificateOfOrigin: '',
    remarks: '',
    status: 'pending' as 'pending' | 'in-transit' | 'customs-clearance' | 'completed' | 'cancelled'
  });

  const currencies = ['USD', 'EUR', 'GBP', 'INR', 'CNY', 'AED', 'KES'];
  const units = ['KG', 'TONS', 'PIECES', 'BOXES', 'CONTAINERS', 'LITERS', 'METERS'];
  const shippingMethods = ['air', 'sea', 'road', 'rail'];

  // Generate record number
  const generateRecordNumber = (type: 'import' | 'export') => {
    const prefix = type === 'import' ? 'IMP' : 'EXP';
    const count = records.filter(r => r.type === type).length + 1;
    return `${prefix}-${new Date().getFullYear()}-${count.toString().padStart(4, '0')}`;
  };

  // Calculate totals
  const calculateTotals = () => {
    const goodsValue = formData.items.reduce((sum, item) => sum + item.totalValue, 0);
    const totalCost = goodsValue + 
      formData.freightCharges + 
      formData.insuranceCharges + 
      formData.customsDuty + 
      formData.importExportTax + 
      formData.vat + 
      formData.otherCharges;
    
    return { goodsValue, totalCost };
  };

  // Add item
  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        description: '',
        hsCode: '',
        quantity: 0,
        unit: 'KG',
        unitPrice: 0,
        totalValue: 0
      }]
    });
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  // Update item
  const handleItemChange = (index: number, field: string, value: any) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Calculate total value
    if (field === 'quantity' || field === 'unitPrice') {
      updatedItems[index].totalValue = updatedItems[index].quantity * updatedItems[index].unitPrice;
    }
    
    setFormData({ ...formData, items: updatedItems });
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { goodsValue, totalCost } = calculateTotals();
      
      const recordData: ImportExportRecord = {
        id: editingRecord?.id || Date.now().toString(),
        recordNumber: editingRecord?.recordNumber || generateRecordNumber(formData.type),
        type: formData.type,
        date: formData.date,
        country: formData.country,
        partyName: formData.partyName,
        partyAddress: formData.partyAddress,
        items: formData.items,
        currency: formData.currency,
        exchangeRate: formData.exchangeRate,
        goodsValue,
        freightCharges: formData.freightCharges,
        insuranceCharges: formData.insuranceCharges,
        customsDuty: formData.customsDuty,
        importExportTax: formData.importExportTax,
        vat: formData.vat,
        otherCharges: formData.otherCharges,
        totalCost,
        portOfLoading: formData.portOfLoading,
        portOfDischarge: formData.portOfDischarge,
        shippingMethod: formData.shippingMethod,
        containerNumber: formData.containerNumber,
        billOfLadingNumber: formData.billOfLadingNumber,
        invoiceNumber: formData.invoiceNumber,
        packingListNumber: formData.packingListNumber,
        certificateOfOrigin: formData.certificateOfOrigin,
        remarks: formData.remarks,
        status: formData.status,
        createdAt: editingRecord?.createdAt || new Date().toISOString(),
        createdBy: 'System Administrator' // Replace with actual user
      };

      if (editingRecord) {
        setRecords(records.map(r => r.id === editingRecord.id ? recordData : r));
      } else {
        setRecords([...records, recordData]);
      }

      // Reset form
      setShowForm(false);
      setEditingRecord(null);
      resetForm();
      
    } catch (error) {
      console.error('Error saving import/export record:', error);
      alert('Failed to save record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      type: 'import',
      date: new Date().toISOString().split('T')[0],
      country: '',
      partyName: '',
      partyAddress: '',
      items: [{
        description: '',
        hsCode: '',
        quantity: 0,
        unit: 'KG',
        unitPrice: 0,
        totalValue: 0
      }],
      currency: 'USD',
      exchangeRate: 1,
      goodsValue: 0,
      freightCharges: 0,
      insuranceCharges: 0,
      customsDuty: 0,
      importExportTax: 0,
      vat: 0,
      otherCharges: 0,
      portOfLoading: '',
      portOfDischarge: '',
      shippingMethod: 'sea',
      containerNumber: '',
      billOfLadingNumber: '',
      invoiceNumber: '',
      packingListNumber: '',
      certificateOfOrigin: '',
      remarks: '',
      status: 'pending'
    });
  };

  // Edit record
  const handleEdit = (record: ImportExportRecord) => {
    setEditingRecord(record);
    setFormData({
      type: record.type,
      date: record.date,
      country: record.country,
      partyName: record.partyName,
      partyAddress: record.partyAddress,
      items: record.items,
      currency: record.currency,
      exchangeRate: record.exchangeRate,
      goodsValue: record.goodsValue,
      freightCharges: record.freightCharges,
      insuranceCharges: record.insuranceCharges,
      customsDuty: record.customsDuty,
      importExportTax: record.importExportTax,
      vat: record.vat,
      otherCharges: record.otherCharges,
      portOfLoading: record.portOfLoading,
      portOfDischarge: record.portOfDischarge,
      shippingMethod: record.shippingMethod,
      containerNumber: record.containerNumber,
      billOfLadingNumber: record.billOfLadingNumber,
      invoiceNumber: record.invoiceNumber,
      packingListNumber: record.packingListNumber,
      certificateOfOrigin: record.certificateOfOrigin,
      remarks: record.remarks,
      status: record.status
    });
    setShowForm(true);
  };

  // Delete record
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this record?')) {
      setRecords(records.filter(r => r.id !== id));
    }
  };

  // Filter records
  const filteredRecords = records.filter(record => {
    const matchesSearch = searchTerm === '' || 
      record.recordNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.country.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || record.type === filterType;
    const matchesStatus = filterStatus === 'all' || record.status === filterStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const { goodsValue: calculatedGoodsValue, totalCost: calculatedTotalCost } = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Ship className="w-8 h-8 text-blue-600" />
            </div>
            Import / Export
          </h1>
          <p className="text-gray-600 mt-2">
            Manage international trade transactions with complete documentation
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingRecord(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Record
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Total Imports</p>
          <p className="text-2xl font-bold text-blue-600">{records.filter(r => r.type === 'import').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Total Exports</p>
          <p className="text-2xl font-bold text-green-600">{records.filter(r => r.type === 'export').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">In Transit</p>
          <p className="text-2xl font-bold text-orange-600">{records.filter(r => r.status === 'in-transit').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Pending Clearance</p>
          <p className="text-2xl font-bold text-purple-600">{records.filter(r => r.status === 'customs-clearance').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">All Types</option>
            <option value="import">Import</option>
            <option value="export">Export</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in-transit">In Transit</option>
            <option value="customs-clearance">Customs Clearance</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Records List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Record #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Country</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Party</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Ship className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No import/export records found</p>
                    <p className="text-sm text-gray-400 mt-1">Create your first record to get started</p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record.recordNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        record.type === 'import' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {record.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(record.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.country}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{record.partyName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {record.currency} {formatKenyanNumber(record.totalCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        record.status === 'completed' ? 'bg-green-100 text-green-700' :
                        record.status === 'in-transit' ? 'bg-orange-100 text-orange-700' :
                        record.status === 'customs-clearance' ? 'bg-purple-100 text-purple-700' :
                        record.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {record.status.replace('-', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingRecord ? 'Edit' : 'New'} Import/Export Record
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingRecord(null);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'import' | 'export' })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    >
                      <option value="import">Import</option>
                      <option value="export">Export</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="e.g., India, China, USA"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Party Name *</label>
                    <input
                      type="text"
                      value={formData.partyName}
                      onChange={(e) => setFormData({ ...formData, partyName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Supplier/Buyer name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Party Address *</label>
                    <input
                      type="text"
                      value={formData.partyAddress}
                      onChange={(e) => setFormData({ ...formData, partyAddress: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Complete address"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-lg font-semibold text-gray-900">Items</h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                </div>

                {formData.items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Item {index + 1}</span>
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">HS Code</label>
                        <input
                          type="text"
                          value={item.hsCode}
                          onChange={(e) => handleItemChange(index, 'hsCode', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="Harmonized System Code"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          step="0.01"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                        <select
                          value={item.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        >
                          {units.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price *</label>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          step="0.01"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Total Value</label>
                        <input
                          type="number"
                          value={item.totalValue}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Currency & Exchange */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Currency & Exchange</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {currencies.map(curr => (
                        <option key={curr} value={curr}>{curr}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Exchange Rate (to KES) *</label>
                    <input
                      type="number"
                      value={formData.exchangeRate}
                      onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value === '' ? '' as any : parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Costs & Taxes */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Costs & Taxes</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Goods Value</label>
                    <input
                      type="number"
                      value={calculatedGoodsValue}
                      readOnly
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Freight Charges</label>
                    <input
                      type="number"
                      value={formData.freightCharges}
                      onChange={(e) => setFormData({ ...formData, freightCharges: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Insurance Charges</label>
                    <input
                      type="number"
                      value={formData.insuranceCharges}
                      onChange={(e) => setFormData({ ...formData, insuranceCharges: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Customs Duty</label>
                    <input
                      type="number"
                      value={formData.customsDuty}
                      onChange={(e) => setFormData({ ...formData, customsDuty: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Import/Export Tax</label>
                    <input
                      type="number"
                      value={formData.importExportTax}
                      onChange={(e) => setFormData({ ...formData, importExportTax: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">VAT</label>
                    <input
                      type="number"
                      value={formData.vat}
                      onChange={(e) => setFormData({ ...formData, vat: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Other Charges</label>
                    <input
                      type="number"
                      value={formData.otherCharges}
                      onChange={(e) => setFormData({ ...formData, otherCharges: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      step="0.01"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total Cost</label>
                    <input
                      type="number"
                      value={calculatedTotalCost}
                      readOnly
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-blue-50 text-blue-900 font-bold text-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Shipping Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Port of Loading</label>
                    <input
                      type="text"
                      value={formData.portOfLoading}
                      onChange={(e) => setFormData({ ...formData, portOfLoading: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Port of Discharge</label>
                    <input
                      type="text"
                      value={formData.portOfDischarge}
                      onChange={(e) => setFormData({ ...formData, portOfDischarge: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Method</label>
                    <select
                      value={formData.shippingMethod}
                      onChange={(e) => setFormData({ ...formData, shippingMethod: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {shippingMethods.map(method => (
                        <option key={method} value={method}>{method.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Container Number</label>
                    <input
                      type="text"
                      value={formData.containerNumber}
                      onChange={(e) => setFormData({ ...formData, containerNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bill of Lading Number</label>
                    <input
                      type="text"
                      value={formData.billOfLadingNumber}
                      onChange={(e) => setFormData({ ...formData, billOfLadingNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Documentation */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Documentation</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number</label>
                    <input
                      type="text"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Packing List Number</label>
                    <input
                      type="text"
                      value={formData.packingListNumber}
                      onChange={(e) => setFormData({ ...formData, packingListNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Certificate of Origin</label>
                    <input
                      type="text"
                      value={formData.certificateOfOrigin}
                      onChange={(e) => setFormData({ ...formData, certificateOfOrigin: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Remarks</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    rows={3}
                    placeholder="Additional notes or comments"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingRecord ? 'Update Record' : 'Create Record'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingRecord(null);
                    resetForm();
                  }}
                  disabled={saving}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
