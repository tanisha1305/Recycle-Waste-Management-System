import { Plus, Trash2, Package } from 'lucide-react';
import { InventoryItem } from '../types';
import { useState, useEffect } from 'react';
import { subscribeToInventoryItems } from '../services/inventoryService';
import { formatKenyanNumber } from '../utils/numberFormat';

interface InventoryFormProps {
  items: InventoryItem[];
  onChange: (items: InventoryItem[]) => void;
  totalWeightKg: number;
}

export default function InventoryForm({ items, onChange, totalWeightKg }: InventoryFormProps) {
  const [availableItems, setAvailableItems] = useState<Array<{itemCode: string, itemName: string}>>([]);
  const [searchTerms, setSearchTerms] = useState<{[key: string]: string}>({});
  const [showDropdowns, setShowDropdowns] = useState<{[key: string]: boolean}>({});

  // Subscribe to inventory items
  useEffect(() => {
    const unsubscribe = subscribeToInventoryItems(
      (inventoryItems) => {
        // Extract unique items by item name
        const uniqueItems = Array.from(
          new Map(inventoryItems.map(item => [item.itemName, { itemCode: item.itemCode, itemName: item.itemName }])).values()
        );
        setAvailableItems(uniqueItems);
      },
      (error) => {
        console.error('Error subscribing to inventory items:', error);
      }
    );

    return () => unsubscribe();
  }, []);
  const addItem = () => {
    const newItem: InventoryItem = {
      id: Date.now().toString(),
      itemCode: '', // Will be auto-generated if left empty
      itemName: '',
      estimatedWeight: 0,
    };
    onChange([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof InventoryItem, value: string | number) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const updateItemMultiple = (id: string, updates: Partial<InventoryItem>) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    );
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const totalInventoryWeight = items.reduce(
    (sum, item) => sum + (item.estimatedWeight || 0),
    0
  );

  const weightAccountedPercent = totalWeightKg > 0
    ? (totalInventoryWeight / totalWeightKg) * 100
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Finished Product Specification
          </h3>
          <p className="text-sm text-muted mt-1">
            Record finished items sorted from the material
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          className="btn-gradient soft-btn text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Weight Summary */}
      {items.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted mb-1">Total Output Weight</p>
              <p className="text-lg font-bold text-text">{formatKenyanNumber(totalWeightKg, 2)} KG</p>
            </div>
            <div>
              <p className="text-muted mb-1">Inventory Weight</p>
              <p className="text-lg font-bold text-blue-600">{formatKenyanNumber(totalInventoryWeight, 2)} KG</p>
            </div>
            <div>
              <p className="text-muted mb-1">Accounted For</p>
              <p 
                className={`text-lg font-bold ${
                  weightAccountedPercent >= 90 ? '' : 
                  weightAccountedPercent >= 70 ? 'text-amber-600' : 
                  'text-red-600'
                }`}
                style={weightAccountedPercent >= 90 ? { color: '#10b981' } : {}}
              >
                {formatKenyanNumber(weightAccountedPercent, 1)}%
              </p>
            </div>
            <div>
              <p className="text-muted mb-1">Remaining Balance</p>
              <p className="text-lg font-bold text-purple-600">
                {formatKenyanNumber(totalWeightKg - totalInventoryWeight, 2)} KG
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Items List */}
      {items.length === 0 ? (
        <div className="bg-surface rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <Package className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-muted">No inventory items added yet</p>
          <p className="text-sm text-muted mt-1">Click "Add Item" to record sorted materials</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={item.id} className="card p-5 elev-1 overflow-hidden">
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {/* Item Number Badge */}
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{index + 1}</span>
                </div>
                
                {/* Form Fields - Horizontal scrollable container */}
                <div className="flex items-center gap-3 flex-1">
                  {/* Item Code Input */}
                  <div className="w-48">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 whitespace-nowrap">
                      Item Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.itemCode || ''}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        
                        // Auto-fill item name if code matches
                        const matchingItem = availableItems.find(ai => ai.itemCode.toUpperCase() === value);
                        
                        if (matchingItem) {
                          updateItemMultiple(item.id, {
                            itemCode: value,
                            itemName: matchingItem.itemName
                          });
                          setSearchTerms(prev => ({ ...prev, [item.id]: matchingItem.itemName }));
                        } else {
                          updateItemMultiple(item.id, {
                            itemCode: value,
                            itemName: ''
                          });
                          setSearchTerms(prev => ({ ...prev, [item.id]: '' }));
                        }
                      }}
                      placeholder="Type code here"
                      className="w-full px-3 py-2 border-2 border-gray-400 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth text-base uppercase font-mono bg-white text-gray-900"
                      autoComplete="off"
                    />
                  </div>
                  
                  {/* Item Name - Read-only, auto-filled */}
                  <div className="flex-1 min-w-[250px]">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 whitespace-nowrap">
                      Item Name (Auto-filled)
                    </label>
                    <input
                      type="text"
                      value={searchTerms[item.id] !== undefined ? searchTerms[item.id] : item.itemName}
                      readOnly
                      placeholder="Will be filled automatically from item code..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-700 cursor-not-allowed"
                    />
                  </div>

                  {/* Estimated Weight */}
                  <div className="w-40">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 whitespace-nowrap">
                      Weight (KG)
                    </label>
                    <input
                      type="number"
                      value={item.estimatedWeight || ''}
                      onChange={(e) => updateItem(item.id, 'estimatedWeight', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth text-sm"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  
                  {/* Remove Button */}
                  <div className="flex items-end pb-0.5">
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-smooth text-red-600"
                      title="Remove item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warning if weight doesn't match */}
      {items.length > 0 && weightAccountedPercent < 90 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <p className="text-sm text-amber-900 font-medium">
            ⚠️ Warning: Inventory weight ({formatKenyanNumber(totalInventoryWeight, 2)} KG) should match output weight ({formatKenyanNumber(totalWeightKg, 2)} KG)
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Please ensure all sorted items are recorded with accurate weights.
          </p>
        </div>
      )}
    </div>
  );
}
