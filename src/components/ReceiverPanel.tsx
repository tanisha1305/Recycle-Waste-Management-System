import { useState, useEffect } from 'react';
import { TrendingDown, Package, Activity, AlertCircle } from 'lucide-react';
import ReceiptForm from './ReceiptForm';
import { Shipment } from '../types';
import ReceiverShipmentList from './ReceiverShipmentList';
import { formatKenyanNumber } from '../utils/numberFormat';
import InventoryPanel from './InventoryPanel';
import ReceiverSidebar from './ReceiverSidebar';
import ReceiverDashboard from './ReceiverDashboard';
import BasicAccounting from './BasicAccounting';
import IncomeExpense from './IncomeExpense';
import CustomerList, { Customer } from './CustomerList';
import SupplierList, { Supplier } from './SupplierList';
import StatementPage from './StatementPage';
import DebitCreditNotes from './DebitCreditNotes';
import ImportExport from './ImportExport';
import InvoiceManagement from './InvoiceManagement';
import QuotationManagement from './QuotationManagement';
import DirectPurchase from './DirectPurchase';
import LedgerManagement from './LedgerManagement';
import PaymentTracking from './PaymentTracking';
import TransactionManagement from './TransactionManagement';
import UserManagement from './UserManagement';
import CompanyDetails from './CompanyDetails';
import Settings from './Settings';
import DatabaseSettings from './DatabaseSettings';
import ActivityLogManagement from './ActivityLogManagement';
import { addShipment } from '../services/shipmentService';
import { createShipmentTransaction } from '../services/paymentTrackingService';
import { subscribeToCustomers } from '../services/customerService';
import { subscribeToTransactions } from '../services/transactionService';
import { subscribeToBankAccounts } from '../services/bankAccountService';
import { subscribeToCategories, initializeDefaultCategories } from '../services/categoryService';
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
  transferCharge?: number; // Bank transfer charge that reduces bank balance
  source?: 'basic_accounting' | 'system';
  shipmentId?: string;
  purchaseInvoiceNumber?: string; // Purchase invoice number from shipment
}

interface ReceiverPanelProps {
  shipments: Shipment[];
  onUpdateShipment: (shipment: Shipment) => void;
  onAddReceipt?: (shipment: Shipment) => void;
  suppliers: Supplier[];
  setSuppliers: (suppliers: Supplier[]) => void;
  activeTab: 'sender' | 'receiver';
  onTabChange: (tab: 'sender' | 'receiver') => void;
}

export default function ReceiverPanel({
  shipments,
  onUpdateShipment,
  onAddReceipt,
  suppliers,
  setSuppliers,
  activeTab,
  onTabChange,
}: ReceiverPanelProps) {
  const { user } = useAuth();
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [activeView, setActiveView] = useState<'shipments' | 'dashboard' | 'inventory' | 'accounting' | 'income-expense' | 'customers' | 'suppliers' | 'statements' | 'debit-credit-notes' | 'invoices' | 'quotations' | 'direct-purchase' | 'ledger' | 'company-details' | 'transactions' | 'user-management' | 'settings' | 'database-settings' | 'activity-logs' | 'payment-tracking' | 'import-export'>('shipments');
  const [savingReceipt, setSavingReceipt] = useState(false);
  
  // Shared state for transactions and bank accounts
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  
  // State for customers and suppliers
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Initialize default categories if needed and subscribe to categories
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const initCategories = async () => {
      try {
        await initializeDefaultCategories();
        
        unsubscribe = subscribeToCategories((updatedCategories) => {
          setCategories(updatedCategories);
        });
      } catch (error) {
        console.error('Error initializing categories:', error);
      }
    };
    
    initCategories();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
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
  const pendingShipments = shipments.filter((s) => s.status === 'sent');
  const receivedShipments = shipments.filter(
    (s) => s.status === 'received' || 
           s.status === 'sorting' || 
           s.status === 'crushing' || 
           s.status === 'washing' || 
           s.status === 'pelleting' || 
           s.status === 'completed'
  );

  const totalReceived = receivedShipments.reduce(
    (sum, s) => sum + (s.receivedKg || 0),
    0
  );
  const totalProcessed = receivedShipments.reduce(
    (sum, s) => sum + (s.processedKg || 0),
    0
  );
  
  // Calculate processing loss (excluding transport loss)
  const totalProcessingLoss = receivedShipments.reduce(
    (sum, s) => {
      const cumulativeLoss = s.cumulativeLossKg || 0;
      const transportLoss = s.transportLoss || 0;
      return sum + (cumulativeLoss - transportLoss);
    },
    0
  );
  
  const avgProcessingLossPercent = 
    receivedShipments.filter((s) => s.cumulativeLossPercent !== undefined && s.transportLossPercent !== undefined).length > 0
      ? receivedShipments
          .filter((s) => s.cumulativeLossPercent !== undefined && s.transportLossPercent !== undefined)
          .reduce((sum, s) => sum + ((s.cumulativeLossPercent || 0) - (s.transportLossPercent || 0)), 0) /
        receivedShipments.filter((s) => s.cumulativeLossPercent !== undefined && s.transportLossPercent !== undefined).length
      : 0;
  
  // Calculate average cumulative loss (transport + processing combined)
  const avgCumulativeLoss =
    receivedShipments.filter((s) => s.cumulativeLossPercent !== undefined).length > 0
      ? receivedShipments
          .filter((s) => s.cumulativeLossPercent !== undefined)
          .reduce((sum, s) => sum + (s.cumulativeLossPercent || 0), 0) /
        receivedShipments.filter((s) => s.cumulativeLossPercent !== undefined).length
      : 0;

  // Render shipments view (default)
  const renderShipmentsView = () => (
    <div className="space-y-6 sm:space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Pending Shipments */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-orange-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <AlertCircle className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Pending Shipments</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">{pendingShipments.length}</p>
          <p className="text-xs text-gray-400 font-normal">Awaiting receipt</p>
        </div>

        {/* Total Received */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-blue-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <Package className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Total Received</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">{formatKenyanNumber(totalReceived, 2)}</p>
          <p className="text-xs text-gray-400 font-normal">KG</p>
        </div>

        {/* Total Processed */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <Activity className="w-5 h-5" style={{ color: '#10b981' }} />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Total Processed</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-0.5">{formatKenyanNumber(totalProcessed, 2)}</p>
          <p className="text-xs text-gray-400 font-normal">
            Loss: {formatKenyanNumber(totalProcessingLoss, 2)} KG ({formatKenyanNumber(avgProcessingLossPercent, 1)}%)
          </p>
        </div>

        {/* Avg Total Loss */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-red-100 rounded-lg sm:rounded-xl flex items-center justify-center mb-2.5 sm:mb-3">
            <TrendingDown className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-normal mb-1 sm:mb-1.5">Avg Total Loss</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600 mb-0.5">
            {formatKenyanNumber(avgCumulativeLoss, 1)}%
          </p>
          <p className="text-xs text-gray-400 font-normal">Transport + Processing</p>
        </div>
      </div>

      {/* Info Banner */}
      {/* <div className="bg-blue-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-blue-100">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="flex-1">
            <h3 className="text-sm sm:text-base font-bold text-blue-900 mb-1.5 sm:mb-2">Receiver Panel</h3>
            <p className="text-xs sm:text-sm text-blue-700 leading-relaxed font-normal">
              Record what you receive from senders and track processing losses. Click on any pending shipment to mark it as received, then add processing details.
            </p>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex gap-3">
          <button onClick={() => setShowReceiptForm(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium text-sm w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            New Receipt
          </button>
        </div>
      </div> */}

      {/* Shipments List */}
      <div>
        <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">
          All Shipments
        </h2>
        <ReceiverShipmentList
          shipments={shipments}
          onUpdateShipment={onUpdateShipment}
        />
      </div>
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
            customers={customers}
            suppliers={suppliers}
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
            bankAccounts={bankAccounts}
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
      case 'payment-tracking':
        return <PaymentTracking />;
      case 'transactions':
        return (
          <TransactionManagement
            transactions={transactions}
            setTransactions={handleSetTransactions}
            bankAccounts={bankAccounts}
            customers={customers}
            suppliers={suppliers}
          />
        );
      case 'company-details':
        return <CompanyDetails />;
      case 'user-management':
        return <UserManagement />;
      case 'activity-logs':
        return <ActivityLogManagement />;
      case 'settings':
        return <Settings />;
      case 'database-settings':
        return <DatabaseSettings />;
      case 'import-export':
        return <ImportExport />;
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
            {activeView === 'settings' ? <Settings /> : renderContent()}
          </div>
          
          {/* Footer */}
          <div className="w-full text-center py-4 px-4 text-sm text-gray-500 bg-gray-50">
            <p>2025 © All rights reserved with Sentiment AI</p>
          </div>
        </main>
      </div>

      {/* Receipt Form Modal */}
      {showReceiptForm && onAddReceipt && (
        <ReceiptForm
          onClose={() => setShowReceiptForm(false)}
          onSubmit={async (s) => {
            try {
              setSavingReceipt(true);
              console.log('Saving receipt to Firestore:', s);
              const shipmentId = await addShipment(s);
              console.log('Receipt saved successfully with ID:', shipmentId);
              
              // Create payment tracking transaction for the shipment
              if (user && shipmentId && s.supplier && s.purchaseInvoiceNumber) {
                const supplier = suppliers.find(sup => sup.companyName === s.supplier);
                if (supplier) {
                  try {
                    await createShipmentTransaction(
                      'supplier',
                      supplier.id,
                      supplier.companyName,
                      supplier.supplierCode,
                      s.purchaseInvoiceNumber,
                      s.totalCost,
                      s.date,
                      user.fullName
                    );
                    console.log('Payment tracking transaction created for receipt');
                  } catch (error) {
                    console.error('Error creating payment tracking transaction:', error);
                    // Don't fail the receipt creation if payment tracking fails
                  }
                }
              }
              
              onAddReceipt!(s);
              setShowReceiptForm(false);
            } catch (error) {
              console.error('Error saving receipt:', error);
              alert('Failed to save receipt. Please try again.');
            } finally {
              setSavingReceipt(false);
            }
          }}
          saving={savingReceipt}
        />
      )}
    </>
  );
}
