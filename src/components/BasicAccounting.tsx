import { useState } from 'react';
import { Calculator, DollarSign, TrendingUp, TrendingDown, Plus, FileText, Download, Search, Building2, X, Trash2, Printer, Edit2 } from 'lucide-react';
import { BankAccount, Transaction } from './ReceiverPanel';
import { Customer } from './CustomerList';
import { Supplier } from './SupplierList';
import { addTransaction } from '../services/transactionService';
import { addBankAccount, deleteBankAccount, updateBankAccount } from '../services/bankAccountService';
import { addCategory } from '../services/categoryService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatKenyanNumber } from '../utils/numberFormat';
import { useAuth } from '../contexts/AuthContext';

interface BasicAccountingProps {
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  bankAccounts: BankAccount[];
  setBankAccounts: (accounts: BankAccount[]) => void;
  categories: string[];
  setCategories: (categories: string[]) => void;
  customers: Customer[];
  suppliers: Supplier[];
}

export default function BasicAccounting({ 
  transactions, 
  setTransactions,
  bankAccounts,
  setBankAccounts,
  categories,
  setCategories,
  customers,
  suppliers
}: BasicAccountingProps) {
  const { user } = useAuth();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBankAccountForm, setShowBankAccountForm] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showSelfTransferForm, setShowSelfTransferForm] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccount | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('All');
  const [filterBankAccount, setFilterBankAccount] = useState('All');
  const [saving, setSaving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    type: 'debit' as 'debit' | 'credit' | 'contra',
    contraType: 'supplier-receiver' as 'supplier-receiver' | 'invoice' | 'purchase' | 'contra-entry',
    amount: '',
    category: 'Material Purchase',
    paymentMethod: 'CASH',
    bankAccountId: '',
    senderName: '',
    receiverName: '',
  });

  const [bankFormData, setBankFormData] = useState({
    accountName: '',
    accountNumber: '',
    initialBalance: '',
  });

  const [selfTransferData, setSelfTransferData] = useState({
    date: new Date().toISOString().split('T')[0],
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    transferCharge: '',
    description: '',
  });

  const paymentMethods = ['CASH', 'BANK', 'MPESA', 'RTGS'];

  // Delete Bank Account
  const handleDeleteBankAccount = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this bank account? This action cannot be undone.')) {
      return;
    }
    
    try {
      await deleteBankAccount(accountId);
      // Don't manually filter - let the subscription update the state
      alert('Bank account deleted successfully!');
    } catch (error) {
      console.error('Error deleting bank account:', error);
      alert('Failed to delete bank account. Please try again.');
    }
  };

  // Edit Bank Account
  const handleEditBankAccount = (account: BankAccount) => {
    setEditingBankAccount(account);
    setBankFormData({
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      initialBalance: account.currentBalance.toString(),
    });
    setShowBankAccountForm(true);
  };

  // Add Bank Account
  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingBank(true);
      
      if (editingBankAccount) {
        // Update existing account
        const newBalance = parseFloat(bankFormData.initialBalance);
        const balanceDifference = newBalance - editingBankAccount.currentBalance;
        
        // Calculate what the initial balance should be to achieve the desired current balance
        // currentBalance = initialBalance + credits - debits
        // So: initialBalance = currentBalance - credits + debits
        const accountTransactions = transactions.filter(t => t.bankAccountId === editingBankAccount.id);
        const totalCredits = accountTransactions
          .filter(t => t.type === 'credit')
          .reduce((sum, t) => sum + t.amount, 0);
        const totalDebits = accountTransactions
          .filter(t => t.type === 'debit')
          .reduce((sum, t) => sum + t.amount, 0);
        
        const requiredInitialBalance = newBalance - totalCredits + totalDebits;
        
        await updateBankAccount(editingBankAccount.id, {
          accountName: bankFormData.accountName,
          accountNumber: bankFormData.accountNumber,
          initialBalance: requiredInitialBalance,
        });
        
        // If balance changed, create a transaction to record the adjustment
        if (balanceDifference !== 0) {
          const adjustmentTransaction: Transaction = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            description: `Balance adjustment for ${bankFormData.accountName}`,
            type: balanceDifference > 0 ? 'credit' : 'debit',
            amount: Math.abs(balanceDifference),
            category: 'Balance Adjustment',
            paymentMethod: 'BANK',
            bankAccountId: editingBankAccount.id,
            source: 'basic_accounting',
          };
          const txnId = await addTransaction(adjustmentTransaction);
          adjustmentTransaction.id = txnId;
          setTransactions([...transactions, adjustmentTransaction]);
        }
        
        // Update local state immediately for better UX
        setBankAccounts(bankAccounts.map(acc => 
          acc.id === editingBankAccount.id 
            ? { 
                ...acc, 
                accountName: bankFormData.accountName,
                accountNumber: bankFormData.accountNumber,
                initialBalance: requiredInitialBalance,
                currentBalance: newBalance,
              }
            : acc
        ));
        setEditingBankAccount(null);
        
        alert('Bank account updated successfully!');
      } else {
        // Add new account
        const newAccount: BankAccount = {
          id: Date.now().toString(),
          accountName: bankFormData.accountName,
          accountNumber: bankFormData.accountNumber,
          initialBalance: parseFloat(bankFormData.initialBalance),
          currentBalance: parseFloat(bankFormData.initialBalance),
        };
        const firestoreId = await addBankAccount(newAccount);
        newAccount.id = firestoreId;
        setBankAccounts([...bankAccounts, newAccount]);
      }
      
      setBankFormData({ accountName: '', accountNumber: '', initialBalance: '' });
      setShowBankAccountForm(false);
    } catch (error) {
      console.error('Error saving bank account:', error);
      alert('Failed to save bank account. Please try again.');
    } finally {
      setSavingBank(false);
    }
  };

  // Add Custom Category
  const handleAddCategory = async () => {
    if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
      const newCategory = newCategoryName.trim();
      try {
        // Add to Firestore
        await addCategory(newCategory);
        // Also update local state immediately for better UX
        setCategories([...categories, newCategory]);
        setFormData({ ...formData, category: newCategory });
        setNewCategoryName('');
        setShowAddCategoryModal(false);
      } catch (error) {
        console.error('Error adding category:', error);
        alert('Failed to add category. Please try again.');
      }
    }
  };

  // Handle Self Transfer
  const handleSelfTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selfTransferData.fromAccountId === selfTransferData.toAccountId) {
      alert('Source and destination accounts must be different!');
      return;
    }
    
    try {
      setSaving(true);
      
      const transferAmount = parseFloat(selfTransferData.amount);
      const transferCharge = parseFloat(selfTransferData.transferCharge) || 0;
      const totalDeduction = transferAmount + transferCharge;
      
      const fromAccount = bankAccounts.find(acc => acc.id === selfTransferData.fromAccountId);
      const toAccount = bankAccounts.find(acc => acc.id === selfTransferData.toAccountId);
      
      if (!fromAccount || !toAccount) {
        alert('Invalid bank accounts selected');
        return;
      }

      // Create debit transaction for source account (amount + transfer charge)
      const debitTransaction: Transaction = {
        id: Date.now().toString(),
        date: selfTransferData.date,
        description: `Transfer to ${toAccount.accountName}${selfTransferData.description ? ` - ${selfTransferData.description}` : ''}`,
        type: 'debit',
        amount: totalDeduction,
        category: 'Bank Transfer',
        paymentMethod: 'BANK',
        bankAccountId: selfTransferData.fromAccountId,
        transferCharge: transferCharge,
        source: 'basic_accounting',
      };
      
      const debitId = await addTransaction(debitTransaction);
      debitTransaction.id = debitId;
      
      // Create credit transaction for destination account (only the transfer amount, not the charge)
      const creditTransaction: Transaction = {
        id: (Date.now() + 1).toString(),
        date: selfTransferData.date,
        description: `Transfer from ${fromAccount.accountName}${selfTransferData.description ? ` - ${selfTransferData.description}` : ''}`,
        type: 'credit',
        amount: transferAmount,
        category: 'Bank Transfer',
        paymentMethod: 'BANK',
        bankAccountId: selfTransferData.toAccountId,
        source: 'basic_accounting',
      };
      
      const creditId = await addTransaction(creditTransaction);
      creditTransaction.id = creditId;
      
      // Update transaction list (no separate charge transaction as it's already included in the debit)
      setTransactions([...transactions, debitTransaction, creditTransaction]);
      
      // Reset form
      setSelfTransferData({
        date: new Date().toISOString().split('T')[0],
        fromAccountId: '',
        toAccountId: '',
        amount: '',
        transferCharge: '',
        description: '',
      });
      setShowSelfTransferForm(false);
      
      alert('Self transfer completed successfully!');
    } catch (error) {
      console.error('Error processing self transfer:', error);
      alert('Failed to process transfer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Add Transaction
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const newTransaction: Transaction = {
        id: Date.now().toString(),
        date: formData.date,
        description: formData.description,
        type: formData.type,
        contraType: formData.type === 'contra' ? formData.contraType : undefined,
        amount: parseFloat(formData.amount),
        category: formData.category,
        paymentMethod: formData.paymentMethod,
        bankAccountId: formData.bankAccountId || undefined,
        senderName: formData.senderName || undefined,
        receiverName: formData.receiverName || undefined,
        source: 'basic_accounting',
      };

      // Bank account balance will be updated automatically by parent component
      const firestoreId = await addTransaction(newTransaction);
      newTransaction.id = firestoreId;
      setTransactions([...transactions, newTransaction]);
      
      // Log to console which categories create statement entries
      const statementCategories = ['Material Purchase', 'Material Sales', 'Product Sales'];
      const createsStatementEntry = statementCategories.includes(newTransaction.category);
      console.log(`Transaction saved. Category: ${newTransaction.category}, Creates Statement Entry: ${createsStatementEntry}`);
      
      // Create payment tracking transaction for Material Sales, Material Purchase, Product Sales
      if (createsStatementEntry) {
        try {
          // Determine the correct party based on transaction type and category
          let partyName = '';
          let partyType: 'customer' | 'supplier' = 'customer';
          
          // For Material Sales and Product Sales: customer is involved
          // For Material Purchase: supplier is involved
          if (newTransaction.category === 'Material Sales' || newTransaction.category === 'Product Sales') {
            // Sales involve customers
            // For credit (Payment Receive), sender is customer
            // For debit (Payment Debit), receiver is customer
            partyName = newTransaction.type === 'credit' ? newTransaction.senderName || '' : newTransaction.receiverName || '';
            partyType = 'customer';
          } else if (newTransaction.category === 'Material Purchase') {
            // Purchase involves suppliers
            // For credit (Payment Receive), receiver is supplier
            // For debit (Payment Debit), sender is supplier
            partyName = newTransaction.type === 'credit' ? newTransaction.receiverName || '' : newTransaction.senderName || '';
            partyType = 'supplier';
          }
          
          if (partyName) {
            // Find the party details
            let partyId = '';
            let partyCompanyName = '';
            let partyCode = '';
            
            if (partyType === 'customer') {
              const customer = customers.find(c => 
                c.companyName.trim().toUpperCase() === partyName.trim().toUpperCase()
              );
              if (customer) {
                partyId = customer.id;
                partyCompanyName = customer.companyName;
                partyCode = customer.customerCode;
              } else {
                console.warn(`Customer not found for name: ${partyName}`);
              }
            } else {
              const supplier = suppliers.find(s => 
                s.companyName.trim().toUpperCase() === partyName.trim().toUpperCase()
              );
              if (supplier) {
                partyId = supplier.id;
                partyCompanyName = supplier.companyName;
                partyCode = supplier.supplierCode;
              } else {
                console.warn(`Supplier not found for name: ${partyName}`);
              }
            }
            
            if (partyId) {
              // Import the service
              const { addPaymentTransaction } = await import('../services/paymentTrackingService');
              
              console.log(`Creating payment tracking: Type=${partyType}, ID=${partyId}, Name=${partyCompanyName}, Code=${partyCode}`);
              
              await addPaymentTransaction(
                {
                  partyType,
                  partyId,
                  partyName: partyCompanyName,
                  partyCode,
                  transactionType: 'invoice',
                  referenceNumber: `BA-${firestoreId.substring(0, 8)}`,
                  amount: newTransaction.amount,
                  date: newTransaction.date,
                  paymentMethod: newTransaction.paymentMethod,
                  description: `${newTransaction.category}: ${newTransaction.description}`,
                  status: 'pending'
                },
                'System'
              );
              
              console.log(`✓ Payment tracking transaction created for ${partyType}: ${partyCompanyName} (ID: ${partyId})`);
            } else {
              console.error(`Could not create payment tracking - ${partyType} not found for: ${partyName}`);
            }
          }
        } catch (error) {
          console.error('Error creating payment tracking transaction:', error);
          // Don't fail the transaction if payment tracking fails
        }
      }
      
      setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '',
        type: 'debit',
        contraType: 'supplier-receiver',
        amount: '',
        category: 'Material Purchase',
        paymentMethod: 'CASH',
        bankAccountId: '',
        senderName: '',
        receiverName: '',
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Failed to save transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Show preview for CSV then download
  const showCSVPreview = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

    // Header - Professional Black & White with Company Name
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('DONATO IMPEX LTD.', 148, 10, { align: 'center' });
    doc.setFontSize(16);
    doc.text('RECYCLE BUSINESS MANAGER', 148, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Basic Accounting Report', 148, 26, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 148, 32, { align: 'center' });

    // Divider line
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(15, 30, 282, 30);

    // Summary
    const totalDebit = filteredTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    const totalCredit = filteredTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Transactions: `, 15, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(filteredTransactions.length.toString(), 55, 37);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Debit:`, 80, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalDebit)}`, 105, 37);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Credit:`, 150, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalCredit)}`, 177, 37);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Balance:`, 225, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalCredit - totalDebit)}`, 245, 37);

    // Table
    const tableData = filteredTransactions.map(t => [
      t.date,
      t.description,
      t.type.toUpperCase(),
      t.category,
      t.paymentMethod,
      t.bankAccountId || 'N/A',
      `KSH ${formatKenyanNumber(t.amount)}`
    ]);

    autoTable(doc, {
      startY: 43,
      head: [['Date', 'Description', 'Type', 'Category', 'Payment', 'Account', 'Amount']],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: [0, 0, 0], 
        fontSize: 8, 
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      },
      bodyStyles: { 
        fontSize: 8,
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      margin: { left: 15, right: 15 },
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      }
    });

    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 43;
    doc.setFontSize(8);
    doc.text('This is a computer-generated document. No signature required.', 148, finalY + 8, { align: 'center' });
    doc.text('Recycle Business Manager - Accounting System', 148, finalY + 13, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });

    // Open native print dialog first
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      // Trigger native browser print dialog
      setTimeout(() => {
        iframe.contentWindow?.print();
        
        // Listen for after print event to download
        iframe.contentWindow?.addEventListener('afterprint', () => {
          doc.save(`accounting_report_${new Date().toISOString().split('T')[0]}.pdf`);
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(pdfUrl);
          }, 100);
        });
        
        // Also clean up if user cancels (after 30 seconds timeout)
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(pdfUrl);
          }
        }, 30000);
      }, 100);
    };
  };

  // Show preview for PDF then download
  const showPDFPreview = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

    // Header - Professional Black & White with Company Name
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('DONATO IMPEX LTD.', 148, 10, { align: 'center' });
    doc.setFontSize(16);
    doc.text('RECYCLE BUSINESS MANAGER', 148, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Basic Accounting Report', 148, 26, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 148, 32, { align: 'center' });

    // Divider line
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(15, 30, 282, 30);

    // Summary
    const totalDebit = filteredTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    const totalCredit = filteredTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Transactions: `, 15, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(filteredTransactions.length.toString(), 55, 37);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Debit:`, 80, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalDebit)}`, 105, 37);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Credit:`, 150, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalCredit)}`, 177, 37);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Balance:`, 225, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalCredit - totalDebit)}`, 245, 37);

    // Table
    const tableData = filteredTransactions.map(t => [
      t.date,
      t.description,
      t.type.toUpperCase(),
      t.category,
      t.paymentMethod,
      t.bankAccountId || 'N/A',
      `KSH ${formatKenyanNumber(t.amount)}`
    ]);

    autoTable(doc, {
      startY: 43,
      head: [['Date', 'Description', 'Type', 'Category', 'Payment', 'Account', 'Amount']],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: [0, 0, 0], 
        fontSize: 8, 
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      },
      bodyStyles: { 
        fontSize: 8,
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      margin: { left: 15, right: 15 },
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      }
    });

    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 43;
    doc.setFontSize(8);
    doc.text('This is a computer-generated document. No signature required.', 148, finalY + 8, { align: 'center' });
    doc.text('Recycle Business Manager - Accounting System', 148, finalY + 13, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });

    // Open native print dialog first
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      // Trigger native browser print dialog
      setTimeout(() => {
        iframe.contentWindow?.print();
        
        // Listen for after print event to download
        iframe.contentWindow?.addEventListener('afterprint', () => {
          doc.save(`accounting_report_${new Date().toISOString().split('T')[0]}.pdf`);
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(pdfUrl);
          }, 100);
        });
        
        // Also clean up if user cancels (after 30 seconds timeout)
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(pdfUrl);
          }
        }, 30000);
      }, 100);
    };
  };

  const openPrintPreviewCSV = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Basic Accounting - CSV Export</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { background: linear-gradient(to right, #9333ea, #7e22ce); color: white; padding: 30px; text-align: center; margin-bottom: 30px; }
          .header h1 { font-size: 32px; margin-bottom: 10px; }
          .summary { background: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; margin-bottom: 30px; border-radius: 8px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 15px; }
          .summary-item { text-align: center; }
          .summary-item .label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
          .summary-item .value { font-size: 20px; font-weight: 700; }
          .red { color: #dc2626; }
          .green { color: #10b981; }
          .blue { color: #3b82f6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          thead { background: #9333ea; color: white; }
          th, td { padding: 10px; text-align: left; border: 1px solid #e5e7eb; font-size: 12px; }
          tbody tr:nth-child(even) { background: #f9fafb; }
          .actions { margin: 20px 0; text-align: center; }
          .btn { padding: 12px 24px; margin: 0 10px; font-size: 14px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; }
          .btn-print { background: #3b82f6; color: white; }
          .btn-download { background: #10b981; color: white; }
          @media print { .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="actions">
          <button class="btn btn-print" onclick="window.print()">Print</button>
          <button class="btn btn-download" onclick="downloadCSV()">Download CSV</button>
        </div>

        <div class="header">
          <h1>BASIC ACCOUNTING</h1>
          <p>Donato Impex Ltd.</p>
          <p>Transaction Report</p>
        </div>

        <div class="summary">
          <h3 style="margin-bottom: 15px;">Financial Summary</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="label">Total Debits</div>
              <div class="value red">KSH ${formatKenyanNumber(totalDebits, 2)}</div>
            </div>
            <div class="summary-item">
              <div class="label">Total Credits</div>
              <div class="value green">KSH ${formatKenyanNumber(totalCredits, 2)}</div>
            </div>
            <div class="summary-item">
              <div class="label">Net Balance</div>
              <div class="value ${netBalance >= 0 ? 'blue' : 'red'}">KSH ${formatKenyanNumber(netBalance, 2)}</div>
            </div>
            <div class="summary-item">
              <div class="label">Total Transactions</div>
              <div class="value">${filteredTransactions.length}</div>
            </div>
          </div>
          <p style="font-size: 12px; color: #6b7280;">Generated On: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th style="text-align: right;">Amount</th>
              <th>Category</th>
              <th>Payment</th>
              <th>Bank Account</th>
              <th>Sender</th>
              <th>Receiver</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTransactions.map((t, idx) => {
              const bankAccount = bankAccounts.find(b => b.id === t.bankAccountId);
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${new Date(t.date).toLocaleDateString('en-GB')}</td>
                  <td>${t.description}</td>
                  <td>${t.type.toUpperCase()}</td>
                  <td style="text-align: right; font-weight: 600;">KSH ${formatKenyanNumber(t.amount, 2)}</td>
                  <td>${t.category}</td>
                  <td>${t.paymentMethod}</td>
                  <td>${bankAccount?.accountName || 'N/A'}</td>
                  <td>${t.senderName || 'N/A'}</td>
                  <td>${t.receiverName || 'N/A'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <script>
          function downloadCSV() {
            const rows = [
              ['Date', 'Description', 'Type', 'Amount (KSH)', 'Category', 'Payment Method', 'Bank Account', 'Sender', 'Receiver'],
              ${filteredTransactions.map(t => {
                const bankAccount = bankAccounts.find(b => b.id === t.bankAccountId);
                return `['${t.date}', '${t.description.replace(/'/g, "\\'")}', '${t.type.toUpperCase()}', '${formatKenyanNumber(t.amount, 2)}', '${t.category}', '${t.paymentMethod}', '${bankAccount?.accountName || 'N/A'}', '${t.senderName || 'N/A'}', '${t.receiverName || 'N/A'}']`;
              }).join(',\n')}
            ];
            
            const csvContent = rows.map(row => row.map(cell => \`"\${cell}"\`).join(',')).join('\\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'transactions_${new Date().toISOString().split('T')[0]}.csv';
            link.click();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const openPrintPreviewPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Basic Accounting - PDF Report</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { background: linear-gradient(to right, #9333ea, #7e22ce); color: white; padding: 30px; text-align: center; margin-bottom: 30px; }
          .header h1 { font-size: 32px; margin-bottom: 10px; }
          .summary { background: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; margin-bottom: 30px; border-radius: 8px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 15px; }
          .summary-item { text-align: center; }
          .summary-item .label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
          .summary-item .value { font-size: 20px; font-weight: 700; }
          .red { color: #dc2626; }
          .green { color: #10b981; }
          .blue { color: #3b82f6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          thead { background: #9333ea; color: white; }
          th, td { padding: 10px; text-align: left; border: 1px solid #e5e7eb; font-size: 11px; }
          tbody tr:nth-child(even) { background: #f9fafb; }
          .actions { margin: 20px 0; text-align: center; }
          .btn { padding: 12px 24px; margin: 0 10px; font-size: 14px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; }
          .btn-print { background: #3b82f6; color: white; }
          .btn-download { background: #9333ea; color: white; }
          @media print { .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="actions">
          <button class="btn btn-print" onclick="window.print()">Print</button>
          <button class="btn btn-download" onclick="downloadPDF()">Download PDF</button>
        </div>

        <div class="header">
          <h1>BASIC ACCOUNTING</h1>
          <p>Donato Impex Ltd.</p>
          <p>Transaction Report</p>
        </div>

        <div class="summary">
          <h3 style="margin-bottom: 15px;">Financial Summary</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="label">Total Debits</div>
              <div class="value red">KSH ${formatKenyanNumber(totalDebits, 2)}</div>
            </div>
            <div class="summary-item">
              <div class="label">Total Credits</div>
              <div class="value green">KSH ${formatKenyanNumber(totalCredits, 2)}</div>
            </div>
            <div class="summary-item">
              <div class="label">Net Balance</div>
              <div class="value ${netBalance >= 0 ? 'blue' : 'red'}">KSH ${formatKenyanNumber(netBalance, 2)}</div>
            </div>
            <div class="summary-item">
              <div class="label">Total Transactions</div>
              <div class="value">${filteredTransactions.length}</div>
            </div>
          </div>
          <p style="font-size: 12px; color: #6b7280;">Generated On: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th style="text-align: right;">Amount</th>
              <th>Category</th>
              <th>Payment</th>
              <th>Bank Account</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTransactions.map((t, idx) => {
              const bankAccount = bankAccounts.find(b => b.id === t.bankAccountId);
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${new Date(t.date).toLocaleDateString('en-GB')}</td>
                  <td>${t.description}</td>
                  <td>${t.type.toUpperCase()}</td>
                  <td style="text-align: right; font-weight: 600;">KSH ${formatKenyanNumber(t.amount, 2)}</td>
                  <td>${t.category}</td>
                  <td>${t.paymentMethod}</td>
                  <td>${bankAccount?.accountName || 'N/A'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"></script>
        <script>
          function downloadPDF() {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFillColor(147, 51, 234);
            doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text('BASIC ACCOUNTING', 105, 15, { align: 'center' });
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text('Donato Impex Ltd.', 105, 25, { align: 'center' });
            doc.text('Transaction Report', 105, 32, { align: 'center' });
            
            doc.setTextColor(0, 0, 0);
            doc.setFillColor(249, 250, 251);
            doc.rect(14, 50, 182, 35, 'F');
            doc.setDrawColor(229, 231, 235);
            doc.rect(14, 50, 182, 35, 'S');
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Summary', 20, 58);
            doc.setFont('helvetica', 'normal');
            doc.text('Total Debits:', 20, 66);
            doc.setTextColor(220, 38, 38);
            doc.text('KSH ${formatKenyanNumber(totalDebits, 2)}', 60, 66);
            doc.setTextColor(0, 0, 0);
            doc.text('Total Credits:', 20, 73);
            doc.setTextColor(16, 185, 129);
            doc.text('KSH ${formatKenyanNumber(totalCredits, 2)}', 60, 73);
            doc.setTextColor(0, 0, 0);
            doc.text('Net Balance:', 120, 66);
            doc.setTextColor(${netBalance >= 0 ? '16, 185, 129' : '220, 38, 38'});
            doc.text('KSH ${formatKenyanNumber(netBalance, 2)}', 160, 66);
            doc.setTextColor(0, 0, 0);
            doc.text('Generated On:', 120, 73);
            doc.text('${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}', 160, 73);
            doc.text('Total Transactions:', 20, 80);
            doc.text('${filteredTransactions.length}', 60, 80);
            
            const tableData = ${JSON.stringify(filteredTransactions.map((t, idx) => {
              const bankAccount = bankAccounts.find(b => b.id === t.bankAccountId);
              return [
                idx + 1,
                new Date(t.date).toLocaleDateString('en-GB'),
                t.description,
                t.type.toUpperCase(),
                `KSH ${formatKenyanNumber(t.amount, 2)}`,
                t.category,
                t.paymentMethod,
                bankAccount?.accountName || 'N/A'
              ];
            }))};
            
            doc.autoTable({
              startY: 95,
              head: [['#', 'Date', 'Description', 'Type', 'Amount', 'Category', 'Payment', 'Bank Account']],
              body: tableData,
              theme: 'striped',
              headStyles: { fillColor: [147, 51, 234], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
              styles: { fontSize: 8, cellPadding: 3 },
              columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 20 },
                2: { cellWidth: 40 },
                3: { cellWidth: 18 },
                4: { cellWidth: 25, halign: 'right' },
                5: { cellWidth: 25 },
                6: { cellWidth: 18 },
                7: { cellWidth: 26 }
              },
              alternateRowStyles: { fillColor: [249, 250, 251] }
            });
            
            const finalY = doc.lastAutoTable.finalY || 95;
            doc.setTextColor(107, 114, 128);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text('This is a computer-generated document. No signature is required.', 105, finalY + 10, { align: 'center' });
            doc.text('Page 1 of 1', 105, finalY + 15, { align: 'center' });
            
            // Sentiment AI Footer
            const pageHeight = doc.internal.pageSize.height;
            doc.setTextColor(64, 64, 64);
            doc.setFont('helvetica', 'normal');
            doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });
            
            doc.save('BasicAccounting_${new Date().toISOString().split('T')[0]}.pdf');
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Download Excel/CSV
  const downloadExcel = () => {
    const headers = ['Date', 'Description', 'Type', 'Amount (KSH)', 'Category', 'Payment Method', 'Bank Account', 'Sender', 'Receiver'];
    const rows = filteredTransactions.map(t => {
      const bankAccount = bankAccounts.find(b => b.id === t.bankAccountId);
      return [
        t.date,
        t.description,
        t.type.toUpperCase(),
        formatKenyanNumber(t.amount, 2),
        t.category,
        t.paymentMethod,
        bankAccount?.accountName || 'N/A',
        t.senderName || 'N/A',
        t.receiverName || 'N/A'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Download PDF
  const downloadPDF = () => {
    const doc = new jsPDF();
    
    // Company Header
    doc.setFillColor(147, 51, 234); // Purple color
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('BASIC ACCOUNTING', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Donato Impex Ltd.', 105, 25, { align: 'center' });
    doc.text('Transaction Report', 105, 32, { align: 'center' });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    // Summary Box
    doc.setFillColor(249, 250, 251);
    doc.rect(14, 50, 182, 35, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.rect(14, 50, 182, 35, 'S');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, 58);
    
    doc.setFont('helvetica', 'normal');
            doc.text('Total Debits:', 20, 66);
            doc.setTextColor(220, 38, 38);
            doc.text(`KSH ${formatKenyanNumber(totalDebits, 2)}`, 60, 66);
            
            doc.setTextColor(0, 0, 0);
            doc.text('Total Credits:', 20, 73);
            doc.setTextColor(16, 185, 129);
            doc.text(`KSH ${formatKenyanNumber(totalCredits, 2)}`, 60, 73);
            
            doc.setTextColor(0, 0, 0);
            doc.text('Net Balance:', 120, 66);
            doc.setTextColor(netBalance >= 0 ? 16 : 220, netBalance >= 0 ? 185 : 38, netBalance >= 0 ? 129 : 38);
            doc.text(`KSH ${formatKenyanNumber(netBalance, 2)}`, 160, 66);    doc.setTextColor(0, 0, 0);
    doc.text('Generated On:', 120, 73);
    doc.text(new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB'), 160, 73);
    
    doc.text('Total Transactions:', 20, 80);
    doc.text(filteredTransactions.length.toString(), 60, 80);
    
    // Transactions Table
    const tableData = filteredTransactions.map((t, index) => {
      const bankAccount = bankAccounts.find(b => b.id === t.bankAccountId);
      return [
        index + 1,
        new Date(t.date).toLocaleDateString('en-GB'),
        t.description,
        t.type.toUpperCase(),
        `KSH ${formatKenyanNumber(t.amount, 2)}`,
        t.category,
        t.paymentMethod,
        bankAccount?.accountName || 'N/A'
      ];
    });
    
    autoTable(doc, {
      startY: 95,
      head: [['#', 'Date', 'Description', 'Type', 'Amount', 'Category', 'Payment', 'Bank Account']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [147, 51, 234],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      styles: {
        fontSize: 8,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 20 },
        2: { cellWidth: 40 },
        3: { cellWidth: 18 },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25 },
        6: { cellWidth: 18 },
        7: { cellWidth: 26 }
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251]
      }
    });
    
    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 95;
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const footerY = finalY + 10;
    doc.text('This is a computer-generated document. No signature is required.', 105, footerY, { align: 'center' });
    doc.text(`Page 1 of 1`, 105, footerY + 5, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });
    
    // Save PDF
    const fileName = `BasicAccounting_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  // All transactions now come from Firestore (including shipment-based ones)
  // Sort transactions using createdAtMillis for consistent ordering (newest first)
  const allTransactions = [...transactions].sort((a, b) => {
    // Primary: Use createdAtMillis if available (numeric timestamp)
    const aMillis = (a as any).createdAtMillis;
    const bMillis = (b as any).createdAtMillis;
    
    if (aMillis && bMillis) {
      return bMillis - aMillis; // Descending (newest first)
    }
    
    // Secondary: Try createdAt timestamp
    if (a.createdAt && b.createdAt) {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      if (bTime !== aTime) {
        return bTime - aTime;
      }
    }
    
    // Tertiary: Use document ID (Firestore IDs are chronologically ordered)
    if (a.id && b.id) {
      const idCompare = b.id.localeCompare(a.id);
      if (idCompare !== 0) {
        return idCompare;
      }
    }
    
    // Quaternary: Fall back to date
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });

  const filteredTransactions = allTransactions.filter(t => {
    const matchesSearch = searchTerm === '' || 
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.senderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.receiverName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'All' || t.category === filterCategory;
    const matchesPaymentMethod = filterPaymentMethod === 'All' || t.paymentMethod === filterPaymentMethod;
    const matchesBankAccount = filterBankAccount === 'All' || t.bankAccountId === filterBankAccount;
    
    return matchesSearch && matchesCategory && matchesPaymentMethod && matchesBankAccount;
  });

  // Calculate totals (excluding contra entries from payment tracking which are just for record keeping)
  // Payment tracking entries (contraType: 'contra-entry') show HOW invoices were paid,
  // but should not be counted again since the invoice already recorded the income/expense
  const totalDebits = allTransactions
    .filter(t => t.type === 'debit' && t.contraType !== 'contra-entry')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCredits = allTransactions
    .filter(t => t.type === 'credit' && t.contraType !== 'contra-entry')
    .reduce((sum, t) => sum + t.amount, 0);

  const netBalance = totalCredits - totalDebits;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-xl">
              <Calculator className="w-8 h-8 text-purple-600" />
            </div>
            Basic Accounting
          </h1>
          <p className="text-gray-600 mt-2">
            Track your financial transactions and maintain accounts
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSelfTransferForm(!showSelfTransferForm)}
            className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-green-700 transition-colors"
          >
            <DollarSign className="w-5 h-5" />
            Self Transfer
          </button>
          <button
            onClick={() => setShowBankAccountForm(!showBankAccountForm)}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <Building2 className="w-5 h-5" />
            Manage Bank Accounts
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-purple-700 transition-colors"
            style={{ display: 'none' }}
          >
            <Plus className="w-5 h-5" />
            Add Transaction
          </button>
        </div>
      </div>

      {/* Bank Accounts Display */}
      {user.role === 'admin' && bankAccounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Bank Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((account) => (
              <div key={account.id} className="border border-gray-200 rounded-lg p-4 relative group">
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEditBankAccount(account)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit Account"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBankAccount(account.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete Account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-900">{account.accountName}</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">A/C: {account.accountNumber}</p>
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs text-gray-500">Current Balance</p>
                  <p className={`text-2xl font-bold ${account.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    KSH {formatKenyanNumber(account.currentBalance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Bank Account Form */}
      {showBankAccountForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              {editingBankAccount ? 'Edit Bank Account' : 'Add Bank Account'}
            </h3>
            {editingBankAccount && (
              <button
                onClick={() => {
                  setEditingBankAccount(null);
                  setBankFormData({ accountName: '', accountNumber: '', initialBalance: '' });
                  setShowBankAccountForm(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <form onSubmit={handleAddBankAccount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Name
                </label>
                <input
                  type="text"
                  value={bankFormData.accountName}
                  onChange={(e) => setBankFormData({ ...bankFormData, accountName: e.target.value })}
                  placeholder="e.g., KCB Main Account"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Number
                </label>
                <input
                  type="text"
                  value={bankFormData.accountNumber}
                  onChange={(e) => setBankFormData({ ...bankFormData, accountNumber: e.target.value })}
                  placeholder="Enter account number"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {editingBankAccount ? 'Balance (KSH)' : 'Initial Balance (KSH)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={bankFormData.initialBalance}
                  onChange={(e) => setBankFormData({ ...bankFormData, initialBalance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingBank}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingBank ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {editingBankAccount ? 'Updating...' : 'Saving...'}
                  </>
                ) : (
                  editingBankAccount ? 'Update Bank Account' : 'Add Bank Account'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBankAccountForm(false);
                  setEditingBankAccount(null);
                  setBankFormData({ accountName: '', accountNumber: '', initialBalance: '' });
                }}
                disabled={savingBank}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Self Transfer Form */}
      {showSelfTransferForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Bank Self Transfer</h3>
            <button
              onClick={() => {
                setShowSelfTransferForm(false);
                setSelfTransferData({
                  date: new Date().toISOString().split('T')[0],
                  fromAccountId: '',
                  toAccountId: '',
                  amount: '',
                  transferCharge: '',
                  description: '',
                });
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSelfTransfer} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transfer Date
                </label>
                <input
                  type="date"
                  value={selfTransferData.date}
                  onChange={(e) => setSelfTransferData({ ...selfTransferData, date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transfer Amount (KSH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={selfTransferData.amount}
                  onChange={(e) => setSelfTransferData({ ...selfTransferData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Account
                </label>
                <select
                  value={selfTransferData.fromAccountId}
                  onChange={(e) => setSelfTransferData({ ...selfTransferData, fromAccountId: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                >
                  <option value="">Select Source Account</option>
                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} - KSH {formatKenyanNumber(account.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Account
                </label>
                <select
                  value={selfTransferData.toAccountId}
                  onChange={(e) => setSelfTransferData({ ...selfTransferData, toAccountId: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                >
                  <option value="">Select Destination Account</option>
                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} - KSH {formatKenyanNumber(account.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bank Transfer Charge (KSH)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={selfTransferData.transferCharge}
                  onChange={(e) => setSelfTransferData({ ...selfTransferData, transferCharge: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={selfTransferData.description}
                  onChange={(e) => setSelfTransferData({ ...selfTransferData, description: e.target.value })}
                  placeholder="Enter transfer description"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
            </div>
            {selfTransferData.amount && selfTransferData.transferCharge && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Transfer Amount:</span>
                    <span className="ml-2 font-semibold text-gray-900">KSH {formatKenyanNumber(parseFloat(selfTransferData.amount))}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Bank Charge:</span>
                    <span className="ml-2 font-semibold text-gray-900">KSH {formatKenyanNumber(parseFloat(selfTransferData.transferCharge))}</span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-green-300">
                    <span className="text-gray-600">Total Deduction from Source:</span>
                    <span className="ml-2 font-bold text-green-700 text-lg">
                      KSH {formatKenyanNumber(parseFloat(selfTransferData.amount) + parseFloat(selfTransferData.transferCharge))}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">Amount Credited to Destination:</span>
                    <span className="ml-2 font-bold text-blue-700 text-lg">KSH {formatKenyanNumber(parseFloat(selfTransferData.amount))}</span>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  'Process Transfer'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSelfTransferForm(false);
                  setSelfTransferData({
                    date: new Date().toISOString().split('T')[0],
                    fromAccountId: '',
                    toAccountId: '',
                    amount: '',
                    transferCharge: '',
                    description: '',
                  });
                }}
                disabled={saving}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Custom Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Custom Category</h3>
              <button
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
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
                  className="flex-1 px-6 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
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

      {/* Add Transaction Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">New Transaction</h3>
          <form onSubmit={handleAddTransaction} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'debit' | 'credit' | 'contra' })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  required
                >
                  <option value="debit">Payment Debit</option>
                  <option value="credit">Payment Receive</option>
                  <option value="contra">Contra Entry</option>
                </select>
              </div>
            </div>

            {/* Contra Type - Only show when type is contra */}
            {formData.type === 'contra' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contra Entry Type
                </label>
                <select
                  value={formData.contraType}
                  onChange={(e) => setFormData({ ...formData, contraType: e.target.value as 'supplier-receiver' | 'invoice' | 'purchase' | 'contra-entry' })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  required
                >
                  <option value="supplier-receiver">Supplier and Receiver Both Same</option>
                  <option value="invoice">Invoice</option>
                  <option value="purchase">Purchase</option>
                  <option value="contra-entry">Contra Entry</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter transaction description"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
                  <span>Category</span>
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="text-purple-600 hover:text-purple-700 flex items-center gap-1 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add New
                  </button>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  required
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
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
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sender Name
                </label>
                <select
                  value={formData.senderName}
                  onChange={(e) => {
                    const newSenderName = e.target.value;
                    setFormData({ 
                      ...formData, 
                      senderName: newSenderName,
                      // For contra entries, set receiver same as sender
                      receiverName: formData.type === 'contra' ? newSenderName : formData.receiverName
                    });
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                >
                  <option value="">Select Sender</option>
                  {formData.type === 'contra' ? (
                    // Contra Entry: Show both customers and suppliers
                    <>
                      <optgroup label="Customers">
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.companyName}>
                            {customer.companyName} ({customer.customerCode})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Suppliers">
                        {suppliers.map(supplier => (
                          <option key={supplier.id} value={supplier.companyName}>
                            {supplier.companyName} ({supplier.supplierCode})
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : formData.type === 'credit' ? (
                    // Payment Receive: Sender = Customer
                    customers.map(customer => (
                      <option key={customer.id} value={customer.companyName}>
                        {customer.companyName} ({customer.customerCode})
                      </option>
                    ))
                  ) : (
                    // Payment Debit: Sender = Supplier
                    suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.companyName}>
                        {supplier.companyName} ({supplier.supplierCode})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Receiver Name {formData.type === 'contra' && <span className="text-xs text-gray-500">(Same as Sender)</span>}
                </label>
                <select
                  value={formData.receiverName}
                  onChange={(e) => setFormData({ ...formData, receiverName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  disabled={formData.type === 'contra'}
                >
                  <option value="">Select Receiver</option>
                  {formData.type === 'contra' ? (
                    // Contra Entry: Receiver same as Sender
                    <>
                      <optgroup label="Customers">
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.companyName}>
                            {customer.companyName} ({customer.customerCode})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Suppliers">
                        {suppliers.map(supplier => (
                          <option key={supplier.id} value={supplier.companyName}>
                            {supplier.companyName} ({supplier.supplierCode})
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : formData.type === 'credit' ? (
                    // Payment Receive: Receiver = Supplier
                    suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.companyName}>
                        {supplier.companyName} ({supplier.supplierCode})
                      </option>
                    ))
                  ) : (
                    // Payment Debit: Receiver = Customer
                    customers.map(customer => (
                      <option key={customer.id} value={customer.companyName}>
                        {customer.companyName} ({customer.customerCode})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Add Transaction'
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-red-50 rounded-lg">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Total Expenses</h3>
          </div>
          <p className="text-3xl font-bold text-red-600">KSH {formatKenyanNumber(totalDebits)}</p>
          <p className="text-sm text-gray-500 mt-2">All debits</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-emerald-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Total Income</h3>
          </div>
          <p className="text-3xl font-bold text-emerald-600">KSH {formatKenyanNumber(totalCredits)}</p>
          <p className="text-sm text-gray-500 mt-2">All credits</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2.5 rounded-lg ${netBalance >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
              <DollarSign className={`w-6 h-6 ${netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Net Balance</h3>
          </div>
          <p className={`text-3xl font-bold ${netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            KSH {formatKenyanNumber(netBalance)}
          </p>
          <p className="text-sm text-gray-500 mt-2">Income - Expenses</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-bold text-gray-900">Transaction History</h3>
              <span className="text-sm text-gray-500">({filteredTransactions.length} records)</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={showCSVPreview}
                className="px-4 py-2 bg-[#10b981] text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-[#059669] transition-colors"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
              <button
                onClick={showPDFPreview}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-purple-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value="All">All Payment Methods</option>
              {paymentMethods.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            <select
              value={filterBankAccount}
              onChange={(e) => setFilterBankAccount(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value="All">All Bank Accounts</option>
              {bankAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.accountName}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Description</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Category</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Type</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Payment Method</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Bank Account</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Sender</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Receiver</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map((transaction) => {
                  const bankAccount = bankAccounts.find(acc => acc.id === transaction.bankAccountId);
                  return (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-700 text-center">
                        {new Date(transaction.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium text-center">
                        <div>{transaction.description}</div>
                        {transaction.purchaseInvoiceNumber && (
                          <div className="text-xs text-blue-600 font-semibold mt-1">
                            Invoice: {transaction.purchaseInvoiceNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {transaction.category === 'Payment Received' || transaction.category === 'Payment Made' ? 'Payment' : transaction.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              transaction.paymentMethod === 'DB Note' || transaction.paymentMethod === 'CR Note'
                                ? 'bg-purple-100 text-purple-700'
                                : transaction.type === 'debit'
                                ? 'bg-red-100 text-red-700'
                                : transaction.type === 'credit'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {transaction.paymentMethod === 'DB Note' ? 'DB Note' :
                             transaction.paymentMethod === 'CR Note' ? 'CR Note' :
                             transaction.category === 'Payment Received' ? 'Received' :
                             transaction.category === 'Payment Made' ? 'Send' :
                             transaction.category === 'Payment' && transaction.type === 'credit' ? 'Received' :
                             transaction.category === 'Payment' && transaction.type === 'debit' ? 'Send' :
                             transaction.type === 'debit' ? 'Expense' : 
                             transaction.type === 'credit' ? 'Income' : 'Contra'}
                          </span>
                          {transaction.type === 'contra' && transaction.contraType && transaction.category !== 'Payment Received' && transaction.category !== 'Payment Made' && transaction.category !== 'Payment' && (
                            <div className="text-xs text-gray-500">
                              {transaction.contraType === 'supplier-receiver' ? 'Same Party' : 
                               transaction.contraType === 'invoice' ? 'Invoice' :
                               transaction.contraType === 'purchase' ? 'Purchase' : 'Contra Entry'}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-center">
                        {transaction.paymentMethod}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-center">
                        {bankAccount ? bankAccount.accountName : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-center">
                        {transaction.senderName || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-center">
                        {transaction.receiverName || '-'}
                      </td>
                      <td className={`px-6 py-4 text-sm font-bold text-center ${
                        transaction.type === 'debit' ? 'text-red-600' : transaction.type === 'credit' ? 'text-emerald-600' : 'text-blue-600'
                      }`}>
                        {transaction.type === 'debit' ? '-' : transaction.type === 'credit' ? '+' : ''}KSH {formatKenyanNumber(transaction.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No transactions found</p>
            <p className="text-sm text-gray-400 mt-2">
              {searchTerm || filterCategory !== 'All' || filterPaymentMethod !== 'All' || filterBankAccount !== 'All'
                ? 'Try adjusting your search or filters'
                : 'Add your first transaction to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
