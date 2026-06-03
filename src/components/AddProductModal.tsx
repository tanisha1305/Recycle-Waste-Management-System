import { useState, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { FinishedProduct } from '../types';

interface AddProductModalProps {
  onClose: () => void;
  onAdd: (product: FinishedProduct) => void;
}

export default function AddProductModal({ onClose, onAdd }: AddProductModalProps) {
  const [formData, setFormData] = useState({
    productCode: '',
    productName: '',
    description: '',
    currentStock: 0,
    unit: 'KG' as 'KG' | 'Pieces' | 'Bags',
    reorderLevel: 100,
    criticalLevel: 50,
    costPerUnit: 0,
    sellingPricePerUnit: 0,
    category: '',
  });

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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, nextFieldId?: string) => {
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

    if (!formData.productCode || !formData.productName) {
      alert('Please fill in all required fields');
      return;
    }

    const newProduct: FinishedProduct = {
      id: Date.now().toString(),
      productCode: formData.productCode,
      productName: formData.productName,
      description: formData.description || undefined,
      currentStock: formData.currentStock,
      unit: formData.unit,
      reorderLevel: formData.reorderLevel,
      criticalLevel: formData.criticalLevel,
      costPerUnit: formData.costPerUnit,
      sellingPricePerUnit: formData.sellingPricePerUnit || undefined,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      status: 'in-stock',
      category: formData.category || undefined,
    };

    onAdd(newProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl modal-card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text">Add New Product</h2>
              <p className="text-sm text-muted">Create a new finished goods inventory item</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-lg transition-smooth">
            <X className="w-6 h-6 text-muted" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Product Code & Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Product Code <span className="text-red-500">*</span>
              </label>
              <input
                id="productCode"
                type="text"
                value={formData.productCode}
                onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'productName')}
                placeholder="e.g., FG-001"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                id="productName"
                type="text"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'description')}
                placeholder="e.g., PET Pellets Grade A"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              onKeyDown={(e) => handleKeyDown(e, 'category')}
              placeholder="Additional product details..."
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Category
            </label>
            <input
              id="category"
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              onKeyDown={(e) => handleKeyDown(e, 'currentStock')}
              placeholder="e.g., Pellets, Flakes, Granules"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
            />
          </div>

          {/* Stock & Unit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Initial Stock <span className="text-red-500">*</span>
              </label>
              <input
                id="currentStock"
                type="number"
                value={formData.currentStock}
                onChange={(e) => setFormData({ ...formData, currentStock: parseFloat(e.target.value) || 0 })}
                onKeyDown={(e) => handleKeyDown(e, 'unit')}
                placeholder="0"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Unit <span className="text-red-500">*</span>
              </label>
              <select
                id="unit"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value as 'KG' | 'Pieces' | 'Bags' })}
                onKeyDown={(e) => handleKeyDown(e, 'reorderLevel')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
              >
                <option value="KG">KG</option>
                <option value="Pieces">Pieces</option>
                <option value="Bags">Bags</option>
              </select>
            </div>
          </div>

          {/* Alert Levels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Reorder Level <span className="text-red-500">*</span>
              </label>
              <input
                id="reorderLevel"
                type="number"
                value={formData.reorderLevel}
                onChange={(e) => setFormData({ ...formData, reorderLevel: parseFloat(e.target.value) || 0 })}
                onKeyDown={(e) => handleKeyDown(e, 'criticalLevel')}
                placeholder="100"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                required
              />
              <p className="text-xs text-muted mt-1">Alert when stock falls below this level</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Critical Level <span className="text-red-500">*</span>
              </label>
              <input
                id="criticalLevel"
                type="number"
                value={formData.criticalLevel}
                onChange={(e) => setFormData({ ...formData, criticalLevel: parseFloat(e.target.value) || 0 })}
                onKeyDown={(e) => handleKeyDown(e, 'costPerUnit')}
                placeholder="50"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                required
              />
              <p className="text-xs text-muted mt-1">Critical alert threshold</p>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Cost per Unit (KSH) <span className="text-red-500">*</span>
              </label>
              <input
                id="costPerUnit"
                type="number"
                value={formData.costPerUnit}
                onChange={(e) => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) || 0 })}
                onKeyDown={(e) => handleKeyDown(e, 'sellingPricePerUnit')}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Selling Price per Unit (KSH)
              </label>
              <input
                id="sellingPricePerUnit"
                type="number"
                value={formData.sellingPricePerUnit}
                onChange={(e) => setFormData({ ...formData, sellingPricePerUnit: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
              />
            </div>
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
              Add Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
