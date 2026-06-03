import { useState, useEffect } from 'react';
import { X, ShoppingCart, Save, Send } from 'lucide-react';
import { Shipment } from '../types';
import { Supplier } from './SupplierList';
import { formatInputNumber, parseKenyanNumber, formatKenyanNumber } from '../utils/numberFormat';

interface SenderFormProps {
  onClose: () => void;
  onSubmit: (shipment: Shipment) => void;
  suppliers: Supplier[];
  saving?: boolean;
}

export default function SenderForm({ onClose, onSubmit, suppliers, saving = false }: SenderFormProps) {
  const [supplierCode, setSupplierCode] = useState('');
  const [supplier, setSupplier] = useState('');
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('');
  const [purchaseKg, setPurchaseKg] = useState('');
  const [ratePerKg, setRatePerKg] = useState('');
  const [sentKg, setSentKg] = useState('');
  const [receiver, setReceiver] = useState('Donato Impex Ltd.');
  const [notes, setNotes] = useState('');

  // Build supplier map from suppliers array
  const supplierMap: Record<string, string> = {};
  suppliers.forEach(s => {
    supplierMap[s.supplierCode] = s.companyName;
  });

  // Handle supplier code change and auto-fill supplier name
  const handleSupplierCodeChange = (code: string) => {
    const upperCode = code.toUpperCase();
    setSupplierCode(upperCode);
    
    if (supplierMap[upperCode]) {
      setSupplier(supplierMap[upperCode]);
    } else {
      setSupplier('');
    }
  };

  // Handle purchase weight change and auto-fill sent weight
  const handlePurchaseKgChange = (value: string) => {
    // Remove commas and validate
    const cleaned = value.replace(/,/g, '');
    if (cleaned === '' || /^\d*\.?\d*$/.test(cleaned)) {
      setPurchaseKg(cleaned);
      // Auto-fill sent weight with the same value
      setSentKg(cleaned);
    }
  };

  // Handle rate per kg change
  const handleRatePerKgChange = (value: string) => {
    const cleaned = value.replace(/,/g, '');
    if (cleaned === '' || /^\d*\.?\d*$/.test(cleaned)) {
      setRatePerKg(cleaned);
    }
  };

  // Handle sent kg change
  const handleSentKgChange = (value: string) => {
    const cleaned = value.replace(/,/g, '');
    if (cleaned === '' || /^\d*\.?\d*$/.test(cleaned)) {
      setSentKg(cleaned);
    }
  };

  // Handle ESC key to close form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle Enter key to move to next field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, nextFieldId?: string) => {
    if (e.key === 'Enter' && nextFieldId) {
      e.preventDefault();
      const nextField = document.getElementById(nextFieldId);
      if (nextField) {
        nextField.focus();
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const purchase = parseFloat(purchaseKg);
    const rate = parseFloat(ratePerKg);
    const sent = parseFloat(sentKg);

    const shipment: Shipment = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      supplierCode,
      supplier,
      purchaseInvoiceNumber: purchaseInvoiceNumber || undefined,
      purchaseKg: purchase,
      ratePerKg: rate,
      totalCost: purchase * rate,
      sentKg: sent,
      receiver,
      status: 'sent',
      notes,
    };

    onSubmit(shipment);
  };

  const canSubmit =
    supplierCode &&
    supplier &&
    purchaseKg &&
    ratePerKg &&
    sentKg &&
    receiver &&
    parseFloat(purchaseKg) > 0 &&
    parseFloat(ratePerKg) > 0 &&
    parseFloat(sentKg) > 0 &&
    parseFloat(sentKg) <= parseFloat(purchaseKg);

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]" style={{ margin: 0 }}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-slate-900">New Shipment</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* Purchase Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-600">
                <ShoppingCart className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Purchase Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Supplier Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="supplierCode"
                    type="text"
                    value={supplierCode}
                    onChange={(e) => handleSupplierCodeChange(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'supplier')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all uppercase"
                    placeholder="e.g., S001"
                    maxLength={4}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Supplier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="supplier"
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'purchaseInvoiceNumber')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="Auto-filled from code"
                    readOnly
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Purchase Invoice Number
                </label>
                <input
                  id="purchaseInvoiceNumber"
                  type="text"
                  value={purchaseInvoiceNumber}
                  onChange={(e) => setPurchaseInvoiceNumber(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'purchaseKg')}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder="e.g., INV-2025-001"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Purchase Weight (KG) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="purchaseKg"
                    type="text"
                    value={formatInputNumber(purchaseKg)}
                    onChange={(e) => handlePurchaseKgChange(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'ratePerKg')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="e.g., 100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Rate per KG (KSH) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="ratePerKg"
                    type="text"
                    value={formatInputNumber(ratePerKg)}
                    onChange={(e) => handleRatePerKgChange(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'receiver')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="e.g., 20"
                    required
                  />
                </div>
              </div>

              {purchaseKg && ratePerKg && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600">Total Cost</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    KSH {formatKenyanNumber(parseFloat(purchaseKg) * parseFloat(ratePerKg), 2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-6 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Shipment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
