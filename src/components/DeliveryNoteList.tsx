import { useState, useEffect } from 'react';
import { Truck, Package, MapPin, Phone, User, Calendar, Plus, Search, Filter, FileText } from 'lucide-react';
import { subscribeToDeliveryNotes, DeliveryNote } from '../services/deliveryNoteService';

export default function DeliveryNoteList() {
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in-transit' | 'delivered' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);

  // Subscribe to delivery notes
  useEffect(() => {
    const unsubscribe = subscribeToDeliveryNotes(
      (notes) => {
        setDeliveryNotes(notes);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching delivery notes:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter delivery notes
  const filteredNotes = deliveryNotes.filter((note) => {
    const matchesSearch =
      note.deliveryNoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.deliveryFrom.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || note.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: DeliveryNote['status']) => {
    const statusConfig = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      'in-transit': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'In Transit' },
      delivered: { bg: 'bg-green-100', text: 'text-green-800', label: 'Delivered' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
    };

    const config = statusConfig[status];
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading delivery notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Delivery Notes</h2>
          <p className="text-sm text-gray-500 mt-1">
            {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'} found
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-5 h-5" />
          Create Delivery Note
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by note number, customer, or sender..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in-transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Delivery Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No delivery notes found</h3>
          <p className="text-gray-500">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first delivery note to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{note.deliveryNoteNumber}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(note.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {getStatusBadge(note.status)}
              </div>

              {/* From/To Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">FROM</p>
                  <p className="font-semibold text-gray-900">{note.deliveryFrom.name}</p>
                  <p className="text-sm text-gray-600 mt-1 flex items-start gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {note.deliveryFrom.address}
                  </p>
                  {note.deliveryFrom.contact && (
                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {note.deliveryFrom.contact}
                    </p>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">TO</p>
                  <p className="font-semibold text-gray-900">{note.customerName}</p>
                  <p className="text-sm text-gray-600 mt-1 flex items-start gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {note.deliveryAddress}
                  </p>
                  {note.customerContact && (
                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {note.customerContact}
                    </p>
                  )}
                </div>
              </div>

              {/* Items */}
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <p className="text-xs font-semibold text-blue-900 mb-3">ITEMS ({note.items.length})</p>
                <div className="space-y-2">
                  {note.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-white rounded p-3">
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">{item.itemCode}</p>
                          <p className="text-sm text-gray-600">{item.itemDescription}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {item.quantity} {item.unitOfMeasure}
                        </p>
                        {item.remarks && (
                          <p className="text-xs text-gray-500">{item.remarks}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transport Details */}
              {(note.transporterName || note.vehicleNumber || note.driverName) && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs font-semibold text-gray-600 mb-3">TRANSPORT DETAILS</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {note.transporterName && (
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Transporter</p>
                          <p className="text-sm font-medium text-gray-900">{note.transporterName}</p>
                        </div>
                      </div>
                    )}
                    {note.vehicleNumber && (
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Vehicle No.</p>
                          <p className="text-sm font-medium text-gray-900">{note.vehicleNumber}</p>
                        </div>
                      </div>
                    )}
                    {note.driverName && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Driver</p>
                          <p className="text-sm font-medium text-gray-900">{note.driverName}</p>
                          {note.driverContact && (
                            <p className="text-xs text-gray-500">{note.driverContact}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Special Instructions */}
              {note.specialInstructions && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">SPECIAL INSTRUCTIONS</p>
                  <p className="text-sm text-gray-700">{note.specialInstructions}</p>
                </div>
              )}

              {/* Delivery Info */}
              {note.status === 'delivered' && note.deliveredAt && (
                <div className="border-t border-gray-200 pt-4 mt-4 bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-900 mb-2">DELIVERED</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-700">
                      Delivered on {new Date(note.deliveredAt).toLocaleString()}
                    </span>
                    {note.receivedBy && (
                      <span className="text-green-700">Received by: {note.receivedBy}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
