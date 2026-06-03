import { useState, useEffect } from 'react';
import { Plus, Send, Package, DollarSign, TrendingUp } from 'lucide-react';
import { Shipment } from '../types';
import { formatKenyanNumber } from '../utils/numberFormat';
import SenderForm from './SenderForm';
import SenderShipmentList from './SenderShipmentList';
import { Supplier } from './SupplierList';
import { addShipment } from '../services/shipmentService';
import { createShipmentTransaction } from '../services/paymentTrackingService';
import ReceiverSidebar from './ReceiverSidebar';
import InventoryPanel from './InventoryPanel';
import BasicAccounting from './BasicAccounting';
import IncomeExpense from './IncomeExpense';
import CustomerList, { Customer } from './CustomerList';
import SupplierList from './SupplierList';
import StatementPage from './StatementPage';
import DebitCreditNotes from './DebitCreditNotes';
import InvoiceManagement from './InvoiceManagement';
import QuotationManagement from './QuotationManagement';
import DirectPurchase from './DirectPurchase';
import LedgerManagement from './LedgerManagement';
import TransactionManagement from './TransactionManagement';
import UserManagement from './UserManagement';
import CompanyDetails from './CompanyDetails';
import DatabaseSettings from './DatabaseSettings';
import ActivityLogManagement from './ActivityLogManagement';
import PaymentTracking from './PaymentTracking';
import ImportExport from './ImportExport';
import ReceiverDashboard from './ReceiverDashboard';
import { subscribeToCustomers } from '../services/customerService';
import { subscribeToTransactions } from '../services/transactionService';
import { subscribeToBankAccounts } from '../services/bankAccountService';
import { subscribeToCategories, ensureRequiredCategories } from '../services/categoryService';
import { useAuth } from '../contexts/AuthContext';

export interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  initialBalance: number;
  currentBalance: number;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: 'debit' | 'credit' | 'contra';
  contraType?: 'supplier-receiver' | 'invoice' | 'purchase' | 'contra-entry';
  amount: number;
  category: string;
  paymentMethod: string;
  bankAccountId?: string;
  senderName?: string;
  receiverName?: string;
  shipmentId?: string;
  purchaseInvoiceNumber?: string; // Purchase invoice number from shipment
  transferCharge?: number; // Bank transfer charge if applicable
}

interface SenderPanelProps {
  shipments: Shipment[];
  onAddShipment: (shipment: Shipment) => void;
  suppliers: Supplier[];
  setSuppliers: (suppliers: Supplier[]) => void;
  activeTab: 'sender' | 'receiver';
  onTabChange: (tab: 'sender' | 'receiver') => void;
}

export default function SenderPanel({
  shipments,
  onAddShipment,
  suppliers,
  setSuppliers,
  activeTab,
  onTabChange,
}: SenderPanelProps) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'shipments' | 'dashboard' | 'inventory' | 'accounting' | 'income-expense' | 'customers' | 'suppliers' | 'statements' | 'debit-credit-notes' | 'invoices' | 'quotations' | 'direct-purchase' | 'ledger' | 'company-details' | 'transactions' | 'user-management' | 'database-settings' | 'activity-logs' | 'payment-tracking'>('shipments');
  
  // Shared state for transactions and bank accounts
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  
  // State for customers
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Ensure all required categories exist on mount
  useEffect(() => {
    ensureRequiredCategories().catch(err => 
      console.error('Error ensuring required categories:', err)
    );
  }, []);

  // Subscribe to categories from Firestore
  useEffect(() => {
    console.log('Setting up categories subscription...');
    
    const unsubscribe = subscribeToCategories(
      (updatedCategories) => {
        console.log('Received categories update:', updatedCategories.length);
        setCategories(updatedCategories);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to customers from Firestore
  useEffect(() => {
    console.log('Setting up customers subscription...');
    
    const unsubscribe = subscribeToCustomers(
      (updatedCustomers) => {
        console.log('Received customers update:', updatedCustomers.length);
        setCustomers(updatedCustomers);
      },
      (error) => {
        console.error('Error in customers subscription:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to transactions from Firestore
  useEffect(() => {
    console.log('Setting up transactions subscription...');
    
    const unsubscribe = subscribeToTransactions(
      (updatedTransactions) => {
        console.log('Received transactions update:', updatedTransactions.length);
        setTransactions(updatedTransactions);
      },
      (error) => {
        console.error('Error in transactions subscription:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to bank accounts from Firestore
  useEffect(() => {
    console.log('Setting up bank accounts subscription...');
    
    const unsubscribe = subscribeToBankAccounts(
      (updatedBankAccounts) => {
        console.log('Received bank accounts update:', updatedBankAccounts.length);
        setBankAccounts(updatedBankAccounts);
      },
      (error) => {
        console.error('Error in bank accounts subscription:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Function to update bank account balances based on transactions
  const updateBankAccountBalances = (
    updatedTransactions: Transaction[], 
    currentBankAccounts: BankAccount[]
  ) => {
    const updatedAccounts = currentBankAccounts.map(account => {
      // Calculate balance from initial balance plus all transactions
      const accountTransactions = updatedTransactions.filter(t => t.bankAccountId === account.id);
      const totalCredits = accountTransactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const totalDebits = accountTransactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Include transfer charges in balance calculation (same as closing balance in table)
      const totalTransferCharges = accountTransactions
        .filter(t => t.transferCharge && t.transferCharge > 0)
        .reduce((sum, t) => sum + (t.transferCharge || 0), 0);
      
      return {
        ...account,
        currentBalance: account.initialBalance + totalCredits - totalDebits - totalTransferCharges
      };
    });
    setBankAccounts(updatedAccounts);
  };

  // Wrapper for setTransactions that also updates bank balances
  const handleSetTransactions = (newTransactions: Transaction[]) => {
    setTransactions(newTransactions);
    updateBankAccountBalances(newTransactions, bankAccounts);
  };

  // Wrapper for setBankAccounts that recalculates balances
  const handleSetBankAccounts = (newBankAccounts: BankAccount[]) => {
    setBankAccounts(newBankAccounts);
    updateBankAccountBalances(transactions, newBankAccounts);
  };

  const totalPurchased = shipments.reduce((sum, s) => sum + s.purchaseKg, 0);
  const totalSent = shipments.reduce((sum, s) => sum + s.sentKg, 0);
  // Calculate actual total cost including transport and processing losses
  // cumulativeLossMoney already includes transport + all processing stage losses
  const totalSpent = shipments.reduce((sum, s) => {
    const baseCost = s.totalCost; // Initial purchase cost
    const allLosses = s.cumulativeLossMoney || 0; // Transport + Processing losses combined
    return sum + baseCost + allLosses;
  }, 0);
  const receivedShipments = shipments.filter((s) => 
    s.status === 'received' || 
    s.status === 'sorting' || 
    s.status === 'crushing' || 
    s.status === 'washing' || 
    s.status === 'pelleting' || 
    s.status === 'completed'
  ).length;

  // Render shipments view (default)
  const renderShipmentsView = () => (
    <div className="space-y-6 sm:space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Purchased */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-emerald-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Total Purchased</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">{formatKenyanNumber(totalPurchased)}</p>
          <p className="text-xs text-gray-400 font-normal">KG</p>
        </div>

        {/* Total Sent */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-blue-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <Send className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Total Sent</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">{formatKenyanNumber(totalSent)}</p>
          <p className="text-xs text-gray-400 font-normal">KG</p>
        </div>

        {/* Total Investment */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-yellow-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <DollarSign className="w-5 h-5 text-yellow-600" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Total Investment</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">KSH {formatKenyanNumber(totalSpent)}</p>
          <p className="text-xs text-gray-400 font-normal">{shipments.length} shipments</p>
        </div>

        {/* Shipment Status */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-purple-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Shipment Status</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">{receivedShipments}/{shipments.length}</p>
          <p className="text-xs text-gray-400 font-normal">Received & Processed</p>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            Your Shipments
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mt-1">
            Record purchases and track what you send to receivers
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium text-sm w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          New Shipment
        </button>
      </div>

      {/* Shipments List */}
      <SenderShipmentList shipments={shipments} />
    </div>
  );

  // Render content based on active view
  const renderContent = () => {
    switch (activeView) {
      case 'shipments':
        return renderShipmentsView();
      case 'dashboard':
        return <ReceiverDashboard shipments={shipments} />;
      case 'inventory':
        return <InventoryPanel 
          shipments={shipments} 
        />;
      case 'customers':
        return <CustomerList customers={customers} setCustomers={setCustomers} />;
      case 'suppliers':
        return <SupplierList suppliers={suppliers} setSuppliers={setSuppliers} />;
      case 'accounting':
        return (
          <BasicAccounting 
            transactions={transactions}
            setTransactions={handleSetTransactions}
            bankAccounts={bankAccounts}
            setBankAccounts={handleSetBankAccounts}
            categories={categories}
            setCategories={setCategories}
            customers={customers}
            suppliers={suppliers}
          />
        );
      case 'income-expense':
        return (
          <IncomeExpense 
            transactions={transactions}
            setTransactions={handleSetTransactions}
            bankAccounts={bankAccounts}
            categories={categories}
            setCategories={setCategories}
          />
        );
      case 'statements':
        return (
          <StatementPage
            customers={customers}
            suppliers={suppliers}
          />
        );
      case 'debit-credit-notes':
        return (
          <DebitCreditNotes
            customers={customers}
            suppliers={suppliers}
          />
        );
      case 'invoices':
        return (
          <InvoiceManagement
            customers={customers}
          />
        );
      case 'quotations':
        return (
          <QuotationManagement
            customers={customers}
          />
        );
      case 'direct-purchase':
        return <DirectPurchase />;
      case 'ledger':
        return <LedgerManagement />;
      case 'company-details':
        return <CompanyDetails />;
      case 'transactions':
        return <TransactionManagement />;
      case 'payment-tracking':
        return <PaymentTracking />;
      case 'import-export':
        return <ImportExport />;
      case 'user-management':
        return <UserManagement />;
      case 'activity-logs':
        return <ActivityLogManagement />;
      case 'database-settings':
        return <DatabaseSettings />;
      default:
        return renderShipmentsView();
    }
  };

  return (
    <>
      <div className="flex h-screen overflow-hidden m-0 p-0">
        {/* Sidebar */}
        <ReceiverSidebar 
          activeView={activeView} 
          onViewChange={setActiveView}
          mode={activeTab === 'sender' ? 'purchase' : 'receive'}
          onModeChange={(mode) => onTabChange(mode === 'purchase' ? 'sender' : 'receiver')}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
          <div className="flex-1 w-full p-4 sm:p-6 lg:p-8 pt-4 lg:pt-6">
            {renderContent()}
          </div>
          
          {/* Footer */}
          <div className="w-full text-center py-4 px-4 text-sm text-gray-500 bg-gray-50">
            <p>2025 © All rights reserved with Sentiment AI</p>
          </div>
        </main>
      </div>

      {/* Form Modal */}
      {showForm && (
        <SenderForm
          onClose={() => setShowForm(false)}
          onSubmit={async (shipment) => {
            try {
              setSaving(true);
              console.log('Saving shipment to Firestore:', shipment);
              const shipmentId = await addShipment(shipment);
              console.log('Shipment saved successfully with ID:', shipmentId);
              
              // Create payment tracking transaction for the shipment
              if (user && shipmentId && shipment.purchaseInvoiceNumber) {
                const supplier = suppliers.find(s => s.companyName === shipment.supplier);
                if (supplier) {
                  try {
                    await createShipmentTransaction(
                      'supplier',
                      supplier.id,
                      supplier.companyName,
                      supplier.supplierCode,
                      shipment.purchaseInvoiceNumber,
                      shipment.totalCost,
                      shipment.date,
                      user.fullName
                    );
                    console.log('Payment tracking transaction created for shipment');
                  } catch (error) {
                    console.error('Error creating payment tracking transaction:', error);
                    // Don't fail the shipment creation if payment tracking fails
                  }
                }
              }
              
              onAddShipment(shipment);
              setShowForm(false);
            } catch (error) {
              console.error('Error saving shipment:', error);
              alert('Failed to save shipment. Please try again.');
            } finally {
              setSaving(false);
            }
          }}
          suppliers={suppliers}
          saving={saving}
        />
      )}
    </>
  );
}
