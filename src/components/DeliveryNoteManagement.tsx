import { useState, useEffect } from 'react';
import { Truck, Plus, Search, Printer, Edit2, Trash2, Eye, X, PackageCheck } from 'lucide-react';
import { Customer } from './CustomerList';
import { formatKenyanNumber } from '../utils/numberFormat';
import { 
  addDeliveryNote, 
  updateDeliveryNote, 
  deleteDeliveryNote, 
  subscribeToDeliveryNotes,
  DeliveryNote,
  DeliveryNoteItem
} from '../services/deliveryNoteService';
import { 
  InventoryItem, 
  subscribeToInventoryItems 
} from '../services/inventoryService';

interface DeliveryNoteManagementProps {
  customers: Customer[];
}

export default function DeliveryNoteManagement({ customers }: DeliveryNoteManagementProps) {
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNote, setEditingNote] = useState<DeliveryNote | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in-transit' | 'delivered' | 'cancelled'>('all');
  const [saving, setSaving] = useState(false);
  const [printPreviewNote, setPrintPreviewNote] = useState<DeliveryNote | null>(null);

  // Subscribe to delivery notes from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToDeliveryNotes(
      (notes) => setDeliveryNotes(notes),
      (error) => console.error('Error subscribing to delivery notes:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to inventory items from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToInventoryItems(
      (items) => setInventoryItems(items),
      (error) => console.error('Error subscribing to inventory items:', error)
    );
    return () => unsubscribe();
  }, []);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    customerAddress: '',
    customerContact: '',
    deliveryAddress: '',
    deliveryFrom: {
      name: 'DONATO IMPEX LIMITED',
      address: 'P.O. BOX 12345, NAIROBI',
      contact: '+254 700 000 000',
    },
    transporterName: '',
    vehicleNumber: '',
    driverName: '',
    driverContact: '',
    specialInstructions: '',
    items: [] as DeliveryNoteItem[],
  });

  // Generate delivery note number
  const generateDeliveryNoteNumber = () => {
    const year = new Date().getFullYear();
    const count = deliveryNotes.length + 1;
    return `DN-${year}-${String(count).padStart(4, '0')}`;
  };

  // Handle customer selection
  const handleCustomerChange = (customerName: string) => {
    const customer = customers.find(c => c.companyName === customerName);
    if (customer) {
      setFormData({
        ...formData,
        customerName: customer.companyName,
        customerAddress: customer.address || '',
        customerContact: customer.contactNumber || '',
        deliveryAddress: customer.address || '',
      });
    }
  };

  // Add item to delivery note
  const addItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          itemCode: '',
          itemDescription: '',
          quantity: 0,
          unitOfMeasure: 'KG',
          remarks: '',
        },
      ],
    });
  };

  // Update item
  const updateItem = (index: number, field: keyof DeliveryNoteItem, value: string | number) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData({ ...formData, items: updatedItems });
  };

  // Remove item
  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  // Handle item code selection from inventory
  const handleItemCodeChange = (index: number, itemCode: string) => {
    const inventoryItem = inventoryItems.find(item => item.itemCode === itemCode);
    const updatedItems = [...formData.items];
    
    if (inventoryItem) {
      updatedItems[index] = {
        ...updatedItems[index],
        itemCode: itemCode,
        itemDescription: inventoryItem.itemName,
      };
    } else {
      updatedItems[index] = {
        ...updatedItems[index],
        itemCode: itemCode,
      };
    }
    
    setFormData({ ...formData, items: updatedItems });
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.items.length === 0) {
      alert('Please add at least one item to the delivery note');
      return;
    }

    setSaving(true);
    try {
      const newNote: DeliveryNote = {
        id: editingNote?.id || Date.now().toString(),
        deliveryNoteNumber: editingNote?.deliveryNoteNumber || generateDeliveryNoteNumber(),
        date: formData.date,
        customerName: formData.customerName,
        customerAddress: formData.customerAddress,
        customerContact: formData.customerContact,
        deliveryAddress: formData.deliveryAddress,
        deliveryFrom: formData.deliveryFrom,
        items: formData.items,
        transporterName: formData.transporterName,
        vehicleNumber: formData.vehicleNumber,
        driverName: formData.driverName,
        driverContact: formData.driverContact,
        specialInstructions: formData.specialInstructions,
        status: 'pending',
        createdAt: editingNote?.createdAt || new Date().toISOString(),
      };

      if (editingNote) {
        await updateDeliveryNote(editingNote.id, newNote);
      } else {
        await addDeliveryNote(newNote);
      }

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        customerName: '',
        customerAddress: '',
        customerContact: '',
        deliveryAddress: '',
        deliveryFrom: {
          name: 'DONATO IMPEX LIMITED',
          address: 'P.O. BOX 12345, NAIROBI',
          contact: '+254 700 000 000',
        },
        transporterName: '',
        vehicleNumber: '',
        driverName: '',
        driverContact: '',
        specialInstructions: '',
        items: [],
      });
      setEditingNote(null);
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving delivery note:', error);
      alert('Failed to save delivery note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Update status
  const handleStatusUpdate = async (noteId: string, newStatus: DeliveryNote['status']) => {
    try {
      const updateData: Partial<DeliveryNote> = { 
        status: newStatus,
      };
      
      // Only add deliveredAt if status is delivered
      if (newStatus === 'delivered') {
        updateData.deliveredAt = new Date().toISOString();
      }
      
      await updateDeliveryNote(noteId, updateData);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  // Delete delivery note
  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this delivery note?')) return;
    
    try {
      await deleteDeliveryNote(noteId);
    } catch (error) {
      console.error('Error deleting delivery note:', error);
      alert('Failed to delete delivery note');
    }
  };

  // Print delivery note
  const executePrint = (note: DeliveryNote) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Delivery Note - ${note.deliveryNoteNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .logo { font-size: 24px; font-weight: bold; color: #d32f2f; margin-bottom: 5px; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 15px; }
            .info-box { flex: 1; border: 1px solid #000; padding: 10px; margin-right: 10px; }
            .info-box:last-child { margin-right: 0; }
            .info-box h3 { font-size: 10px; margin-bottom: 5px; font-weight: bold; }
            .info-box p { font-size: 11px; margin: 3px 0; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #000; }
            th, td { border: 1px solid #000; padding: 8px 5px; text-align: left; font-size: 10px; }
            th { background-color: #f5f5f5; font-weight: bold; text-align: center; }
            .footer { margin-top: 30px; }
            .signature-box { border: 1px solid #000; padding: 40px 20px 10px; margin-top: 20px; text-align: center; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">${note.deliveryFrom.name}</div>
            <p style="font-size: 12px; font-weight: bold;">DELIVERY NOTE</p>
          </div>

          <div class="info-section">
            <div class="info-box">
              <h3>FROM</h3>
              <p><strong>NAME:</strong> ${note.deliveryFrom.name}</p>
              <p><strong>ADDRESS:</strong> ${note.deliveryFrom.address}</p>
              <p><strong>CONTACT:</strong> ${note.deliveryFrom.contact}</p>
            </div>
            <div class="info-box">
              <h3>TO</h3>
              <p><strong>NAME:</strong> ${note.customerName}</p>
              <p><strong>ADDRESS:</strong> ${note.customerAddress}</p>
              <p><strong>CONTACT:</strong> ${note.customerContact}</p>
            </div>
            <div class="info-box">
              <h3>DELIVERY NOTE</h3>
              <p><strong>DN No:</strong> ${note.deliveryNoteNumber}</p>
              <p><strong>Date:</strong> ${new Date(note.date).toLocaleDateString('en-GB')}</p>
              <p><strong>Status:</strong> ${note.status.toUpperCase()}</p>
            </div>
          </div>

          ${note.deliveryAddress !== note.customerAddress ? `
            <div class="info-box" style="margin-bottom: 15px;">
              <h3>DELIVERY ADDRESS</h3>
              <p>${note.deliveryAddress}</p>
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Item Code</th>
                <th>Item Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${note.items.map((item, index) => `
                <tr>
                  <td style="text-align: center;">${index + 1}</td>
                  <td style="text-align: center;">${item.itemCode}</td>
                  <td>${item.itemDescription.toUpperCase()}</td>
                  <td style="text-align: right;">${formatKenyanNumber(item.quantity, 2)}</td>
                  <td style="text-align: center;">${item.unitOfMeasure}</td>
                  <td>${item.remarks || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${note.transporterName || note.vehicleNumber ? `
            <div class="info-section">
              ${note.transporterName ? `
                <div class="info-box">
                  <h3>TRANSPORTER DETAILS</h3>
                  <p><strong>Name:</strong> ${note.transporterName}</p>
                  ${note.vehicleNumber ? `<p><strong>Vehicle No:</strong> ${note.vehicleNumber}</p>` : ''}
                </div>
              ` : ''}
              ${note.driverName ? `
                <div class="info-box">
                  <h3>DRIVER DETAILS</h3>
                  <p><strong>Name:</strong> ${note.driverName}</p>
                  ${note.driverContact ? `<p><strong>Contact:</strong> ${note.driverContact}</p>` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${note.specialInstructions ? `
            <div class="info-box" style="margin-top: 15px;">
              <h3>SPECIAL INSTRUCTIONS</h3>
              <p>${note.specialInstructions}</p>
            </div>
          ` : ''}

          <div class="footer">
            <div style="display: flex; justify-content: space-between;">
              <div class="signature-box" style="width: 45%;">
                <p style="font-weight: bold;">Prepared By</p>
              </div>
              <div class="signature-box" style="width: 45%;">
                <p style="font-weight: bold;">Received By</p>
              </div>
            </div>
            <p style="text-align: center; margin-top: 20px; font-size: 9px;">
              Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}
            </p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Filter delivery notes
  const filteredNotes = deliveryNotes.filter(note => {
    const matchesSearch = searchTerm === '' || 
      note.deliveryNoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || note.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: DeliveryNote['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-700',
      'in-transit': 'bg-blue-100 text-blue-700',
      delivered: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return styles[status];
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Truck className="w-8 h-8 text-blue-600" />
            </div>
            Delivery Notes
          </h1>
          <p className="text-gray-600 mt-2">
            Create and manage delivery notes for shipped goods
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingNote(null);
          }}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Delivery Note
        </button>
      </div>

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Truck className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingNote ? 'Edit Delivery Note' : 'New Delivery Note'}
                  </h2>
                  <p className="text-sm text-gray-600">Fill in the delivery details</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setEditingNote(null);
                }}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
              {/* Basic Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.customerName}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  >
                    <option value="">Select Customer</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.companyName}>
                        {customer.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Address
                  </label>
                  <input
                    type="text"
                    value={formData.customerAddress}
                    onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Contact
                  </label>
                  <input
                    type="text"
                    value={formData.customerContact}
                    onChange={(e) => setFormData({ ...formData, customerContact: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.deliveryAddress}
                  onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>

              {/* Transport Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transporter Name
                  </label>
                  <input
                    type="text"
                    value={formData.transporterName}
                    onChange={(e) => setFormData({ ...formData, transporterName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vehicle Number
                  </label>
                  <input
                    type="text"
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={formData.driverName}
                    onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Driver Contact
                  </label>
                  <input
                    type="text"
                    value={formData.driverContact}
                    onChange={(e) => setFormData({ ...formData, driverContact: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Items</h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                </div>

                {formData.items.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
                    <PackageCheck className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No items added yet</p>
                    <p className="text-sm text-gray-500 mt-1">Click "Add Item" to include products in this delivery</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.items.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-gray-700">Item #{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1 hover:bg-red-50 rounded text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Item Code <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={item.itemCode}
                              onChange={(e) => handleItemCodeChange(index, e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              required
                            >
                              <option value="">Select Item</option>
                              {inventoryItems.map(inv => (
                                <option key={inv.id} value={inv.itemCode}>
                                  {inv.itemCode} - {inv.itemName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Description
                            </label>
                            <input
                              type="text"
                              value={item.itemDescription}
                              onChange={(e) => updateItem(index, 'itemDescription', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Quantity <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              min="0"
                              step="0.01"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Unit
                            </label>
                            <select
                              value={item.unitOfMeasure}
                              onChange={(e) => updateItem(index, 'unitOfMeasure', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                            >
                              <option value="KG">KG</option>
                              <option value="PCS">PCS</option>
                              <option value="BOXES">BOXES</option>
                              <option value="TONS">TONS</option>
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Remarks
                            </label>
                            <input
                              type="text"
                              value={item.remarks}
                              onChange={(e) => updateItem(index, 'remarks', e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Special Instructions */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Instructions
                </label>
                <textarea
                  value={formData.specialInstructions}
                  onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Any special handling or delivery instructions..."
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingNote(null);
                  }}
                  className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
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
                    <>Save Delivery Note</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by delivery note number or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | DeliveryNote['status'])}
            className="px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in-transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Delivery Notes List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredNotes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DN Number</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {note.deliveryNoteNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {new Date(note.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {note.customerName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {note.items.length} item(s)
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={note.status}
                        onChange={(e) => handleStatusUpdate(note.id, e.target.value as DeliveryNote['status'])}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(note.status)} border-0 outline-none cursor-pointer`}
                      >
                        <option value="pending">Pending</option>
                        <option value="in-transit">In Transit</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPrintPreviewNote(note)}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                          title="Print"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingNote(note);
                            setFormData({
                              date: note.date,
                              customerName: note.customerName,
                              customerAddress: note.customerAddress,
                              customerContact: note.customerContact,
                              deliveryAddress: note.deliveryAddress,
                              deliveryFrom: note.deliveryFrom,
                              transporterName: note.transporterName || '',
                              vehicleNumber: note.vehicleNumber || '',
                              driverName: note.driverName || '',
                              driverContact: note.driverContact || '',
                              specialInstructions: note.specialInstructions || '',
                              items: note.items,
                            });
                            setShowAddForm(true);
                          }}
                          className="p-2 hover:bg-amber-50 rounded-lg transition-colors text-amber-600"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
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
            <Truck className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No delivery notes found</p>
            <p className="text-sm text-gray-400 mt-2">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first delivery note to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Print Preview Modal */}
      {printPreviewNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Eye className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Print Preview</h2>
                  <p className="text-sm text-gray-600">Delivery Note: {printPreviewNote.deliveryNoteNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setPrintPreviewNote(null)}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-8 bg-gray-50">
              <div className="bg-white rounded-lg shadow-sm p-8">
                {/* Delivery Note Header */}
                <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
                  <div className="text-2xl font-bold text-red-600 mb-2">
                    {printPreviewNote.deliveryFrom.name}
                  </div>
                  <p className="text-sm font-bold">DELIVERY NOTE</p>
                </div>

                {/* Delivery Note Information */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="border border-gray-800 p-4">
                    <h3 className="text-xs font-bold mb-2">FROM</h3>
                    <p className="text-xs"><strong>NAME:</strong> {printPreviewNote.deliveryFrom.name}</p>
                    <p className="text-xs"><strong>ADDRESS:</strong> {printPreviewNote.deliveryFrom.address}</p>
                    <p className="text-xs"><strong>CONTACT:</strong> {printPreviewNote.deliveryFrom.contact}</p>
                  </div>
                  <div className="border border-gray-800 p-4">
                    <h3 className="text-xs font-bold mb-2">TO</h3>
                    <p className="text-xs"><strong>NAME:</strong> {printPreviewNote.customerName}</p>
                    <p className="text-xs"><strong>ADDRESS:</strong> {printPreviewNote.customerAddress}</p>
                    <p className="text-xs"><strong>CONTACT:</strong> {printPreviewNote.customerContact}</p>
                  </div>
                  <div className="border border-gray-800 p-4">
                    <h3 className="text-xs font-bold mb-2">DELIVERY NOTE</h3>
                    <p className="text-xs"><strong>DN No:</strong> {printPreviewNote.deliveryNoteNumber}</p>
                    <p className="text-xs"><strong>Date:</strong> {new Date(printPreviewNote.date).toLocaleDateString('en-GB')}</p>
                    <p className="text-xs"><strong>Status:</strong> {printPreviewNote.status.toUpperCase()}</p>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full border-collapse border border-gray-800 mb-6">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-800 p-2 text-xs text-center">S.No</th>
                      <th className="border border-gray-800 p-2 text-xs text-center">Item Code</th>
                      <th className="border border-gray-800 p-2 text-xs text-center">Item Description</th>
                      <th className="border border-gray-800 p-2 text-xs text-center">Quantity</th>
                      <th className="border border-gray-800 p-2 text-xs text-center">Unit</th>
                      <th className="border border-gray-800 p-2 text-xs text-center">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printPreviewNote.items.map((item, index) => (
                      <tr key={index}>
                        <td className="border border-gray-800 p-2 text-xs text-center">{index + 1}</td>
                        <td className="border border-gray-800 p-2 text-xs text-center">{item.itemCode}</td>
                        <td className="border border-gray-800 p-2 text-xs">{item.itemDescription.toUpperCase()}</td>
                        <td className="border border-gray-800 p-2 text-xs text-right">{formatKenyanNumber(item.quantity, 2)}</td>
                        <td className="border border-gray-800 p-2 text-xs text-center">{item.unitOfMeasure}</td>
                        <td className="border border-gray-800 p-2 text-xs">{item.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signature Section */}
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="border border-gray-800 p-8 text-center">
                    <p className="font-bold text-sm">Prepared By</p>
                  </div>
                  <div className="border border-gray-800 p-8 text-center">
                    <p className="font-bold text-sm">Received By</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setPrintPreviewNote(null)}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executePrint(printPreviewNote);
                  setPrintPreviewNote(null);
                }}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Delivery Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Total DNs</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{deliveryNotes.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Truck className="w-5 h-5 text-yellow-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Pending</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {deliveryNotes.filter(n => n.status === 'pending').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">In Transit</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {deliveryNotes.filter(n => n.status === 'in-transit').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <Truck className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Delivered</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {deliveryNotes.filter(n => n.status === 'delivered').length}
          </p>
        </div>
      </div>
    </div>
  );
}
