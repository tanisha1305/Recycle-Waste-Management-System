import { useState, useRef, useEffect } from 'react';
import { FileText, Printer, Download, Calendar, Search, TrendingUp, TrendingDown, DollarSign, Eye, X } from 'lucide-react';
import { Customer } from './CustomerList';
import { Invoice } from './InvoiceManagement';
import { DebitCreditNote, Shipment } from '../types';
import { Supplier } from './SupplierList';
import { subscribeToInvoices } from '../services/invoiceService';
import { subscribeToDebitCreditNotes } from '../services/debitCreditNoteService';
import { subscribeToDirectPurchases, DirectPurchase } from '../services/directPurchaseService';
import { subscribeToShipments } from '../services/shipmentService';
import { subscribeToTransactions } from '../services/transactionService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatKenyanNumber } from '../utils/numberFormat';
import { subscribeToCompanyDetails, CompanyDetails } from '../services/companyService';

interface StatementPageProps {
  customers: Customer[];
  suppliers: Supplier[];
}

interface Transaction {
  id: string;
  date: string;
  type: 'invoice' | 'purchase' | 'credit_note' | 'debit_note' | 'shipment' | 'basic_accounting';
  description: string;
  party: string;
  partyCode: string;
  reference: string;
  debit: number;  // Money out / Expense
  credit: number; // Money in / Income
  balance: number;
}

export default function StatementPage({ customers, suppliers }: StatementPageProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [debitCreditNotes, setDebitCreditNotes] = useState<DebitCreditNote[]>([]);
  const [directPurchases, setDirectPurchases] = useState<DirectPurchase[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [basicAccountingTransactions, setBasicAccountingTransactions] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'invoice' | 'purchase' | 'credit_note' | 'debit_note' | 'shipment'>('all');
  const [filterParty, setFilterParty] = useState<string>('all');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printType, setPrintType] = useState<'detailed' | 'short'>('detailed');
  const printRef = useRef<HTMLDivElement>(null);
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

  // Subscribe to invoices from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToInvoices(
      (updatedInvoices) => {
        setInvoices(updatedInvoices);
      },
      (error) => {
        console.error('Error subscribing to invoices:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to debit/credit notes from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToDebitCreditNotes(
      (updatedNotes) => {
        setDebitCreditNotes(updatedNotes);
      },
      (error) => {
        console.error('Error subscribing to debit/credit notes:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to direct purchases from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToDirectPurchases(
      (updatedPurchases) => {
        setDirectPurchases(updatedPurchases);
      },
      (error) => {
        console.error('Error subscribing to direct purchases:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to shipments from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToShipments(
      (updatedShipments) => {
        setShipments(updatedShipments);
      },
      (error) => {
        console.error('Error subscribing to shipments:', error);
      }
    );

    return () => unsubscribe();
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

  // Generate all transactions
  const getAllTransactions = (): Transaction[] => {
    const transactions: Transaction[] = [];

    // Add invoices (Income - Credit)
    invoices.forEach(inv => {
      const customer = customers.find(c => c.companyName === inv.customerName);
      const itemsDesc = inv.items.map(i => `${i.itemDescription} (${i.quantity})`).join(', ');
      
      transactions.push({
        id: inv.id,
        date: inv.date,
        type: 'invoice',
        description: `Invoice: ${itemsDesc}`,
        party: inv.customerName,
        partyCode: customer?.customerCode || '',
        reference: inv.manualInvoiceNumber || inv.systemInvoiceNumber,
        debit: 0,
        credit: inv.totalAmount,
        balance: 0
      });
    });

    // Add direct purchases (Expense - Debit)
    // EXCLUDE PELLETING entries - they're internal processing, not actual purchases
    directPurchases
      .filter(purchase => {
        const isPelleting = purchase.invoiceNumber && 
                          purchase.invoiceNumber.toUpperCase().includes('PELLETING');
        return !isPelleting;
      })
      .forEach(purchase => {
        const itemsDesc = purchase.items.map(i => `${i.itemName} (${i.quantity} ${i.unit})`).join(', ');
        
        transactions.push({
          id: purchase.id,
          date: purchase.purchaseDate,
          type: 'purchase',
          description: `Purchase: ${itemsDesc}`,
          party: purchase.supplierName,
          partyCode: purchase.supplierCode,
          reference: purchase.invoiceNumber,
          debit: purchase.totalAmount,
          credit: 0,
          balance: 0
        });
      });

    // Add shipments (Material Purchase - Expense - Debit)
    shipments.forEach(shipment => {
      const description = shipment.materialType 
        ? `Shipment: ${shipment.materialType} (${shipment.purchaseKg} KG @ ${shipment.ratePerKg}/KG)`
        : `Shipment: ${shipment.purchaseKg} KG @ ${shipment.ratePerKg}/KG`;
      
      transactions.push({
        id: shipment.id,
        date: shipment.date,
        type: 'shipment',
        description,
        party: shipment.supplier,
        partyCode: shipment.supplierCode || '',
        reference: shipment.purchaseInvoiceNumber || `Shipment-${shipment.id.substring(0, 8)}`,
        debit: shipment.totalCost,
        credit: 0,
        balance: 0
      });
    });

    // DO NOT add credit/debit notes to statement of accounts (per user requirement)
    // Credit/debit notes are tracked in:
    // 1. Payment Tracking (reduces amounts owed)
    // 2. Ledger accounts (shows transaction history)
    // 3. Inventory (adjusts stock levels)
    // But they should NOT appear in Statement of Accounts

    // Add basic accounting transactions (Material Purchase, Material Sales, Product Sales)
    basicAccountingTransactions.forEach(transaction => {
      const isIncome = transaction.type === 'credit';
      
      // Determine the correct party based on transaction category and type
      let partyName = 'N/A';
      let partyCode = '';
      
      // For Material Sales and Product Sales: customer is the party
      // For Material Purchase: supplier is the party
      if (transaction.category === 'Material Sales' || transaction.category === 'Product Sales') {
        // Sales involve customers
        // For credit (Payment Receive), sender is customer
        // For debit (Payment Debit), receiver is customer
        const partyIdentifier = isIncome ? transaction.senderName : transaction.receiverName;
        
        if (partyIdentifier) {
          const customer = customers.find(c => 
            c.companyName === partyIdentifier || 
            partyIdentifier.includes(c.customerCode)
          );
          
          if (customer) {
            partyName = customer.companyName;
            partyCode = customer.customerCode;
          } else {
            partyName = partyIdentifier;
          }
        }
      } else if (transaction.category === 'Material Purchase') {
        // Purchase involves suppliers
        // For credit (Payment Receive), receiver is supplier
        // For debit (Payment Debit), sender is supplier
        const partyIdentifier = isIncome ? transaction.receiverName : transaction.senderName;
        
        if (partyIdentifier) {
          const supplier = suppliers.find(s => 
            s.companyName === partyIdentifier || 
            partyIdentifier.includes(s.supplierCode)
          );
          
          if (supplier) {
            partyName = supplier.companyName;
            partyCode = supplier.supplierCode;
          } else {
            partyName = partyIdentifier;
          }
        }
      }
      
      transactions.push({
        id: transaction.id,
        date: transaction.date,
        type: 'basic_accounting',
        description: transaction.description,
        party: partyName,
        partyCode: partyCode,
        reference: `BA-${transaction.id.substring(0, 8)}`,
        debit: !isIncome ? transaction.amount : 0,
        credit: isIncome ? transaction.amount : 0,
        balance: 0
      });
    });

    // Sort by date
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let runningBalance = 0;
    transactions.forEach(t => {
      runningBalance += t.credit - t.debit;
      t.balance = runningBalance;
    });

    return transactions;
  };

  // Apply filters
  const getFilteredTransactions = (): Transaction[] => {
    let filtered = getAllTransactions();

    // Date filters
    if (startDate) {
      filtered = filtered.filter(t => new Date(t.date) >= new Date(startDate));
    }
    if (endDate) {
      filtered = filtered.filter(t => new Date(t.date) <= new Date(endDate));
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }

    // Party filter
    if (filterParty !== 'all') {
      filtered = filtered.filter(t => t.party === filterParty);
    }

    // Search filter
    if (globalSearch) {
      const searchLower = globalSearch.toLowerCase();
      filtered = filtered.filter(t =>
        t.description.toLowerCase().includes(searchLower) ||
        t.party.toLowerCase().includes(searchLower) ||
        t.partyCode.toLowerCase().includes(searchLower) ||
        t.reference.toLowerCase().includes(searchLower)
      );
    }

    // Recalculate balance for filtered results
    let balance = 0;
    filtered.forEach(t => {
      balance += t.credit - t.debit;
      t.balance = balance;
    });

    return filtered;
  };

  const filteredTransactions = getFilteredTransactions();
  const totalCredit = filteredTransactions.reduce((sum, t) => sum + t.credit, 0);
  const totalDebit = filteredTransactions.reduce((sum, t) => sum + t.debit, 0);
  const netBalance = totalCredit - totalDebit;

  // Get unique parties for filter dropdown
  const allParties = Array.from(new Set([
    ...customers.map(c => c.companyName),
    ...suppliers.map(s => s.companyName)
  ])).sort();

  // Get the selected party name for display
  const selectedPartyName = filterParty !== 'all' ? filterParty : null;

  // Handle print preview - show modal first
  const handlePrintPreview = (type: 'detailed' | 'short') => {
    setPrintType(type);
    setShowPrintPreview(true);
  };

  // Execute actual print from preview
  const executePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1200');
    if (!printWindow) return;

    const title = selectedPartyName || 'Business Statement';

    if (printType === 'short') {
      // Short statement print
      printWindow.document.write(`
        <html>
          <head>
            <title>${title} - ${startDate || 'All'} to ${endDate || 'All'}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
              .header h1 { margin: 0; font-size: 24px; color: #000; }
              .header p { margin: 5px 0; color: #000; }
              .summary { margin-bottom: 30px; background: #f5f5f5; padding: 20px; border-radius: 8px; }
              .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; color: #000; }
              th { background-color: #4B5563; color: white; font-weight: bold; }
              tr:nth-child(even) { background-color: #f9f9f9; }
              .text-right { text-align: right; }
              .debit, .credit, .balance { color: #000; font-weight: bold; }
              .grand-total { background-color: #e5e7eb; font-weight: bold; }
              @media print {
                body { margin: 0; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${title}</h1>
              <p>${startDate && endDate 
                ? `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`
                : 'All Transactions'
              }</p>
            </div>

            <div class="summary">
              <div class="summary-grid">
                <div style="text-align: center;">
                  <div style="font-size: 14px; color: #000;">Total Income (Credit)</div>
                  <div style="font-size: 24px; font-weight: bold; color: #000;">KSH ${formatKenyanNumber(totalCredit, 2)}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 14px; color: #000;">Total Expense (Debit)</div>
                  <div style="font-size: 24px; font-weight: bold; color: #000;">KSH ${formatKenyanNumber(totalDebit, 2)}</div>
                </div>
                <div style="text-align: center;">
                  <div style="font-size: 14px; color: #000;">Net Balance</div>
                  <div style="font-size: 24px; font-weight: bold; color: #000;">KSH ${formatKenyanNumber(netBalance, 2)}</div>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th class="text-right">Debit (Out)</th>
                  <th class="text-right">Credit (In)</th>
                  <th class="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${filteredTransactions.map(t => `
                  <tr>
                    <td>${new Date(t.date).toLocaleDateString()}</td>
                    <td>${t.type.replace('_', ' ').toUpperCase()}</td>
                    <td>${t.reference}</td>
                    <td class="text-right ${t.debit > 0 ? 'debit' : ''}">${t.debit > 0 ? formatKenyanNumber(t.debit) : '-'}</td>
                    <td class="text-right ${t.credit > 0 ? 'credit' : ''}">${t.credit > 0 ? formatKenyanNumber(t.credit) : '-'}</td>
                    <td class="text-right balance">${formatKenyanNumber(t.balance)}</td>
                  </tr>
                `).join('')}
                <tr class="grand-total">
                  <td colspan="3" style="text-align: right; padding-right: 20px;">GRAND TOTAL:</td>
                  <td class="text-right">KSH ${formatKenyanNumber(totalDebit)}</td>
                  <td class="text-right">KSH ${formatKenyanNumber(totalCredit)}</td>
                  <td class="text-right">KSH ${formatKenyanNumber(netBalance)}</td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `);
    } else {
      // Detailed statement print
      printWindow.document.write(`
        <html>
          <head>
            <title>${title} - ${startDate || 'All'} to ${endDate || 'All'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; color: #000; }
            .header p { margin: 5px 0; color: #000; }
            .summary { margin-bottom: 30px; background: #f5f5f5; padding: 20px; border-radius: 8px; }
            .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; color: #000; }
            th { background-color: #4B5563; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .text-right { text-align: right; }
            .debit, .credit, .balance { color: #000; font-weight: bold; }
            .grand-total { background-color: #e5e7eb; font-weight: bold; }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${title}</h1>
            <p>${startDate && endDate 
              ? `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`
              : 'All Transactions'
            }</p>
          </div>

          <div class="summary">
            <div class="summary-grid">
              <div style="text-align: center;">
                <div style="font-size: 14px; color: #000;">Total Income (Credit)</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">KSH ${formatKenyanNumber(totalCredit, 2)}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 14px; color: #000;">Total Expense (Debit)</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">KSH ${formatKenyanNumber(totalDebit, 2)}</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 14px; color: #000;">Net Balance</div>
                <div style="font-size: 24px; font-weight: bold; color: #000;">KSH ${formatKenyanNumber(netBalance, 2)}</div>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Reference</th>
                <th class="text-right">Debit (Out)</th>
                <th class="text-right">Credit (In)</th>
                <th class="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTransactions.map(t => `
                <tr>
                  <td>${new Date(t.date).toLocaleDateString()}</td>
                  <td>${t.type.replace('_', ' ').toUpperCase()}</td>
                  <td>${t.description}</td>
                  <td>${t.reference}</td>
                  <td class="text-right ${t.debit > 0 ? 'debit' : ''}">${t.debit > 0 ? formatKenyanNumber(t.debit) : '-'}</td>
                  <td class="text-right ${t.credit > 0 ? 'credit' : ''}">${t.credit > 0 ? formatKenyanNumber(t.credit) : '-'}</td>
                  <td class="text-right balance">${formatKenyanNumber(t.balance)}</td>
                </tr>
              `).join('')}
              <tr class="grand-total">
                <td colspan="4" style="text-align: right; padding-right: 20px;">GRAND TOTAL:</td>
                <td class="text-right">KSH ${formatKenyanNumber(totalDebit)}</td>
                <td class="text-right">KSH ${formatKenyanNumber(totalCredit)}</td>
                <td class="text-right">KSH ${formatKenyanNumber(netBalance)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    }

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Download CSV
  const handleDownloadCSV = () => {
    let csvContent = 'Date,Type,Description,Party,Party Code,Reference,Debit,Credit,Balance\n';

    filteredTransactions.forEach(t => {
      csvContent += `"${t.date}","${t.type}","${t.description}","${t.party}","${t.partyCode}","${t.reference}",${t.debit},${t.credit},${t.balance}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `business_statement_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Download PDF with native print dialog
  const handleDownloadPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Professional B&W Header with Company Name
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(companyDetails.companyName.toUpperCase(), 148, 12, { align: 'center' });
    
    doc.setFontSize(18);
    doc.text('RECYCLE BUSINESS MANAGER', 148, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text('Business Statement', 148, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, 148, 34, { align: 'center' });
    if (startDate || endDate) {
      doc.text(`Period: ${startDate || 'Start'} to ${endDate || 'End'}`, 148, 39, { align: 'center' });
    }
    
    // Divider line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(15, 43, 281, 43);

    // Summary boxes
    const summaryY = 50;
    const startX = 15;
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(startX, summaryY, 85, 20, 'S');
    doc.rect(startX + 90, summaryY, 85, 20, 'S');
    doc.rect(startX + 180, summaryY, 85, 20, 'S');
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL CREDIT (INCOME)', startX + 5, summaryY + 8);
    doc.text('TOTAL DEBIT (EXPENSE)', startX + 95, summaryY + 8);
    doc.text('NET BALANCE', startX + 185, summaryY + 8);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(totalCredit)}`, startX + 5, summaryY + 16);
    doc.text(`KSH ${formatKenyanNumber(totalDebit)}`, startX + 95, summaryY + 16);
    doc.text(`KSH ${formatKenyanNumber(netBalance)}`, startX + 185, summaryY + 16);

    // Table data with Kenyan formatting
    const tableData = filteredTransactions.map(t => [
      t.date,
      t.type.replace('_', ' ').toUpperCase(),
      t.description,
      t.party,
      t.reference,
      t.debit > 0 ? formatKenyanNumber(t.debit) : '-',
      t.credit > 0 ? formatKenyanNumber(t.credit) : '-',
      formatKenyanNumber(t.balance)
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc, {
      startY: summaryY + 25,
      head: [['Date', 'Type', 'Description', 'Party', 'Reference', 'Debit (KSH)', 'Credit (KSH)', 'Balance (KSH)']],
      body: tableData,
      theme: 'plain',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontSize: 8,
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bodyStyles: {
        fontSize: 7,
        textColor: [0, 0, 0],
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      } as any,
      margin: { left: 15, right: 15 }
    });
    
    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || summaryY + 30;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer-generated document. No signature required.', 148, finalY + 10, { align: 'center' });
    doc.text('Recycle Business Manager - Business Statement System', 148, finalY + 15, { align: 'center' });
    
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
      setTimeout(() => {
        iframe.contentWindow?.print();
        
        // Listen for after print event to download
        iframe.contentWindow?.addEventListener('afterprint', () => {
          doc.save('business_statement.pdf');
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

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-500 rounded-lg">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Business Statement</h1>
                <p className="text-gray-600">Complete transaction history - All income and expenses</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => handlePrintPreview('detailed')}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print Detailed Statement</span>
              </button>
              <button
                onClick={() => handlePrintPreview('short')}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print Short Statement</span>
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
              <button
                onClick={handleDownloadCSV}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download CSV</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Start Date */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4" />
                <span>Start Date</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4" />
                <span>End Date</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>

            {/* Transaction Type Filter */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4" />
                <span>Transaction Type</span>
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              >
                <option value="all">All Transactions</option>
                <option value="invoice">Invoices (Income)</option>
                <option value="shipment">Shipments (Material Purchase)</option>
                <option value="purchase">Direct Purchases (Expense)</option>
                <option value="credit_note">Credit Notes</option>
                <option value="debit_note">Debit Notes</option>
              </select>
            </div>

            {/* Party Filter */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4" />
                <span>Party</span>
              </label>
              <select
                value={filterParty}
                onChange={(e) => setFilterParty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              >
                <option value="all">All Parties</option>
                {allParties.map((party) => (
                  <option key={party} value={party}>
                    {party}
                  </option>
                ))}
              </select>
            </div>

            {/* Global Search */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <Search className="w-4 h-4" />
                <span>Search</span>
              </label>
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search transactions..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Total Transactions</h3>
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{filteredTransactions.length}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Total Income</h3>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">KSH {formatKenyanNumber(totalCredit)}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Total Expense</h3>
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">KSH {formatKenyanNumber(totalDebit)}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Net Balance</h3>
              <DollarSign className="w-5 h-5 text-slate-600" />
            </div>
            <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
              KSH {formatKenyanNumber(netBalance)}
            </p>
          </div>
        </div>

        {/* Transactions Table */}
        <div ref={printRef} className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Transaction History</h3>
            <p className="text-sm text-gray-600 mt-1">
              {startDate && endDate 
                ? `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`
                : 'All Transactions'
              }
            </p>
          </div>

          {filteredTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Party</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Reference</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Debit (Out)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Credit (In)</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredTransactions.map((t) => (
                    <tr key={`${t.type}-${t.id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(t.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            t.type === 'invoice'
                              ? 'bg-green-100 text-green-700'
                              : t.type === 'shipment'
                              ? 'bg-orange-100 text-orange-700'
                              : t.type === 'purchase'
                              ? 'bg-red-100 text-red-700'
                              : t.type === 'credit_note'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {t.type === 'credit_note' 
                            ? 'CR NOTE' 
                            : t.type === 'debit_note'
                            ? 'DB NOTE'
                            : t.type.replace('_', ' ').toUpperCase()
                          }
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {t.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>{t.party}</div>
                        <div className="text-xs text-gray-500">{t.partyCode}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {t.reference}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        {t.debit > 0 ? (
                          <span className="font-bold text-red-600">
                            KSH {formatKenyanNumber(t.debit)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        {t.credit > 0 ? (
                          <span className="font-bold text-green-600">
                            KSH {formatKenyanNumber(t.credit)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <span className="font-bold text-slate-700">
                          KSH {formatKenyanNumber(t.balance)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p>No transactions found.</p>
              <p className="text-sm text-gray-400 mt-2">
                Adjust your filters or date range to see transactions.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Print Preview Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="w-6 h-6 text-blue-600" />
                  Print Preview
                </h2>
                <p className="text-sm text-gray-600">Business Statement</p>
              </div>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="bg-white p-8 shadow-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
                {/* Header */}
                <div className="text-center mb-8 border-b-2 border-black pb-6">
                  <h1 className="text-2xl font-bold text-black mb-2">
                    {selectedPartyName || 'Business Statement'}
                  </h1>
                  <p className="text-gray-600">
                    {startDate && endDate 
                      ? `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`
                      : 'All Transactions'
                    }
                  </p>
                </div>

                {/* Summary */}
                <div className="mb-8 bg-gray-50 p-6 rounded-lg">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-sm text-gray-600 mb-1">Total Income (Credit)</div>
                      <div className="text-2xl font-bold text-black">KSH {formatKenyanNumber(totalCredit, 2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-600 mb-1">Total Expense (Debit)</div>
                      <div className="text-2xl font-bold text-black">KSH {formatKenyanNumber(totalDebit, 2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-gray-600 mb-1">Net Balance</div>
                      <div className="text-2xl font-bold text-black">KSH {formatKenyanNumber(netBalance, 2)}</div>
                    </div>
                  </div>
                </div>

                {/* Transaction Table */}
                {printType === 'short' ? (
                  // Short Statement Table
                  <table className="w-full border-collapse border border-gray-300">
                    <thead className="bg-gray-700 text-white">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Date</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Type</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Reference</th>
                        <th className="border border-gray-300 px-3 py-2 text-right text-xs font-bold">Debit (Out)</th>
                        <th className="border border-gray-300 px-3 py-2 text-right text-xs font-bold">Credit (In)</th>
                        <th className="border border-gray-300 px-3 py-2 text-right text-xs font-bold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((t, index) => (
                        <tr key={`${t.type}-${t.id}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{new Date(t.date).toLocaleDateString()}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{t.type.replace('_', ' ').toUpperCase()}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{t.reference}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                            {t.debit > 0 ? formatKenyanNumber(t.debit, 2) : '-'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                            {t.credit > 0 ? formatKenyanNumber(t.credit, 2) : '-'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                            {formatKenyanNumber(t.balance, 2)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-200">
                        <td colSpan={3} className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          GRAND TOTAL:
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          KSH {formatKenyanNumber(totalDebit, 2)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          KSH {formatKenyanNumber(totalCredit, 2)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          KSH {formatKenyanNumber(netBalance, 2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  // Detailed Statement Table
                  <table className="w-full border-collapse border border-gray-300">
                    <thead className="bg-gray-700 text-white">
                      <tr>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Date</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Type</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Description</th>
                        <th className="border border-gray-300 px-3 py-2 text-left text-xs font-bold">Reference</th>
                        <th className="border border-gray-300 px-3 py-2 text-right text-xs font-bold">Debit (Out)</th>
                        <th className="border border-gray-300 px-3 py-2 text-right text-xs font-bold">Credit (In)</th>
                        <th className="border border-gray-300 px-3 py-2 text-right text-xs font-bold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((t, index) => (
                        <tr key={`${t.type}-${t.id}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{new Date(t.date).toLocaleDateString()}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{t.type.replace('_', ' ').toUpperCase()}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{t.description}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-black">{t.reference}</td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                            {t.debit > 0 ? formatKenyanNumber(t.debit, 2) : '-'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                            {t.credit > 0 ? formatKenyanNumber(t.credit, 2) : '-'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                            {formatKenyanNumber(t.balance, 2)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-200">
                        <td colSpan={4} className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          GRAND TOTAL:
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          KSH {formatKenyanNumber(totalDebit, 2)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          KSH {formatKenyanNumber(totalCredit, 2)}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-xs text-right font-bold text-black">
                          KSH {formatKenyanNumber(netBalance, 2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPrintPreview(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  executePrint();
                  setShowPrintPreview(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Printer className="w-4 h-4" />
                Print Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
