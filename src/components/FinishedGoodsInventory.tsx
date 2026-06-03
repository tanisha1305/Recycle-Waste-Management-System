import { useState, useEffect } from 'react';
import { Package, Plus, AlertTriangle, TrendingDown, DollarSign, Edit, History, Archive } from 'lucide-react';
import { FinishedProduct, StockTransaction } from '../types';
import AddProductModal from './AddProductModal';
import StockAdjustmentModal from './StockAdjustmentModal';
import StockHistoryModal from './StockHistoryModal';
import { formatKenyanNumber } from '../utils/numberFormat';

export default function FinishedGoodsInventory() {
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<FinishedProduct | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Load data from localStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('finishedProducts');
    const savedTransactions = localStorage.getItem('stockTransactions');
    
    if (savedProducts) {
      setProducts(JSON.parse(savedProducts));
    }
    if (savedTransactions) {
      setTransactions(JSON.parse(savedTransactions));
    }
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('finishedProducts', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('stockTransactions', JSON.stringify(transactions));
  }, [transactions]);

  // Update product status based on stock levels
  const updateProductStatus = (product: FinishedProduct): FinishedProduct => {
    let status: FinishedProduct['status'];
    if (product.currentStock === 0) {
      status = 'out-of-stock';
    } else if (product.currentStock <= product.criticalLevel) {
      status = 'critical';
    } else if (product.currentStock <= product.reorderLevel) {
      status = 'low-stock';
    } else {
      status = 'in-stock';
    }
    return { ...product, status, lastUpdated: new Date().toISOString() };
  };

  // Add new product
  const handleAddProduct = (product: FinishedProduct) => {
    const updatedProduct = updateProductStatus(product);
    setProducts([...products, updatedProduct]);
    
    // Create initial transaction
    const transaction: StockTransaction = {
      id: Date.now().toString(),
      productId: product.id,
      transactionType: 'addition',
      quantity: product.currentStock,
      previousStock: 0,
      newStock: product.currentStock,
      reason: 'Initial stock',
      performedBy: 'Admin',
      timestamp: new Date().toISOString(),
    };
    setTransactions([...transactions, transaction]);
  };

  // Handle stock adjustment
  const handleStockAdjustment = (
    productId: string,
    quantity: number,
    type: 'addition' | 'deduction' | 'adjustment',
    reason: string,
    performedBy: string,
    approvedBy?: string,
    notes?: string
  ) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const previousStock = product.currentStock;
    let newStock: number;

    if (type === 'adjustment') {
      newStock = quantity; // Direct adjustment to specified quantity
    } else if (type === 'addition') {
      newStock = previousStock + quantity;
    } else {
      newStock = previousStock - quantity;
    }

    // Ensure stock doesn't go negative
    if (newStock < 0) {
      alert('Stock cannot be negative!');
      return;
    }

    // Create transaction
    const transaction: StockTransaction = {
      id: Date.now().toString(),
      productId,
      transactionType: type,
      quantity: type === 'deduction' ? -quantity : quantity,
      previousStock,
      newStock,
      reason,
      performedBy,
      approvedBy,
      timestamp: new Date().toISOString(),
      notes,
    };

    // Update product
    const updatedProducts = products.map(p => {
      if (p.id === productId) {
        return updateProductStatus({ ...p, currentStock: newStock });
      }
      return p;
    });

    setProducts(updatedProducts);
    setTransactions([...transactions, transaction]);
  };

  // Automatic stock addition from processing completion
  // TODO: Call this from Stage 4 (Pelleting) completion handler
  /*
  const addStockFromProcessing = (shipmentId: string, productName: string, quantity: number, productCode?: string) => {
    // Find or create product
    let product = products.find(p => p.productName === productName);
    
    if (!product) {
      // Create new product
      const newProduct: FinishedProduct = {
        id: Date.now().toString(),
        productCode: productCode || `FG-${Date.now()}`,
        productName,
        currentStock: quantity,
        unit: 'KG',
        reorderLevel: 100,
        criticalLevel: 50,
        costPerUnit: 0,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        status: 'in-stock',
      };
      const updatedProduct = updateProductStatus(newProduct);
      setProducts([...products, updatedProduct]);
      
      // Create transaction
      const transaction: StockTransaction = {
        id: Date.now().toString(),
        productId: updatedProduct.id,
        transactionType: 'addition',
        quantity,
        previousStock: 0,
        newStock: quantity,
        reason: 'Processing completion',
        source: `Shipment #${shipmentId} - Stage 4 Pelleting`,
        performedBy: 'System',
        timestamp: new Date().toISOString(),
      };
      setTransactions([...transactions, transaction]);
    } else {
      // Update existing product
      handleStockAdjustment(
        product.id,
        quantity,
        'addition',
        'Processing completion',
        'System',
        undefined,
        `From Shipment #${shipmentId}`
      );
    }
  };
  */

  // Calculate summary statistics
  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPerUnit), 0);
  const lowStockProducts = products.filter(p => p.status === 'low-stock' || p.status === 'critical').length;
  const outOfStockProducts = products.filter(p => p.status === 'out-of-stock').length;

  // Filter products
  const filteredProducts = products.filter(p => {
    if (filterStatus === 'all') return true;
    return p.status === filterStatus;
  });

  // Get status badge color
  const getStatusBadge = (status: FinishedProduct['status']) => {
    switch (status) {
      case 'in-stock':
        return 'text-[#10b981]' + ' ' + 'bg-[#10b981]/10';
      case 'low-stock':
        return 'bg-yellow-100 text-yellow-700';
      case 'critical':
        return 'bg-orange-100 text-orange-700';
      case 'out-of-stock':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: FinishedProduct['status']) => {
    switch (status) {
      case 'in-stock':
        return 'In Stock';
      case 'low-stock':
        return 'Low Stock';
      case 'critical':
        return 'Critical';
      case 'out-of-stock':
        return 'Out of Stock';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Archive className="w-8 h-8 text-primary" />
            </div>
            Finished Goods Inventory
          </h1>
          <p className="text-muted mt-2">
            Manage finished products, stock levels, and inventory operations
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Product
        </button>
      </div>

      {/* Alert Summary Cards */}
      {(lowStockProducts > 0 || outOfStockProducts > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {outOfStockProducts > 0 && (
            <div className="card p-4 elev-1 border-l-4 border-red-500 bg-red-50">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-lg font-bold text-red-700">{outOfStockProducts} Product(s) Out of Stock</p>
                  <p className="text-sm text-red-600">Immediate action required!</p>
                </div>
              </div>
            </div>
          )}
          {lowStockProducts > 0 && (
            <div className="card p-4 elev-1 border-l-4 border-yellow-500 bg-yellow-50">
              <div className="flex items-center gap-3">
                <TrendingDown className="w-8 h-8 text-yellow-600" />
                <div>
                  <p className="text-lg font-bold text-yellow-700">{lowStockProducts} Product(s) Low/Critical Stock</p>
                  <p className="text-sm text-yellow-600">Consider reordering soon</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 elev-1">
          <p className="text-sm text-muted mb-1">Total Products</p>
          <p className="text-2xl font-bold text-text">{totalProducts}</p>
          <p className="text-xs text-muted mt-1">Unique SKUs</p>
        </div>
        <div className="card p-4 elev-1">
          <p className="text-sm text-muted mb-1">Stock Value</p>
          <p className="text-2xl font-bold text-primary">KSH {formatKenyanNumber(totalStockValue, 2)}</p>
          <p className="text-xs text-muted mt-1">Total inventory value</p>
        </div>
        <div className="card p-4 elev-1">
          <p className="text-sm text-muted mb-1">Low Stock Alerts</p>
          <p className="text-2xl font-bold text-yellow-600">{lowStockProducts}</p>
          <p className="text-xs text-muted mt-1">Below reorder level</p>
        </div>
        <div className="card p-4 elev-1">
          <p className="text-sm text-muted mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-red-600">{outOfStockProducts}</p>
          <p className="text-xs text-muted mt-1">Needs replenishment</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 elev-1">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-700">Filter by Status:</label>
          <div className="flex gap-2">
            {['all', 'in-stock', 'low-stock', 'critical', 'out-of-stock'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth ${
                  filterStatus === status
                    ? 'bg-primary text-white'
                    : 'bg-surface text-muted hover:bg-primary/10'
                }`}
              >
                {status === 'all' ? 'All' : getStatusText(status as FinishedProduct['status'])}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Table */}
      {filteredProducts.length === 0 ? (
        <div className="card p-12 text-center elev-1">
          <Package className="w-16 h-16 text-muted mx-auto mb-4" />
          <p className="text-lg font-medium text-text">No products found</p>
          <p className="text-sm text-muted mt-2">
            {products.length === 0
              ? 'Add your first finished product to start tracking inventory'
              : 'No products match the selected filter'}
          </p>
        </div>
      ) : (
        <div className="card elev-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface">
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Product Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Product Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Current Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Reorder Level</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Stock Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-surface/30 transition-smooth">
                    <td className="px-4 py-3">
                      <p className="font-mono text-sm font-semibold text-primary">{product.productCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">{product.productName}</p>
                      {product.description && (
                        <p className="text-xs text-muted mt-0.5">{product.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-lg font-bold text-text">
                        {formatKenyanNumber(product.currentStock, 2)} {product.unit}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(product.status)}`}>
                        {getStatusText(product.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-text">
                        {product.reorderLevel} {product.unit}
                      </p>
                      <p className="text-xs text-muted">
                        Critical: {product.criticalLevel} {product.unit}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold" style={{ color: '#10b981' }}>
                        KSH {formatKenyanNumber(product.currentStock * product.costPerUnit, 2)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setShowAdjustmentModal(true);
                          }}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-smooth text-blue-600"
                          title="Adjust stock"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProduct(product);
                            setShowHistoryModal(true);
                          }}
                          className="p-2 hover:bg-purple-50 rounded-lg transition-smooth text-purple-600"
                          title="View history"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Summary by Category */}
      {products.length > 0 && (
        <div className="card p-6 elev-1">
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Inventory Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['in-stock', 'low-stock', 'critical', 'out-of-stock'].map((status) => {
              const count = products.filter(p => p.status === status).length;
              const totalValue = products
                .filter(p => p.status === status)
                .reduce((sum, p) => sum + (p.currentStock * p.costPerUnit), 0);
              
              return (
                <div key={status} className="bg-surface/50 rounded-lg p-3">
                  <p className="text-xs text-muted mb-1">{getStatusText(status as FinishedProduct['status'])}</p>
                  <p className="text-xl font-bold text-primary">{count}</p>
                  <p className="text-xs font-semibold mt-1" style={{ color: '#10b981' }}>KSH {formatKenyanNumber(totalValue, 2)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddProduct}
        />
      )}

      {showAdjustmentModal && selectedProduct && (
        <StockAdjustmentModal
          product={selectedProduct}
          onClose={() => {
            setShowAdjustmentModal(false);
            setSelectedProduct(null);
          }}
          onAdjust={handleStockAdjustment}
        />
      )}

      {showHistoryModal && selectedProduct && (
        <StockHistoryModal
          product={selectedProduct}
          transactions={transactions.filter(t => t.productId === selectedProduct.id)}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}
