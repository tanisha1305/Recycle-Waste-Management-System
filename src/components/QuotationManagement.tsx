import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Download, Printer, Edit2, Trash2 } from 'lucide-react';
import { Customer } from './CustomerList';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatKenyanNumber } from '../utils/numberFormat';
import { 
  addQuotation, 
  updateQuotation, 
  deleteQuotation, 
  subscribeToQuotations 
} from '../services/quotationService';
import { 
  InventoryItem, 
  subscribeToInventoryItems
} from '../services/inventoryService';
import { subscribeToCompanyDetails, CompanyDetails } from '../services/companyService';
import { Quotation, QuotationItem } from '../types';

interface QuotationManagementProps {
  customers: Customer[];
}

export default function QuotationManagement({ customers }: QuotationManagementProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent'>('all');
  const [saving, setSaving] = useState(false);

  // Autocomplete suggestions state
  const [itemCodeSearchTerms, setItemCodeSearchTerms] = useState<Record<number, string>>({});
  const [showItemCodeDropdowns, setShowItemCodeDropdowns] = useState<Record<number, boolean>>({});
  
  // Company details state - now loaded from Firebase
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>({
    id: 'company',
    companyPIN: '',
    companyName: '',
    address: '',
    mobile: '',
    email: '',
    updatedAt: new Date().toISOString()
  });

  // Subscribe to company details from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToCompanyDetails(
      (details) => {
        setCompanyDetails(details);
      },
      (error) => {
        console.error('Error subscribing to company details:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to quotations from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToQuotations(
      (updatedQuotations) => {
        setQuotations(updatedQuotations);
      },
      (error) => {
        console.error('Error subscribing to quotations:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to inventory items from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToInventoryItems(
      (items) => {
        setInventoryItems(items);
      },
      (error) => {
        console.error('Error subscribing to inventory items:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    customerPRN: '',
    manualQuotationNumber: '',
    quotationFrom: {
      pin: companyDetails.companyPIN,
      name: companyDetails.companyName,
      address: companyDetails.address,
      mobile: companyDetails.mobile
    },
    items: [
      {
        itemCode: '',
        itemDescription: '',
        quantity: 1,
        unitPrice: 0,
        taxRate: 16,
      },
    ],
    status: 'draft' as 'draft' | 'sent',
  });

  // Update formData quotationFrom when companyDetails changes
  useEffect(() => {
    setFormData(prev => ({ 
      ...prev, 
      quotationFrom: {
        pin: companyDetails.companyPIN,
        name: companyDetails.companyName,
        address: companyDetails.address,
        mobile: companyDetails.mobile
      }
    }));
  }, [companyDetails]);

  // Generate sequential system quotation number
  const generateSystemQuotationNumber = () => {
    const count = quotations.length + 1;
    return `QTN-${String(count).padStart(6, '0')}`;
  };

  // Calculate item totals
  const calculateItemTotals = (quantity: number, unitPrice: number, taxRate: number) => {
    const amountExclTax = quantity * unitPrice;
    const taxAmount = (amountExclTax * taxRate) / 100;
    const amountInclTax = amountExclTax + taxAmount;
    return { amountExclTax, taxAmount, amountInclTax };
  };

  // Calculate quotation totals
  const calculateQuotationTotals = () => {
    let taxableTotalAmount = 0;
    let totalTaxAmount = 0;
    let totalAmount = 0;

    formData.items.forEach((item) => {
      const { amountExclTax, taxAmount, amountInclTax } = calculateItemTotals(
        item.quantity,
        item.unitPrice,
        item.taxRate
      );
      taxableTotalAmount += amountExclTax;
      totalTaxAmount += taxAmount;
      totalAmount += amountInclTax;
    });

    return { taxableTotalAmount, totalTaxAmount, totalAmount };
  };

  // Get filtered items for dropdown based on search term
  const getFilteredItemCodes = (itemIndex: number) => {
    const searchTerm = itemCodeSearchTerms[itemIndex]?.toLowerCase() || '';
    if (!searchTerm) return [];
    return inventoryItems.filter(item => item.itemCode.toLowerCase().startsWith(searchTerm));
  };

  // Handle item code selection from dropdown
  const handleSelectItemCode = (itemIndex: number, inventoryItem: InventoryItem) => {
    const updatedItems = [...formData.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      itemCode: inventoryItem.itemCode,
      itemDescription: inventoryItem.itemName
    };
    setFormData({ ...formData, items: updatedItems });
    setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [itemIndex]: false });
    setItemCodeSearchTerms({ ...itemCodeSearchTerms, [itemIndex]: inventoryItem.itemCode });
  };

  // Handle item change
  const handleItemChange = (index: number, field: string, value: string | number) => {
    const updatedItems = [...formData.items];
    
    // Special handling for item code changes
    if (field === 'itemCode' && typeof value === 'string') {
      updatedItems[index] = { ...updatedItems[index], itemCode: value };

      // Track search term for dropdown
      setItemCodeSearchTerms({ ...itemCodeSearchTerms, [index]: value });

      // Show dropdown if there's text
      if (value.trim()) {
        setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [index]: true });
      } else {
        setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [index]: false });
      }
      
      // Validate with trimmed and uppercased version
      const itemCodeToValidate = value.trim().toUpperCase();
      if (itemCodeToValidate) {
        const inventoryItem = inventoryItems.find(
          item => item.itemCode.toUpperCase() === itemCodeToValidate
        );
        
        if (inventoryItem) {
          // Auto-fill item name/description only
          updatedItems[index].itemDescription = inventoryItem.itemName;
        }
      }
    } else {
      updatedItems[index] = { ...updatedItems[index], [field]: value };
    }
    
    setFormData({ ...formData, items: updatedItems });
  };

  // Add item row
  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          itemCode: '',
          itemDescription: '',
          quantity: 1,
          unitPrice: 0,
          taxRate: 16,
        },
      ],
    });
  };

  // Remove item row
  const removeItemRow = (index: number) => {
    if (formData.items.length > 1) {
      const updatedItems = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: updatedItems });
    }
  };

  // Get customer PRN
  const getCustomerPRN = (customerName: string) => {
    const customer = customers.find((c) => c.companyName === customerName);
    return customer ? customer.pin : '';
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setSaving(true);

    try {
      const { taxableTotalAmount, totalTaxAmount, totalAmount } = calculateQuotationTotals();

      const quotationItems: QuotationItem[] = formData.items.map((item) => {
        const { amountExclTax, taxAmount, amountInclTax } = calculateItemTotals(
          item.quantity,
          item.unitPrice,
          item.taxRate
        );
        return {
          itemCode: item.itemCode,
          itemDescription: item.itemDescription,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          amountExclTax,
          taxAmount,
          amountInclTax,
        };
      });

      if (editingQuotation) {
        // Update existing quotation
        const updatedQuotation: Quotation = {
          ...editingQuotation,
          date: formData.date,
          customerName: formData.customerName,
          customerPRN: formData.customerPRN,
          manualQuotationNumber: formData.manualQuotationNumber,
          quotationFrom: formData.quotationFrom,
          items: quotationItems,
          taxableTotalAmount,
          totalTaxAmount,
          totalAmount,
          status: formData.status,
        };

        await updateQuotation(editingQuotation.id, updatedQuotation);
      } else {
        // Create new quotation
        const newQuotation: Quotation = {
          id: '',
          systemQuotationNumber: generateSystemQuotationNumber(),
          manualQuotationNumber: formData.manualQuotationNumber,
          date: formData.date,
          customerName: formData.customerName,
          customerPRN: formData.customerPRN,
          quotationFrom: formData.quotationFrom,
          items: quotationItems,
          taxableTotalAmount,
          totalTaxAmount,
          totalAmount,
          status: formData.status,
          createdAt: new Date().toISOString(),
        };

        await addQuotation(newQuotation);
      }

      alert(editingQuotation ? 'Quotation updated successfully!' : 'Quotation created successfully!');
      resetForm();
    } catch (error) {
      console.error('Error saving quotation:', error);
      alert('Failed to save quotation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      customerPRN: '',
      manualQuotationNumber: '',
      quotationFrom: {
        pin: companyDetails.companyPIN,
        name: companyDetails.companyName,
        address: companyDetails.address,
        mobile: companyDetails.mobile,
      },
      items: [
        {
          itemCode: '',
          itemDescription: '',
          quantity: 1,
          unitPrice: 0,
          taxRate: 16,
        },
      ],
      status: 'draft',
    });
    setEditingQuotation(null);
    setShowAddForm(false);
  };

  // Handle edit
  const handleEdit = (quotation: Quotation) => {
    console.log('Edit button clicked for quotation:', quotation.systemQuotationNumber);
    
    setEditingQuotation(quotation);
    const newFormData = {
      date: quotation.date,
      customerName: quotation.customerName,
      customerPRN: quotation.customerPRN,
      manualQuotationNumber: quotation.manualQuotationNumber,
      quotationFrom: quotation.quotationFrom || {
        pin: companyDetails.companyPIN,
        name: companyDetails.companyName,
        address: companyDetails.address,
        mobile: companyDetails.mobile,
      },
      items: quotation.items.map((item) => ({
        itemCode: item.itemCode,
        itemDescription: item.itemDescription,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
      })),
      status: quotation.status,
    };
    
    setFormData(newFormData);
    setShowAddForm(true);
    
    // Scroll to form after state updates
    setTimeout(() => {
      const mainContent = document.querySelector('.min-h-screen') || document.body;
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      const formElement = document.querySelector('form');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this quotation?')) {
      try {
        await deleteQuotation(id);
        alert('Quotation deleted successfully!');
      } catch (error) {
        console.error('Error deleting quotation:', error);
        alert('Failed to delete quotation. Please try again.');
      }
    }
  };

  // Print quotation
  const handlePrint = (quotation: Quotation) => {
    // Create hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // Get customer details
    const customer = customers.find(c => c.companyName === quotation.customerName);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quotation - ${quotation.systemQuotationNumber}</title>
          <style>
            @media print {
              @page { margin: 1cm; size: A4; }
              body { margin: 0; padding: 10px; }
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              font-size: 11px;
              color: #000;
              background: #fff;
              display: flex;
              flex-direction: column;
              min-height: 277mm;
              max-height: 277mm;
            }
            .content-wrapper {
              flex: 1;
              display: flex;
              flex-direction: column;
            }
            .main-content {
              flex: 0 0 auto;
            }
            .spacer {
              flex: 1;
            }
            .bottom-section {
              flex: 0 0 auto;
              margin-top: auto;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 3px solid #000;
              padding-bottom: 10px;
            }
            .logo {
              font-size: 22px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .quotation-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 15px;
              border: 2px solid #000;
            }
            .info-box {
              flex: 1;
              padding: 10px;
              border-right: 1px solid #000;
            }
            .info-box:last-child {
              border-right: none;
            }
            .info-box h3 {
              font-size: 11px;
              margin-bottom: 6px;
              font-weight: bold;
              text-decoration: underline;
            }
            .info-box p {
              font-size: 10px;
              margin: 3px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
              border: 2px solid #000;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px 5px;
              text-align: left;
              font-size: 10px;
            }
            th {
              background-color: #000;
              color: #fff;
              font-weight: bold;
              text-align: center;
            }
            tbody tr:nth-child(even) {
              background-color: #f5f5f5;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .tax-summary-section {
              width: 100%;
              border: 2px solid #000;
              padding: 10px;
              margin-bottom: 10px;
            }
            .tax-summary table {
              width: 100%;
              border: 1px solid #000;
            }
            .tax-summary th {
              background-color: #000;
              color: #fff;
              text-align: center;
              padding: 6px;
              font-weight: bold;
            }
            .tax-summary td {
              text-align: right;
              padding: 6px;
              border: 1px solid #000;
            }
            .total-row {
              font-weight: bold;
              border-top: 2px solid #000;
            }
            .footer {
              padding-top: 10px;
              border-top: 1px solid #000;
              text-align: center;
              font-size: 9px;
            }
            .footer p { margin: 3px 0; }
          </style>
        </head>
        <body>
          <div class="main-content">
            <div class="header">
              <div class="logo">
                ${quotation.quotationFrom?.name || 'COMPANY NAME'}
              </div>
              <p style="font-size: 16px; font-weight: bold; margin-top: 5px;">QUOTATION</p>
            </div>

            <div class="quotation-info">
              <div class="info-box">
                <h3>QUOTATION FROM</h3>
                <p><strong>NAME:</strong> ${quotation.quotationFrom?.name || ''}</p>
                <p><strong>PIN:</strong> ${quotation.quotationFrom?.pin || ''}</p>
                <p><strong>ADDRESS:</strong> ${quotation.quotationFrom?.address || ''}</p>
                <p><strong>MOBILE:</strong> ${quotation.quotationFrom?.mobile || ''}</p>
              </div>
              <div class="info-box">
                <h3>QUOTATION TO</h3>
                <p><strong>NAME:</strong> ${quotation.customerName.toUpperCase()}</p>
                <p><strong>Customer PIN:</strong> ${quotation.customerPRN || 'N/A'}</p>
                <p><strong>ADDRESS:</strong> ${customer?.address || 'N/A'}</p>
                <p><strong>MOBILE:</strong> ${customer?.contactNumber || 'N/A'}</p>
              </div>
              <div class="info-box">
                <h3>QUOTATION NO.</h3>
                <p><strong>Quotation:</strong> ${quotation.systemQuotationNumber}</p>
                <p><strong>Reference:</strong> ${quotation.manualQuotationNumber}</p>
                <p><strong>Date:</strong> ${new Date(quotation.date).toLocaleDateString('en-GB')} ${new Date(quotation.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 40px;">S/N</th>
                  <th>Item Description</th>
                  <th style="width: 80px;">Qty</th>
                  <th style="width: 100px;">Unit Price</th>
                  <th style="width: 60px;">Rate</th>
                  <th style="width: 120px;">Amt incl. Tax</th>
                </tr>
              </thead>
              <tbody>
                ${quotation.items
                  .map(
                    (item, index) => `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${item.itemDescription.toUpperCase()}</td>
                    <td class="text-center">${formatKenyanNumber(item.quantity)}</td>
                    <td class="text-right">KSh ${formatKenyanNumber(item.unitPrice)}</td>
                    <td class="text-center">${item.taxRate}%</td>
                    <td class="text-right">KSh ${formatKenyanNumber(item.amountInclTax)}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>

          <div class="spacer"></div>

          <div class="bottom-section">
            <div class="tax-summary-section">
              <p style="font-weight: bold; margin-bottom: 10px;">TAX SUMMARY</p>
              <table class="tax-summary">
                <tr>
                  <th>Tax Rate</th>
                  <th>Taxable Amt</th>
                  <th>Tax Amt</th>
                  <th>Total Amt</th>
                </tr>
                <tr>
                  <td class="text-center">16%</td>
                  <td class="text-right">KSh ${formatKenyanNumber(quotation.taxableTotalAmount)}</td>
                  <td class="text-right">KSh ${formatKenyanNumber(quotation.totalTaxAmount)}</td>
                  <td class="text-right">KSh ${formatKenyanNumber(quotation.totalAmount)}</td>
                </tr>
                <tr>
                  <td class="text-center">0%</td>
                  <td class="text-right">KSh 0.00</td>
                  <td class="text-right">KSh 0.00</td>
                  <td class="text-right">KSh 0.00</td>
                </tr>
                <tr>
                  <td class="text-center">Ex.</td>
                  <td class="text-right">KSh 0.00</td>
                  <td class="text-right">KSh 0.00</td>
                  <td class="text-right">KSh 0.00</td>
                </tr>
                <tr class="total-row">
                  <td class="text-center"><strong>Totals</strong></td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(quotation.taxableTotalAmount)}</strong></td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(quotation.totalTaxAmount)}</strong></td>
                  <td class="text-right"><strong>KSh ${formatKenyanNumber(quotation.totalAmount)}</strong></td>
                </tr>
              </table>
            </div>

            <div class="footer">
              <p>This quotation was generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
              <p>Recycle Business Manager - Quotation System</p>
              <p style="color: #404040; font-size: 10px; text-align: right; margin-top: 10px;">2025 © All rights reserved with Sentiment AI</p>
            </div>
          </div>
          
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // Clean up after printing
    iframe.contentWindow?.addEventListener('afterprint', () => {
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 100);
    });
  };

  // Download CSV
  const handleDownload = () => {
    const csvContent = [
      [
        'System Quotation No',
        'Reference No',
        'Date',
        'Customer',
        'PIN',
        'Items Count',
        'Taxable Amount',
        'Tax Amount',
        'Total Amount',
        'Status',
      ].join(','),
      ...filteredQuotations.map((qtn) =>
        [
          qtn.systemQuotationNumber,
          qtn.manualQuotationNumber,
          qtn.date,
          `"${qtn.customerName}"`,
          qtn.customerPRN,
          qtn.items.length,
          formatKenyanNumber(qtn.taxableTotalAmount, 2),
          formatKenyanNumber(qtn.totalTaxAmount, 2),
          formatKenyanNumber(qtn.totalAmount, 2),
          qtn.status.toUpperCase(),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `quotations_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download PDF
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
    doc.text('Quotations Report', 148, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, 148, 34, { align: 'center' });
    
    // Divider line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(15, 38, 281, 38);

    // Summary boxes
    const summaryY = 45;
    const startX = 15;
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(startX, summaryY, 65, 20, 'S');
    doc.rect(startX + 70, summaryY, 65, 20, 'S');
    doc.rect(startX + 140, summaryY, 65, 20, 'S');
    doc.rect(startX + 210, summaryY, 65, 20, 'S');
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL QUOTATIONS', startX + 5, summaryY + 8);
    doc.text('TOTAL AMOUNT', startX + 75, summaryY + 8);
    doc.text('TAXABLE AMOUNT', startX + 145, summaryY + 8);
    doc.text('TAX AMOUNT', startX + 215, summaryY + 8);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const totalAmount = filteredQuotations.reduce((sum, qtn) => sum + qtn.totalAmount, 0);
    const taxableAmount = filteredQuotations.reduce((sum, qtn) => sum + qtn.taxableTotalAmount, 0);
    const taxAmount = filteredQuotations.reduce((sum, qtn) => sum + qtn.totalTaxAmount, 0);
    doc.text(`${filteredQuotations.length}`, startX + 5, summaryY + 16);
    doc.text(`KSH ${formatKenyanNumber(totalAmount)}`, startX + 75, summaryY + 16);
    doc.text(`KSH ${formatKenyanNumber(taxableAmount)}`, startX + 145, summaryY + 16);
    doc.text(`KSH ${formatKenyanNumber(taxAmount)}`, startX + 215, summaryY + 16);

    // Table data
    const tableData = filteredQuotations.map(qtn => ([
      qtn.systemQuotationNumber,
      qtn.manualQuotationNumber,
      qtn.date,
      qtn.customerName,
      qtn.customerPRN,
      qtn.items.length.toString(),
      formatKenyanNumber(qtn.taxableTotalAmount),
      formatKenyanNumber(qtn.totalTaxAmount),
      formatKenyanNumber(qtn.totalAmount),
      qtn.status.toUpperCase()
    ]));

    autoTable(doc, {
      startY: summaryY + 25,
      head: [['System Quotation', 'Reference', 'Date', 'Customer', 'PIN', 'Items', 'Taxable (KSH)', 'Tax (KSH)', 'Total (KSH)', 'Status']],
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
        textColor: [0, 0, 0],
        lineWidth: 0.1,
        lineColor: [0, 0, 0]
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      },
      margin: { left: 15, right: 15 }
    });
    
    // Footer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || summaryY + 30;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer-generated document. No signature required.', 148, finalY + 10, { align: 'center' });
    doc.text('Recycle Business Manager - Quotation Management System', 148, finalY + 15, { align: 'center' });
    
    // Sentiment AI Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setTextColor(64, 64, 64);
    doc.text('2025 © All rights reserved with Sentiment AI', doc.internal.pageSize.width - 15, pageHeight - 10, { align: 'right' });

    // Save PDF
    doc.save('quotations_report.pdf');
  };

  // Filter quotations
  const filteredQuotations = quotations.filter((qtn) => {
    const matchesSearch =
      searchTerm === '' ||
      qtn.systemQuotationNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qtn.manualQuotationNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qtn.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      qtn.customerPRN.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'all' || qtn.status === filterStatus;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const { taxableTotalAmount, totalTaxAmount, totalAmount } = calculateQuotationTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            Quotation Management
          </h1>
          <p className="text-gray-600 mt-2">Generate and manage sales quotations for customers</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Quotation
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {editingQuotation ? 'Edit Quotation' : 'Create New Quotation'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
                <select
                  value={formData.customerName}
                  onChange={(e) => {
                    const customerName = e.target.value;
                    setFormData({
                      ...formData,
                      customerName,
                      customerPRN: getCustomerPRN(customerName),
                    });
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                >
                  <option value="">Select Customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.companyName}>
                      {customer.companyName} ({customer.customerCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer PIN</label>
                <input
                  type="text"
                  value={formData.customerPRN}
                  onChange={(e) => setFormData({ ...formData, customerPRN: e.target.value })}
                  placeholder="P051410641HC"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
              </div>
            </div>

            {/* Quotation Numbers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  System Quotation Number
                </label>
                <input
                  type="text"
                  value={editingQuotation?.systemQuotationNumber || 'Will be auto-generated'}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Auto-generated sequentially</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={formData.manualQuotationNumber}
                  onChange={(e) => setFormData({ ...formData, manualQuotationNumber: e.target.value })}
                  placeholder="Enter reference number manually"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Enter your custom reference number</p>
              </div>
            </div>

            {/* Items Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Quotation Items</label>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-300 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Item Code
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Description
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Quantity
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Unit Price
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                        Tax Rate (%)
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
                        Excl. Tax
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
                        Tax
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
                        Incl. Tax
                      </th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item, index) => {
                      const { amountExclTax, taxAmount, amountInclTax } = calculateItemTotals(
                        item.quantity,
                        item.unitPrice,
                        item.taxRate
                      );
                      return (
                        <tr key={index} className="border-t border-gray-200">
                          <td className="px-3 py-2">
                            <div className="relative">
                              <input
                                type="text"
                                value={item.itemCode}
                                onChange={(e) => handleItemChange(index, 'itemCode', e.target.value)}
                                onFocus={() => {
                                  if (item.itemCode.trim()) {
                                    setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [index]: true });
                                  }
                                }}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [index]: false });
                                  }, 200);
                                }}
                                placeholder="CODE001"
                                className="w-full px-2 py-1 rounded border border-gray-300 focus:ring-blue-500 focus:border-blue-500 focus:ring-2 outline-none text-sm"
                                required
                              />
                              {/* Item Code Suggestions Dropdown */}
                              {showItemCodeDropdowns[index] && getFilteredItemCodes(index).length > 0 && (
                                <div className="absolute top-full left-0 z-50 bg-white border border-gray-300 rounded-lg shadow-2xl max-h-48 overflow-y-auto min-w-[250px] mt-1">
                                  {getFilteredItemCodes(index).map((invItem) => (
                                    <div
                                      key={invItem.id}
                                      onClick={() => handleSelectItemCode(index, invItem)}
                                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                    >
                                      <div className="font-semibold text-sm text-gray-900">{invItem.itemCode}</div>
                                      <div className="text-xs text-gray-600">{invItem.itemName}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={item.itemDescription}
                              onChange={(e) =>
                                handleItemChange(index, 'itemDescription', e.target.value)
                              }
                              placeholder="Item description"
                              className="w-full px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              required
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)
                              }
                              min="0"
                              step="0.0001"
                              className="w-20 px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              required
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) =>
                                handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)
                              }
                              min="0"
                              step="0.01"
                              className="w-24 px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              required
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={item.taxRate}
                              onChange={(e) =>
                                handleItemChange(index, 'taxRate', parseFloat(e.target.value))
                              }
                              className="w-16 px-2 py-1 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              required
                            >
                              <option value="0">0</option>
                              <option value="16">16</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium">
                            {formatKenyanNumber(amountExclTax)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium">
                            {formatKenyanNumber(taxAmount)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium">
                            {formatKenyanNumber(amountInclTax)}
                          </td>
                          <td className="px-3 py-2">
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItemRow(index)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals Display */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Taxable Amount:</span>
                  <p className="font-bold text-lg">KSh {formatKenyanNumber(taxableTotalAmount)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Tax Amount:</span>
                  <p className="font-bold text-lg">KSh {formatKenyanNumber(totalTaxAmount)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Total Amount:</span>
                  <p className="font-bold text-lg text-blue-600">KSh {formatKenyanNumber(totalAmount)}</p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'draft' | 'sent',
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  required
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                </select>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : editingQuotation ? (
                  'Update Quotation'
                ) : (
                  'Create Quotation'
                )}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search quotations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
          </select>
        </div>
      </div>

      {/* Quotations List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-bold text-gray-900">Quotations</h3>
              <span className="text-sm text-gray-500">({filteredQuotations.length} quotations)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-green-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {filteredQuotations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    System Quotation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Reference No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    PIN
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Items
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredQuotations.map((quotation) => (
                  <tr key={quotation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {quotation.systemQuotationNumber}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-blue-600">
                      {quotation.manualQuotationNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {new Date(quotation.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{quotation.customerName}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{quotation.customerPRN}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{quotation.items.length}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                      KSh {formatKenyanNumber(quotation.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          quotation.status === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {quotation.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handlePrint(quotation)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Print"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {quotation.status === 'draft' && (
                          <button
                            onClick={() => handleEdit(quotation)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(quotation.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No quotations found</p>
            <p className="text-sm text-gray-400 mt-2">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first quotation to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Total Quotations</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{quotations.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <FileText className="w-5 h-5 text-yellow-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Draft</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {quotations.filter((q) => q.status === 'draft').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Sent</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {quotations.filter((q) => q.status === 'sent').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Total Value</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            KSh {formatKenyanNumber(quotations.reduce((sum, qtn) => sum + qtn.totalAmount, 0))}
          </p>
        </div>
      </div>
    </div>
  );
}
