import { useState, useEffect } from 'react';
import { ArrowLeft, Search, DollarSign, TrendingUp, TrendingDown, Calendar, Building2, Wallet, Download, Edit2 } from 'lucide-react';
import { subscribeToTransactions, updateTransaction } from '../services/transactionService';
import { subscribeToBankAccounts } from '../services/bankAccountService';
import { BankAccount, Transaction } from '../components/SenderPanel';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatKenyanNumber, formatKSH } from '../utils/numberFormat';
import { subscribeToCompanyDetails, CompanyDetails } from '../services/companyService';
import { subscribeToPaymentTransactions } from '../services/paymentTrackingService';

type ViewMode = 'main' | 'bank-accounts' | 'cash-accounts' | 'bank-monthly' | 'cash-monthly' | 'bank-datewise' | 'cash-datewise';

interface MonthlyRecord {
  month: number;
  monthName: string;
  credit: number;
  debit: number;
  balance: number;
  cd: 'CR' | 'DB';
}

export default function TransactionManagement() {
  const [view, setView] = useState<ViewMode>('main');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  
  // Real data from Firebase
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<any[]>([]);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>({
    id: 'company',
    companyPIN: '',
    companyName: 'COMPANY NAME',
    address: '',
    mobile: '',
    email: '',
    updatedAt: new Date().toISOString()
  });

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
      (accounts) => {
        setBankAccounts(accounts);
      },
      (error) => {
        console.error('Error loading bank accounts:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to transactions
  useEffect(() => {
    const unsubscribe = subscribeToTransactions(
      (txns) => {
        // Sort transactions using createdAtMillis for consistent ordering
        const sorted = [...txns].sort((a, b) => {
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
        setTransactions(sorted);
      },
      (error) => {
        console.error('Error loading transactions:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to payment transactions (both customer and supplier) to get transfer charges
  useEffect(() => {
    const unsubscribeCustomer = subscribeToPaymentTransactions(
      'customer',
      (txns) => {
        setPaymentTransactions(prev => {
          const filtered = prev.filter(t => t.partyType !== 'customer');
          return [...filtered, ...txns];
        });
      }
    );
    
    const unsubscribeSupplier = subscribeToPaymentTransactions(
      'supplier',
      (txns) => {
        setPaymentTransactions(prev => {
          const filtered = prev.filter(t => t.partyType !== 'supplier');
          return [...filtered, ...txns];
        });
      }
    );
    
    return () => {
      unsubscribeCustomer();
      unsubscribeSupplier();
    };
  }, []);

  // Helper function to get transfer charge from payment tracking
  const getTransferCharge = (transaction: Transaction): number | undefined => {
    // Only look for transfer charges on contra entries (payments)
    if (transaction.type !== 'contra' || transaction.contraType !== 'contra-entry') {
      return transaction.transferCharge;
    }
    
    // Match by date, amount, and party name
    const matchingPayment = paymentTransactions.find(pt => {
      const dateMatch = pt.date === transaction.date;
      const amountMatch = pt.amount === transaction.amount;
      const partyMatch = transaction.senderName 
        ? pt.partyName === transaction.senderName 
        : pt.partyName === transaction.receiverName;
      
      return dateMatch && amountMatch && partyMatch && pt.transactionType === 'payment';
    });
    
    return matchingPayment?.transferCharge || transaction.transferCharge;
  };

  const handleEditTransaction = async (txn: Transaction) => {
    try {
      const newDescription = window.prompt('Edit description:', txn.description || '');
      if (newDescription === null) return;

      const newAmountInput = window.prompt('Edit amount:', String(txn.amount));
      if (newAmountInput === null) return;
      const newAmount = Number(newAmountInput);
      if (Number.isNaN(newAmount) || newAmount <= 0) {
        alert('Invalid amount. Please enter a positive number.');
        return;
      }

      const newDate = window.prompt('Edit date (YYYY-MM-DD):', txn.date || '');
      if (newDate === null) return;

      await updateTransaction(txn.id, {
        description: newDescription,
        amount: newAmount,
        date: newDate
      } as Partial<Transaction>);

      alert('Transaction updated successfully!');
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Failed to update transaction. Please try again.');
    }
  };

  // Calculate account balances from transactions
  const calculateAccountBalances = (accountId: string) => {
    let accountTransactions: Transaction[];
    
    // Handle virtual cash account
    if (accountId === 'cash-virtual') {
      accountTransactions = transactions.filter(t => 
        t.paymentMethod && (t.paymentMethod.toUpperCase() === 'CASH' || t.paymentMethod.toLowerCase() === 'cash')
      );
    } else {
      accountTransactions = transactions.filter(t => t.bankAccountId === accountId);
    }
    
    let withdraw = 0;
    let deposit = 0;
    let totalTransferCharges = 0;
    
    accountTransactions.forEach(t => {
      if (t.type === 'debit') {
        withdraw += t.amount;
      } else if (t.type === 'credit') {
        deposit += t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          deposit += t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          withdraw += t.amount;
        }
      }
      
      // Add transfer charges (they reduce the balance)
      const transferCharge = getTransferCharge(t);
      if (transferCharge) {
        totalTransferCharges += transferCharge;
      }
    });

    return { withdraw, deposit, totalTransferCharges };
  };

  // Get bank and cash accounts
  const getBankAndCashAccounts = () => {
    const bank: BankAccount[] = [];
    const cash: BankAccount[] = [];

    bankAccounts.forEach(account => {
      const { withdraw, deposit, totalTransferCharges } = calculateAccountBalances(account.id);
      const closingBalance = account.initialBalance + deposit - withdraw - totalTransferCharges;
      
      const accountData: BankAccount = {
        ...account,
        currentBalance: closingBalance
      };

      // Categorize as bank or cash based on account name
      if (account.accountName.toLowerCase().includes('cash') || 
          account.accountName.toLowerCase().includes('hand')) {
        cash.push(accountData);
      } else {
        bank.push(accountData);
      }
    });

    // Add a virtual "Cash" account for CASH payment method transactions
    const cashTransactions = transactions.filter(t => 
      t.paymentMethod && (t.paymentMethod.toUpperCase() === 'CASH' || t.paymentMethod.toLowerCase() === 'cash')
    );
    
    let cashWithdraw = 0;
    let cashDeposit = 0;
    
    cashTransactions.forEach(t => {
      if (t.type === 'debit') {
        cashWithdraw += t.amount;
      } else if (t.type === 'credit') {
        cashDeposit += t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          cashDeposit += t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          cashWithdraw += t.amount;
        }
      }
    });
    
    // Check if there's already a dedicated cash account
    const hasCashAccount = cash.length > 0;
    
    if (!hasCashAccount && cashTransactions.length > 0) {
      // Create a virtual cash account
      cash.push({
        id: 'cash-virtual',
        accountName: 'Cash in Hand',
        accountNumber: 'CASH',
        initialBalance: 0,
        currentBalance: cashDeposit - cashWithdraw
      });
    }

    return { bank, cash };
  };

  const { bank: bankAccountsList, cash: cashAccountsList } = getBankAndCashAccounts();

  // Calculate totals (excluding contra entries from payment tracking)
  // Payment tracking entries (contraType: 'contra-entry') show HOW payments were made
  const totalDeposits = transactions
    .filter(t => t.type === 'credit' && t.contraType !== 'contra-entry')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalWithdrawals = transactions
    .filter(t => t.type === 'debit' && t.contraType !== 'contra-entry')
    .reduce((sum, t) => sum + t.amount, 0);

  const netBalance = bankAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

  // Get recent transactions (last 10)
  const getRecentTransactions = () => {
    return [...transactions]
      .sort((a, b) => {
        // Prefer createdAt if available, fallback to date
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        return bTime - aTime;
      })
      .slice(0, 10);
  };

  // Get datewise transactions for a specific month
  const getDatewiseTransactions = (accountId: string, year: number, month: number): Transaction[] => {
    let accountTransactions: Transaction[];
    
    if (accountId === 'cash-virtual') {
      accountTransactions = transactions.filter(t => 
        t.paymentMethod && (t.paymentMethod.toUpperCase() === 'CASH' || t.paymentMethod.toLowerCase() === 'cash')
      );
    } else {
      accountTransactions = transactions.filter(t => t.bankAccountId === accountId);
    }
    
    return accountTransactions
      .filter(t => {
        const date = new Date(t.date);
        return date.getFullYear() === year && date.getMonth() === month - 1;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Get monthly records for an account
  const getMonthlyRecords = (accountId: string, year: number): MonthlyRecord[] => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const monthlyData: MonthlyRecord[] = monthNames.map((name, index) => ({
      month: index + 1,
      monthName: name,
      credit: 0,
      debit: 0,
      balance: 0,
      cd: 'DB' as 'DB' | 'CR'
    }));

    // Calculate monthly totals from transactions
    let accountTransactions: Transaction[];
    
    if (accountId === 'cash-virtual') {
      accountTransactions = transactions.filter(t => 
        t.paymentMethod && (t.paymentMethod.toUpperCase() === 'CASH' || t.paymentMethod.toLowerCase() === 'cash') && 
        new Date(t.date).getFullYear() === year
      );
    } else {
      accountTransactions = transactions.filter(t => 
        t.bankAccountId === accountId && 
        new Date(t.date).getFullYear() === year
      );
    }

    // Track transfer charges per month
    const monthlyTransferCharges: number[] = new Array(12).fill(0);
    
    accountTransactions.forEach(t => {
      const month = new Date(t.date).getMonth();
      if (t.type === 'credit') {
        monthlyData[month].credit += t.amount;
      } else if (t.type === 'debit') {
        monthlyData[month].debit += t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          monthlyData[month].credit += t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          monthlyData[month].debit += t.amount;
        }
      }
      
      // Add transfer charges for the month
      const transferCharge = getTransferCharge(t);
      if (transferCharge) {
        monthlyTransferCharges[month] += transferCharge;
      }
    });

    // Calculate running balance
    const account = bankAccounts.find(a => a.id === accountId);
    let runningBalance = account?.initialBalance || 0;

    monthlyData.forEach((m, index) => {
      runningBalance = runningBalance + m.credit - m.debit - monthlyTransferCharges[index];
      m.balance = Math.abs(runningBalance);
      m.cd = runningBalance >= 0 ? 'CR' : 'DB';
    });

    return monthlyData;
  };

  // Generate PDF for accounts list
  const generateAccountsPDF = (accountType: 'bank' | 'cash') => {
    const accountsList = accountType === 'bank' ? bankAccountsList : cashAccountsList;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Company Header
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companyDetails.companyName.toUpperCase(), 105, 12, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text('RECYCLE BUSINESS MANAGER', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(accountType === 'bank' ? 'BANK BOOK' : 'CASH BOOK', 105, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Account Balances Report', 105, 34, { align: 'center' });
    
    // Divider line
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);
    
    // Summary Box
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(14, 48, 182, 15, 'S');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Report Date:', 20, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString() + ' at ' + new Date().toLocaleTimeString(), 50, 55);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Accounts:', 120, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(accountsList.length.toString(), 160, 55);
    
    // Accounts Table
    const tableData = accountsList.map((account, idx) => {
      const { withdraw, deposit, totalTransferCharges } = calculateAccountBalances(account.id);
      const closing = account.initialBalance + deposit - withdraw - totalTransferCharges;
      const cd = closing >= 0 ? 'CR' : 'DB';
      
      return [
        idx + 1,
        account.accountName,
        formatKenyanNumber(account.initialBalance),
        cd,
        formatKenyanNumber(withdraw),
        formatKenyanNumber(deposit),
        formatKenyanNumber(Math.abs(closing)),
        cd
      ];
    });
    
    // Footer row
    const totalOpening = accountsList.reduce((sum, acc) => sum + acc.initialBalance, 0);
    const totalWithdraw = accountsList.reduce((sum, acc) => {
      const { withdraw } = calculateAccountBalances(acc.id);
      return sum + withdraw;
    }, 0);
    const totalDeposit = accountsList.reduce((sum, acc) => {
      const { deposit } = calculateAccountBalances(acc.id);
      return sum + deposit;
    }, 0);
    const totalClosing = accountsList.reduce((sum, acc) => sum + acc.currentBalance, 0);
    
    tableData.push([
      '',
      'Total:',
      formatKenyanNumber(totalOpening),
      'DB',
      formatKenyanNumber(totalWithdraw),
      formatKenyanNumber(totalDeposit),
      formatKenyanNumber(totalClosing),
      'DB'
    ]);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc, {
      startY: 70,
      head: [['#', 'Account Name', 'Opening (KSH)', 'C/D', 'Withdraw', 'Deposit', 'Closing Amount', 'C/D']],
      body: tableData,
      theme: 'plain',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 9,
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      } as any,
      styles: {
        fontSize: 8,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 50 },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 28, halign: 'right' },
        7: { cellWidth: 15, halign: 'center' }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bodyStyles: {
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: function(data: any) {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 255, 255];
        }
      }
    });
    
    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 70;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer-generated document. No signature required.', 105, finalY + 10, { align: 'center' });
    doc.text('Recycle Business Manager - Transaction Management System', 105, finalY + 15, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });
    
    // Open native print dialog first
    const pdfBlob1 = doc.output('blob');
    const pdfUrl1 = URL.createObjectURL(pdfBlob1);
    const iframe1 = document.createElement('iframe');
    iframe1.style.display = 'none';
    iframe1.src = pdfUrl1;
    document.body.appendChild(iframe1);
    iframe1.onload = () => {
      setTimeout(() => {
        iframe1.contentWindow?.print();
        
        // Listen for after print event to download
        iframe1.contentWindow?.addEventListener('afterprint', () => {
          doc.save(`${accountType}_accounts_${yearFilter}.pdf`);
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe1);
            URL.revokeObjectURL(pdfUrl1);
          }, 100);
        });
        
        // Also clean up if user cancels (after 30 seconds timeout)
        setTimeout(() => {
          if (document.body.contains(iframe1)) {
            document.body.removeChild(iframe1);
            URL.revokeObjectURL(pdfUrl1);
          }
        }, 30000);
      }, 100);
    };
  };

  // Generate PDF for monthly records
  const generateMonthlyPDF = (accountType: 'bank' | 'cash') => {
    if (!selectedAccount) return;
    
    const monthlyRecords = getMonthlyRecords(selectedAccount.id, yearFilter);
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Company Header - Professional Black & White
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companyDetails.companyName.toUpperCase(), 105, 12, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text('RECYCLE BUSINESS MANAGER', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(selectedAccount.accountName.toUpperCase(), 105, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Monthly Report - ${yearFilter}`, 105, 34, { align: 'center' });
    
    // Divider line
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);
    
    // Account Info Box
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(14, 48, 182, 15, 'S');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Account Type:', 20, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(accountType === 'bank' ? 'Bank Account' : 'Cash Account', 50, 55);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Opening Balance:', 20, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(selectedAccount.initialBalance)}`, 50, 60);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Report Date:', 110, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString(), 145, 55);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Year:', 110, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(yearFilter.toString(), 145, 60);
    
    // Monthly Table
    const tableData = monthlyRecords.map((record, idx) => [
      String(idx + 1).padStart(2, '0'),
      record.monthName,
      formatKenyanNumber(record.credit),
      formatKenyanNumber(record.debit),
      formatKenyanNumber(Math.abs(record.balance)),
      record.cd
    ]);
    
    const totalCredit = monthlyRecords.reduce((sum, m) => sum + m.credit, 0);
    const totalDebit = monthlyRecords.reduce((sum, m) => sum + m.debit, 0);
    const finalBalance = monthlyRecords[monthlyRecords.length - 1]?.balance || 0;
    const finalCD = monthlyRecords[monthlyRecords.length - 1]?.cd || 'DB';
    
    tableData.push([
      '',
      'Total:',
      formatKenyanNumber(totalCredit),
      formatKenyanNumber(totalDebit),
      formatKenyanNumber(Math.abs(finalBalance)),
      finalCD
    ]);
    
    autoTable(doc, {
      startY: 73,
      head: [['#', 'Month', 'Credit (KSH)', 'Debit (KSH)', 'Balance', 'C/D']],
      body: tableData,
      theme: 'plain',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 10,
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      } as any,
      styles: {
        fontSize: 9,
        cellPadding: 4
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bodyStyles: {
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      } as any,
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 50 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 20, halign: 'center' }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: function(data: any) {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 255, 255];
        }
      }
    });
    
    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 70;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer-generated document. No signature required.', 105, finalY + 10, { align: 'center' });
    doc.text('Recycle Business Manager - Transaction Management System', 105, finalY + 15, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });
    
    // Open native print dialog first
    const pdfBlob2 = doc.output('blob');
    const pdfUrl2 = URL.createObjectURL(pdfBlob2);
    const iframe2 = document.createElement('iframe');
    iframe2.style.display = 'none';
    iframe2.src = pdfUrl2;
    document.body.appendChild(iframe2);
    iframe2.onload = () => {
      setTimeout(() => {
        iframe2.contentWindow?.print();
        
        // Listen for after print event to download
        iframe2.contentWindow?.addEventListener('afterprint', () => {
          doc.save(`${accountType}_monthly_${yearFilter}.pdf`);
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe2);
            URL.revokeObjectURL(pdfUrl2);
          }, 100);
        });
        
        // Also clean up if user cancels (after 30 seconds timeout)
        setTimeout(() => {
          if (document.body.contains(iframe2)) {
            document.body.removeChild(iframe2);
            URL.revokeObjectURL(pdfUrl2);
          }
        }, 30000);
      }, 100);
    };
  };

  // Generate PDF for datewise transactions
  const generateTransactionsPDF = (accountType: 'bank' | 'cash') => {
    if (!selectedAccount || selectedMonth === null) return;
    
    const datewiseTransactions = getDatewiseTransactions(selectedAccount.id, yearFilter, selectedMonth);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Calculate opening balance
    const account = bankAccounts.find(a => a.id === selectedAccount.id);
    let openingBalance = account?.initialBalance || 0;
    
    const previousTransactions = accountType === 'cash' 
      ? transactions.filter(t => {
          const date = new Date(t.date);
          return (t.paymentMethod && (t.paymentMethod.toUpperCase() === 'CASH' || t.paymentMethod.toLowerCase() === 'cash')) &&
                 (date.getFullYear() < yearFilter || 
                  (date.getFullYear() === yearFilter && date.getMonth() < selectedMonth - 1));
        })
      : transactions.filter(t => {
          const date = new Date(t.date);
          return t.bankAccountId === selectedAccount.id &&
                 (date.getFullYear() < yearFilter || 
                  (date.getFullYear() === yearFilter && date.getMonth() < selectedMonth - 1));
        });
    
    previousTransactions.forEach(t => {
      if (t.type === 'credit') {
        openingBalance += t.amount;
      } else if (t.type === 'debit') {
        openingBalance -= t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          openingBalance += t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          openingBalance -= t.amount;
        }
      }
      
      // Deduct transfer charges from opening balance
      const transferCharge = getTransferCharge(t);
      if (transferCharge) {
        openingBalance -= transferCharge;
      }
    });
    
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Company Header
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companyDetails.companyName.toUpperCase(), 105, 12, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text('RECYCLE BUSINESS MANAGER', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(selectedAccount.accountName.toUpperCase(), 105, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Transaction Details - ${monthNames[selectedMonth - 1]} ${yearFilter}`, 105, 34, { align: 'center' });
    
    // Divider line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);
    
    // Account Info - B&W
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(14, 48, 182, 15, 'S');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Opening Balance:', 20, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(formatKenyanNumber(Math.abs(openingBalance)) + ' ' + (openingBalance >= 0 ? 'CR' : 'DB'), 60, 56);
    doc.setFont('helvetica', 'bold');
    doc.text('Report Date:', 120, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString('en-GB'), 160, 56);
    
    // Transactions with running balance - Kenyan formatting
    let runningBalance = openingBalance;
    const tableData = datewiseTransactions.map((t, idx) => {
      let credit = 0;
      let debit = 0;
      
      if (t.type === 'credit') {
        credit = t.amount;
      } else if (t.type === 'debit') {
        debit = t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          credit = t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          debit = t.amount;
        }
      }
      
      const transferCharge = getTransferCharge(t) || 0;
      runningBalance = runningBalance + credit - debit - transferCharge;
      
      return [
        idx + 1,
        new Date(t.date).toLocaleDateString('en-GB'),
        t.description,
        t.category,
        credit > 0 ? formatKenyanNumber(credit) : '-',
        debit > 0 ? formatKenyanNumber(debit) : '-',
        transferCharge ? formatKenyanNumber(transferCharge) : '-',
        formatKenyanNumber(Math.abs(runningBalance)),
        runningBalance >= 0 ? 'CR' : 'DB'
      ];
    });
    
    // Add opening balance row
    tableData.unshift([
      '',
      '',
      'Opening Balance',
      '',
      '-',
      '-',
      '-',
      formatKenyanNumber(Math.abs(openingBalance)),
      openingBalance >= 0 ? 'CR' : 'DB'
    ]);
    
    // Add total row
    const totalCredit = datewiseTransactions.reduce((sum, t) => {
      if (t.type === 'credit') return sum + t.amount;
      if (t.type === 'contra' && t.senderName) return sum + t.amount;
      return sum;
    }, 0);
    const totalDebit = datewiseTransactions.reduce((sum, t) => {
      if (t.type === 'debit') return sum + t.amount;
      if (t.type === 'contra' && t.receiverName) return sum + t.amount;
      return sum;
    }, 0);
    const totalTransferCharge = datewiseTransactions.reduce((sum, t) => sum + (getTransferCharge(t) || 0), 0);
    
    tableData.push([
      '',
      '',
      'Total:',
      '',
      formatKenyanNumber(totalCredit),
      formatKenyanNumber(totalDebit),
      formatKenyanNumber(totalTransferCharge),
      formatKenyanNumber(Math.abs(runningBalance)),
      runningBalance >= 0 ? 'CR' : 'DB'
    ]);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc, {
      startY: 70,
      head: [['#', 'Date', 'Description', 'Category', 'Credit (KSH)', 'Debit (KSH)', 'Transfer Charge', 'Balance', 'C/D']],
      body: tableData,
      theme: 'plain',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8,
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      } as any,
      styles: {
        fontSize: 7,
        cellPadding: 2
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bodyStyles: {
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      } as any,
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 18 },
        2: { cellWidth: 40 },
        3: { cellWidth: 25 },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 24, halign: 'right' },
        7: { cellWidth: 14, halign: 'center' }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: function(data: any) {
        if (data.row.index === 0 || data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 255, 255];
        }
      }
    });
    
    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || 70;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer-generated document. No signature required.', 105, finalY + 10, { align: 'center' });
    doc.text('Recycle Business Manager - Transaction Management System', 105, finalY + 15, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });
    
    // Open native print dialog first
    const pdfBlob3 = doc.output('blob');
    const pdfUrl3 = URL.createObjectURL(pdfBlob3);
    const iframe3 = document.createElement('iframe');
    iframe3.style.display = 'none';
    iframe3.src = pdfUrl3;
    document.body.appendChild(iframe3);
    iframe3.onload = () => {
      setTimeout(() => {
        iframe3.contentWindow?.print();
        
        // Listen for after print event to download
        iframe3.contentWindow?.addEventListener('afterprint', () => {
          doc.save(`${accountType}_transactions_${monthNames[selectedMonth - 1]}_${yearFilter}.pdf`);
          // Clean up
          setTimeout(() => {
            document.body.removeChild(iframe3);
            URL.revokeObjectURL(pdfUrl3);
          }, 100);
        });
        
        // Also clean up if user cancels (after 30 seconds timeout)
        setTimeout(() => {
          if (document.body.contains(iframe3)) {
            document.body.removeChild(iframe3);
            URL.revokeObjectURL(pdfUrl3);
          }
        }, 30000);
      }, 100);
    };
  };

  // Main view with Bank Book and Cash Book cards + Recent Transactions
  const renderMainView = () => {
    const recentTransactions = getRecentTransactions();
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Transaction Management</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bank Book Card */}
          <div 
            onClick={() => setView('bank-accounts')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-lg">
                  <Building2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Bank Book</h2>
                  <p className="text-blue-100">Manage bank accounts</p>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-blue-100 text-sm">Total Accounts</p>
                <p className="text-2xl font-bold text-white">{bankAccountsList.length}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-blue-100 text-sm">Total Balance</p>
                <p className="text-2xl font-bold text-white">
                  {formatKenyanNumber(bankAccountsList.reduce((sum, acc) => sum + acc.currentBalance, 0))}
                </p>
              </div>
            </div>
          </div>

          {/* Cash Book Card */}
          <div 
            onClick={() => setView('cash-accounts')}
            className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-lg">
                  <Wallet className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Cash Book</h2>
                  <p className="text-emerald-100">Manage cash accounts</p>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-emerald-100 text-sm">Total Accounts</p>
                <p className="text-2xl font-bold text-white">{cashAccountsList.length}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-emerald-100 text-sm">Total Balance</p>
                <p className="text-2xl font-bold text-white">
                  {formatKenyanNumber(cashAccountsList.reduce((sum, acc) => sum + acc.currentBalance, 0))}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Deposits</p>
                <p className="text-xl font-bold text-gray-900">{formatKenyanNumber(totalDeposits)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Withdrawals</p>
                <p className="text-xl font-bold text-gray-900">{formatKenyanNumber(totalWithdrawals)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Net Balance</p>
                <p className="text-xl font-bold text-gray-900">{formatKenyanNumber(netBalance)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-xl font-bold text-gray-900">{transactions.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>
            <span className="text-sm text-gray-600">{recentTransactions.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">#</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Date</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Description</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Type</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Category</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Payment Method</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Transfer Charge</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentTransactions.map((txn, idx) => {
                  const transferCharge = getTransferCharge(txn);
                  return (
                    <tr key={txn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-center text-gray-900">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm text-center text-gray-900">
                        {new Date(txn.date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-4 text-sm text-center text-gray-900">{txn.description}</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          txn.type === 'credit' ? 'bg-green-100 text-green-800' : 
                          txn.type === 'debit' ? 'bg-red-100 text-red-800' : 
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {txn.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center font-semibold text-gray-900">
                        {formatKenyanNumber(txn.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-center text-gray-600">{txn.category}</td>
                      <td className="px-6 py-4 text-sm text-center text-gray-600">{txn.paymentMethod}</td>
                      <td className="px-6 py-4 text-sm text-center text-orange-600 font-medium">
                        {transferCharge ? `KSh ${formatKenyanNumber(transferCharge)}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <button
                          onClick={() => handleEditTransaction(txn)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit transaction"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {recentTransactions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No transactions found
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Bank Accounts List View
  const renderBankAccountsView = () => {
    const filteredAccounts = bankAccountsList.filter(acc =>
      acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.accountNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('main')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Bank Accounts</h1>
              <p className="text-sm text-gray-600">View all bank account balances</p>
            </div>
          </div>
          <button
            onClick={() => generateAccountsPDF('bank')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold">#</th>
                  <th className="px-6 py-3 text-left text-sm font-bold">Account Name</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Opening(Rs)</th>
                  <th className="px-6 py-3 text-center text-sm font-bold">C/D</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Withdraw</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Deposit</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Closing Amount</th>
                  <th className="px-6 py-3 text-center text-sm font-bold">C/D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAccounts.map((account, idx) => {
                  const { withdraw, deposit, totalTransferCharges } = calculateAccountBalances(account.id);
                  const closing = account.initialBalance + deposit - withdraw - totalTransferCharges;
                  const cd = closing >= 0 ? 'CR' : 'DB';
                  
                  return (
                    <tr 
                      key={account.id}
                      onClick={() => {
                        setSelectedAccount(account);
                        setView('bank-monthly');
                      }}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 text-sm">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-blue-600">{account.accountName}</td>
                      <td className="px-6 py-4 text-sm text-right">{formatKenyanNumber(account.initialBalance)}</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          cd === 'CR' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {cd}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">
                        {formatKenyanNumber(withdraw, 2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-green-600 font-medium">
                        {formatKenyanNumber(deposit, 2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold">
                        {formatKenyanNumber(Math.abs(closing), 2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          cd === 'CR' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {cd}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-sm">Sum of: Bank Accounts</td>
                  <td className="px-6 py-4 text-sm text-right">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => sum + acc.initialBalance, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">DB</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => {
                      const { withdraw } = calculateAccountBalances(acc.id);
                      return sum + withdraw;
                    }, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => {
                      const { deposit } = calculateAccountBalances(acc.id);
                      return sum + deposit;
                    }, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">DB</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Cash Accounts List View (similar to bank accounts)
  const renderCashAccountsView = () => {
    const filteredAccounts = cashAccountsList.filter(acc =>
      acc.accountName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('main')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Cash Accounts</h1>
              <p className="text-sm text-gray-600">View all cash account balances</p>
            </div>
          </div>
          <button
            onClick={() => generateAccountsPDF('cash')}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-emerald-600 text-white">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold">#</th>
                  <th className="px-6 py-3 text-left text-sm font-bold">Account Name</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Opening(Rs)</th>
                  <th className="px-6 py-3 text-center text-sm font-bold">C/D</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Withdraw</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Deposit</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Closing Amount</th>
                  <th className="px-6 py-3 text-center text-sm font-bold">C/D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAccounts.map((account, idx) => {
                  const { withdraw, deposit, totalTransferCharges } = calculateAccountBalances(account.id);
                  const closing = account.initialBalance + deposit - withdraw - totalTransferCharges;
                  const cd = closing >= 0 ? 'CR' : 'DB';
                  
                  return (
                    <tr 
                      key={account.id}
                      onClick={() => {
                        setSelectedAccount(account);
                        setView('cash-monthly');
                      }}
                      className="hover:bg-emerald-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 text-sm">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-emerald-600">{account.accountName}</td>
                      <td className="px-6 py-4 text-sm text-right">{formatKenyanNumber(account.initialBalance)}</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          cd === 'CR' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {cd}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">
                        {formatKenyanNumber(withdraw, 2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-green-600 font-medium">
                        {formatKenyanNumber(deposit, 2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-bold">
                        {formatKenyanNumber(Math.abs(closing), 2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          cd === 'CR' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {cd}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-sm">Sum of: Cash Accounts</td>
                  <td className="px-6 py-4 text-sm text-right">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => sum + acc.initialBalance, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">DB</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => {
                      const { withdraw } = calculateAccountBalances(acc.id);
                      return sum + withdraw;
                    }, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => {
                      const { deposit } = calculateAccountBalances(acc.id);
                      return sum + deposit;
                    }, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    {formatKenyanNumber(filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">DB</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Monthly Records View
  const renderMonthlyView = (accountType: 'bank' | 'cash') => {
    if (!selectedAccount) return null;

    const monthlyRecords = getMonthlyRecords(selectedAccount.id, yearFilter);
    const totalCredit = monthlyRecords.reduce((sum, m) => sum + m.credit, 0);
    const totalDebit = monthlyRecords.reduce((sum, m) => sum + m.debit, 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedAccount(null);
                setView(accountType === 'bank' ? 'bank-accounts' : 'cash-accounts');
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedAccount.accountName}</h1>
              <p className="text-sm text-gray-600">
                (Under: Bank Accounts) | Opening Balance: {formatKenyanNumber(selectedAccount.initialBalance)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              {[2023, 2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button
              onClick={() => generateMonthlyPDF(accountType)}
              className={`px-4 py-2 ${accountType === 'bank' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg font-semibold flex items-center gap-2 transition-colors`}
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={accountType === 'bank' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}>
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold">#</th>
                  <th className="px-6 py-3 text-left text-sm font-bold">Month</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Credit</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Debit</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Balance</th>
                  <th className="px-6 py-3 text-center text-sm font-bold">C/D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {monthlyRecords.map((record, idx) => (
                  <tr 
                    key={record.month}
                    onClick={() => {
                      setSelectedMonth(record.month);
                      setView(accountType === 'bank' ? 'bank-datewise' : 'cash-datewise');
                    }}
                    className={`hover:${accountType === 'bank' ? 'bg-blue' : 'bg-emerald'}-50 cursor-pointer transition-colors`}
                  >
                    <td className="px-6 py-4 text-sm">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="px-6 py-4 text-sm font-medium">{record.monthName}</td>
                    <td className="px-6 py-4 text-sm text-right text-green-600 font-medium">
                      {formatKenyanNumber(record.credit)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">
                      {formatKenyanNumber(record.debit)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-bold">
                      {formatKenyanNumber(record.balance)}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        record.cd === 'CR' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {record.cd}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-sm">Total:</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">
                    {formatKenyanNumber(totalCredit)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">
                    {formatKenyanNumber(totalDebit)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    {formatKenyanNumber(monthlyRecords[monthlyRecords.length - 1]?.balance || 0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    {monthlyRecords[monthlyRecords.length - 1]?.cd || 'DB'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Account Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-2">Opening Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatKenyanNumber(selectedAccount.initialBalance)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-2">Closing Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatKenyanNumber(selectedAccount.currentBalance)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-2">Net Movement</p>
            <p className={`text-2xl font-bold ${totalCredit - totalDebit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatKenyanNumber(Math.abs(totalCredit - totalDebit))}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Render datewise transactions view
  const renderDatewiseView = (accountType: 'bank' | 'cash') => {
    if (!selectedAccount || selectedMonth === null) return null;

    const datewiseTransactions = getDatewiseTransactions(selectedAccount.id, yearFilter, selectedMonth);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Calculate opening balance for the month
    const account = bankAccounts.find(a => a.id === selectedAccount.id);
    let openingBalance = account?.initialBalance || 0;
    
    // Add all transactions before this month
    const previousTransactions = accountType === 'cash' 
      ? transactions.filter(t => {
          const date = new Date(t.date);
          return (t.paymentMethod && (t.paymentMethod.toUpperCase() === 'CASH' || t.paymentMethod.toLowerCase() === 'cash')) &&
                 (date.getFullYear() < yearFilter || 
                  (date.getFullYear() === yearFilter && date.getMonth() < selectedMonth - 1));
        })
      : transactions.filter(t => {
          const date = new Date(t.date);
          return t.bankAccountId === selectedAccount.id &&
                 (date.getFullYear() < yearFilter || 
                  (date.getFullYear() === yearFilter && date.getMonth() < selectedMonth - 1));
        });
    
    previousTransactions.forEach(t => {
      if (t.type === 'credit') {
        openingBalance += t.amount;
      } else if (t.type === 'debit') {
        openingBalance -= t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          openingBalance += t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          openingBalance -= t.amount;
        }
      }
      
      // Deduct transfer charges from opening balance
      const transferCharge = getTransferCharge(t);
      if (transferCharge) {
        openingBalance -= transferCharge;
      }
    });

    let runningBalance = openingBalance;
    const transactionsWithBalance = datewiseTransactions.map(t => {
      let credit = 0;
      let debit = 0;
      
      if (t.type === 'credit') {
        credit = t.amount;
      } else if (t.type === 'debit') {
        debit = t.amount;
      } else if (t.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (t.senderName) {
          // Payment received from customer
          credit = t.amount;
        } else if (t.receiverName) {
          // Payment made to supplier
          debit = t.amount;
        }
      }
      
      const transferCharge = getTransferCharge(t) || 0;
      runningBalance = runningBalance + credit - debit - transferCharge;
      return { ...t, balance: runningBalance, credit, debit, transferCharge };
    });

    const totalCredit = datewiseTransactions.reduce((sum, t) => {
      if (t.type === 'credit') return sum + t.amount;
      if (t.type === 'contra' && t.senderName) return sum + t.amount; // Payment received from customer
      return sum;
    }, 0);
    
    const totalDebit = datewiseTransactions.reduce((sum, t) => {
      if (t.type === 'debit') return sum + t.amount;
      if (t.type === 'contra' && t.receiverName) return sum + t.amount; // Payment made to supplier
      return sum;
    }, 0);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedMonth(null);
                setView(accountType === 'bank' ? 'bank-monthly' : 'cash-monthly');
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedAccount.accountName}</h1>
              <p className="text-sm text-gray-600">
                {monthNames[selectedMonth - 1]} {yearFilter} - Transaction Details
              </p>
            </div>
          </div>
          <button
            onClick={() => generateTransactionsPDF(accountType)}
            className={`px-4 py-2 ${accountType === 'bank' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg font-semibold flex items-center gap-2 transition-colors`}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={accountType === 'bank' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}>
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold">#</th>
                  <th className="px-6 py-3 text-left text-sm font-bold">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-bold">Description</th>
                  <th className="px-6 py-3 text-left text-sm font-bold">Category</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Credit</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Debit</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Transfer Charge</th>
                  <th className="px-6 py-3 text-right text-sm font-bold">Balance</th>
                  <th className="px-6 py-3 text-center text-sm font-bold">C/D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* Opening Balance Row */}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-6 py-4 text-sm">Opening Balance</td>
                  <td className="px-6 py-4 text-sm text-right">-</td>
                  <td className="px-6 py-4 text-sm text-right">-</td>
                  <td className="px-6 py-4 text-sm text-right">-</td>
                  <td className="px-6 py-4 text-sm text-right font-bold">
                    {formatKenyanNumber(Math.abs(openingBalance))}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      openingBalance >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {openingBalance >= 0 ? 'CR' : 'DB'}
                    </span>
                  </td>
                </tr>
                
                {/* Transaction Rows */}
                {transactionsWithBalance.map((txn, idx) => (
                  <tr key={txn.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">{idx + 1}</td>
                    <td className="px-6 py-4 text-sm">
                      {new Date(txn.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-4 text-sm">{txn.description}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                        {txn.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-green-600 font-medium">
                      {txn.credit > 0 ? formatKenyanNumber(txn.credit) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">
                      {txn.debit > 0 ? formatKenyanNumber(txn.debit) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-orange-600 font-medium">
                      {txn.transferCharge ? `KSh ${formatKenyanNumber(txn.transferCharge)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-bold">
                      {formatKenyanNumber(Math.abs(txn.balance))}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        txn.balance >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {txn.balance >= 0 ? 'CR' : 'DB'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-sm">Total:</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">
                    {formatKenyanNumber(totalCredit)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-red-600">
                    {formatKenyanNumber(totalDebit)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-orange-600">
                    {formatKenyanNumber(transactionsWithBalance.reduce((sum, t) => sum + (t.transferCharge || 0), 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    {transactionsWithBalance.length > 0 
                      ? formatKenyanNumber(Math.abs(transactionsWithBalance[transactionsWithBalance.length - 1].balance))
                      : formatKenyanNumber(Math.abs(openingBalance))}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    {transactionsWithBalance.length > 0
                      ? (transactionsWithBalance[transactionsWithBalance.length - 1].balance >= 0 ? 'CR' : 'DB')
                      : (openingBalance >= 0 ? 'CR' : 'DB')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {datewiseTransactions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No transactions found for this month
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {view === 'main' && renderMainView()}
        {view === 'bank-accounts' && renderBankAccountsView()}
        {view === 'cash-accounts' && renderCashAccountsView()}
        {view === 'bank-monthly' && renderMonthlyView('bank')}
        {view === 'cash-monthly' && renderMonthlyView('cash')}
        {view === 'bank-datewise' && renderDatewiseView('bank')}
        {view === 'cash-datewise' && renderDatewiseView('cash')}
      </div>
    </div>
  );
}
