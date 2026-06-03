import { useState, useEffect } from 'react';
import { X, FileText, Save } from 'lucide-react';
import { Shipment, FinishedProduct } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';

interface DeliveryNoteModalProps {
  shipment: Shipment;
  products: FinishedProduct[];
  onClose: () => void;
  onSave: (itemCode: string, deliveryNoteText: string) => void;
}

export default function DeliveryNoteModal({
  shipment,
  products,
  onClose,
  onSave,
}: DeliveryNoteModalProps) {
  const [itemCode, setItemCode] = useState(shipment.deliveryNoteItemCode || '');
  const [deliveryNoteText, setDeliveryNoteText] = useState(shipment.deliveryNoteText || '');

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(itemCode, deliveryNoteText);
    onClose();
  };

  const canSubmit = itemCode && deliveryNoteText.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Delivery Note</h2>
              <p className="text-sm text-blue-100">Shipment #{shipment.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* Shipment Info */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 mb-1">From</p>
                  <p className="font-semibold text-gray-900">{shipment.supplier}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">To</p>
                  <p className="font-semibold text-gray-900">{shipment.receiver}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Sent KG</p>
                  <p className="font-semibold text-gray-900">{formatKenyanNumber(shipment.sentKg, 2)} KG</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Date</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(shipment.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Item Code Dropdown */}
            <div>
              <label htmlFor="itemCode" className="block text-sm font-semibold text-gray-700 mb-2">
                Item Code <span className="text-red-500">*</span>
              </label>
              <select
                id="itemCode"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select Item Code</option>
                {products.map((product) => (
                  <option key={product.id} value={product.productCode}>
                    {product.productCode} - {product.productName}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Select the item code for this delivery
              </p>
            </div>

            {/* Delivery Note Text Area */}
            <div>
              <label htmlFor="deliveryNote" className="block text-sm font-semibold text-gray-700 mb-2">
                Delivery Note <span className="text-red-500">*</span>
              </label>
              <textarea
                id="deliveryNote"
                value={deliveryNoteText}
                onChange={(e) => setDeliveryNoteText(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Enter delivery note details, special instructions, or item description..."
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Provide detailed information about the delivery
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              Save Delivery Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
