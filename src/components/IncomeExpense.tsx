import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Plus, Calendar } from 'lucide-react';
import { Transaction, BankAccount } from './ReceiverPanel';
import { addTransaction } from '../services/transactionService';
import { addCategory, getAllCategories } from '../services/categoryService';
import { Customer } from './CustomerList';
import { Supplier } from './SupplierList';
import { formatKenyanNumber } from '../utils/numberFormat';
import { useAuth } from '../contexts/AuthContext';

interface IncomeExpenseProps {
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  bankAccounts: BankAccount[];
  categories: string[];
  setCategories: (categories: string[]) => void;
  customers?: Customer[];
  suppliers?: Supplier[];
}

export default function IncomeExpense({ 
  transactions, 
  setTransactions,
  bankAccounts,
  categories,
  setCategories,
  customers = [],
  suppliers = []
}: IncomeExpenseProps) {
  const { user } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'expense' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
    paymentMethod: 'BANK',
    bankAccountId: '',
    senderName: '',
    receiverName: '',
  });

  const predefinedIncomeCategories = ['Product Sales', 'Material Sales', 'Service Income', 'Investment Return', 'Sales', 'Other Income'];
  const predefinedExpenseCategories = ['Material Purchase', 'Salary & Wages', 'Salary', 'Utilities', 'Maintenance', 'Transportation', 'Transport', 'Operating Expense', 'Equipment', 'Other Expense', 'Other'];

  // Separate income and expense categories, including custom ones
  const incomeCategories = categories.filter(cat => 
    predefinedIncomeCategories.includes(cat)
  );
  
  const expenseCategories = categories.filter(cat =>
    predefinedExpenseCategories.includes(cat)
  );

  // Custom categories (not in predefined lists)
  const customCategories = categories.filter(cat =>
    !predefinedIncomeCategories.includes(cat) && !predefinedExpenseCategories.includes(cat)
  );

  const paymentMethods = ['CASH', 'BANK', 'MPESA', 'RTGS'];

  // Add Custom Category
  const handleAddCategory = async () => {
    const trimmedCategory = newCategoryName.trim();
    
    if (!trimmedCategory) {
      alert('Please enter a category name.');
      return;
    }
    
    if (categories.includes(trimmedCategory)) {
      alert('Category already exists!');
      return;
    }
    
    try {
      // Add to Firestore
      await addCategory(trimmedCategory);
      // Update local state immediately for better UX (subscription will sync later)
      setCategories([...categories, trimmedCategory]);
      setFormData({ ...formData, category: trimmedCategory });
      setNewCategoryName('');
      setShowAddCategoryModal(false);
    } catch (error: any) {
      console.error('Error adding category:', error);
      if (error.message === 'Category already exists') {
        alert('This category already exists in the database!');
      } else {
        alert('Failed to add category. Please try again.');
      }
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const newTransaction: Transaction = {
        id: Date.now().toString(),
        date: formData.date,
        type: formData.type === 'income' ? 'credit' : 'debit',
        category: formData.category,
        description: formData.description,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.paymentMethod,
        bankAccountId: formData.bankAccountId || undefined,
        senderName: formData.senderName || undefined,
        receiverName: formData.receiverName || undefined,
      };

      // Transaction will be synced with BasicAccounting
      const firestoreId = await addTransaction(newTransaction);
      newTransaction.id = firestoreId;
      setTransactions([...transactions, newTransaction]);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category: '',
        description: '',
        amount: '',
        paymentMethod: 'BANK',
        bankAccountId: '',
        senderName: '',
        receiverName: '',
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Delete functionality removed - records should only be deleted from their source (invoices, purchases, etc.)

  // Convert transactions to income/expense format (excluding contra entries from payment tracking)
  // Contra entries (contraType: 'contra-entry') show how payments were made, not new income/expenses
  const entries = transactions
    .filter(t => t.contraType !== 'contra-entry')
    .map(t => ({
      ...t,
      type: t.type === 'credit' ? 'income' as const : 'expense' as const,
    }));

  // Calculate totals (excluding contra entries from payment tracking which are just for record keeping)
  // Payment tracking entries show HOW invoices/purchases were paid, not new income/expenses
  const totalIncome = transactions
    .filter(t => t.type === 'credit' && t.contraType !== 'contra-entry')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'debit' && t.contraType !== 'contra-entry')
    .reduce((sum, t) => sum + t.amount, 0);

  const netProfit = totalIncome - totalExpense;

  // Filter entries and sort using createdAtMillis for consistent ordering (newest first)
  const filteredEntries = entries
    .filter(e => filterType === 'all' || e.type === filterType)
    .sort((a, b) => {
      // Primary: Use createdAtMillis if available (numeric timestamp)
      const aMillis = (a as any).createdAtMillis;
      const bMillis = (b as any).createdAtMillis;
      
      if (aMillis && bMillis) {
        return bMillis - aMillis; // Descending (newest first)
      }
      
      // Secondary: Try createdAt timestamp
      if ((a as any).createdAt && (b as any).createdAt) {
        const aTime = new Date((a as any).createdAt).getTime();
        const bTime = new Date((b as any).createdAt).getTime();
        if (bTime !== aTime) {
          return bTime - aTime;
        }
      }
      
      // Tertiary: Fall back to date
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return bTime - aTime;
    });

  // Calculate category-wise breakdown
  const categoryBreakdown = entries.reduce((acc, entry) => {
    if (!acc[entry.category]) {
      acc[entry.category] = { income: 0, expense: 0 };
    }
    if (entry.type === 'income') {
      acc[entry.category].income += entry.amount;
    } else {
      acc[entry.category].expense += entry.amount;
    }
    return acc;
  }, {} as Record<string, { income: number; expense: number }>);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-xl">
              <TrendingUp className="w-8 h-8 text-emerald-600" />
            </div>
            Income & Expense
          </h1>
          <p className="text-gray-600 mt-2">
            Track your income and expenses to monitor profitability
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Entry
        </button>
      </div>

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Category</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category Name
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAddCategory}
                  className="flex-1 px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
                >
                  Add Category
                </button>
                <button
                  onClick={() => {
                    setShowAddCategoryModal(false);
                    setNewCategoryName('');
                  }}
                  className="flex-1 px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Entry Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">New Entry</h3>
          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense', category: '' })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    required
                  >
                    <option value="">Select category</option>
                    {(formData.type === 'income' ? incomeCategories : expenseCategories).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {customCategories.length > 0 && (
                      <>
                        <option disabled>──────────</option>
                        {customCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="px-3 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
                    title="Add new category"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (KSH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => {
                    const newPaymentMethod = e.target.value;
                    setFormData({ 
                      ...formData, 
                      paymentMethod: newPaymentMethod,
                      // Clear bankAccountId when CASH is selected
                      bankAccountId: newPaymentMethod === 'CASH' ? '' : formData.bankAccountId
                    });
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  required
                >
                  {paymentMethods.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bank Account
                </label>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  disabled={formData.paymentMethod === 'CASH'}
                >
                  <option value="">Select Bank Account</option>
                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} - KSH {formatKenyanNumber(account.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ display: 'none' }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sender Name (Optional)
                </label>
                <select
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  <option value="">Select Sender (Supplier)</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.companyName}>
                      {supplier.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Receiver Name (Optional)
                </label>
                <select
                  value={formData.receiverName}
                  onChange={(e) => setFormData({ ...formData, receiverName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  <option value="">Select Receiver (Customer)</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.companyName}>
                      {customer.companyName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Add Entry'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={saving}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary Cards - Admin Only */}
      {user?.role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-600">Total Income</h3>
            </div>
            <p className="text-3xl font-bold text-emerald-600">KSH {formatKenyanNumber(totalIncome)}</p>
            <p className="text-sm text-gray-500 mt-2">{entries.filter(e => e.type === 'income').length} entries</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-red-50 rounded-lg">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-600">Total Expense</h3>
            </div>
            <p className="text-3xl font-bold text-red-600">KSH {formatKenyanNumber(totalExpense)}</p>
            <p className="text-sm text-gray-500 mt-2">{entries.filter(e => e.type === 'expense').length} entries</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2.5 rounded-lg ${netProfit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <DollarSign className={`w-6 h-6 ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
              </div>
              <h3 className="text-sm font-semibold text-gray-600">Net Profit/Loss</h3>
            </div>
            <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              KSH {formatKenyanNumber(Math.abs(netProfit))}
            </p>
            <p className="text-sm text-gray-500 mt-2">{netProfit >= 0 ? 'Profit' : 'Loss'}</p>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Category Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(categoryBreakdown).map(([category, amounts]) => (
              <div key={category} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">{category}</p>
                <div className="space-y-2">
                  {amounts.income > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-emerald-600">Income:</span>
                      <span className="text-sm font-bold text-emerald-600">KSH {formatKenyanNumber(amounts.income)}</span>
                    </div>
                  )}
                  {amounts.expense > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-red-600">Expense:</span>
                      <span className="text-sm font-bold text-red-600">KSH {formatKenyanNumber(amounts.expense)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entries List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-bold text-gray-900">Entry History</h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('income')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterType === 'income'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Income
              </button>
              <button
                onClick={() => setFilterType('expense')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterType === 'expense'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Expense
              </button>
            </div>
          </div>
        </div>

        {filteredEntries.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="p-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        entry.type === 'income'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {entry.type === 'income' ? 'Income' : 'Expense'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {entry.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">{entry.description}</p>
                  <p className={`text-2xl font-bold ${
                    entry.type === 'income' ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {entry.type === 'income' ? '+' : '-'}KSH {formatKenyanNumber(entry.amount)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {entry.paymentMethod} {entry.bankAccountId && `• ${bankAccounts.find(b => b.id === entry.bankAccountId)?.accountName || 'N/A'}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No entries found</p>
            <p className="text-sm text-gray-400 mt-2">
              {filterType === 'all'
                ? 'Add your first entry to get started'
                : `No ${filterType} entries yet`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
