import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Printer, Edit, Plus } from 'lucide-react';
import { Shipment, DebitCreditNote } from '../types';
import { Customer } from './CustomerList';
import { Supplier } from './SupplierList';
import { Invoice } from './InvoiceManagement';
import { DirectPurchase } from '../services/directPurchaseService';
import { subscribeToInvoices, addInvoice, updateInvoice, deleteInvoice } from '../services/invoiceService';
import { subscribeToDebitCreditNotes, updateDebitCreditNote } from '../services/debitCreditNoteService';
import { subscribeToDirectPurchases, addDirectPurchase, deleteDirectPurchase, updateDirectPurchase } from '../services/directPurchaseService';
import { subscribeToShipments } from '../services/shipmentService';
import { subscribeToCustomers } from '../services/customerService';
import { subscribeToSuppliers } from '../services/supplierService';
import { subscribeToInventoryItems, InventoryItem, updateInventoryItem } from '../services/inventoryService';
import { formatKenyanNumber } from '../utils/numberFormat';
import { updateTransaction, deleteTransaction, addTransaction, subscribeToTransactions } from '../services/transactionService';
import { updatePaymentTransaction, deletePaymentTrackingByReference, updateInvoicePaymentStatus } from '../services/paymentTrackingService';
import { Transaction } from './ReceiverPanel';

type LedgerMode = 'display' | 'alter' | 'create';
type LedgerView = 'mode-selection' | 'accounts' | 'monthly' | 'datewise' | 'invoice-detail' | 'invoice-preview' | 'create-entry';

interface PartyAccount {
  name: string;
  code: string;
  type: 'customer' | 'supplier';
  city?: string;
  closingAmount: number;
  isDebit: boolean; // true for DB, false for CR
}

interface MonthlyTransaction {
  month: number;
  monthName: string;
  credit: number;
  debit: number;
  balance: number;
  isDebit: boolean;
}

interface DatewiseTransaction {
  id: string;
  date: string;
  type: 'Sale' | 'Purchase' | 'Credit Note' | 'Debit Note';
  reference: string;
  ledgerAccount: string;
  credit: number;
  debit: number;
}

interface InvoiceDetail {
  id: string;
  to: string;
  address: string;
  invoiceNo: string;
  invoiceType: 'Debit' | 'Credit';
  invoiceDate: string;
  salesAccount: string;
  items: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    gst: number;
  }[];
  subTotal: number;
  vatPercent: number; // 0 or 16
  vatAmount: number;
  total: number;
}

export default function LedgerManagement() {
  const [mode, setMode] = useState<LedgerMode>('display');
  const [view, setView] = useState<LedgerView>('mode-selection');
  const [selectedAccount, setSelectedAccount] = useState<PartyAccount | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<DatewiseTransaction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState<number>(2025);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Editable invoice data for alter mode
  const [editableInvoice, setEditableInvoice] = useState<InvoiceDetail | null>(null);

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [debitCreditNotes, setDebitCreditNotes] = useState<DebitCreditNote[]>([]);
  const [directPurchases, setDirectPurchases] = useState<DirectPurchase[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [basicAccountingTransactions, setBasicAccountingTransactions] = useState<Transaction[]>([]);

  // Create form state
  const [createFormItems, setCreateFormItems] = useState<Array<{
    itemCode: string;
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    gst: number;
  }>>([{ itemCode: '', name: '', quantity: 0, unit: 'KG', rate: 0, amount: 0, gst: 0 }]);
  
  // Create form metadata
  const [createFormData, setCreateFormData] = useState({
    entryType: 'Sale Invoice',
    partyId: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    invoiceNumber: '',
    invoiceType: 'Debit',
    gstVatPercent: 0,
    gstVatAmount: 0,
    discount: 0
  });

  // Subscribe to all data
  useEffect(() => {
    const unsubscribers = [
      subscribeToCustomers(setCustomers, console.error),
      subscribeToSuppliers(setSuppliers, console.error),
      subscribeToInvoices(setInvoices, console.error),
      subscribeToDebitCreditNotes(setDebitCreditNotes, console.error),
      subscribeToDirectPurchases(setDirectPurchases, console.error),
      subscribeToShipments(setShipments, console.error),
      subscribeToInventoryItems(setInventory, console.error),
    ];
    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  // Subscribe to basic accounting transactions
  useEffect(() => {
    const unsubscribe = subscribeToTransactions(
      (updatedTransactions) => {
        // Only include user-created basic accounting entries with specific categories
        const statementCategories = ['Material Purchase', 'Material Sales', 'Product Sales'];
        const filteredTransactions = updatedTransactions.filter(t => 
          t.source === 'basic_accounting' && statementCategories.includes(t.category)
        );
        setBasicAccountingTransactions(filteredTransactions);
      },
      (error) => {
        console.error('Error subscribing to transactions:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Get all party accounts with closing balances
  const getPartyAccounts = (): PartyAccount[] => {
    const accounts: PartyAccount[] = [];

    // Process customers
    customers.forEach(customer => {
      const transactions = getPartyTransactions(customer.companyName);
      const closing = transactions.reduce((sum, t) => sum + t.credit - t.debit, 0);
      
      accounts.push({
        name: customer.companyName,
        code: customer.customerCode,
        type: 'customer',
        city: customer.address,
        closingAmount: Math.abs(closing),
        isDebit: closing < 0
      });
    });

    // Process suppliers
    suppliers.forEach(supplier => {
      const transactions = getPartyTransactions(supplier.companyName);
      const closing = transactions.reduce((sum, t) => sum + t.credit - t.debit, 0);
      
      accounts.push({
        name: supplier.companyName,
        code: supplier.supplierCode,
        type: 'supplier',
        city: supplier.address,
        closingAmount: Math.abs(closing),
        isDebit: closing < 0
      });
    });

    return accounts.sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get all transactions for a party
  const getPartyTransactions = (partyName: string) => {
    const transactions: any[] = [];

    // Invoices
    invoices.filter(inv => inv.customerName === partyName).forEach(inv => {
      transactions.push({
        id: inv.id,
        date: inv.date,
        type: 'invoice',
        reference: inv.manualInvoiceNumber || inv.systemInvoiceNumber,
        debit: 0,
        credit: inv.totalAmount,
        data: inv
      });
    });

    // Direct Purchases
    directPurchases.filter(p => p.supplierName === partyName).forEach(purchase => {
      transactions.push({
        id: purchase.id,
        date: purchase.purchaseDate,
        type: 'purchase',
        reference: purchase.invoiceNumber,
        debit: purchase.totalAmount,
        credit: 0,
        data: purchase
      });
    });

    // Shipments
    shipments.filter(s => s.supplier === partyName).forEach(shipment => {
      transactions.push({
        id: shipment.id,
        date: shipment.date,
        type: 'shipment',
        reference: shipment.purchaseInvoiceNumber || `SHIP-${shipment.id.substring(0, 8)}`,
        debit: shipment.totalCost,
        credit: 0,
        data: shipment
      });
    });

    // Debit/Credit Notes
    debitCreditNotes
      .filter(note => 
        (note.status === 'issued' || note.status === 'paid') && 
        note.partyName === partyName
      )
      .forEach(note => {
        let debit = 0, credit = 0;
        
        // PROPER DEBIT/CREDIT NOTE LOGIC:
        // DEBIT NOTE (Return to Supplier): Reduces what we owe supplier
        //   - For supplier ledger: CREDIT entry (reduces liability - we owe less)
        // CREDIT NOTE (Return from Customer): Reduces what customer owes us
        //   - For customer ledger: DEBIT entry (it's our loss - we spent to refund)
        
        if (note.noteType === 'credit') {
          // Credit Note: Customer returned goods - DEBIT (it's our loss)
          debit = note.totalAmount;
        } else {
          // Debit Note: We returned goods to supplier - CREDIT (reduces payable)
          // Even though it's a "debit note", it shows as CREDIT in supplier's ledger
          // because it reduces our liability to them
          credit = note.totalAmount;
        }
        
        transactions.push({
          id: note.id,
          date: note.date,
          type: note.noteType === 'credit' ? 'credit_note' : 'debit_note',
          reference: note.noteNumber,
          debit,
          credit,
          data: note
        });
      });

    // Add basic accounting transactions (Material Purchase, Material Sales, Product Sales)
    basicAccountingTransactions.forEach(transaction => {
      const isIncome = transaction.type === 'credit';
      
      // Determine the correct party based on transaction category and type
      let transactionPartyName = '';
      
      // For Material Sales and Product Sales: customer is the party
      // For Material Purchase: supplier is the party
      if (transaction.category === 'Material Sales' || transaction.category === 'Product Sales') {
        // Sales involve customers
        // For credit (Payment Receive), sender is customer
        // For debit (Payment Debit), receiver is customer
        transactionPartyName = isIncome ? transaction.senderName || '' : transaction.receiverName || '';
      } else if (transaction.category === 'Material Purchase') {
        // Purchase involves suppliers
        // For credit (Payment Receive), receiver is supplier
        // For debit (Payment Debit), sender is supplier
        transactionPartyName = isIncome ? transaction.receiverName || '' : transaction.senderName || '';
      }
      
      // Only include if this transaction is for the current party
      if (transactionPartyName === partyName) {
        transactions.push({
          id: transaction.id,
          date: transaction.date,
          type: 'basic_accounting',
          reference: `BA-${transaction.id.substring(0, 8)}`,
          debit: !isIncome ? transaction.amount : 0,
          credit: isIncome ? transaction.amount : 0,
          data: transaction
        });
      }
    });

    return transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Get monthly summary
  const getMonthlyTransactions = (partyName: string, year: number): MonthlyTransaction[] => {
    const transactions = getPartyTransactions(partyName);
    const monthlyData: { [key: number]: { credit: number; debit: number } } = {};

    // Initialize all months
    for (let i = 1; i <= 12; i++) {
      monthlyData[i] = { credit: 0, debit: 0 };
    }

    // Aggregate by month
    transactions.forEach(t => {
      const date = new Date(t.date);
      if (date.getFullYear() === year) {
        const month = date.getMonth() + 1;
        monthlyData[month].credit += t.credit;
        monthlyData[month].debit += t.debit;
      }
    });

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    let runningBalance = 0;
    return Object.keys(monthlyData).map(monthKey => {
      const month = parseInt(monthKey);
      const data = monthlyData[month];
      runningBalance += data.credit - data.debit;
      
      return {
        month,
        monthName: monthNames[month - 1],
        credit: data.credit,
        debit: data.debit,
        balance: Math.abs(runningBalance),
        isDebit: runningBalance < 0
      };
    });
  };

  // Get date-wise transactions for a month
  const getDatewiseTransactions = (partyName: string, year: number, month: number): DatewiseTransaction[] => {
    const transactions = getPartyTransactions(partyName);
    
    return transactions
      .filter(t => {
        const date = new Date(t.date);
        return date.getFullYear() === year && date.getMonth() + 1 === month;
      })
      .map(t => ({
        id: t.id,
        date: t.date,
        type: t.type === 'invoice' ? 'Sale' : 
              t.type === 'purchase' || t.type === 'shipment' ? 'Purchase' :
              t.type === 'credit_note' ? 'Credit Note' : 
              t.type === 'debit_note' ? 'Debit Note' :
              t.type === 'basic_accounting' ? 'Basic Accounting' : 'Other',
        reference: t.reference,
        ledgerAccount: t.type === 'invoice' ? 'SALES -VAT 16%' : 
                       t.type === 'purchase' ? 'PURCHASE' : 
                       t.type === 'shipment' ? 'SHIPMENT' : 
                       t.type === 'basic_accounting' ? 'BASIC ACCOUNTING' : 'ADJUSTMENTS',
        credit: t.credit,
        debit: t.debit
      }));
  };

  // Get invoice detail
  const getInvoiceDetail = (transactionId: string): InvoiceDetail | null => {
    const invoice = invoices.find(inv => inv.id === transactionId);
    if (invoice) {
      const customer = customers.find(c => c.companyName === invoice.customerName);
      return {
        id: invoice.id,
        to: invoice.customerName,
        address: customer?.address || '',
        invoiceNo: invoice.manualInvoiceNumber || invoice.systemInvoiceNumber,
        invoiceType: 'Debit',
        invoiceDate: invoice.date,
        salesAccount: 'SALES -VAT 16%',
        items: invoice.items.map(item => ({
          name: item.itemDescription,
          quantity: item.quantity,
          unit: 'KG',
          rate: item.unitPrice,
          amount: item.amountExclTax,
          gst: item.taxAmount
        })),
        subTotal: invoice.taxableTotalAmount,
        vatPercent: invoice.totalTaxAmount > 0 ? 16 : 0,
        vatAmount: invoice.totalTaxAmount,
        total: invoice.totalAmount
      };
    }

    // Check for basic accounting transaction
    const basicAcctTxn = basicAccountingTransactions.find(t => t.id === transactionId);
    if (basicAcctTxn) {
      const isCustomer = customers.some(c => c.companyName === basicAcctTxn.receiverName || c.companyName === basicAcctTxn.senderName);
      const party = isCustomer
        ? customers.find(c => c.companyName === basicAcctTxn.receiverName || c.companyName === basicAcctTxn.senderName)
        : suppliers.find(s => s.companyName === basicAcctTxn.receiverName || s.companyName === basicAcctTxn.senderName);
      
      const partyName = basicAcctTxn.type === 'credit' ? basicAcctTxn.receiverName : basicAcctTxn.senderName;
      
      return {
        id: basicAcctTxn.id,
        to: partyName || 'N/A',
        address: party?.address || '',
        invoiceNo: `BA-${basicAcctTxn.id.substring(0, 8)}`,
        invoiceType: basicAcctTxn.type === 'credit' ? 'Credit' : 'Debit',
        invoiceDate: basicAcctTxn.date,
        salesAccount: basicAcctTxn.category,
        items: [{
          name: basicAcctTxn.description,
          quantity: 1,
          unit: 'UNIT',
          rate: basicAcctTxn.amount,
          amount: basicAcctTxn.amount,
          gst: 0
        }],
        subTotal: basicAcctTxn.amount,
        vatPercent: 0,
        vatAmount: 0,
        total: basicAcctTxn.amount
      };
    }

    const purchase = directPurchases.find(p => p.id === transactionId);
    if (purchase) {
      const supplier = suppliers.find(s => s.companyName === purchase.supplierName);
      return {
        id: purchase.id,
        to: purchase.supplierName,
        address: supplier?.address || '',
        invoiceNo: purchase.invoiceNumber,
        invoiceType: 'Debit',
        invoiceDate: purchase.purchaseDate,
        salesAccount: 'PURCHASE',
        items: purchase.items.map(item => ({
          name: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.totalAmount,
          gst: 0
        })),
        subTotal: purchase.totalAmount / 1.16,
        vatPercent: 16,
        vatAmount: purchase.totalAmount - (purchase.totalAmount / 1.16),
        total: purchase.totalAmount
      };
    }

    const shipment = shipments.find(s => s.id === transactionId);
    if (shipment) {
      const supplier = suppliers.find(s => s.companyName === shipment.supplier);
      return {
        id: shipment.id,
        to: shipment.supplier,
        address: supplier?.address || '',
        invoiceNo: shipment.purchaseInvoiceNumber || `SHIP-${shipment.id.substring(0, 8)}`,
        invoiceType: 'Debit',
        invoiceDate: shipment.date,
        salesAccount: 'PURCHASE - SHIPMENT',
        items: [{
          name: `${shipment.materialType || 'Material'} - Shipment`,
          quantity: shipment.purchaseKg,
          unit: 'KG',
          rate: shipment.ratePerKg,
          amount: shipment.totalCost,
          gst: 0
        }],
        subTotal: shipment.totalCost,
        vatPercent: 0,
        vatAmount: 0,
        total: shipment.totalCost
      };
    }

    const note = debitCreditNotes.find(n => n.id === transactionId);
    if (note) {
      const isCustomer = customers.some(c => c.companyName === note.partyName);
      const party = isCustomer 
        ? customers.find(c => c.companyName === note.partyName)
        : suppliers.find(s => s.companyName === note.partyName);
      
      return {
        id: note.id,
        to: note.partyName,
        address: party?.address || '',
        invoiceNo: note.noteNumber,
        invoiceType: note.noteType === 'credit' ? 'Credit' : 'Debit',
        invoiceDate: note.date,
        salesAccount: note.transactionType === 'sale' ? 'SALES ADJUSTMENT' : 'PURCHASE ADJUSTMENT',
        items: note.items.map(item => ({
          name: item.description,
          quantity: item.quantity,
          unit: 'KG',
          rate: item.rate,
          amount: item.amount,
          gst: 0
        })),
        subTotal: note.subtotal,
        vatPercent: note.tax > 0 ? 16 : 0,
        vatAmount: note.tax,
        total: note.totalAmount
      };
    }

    return null;
  };

  // Filtered accounts
  const filteredAccounts = getPartyAccounts().filter(acc =>
    acc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Print/Download functions
  const handlePrintAccounts = () => {
    const printWindow = window.open('', '', 'height=800,width=1200');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Ledger Accounts (Namewise)</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Arial', sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #000;
              padding: 10mm;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #333;
            }
            h1 {
              font-size: 18pt;
              font-weight: bold;
              margin-bottom: 8px;
              color: #1a1a1a;
            }
            .subtitle {
              font-size: 10pt;
              color: #555;
              margin-bottom: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            thead {
              background-color: #f5f5f5;
            }
            th {
              border: 1px solid #333;
              padding: 10px 8px;
              text-align: left;
              font-weight: bold;
              font-size: 10pt;
              color: #1a1a1a;
            }
            td {
              border: 1px solid #666;
              padding: 8px;
              font-size: 10pt;
              vertical-align: middle;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            tbody tr:nth-child(even) {
              background-color: #fafafa;
            }
            tbody tr:hover {
              background-color: #f0f0f0;
            }
            tbody tr {
              page-break-inside: avoid;
            }
            table {
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            .footer {
              margin-top: 20px;
              padding-top: 10px;
              border-top: 1px solid #999;
              text-align: center;
              font-size: 9pt;
              color: #666;
            }
            @media print {
              body {
                padding: 0;
              }
              tbody tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              thead {
                display: table-header-group;
              }
              tfoot {
                display: table-footer-group;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Ledger Accounts (Namewise)</h1>
            <div class="subtitle">Complete Account List</div>
            <div class="subtitle">Generated on: ${new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;" class="text-center">#</th>
                <th style="width: 40%;">Ledger/Account Name</th>
                <th style="width: 15%;">Short Name(A)</th>
                <th style="width: 20%;">City</th>
                <th style="width: 20%;" class="text-right">Closing Amount C/D</th>
              </tr>
            </thead>
            <tbody>
              ${filteredAccounts.map((acc, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td>${acc.name}</td>
                  <td>${acc.code}</td>
                  <td>${acc.city || '-'}</td>
                  <td class="text-right"><strong>${formatKenyanNumber(acc.closingAmount)}</strong> ${acc.isDebit ? 'DB' : 'CR'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            Total Accounts: ${filteredAccounts.length} | Page 1 of 1
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handlePrintMonthly = () => {
    if (!selectedAccount) return;
    const monthly = getMonthlyTransactions(selectedAccount.name, yearFilter);
    
    const printWindow = window.open('', '', 'height=800,width=1200');
    if (!printWindow) return;

    const totalCredit = monthly.reduce((sum, m) => sum + m.credit, 0);
    const totalDebit = monthly.reduce((sum, m) => sum + m.debit, 0);
    const finalBalance = monthly[monthly.length - 1]?.balance || 0;
    const finalCD = monthly[monthly.length - 1]?.isDebit ? 'DB' : 'CR';

    printWindow.document.write(`
      <html>
        <head>
          <title>Ledger: ${selectedAccount.name} (Monthly)</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Arial', sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #000;
              padding: 10mm;
            }
            .header {
              text-align: center;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 2px solid #333;
            }
            h1 {
              font-size: 16pt;
              font-weight: bold;
              margin-bottom: 6px;
              color: #1a1a1a;
            }
            .info-section {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
              margin-bottom: 15px;
              font-size: 10pt;
            }
            .info-item {
              padding: 8px;
              background-color: #f9f9f9;
              border: 1px solid #ddd;
              border-radius: 4px;
            }
            .info-label {
              font-weight: bold;
              color: #555;
              margin-bottom: 3px;
            }
            .info-value {
              color: #1a1a1a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            thead {
              background-color: #f5f5f5;
            }
            th {
              border: 1px solid #333;
              padding: 10px 8px;
              text-align: left;
              font-weight: bold;
              font-size: 10pt;
              color: #1a1a1a;
            }
            td {
              border: 1px solid #666;
              padding: 8px;
              font-size: 10pt;
              vertical-align: middle;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            tbody tr:nth-child(even) {
              background-color: #fafafa;
            }
            tbody tr:hover {
              background-color: #f0f0f0;
            }
            tbody tr {
              page-break-inside: avoid;
            }
            table {
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            .totals-row {
              background-color: #e8f4f8 !important;
              font-weight: bold;
            }
            .footer {
              margin-top: 20px;
              padding-top: 10px;
              border-top: 1px solid #999;
              text-align: center;
              font-size: 9pt;
              color: #666;
            }
            @media print {
              body {
                padding: 0;
              }
              tbody tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              thead {
                display: table-header-group;
              }
              tfoot {
                display: table-footer-group;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Ledger: ${selectedAccount.name}</h1>
            <div style="font-size: 10pt; color: #555; margin-top: 5px;">
              (Under: Accounts ${selectedAccount.type === 'customer' ? 'Receivables' : 'Payables'}) (Monthwise)
            </div>
          </div>
          
          <div class="info-section">
            <div class="info-item">
              <div class="info-label">Period:</div>
              <div class="info-value">From 01/01/${yearFilter} To 31/12/${yearFilter}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Account Code:</div>
              <div class="info-value">${selectedAccount.code}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 8%;" class="text-center">#</th>
                <th style="width: 25%;">Month</th>
                <th style="width: 20%;" class="text-right">Credit</th>
                <th style="width: 20%;" class="text-right">Debit</th>
                <th style="width: 20%;" class="text-right">Balance</th>
                <th style="width: 7%;" class="text-center">C/D</th>
              </tr>
            </thead>
            <tbody>
              ${monthly.map((m, idx) => `
                <tr>
                  <td class="text-center">${String(idx + 1).padStart(2, '0')}</td>
                  <td><strong>${m.monthName}</strong></td>
                  <td class="text-right">${formatKenyanNumber(m.credit)}</td>
                  <td class="text-right">${formatKenyanNumber(m.debit)}</td>
                  <td class="text-right"><strong>${formatKenyanNumber(m.balance)}</strong></td>
                  <td class="text-center">${m.isDebit ? 'DB' : 'CR'}</td>
                </tr>
              `).join('')}
              <tr class="totals-row">
                <td colspan="2" class="text-right"><strong>TOTAL:</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(totalCredit)}</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(totalDebit)}</strong></td>
                <td class="text-right"><strong>${formatKenyanNumber(finalBalance)}</strong></td>
                <td class="text-center"><strong>${finalCD}</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            Generated on: ${new Date().toLocaleDateString('en-GB')} | Page 1 of 1
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handlePrintDatewise = () => {
    if (!selectedAccount || selectedMonth === null) return;
    const transactions = getDatewiseTransactions(selectedAccount.name, yearFilter, selectedMonth);
    
    const printWindow = window.open('', '', 'height=800,width=1200');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Ledger: ${selectedAccount.name} - Datewise</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Arial', sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #000;
              padding: 10mm;
            }
            .header {
              text-align: center;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 2px solid #333;
            }
            h2 {
              font-size: 16pt;
              font-weight: bold;
              margin-bottom: 6px;
              color: #1a1a1a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
              page-break-inside: auto;
            }
            thead {
              background-color: #f5f5f5;
              display: table-header-group;
            }
            th {
              border: 1px solid #333;
              padding: 10px 8px;
              text-align: left;
              font-weight: bold;
              font-size: 10pt;
              color: #1a1a1a;
            }
            td {
              border: 1px solid #666;
              padding: 8px;
              font-size: 10pt;
              vertical-align: middle;
            }
            tbody tr {
              page-break-inside: avoid;
            }
            tbody tr:nth-child(even) {
              background-color: #fafafa;
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            @media print {
              body { padding: 0; }
              tbody tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              thead {
                display: table-header-group;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Ledger: ${selectedAccount.name}</h2>
            <p>(Under: Accounts ${selectedAccount.type === 'customer' ? 'Receivables' : 'Payables'}) (Datewise)</p>
            <p>From: 01/${String(selectedMonth).padStart(2, '0')}/${yearFilter} To: 30/${String(selectedMonth).padStart(2, '0')}/${yearFilter}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>#</th>
                <th>Reference</th>
                <th>Ledger/Account Name</th>
                <th class="text-right">Credit</th>
                <th class="text-right">Debit</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map(t => `
                <tr>
                  <td>${new Date(t.date).toLocaleDateString('en-GB')}</td>
                  <td>${t.type}</td>
                  <td>${t.reference}</td>
                  <td>${t.reference}</td>
                  <td>${t.ledgerAccount}</td>
                  <td class="text-right">${t.credit > 0 ? formatKenyanNumber(t.credit) : ''}</td>
                  <td class="text-right">${t.debit > 0 ? formatKenyanNumber(t.debit) : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  // Mode Selection View
  const renderModeSelection = () => (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center text-gray-900 mb-4">Ledger Management</h1>
        <p className="text-center text-gray-600 mb-12">Choose how you want to interact with ledgers</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Display Mode */}
          <div
            onClick={() => {
              setMode('display');
              setView('accounts');
            }}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transition-all hover:-translate-y-1 border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex justify-center mb-4">
              <Printer className="w-16 h-16 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">Display</h2>
            <p className="text-center text-gray-600 mb-4">
              View ledger accounts, monthly summaries, and print reports
            </p>
            <ul className="text-sm text-gray-500 space-y-2">
              <li>✓ View all transactions</li>
              <li>✓ Print invoices</li>
              <li>✓ Generate reports</li>
              <li>✓ Print statements</li>
            </ul>
          </div>

          {/* Alter Mode */}
          <div
            onClick={() => {
              setMode('alter');
              setView('accounts');
            }}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transition-all hover:-translate-y-1 border-2 border-transparent hover:border-emerald-500"
          >
            <div className="flex justify-center mb-4">
              <Edit className="w-16 h-16 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">Alter</h2>
            <p className="text-center text-gray-600 mb-4">
              Modify existing ledger records and update transaction details
            </p>
            <ul className="text-sm text-gray-500 space-y-2">
              <li>✓ Edit transactions</li>
              <li>✓ Update records</li>
              <li>✓ Modify details</li>
              <li>✓ Adjust entries</li>
            </ul>
          </div>

          {/* Create Mode */}
          <div
            onClick={() => {
              setMode('create');
              setView('accounts');
            }}
            className="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transition-all hover:-translate-y-1 border-2 border-transparent hover:border-purple-500"
          >
            <div className="flex justify-center mb-4">
              <Plus className="w-16 h-16 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">Create</h2>
            <p className="text-center text-gray-600 mb-4">
              Add new ledger accounts and create transaction records
            </p>
            <ul className="text-sm text-gray-500 space-y-2">
              <li>✓ New ledger accounts</li>
              <li>✓ Add transactions</li>
              <li>✓ Create entries</li>
              <li>✓ Setup records</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Render accounts list view
  const renderAccountsView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('mode-selection')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ledger Accounts (Namewise)</h1>
            <p className="text-sm text-gray-600 mt-1">
              Mode: <span className="font-semibold capitalize text-blue-600">{mode}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'create' && (
            <button
              onClick={() => setView('create-entry')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" />
              Create New Entry
            </button>
          )}
          {mode === 'display' && (
            <button
              onClick={handlePrintAccounts}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search accounts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">Ledger/Account Name</th>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">Short Name(A)</th>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">City</th>
              <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase">Closing Amount C/D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAccounts.map((acc) => (
              <tr
                key={`${acc.type}-${acc.code}`}
                className="hover:bg-blue-50 cursor-pointer"
                onClick={() => {
                  setSelectedAccount(acc);
                  setView('monthly');
                }}
              >
                <td className="px-6 py-4 text-sm text-center text-gray-900">{acc.name}</td>
                <td className="px-6 py-4 text-sm text-center text-gray-600">{acc.code}</td>
                <td className="px-6 py-4 text-sm text-center text-gray-600">{acc.city || ''}</td>
                <td className="px-6 py-4 text-sm text-center font-medium">
                  {formatKenyanNumber(acc.closingAmount)} {acc.isDebit ? 'DB' : 'CR'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Render monthly view
  const renderMonthlyView = () => {
    if (!selectedAccount) return null;
    const monthly = getMonthlyTransactions(selectedAccount.name, yearFilter);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('accounts')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Ledger: {selectedAccount.name}
              </h1>
              <p className="text-sm text-gray-600">(Under: Accounts {selectedAccount.type === 'customer' ? 'Receivables' : 'Payables'})</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              {[2023, 2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            {mode === 'display' && (
              <button
                onClick={handlePrintMonthly}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">#</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Month</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Credit</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Debit</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Balance</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">C/D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {monthly.map((m, idx) => (
                <tr
                  key={m.month}
                  className={`hover:bg-blue-50 cursor-pointer ${m.credit > 0 || m.debit > 0 ? 'bg-blue-50' : ''}`}
                  onClick={() => {
                    if (m.credit > 0 || m.debit > 0) {
                      setSelectedMonth(m.month);
                      setView('datewise');
                    }
                  }}
                >
                  <td className="px-6 py-4 text-sm text-center text-gray-900">{String(idx + 1).padStart(2, '0')}</td>
                  <td className="px-6 py-4 text-sm text-center text-gray-900">{m.monthName}</td>
                  <td className="px-6 py-4 text-sm text-center">{formatKenyanNumber(m.credit, 2)}</td>
                  <td className="px-6 py-4 text-sm text-center">{formatKenyanNumber(m.debit, 2)}</td>
                  <td className="px-6 py-4 text-sm text-center font-medium">
                    {formatKenyanNumber(m.balance, 2)} {m.isDebit ? 'DB' : 'CR'}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">{m.isDebit ? 'DB' : 'CR'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render datewise view
  const renderDatewiseView = () => {
    if (!selectedAccount || selectedMonth === null) return null;
    const transactions = getDatewiseTransactions(selectedAccount.name, yearFilter, selectedMonth);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('monthly')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Ledger: {selectedAccount.name}
              </h1>
              <p className="text-sm text-gray-600">
                (Under: Accounts {selectedAccount.type === 'customer' ? 'Receivables' : 'Payables'}) (Datewise)
              </p>
              <p className="text-sm text-gray-500">
                From: 01/{String(selectedMonth).padStart(2, '0')}/{yearFilter} To: 30/{String(selectedMonth).padStart(2, '0')}/{yearFilter}
              </p>
            </div>
          </div>
          {mode === 'display' && (
            <button
              onClick={handlePrintDatewise}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Date</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Type</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Invoice Number</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Ledger/Account Name</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Credit</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Debit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((t) => (
                <tr 
                  key={t.id} 
                  className="hover:bg-blue-50 cursor-pointer"
                  onClick={() => {
                    setSelectedTransaction(t);
                    setView('invoice-detail');
                  }}
                >
                  <td className="px-6 py-4 text-sm text-center text-gray-900">
                    {new Date(t.date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4 text-sm text-center text-gray-900">{t.type}</td>
                  <td className="px-6 py-4 text-sm text-center text-gray-600">{t.reference}</td>
                  <td className="px-6 py-4 text-sm text-center text-gray-900">{t.ledgerAccount}</td>
                  <td className="px-6 py-4 text-sm text-center">
                    {t.credit > 0 ? formatKenyanNumber(t.credit) : ''}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    {t.debit > 0 ? formatKenyanNumber(t.debit) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Helper function to render invoice content (used in both preview and regular view)
  const renderInvoiceContent = (detail: InvoiceDetail) => {
    // Use editable invoice for alter mode, otherwise use detail
    const currentInvoice = mode === 'alter' && editableInvoice ? editableInvoice : detail;

    // Calculate totals
    const calculateTotals = () => {
      const subTotal = currentInvoice.items.reduce((sum, item) => sum + item.amount, 0);
      const vatAmount = (subTotal * currentInvoice.vatPercent) / 100;
      const total = subTotal + vatAmount;
      return { subTotal, vatAmount, total };
    };

    const { subTotal, vatAmount, total } = calculateTotals();

    // Update item
    const updateItem = (index: number, field: string, value: any) => {
      if (mode !== 'alter' || !editableInvoice) return;
      
      const updatedItems = [...editableInvoice.items];
      const item = { ...updatedItems[index] };
      
      if (field === 'quantity') item.quantity = parseFloat(value) || 0;
      if (field === 'rate') item.rate = parseFloat(value) || 0;
      if (field === 'amount') item.amount = parseFloat(value) || 0;
      if (field === 'gst') item.gst = parseFloat(value) || 0;
      if (field === 'name') item.name = value;
      if (field === 'unit') item.unit = value;
      
      // Auto-calculate amount if quantity or rate changes
      if (field === 'quantity' || field === 'rate') {
        item.amount = item.quantity * item.rate;
      }
      
      updatedItems[index] = item;
      setEditableInvoice({ ...editableInvoice, items: updatedItems });
    };

    // Add new item
    const addItem = () => {
      if (mode !== 'alter' || !editableInvoice) return;
      const newItem = { name: '', quantity: 0, unit: 'KG', rate: 0, amount: 0, gst: 0 };
      setEditableInvoice({ ...editableInvoice, items: [...editableInvoice.items, newItem] });
    };

    // Remove last item
    const removeLastItem = async () => {
      if (mode !== 'alter' || !editableInvoice || !selectedTransaction) return;
      
      // If only one item left, confirm deletion of entire record
      if (editableInvoice.items.length === 1) {
        const confirmDelete = window.confirm(
          'This is the last item. Removing it will delete the entire record. Do you want to proceed?'
        );
        
        if (confirmDelete) {
          try {
            const transactionType = selectedTransaction.type;
            
            if (transactionType === 'Sale') {
              const invoice = invoices.find(inv => inv.id === selectedTransaction.id);
              if (invoice) {
                await deleteInvoice(invoice.id);
                alert('Invoice deleted successfully');
              }
            } else if (transactionType === 'Purchase') {
              const purchase = directPurchases.find(p => p.id === selectedTransaction.id);
              if (purchase) {
                await deleteDirectPurchase(purchase.id);
                alert('Purchase record deleted successfully');
              }
            }
            
            // Return to accounts view
            setEditableInvoice(null);
            setSelectedTransaction(null);
            setView('accounts');
          } catch (error) {
            console.error('Error deleting record:', error);
            alert('Failed to delete record. Please try again.');
          }
        }
      } else {
        // Remove last item normally
        const updatedItems = editableInvoice.items.slice(0, -1);
        setEditableInvoice({ ...editableInvoice, items: updatedItems });
      }
    };

    // Update VAT or discount
    const updateFinancial = (field: 'vat14' | 'vat16' | 'discount', value: string) => {
      if (mode !== 'alter' || !editableInvoice) return;
      setEditableInvoice({ ...editableInvoice, [field]: parseFloat(value) || 0 });
    };

    return (
      <div className="bg-emerald-100 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">To:</label>
            <input
              type="text"
              value={currentInvoice.to}
              onChange={(e) => mode === 'alter' && editableInvoice && setEditableInvoice({ ...editableInvoice, to: e.target.value })}
              readOnly={mode === 'display'}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded"
            />
            <textarea
              value={currentInvoice.address}
              onChange={(e) => mode === 'alter' && editableInvoice && setEditableInvoice({ ...editableInvoice, address: e.target.value })}
              readOnly={mode === 'display'}
              rows={2}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded mt-2"
            />
          </div>
          <div className="space-y-2">
            <div className="flex gap-4">
              <label className="w-32 text-sm font-medium">Invoice No</label>
              <input
                type="text"
                value={currentInvoice.invoiceNo.split('-')[0]}
                onChange={(e) => mode === 'alter' && editableInvoice && setEditableInvoice({ ...editableInvoice, invoiceNo: e.target.value })}
                readOnly={mode === 'display'}
                className="flex-1 px-3 py-1 bg-white border border-gray-300 rounded"
              />
              <span className="px-3 py-1">{currentInvoice.invoiceNo.split('-')[1] || ''}</span>
            </div>
            <div className="flex gap-4">
              <label className="w-32 text-sm font-medium">Invoice Type</label>
              <select
                value={currentInvoice.invoiceType}
                onChange={(e) => mode === 'alter' && editableInvoice && setEditableInvoice({ ...editableInvoice, invoiceType: e.target.value as 'Debit' | 'Credit' })}
                disabled={mode === 'display'}
                className="flex-1 px-3 py-1 bg-white border border-gray-300 rounded"
              >
                <option>Debit</option>
                <option>Credit</option>
              </select>
            </div>
            <div className="flex gap-4">
              <label className="w-32 text-sm font-medium">Invoice Date</label>
              <input
                type="date"
                value={new Date(currentInvoice.invoiceDate).toISOString().split('T')[0]}
                onChange={(e) => mode === 'alter' && editableInvoice && setEditableInvoice({ ...editableInvoice, invoiceDate: e.target.value })}
                readOnly={mode === 'display'}
                className="flex-1 px-3 py-1 bg-white border border-gray-300 rounded"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-center text-sm">#</th>
                <th className="px-4 py-2 text-center text-sm">Item/Product Name</th>
                <th className="px-4 py-2 text-center text-sm">Quantity</th>
                <th className="px-4 py-2 text-center text-sm">Unit - Hsn/Sac</th>
                <th className="px-4 py-2 text-center text-sm">Rate</th>
                <th className="px-4 py-2 text-center text-sm">Amount</th>
                <th className="px-4 py-2 text-center text-sm">Gst/Vat</th>
              </tr>
            </thead>
            <tbody>
              {currentInvoice.items.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-4 py-2 text-center">{idx + 1}</td>
                  <td className="px-4 py-2 text-center">
                    {mode === 'alter' ? (
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(idx, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {mode === 'alter' ? (
                      <input
                        type="number"
                        step="0.001"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      `${formatKenyanNumber(item.quantity, 3)} ${item.unit}`
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {mode === 'alter' ? (
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      item.unit
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {mode === 'alter' ? (
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      formatKenyanNumber(item.rate)
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {mode === 'alter' ? (
                      <input
                        type="number"
                        step="0.01"
                        value={item.amount}
                        onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      formatKenyanNumber(item.amount)
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {mode === 'alter' ? (
                      <input
                        type="number"
                        step="0.01"
                        value={item.gst}
                        onChange={(e) => updateItem(idx, 'gst', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      formatKenyanNumber(item.gst)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mode === 'alter' && (
            <div className="p-4 border-t flex justify-between items-center bg-gray-50">
              <button
                onClick={addItem}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
              <button
                onClick={removeLastItem}
                className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                Remove Last Item
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">By Dept</label>
            <input
              type="text"
              value="Stores Department"
              readOnly={mode === 'display'}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Sub Total</span>
              <span>{formatKenyanNumber(subTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST/VAT</span>
              <select
                value={currentInvoice.vatPercent}
                onChange={(e) => {
                  if (mode === 'alter' && editableInvoice) {
                    setEditableInvoice({
                      ...editableInvoice,
                      vatPercent: parseFloat(e.target.value)
                    });
                  }
                }}
                disabled={mode === 'display'}
                className="w-32 px-2 py-1 text-right bg-white border border-gray-300 rounded"
              >
                <option value="0">0%</option>
                <option value="16">16%</option>
              </select>
            </div>
            <div className="flex justify-between">
              <span>VAT Amount</span>
              <span>{formatKenyanNumber(vatAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total:</span>
              <span>{formatKenyanNumber(total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render invoice detail view
  const renderInvoiceDetailView = () => {
    if (!selectedTransaction) return null;
    const detail = getInvoiceDetail(selectedTransaction.id);
    
    // Initialize editable invoice when entering alter mode
    if (mode === 'alter' && detail && !editableInvoice) {
      setEditableInvoice(detail);
    }

    // Reset editable invoice when leaving alter mode or changing transaction
    if (mode !== 'alter' && editableInvoice) {
      setEditableInvoice(null);
    }
    
    if (!detail) {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('datewise')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <p className="text-gray-600">No details available for this transaction</p>
          </div>
        </div>
      );
    }

    // Show invoice preview modal if enabled
    if (showPrintPreview) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Invoice Preview</h2>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <div id="invoice-preview-content" className="p-6">
              {renderInvoiceContent(detail)}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('datewise')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedTransaction.type} Voucher - {detail.invoiceNo}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'alter' && (
              <>
                <button
                  onClick={() => {
                    setEditableInvoice(null);
                    setView('datewise');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (editableInvoice && selectedTransaction) {
                      try {
                        const subTotal = editableInvoice.items.reduce((sum, item) => sum + item.amount, 0);
                        const vatAmount = (subTotal * editableInvoice.vatPercent) / 100;
                        const total = subTotal + vatAmount;
                        
                        // Update based on transaction type
                        const transactionType = selectedTransaction.type;
                        
                        if (transactionType === 'Sale') {
                          // CASCADE UPDATE FOR SALES INVOICE
                          const invoice = invoices.find(inv => inv.id === selectedTransaction.id);
                          if (invoice) {
                            const oldTotal = invoice.totalAmount;
                            const newTotal = total;
                            const oldItems = invoice.items;
                            const newItems = editableInvoice.items;
                            
                            // 1. Update Invoice
                            await updateInvoice(invoice.id, {
                              items: editableInvoice.items.map(item => ({
                                itemCode: item.itemCode || '',
                                itemDescription: item.name,
                                quantity: item.quantity,
                                unitPrice: item.rate,
                                taxRate: editableInvoice.vatPercent,
                                amountExclTax: item.amount,
                                taxAmount: (item.amount * editableInvoice.vatPercent) / 100,
                                totalAmount: item.amount + (item.amount * editableInvoice.vatPercent) / 100,
                                amountInclTax: item.amount + (item.amount * editableInvoice.vatPercent) / 100
                              })),
                              taxableTotalAmount: subTotal,
                              totalTaxAmount: vatAmount,
                              totalAmount: total
                            });
                            
                            // 2. Update Inventory - Reverse old changes and apply new changes
                            console.log('=== UPDATING INVENTORY ===');
                            for (const oldItem of oldItems) {
                              const inventoryItem = inventory.find(
                                inv => inv.itemCode?.toUpperCase() === oldItem.itemCode?.toUpperCase()
                              );
                              
                              if (inventoryItem) {
                                // Reverse old quantity (add it back)
                                const currentOutBalance = Number(inventoryItem.outBalance || 0);
                                const newOutBalance = currentOutBalance - oldItem.quantity;
                                
                                await updateInventoryItem(inventoryItem.id, {
                                  outBalance: newOutBalance
                                });
                                console.log(`Reversed: ${inventoryItem.itemCode} - removed ${oldItem.quantity} from out balance`);
                              }
                            }
                            
                            // Apply new quantities
                            for (const newItem of newItems) {
                              const inventoryItem = inventory.find(
                                inv => inv.itemCode?.toUpperCase() === newItem.itemCode?.toUpperCase()
                              );
                              
                              if (inventoryItem) {
                                // Apply new quantity (subtract from inventory)
                                const currentOutBalance = Number(inventoryItem.outBalance || 0);
                                const newOutBalance = currentOutBalance + newItem.quantity;
                                
                                await updateInventoryItem(inventoryItem.id, {
                                  outBalance: newOutBalance
                                });
                                console.log(`Applied: ${inventoryItem.itemCode} - added ${newItem.quantity} to out balance`);
                              }
                            }
                            
                            // 3. Update related accounting transaction
                            // Find transaction by description containing invoice number
                            const relatedTransaction = await (async () => {
                              const { getDocs, collection, query, where } = await import('firebase/firestore');
                              const { db } = await import('../config/firebase');
                              const q = query(
                                collection(db, 'transactions'),
                                where('contraType', '==', 'invoice')
                              );
                              const snapshot = await getDocs(q);
                              const found = snapshot.docs.find(doc => {
                                const data = doc.data();
                                return data.description?.includes(invoice.systemInvoiceNumber) ||
                                       data.description?.includes(invoice.manualInvoiceNumber);
                              });
                              return found ? { id: found.id, ...found.data() } : null;
                            })();
                            
                            if (relatedTransaction) {
                              await updateTransaction(relatedTransaction.id, {
                                amount: newTotal,
                                description: relatedTransaction.description.replace(
                                  /KSh\s[\d,]+(\.\d{2})?/,
                                  `KSh ${formatKenyanNumber(newTotal)}`
                                )
                              });
                            }
                            
                            // 4. Update payment tracking - update invoice amount
                            const paymentTrackingTransactions = await (async () => {
                              const { getDocs, collection, query, where } = await import('firebase/firestore');
                              const { db } = await import('../config/firebase');
                              const q = query(
                                collection(db, 'paymentTracking'),
                                where('transactionType', '==', 'invoice'),
                                where('referenceNumber', '==', invoice.systemInvoiceNumber)
                              );
                              const snapshot = await getDocs(q);
                              return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                            })();
                            
                            for (const pt of paymentTrackingTransactions) {
                              await updatePaymentTransaction(pt.id, {
                                amount: newTotal
                              });
                            }
                            
                            // 4. Update related credit note (if exists)
                            const relatedCreditNote = debitCreditNotes.find(note =>
                              note.originalInvoiceNumber === invoice.systemInvoiceNumber &&
                              note.noteType === 'credit' &&
                              note.transactionType === 'sale'
                            );
                            
                            if (relatedCreditNote) {
                              await updateDebitCreditNote(relatedCreditNote.id, {
                                items: editableInvoice.items.map(item => ({
                                  itemCode: item.itemCode,
                                  description: item.name,
                                  quantity: item.quantity,
                                  rate: item.rate,
                                  amount: item.amount + (item.amount * editableInvoice.vatPercent) / 100
                                })),
                                subtotal: subTotal,
                                tax: vatAmount,
                                totalAmount: total
                              });
                            }
                            
                            alert(`✅ CASCADE UPDATE COMPLETE!\n\nInvoice updated successfully.\nAll related records synchronized:\n• Invoice Items & Totals\n• Inventory Balances\n• Accounting Transaction\n• Payment Tracking\n• Credit Note Entry\n\nNew Total: ${formatKenyanNumber(newTotal)}`);
                            setEditableInvoice(null);
                            setView('datewise');
                          }
                        } else if (transactionType === 'Purchase') {
                          // CASCADE UPDATE FOR DIRECT PURCHASE
                          const purchase = directPurchases.find(p => p.id === selectedTransaction.id);
                          if (purchase) {
                            const newTotal = total;
                            
                            // Note: Direct Purchase service doesn't have update function
                            // We need to inform user to recreate the purchase
                            alert('⚠️ Purchase records cannot be edited directly.\n\nTo modify a purchase:\n1. Delete the current purchase\n2. Create a new purchase with correct details\n\nThis ensures inventory and accounting remain consistent.');
                          }
                        } else if (transactionType === 'Debit Note' || transactionType === 'Credit Note') {
                          // CASCADE UPDATE FOR DEBIT/CREDIT NOTES
                          const note = debitCreditNotes.find(n => n.id === selectedTransaction.id);
                          if (note) {
                            // 1. Update the note itself
                            await updateDebitCreditNote(note.id, {
                              items: editableInvoice.items.map(item => ({
                                itemCode: item.itemCode,
                                description: item.name,
                                quantity: item.quantity,
                                rate: item.rate,
                                amount: item.amount + (item.amount * editableInvoice.vatPercent) / 100
                              })),
                              subtotal: subTotal,
                              tax: vatAmount,
                              totalAmount: total
                            });
                            
                            alert(`✅ Debit/Credit Note updated successfully!\n\nNew Total: ${formatKenyanNumber(total)}`);
                            setEditableInvoice(null);
                            setView('datewise');
                          }
                        } else {
                          alert('This transaction type cannot be edited at this time');
                        }
                      } catch (error) {
                        console.error('Error saving changes:', error);
                        alert('❌ Failed to save changes.\n\nError: ' + (error instanceof Error ? error.message : String(error)) + '\n\nPlease try again or contact support.');
                      }
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  <Edit className="w-4 h-4" />
                  Save Changes
                </button>
              </>
            )}
            {mode === 'display' && (
              <button
                onClick={() => {
                  const subTotal = detail.items.reduce((sum, item) => sum + item.amount, 0);
                  const vatAmount = (subTotal * detail.vatPercent) / 100;
                  const total = subTotal + vatAmount;
                
                const printWindow = window.open('', '', 'width=210mm,height=297mm');
                if (printWindow) {
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Invoice - ${detail.invoiceNo}</title>
                        <style>
                          @page {
                            size: A4;
                            margin: 15mm;
                          }
                          * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                          }
                          body {
                            font-family: Arial, sans-serif;
                            font-size: 11pt;
                            line-height: 1.4;
                            color: #000;
                            padding: 10mm;
                          }
                          .header {
                            text-align: center;
                            margin-bottom: 20px;
                            padding-bottom: 10px;
                            border-bottom: 2px solid #000;
                          }
                          .header h1 {
                            font-size: 18pt;
                            margin-bottom: 5px;
                          }
                          .invoice-info {
                            display: flex;
                            justify-content: space-between;
                            margin: 20px 0;
                          }
                          .invoice-info-left {
                            width: 60%;
                          }
                          .invoice-info-right {
                            width: 35%;
                            text-align: right;
                          }
                          .info-row {
                            margin: 8px 0;
                          }
                          .info-row strong {
                            display: inline-block;
                            min-width: 100px;
                          }
                          table {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 20px 0;
                          }
                          th {
                            background-color: #f0f0f0;
                            border: 1px solid #000;
                            padding: 10px 8px;
                            text-align: left;
                            font-weight: bold;
                            font-size: 10pt;
                          }
                          td {
                            border: 1px solid #000;
                            padding: 8px;
                            font-size: 10pt;
                          }
                          .text-center {
                            text-align: center;
                          }
                          .text-right {
                            text-align: right;
                          }
                          .totals-section {
                            display: flex;
                            justify-content: space-between;
                            margin-top: 20px;
                          }
                          .totals-left {
                            width: 50%;
                          }
                          .totals-right {
                            width: 45%;
                          }
                          .total-row {
                            display: flex;
                            justify-content: space-between;
                            padding: 8px 10px;
                            border-bottom: 1px solid #ddd;
                          }
                          .total-row.final {
                            border-top: 2px solid #000;
                            border-bottom: 2px solid #000;
                            font-weight: bold;
                            font-size: 12pt;
                            margin-top: 5px;
                          }
                          .footer {
                            margin-top: 30px;
                            padding-top: 15px;
                            border-top: 1px solid #000;
                            text-align: center;
                            font-size: 9pt;
                          }
                          @media print {
                            body {
                              padding: 5mm;
                            }
                            .no-print {
                              display: none;
                            }
                          }
                        </style>
                      </head>
                      <body>
                        <div class="header">
                          <h1>INVOICE</h1>
                          <p>${new Date().toLocaleDateString('en-GB')}</p>
                        </div>

                        <div class="invoice-info">
                          <div class="invoice-info-left">
                            <div class="info-row"><strong>To:</strong> ${detail.to}</div>
                            <div class="info-row"><strong>Address:</strong> ${detail.address}</div>
                          </div>
                          <div class="invoice-info-right">
                            <div class="info-row"><strong>Invoice No:</strong> ${detail.invoiceNo}</div>
                            <div class="info-row"><strong>Invoice Type:</strong> ${detail.invoiceType}</div>
                            <div class="info-row"><strong>Invoice Date:</strong> ${new Date(detail.invoiceDate).toLocaleDateString('en-GB')}</div>
                          </div>
                        </div>

                        <div class="info-row">
                          <strong>Sales A/c:</strong> ${detail.salesAccount}
                        </div>

                        <table>
                          <thead>
                            <tr>
                              <th class="text-center" style="width: 5%;">#</th>
                              <th style="width: 35%;">Item/Product Name</th>
                              <th class="text-right" style="width: 12%;">Quantity</th>
                              <th class="text-center" style="width: 8%;">Unit</th>
                              <th class="text-right" style="width: 12%;">Rate</th>
                              <th class="text-right" style="width: 14%;">Amount</th>
                              <th class="text-right" style="width: 14%;">GST/VAT</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${detail.items.map((item: any, idx: number) => `
                              <tr>
                                <td class="text-center">${idx + 1}</td>
                                <td>${item.name}</td>
                                <td class="text-right">${formatKenyanNumber(item.quantity, 3)}</td>
                                <td class="text-center">${item.unit}</td>
                                <td class="text-right">${formatKenyanNumber(item.rate)}</td>
                                <td class="text-right">${formatKenyanNumber(item.amount)}</td>
                                <td class="text-right">${formatKenyanNumber(item.gst)}</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>

                        <div class="totals-section">
                          <div class="totals-left">
                            <div class="info-row"><strong>By Dept:</strong> Stores Department</div>
                          </div>
                          <div class="totals-right">
                            <div class="total-row">
                              <span>Sub Total:</span>
                              <span>${formatKenyanNumber(subTotal)}</span>
                            </div>
                            <div class="total-row">
                              <span>GST/VAT (${detail.vatPercent}%):</span>
                              <span>${formatKenyanNumber(vatAmount, 2)}</span>
                            </div>
                            <div class="total-row final">
                              <span>Total:</span>
                              <span>${formatKenyanNumber(total)}</span>
                            </div>
                          </div>
                        </div>

                        <div class="footer">
                          <p>about:blank</p>
                        </div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.focus();
                  setTimeout(() => { 
                    printWindow.print(); 
                  }, 500);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            )}
          </div>
        </div>

        {renderInvoiceContent(detail)}
      </div>
    );
  };

  // Render create entry form
  const renderCreateEntryForm = () => {
    // Auto-fill item details when item code is entered
    const handleItemCodeChange = (index: number, itemCode: string) => {
      const updatedItems = [...createFormItems];
      updatedItems[index].itemCode = itemCode;

      // Find matching inventory item
      const inventoryItem = inventory.find(item => 
        item.itemCode?.toLowerCase() === itemCode.toLowerCase()
      );

      if (inventoryItem) {
        // Auto-fill name and unit
        updatedItems[index].name = inventoryItem.itemName;
        updatedItems[index].unit = inventoryItem.unit || 'KG';
      }

      setCreateFormItems(updatedItems);
    };

    // Update item field
    const updateCreateItem = (index: number, field: string, value: any) => {
      const updatedItems = [...createFormItems];
      const item = { ...updatedItems[index] };

      if (field === 'quantity') item.quantity = parseFloat(value) || 0;
      if (field === 'rate') item.rate = parseFloat(value) || 0;
      if (field === 'amount') item.amount = parseFloat(value) || 0;
      if (field === 'gst') item.gst = parseFloat(value) || 0;
      if (field === 'name') item.name = value;
      if (field === 'unit') item.unit = value;

      // Auto-calculate amount if quantity or rate changes
      if (field === 'quantity' || field === 'rate') {
        item.amount = item.quantity * item.rate;
      }

      updatedItems[index] = item;
      setCreateFormItems(updatedItems);
    };

    // Add new item
    const addCreateItem = () => {
      setCreateFormItems([...createFormItems, { 
        itemCode: '', name: '', quantity: 0, unit: 'KG', rate: 0, amount: 0, gst: 0 
      }]);
    };

    // Remove item
    const removeCreateItem = (index: number) => {
      if (createFormItems.length <= 1) return;
      setCreateFormItems(createFormItems.filter((_, i) => i !== index));
    };

    // Calculate totals
    const subTotal = createFormItems.reduce((sum, item) => sum + item.amount, 0);
    const gstVatTotal = createFormItems.reduce((sum, item) => sum + ((item.amount * (item.gst || 0)) / 100), 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setView('accounts');
              // Reset form
              setCreateFormItems([{ itemCode: '', name: '', quantity: 0, unit: 'KG', rate: 0, amount: 0, gst: 0 }]);
              setCreateFormData({
                entryType: 'Sale Invoice',
                partyId: '',
                invoiceDate: new Date().toISOString().split('T')[0],
                invoiceNumber: '',
                invoiceType: 'Debit',
                gstVatPercent: 0,
                gstVatAmount: 0,
                discount: 0
              });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Accounts
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Create New Ledger Entry</h1>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <form className="space-y-6" onSubmit={async (e) => {
            e.preventDefault();
            
            // Validation
            if (!createFormData.partyId) {
              alert('Please select a party');
              return;
            }
            if (!createFormData.invoiceNumber) {
              alert('Please enter an invoice number');
              return;
            }
            if (createFormItems.length === 0 || createFormItems.every(item => !item.name)) {
              alert('Please add at least one item');
              return;
            }
            
            try {
              const subTotal = createFormItems.reduce((sum, item) => sum + item.amount, 0);
              const vatAmount = (subTotal * createFormData.gstVatPercent) / 100;
              const total = subTotal + vatAmount;
              
              if (createFormData.entryType === 'Sale Invoice') {
                // CREATE SALE INVOICE WITH CASCADE TO ALL SYSTEMS
                const customer = customers.find(c => c.id === createFormData.partyId);
                if (!customer) {
                  alert('Customer not found');
                  return;
                }
                
                const systemInvoiceNumber = `INV-${Date.now()}`;
                
                // 1. Create Invoice
                const invoiceId = await addInvoice({
                  systemInvoiceNumber,
                  manualInvoiceNumber: createFormData.invoiceNumber,
                  customerName: customer.companyName,
                  customerCode: customer.customerCode,
                  customerPRN: customer.pin || '',
                  date: createFormData.invoiceDate,
                  invoiceFrom: {
                    pin: '',
                    name: 'Company Name',
                    address: '',
                    mobile: ''
                  },
                  items: createFormItems.filter(item => item.name).map(item => ({
                    itemCode: item.itemCode || '',
                    itemDescription: item.name,
                    quantity: item.quantity,
                    unitPrice: item.rate,
                    taxRate: createFormData.gstVatPercent,
                    amountExclTax: item.amount,
                    taxAmount: (item.amount * createFormData.gstVatPercent) / 100,
                    totalAmount: item.amount + (item.amount * createFormData.gstVatPercent) / 100,
                    amountInclTax: item.amount + (item.amount * createFormData.gstVatPercent) / 100
                  })),
                  taxableTotalAmount: subTotal,
                  totalTaxAmount: vatAmount,
                  totalAmount: total,
                  status: 'issued',
                  createdAt: new Date().toISOString()
                } as any);
                
                // 2. Update Inventory
                console.log('=== UPDATING INVENTORY FOR NEW INVOICE ===');
                for (const item of createFormItems.filter(i => i.name)) {
                  const inventoryItem = inventory.find(
                    inv => inv.itemCode?.toUpperCase() === item.itemCode?.toUpperCase()
                  );
                  
                  if (inventoryItem) {
                    const currentOutBalance = Number(inventoryItem.outBalance || 0);
                    const newOutBalance = currentOutBalance + item.quantity;
                    
                    await updateInventoryItem(inventoryItem.id, {
                      outBalance: newOutBalance
                    });
                    console.log(`Updated inventory: ${inventoryItem.itemCode} - added ${item.quantity} to out balance`);
                  }
                }
                
                // 3. Create Accounting Transaction
                await addTransaction({
                  id: '',
                  date: createFormData.invoiceDate,
                  description: `Invoice ${systemInvoiceNumber} issued to ${customer.companyName} (Receivable)`,
                  type: 'credit',
                  amount: total,
                  category: 'Product Sales',
                  paymentMethod: 'On Credit',
                  receiverName: customer.companyName,
                  contraType: 'invoice'
                });
                
                // 4. Create Payment Tracking Entry
                const { createInvoiceTransaction } = await import('../services/paymentTrackingService');
                const { getCurrentUser } = await import('../services/authService');
                const user = getCurrentUser();
                if (user) {
                  await createInvoiceTransaction(
                    'customer',
                    customer.id,
                    customer.companyName,
                    customer.customerCode,
                    systemInvoiceNumber,
                    total,
                    createFormData.invoiceDate,
                    user.fullName
                  );
                }
                
                // 5. Create Credit Note Entry
                await addDebitCreditNote({
                  noteNumber: systemInvoiceNumber,
                  date: createFormData.invoiceDate,
                  partyType: 'customer',
                  partyName: customer.companyName,
                  partyCode: customer.customerCode,
                  noteType: 'credit',
                  transactionType: 'sale',
                  originalInvoiceNumber: systemInvoiceNumber,
                  reason: `Sales Invoice ${systemInvoiceNumber}`,
                  items: createFormItems.filter(item => item.name).map(item => ({
                    itemCode: item.itemCode,
                    description: item.name,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount + (item.amount * createFormData.gstVatPercent) / 100
                  })),
                  subtotal: subTotal,
                  tax: vatAmount,
                  totalAmount: total,
                  status: 'issued'
                });
                
                alert(`✅ SALE INVOICE CREATED!\n\nInvoice: ${systemInvoiceNumber}\nAll records created:\n• Invoice Record\n• Inventory Updated\n• Accounting Transaction\n• Payment Tracking\n• Credit Note Entry\n\nTotal: ${formatKenyanNumber(total)}`);
              } else if (createFormData.entryType === 'Purchase Invoice') {
                // CREATE PURCHASE INVOICE WITH CASCADE TO ALL SYSTEMS
                const supplier = suppliers.find(s => s.id === createFormData.partyId);
                if (!supplier) {
                  alert('Supplier not found');
                  return;
                }
                
                // 1. Create Direct Purchase
                const purchaseId = await addDirectPurchase({
                  supplierCode: supplier.supplierCode,
                  supplierName: supplier.companyName,
                  purchaseDate: createFormData.invoiceDate,
                  invoiceNumber: createFormData.invoiceNumber,
                  items: createFormItems.filter(item => item.name).map(item => ({
                    itemCode: item.itemCode || '',
                    itemName: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    rate: item.rate,
                    taxRate: createFormData.gstVatPercent,
                    amountExclTax: item.amount,
                    taxAmount: (item.amount * createFormData.gstVatPercent) / 100,
                    totalAmount: item.amount + (item.amount * createFormData.gstVatPercent) / 100
                  })),
                  totalAmount: total
                });
                
                // 2. Update Inventory (add to stock for purchases)
                console.log('=== UPDATING INVENTORY FOR NEW PURCHASE ===');
                for (const item of createFormItems.filter(i => i.name)) {
                  const inventoryItem = inventory.find(
                    inv => inv.itemCode?.toUpperCase() === item.itemCode?.toUpperCase()
                  );
                  
                  if (inventoryItem) {
                    const currentInBalance = Number(inventoryItem.inBalance || 0);
                    const newInBalance = currentInBalance + item.quantity;
                    
                    await updateInventoryItem(inventoryItem.id, {
                      inBalance: newInBalance
                    });
                    console.log(`Updated inventory: ${inventoryItem.itemCode} - added ${item.quantity} to in balance`);
                  }
                }
                
                // 3. Create Accounting Transaction
                await addTransaction({
                  id: '',
                  date: createFormData.invoiceDate,
                  description: `Purchase Invoice ${createFormData.invoiceNumber} from ${supplier.companyName}`,
                  type: 'debit',
                  amount: total,
                  category: 'Purchases',
                  paymentMethod: 'On Credit',
                  senderName: supplier.companyName,
                  contraType: 'purchase'
                });
                
                // 4. Create Debit Note Entry
                await addDebitCreditNote({
                  noteNumber: createFormData.invoiceNumber,
                  date: createFormData.invoiceDate,
                  partyType: 'supplier',
                  partyName: supplier.companyName,
                  partyCode: supplier.supplierCode,
                  noteType: 'debit',
                  transactionType: 'purchase',
                  originalInvoiceNumber: createFormData.invoiceNumber,
                  reason: `Purchase Invoice ${createFormData.invoiceNumber}`,
                  items: createFormItems.filter(item => item.name).map(item => ({
                    itemCode: item.itemCode,
                    description: item.name,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount + (item.amount * createFormData.gstVatPercent) / 100
                  })),
                  subtotal: subTotal,
                  tax: vatAmount,
                  totalAmount: total,
                  status: 'issued'
                });
                
                alert(`✅ PURCHASE INVOICE CREATED!\n\nInvoice: ${createFormData.invoiceNumber}\nAll records created:\n• Purchase Record\n• Inventory Updated\n• Accounting Transaction\n• Debit Note Entry\n\nTotal: ${formatKenyanNumber(total)}`);
              }
              
              // Reset form and go back to accounts view
              setCreateFormItems([{ itemCode: '', name: '', quantity: 0, unit: 'KG', rate: 0, amount: 0, gst: 0 }]);
              setCreateFormData({
                entryType: 'Sale Invoice',
                partyId: '',
                invoiceDate: new Date().toISOString().split('T')[0],
                invoiceNumber: '',
                invoiceType: 'Debit',
                gstVatPercent: 0,
                gstVatAmount: 0,
                discount: 0
              });
              setView('accounts');
            } catch (error) {
              console.error('Error creating entry:', error);
              alert('Failed to create entry. Please try again.');
            }
          }}>
            {/* Entry Type Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Entry Type</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={createFormData.entryType}
                onChange={(e) => setCreateFormData({ ...createFormData, entryType: e.target.value })}
              >
                <option>Sale Invoice</option>
                <option>Purchase Invoice</option>
              </select>
            </div>

            {/* Party Selection */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Party Name</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={createFormData.partyId}
                  onChange={(e) => setCreateFormData({ ...createFormData, partyId: e.target.value })}
                  required
                >
                  <option value="">Select Party</option>
                  {createFormData.entryType === 'Sale Invoice' ? (
                    customers.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))
                  ) : (
                    suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.companyName}</option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Invoice Date</label>
                <input
                  type="date"
                  value={createFormData.invoiceDate}
                  onChange={(e) => setCreateFormData({ ...createFormData, invoiceDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Invoice Number</label>
                <input
                  type="text"
                  placeholder="INV-001"
                  value={createFormData.invoiceNumber}
                  onChange={(e) => setCreateFormData({ ...createFormData, invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Invoice Type</label>
                <select 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={createFormData.invoiceType}
                  onChange={(e) => setCreateFormData({ ...createFormData, invoiceType: e.target.value })}
                >
                  <option>Debit</option>
                  <option>Credit</option>
                </select>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium">Items</label>
                <button
                  type="button"
                  onClick={addCreateItem}
                  className="flex items-center gap-2 px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm">#</th>
                      <th className="px-4 py-2 text-left text-sm">Item Code</th>
                      <th className="px-4 py-2 text-left text-sm">Item Name</th>
                      <th className="px-4 py-2 text-left text-sm">Quantity</th>
                      <th className="px-4 py-2 text-left text-sm">Unit</th>
                      <th className="px-4 py-2 text-left text-sm">Rate</th>
                      <th className="px-4 py-2 text-left text-sm">Amount</th>
                      <th className="px-4 py-2 text-left text-sm">GST/VAT</th>
                      <th className="px-4 py-2 text-left text-sm">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {createFormItems.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.itemCode}
                            onChange={(e) => handleItemCodeChange(idx, e.target.value)}
                            placeholder="Item code"
                            className="w-24 px-2 py-1 border rounded"
                            list={`inventory-codes-${idx}`}
                          />
                          <datalist id={`inventory-codes-${idx}`}>
                            {inventory.map(inv => (
                              <option key={inv.id} value={inv.itemCode || ''} />
                            ))}
                          </datalist>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateCreateItem(idx, 'name', e.target.value)}
                            placeholder="Item name"
                            className="w-full px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.001"
                            value={item.quantity || ''}
                            onChange={(e) => updateCreateItem(idx, 'quantity', e.target.value)}
                            placeholder="0.000"
                            className="w-20 px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateCreateItem(idx, 'unit', e.target.value)}
                            placeholder="KG"
                            className="w-16 px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate || ''}
                            onChange={(e) => updateCreateItem(idx, 'rate', e.target.value)}
                            placeholder="0.00"
                            className="w-20 px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount || ''}
                            onChange={(e) => updateCreateItem(idx, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-20 px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.gst || ''}
                            onChange={(e) => updateCreateItem(idx, 'gst', e.target.value)}
                            placeholder="0.00"
                            className="w-20 px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => removeCreateItem(idx)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-96 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm">Sub Total</label>
                  <span className="w-32 px-2 py-1 text-right font-medium">{formatKenyanNumber(subTotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm">GST/VAT Amount</label>
                  <span className="w-32 px-2 py-1 text-right font-medium">{formatKenyanNumber(gstVatTotal, 2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm">Discount</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={createFormData.discount}
                    onChange={(e) => setCreateFormData({ ...createFormData, discount: parseFloat(e.target.value) || 0 })}
                    className="w-32 px-2 py-1 border rounded text-right" 
                  />
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <label className="text-sm font-bold">Total</label>
                  <span className="w-32 px-2 py-1 text-right font-bold">{formatKenyanNumber(subTotal + gstVatTotal - createFormData.discount, 2)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t">
              <button
                type="button"
                onClick={() => {
                  setView('accounts');
                  setCreateFormItems([{ itemCode: '', name: '', quantity: 0, unit: 'KG', rate: 0, amount: 0, gst: 0 }]);
                  setCreateFormData({
                    entryType: 'Sale Invoice',
                    partyId: '',
                    invoiceDate: new Date().toISOString().split('T')[0],
                    invoiceNumber: '',
                    invoiceType: 'Debit',
                    gstVatPercent: 0,
                    gstVatAmount: 0,
                    discount: 0
                  });
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4" />
                Create Entry
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {view === 'mode-selection' && renderModeSelection()}
        {view === 'accounts' && renderAccountsView()}
        {view === 'monthly' && renderMonthlyView()}
        {view === 'datewise' && renderDatewiseView()}
        {view === 'invoice-detail' && renderInvoiceDetailView()}
        {view === 'create-entry' && renderCreateEntryForm()}
      </div>
    </div>
  );
}
