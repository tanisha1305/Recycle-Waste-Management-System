import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Edit3 } from 'lucide-react';
import { FinishedProduct } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';

interface StockAdjustmentModalProps {
  product: FinishedProduct;
  onClose: () => void;
  onAdjust: (
    productId: string,
    quantity: number,
    type: 'addition' | 'deduction' | 'adjustment',
    reason: string,
    performedBy: string,
    approvedBy?: string,
    notes?: string
  ) => void;
}

export default function StockAdjustmentModal({ product, onClose, onAdjust }: StockAdjustmentModalProps) {
  const [adjustmentType, setAdjustmentType] = useState<'addition' | 'deduction' | 'adjustment'>('addition');
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [notes, setNotes] = useState('');

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

  // Handle Enter key to move to next field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, nextFieldId?: string) => {
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

    if (!quantity || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    if (!reason || !performedBy) {
      alert('Please fill in all required fields');
      return;
    }

    // For adjustments, require approval
    if (adjustmentType === 'adjustment' && !approvedBy) {
      alert('Stock adjustments require approval');
      return;
    }

    onAdjust(
      product.id,
      quantity,
      adjustmentType,
      reason,
      performedBy,
      approvedBy || undefined,
      notes || undefined
    );
    onClose();
  };

  const getNewStock = () => {
    if (adjustmentType === 'adjustment') {
      return quantity;
    } else if (adjustmentType === 'addition') {
      return product.currentStock + quantity;
    } else {
      return Math.max(0, product.currentStock - quantity);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl modal-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-text">Stock Adjustment</h2>
            <p className="text-sm text-muted mt-1">
              {product.productName} ({product.productCode})
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-lg transition-smooth">
            <X className="w-6 h-6 text-muted" />
          </button>
        </div>

        {/* Current Stock Info */}
        <div className="p-6 bg-surface/30 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted mb-1">Current Stock</p>
              <p className="text-3xl font-bold text-text">
                {formatKenyanNumber(product.currentStock, 2)} {product.unit}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted mb-1">New Stock</p>
              <p className="text-3xl font-bold text-primary">
                {formatKenyanNumber(getNewStock(), 2)} {product.unit}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Adjustment Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Adjustment Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAdjustmentType('addition')}
                className={`p-4 rounded-lg border-2 transition-smooth flex flex-col items-center gap-2 ${
                  adjustmentType === 'addition'
                    ? ''
                    : 'border-gray-200'
                }`}
                style={adjustmentType === 'addition' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981' } : {}}
                onMouseEnter={(e) => {
                  if (adjustmentType !== 'addition') {
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (adjustmentType !== 'addition') {
                    e.currentTarget.style.borderColor = '';
                  }
                }}
              >
                <TrendingUp className={`w-6 h-6 ${adjustmentType === 'addition' ? '' : 'text-muted'}`} style={adjustmentType === 'addition' ? { color: '#10b981' } : {}} />
                <span className={`text-sm font-medium ${adjustmentType === 'addition' ? '' : 'text-muted'}`} style={adjustmentType === 'addition' ? { color: '#10b981' } : {}}>
                  Addition
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustmentType('deduction')}
                className={`p-4 rounded-lg border-2 transition-smooth flex flex-col items-center gap-2 ${
                  adjustmentType === 'deduction'
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-red-300'
                }`}
              >
                <TrendingDown className={`w-6 h-6 ${adjustmentType === 'deduction' ? 'text-red-600' : 'text-muted'}`} />
                <span className={`text-sm font-medium ${adjustmentType === 'deduction' ? 'text-red-700' : 'text-muted'}`}>
                  Deduction
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustmentType('adjustment')}
                className={`p-4 rounded-lg border-2 transition-smooth flex flex-col items-center gap-2 ${
                  adjustmentType === 'adjustment'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <Edit3 className={`w-6 h-6 ${adjustmentType === 'adjustment' ? 'text-blue-600' : 'text-muted'}`} />
                <span className={`text-sm font-medium ${adjustmentType === 'adjustment' ? 'text-blue-700' : 'text-muted'}`}>
                  Adjustment
                </span>
              </button>
            </div>
            <p className="text-xs text-muted mt-2">
              {adjustmentType === 'addition' && 'Add stock (e.g., from production, purchase)'}
              {adjustmentType === 'deduction' && 'Remove stock (e.g., sale, damage, waste)'}
              {adjustmentType === 'adjustment' && 'Set stock to specific value (requires approval)'}
            </p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {adjustmentType === 'adjustment' ? 'New Stock Quantity' : 'Quantity'} ({product.unit}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={quantity || ''}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
              required
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
              required
            >
              <option value="">Select reason...</option>
              {adjustmentType === 'addition' && (
                <>
                  <option value="Processing completion">Processing completion</option>
                  <option value="Purchase return">Purchase return</option>
                  <option value="Production output">Production output</option>
                  <option value="Stock transfer in">Stock transfer in</option>
                  <option value="Other">Other</option>
                </>
              )}
              {adjustmentType === 'deduction' && (
                <>
                  <option value="Sale order">Sale order</option>
                  <option value="Damage/Wastage">Damage/Wastage</option>
                  <option value="Quality rejection">Quality rejection</option>
                  <option value="Stock transfer out">Stock transfer out</option>
                  <option value="Sample/Testing">Sample/Testing</option>
                  <option value="Other">Other</option>
                </>
              )}
              {adjustmentType === 'adjustment' && (
                <>
                  <option value="Physical stock count">Physical stock count</option>
                  <option value="Correction - System error">Correction - System error</option>
                  <option value="Correction - Data entry error">Correction - Data entry error</option>
                  <option value="Stock reconciliation">Stock reconciliation</option>
                  <option value="Other">Other</option>
                </>
              )}
            </select>
          </div>

          {/* Performed By */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Performed By <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              placeholder="Enter operator/user name"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
              required
            />
          </div>

          {/* Approved By (for adjustments) */}
          {adjustmentType === 'adjustment' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <label className="block text-sm font-semibold text-yellow-800 mb-2">
                Approved By <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                placeholder="Manager/Supervisor name"
                className="w-full px-4 py-2.5 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-500 outline-none transition-smooth"
                required
              />
              <p className="text-xs text-yellow-700 mt-2">
                ⚠️ Stock adjustments require manager approval
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-slate-700 font-medium hover:bg-surface transition-smooth"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 btn-primary"
            >
              Confirm Adjustment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
