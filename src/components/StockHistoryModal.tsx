import { X, History, TrendingUp, TrendingDown, Edit3, Clock, User } from 'lucide-react';
import { FinishedProduct, StockTransaction } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';

interface StockHistoryModalProps {
  product: FinishedProduct;
  transactions: StockTransaction[];
  onClose: () => void;
}

export default function StockHistoryModal({ product, transactions, onClose }: StockHistoryModalProps) {
  // Sort transactions by timestamp (newest first)
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getTransactionIcon = (type: StockTransaction['transactionType']) => {
    switch (type) {
      case 'addition':
        return <TrendingUp className="w-5 h-5" style={{ color: '#10b981' }} />;
      case 'deduction':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      case 'adjustment':
        return <Edit3 className="w-5 h-5 text-blue-600" />;
      default:
        return <History className="w-5 h-5 text-muted" />;
    }
  };

  const getTransactionColor = (type: StockTransaction['transactionType']) => {
    switch (type) {
      case 'addition':
        return 'border';
      case 'deduction':
        return 'bg-red-50 border-red-200';
      case 'adjustment':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getQuantityDisplay = (transaction: StockTransaction) => {
    const sign = transaction.quantity >= 0 ? '+' : '';
    const color = transaction.quantity >= 0 ? '' : 'text-red-600';
    return (
      <span className={`font-semibold ${color}`} style={transaction.quantity >= 0 ? { color: '#10b981' } : {}}>
        {sign}{formatKenyanNumber(transaction.quantity, 2)}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl modal-card w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <History className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text">Stock History</h2>
              <p className="text-sm text-muted mt-1">
                {product.productName} ({product.productCode})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-lg transition-smooth">
            <X className="w-6 h-6 text-muted" />
          </button>
        </div>

        {/* Current Stock Summary */}
        <div className="p-6 bg-primary/5 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-sm text-muted mb-1">Current Stock</p>
              <p className="text-3xl font-bold text-primary">
                {formatKenyanNumber(product.currentStock, 2)} {product.unit}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted mb-1">Total Transactions</p>
              <p className="text-3xl font-bold text-text">{transactions.length}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted mb-1">Stock Value</p>
              <p className="text-3xl font-bold" style={{ color: '#10b981' }}>
                KSH {formatKenyanNumber(product.currentStock * product.costPerUnit, 2)}
              </p>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="p-6">
          {sortedTransactions.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-muted mx-auto mb-4" />
              <p className="text-lg font-medium text-text">No transaction history</p>
              <p className="text-sm text-muted mt-2">
                Stock transactions will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className={`border-2 rounded-lg p-4 ${getTransactionColor(transaction.transactionType)}`}
                  style={transaction.transactionType === 'addition' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' } : {}}
                >
                  <div className="flex items-start justify-between">
                    {/* Left side - Transaction details */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 bg-white rounded-lg">
                        {getTransactionIcon(transaction.transactionType)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-text capitalize">
                            {transaction.transactionType}
                          </h3>
                          <span className="text-xs px-2 py-0.5 bg-white rounded-full text-muted">
                            {transaction.reason}
                          </span>
                        </div>
                        
                        {/* Stock Change */}
                        <div className="flex items-center gap-2 text-sm mb-2">
                          <span className="text-muted">
                            {formatKenyanNumber(transaction.previousStock, 2)} {product.unit}
                          </span>
                          <span className="text-muted">→</span>
                          <span className="font-semibold text-text">
                            {formatKenyanNumber(transaction.newStock, 2)} {product.unit}
                          </span>
                          <span className="ml-2">
                            ({getQuantityDisplay(transaction)} {product.unit})
                          </span>
                        </div>

                        {/* Source */}
                        {transaction.source && (
                          <p className="text-xs text-muted mb-2">
                            Source: {transaction.source}
                          </p>
                        )}

                        {/* Notes */}
                        {transaction.notes && (
                          <p className="text-sm text-slate-600 bg-white/50 rounded px-2 py-1 mt-2">
                            {transaction.notes}
                          </p>
                        )}

                        {/* Meta info */}
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{transaction.performedBy}</span>
                          </div>
                          {transaction.approvedBy && (
                            <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                              <span>✓</span>
                              <span>Approved by {transaction.approvedBy}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(transaction.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {sortedTransactions.length > 0 && (
          <div className="p-6 bg-surface/30 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Transaction Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Total Additions</p>
                <p className="text-lg font-bold" style={{ color: '#10b981' }}>
                  +{formatKenyanNumber(sortedTransactions
                    .filter(t => t.quantity > 0)
                    .reduce((sum, t) => sum + t.quantity, 0), 2)} {product.unit}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Total Deductions</p>
                <p className="text-lg font-bold text-red-600">
                  {formatKenyanNumber(sortedTransactions
                    .filter(t => t.quantity < 0)
                    .reduce((sum, t) => sum + t.quantity, 0), 2)} {product.unit}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Net Change</p>
                <p className="text-lg font-bold text-primary">
                  {formatKenyanNumber(product.currentStock - (transactions[0]?.previousStock || 0), 2)} {product.unit}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-smooth"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
