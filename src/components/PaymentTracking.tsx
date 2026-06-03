import { useState, useEffect } from 'react';
import { DollarSign, Search, TrendingUp, TrendingDown, Users, Download, Filter, X, Plus, ChevronDown, ChevronRight, Printer, Trash2, Edit2 } from 'lucide-react';
import { formatKenyanNumber } from '../utils/numberFormat';
import { 
  PaymentTransaction, 
  PartyBalance
} from '../types';
import {
  subscribeToPaymentTransactions,
  subscribeToPartyBalances,
  addPaymentTransaction,
    updatePaymentTransaction,
  recalculateAllPartyBalances,
  deletePaymentTransaction
} from '../services/paymentTrackingService';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { subscribeToCompanyDetails, CompanyDetails as CompanyDetailsType } from '../services/companyService';
import { subscribeToBankAccounts, updateBankAccount } from '../services/bankAccountService';
import { addTransaction } from '../services/transactionService';
import { subscribeToCustomers } from '../services/customerService';
import { subscribeToSuppliers } from '../services/supplierService';
import { subscribeToInvoices } from '../services/invoiceService';
import { Invoice } from './InvoiceManagement';

// Customer and Supplier interfaces
interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  address: string;
  contactNumber: string;
  email: string;
  pin: string;
  vatNo: string;
  openingBalance?: number;
  createdAt: string;
}

interface Supplier {
  id: string;
  supplierCode: string;
  companyName: string;
  address: string;
  contactNumber: string;
  email: string;
  pin: string;
  vatNo: string;
  openingBalance?: number;
  createdAt: string;
}

export default function PaymentTracking() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [balances, setBalances] = useState<PartyBalance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [selectedParty, setSelectedParty] = useState<PartyBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedParty, setExpandedParty] = useState<string | null>(null);
  const [partyTransactions, setPartyTransactions] = useState<PaymentTransaction[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsType | null>(null);
  const [expandedInvoiceRef, setExpandedInvoiceRef] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Payment modal state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('bank');
  const [bankAccountId, setBankAccountId] = useState('');
  const [transferCharge, setTransferCharge] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [showPrintDropdown, setShowPrintDropdown] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentTransaction | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPrintDropdown) {
        setShowPrintDropdown(null);
      }
    };
    
    if (showPrintDropdown) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showPrintDropdown]);

  // Subscribe to company details
  useEffect(() => {
    const unsubscribe = subscribeToCompanyDetails(
      (details) => setCompanyDetails(details),
      (error) => console.error('Error loading company details:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to bank accounts
  useEffect(() => {
    const unsubscribe = subscribeToBankAccounts(
      (accounts) => setBankAccounts(accounts),
      (error) => console.error('Error loading bank accounts:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to customers
  useEffect(() => {
    const unsubscribe = subscribeToCustomers(
      (data) => setCustomers(data),
      (error) => console.error('Error loading customers:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to suppliers
  useEffect(() => {
    const unsubscribe = subscribeToSuppliers(
      (data) => setSuppliers(data),
      (error) => console.error('Error loading suppliers:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to invoices
  useEffect(() => {
    const unsubscribe = subscribeToInvoices(
      (data) => setInvoices(data),
      (error) => console.error('Error loading invoices:', error)
    );
    return () => unsubscribe();
  }, []);

  // Helper function to get CU number from invoice number
  const getCUNumber = (invoiceNumber?: string): string => {
    if (!invoiceNumber) return '-';
    const invoice = invoices.find(inv => inv.systemInvoiceNumber === invoiceNumber || inv.manualInvoiceNumber === invoiceNumber);
    return invoice?.manualInvoiceNumber || '-';
  };

  // Customers and suppliers are not directly used in this component
  // They are loaded through the payment tracking service

  // Subscribe to transactions
  useEffect(() => {
    setDataLoading(true);
    setError(null);
    const unsubscribe = subscribeToPaymentTransactions(
      activeTab === 'customers' ? 'customer' : 'supplier',
      (data: PaymentTransaction[]) => {
        try {
          // Sort by date descending (latest first)
          const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setTransactions(sorted);
          setDataLoading(false);
        } catch (err) {
          console.error('Error processing transactions:', err);
          setError('Failed to load transactions');
          setDataLoading(false);
        }
      },
      undefined,
      (error) => {
        console.error('Error loading transactions:', error);
        setError('Failed to load transactions');
        setDataLoading(false);
      }
    );
    return () => unsubscribe();
  }, [activeTab]);

  // Subscribe to balances and merge with all customers/suppliers
  useEffect(() => {
    setDataLoading(true);
    setError(null);
    const unsubscribe = subscribeToPartyBalances(
      activeTab === 'customers' ? 'customer' : 'supplier',
      (data) => {
        try {
          // Get all parties (customers or suppliers)
          const allParties = activeTab === 'customers' ? customers : suppliers;
          
          // Create a map of existing balances
          const balanceMap = new Map<string, PartyBalance>();
          data.forEach(balance => {
            balanceMap.set(balance.partyId, balance);
          });
          
          // Merge all parties with their balances (or create default balance)
          const mergedBalances: PartyBalance[] = allParties.map(party => {
            const existingBalance = balanceMap.get(party.id);
            
            if (existingBalance) {
              return existingBalance;
            } else {
              // Create default balance for party with no transactions
              return {
                id: `${activeTab === 'customers' ? 'customer' : 'supplier'}_${party.id}`,
                partyType: activeTab === 'customers' ? 'customer' : 'supplier',
                partyId: party.id,
                partyName: party.companyName,
                partyCode: activeTab === 'customers' ? (party as Customer).customerCode : (party as Supplier).supplierCode,
                openingBalance: party.openingBalance || 0,
                totalInvoiced: 0,
                totalPaid: 0,
                totalAdjustments: 0,
                totalAdvance: 0,
                advanceBalance: 0,
                balance: party.openingBalance || 0,
                lastTransactionDate: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                status: 'active'
              } as PartyBalance;
            }
          });
          
          // Sort by latest transaction date (latest first)
          const sorted = [...mergedBalances].sort((a, b) => {
            const dateA = new Date(a.lastTransactionDate || 0).getTime();
            const dateB = new Date(b.lastTransactionDate || 0).getTime();
            return dateB - dateA;
          });
          setBalances(sorted);
          setDataLoading(false);
        } catch (err) {
          console.error('Error processing balances:', err);
          setError('Failed to process balances');
          setDataLoading(false);
        }
      },
      (error) => {
        console.error('Error loading balances:', error);
        setError('Failed to load balances');
        setDataLoading(false);
      }
    );
    return () => unsubscribe();
  }, [activeTab, customers, suppliers]);

  // Filter balances based on search
  const filteredBalances = balances.filter(balance =>
    balance.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    balance.partyCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Apply filters to transactions
  const getFilteredTransactions = (partyId: string) => {
    let filtered = transactions.filter(t => t.partyId === partyId);
    
    if (filterDateFrom) {
      filtered = filtered.filter(t => new Date(t.date) >= new Date(filterDateFrom));
    }
    if (filterDateTo) {
      filtered = filtered.filter(t => new Date(t.date) <= new Date(filterDateTo));
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => t.status === filterStatus);
    }
    
    return filtered;
  };

  // Consolidate transactions by invoice reference
  interface ConsolidatedTransaction {
    referenceNumber: string;
    date: string; // Invoice date (not latest transaction date)
    type: 'invoice' | 'payment';
    description: string;
    totalAmount: number; // Total invoice amount
    amountPaidTillNow: number; // Total payments made
    amountRemaining: number; // Remaining balance
    status: 'UNPAID' | 'PARTIAL' | 'PAID';
    transactions: PaymentTransaction[]; // All related transactions
  }

  const consolidateTransactions = (txns: PaymentTransaction[], partyBalance?: PartyBalance): ConsolidatedTransaction[] => {
    // First, separate invoices, payments, and adjustments (debit/credit notes)
    const invoices = txns.filter(t => t.transactionType === 'invoice');
    const payments = txns.filter(t => t.transactionType === 'payment' && t.status === 'completed');
    const adjustments = txns.filter(t => t.transactionType === 'adjustment' && t.status === 'completed');
    
    const consolidated: ConsolidatedTransaction[] = [];
    
    // CRITICAL FIX: Separate advance payments (payments without invoice reference OR flagged as advance)
    // Advance payments should ALWAYS be displayed separately, never merged with invoices
    const advancePayments = payments.filter(p => !p.referenceNumber || p.isAdvancePayment);
    const regularPayments = payments.filter(p => p.referenceNumber && !p.isAdvancePayment);
    
    // Calculate how much payment went to opening balance vs invoices
    const openingBalance = partyBalance?.openingBalance || 0;
    
    // Calculate total regular payments and adjustments (not linked to specific invoices)
    const unlinkedRegularPayments = regularPayments.filter(p => !invoices.some(inv => inv.referenceNumber === p.referenceNumber));
    const unlinkedAdjustments = adjustments.filter(a => !a.referenceNumber);
    
    const totalUnlinkedRegularPayments = unlinkedRegularPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalUnlinkedAdjustments = unlinkedAdjustments.reduce((sum, a) => sum + Math.abs(a.amount), 0);
    
    // Calculate advance payment amounts
    const totalAdvancePayments = advancePayments.reduce((sum, p) => sum + p.amount, 0);
    
    // NEW FIX: Advance payments FIRST settle opening balance, then apply to invoices
    let advanceUsedForOpeningBalance = 0;
    let advanceForInvoices = 0;
    
    if (openingBalance > 0) {
      // Check if regular payments already covered opening balance
      const regularPaymentsForOpening = Math.min(totalUnlinkedRegularPayments + totalUnlinkedAdjustments, openingBalance);
      const openingBalanceAfterRegularPayments = openingBalance - regularPaymentsForOpening;
      
      if (openingBalanceAfterRegularPayments > 0) {
        // Opening balance still has remaining amount - use advance to settle it
        advanceUsedForOpeningBalance = Math.min(totalAdvancePayments, openingBalanceAfterRegularPayments);
        advanceForInvoices = totalAdvancePayments - advanceUsedForOpeningBalance;
      } else {
        // Opening balance already fully settled by regular payments
        advanceUsedForOpeningBalance = 0;
        advanceForInvoices = totalAdvancePayments;
      }
    } else {
      // No opening balance, all advance goes to invoices
      advanceUsedForOpeningBalance = 0;
      advanceForInvoices = totalAdvancePayments;
    }
    
    // Regular payments first cover opening balance, remainder goes to invoices
    let paymentsForInvoices = 0;
    
    if (openingBalance > 0) {
      // Some or all regular payments went towards opening balance
      paymentsForInvoices = Math.max(0, totalUnlinkedRegularPayments + totalUnlinkedAdjustments - openingBalance);
    } else {
      // All regular payments go towards invoices
      paymentsForInvoices = totalUnlinkedRegularPayments + totalUnlinkedAdjustments;
    }
    
    // Track remaining unlinked payments (not assigned to specific invoices)
    let remainingUnlinkedPayments = paymentsForInvoices;
    
    // Track remaining advance payment amounts (AFTER opening balance settlement)
    let totalRemainingAdvance = advanceForInvoices;
    
    // Sort invoices by date (oldest first) for chronological payment application
    const sortedInvoices = [...invoices].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Process each invoice in chronological order
    sortedInvoices.forEach(invoice => {
      const invoiceRef = invoice.referenceNumber;
      
      // Find all payments and adjustments directly linked to this invoice
      const relatedPayments = regularPayments.filter(p => p.referenceNumber === invoiceRef);
      const relatedAdjustments = adjustments.filter(a => a.referenceNumber === invoiceRef);
      
      // Calculate payments directly linked to this invoice
      const totalDirectPayments = relatedPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalDirectAdjustments = relatedAdjustments.reduce((sum, a) => sum + Math.abs(a.amount), 0);
      
      const invoiceAmount = invoice.amount;
      let totalPaidToInvoice = totalDirectPayments + totalDirectAdjustments;
      let remainingToPay = Math.max(0, invoiceAmount - totalPaidToInvoice);
      
      // Apply unlinked regular payments chronologically
      if (remainingToPay > 0 && remainingUnlinkedPayments > 0) {
        const amountToApply = Math.min(remainingUnlinkedPayments, remainingToPay);
        totalPaidToInvoice += amountToApply;
        remainingToPay -= amountToApply;
        remainingUnlinkedPayments -= amountToApply;
      }
      
      // Apply advance payments if there's still a remaining balance
      if (remainingToPay > 0 && totalRemainingAdvance > 0) {
        const amountToApply = Math.min(totalRemainingAdvance, remainingToPay);
        totalPaidToInvoice += amountToApply;
        remainingToPay -= amountToApply;
        totalRemainingAdvance -= amountToApply;
      }
      
      // CRITICAL FIX: Calculate remaining amount correctly
      const remaining = invoiceAmount - totalPaidToInvoice;
      
      // Use the invoice date (not the latest transaction date)
      const invoiceDate = invoice.date;
      
      // CRITICAL FIX: Determine status based on actual remaining amount
      let status: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';
      if (remaining <= 0.01) { // Less than or equal to 1 cent remaining means fully paid
        status = 'PAID';
      } else if (totalPaidToInvoice >= 0.01) { // Some payment received means partial
        status = 'PARTIAL';
      }
      
      consolidated.push({
        referenceNumber: invoiceRef || `INV-${invoice.id}`,
        date: invoiceDate,
        type: 'invoice',
        description: invoice.description,
        totalAmount: invoiceAmount,
        amountPaidTillNow: totalPaidToInvoice,
        amountRemaining: Math.max(0, remaining), // Ensure non-negative
        status,
        transactions: [invoice, ...relatedPayments, ...relatedAdjustments]
      });
    });
    
    // NEW FIX: Add Opening Balance Settlement entry if advance was used to settle it
    if (openingBalance > 0 && advanceUsedForOpeningBalance > 0) {
      // Find the earliest advance payment for reference
      const earliestAdvance = advancePayments.length > 0 
        ? advancePayments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
        : null;
      
      if (earliestAdvance) {
        consolidated.push({
          referenceNumber: 'OPENING-SETTLEMENT',
          date: earliestAdvance.date,
          type: 'payment',
          description: `Opening Balance Settlement (from Advance Payment)`,
          totalAmount: advanceUsedForOpeningBalance,
          amountPaidTillNow: advanceUsedForOpeningBalance,
          amountRemaining: 0,
          status: 'PAID',
          transactions: [earliestAdvance]
        });
      }
    }
    
    // CRITICAL FIX: ALWAYS show ALL advance payments as separate entries
    // They should be visible regardless of whether they've been applied to invoices
    advancePayments.forEach(advPayment => {
      consolidated.push({
        referenceNumber: advPayment.paymentReference || `ADVANCE-${advPayment.id.substring(0, 6)}`,
        date: advPayment.date,
        type: 'payment',
        description: advPayment.description || `Advance Payment`,
        totalAmount: advPayment.amount,
        amountPaidTillNow: advPayment.amount,
        amountRemaining: 0,
        status: 'PAID',
        transactions: [advPayment]
      });
    });
    
    // Add other unlinked regular payments (if any somehow exist without invoice reference and not flagged as advance)
    unlinkedRegularPayments.forEach(payment => {
      consolidated.push({
        referenceNumber: payment.paymentReference || `PAYMENT-${payment.id.substring(0, 6)}`,
        date: payment.date,
        type: 'payment',
        description: payment.description,
        totalAmount: payment.amount,
        amountPaidTillNow: payment.amount,
        amountRemaining: 0,
        status: 'PAID',
        transactions: [payment]
      });
    });

    // Add ONLY unlinked adjustments (credit/debit notes) as separate top-level rows
    // Adjustments linked to invoices are already included in the invoice's payment details
    unlinkedAdjustments.forEach(adjustment => {
      // Use the note number from paymentReference if available, otherwise generate one
      const noteNumber = adjustment.paymentReference || `${adjustment.paymentMethod === 'DB Note' ? 'DBN' : 'CRN'}-${adjustment.id.substring(0, 6)}`;
      
      consolidated.push({
        referenceNumber: noteNumber,
        date: adjustment.date,
        type: 'payment',
        description: adjustment.description,
        totalAmount: Math.abs(adjustment.amount),
        amountPaidTillNow: Math.abs(adjustment.amount),
        amountRemaining: 0,
        status: 'PAID',
        transactions: [adjustment]
      });
    });

    // Sort by createdAt timestamp descending (latest first) for consistent ordering
    // This ensures the most recently created transactions appear at the top
    return consolidated.sort((a, b) => {
      // Get the latest createdAt timestamp from each consolidated entry's transactions
      const latestCreatedAtA = Math.max(...a.transactions.map(t => 
        t.createdAt ? new Date(t.createdAt).getTime() : 0
      ));
      const latestCreatedAtB = Math.max(...b.transactions.map(t => 
        t.createdAt ? new Date(t.createdAt).getTime() : 0
      ));
      
      // Primary sort: by createdAt timestamp (latest first)
      if (latestCreatedAtB !== latestCreatedAtA) {
        return latestCreatedAtB - latestCreatedAtA;
      }
      
      // Secondary sort: by transaction date (latest first)
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      
      // Tertiary sort: by ID (newer IDs typically come later alphabetically)
      const idA = a.transactions[0]?.id || '';
      const idB = b.transactions[0]?.id || '';
      return idB.localeCompare(idA);
    });
  };

  // Handle showing payment details
  const handleTogglePaymentDetails = (referenceNumber: string) => {
    if (expandedInvoiceRef === referenceNumber) {
      setExpandedInvoiceRef(null);
    } else {
      setExpandedInvoiceRef(referenceNumber);
    }
  };

  // Calculate summary statistics
  const summaryStats = {
    totalOutstanding: balances.reduce((sum, b) => sum + (b.balance > 0 ? b.balance : 0), 0),
    totalOverdue: balances.filter(b => b.status === 'overdue').reduce((sum, b) => sum + b.balance, 0),
    totalAdvance: balances.reduce((sum, b) => sum + b.totalAdvance, 0),
    activeParties: balances.filter(b => b.status === 'active').length,
  };

  // Handle expand/collapse party
  const handleToggleParty = (partyId: string) => {
    if (expandedParty === partyId) {
      setExpandedParty(null);
      setPartyTransactions([]);
      setExpandedInvoiceRef(null);
    } else {
      setExpandedParty(partyId);
      // Dynamically get latest transactions for this party
      const filtered = getFilteredTransactions(partyId);
      setPartyTransactions(filtered);
      setExpandedInvoiceRef(null);
    }
  };

  // Refresh party transactions when transactions change or filters change
  useEffect(() => {
    if (expandedParty) {
      const filtered = getFilteredTransactions(expandedParty);
      setPartyTransactions(filtered);
    }
  }, [transactions, expandedParty, filterDateFrom, filterDateTo, filterStatus]);

  // Handle add payment
  const handleOpenPaymentModal = (balance: PartyBalance) => {
    setSelectedParty(balance);
      setEditingPayment(null);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('bank');
    setBankAccountId('');
    setTransferCharge('');
    setPaymentReference('');
    setPaymentNotes('');
    setSelectedInvoiceId('');
    
    // Load transactions for this party to populate invoice dropdown
    // Use fresh transactions from state to ensure latest credit/debit notes are included
    const filtered = getFilteredTransactions(balance.partyId);
    setPartyTransactions(filtered);
    
    // Small delay to ensure state is fully updated before opening modal
    setTimeout(() => {
      setShowAddPaymentModal(true);
    }, 50);
  };

  // Handle edit payment
  const handleEditPayment = (payment: PaymentTransaction, balance: PartyBalance) => {
    setEditingPayment(payment);
    setSelectedParty(balance);
    setPaymentAmount(payment.amount.toString());
    setPaymentDate(payment.date);
    setPaymentMethod(payment.bankAccountId ? 'bank' : 'cash');
    setBankAccountId(payment.bankAccountId || '');
    setTransferCharge(payment.transferCharge?.toString() || '');
    setPaymentReference(payment.paymentReference || '');
    setPaymentNotes(payment.notes || '');
    setSelectedInvoiceId(payment.referenceNumber || '');

    const filtered = getFilteredTransactions(balance.partyId);
    setPartyTransactions(filtered);

    setTimeout(() => {
      setShowAddPaymentModal(true);
    }, 50);
  };

  const handleSavePayment = async () => {
    if (!selectedParty || !user) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    // Validate bank account selection if payment method is bank
    if (paymentMethod === 'bank' && !bankAccountId) {
      alert('Please select a bank account for bank transfer');
      return;
    }

    try {
      setLoading(true);

      // Get bank account name if bank payment
      let bankAccountName = '';
      if (paymentMethod === 'bank' && bankAccountId) {
        const account = bankAccounts.find(acc => acc.id === bankAccountId);
        bankAccountName = account ? account.accountName : '';
      }

      // Parse transfer charge
      const transferChargeAmount = transferCharge ? parseFloat(transferCharge) : 0;

      // Create payment transaction in payment tracking ONLY
      // Payment tracking is for tracking payment flow, not creating accounting entries
      const invoiceRef = selectedInvoiceId || undefined;
      
      // Check if balance is negative (business owes customer/supplier)
      // In this case, we're paying them back, so create a negative adjustment to reduce totalAdjustments
      // This keeps "Received" amount unchanged and only affects "To Receive"
      const isPayingBack = selectedParty.balance < 0;
      const transactionType = isPayingBack ? 'adjustment' : 'payment';
      
      // Build transaction object and remove undefined fields
      // If payment has no invoice reference, it's automatically treated as advance payment
      const isAdvancePayment = !invoiceRef;

      // EDIT MODE: Delete old entry first, then create updated entry
      // This ensures party balances and bank entries are recalculated correctly
      if (editingPayment) {
        await deletePaymentTransaction(editingPayment.id);
        console.log('✓ Deleted old payment entry for edit');
      }
      
      const transactionData: any = {
        date: paymentDate,
        partyType: selectedParty.partyType,
        partyId: selectedParty.partyId,
        partyName: selectedParty.partyName,
        partyCode: selectedParty.partyCode,
        transactionType: transactionType,
        referenceType: invoiceRef ? 'invoice' : 'direct-payment',
        amount: isPayingBack ? -amount : amount, // Negative amount for payback reduces adjustments
        paymentMethod: paymentMethod as any,
        description: isPayingBack 
          ? (selectedParty.partyType === 'customer'
              ? `Payback to ${selectedParty.partyName} for returned goods${invoiceRef ? ` (Invoice ${invoiceRef})` : ''}`
              : `Payment received from ${selectedParty.partyName} for returned goods${invoiceRef ? ` (Invoice ${invoiceRef})` : ''}`)
          : (isAdvancePayment 
              ? `Advance Payment ${selectedParty.partyType === 'customer' ? 'received from' : 'made to'} ${selectedParty.partyName}`
              : `Payment ${selectedParty.partyType === 'customer' ? 'received from' : 'made to'} ${selectedParty.partyName} for Invoice ${invoiceRef}`),
        status: 'completed'
      };
      
      // Add optional fields only if they have values
      if (invoiceRef) transactionData.referenceNumber = invoiceRef;
      if (isAdvancePayment) transactionData.isAdvancePayment = true;
      if (paymentMethod === 'bank' && bankAccountId) {
        transactionData.bankAccountId = bankAccountId;
        transactionData.bankAccountName = bankAccountName;
      }
      if (transferChargeAmount > 0) transactionData.transferCharge = transferChargeAmount;
      if (paymentReference) transactionData.paymentReference = paymentReference;
      if (paymentNotes) transactionData.notes = paymentNotes;
      
      // Create the payment transaction first and get its ID
      const paymentId = await addPaymentTransaction(transactionData, user.fullName);

      // Create contra entry in bank/cash book (for record keeping, doesn't affect income/expense)
      try {
        const contraTransactionId = await addTransaction({
          date: paymentDate,
          description: isPayingBack
            ? (selectedParty.partyType === 'customer'
                ? `Refund payment to ${selectedParty.partyName}${invoiceRef ? ` for Invoice ${invoiceRef}` : ''}`
                : `Payment received from ${selectedParty.partyName} for returned goods${invoiceRef ? ` (Invoice ${invoiceRef})` : ''}`)
            : (isAdvancePayment
                ? `Advance Payment ${selectedParty.partyType === 'customer' ? 'received from' : 'made to'} ${selectedParty.partyName}${invoiceRef ? ` for Invoice ${invoiceRef}` : ''}`
                : `Payment ${selectedParty.partyType === 'customer' ? 'received from' : 'made to'} ${selectedParty.partyName}${invoiceRef ? ` for Invoice ${invoiceRef}` : ''}`),
          type: isPayingBack 
            ? (selectedParty.partyType === 'customer' ? 'debit' : 'credit')
            : (selectedParty.partyType === 'customer' ? 'credit' : 'debit'),
          contraType: 'contra-entry',
          amount: amount,
          category: isAdvancePayment ? 'Advance Payment' : 'Payment',
          paymentMethod: paymentMethod === 'bank' ? bankAccountName : 'cash',
          bankAccountId: paymentMethod === 'bank' ? bankAccountId : undefined,
          senderName: isPayingBack
            ? (selectedParty.partyType === 'customer' ? undefined : selectedParty.partyName)
            : (selectedParty.partyType === 'customer' ? selectedParty.partyName : undefined),
          receiverName: isPayingBack
            ? (selectedParty.partyType === 'customer' ? selectedParty.partyName : undefined)
            : (selectedParty.partyType === 'supplier' ? selectedParty.partyName : undefined),
          transferCharge: transferChargeAmount > 0 ? transferChargeAmount : undefined,
          source: 'system'
        } as any);
        console.log('✓ Payment recorded in bank/cash book as contra entry');
        
        // Update the payment transaction with the contraTransactionId for easy deletion later
        await updatePaymentTransaction(paymentId, { contraTransactionId });
        console.log('✓ Linked payment to bank transaction');
      } catch (error) {
        console.error('Error creating contra entry:', error);
        // Don't fail the payment if contra entry creation fails
      }

      const successMessage = isPayingBack 
        ? (selectedParty.partyType === 'customer' ? 'Refund recorded successfully!' : 'Payment received successfully!')
        : 'Payment recorded successfully!';
      const finalMessage = editingPayment ? 'Payment updated successfully!' : successMessage;
      alert(finalMessage);
      setShowAddPaymentModal(false);
      setEditingPayment(null);
      setSelectedInvoiceId('');
      
      // Note: Party transactions will be automatically refreshed via the useEffect
      // that watches the transactions state (updated by Firestore subscription)
    } catch (error) {
      console.error('Error saving payment:', error);
      alert('Failed to save payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Generate Short Statement PDF (invoice-level summary only)
  const generateShortStatementPDF = (balance: PartyBalance) => {
    const partyTxns = getFilteredTransactions(balance.partyId);
    const consolidated = consolidateTransactions(partyTxns);
    
    // Calculate aging buckets
    const today = new Date();
    const aging = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0
    };

    // Build transaction records with running balance
    const transactionRecords: Array<{
      date: string;
      transaction: string;
      amountDue: number;
      amountEnc: number;
      balance: number;
    }> = [];

    let runningBalance = balance.openingBalance || 0;

    // Sort all consolidated transactions by date
    const sortedConsolidated = [...consolidated].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Add opening balance if it exists
    if (balance.openingBalance && balance.openingBalance !== 0) {
      transactionRecords.push({
        date: sortedConsolidated.length > 0 ? sortedConsolidated[0].date : new Date().toISOString(),
        transaction: 'Opening Balance',
        amountDue: balance.openingBalance > 0 ? balance.openingBalance : 0,
        amountEnc: balance.openingBalance < 0 ? Math.abs(balance.openingBalance) : 0,
        balance: balance.openingBalance
      });
    }

    // Process each transaction
    sortedConsolidated.forEach(item => {
      const itemDate = new Date(item.date);
      const daysOld = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Add invoice/charge
      runningBalance += item.totalAmount;
      transactionRecords.push({
        date: item.date,
        transaction: item.type.toUpperCase() + ': ' + item.referenceNumber,
        amountDue: item.totalAmount,
        amountEnc: 0,
        balance: runningBalance
      });

      // Calculate aging for unpaid amount
      if (item.amountRemaining > 0) {
        if (daysOld <= 0) {
          aging.current += item.amountRemaining;
        } else if (daysOld <= 30) {
          aging.days1to30 += item.amountRemaining;
        } else if (daysOld <= 60) {
          aging.days31to60 += item.amountRemaining;
        } else if (daysOld <= 90) {
          aging.days61to90 += item.amountRemaining;
        } else {
          aging.over90 += item.amountRemaining;
        }
      }

      // Add payments
      const payments = item.transactions.filter(t => t.transactionType === 'payment');
      payments.forEach(payment => {
        runningBalance -= payment.amount;
        transactionRecords.push({
          date: payment.date,
          transaction: 'PMT: ' + (payment.paymentMethod || 'Payment') + (payment.paymentReference ? ' - ' + payment.paymentReference : ''),
          amountDue: 0,
          amountEnc: payment.amount,
          balance: runningBalance
        });
      });

      // Add adjustments
      const adjustments = item.transactions.filter(t => t.transactionType === 'adjustment');
      adjustments.forEach(adjustment => {
        runningBalance += adjustment.amount; // adjustments can be negative or positive
        transactionRecords.push({
          date: adjustment.date,
          transaction: (adjustment.paymentMethod || 'ADJUSTMENT') + (adjustment.paymentReference ? ': ' + adjustment.paymentReference : ''),
          amountDue: adjustment.amount > 0 ? adjustment.amount : 0,
          amountEnc: adjustment.amount < 0 ? Math.abs(adjustment.amount) : 0,
          balance: runningBalance
        });
      });
    });
    
    // Calculate final balance from filtered records (excluding PMT: entries)
    const filteredRecords = transactionRecords.filter(record => !record.transaction.startsWith('PMT:'));
    let finalBalance = 0;
    filteredRecords.forEach((record, index) => {
      const isPaymentEntry = record.transaction.startsWith('PAYMENT');
      if (index === 0 && record.transaction === 'Opening Balance') {
        finalBalance = record.balance;
      } else if (isPaymentEntry) {
        finalBalance -= record.amountDue;
      } else {
        finalBalance += (record.amountDue - record.amountEnc);
      }
    });
    
    // Create a hidden iframe for printing
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);
    
    const doc = printFrame.contentWindow?.document;
    if (!doc) return;
    
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Statement - ${balance.partyName}</title>
        <style>
          @media print {
            @page { 
              margin: 10mm 8mm; 
              size: A4 portrait; 
            }
            body { 
              margin: 0; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          
          body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            font-size: 9pt;
            color: #000;
            background: #fff;
            padding: 15px;
            line-height: 1.3;
          }
          
          .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
          }

          .company-header {
            flex: 1;
          }
          
          .company-header h1 {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 3px;
          }
          
          .company-info {
            font-size: 8pt;
            color: #000;
            line-height: 1.4;
          }

          .statement-title {
            text-align: right;
            flex: 0 0 auto;
          }

          .statement-title h2 {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 10px;
          }

          .date-box {
            border: 1px solid #000;
            padding: 5px 10px;
            text-align: center;
            min-width: 120px;
          }

          .date-label {
            font-size: 7pt;
            margin-bottom: 2px;
          }

          .date-value {
            font-size: 9pt;
            font-weight: bold;
          }
          
          .details-box {
            border: 1px solid #000;
            padding: 8px 12px;
            margin: 15px 0;
            background: #fff;
          }
          
          .details-title {
            font-size: 8pt;
            margin-bottom: 3px;
          }

          .details-content {
            font-size: 9pt;
            font-weight: bold;
          }

          .amount-header {
            display: flex;
            justify-content: flex-end;
            gap: 20px;
            margin: 15px 0 10px 0;
            padding: 8px 12px;
            border: 1px solid #000;
          }

          .amount-item {
            text-align: center;
          }

          .amount-label {
            font-size: 8pt;
            margin-bottom: 2px;
          }

          .amount-value {
            font-size: 10pt;
            font-weight: bold;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            font-size: 8pt;
            page-break-inside: auto;
          }
          
          th {
            background: #fff;
            color: #000;
            padding: 6px 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #000;
            font-size: 8pt;
            page-break-after: avoid;
          }
          
          td {
            padding: 5px 8px;
            border: 1px solid #000;
            vertical-align: top;
            font-size: 8pt;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          tbody tr {
            background: #fff;
          }
          
          .text-right { 
            text-align: right; 
          }
          
          .text-center { 
            text-align: center; 
          }

          .aging-table {
            width: 100%;
            margin-top: 20px;
            border-collapse: collapse;
          }

          .aging-table th {
            background: #fff;
            border: 1px solid #000;
            padding: 8px;
            font-size: 7pt;
            text-align: center;
            font-weight: bold;
          }

          .aging-table td {
            border: 1px solid #000;
            padding: 8px;
            font-size: 9pt;
            text-align: center;
            font-weight: bold;
          }
          
          .footer {
            margin-top: 20px;
            padding-top: 10px;
            text-align: center;
            font-size: 7pt;
            color: #000;
          }
        </style>
      </head>
      <body>
        <!-- Header Section -->
        <div class="header-section">
          <div class="company-header">
            <h1>${companyDetails?.companyName || 'Company Name'}</h1>
            <div class="company-info">
              ${companyDetails?.address || 'P O Box xxxxx - 00000'}<br>
              ${companyDetails?.address ? companyDetails.address.split(',')[companyDetails.address.split(',').length - 1].trim() : 'City'}
            </div>
          </div>
          <div class="statement-title">
            <h2>Statement</h2>
            <div class="date-box">
              <div class="date-label">Date</div>
              <div class="date-value">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            </div>
          </div>
        </div>
        
        <!-- Party Details Box -->
        <div class="details-box">
          <div class="details-title">To</div>
          <div class="details-content">${balance.partyName}</div>
          <div class="details-content">PIN: ${balance.partyCode}</div>
        </div>

        <!-- Amount Header -->
        <div class="amount-header">
          <div class="amount-item">
            <div class="amount-label">Amount Due</div>
            <div class="amount-value">KES ${formatKenyanNumber(finalBalance)}</div>
          </div>
          <div class="amount-item">
            <div class="amount-label">Amount Enc</div>
            <div class="amount-value"></div>
          </div>
        </div>
        
        <!-- Transaction History Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Date</th>
              <th style="width: 46%;">Transaction</th>
              <th class="text-right" style="width: 14%;">Amount</th>
              <th class="text-right" style="width: 14%;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const filteredRecords = transactionRecords.filter(record => !record.transaction.startsWith('PMT:'));
              let recalculatedBalance = 0;
              
              return filteredRecords.map((record, index) => {
                const isPaymentEntry = record.transaction.startsWith('PAYMENT');
                
                // Recalculate balance: subtract for PAYMENT entries, add for others
                if (index === 0 && record.transaction === 'Opening Balance') {
                  recalculatedBalance = record.balance;
                } else if (isPaymentEntry) {
                  recalculatedBalance -= record.amountDue;
                } else {
                  recalculatedBalance += (record.amountDue - record.amountEnc);
                }
                
                return `
                  <tr>
                    <td>${new Date(record.date).toLocaleDateString('en-GB')}</td>
                    <td>${record.transaction}</td>
                    <td class="text-right">${isPaymentEntry && record.amountDue > 0 ? '-' + formatKenyanNumber(record.amountDue) : (record.amountDue > 0 ? formatKenyanNumber(record.amountDue) : (record.amountEnc > 0 ? '-' + formatKenyanNumber(record.amountEnc) : '0.00'))}</td>
                    <td class="text-right">${formatKenyanNumber(recalculatedBalance)}</td>
                  </tr>
                `;
              }).join('');
            })()}
          </tbody>
        </table>
        
        <!-- Aging Table -->
        <table class="aging-table">
          <thead>
            <tr>
              <th>CURRENT</th>
              <th>1-30 DAYS PAST<br>DUE</th>
              <th>31-60 DAYS PAST<br>DUE</th>
              <th>61-90 DAYS PAST<br>DUE</th>
              <th>OVER 90 DAYS<br>PAST DUE</th>
              <th>Amount Due</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${formatKenyanNumber(aging.current)}</td>
              <td>${formatKenyanNumber(aging.days1to30)}</td>
              <td>${formatKenyanNumber(aging.days31to60)}</td>
              <td>${formatKenyanNumber(aging.days61to90)}</td>
              <td>${formatKenyanNumber(aging.over90)}</td>
              <td>KES ${formatKenyanNumber(finalBalance)}</td>
            </tr>
          </tbody>
        </table>
        
        <!-- Footer -->
        <div class="footer">
          Generated on: ${new Date().toLocaleString('en-GB')}
        </div>
      </body>
      </html>
    `);
    doc.close();
    
    // Wait for content to load then print
    printFrame.contentWindow?.focus();
    setTimeout(() => {
      printFrame.contentWindow?.print();
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 100);
    }, 250);
  };

  // Generate PDF report for individual party with detailed payment records
  const generatePartyStatementPDF = (balance: PartyBalance) => {
    const partyTxns = getFilteredTransactions(balance.partyId);
    const consolidated = consolidateTransactions(partyTxns);
    
    // Create a hidden iframe for printing
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);
    
    const doc = printFrame.contentWindow?.document;
    if (!doc) return;
    
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Detailed Statement - ${balance.partyName}</title>
        <style>
          @media print {
            @page { 
              margin: 10mm 8mm; 
              size: A4 portrait; 
            }
            body { 
              margin: 0; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          
          body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            font-size: 9pt;
            color: #000;
            background: #fff;
            padding: 15px;
            line-height: 1.3;
          }
          
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
          }
          
          .header h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-bottom: 5px;
            text-transform: uppercase;
          }
          
          .header .subtitle {
            font-size: 14pt;
            color: #000;
            margin-bottom: 8px;
            font-weight: bold;
          }
          
          .company-info {
            font-size: 9pt;
            color: #000;
            line-height: 1.5;
          }
          
          .details-box {
            border: 2px solid #000;
            padding: 10px 15px;
            margin: 15px 0;
            background: #fff;
          }
          
          .details-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 10pt;
          }
          
          .details-label {
            font-weight: bold;
          }
          
          .details-value {
            text-align: right;
          }
          
          .section-title {
            font-size: 11pt;
            font-weight: bold;
            margin: 15px 0 8px 0;
            padding-bottom: 3px;
            border-bottom: 2px solid #000;
            text-transform: uppercase;
          }

          .invoice-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }

          .invoice-header {
            background: #e0e0e0;
            padding: 8px 10px;
            margin-bottom: 8px;
            border: 2px solid #000;
            font-size: 9pt;
            font-weight: bold;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
            font-size: 7pt;
            table-layout: fixed;
            page-break-inside: auto;
          }
          
          th {
            background: #000;
            color: #fff;
            padding: 6px 4px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #000;
            font-size: 7pt;
            word-wrap: break-word;
            page-break-after: avoid;
          }
          
          td {
            padding: 4px;
            border: 1px solid #000;
            word-wrap: break-word;
            overflow-wrap: break-word;
            vertical-align: top;
            font-size: 7pt;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          tbody tr:nth-child(odd) {
            background: #fff;
          }
          
          tbody tr:nth-child(even) {
            background: #f9f9f9;
          }
          
          .text-right { 
            text-align: right; 
          }
          
          .text-center { 
            text-align: center; 
          }

          .adjustment-text {
            font-weight: bold;
          }

          .invoice-summary {
            background: #f0f0f0;
            padding: 6px 8px;
            margin-top: 8px;
            border: 1px solid #666;
            font-size: 8pt;
            display: flex;
            justify-content: space-between;
          }
          
          .summary-table {
            width: 60%;
            margin-left: auto;
            page-break-inside: avoid;
            table-layout: fixed;
          }
          
          .summary-table td {
            padding: 10px;
            border: 2px solid #000;
            font-size: 10pt;
          }
          
          .summary-table .total-row {
            background: #000;
            color: #fff;
            font-weight: bold;
            font-size: 11pt;
          }
          
          .bottom-section {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #fff;
            padding: 15px;
          }
          
          .footer {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 8pt;
            color: #000;
          }
          
          .content-spacer {
            height: 200px;
          }


        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <h1>${companyDetails?.companyName || 'DONATO IMPEX LIMITED'}</h1>
          <div class="subtitle">Detailed Statement</div>
          <div class="company-info">
            ${companyDetails?.address || 'P.O BOX 12345, NAIROBI'}<br>
            Tel: ${companyDetails?.mobile || '+254 733 777 778'} | Email: ${companyDetails?.email || 'donatoimpexltd@gmail.com'}<br>
            PIN: ${companyDetails?.companyPIN || 'P052210686Q'}
          </div>
        </div>
        
        <!-- Party Details -->
        <div class="details-box">
          <div class="details-row">
            <div class="details-label">${balance.partyType === 'customer' ? 'Customer' : 'Supplier'} Name:</div>
            <div class="details-value"><strong>${balance.partyName}</strong></div>
          </div>
          <div class="details-row">
            <div class="details-label">${balance.partyType === 'customer' ? 'Customer' : 'Supplier'} Code:</div>
            <div class="details-value">${balance.partyCode}</div>
          </div>
          <div class="details-row">
            <div class="details-label">Statement Date:</div>
            <div class="details-value">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
          </div>
          <div class="details-row">
            <div class="details-label">Status:</div>
            <div class="details-value"><strong>${balance.status.toUpperCase()}</strong></div>
          </div>
        </div>
        
        <!-- Detailed Transaction History -->
        <div class="section-title">Detailed Transaction Records</div>
        <table>
          <thead>
            <tr>
              <th style="width: 4%;">#</th>
              <th style="width: 10%;">Date</th>
              <th style="width: 13%;">Method/Type</th>
              <th style="width: 13%;">Reference</th>
              <th style="width: 28%;">Invoice Info</th>
              <th style="width: 13%;">Notes</th>
              <th class="text-right" style="width: 9%;">Amount</th>
              <th class="text-right" style="width: 10%;">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              let globalRowNumber = 0;
              let globalCumulative = balance.openingBalance || 0;
              
              // Add opening balance row if exists
              let openingBalanceRow = '';
              if (balance.openingBalance && balance.openingBalance !== 0) {
                globalRowNumber++;
                openingBalanceRow = `
                  <tr>
                    <td class="text-center"><strong>${globalRowNumber}</strong></td>
                    <td>-</td>
                    <td style="font-size: 6.5pt;"><strong>Opening Balance</strong></td>
                    <td>-</td>
                    <td style="font-size: 6.5pt;"><strong>Initial Balance Carried Forward</strong></td>
                    <td style="font-size: 6.5pt;">-</td>
                    <td class="text-right"><strong>KSh ${formatKenyanNumber(Math.abs(balance.openingBalance))}</strong></td>
                    <td class="text-right"><strong>KSh ${formatKenyanNumber(globalCumulative)}</strong></td>
                  </tr>
                `;
              }
              
              const transactionRows = consolidated.map(invoiceData => {
                const payments = invoiceData.transactions.filter(t => t.transactionType === 'payment');
                const adjustments = invoiceData.transactions.filter(t => t.transactionType === 'adjustment');
                const allPaymentsAndAdjustments = [...payments, ...adjustments].sort((a, b) => 
                  new Date(a.date).getTime() - new Date(b.date).getTime()
                );

                const invoiceInfo = `${invoiceData.referenceNumber} | Invoice Date: ${new Date(invoiceData.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} | Amount: KSh ${formatKenyanNumber(invoiceData.totalAmount)} | Status: ${invoiceData.status}`;

                return allPaymentsAndAdjustments.map((transaction) => {
                  globalRowNumber++;
                  const isAdjustment = transaction.transactionType === 'adjustment';
                  globalCumulative += (transaction.transactionType === 'payment' ? transaction.amount : Math.abs(transaction.amount));
                  
                  let methodDisplay = '';
                  if (isAdjustment) {
                    if (transaction.paymentMethod === 'CR Note') {
                      methodDisplay = 'CR Note';
                    } else if (transaction.paymentMethod === 'DB Note') {
                      methodDisplay = 'DB Note';
                    } else {
                      methodDisplay = transaction.paymentMethod || 'Adjustment';
                    }
                  } else {
                    const baseMethod = transaction.paymentMethod ? transaction.paymentMethod.charAt(0).toUpperCase() + transaction.paymentMethod.slice(1) : 'N/A';
                    if (transaction.paymentMethod === 'bank' && transaction.bankAccountName) {
                      methodDisplay = `Bank - ${transaction.bankAccountName}`;
                    } else {
                      methodDisplay = baseMethod;
                    }
                    if (transaction.isAdvancePayment) {
                      methodDisplay += ' (Advance)';
                    }
                  }

                  return `
                    <tr>
                      <td class="text-center"><strong>${globalRowNumber}</strong></td>
                      <td>${new Date(transaction.date).toLocaleDateString('en-GB')}</td>
                      <td style="font-size: 6.5pt;">${methodDisplay}</td>
                      <td>${transaction.paymentReference || '-'}</td>
                      <td style="font-size: 6.5pt;">${invoiceInfo}</td>
                      <td style="font-size: 6.5pt;">${transaction.notes || '-'}</td>
                      <td class="text-right"><strong>KSh ${formatKenyanNumber(Math.abs(transaction.amount))}</strong></td>
                      <td class="text-right"><strong>KSh ${formatKenyanNumber(globalCumulative)}</strong></td>
                    </tr>
                  `;
                }).join('');
              }).join('');
              
              return openingBalanceRow + transactionRows;
            })()}
          </tbody>
        </table>
        
        <table style="width: 100%; margin-top: 10px; font-size: 8pt;">
          <tr style="background: #fff;">
            <td style="padding: 6px; border: 1px solid #000;"><strong>Total Payments: ${consolidated.reduce((sum, inv) => sum + inv.transactions.filter(t => t.transactionType === 'payment').length, 0)}</strong></td>
            <td style="padding: 6px; border: 1px solid #000;"><strong>Total Adjustments: ${consolidated.reduce((sum, inv) => sum + inv.transactions.filter(t => t.transactionType === 'adjustment').length, 0)}</strong></td>
            <td style="padding: 6px; border: 1px solid #000; text-align: right;"><strong>Paid: KSh ${formatKenyanNumber(balance.totalPaid)}</strong></td>
            <td style="padding: 6px; border: 1px solid #000; text-align: right;"><strong>Remaining: KSh ${formatKenyanNumber(balance.balance)}</strong></td>
          </tr>
        </table>
        
        <div class="content-spacer"></div>
        
        <!-- Bottom Section -->
        <div class="bottom-section">
          <!-- Summary -->
          <table class="summary-table">
            ${balance.openingBalance && balance.openingBalance !== 0 ? `
            <tr>
              <td><strong>Opening Balance:</strong></td>
              <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.openingBalance)}</strong></td>
            </tr>
            ` : ''}
            <tr>
              <td><strong>Total Invoiced:</strong></td>
              <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.totalInvoiced)}</strong></td>
            </tr>
            <tr>
              <td><strong>Total ${balance.partyType === 'customer' ? 'Received' : 'Paid'}:</strong></td>
              <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.totalPaid)}</strong></td>
            </tr>
            <tr>
              <td><strong>Adjustments/Returns:</strong></td>
              <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.totalAdjustments || 0)}</strong></td>
            </tr>
            <tr class="total-row">
              <td><strong>${balance.partyType === 'customer' ? 'Amount to Receive' : 'Amount to Pay'}:</strong></td>
              <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.balance)}</strong></td>
            </tr>
          </table>
          
          <!-- Footer -->
          <div class="footer">
            This is a computer-generated detailed statement. No signature is required.<br>
            ${companyDetails?.companyName || 'Company Name'} - Payment Tracking System<br>
            Generated on: ${new Date().toLocaleString('en-GB')}
          </div>
        </div>
      </body>
      </html>
    `);
    doc.close();
    
    // Wait for content to load then print
    printFrame.contentWindow?.focus();
    setTimeout(() => {
      printFrame.contentWindow?.print();
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 100);
    }, 250);
  };

  // Generate PDF report
  const generatePDF = () => {
    if (!expandedParty) {
      alert('Please expand a customer/supplier to download their statement as PDF');
      return;
    }

    const balance = balances.find(b => b.partyId === expandedParty);
    if (!balance) return;

    const partyTxns = getFilteredTransactions(expandedParty);
    const consolidated = consolidateTransactions(partyTxns);
    
    // Create a hidden iframe for printing
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);
    
    const doc = printFrame.contentWindow?.document;
    if (!doc) return;
    
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Statement - ${balance.partyName}</title>
        <style>
          @media print {
            @page { 
              margin: 10mm 8mm; 
              size: A4 portrait; 
            }
            body { 
              margin: 0; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          
          body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            font-size: 9pt;
            color: #000;
            background: #fff;
            padding: 15px;
            line-height: 1.3;
          }
          
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
          }
          
          .header h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-bottom: 5px;
            text-transform: uppercase;
          }
          
          .header .subtitle {
            font-size: 14pt;
            color: #000;
            margin-bottom: 8px;
            font-weight: bold;
          }
          
          .company-info {
            font-size: 9pt;
            color: #000;
            line-height: 1.5;
          }
          
          .details-box {
            border: 2px solid #000;
            padding: 10px 15px;
            margin: 15px 0;
            background: #fff;
          }
          
          .details-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 10pt;
          }
          
          .details-label {
            font-weight: bold;
          }
          
          .details-value {
            text-align: right;
          }
          
          .section-title {
            font-size: 12pt;
            font-weight: bold;
            margin: 20px 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #000;
            text-transform: uppercase;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            font-size: 8pt;
            table-layout: fixed;
            page-break-inside: auto;
          }
          
          th {
            background: #000;
            color: #fff;
            padding: 8px 6px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #000;
            font-size: 8pt;
            word-wrap: break-word;
            page-break-after: avoid;
          }
          
          td {
            padding: 6px;
            border: 1px solid #000;
            word-wrap: break-word;
            overflow-wrap: break-word;
            vertical-align: top;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          tbody tr:nth-child(4n+1),
          tbody tr:nth-child(4n+2) {
            background: #fff;
          }
          
          tbody tr:nth-child(4n+3),
          tbody tr:nth-child(4n+4) {
            background: #f5f5f5;
          }
          
          .text-right { 
            text-align: right; 
          }
          
          .text-center { 
            text-align: center; 
          }
          
          .summary-table {
            margin-top: 20px;
            width: 60%;
            margin-left: auto;
            page-break-inside: avoid;
            table-layout: fixed;
          }
          
          .summary-table td {
            padding: 10px;
            border: 2px solid #000;
            font-size: 10pt;
          }
          
          .summary-table .total-row {
            background: #000;
            color: #fff;
            font-weight: bold;
            font-size: 11pt;
          }
          
          .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 8pt;
            color: #000;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <h1>DONATO IMPEX LIMITED</h1>
          <div class="subtitle">Statement</div>
          <div class="company-info">
            ${companyDetails?.address || 'P.O BOX 12345, NAIROBI'}<br>
            Tel: ${companyDetails?.mobile || '+254 733 777 778'} | Email: ${companyDetails?.email || 'donatoimpexltd@gmail.com'}<br>
            PIN: ${companyDetails?.companyPIN || 'P052210686Q'}
          </div>
        </div>
        
        <!-- Party Details -->
        <div class="details-box">
          <div class="details-row">
            <div class="details-label">${balance.partyType === 'customer' ? 'Customer' : 'Supplier'} Name:</div>
            <div class="details-value"><strong>${balance.partyName}</strong></div>
          </div>
          <div class="details-row">
            <div class="details-label">${balance.partyType === 'customer' ? 'Customer' : 'Supplier'} Code:</div>
            <div class="details-value">${balance.partyCode}</div>
          </div>
          <div class="details-row">
            <div class="details-label">Statement Date:</div>
            <div class="details-value">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
          </div>
          <div class="details-row">
            <div class="details-label">Status:</div>
            <div class="details-value"><strong>${balance.status.toUpperCase()}</strong></div>
          </div>
        </div>
        
        <!-- Transaction History -->
        <div class="section-title">Transaction History</div>
        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Date</th>
              <th style="width: 12%;">Type</th>
              <th style="width: 22%;">Invoice Number</th>
              <th class="text-right" style="width: 17%;">Paid</th>
              <th class="text-right" style="width: 17%;">Remaining</th>
              <th class="text-right" style="width: 17%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${consolidated.map(item => {
              return `
                <tr>
                  <td>${new Date(item.date).toLocaleDateString('en-GB')}</td>
                  <td><strong>${item.type.toUpperCase()}</strong></td>
                  <td><strong>${item.referenceNumber}</strong></td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(item.amountPaidTillNow)}</strong></td>
                  <td class="text-right">KSh ${formatKenyanNumber(item.amountRemaining)}</td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(item.totalAmount)}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <!-- Summary -->
        <table class="summary-table">
          ${balance.openingBalance && balance.openingBalance !== 0 ? `
          <tr>
            <td><strong>Opening Balance:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.openingBalance)}</strong></td>
          </tr>
          ` : ''}
          <tr>
            <td><strong>Total Invoiced:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.totalInvoiced)}</strong></td>
          </tr>
          <tr>
            <td><strong>Total ${balance.partyType === 'customer' ? 'Received' : 'Paid'}:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.totalPaid)}</strong></td>
          </tr>
          <tr>
            <td><strong>Adjustments/Returns:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.totalAdjustments || 0)}</strong></td>
          </tr>
          <tr class="total-row">
            <td><strong>${balance.partyType === 'customer' ? 'Amount to Receive' : 'Amount to Pay'}:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(balance.balance)}</strong></td>
          </tr>
        </table>
        
        <!-- Footer -->
        <div class="footer">
          This is a computer-generated document. No signature is required.<br>
          ${companyDetails?.companyName || 'Company Name'} - Payment Tracking System<br>
          Generated on: ${new Date().toLocaleString('en-GB')}
        </div>
      </body>
      </html>
    `);
    doc.close();
    
    // Wait for content to load then print
    printFrame.contentWindow?.focus();
    setTimeout(() => {
      printFrame.contentWindow?.print();
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 100);
    }, 250);
  };

  // Clear filters
  const clearFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterStatus('all');
  };

  // Download CSV
  const downloadCSV = () => {
    if (!expandedParty) {
      alert('Please expand a customer/supplier to download their statement as CSV');
      return;
    }

    const balance = balances.find(b => b.partyId === expandedParty);
    if (!balance) return;

    const partyTransactions = getFilteredTransactions(expandedParty);
    const consolidated = consolidateTransactions(partyTransactions);

    const headers = ['Date', 'Type', 'Invoice Number', 'Paid', 'Remaining', 'Total', 'Status'];
    
    // Add opening balance as first row if exists
    const rows: string[][] = [];
    if (balance.openingBalance && balance.openingBalance !== 0) {
      rows.push([
        '-',
        'OPENING BALANCE',
        'Initial Balance',
        '0.00',
        balance.openingBalance.toFixed(2),
        balance.openingBalance.toFixed(2),
        'CARRIED FORWARD'
      ]);
    }
    
    // Add consolidated transactions
    consolidated.forEach(item => {
      rows.push([
        new Date(item.date).toLocaleDateString('en-GB'),
        item.type.toUpperCase(),
        item.referenceNumber,
        item.amountPaidTillNow.toFixed(2),
        item.amountRemaining.toFixed(2),
        item.totalAmount.toFixed(2),
        item.status
      ]);
    });

    let csvContent = `Statement for ${balance.partyName} (${balance.partyCode})\n`;
    csvContent += `Opening Balance: ${(balance.openingBalance || 0).toFixed(2)}, Total Invoiced: ${balance.totalInvoiced.toFixed(2)}, Total Paid: ${balance.totalPaid.toFixed(2)}, Adjustments: ${(balance.totalAdjustments || 0).toFixed(2)}, Balance: ${balance.balance.toFixed(2)}\n\n`;
    csvContent += headers.join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${balance.partyCode}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Recalculate all party balances
  const handleRecalculateBalances = async () => {
    if (window.confirm('This will recalculate all customer and supplier balances to include opening balances. Continue?')) {
      setRecalculating(true);
      try {
        await recalculateAllPartyBalances();
        alert('Balances recalculated successfully! The page will refresh.');
        window.location.reload();
      } catch (error) {
        console.error('Error recalculating balances:', error);
        alert('Failed to recalculate balances. Please try again.');
      } finally {
        setRecalculating(false);
      }
    }
  };

  // Print Detailed/Short Statement
  const handlePrint = (type: 'detailed' | 'short') => {
    if (!expandedParty) {
      alert('Please expand a customer/supplier to print their statement');
      return;
    }

    // Find balance info for the expanded party
    const balance = balances.find(b => b.partyId === expandedParty);
    if (!balance) return;

    // Generate and print the statement based on type
    if (type === 'detailed') {
      generatePartyStatementPDF(balance);
    } else {
      generateShortStatementPDF(balance);
    }
  };

  // Print detailed PDF for a specific invoice
  const printInvoiceDetailPDF = (invoiceRef: string) => {
    if (!expandedParty) {
      alert('Please expand a customer/supplier first');
      return;
    }

    const balance = balances.find(b => b.partyId === expandedParty);
    if (!balance) return;

    const partyTxns = getFilteredTransactions(expandedParty);
    const consolidated = consolidateTransactions(partyTxns);
    
    // Find the specific invoice
    const invoiceData = consolidated.find(c => c.referenceNumber === invoiceRef);
    if (!invoiceData) {
      alert('Invoice not found');
      return;
    }

    // Get all payments and adjustments for this invoice
    const payments = invoiceData.transactions.filter(t => t.transactionType === 'payment');
    const adjustments = invoiceData.transactions.filter(t => t.transactionType === 'adjustment');
    const allPaymentsAndAdjustments = [...payments, ...adjustments].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Create a hidden iframe for printing
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);
    
    const doc = printFrame.contentWindow?.document;
    if (!doc) return;
    
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice Detail - ${invoiceRef}</title>
        <style>
          @media print {
            @page { 
              margin: 10mm 8mm; 
              size: A4 portrait; 
            }
            body { 
              margin: 0; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          
          body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            font-size: 9pt;
            color: #000;
            background: #fff;
            padding: 15px;
            line-height: 1.3;
          }
          
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
          }
          
          .header h1 {
            font-size: 20pt;
            font-weight: bold;
            margin-bottom: 5px;
            text-transform: uppercase;
          }
          
          .header .subtitle {
            font-size: 14pt;
            color: #000;
            margin-bottom: 8px;
            font-weight: bold;
          }
          
          .company-info {
            font-size: 9pt;
            color: #000;
            line-height: 1.5;
          }
          
          .details-box {
            border: 2px solid #000;
            padding: 10px 15px;
            margin: 15px 0;
            background: #fff;
          }
          
          .details-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 10pt;
          }
          
          .details-label {
            font-weight: bold;
          }
          
          .details-value {
            text-align: right;
          }
          
          .section-title {
            font-size: 12pt;
            font-weight: bold;
            margin: 20px 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #000;
            text-transform: uppercase;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            font-size: 8pt;
            table-layout: fixed;
            page-break-inside: auto;
          }
          
          th {
            background: #000;
            color: #fff;
            padding: 8px 6px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #000;
            font-size: 8pt;
            word-wrap: break-word;
            page-break-after: avoid;
          }
          
          td {
            padding: 6px;
            border: 1px solid #000;
            word-wrap: break-word;
            overflow-wrap: break-word;
            vertical-align: top;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          tbody tr:nth-child(odd) {
            background: #fff;
          }
          
          tbody tr:nth-child(even) {
            background: #f5f5f5;
          }
          
          .text-right { 
            text-align: right; 
          }
          
          .text-center { 
            text-align: center; 
          }
          
          .summary-table {
            margin-top: 20px;
            width: 60%;
            margin-left: auto;
            page-break-inside: avoid;
            table-layout: fixed;
          }
          
          .summary-table td {
            padding: 10px;
            border: 2px solid #000;
            font-size: 10pt;
          }
          
          .summary-table .total-row {
            background: #000;
            color: #fff;
            font-weight: bold;
            font-size: 11pt;
          }
          
          .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 8pt;
            color: #000;
          }


        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <h1>${companyDetails?.companyName || 'DONATO IMPEX LIMITED'}</h1>
          <div class="subtitle">Invoice Payment Details</div>
          <div class="company-info">
            ${companyDetails?.address || 'P.O BOX 12345, NAIROBI'}<br>
            Tel: ${companyDetails?.mobile || '+254 733 777 778'} | Email: ${companyDetails?.email || 'donatoimpexltd@gmail.com'}<br>
            PIN: ${companyDetails?.companyPIN || 'P052210686Q'}
          </div>
        </div>
        
        <!-- Invoice Details -->
        <div class="details-box">
          <div class="details-row">
            <div class="details-label">${balance.partyType === 'customer' ? 'Customer' : 'Supplier'}:</div>
            <div class="details-value"><strong>${balance.partyName}</strong></div>
          </div>
          <div class="details-row">
            <div class="details-label">Code:</div>
            <div class="details-value">${balance.partyCode}</div>
          </div>
          <div class="details-row">
            <div class="details-label">Invoice Number:</div>
            <div class="details-value"><strong>${invoiceRef}</strong></div>
          </div>
          <div class="details-row">
            <div class="details-label">Invoice Date:</div>
            <div class="details-value">${new Date(invoiceData.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
          </div>
          <div class="details-row">
            <div class="details-label">Invoice Amount:</div>
            <div class="details-value"><strong>KSh ${formatKenyanNumber(invoiceData.totalAmount)}</strong></div>
          </div>
          <div class="details-row">
            <div class="details-label">Status:</div>
            <div class="details-value"><strong>${invoiceData.status}</strong></div>
          </div>
        </div>
        
        <!-- Payment & Adjustment History -->
        <div class="section-title">Detailed Transaction Records</div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 12%;">Date</th>
              <th style="width: 15%;">Method/Type</th>
              <th style="width: 18%;">Reference</th>
              <th style="width: 28%;">Invoice Info</th>
              <th class="text-right" style="width: 11%;">Amount</th>
              <th class="text-right" style="width: 11%;">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            ${allPaymentsAndAdjustments.map((transaction, idx) => {
              const isAdjustment = transaction.transactionType === 'adjustment';
              const cumulativeAmount = allPaymentsAndAdjustments
                .slice(0, idx + 1)
                .reduce((sum, t) => sum + (t.transactionType === 'payment' ? t.amount : Math.abs(t.amount)), 0);
              
              let methodDisplay = '';
              if (isAdjustment) {
                if (transaction.paymentMethod === 'CR Note') {
                  methodDisplay = 'CR Note';
                } else if (transaction.paymentMethod === 'DB Note') {
                  methodDisplay = 'DB Note';
                } else {
                  methodDisplay = transaction.paymentMethod || 'Adjustment';
                }
              } else {
                const baseMethod = transaction.paymentMethod ? transaction.paymentMethod.charAt(0).toUpperCase() + transaction.paymentMethod.slice(1) : 'N/A';
                methodDisplay = transaction.isAdvancePayment ? `${baseMethod} (Advance)` : baseMethod;
              }

              const invoiceInfo = `${invoiceRef} | ${new Date(invoiceData.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} | KSh ${formatKenyanNumber(invoiceData.totalAmount)} | ${invoiceData.status}`;

              return `
                <tr>
                  <td class="text-center"><strong>${idx + 1}</strong></td>
                  <td>${new Date(transaction.date).toLocaleDateString('en-GB')}</td>
                  <td>${methodDisplay}</td>
                  <td>${transaction.paymentReference || transaction.description || '-'}</td>
                  <td style="font-size: 7pt;">${invoiceInfo}</td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(Math.abs(transaction.amount))}</strong></td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(cumulativeAmount)}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <!-- Summary -->
        <table class="summary-table">
          <tr>
            <td><strong>Total Invoice Amount:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(invoiceData.totalAmount)}</strong></td>
          </tr>
          <tr>
            <td><strong>Total Payments:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(payments.reduce((sum, p) => sum + p.amount, 0))}</strong></td>
          </tr>
          ${adjustments.length > 0 ? `
          <tr>
            <td><strong>Total Adjustments:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(adjustments.reduce((sum, a) => sum + Math.abs(a.amount), 0))}</strong></td>
          </tr>
          ` : ''}
          <tr>
            <td><strong>Amount Paid Till Now:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(invoiceData.amountPaidTillNow)}</strong></td>
          </tr>
          <tr class="total-row">
            <td><strong>Amount Remaining:</strong></td>
            <td class="text-right"><strong>KSh ${formatKenyanNumber(invoiceData.amountRemaining)}</strong></td>
          </tr>
        </table>

        <div style="margin-top: 15px; padding: 10px; background: #f0f9ff; border: 1px solid #3b82f6; border-radius: 4px;">
          <p style="font-size: 8pt; margin-bottom: 5px;"><strong>Summary:</strong></p>
          <p style="font-size: 8pt;">
            This invoice has <strong>${payments.length} payment${payments.length !== 1 ? 's' : ''}</strong>${adjustments.length > 0 ? ` and <strong>${adjustments.length} adjustment${adjustments.length !== 1 ? 's' : ''}</strong>` : ''}.
            ${invoiceData.status === 'PAID' ? ' The invoice is fully paid.' : invoiceData.status === 'PARTIAL' ? ' Payment is in progress.' : ' No payments have been received yet.'}
          </p>
        </div>
        
        <!-- Footer -->
        <div class="footer">
          This is a computer-generated document. No signature is required.<br>
          ${companyDetails?.companyName || 'Company Name'} - Payment Tracking System<br>
          Generated on: ${new Date().toLocaleString('en-GB')}
        </div>
      </body>
      </html>
    `);
    doc.close();
    
    // Wait for content to load then print
    printFrame.contentWindow?.focus();
    setTimeout(() => {
      printFrame.contentWindow?.print();
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 100);
    }, 250);
  };

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-blue-50 via-white to-green-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl shadow-lg">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Payment Tracking</h2>
              <p className="text-gray-600 mt-1">Track payments and outstanding balances for customers and suppliers</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowFilterModal(true)}
              disabled={!expandedParty}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!expandedParty ? "Expand a customer/supplier to apply filters" : "Filter transactions"}
            >
              <Filter className="w-4 h-4" />
              Filter
              {(filterDateFrom || filterDateTo || filterStatus !== 'all') && (
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Outstanding</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                KSh<br />{formatKenyanNumber(summaryStats.totalOutstanding)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Overdue Amount</p>
              <p className="text-2xl font-bold text-red-600 mt-2">
                KSh {formatKenyanNumber(summaryStats.totalOverdue)}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Advance Payments</p>
              <p className="text-2xl font-bold text-green-600 mt-2">
                KSh {formatKenyanNumber(summaryStats.totalAdvance)}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Active Parties</p>
              <p className="text-2xl font-bold text-purple-600 mt-2">{summaryStats.activeParties}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="border-b border-gray-200">
          <div className="flex gap-1 p-1">
            <button
              onClick={() => setActiveTab('customers')}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors ${
                activeTab === 'customers'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Customers
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors ${
                activeTab === 'suppliers'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Suppliers
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Party List (Level-wise) */}
        <div className="divide-y divide-gray-200">
          {error ? (
            <div className="p-8 text-center">
              <div className="text-red-600 mb-2">
                <X className="w-12 h-12 mx-auto mb-3" />
                <p className="font-semibold">{error}</p>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setDataLoading(true);
                }}
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Retry
              </button>
            </div>
          ) : dataLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="w-12 h-12 mx-auto mb-3 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <p>Loading {activeTab}...</p>
            </div>
          ) : filteredBalances.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No {activeTab} found</p>
            </div>
          ) : (
            filteredBalances.map((balance) => (
              <div key={balance.id} className="bg-white">
                {/* Party Header - Clickable to expand */}
                <div
                  className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleToggleParty(balance.partyId)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-emerald-600">
                      {expandedParty === balance.partyId ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">{balance.partyName}</span>
                        <span className="text-sm text-gray-500">{balance.partyCode}</span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            balance.status === 'active'
                              ? 'bg-blue-100 text-blue-700'
                              : balance.status === 'overdue'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {balance.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex gap-6 mt-1 text-sm text-gray-600">
                        {balance.openingBalance ? (
                          <span>Opening Balance: <span className="font-medium text-blue-600">KSh {formatKenyanNumber(balance.openingBalance)}</span></span>
                        ) : null}
                        <span>{activeTab === 'customers' ? 'Total Invoiced' : 'Total Purchases'}: <span className="font-medium">KSh {formatKenyanNumber(balance.totalInvoiced)}</span></span>
                        <span>{activeTab === 'customers' ? 'Received' : 'Paid'}: <span className="font-medium text-green-600">KSh {formatKenyanNumber(balance.totalPaid)}</span></span>
                        {balance.advanceBalance > 0 && (
                          <span>Advance Balance: <span className="font-medium text-blue-600">KSh {formatKenyanNumber(balance.advanceBalance)}</span></span>
                        )}
                        <span>Returns/Adjustments: <span className="font-medium text-purple-600">KSh {formatKenyanNumber(balance.totalAdjustments || 0)}</span></span>
                        {balance.balance > 0 && (
                          <span>{activeTab === 'customers' ? 'To Receive' : 'To Pay'}: <span className="font-bold text-orange-600">KSh {formatKenyanNumber(balance.balance)}</span></span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPrintDropdown(showPrintDropdown === balance.partyId ? null : balance.partyId);
                        }}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                        title="Print Options"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      {/* Print Dropdown Menu */}
                      {showPrintDropdown === balance.partyId && (
                        <div className="absolute right-0 bottom-full mb-2 w-52 bg-white rounded-lg shadow-xl border border-gray-200 z-[60] overflow-visible">
                          <div className="py-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrint('detailed');
                                setShowPrintDropdown(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <Printer className="w-4 h-4" />
                              Print Detailed
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrint('short');
                                setShowPrintDropdown(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <Printer className="w-4 h-4" />
                              Print Short
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                generatePDF();
                                setShowPrintDropdown(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Download PDF
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadCSV();
                                setShowPrintDropdown(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Download CSV
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Add Payment button - always visible to allow advance payments */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPaymentModal(balance);
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Payment
                    </button>
                  </div>
                </div>

                {/* Transactions (Expanded) */}
                {expandedParty === balance.partyId && (
                  <div className="bg-gray-50 border-t border-gray-200">
                    <div className="p-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Transaction History</h4>
                      {partyTransactions.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No transactions found</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-100 text-gray-700 text-left">
                                <th className="px-3 py-2 font-semibold">Date</th>
                                <th className="px-3 py-2 font-semibold">Type</th>
                                <th className="px-3 py-2 font-semibold">Invoice Number</th>
                                <th className="px-3 py-2 font-semibold">CU Number</th>
                                <th className="px-3 py-2 font-semibold text-right">Amount Paid Till Now</th>
                                <th className="px-3 py-2 font-semibold text-right">Amount Remaining</th>
                                <th className="px-3 py-2 font-semibold text-right">Total Amount</th>
                                <th className="px-3 py-2 font-semibold text-center">Status</th>
                                <th className="px-3 py-2 font-semibold text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {consolidateTransactions(partyTransactions, balances.find(b => b.partyId === expandedParty)).map((consolidated) => {
                                const hasPayments = consolidated.transactions.filter(t => t.transactionType === 'payment' || t.transactionType === 'adjustment').length > 0;
                                const isExpanded = expandedInvoiceRef === consolidated.referenceNumber;
                                const payments = consolidated.transactions.filter(t => t.transactionType === 'payment');
                                const adjustments = consolidated.transactions.filter(t => t.transactionType === 'adjustment');
                                const allPaymentsAndAdjustments = [...payments, ...adjustments].sort((a, b) => 
                                  new Date(a.date).getTime() - new Date(b.date).getTime()
                                );
                                
                                return (
                                  <>
                                    <tr key={consolidated.referenceNumber} className="hover:bg-white transition-colors">
                                      <td className="px-3 py-2 text-gray-900">
                                        {new Date(consolidated.date).toLocaleDateString()}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={`px-2 py-1 rounded text-xs font-medium ${
                                            consolidated.type === 'invoice'
                                              ? 'bg-blue-100 text-blue-700'
                                              : 'bg-green-100 text-green-700'
                                          }`}
                                        >
                                          {consolidated.type.toUpperCase()}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          {consolidated.type === 'invoice' && hasPayments && (
                                            <button
                                              onClick={() => handleTogglePaymentDetails(consolidated.referenceNumber)}
                                              className="text-gray-500 hover:text-emerald-600"
                                            >
                                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                          )}
                                          <span className="text-gray-700 font-medium">{consolidated.referenceNumber}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">
                                        {consolidated.type === 'invoice' ? getCUNumber(consolidated.referenceNumber) : '-'}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-green-600">
                                        KSh {formatKenyanNumber(consolidated.amountPaidTillNow)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-orange-600">
                                        KSh {formatKenyanNumber(consolidated.amountRemaining)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                        KSh {formatKenyanNumber(consolidated.totalAmount)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span
                                          className={`px-2 py-1 rounded text-xs font-medium ${
                                            consolidated.status === 'PAID'
                                              ? 'bg-green-100 text-green-700'
                                              : consolidated.status === 'PARTIAL'
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-red-100 text-red-700'
                                          }`}
                                        >
                                          {consolidated.status}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {consolidated.type === 'invoice' && hasPayments && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              printInvoiceDetailPDF(consolidated.referenceNumber);
                                            }}
                                            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 text-xs mx-auto"
                                            title="Print detailed payment history for this invoice"
                                          >
                                            <Printer className="w-3 h-3" />
                                            Print Detail
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                    {/* Expandable Payment Details */}
                                    {isExpanded && hasPayments && (
                                      <tr>
                                        <td colSpan={9} className="px-0 py-0 bg-gray-50">
                                          <div className="p-4 border-t border-gray-200">
                                            <h5 className="text-sm font-semibold text-gray-900 mb-3">Payment & Adjustment Details for {consolidated.referenceNumber}</h5>
                                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                              <table className="w-full text-xs">
                                                <thead className="bg-gray-100">
                                                  <tr>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Method</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Reference</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Amount</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Transfer Charge</th>
                                                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Cumulative</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Notes</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Status</th>
                                                    <th className="px-3 py-2 text-center font-semibold text-gray-700">Actions</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                  {allPaymentsAndAdjustments.map((transaction, idx) => {
                                                    const isAdjustment = transaction.transactionType === 'adjustment';
                                                    const cumulativeAmount = allPaymentsAndAdjustments
                                                      .slice(0, idx + 1)
                                                      .reduce((sum, t) => sum + (t.transactionType === 'payment' ? t.amount : Math.abs(t.amount)), 0);
                                                    return (
                                                      <tr key={transaction.id} className="hover:bg-gray-50">
                                                        <td className="px-3 py-2 text-gray-700">
                                                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                                            isAdjustment ? 'bg-purple-100' : 'bg-emerald-100'
                                                          }`}>
                                                            <span className={`text-xs font-bold ${
                                                              isAdjustment ? 'text-purple-700' : 'text-emerald-700'
                                                            }`}>{idx + 1}</span>
                                                          </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-700">
                                                          {new Date(transaction.date).toLocaleDateString()}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-700">
                                                          {isAdjustment ? (
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                              transaction.paymentMethod === 'DB Note' 
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-purple-100 text-purple-700'
                                                            }`}>
                                                              {transaction.paymentMethod}
                                                            </span>
                                                          ) : (
                                                            <span className="capitalize">{transaction.paymentMethod || 'N/A'}</span>
                                                          )}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-700">
                                                          {transaction.paymentReference || '-'}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right font-semibold ${
                                                          isAdjustment ? 'text-purple-600' : 'text-gray-900'
                                                        }`}>
                                                          KSh {formatKenyanNumber(Math.abs(transaction.amount))}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-gray-600">
                                                          {!isAdjustment && transaction.transferCharge ? `KSh ${formatKenyanNumber(transaction.transferCharge)}` : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                                                          KSh {formatKenyanNumber(cumulativeAmount)}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600 text-xs">
                                                          {isAdjustment ? transaction.description : (transaction.notes || '-')}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                          {transaction.isAdvancePayment ? (
                                                            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                              ADVANCE PAYMENT
                                                            </span>
                                                          ) : (
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                              isAdjustment 
                                                                ? 'bg-purple-100 text-purple-700'
                                                                : 'bg-green-100 text-green-700'
                                                            }`}>
                                                              {isAdjustment ? 'ADJUSTMENT' : transaction.status.toUpperCase()}
                                                            </span>
                                                          )}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                          <button
                                                            onClick={() => handleEditPayment(transaction, balance)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors mr-2"
                                                            title="Edit payment entry"
                                                          >
                                                            <Edit2 className="w-4 h-4" />
                                                          </button>
                                                          <button
                                                            onClick={async () => {
                                                              if (window.confirm(
                                                                `Are you sure you want to delete this ${isAdjustment ? 'adjustment' : 'payment'} entry?\n\n` +
                                                                `Amount: KSh ${formatKenyanNumber(Math.abs(transaction.amount))}\n` +
                                                                `Date: ${new Date(transaction.date).toLocaleDateString()}\n\n` +
                                                                'This action will reverse the payment entry and update the party balance accordingly.'
                                                              )) {
                                                                try {
                                                                  await deletePaymentTransaction(transaction.id);
                                                                  alert('✅ Payment entry deleted successfully!\n\nThe party balance has been updated.');
                                                                } catch (error) {
                                                                  console.error('Error deleting payment:', error);
                                                                  alert('❌ Failed to delete payment entry. Please try again.');
                                                                }
                                                              }
                                                            }}
                                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title="Delete payment entry"
                                                          >
                                                            <Trash2 className="w-4 h-4" />
                                                          </button>
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                            <div className="mt-3 flex justify-between items-center text-xs">
                                              <span className="text-gray-600">
                                                Total: {payments.length} payment{payments.length !== 1 ? 's' : ''}{adjustments.length > 0 ? ` & ${adjustments.length} adjustment${adjustments.length !== 1 ? 's' : ''}` : ''}
                                              </span>
                                              <span className="font-semibold text-emerald-700">
                                                Total Received: KSh {formatKenyanNumber(payments.reduce((sum, p) => sum + p.amount, 0))}
                                              </span>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Payment Modal */}
      {showAddPaymentModal && selectedParty && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddPaymentModal(false);
              setSelectedInvoiceId('');
              setEditingPayment(null);
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">
                  {editingPayment
                    ? 'Edit Payment'
                    : selectedParty.balance < 0 
                    ? (selectedParty.partyType === 'customer' 
                        ? 'Return Payment to Customer'
                        : 'Receive Payment from Supplier')
                    : 'Add Payment'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddPaymentModal(false);
                    setEditingPayment(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {selectedParty.balance < 0
                  ? (selectedParty.partyType === 'customer'
                      ? <>Paying back to <span className="font-semibold">{selectedParty.partyName}</span> for returned goods or credit</>
                      : <>Receiving payment from <span className="font-semibold">{selectedParty.partyName}</span> for returned goods</>)
                  : <>Record payment for <span className="font-semibold">{selectedParty.partyName}</span></>}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Current Balance: <span className={`font-bold ${selectedParty.balance < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                  KSh {formatKenyanNumber(selectedParty.balance)}
                  {selectedParty.balance < 0 && (selectedParty.partyType === 'customer' ? ' (You owe them)' : ' (They owe you)')}
                </span>
              </p>
            </div>

            <div className="p-6 space-y-4">
              {selectedParty.partyType === 'customer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Invoice (Optional)</label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  >
                    <option value="">General Payment (Not linked to invoice)</option>
                    {consolidateTransactions(partyTransactions, selectedParty)
                      .filter(consolidated => 
                        consolidated.type === 'invoice' && 
                        consolidated.amountRemaining > 0.01 // Include invoices with remaining balance > 1 cent
                      )
                      .map(consolidated => {
                        const invoice = consolidated.transactions.find(t => t.transactionType === 'invoice');
                        return invoice ? (
                          <option key={invoice.id} value={invoice.referenceNumber}>
                            {invoice.referenceNumber} - KSh {formatKenyanNumber(consolidated.totalAmount)} (
                            {consolidated.status === 'PARTIAL' 
                              ? `PARTIAL - Remaining: KSh ${formatKenyanNumber(consolidated.amountRemaining)}`
                              : `UNPAID - Remaining: KSh ${formatKenyanNumber(consolidated.amountRemaining)}`}
                            )
                          </option>
                        ) : null;
                      })}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedInvoiceId ? (
                      'Link this payment to a specific invoice to track payment status. Fully paid invoices are hidden.'
                    ) : (
                      <span className="text-blue-600 font-medium">💡 This will be recorded as an <strong>Advance Payment</strong>. It will automatically offset future invoices.</span>
                    )}
                  </p>
                </div>
              )}
              {selectedParty.partyType === 'supplier' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Purchase Invoice (Optional)</label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  >
                    <option value="">General Payment (Not linked to invoice)</option>
                    {consolidateTransactions(partyTransactions, selectedParty)
                      .filter(consolidated => 
                        consolidated.type === 'invoice' && 
                        consolidated.amountRemaining > 0.01 // Include invoices with remaining balance > 1 cent
                      )
                      .map(consolidated => {
                        const invoice = consolidated.transactions.find(t => t.transactionType === 'invoice');
                        return invoice ? (
                          <option key={invoice.id} value={invoice.referenceNumber}>
                            {invoice.referenceNumber} - KSh {formatKenyanNumber(consolidated.totalAmount)} (
                            {consolidated.status === 'PARTIAL' 
                              ? `PARTIAL - Remaining: KSh ${formatKenyanNumber(consolidated.amountRemaining)}`
                              : `UNPAID - Remaining: KSh ${formatKenyanNumber(consolidated.amountRemaining)}`}
                            )
                          </option>
                        ) : null;
                      })}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedInvoiceId ? (
                      'Link this payment to a specific purchase invoice to track payment status. Fully paid invoices are hidden.'
                    ) : (
                      <span className="text-blue-600 font-medium">💡 This will be recorded as an <strong>Advance Payment</strong>. It will automatically offset future purchases.</span>
                    )}
                  </p>
                </div>
              )}
              
              {/* Amount and Date Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {selectedParty.balance < 0
                      ? (selectedParty.partyType === 'customer' ? 'Refund Amount *' : 'Received Amount *')
                      : (selectedParty.partyType === 'customer' ? 'Received Amount *' : 'Payment Amount *')}
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => {
                      setPaymentAmount(e.target.value);
                    }}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Date *</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Payment Method and Reference Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'bank')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Reference</label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Cheque number, transaction ID, etc."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {paymentMethod === 'bank' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Bank Account *</label>
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    >
                      <option value="">Select bank account</option>
                      {bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.accountName} - {account.accountNumber}
                        </option>
                      ))}
                    </select>
                    {bankAccountId && (() => {
                      const selectedAccount = bankAccounts.find(acc => acc.id === bankAccountId);
                      if (selectedAccount && selectedAccount.currentBalance !== undefined && selectedAccount.currentBalance !== null) {
                        return (
                          <p className="text-sm text-gray-600 mt-2">
                            <span className="font-medium">Current Balance:</span>{' '}
                            <span className={`font-semibold ${selectedAccount.currentBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              KSh {formatKenyanNumber(selectedAccount.currentBalance)}
                            </span>
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank Transfer Charge</label>
                    <input
                      type="number"
                      value={transferCharge}
                      onChange={(e) => setTransferCharge(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Transfer charges are tracked but not included in balance calculations
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddPaymentModal(false);
                  setEditingPayment(null);
                }}
                disabled={loading}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePayment}
                disabled={loading}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  editingPayment ? 'Update Payment' : 'Save Payment'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Filter Transactions</h3>
                <button
                  onClick={() => setShowFilterModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={clearFilters}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Filters
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
