import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, Package, Download, FileText } from 'lucide-react';
import { subscribeToInventoryItems, updateInventoryItem, addInventoryItem, getAllInventoryItems } from '../services/inventoryService';
import { subscribeToSuppliers } from '../services/supplierService';
import type { Supplier } from './SupplierList';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatKenyanNumber, formatInputNumber } from '../utils/numberFormat';
import { addDirectPurchase, subscribeToDirectPurchases, type DirectPurchase, deleteDirectPurchase } from '../services/directPurchaseService';
import { addTransaction } from '../services/transactionService';
import { doc, updateDoc, Timestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { addPaymentTransaction, deletePaymentTrackingByReference } from '../services/paymentTrackingService';

interface PurchaseItem {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
  taxRate: number;
  amountExclTax: number;
  taxAmount: number;
  totalAmount: number;
}

interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  openingBalance: number;
  unit: string;
}

export default function DirectPurchase() {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [supplierCode, setSupplierCode] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [directPurchases, setDirectPurchases] = useState<DirectPurchase[]>([]);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [lastPurchaseData, setLastPurchaseData] = useState<{
    supplierCode: string;
    supplierName: string;
    purchaseDate: string;
    invoiceNumber: string;
    items: PurchaseItem[];
    totalAmount: number;
  } | null>(null);

  // Autocomplete suggestions state
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [showDropdowns, setShowDropdowns] = useState<Record<string, boolean>>({});

  // Subscribe to inventory items
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

  // Subscribe to suppliers
  useEffect(() => {
    const unsubscribe = subscribeToSuppliers(
      (suppliersList) => {
        setSuppliers(suppliersList);
      },
      (error) => {
        console.error('Error subscribing to suppliers:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to direct purchases
  useEffect(() => {
    const unsubscribe = subscribeToDirectPurchases(
      (purchases) => {
        // Filter out PELLETING entries - they're internal processing, not actual purchases
        const filteredPurchases = purchases.filter(purchase => {
          const isPelleting = purchase.invoiceNumber && 
                            purchase.invoiceNumber.toUpperCase().includes('PELLETING');
          return !isPelleting;
        });
        setDirectPurchases(filteredPurchases);
      },
      (error) => {
        console.error('Error subscribing to direct purchases:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Auto-fill supplier name when code is entered
  const handleSupplierCodeChange = (code: string) => {
    setSupplierCode(code);
    setSearchTerms({ ...searchTerms, supplierCode: code });
    
    if (code.trim()) {
      setShowDropdowns({ ...showDropdowns, supplierCode: true });
      
      // Keep auto-fill functionality
      const matchingSupplier = suppliers.find(
        s => s.supplierCode.toLowerCase() === code.toLowerCase().trim()
      );
      
      if (matchingSupplier) {
        setSupplierName(matchingSupplier.companyName);
      }
    } else {
      setShowDropdowns({ ...showDropdowns, supplierCode: false });
    }
  };

  // Get filtered suppliers for dropdown
  const getFilteredSuppliers = () => {
    const searchTerm = searchTerms.supplierCode?.toLowerCase() || '';
    if (!searchTerm) return [];
    return suppliers.filter(s => s.supplierCode.toLowerCase().startsWith(searchTerm));
  };

  // Handle supplier selection from dropdown
  const handleSelectSupplier = (supplier: Supplier) => {
    setSupplierCode(supplier.supplierCode);
    setSupplierName(supplier.companyName);
    setShowDropdowns({ ...showDropdowns, supplierCode: false });
    setSearchTerms({ ...searchTerms, supplierCode: supplier.supplierCode });
  };

  const addPurchaseItem = () => {
    const newItem: PurchaseItem = {
      id: Date.now().toString(),
      itemCode: '',
      itemName: '',
      quantity: 0,
      unit: 'KG',
      rate: 0,
      taxRate: 16,
      amountExclTax: 0,
      taxAmount: 0,
      totalAmount: 0,
    };
    setPurchaseItems([...purchaseItems, newItem]);
    setRateInputs({ ...rateInputs, [newItem.id]: '' });
    setQuantityInputs({ ...quantityInputs, [newItem.id]: '' });
  };

  const handleItemCodeChange = (id: string, code: string) => {
    setPurchaseItems(items =>
      items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, itemCode: code };
          
          // Show/hide dropdown
          if (code.trim()) {
            setShowDropdowns({ ...showDropdowns, [`itemCode-${id}`]: true });
          } else {
            setShowDropdowns({ ...showDropdowns, [`itemCode-${id}`]: false });
          }
          
          // Store search term
          setSearchTerms({ ...searchTerms, [`itemCode-${id}`]: code });
          
          // Auto-fill item name and unit from inventory if code matches
          if (code.trim()) {
            const matchingItem = inventoryItems.find(
              invItem => invItem.itemCode.toLowerCase() === code.toLowerCase().trim()
            );
            
            if (matchingItem) {
              updatedItem.itemName = matchingItem.itemName;
              updatedItem.unit = matchingItem.unit;
            }
          }
          
          return updatedItem;
        }
        return item;
      })
    );
  };

  // Get filtered items for dropdown
  const getFilteredItems = (itemId: string) => {
    const searchTerm = searchTerms[`itemCode-${itemId}`]?.toLowerCase() || '';
    if (!searchTerm) return [];
    return inventoryItems.filter(item => item.itemCode.toLowerCase().startsWith(searchTerm));
  };

  // Handle item selection from dropdown
  const handleSelectItem = (itemId: string, inventoryItem: InventoryItem) => {
    setPurchaseItems(items =>
      items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            itemCode: inventoryItem.itemCode,
            itemName: inventoryItem.itemName,
            unit: inventoryItem.unit
          };
        }
        return item;
      })
    );
    setShowDropdowns({ ...showDropdowns, [`itemCode-${itemId}`]: false });
    setSearchTerms({ ...searchTerms, [`itemCode-${itemId}`]: inventoryItem.itemCode });
  };

  const updatePurchaseItem = (id: string, field: keyof PurchaseItem, value: string | number) => {
    setPurchaseItems(items =>
      items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          // Auto-calculate amounts with VAT
          if (field === 'quantity' || field === 'rate' || field === 'taxRate') {
            updatedItem.amountExclTax = updatedItem.quantity * updatedItem.rate;
            updatedItem.taxAmount = (updatedItem.amountExclTax * updatedItem.taxRate) / 100;
            // Round total to whole number
            updatedItem.totalAmount = Math.round(updatedItem.amountExclTax + updatedItem.taxAmount);
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const removePurchaseItem = (id: string) => {
    setRateInputs(prev => {
      const newInputs = { ...prev };
      delete newInputs[id];
      return newInputs;
    });
    setQuantityInputs(prev => {
      const newInputs = { ...prev };
      delete newInputs[id];
      return newInputs;
    });
    setPurchaseItems(items => items.filter(item => item.id !== id));
  };

  const generatePDF = () => {
    if (!lastPurchaseData) {
      alert('No purchase data available to download');
      return;
    }

    printPurchaseInvoice(lastPurchaseData);
  };

  const generatePDFFromRecord = (purchase: DirectPurchase) => {
    const data = {
      supplierCode: purchase.supplierCode,
      supplierName: purchase.supplierName,
      purchaseDate: purchase.purchaseDate,
      invoiceNumber: purchase.invoiceNumber,
      items: purchase.items,
      totalAmount: purchase.totalAmount
    };
    printPurchaseInvoice(data);
  };

  const printPurchaseInvoice = (data: {
    supplierCode: string;
    supplierName: string;
    purchaseDate: string;
    invoiceNumber: string;
    items: Array<{ itemCode: string; itemName: string; quantity: number; unit: string; rate: number; totalAmount: number }>;
    totalAmount: number;
  }) => {
    // Create hidden iframe for printing in same tab
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

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Invoice - ${data.invoiceNumber || 'N/A'}</title>
        <style>
          @media print {
            @page { margin: 1cm; size: A4; }
            body { margin: 0; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Arial', 'Helvetica', sans-serif; 
            padding: 20px; 
            color: #000; 
            background: #fff;
            line-height: 1.4;
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            padding-bottom: 15px;
            border-bottom: 3px solid #000;
          }
          .header h1 { 
            font-size: 28px; 
            margin-bottom: 5px; 
            font-weight: bold;
            letter-spacing: 1px;
          }
          .header p { 
            font-size: 12px; 
            margin: 3px 0;
          }
          .details-box { 
            border: 2px solid #000; 
            padding: 15px; 
            margin-bottom: 20px; 
          }
          .details-box h3 { 
            margin-bottom: 12px; 
            font-size: 14px;
            font-weight: bold;
            text-decoration: underline;
          }
          .details-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 10px; 
          }
          .detail-item { 
            font-size: 12px; 
          }
          .detail-item span:first-child { 
            display: inline-block; 
            width: 130px; 
            font-weight: normal;
          }
          .detail-item span:last-child { 
            font-weight: bold; 
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 20px; 
          }
          thead { 
            background: #000; 
            color: #fff; 
          }
          th, td { 
            padding: 10px 8px; 
            text-align: left; 
            border: 1px solid #000; 
          }
          th { 
            font-size: 11px; 
            font-weight: bold; 
          }
          td { 
            font-size: 11px; 
          }
          tbody tr:nth-child(even) { 
            background: #f5f5f5; 
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-box { 
            border: 2px solid #000; 
            padding: 15px; 
            margin-top: 20px; 
          }
          .total-box .row { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin: 5px 0;
          }
          .total-box .label { 
            font-size: 13px; 
            font-weight: normal; 
          }
          .total-box .amount { 
            font-size: 13px; 
            font-weight: bold; 
          }
          .total-box .final-row {
            border-top: 2px solid #000;
            padding-top: 8px;
            margin-top: 8px;
          }
          .total-box .final-row .label { 
            font-size: 16px; 
            font-weight: bold;
          }
          .total-box .final-row .amount { 
            font-size: 18px; 
            font-weight: bold;
          }
          .footer { 
            text-align: center; 
            font-size: 10px; 
            margin-top: 30px; 
            padding-top: 15px;
            border-top: 1px solid #000;
          }
          .footer p { margin: 3px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PURCHASE INVOICE</h1>
          <p>Recycle Business Manager</p>
          <p>Direct Purchase Receipt</p>
        </div>

        <div class="details-box">
          <h3>Invoice Details</h3>
          <div class="details-grid">
            <div class="detail-item"><span>Invoice Number:</span><span>${data.invoiceNumber || 'N/A'}</span></div>
            <div class="detail-item"><span>Supplier Code:</span><span>${data.supplierCode}</span></div>
            <div class="detail-item"><span>Purchase Date:</span><span>${new Date(data.purchaseDate).toLocaleDateString('en-GB')}</span></div>
            <div class="detail-item"><span>Supplier Name:</span><span>${data.supplierName}</span></div>
            <div class="detail-item" style="grid-column: 1 / -1;"><span>Generated On:</span><span>${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item Code</th>
              <th>Item Name</th>
              <th class="text-right">Quantity</th>
              <th class="text-center">Unit</th>
              <th class="text-right">Rate</th>
              <th class="text-center">VAT %</th>
              <th class="text-right">Excl. Tax</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${item.itemCode}</td>
                <td>${item.itemName}</td>
                <td class="text-right">${formatKenyanNumber(item.quantity, 2)}</td>
                <td class="text-center">${item.unit}</td>
                <td class="text-right">KSH ${formatKenyanNumber(item.rate, 2)}</td>
                <td class="text-center">${item.taxRate}%</td>
                <td class="text-right">KSH ${formatKenyanNumber(item.amountExclTax, 2)}</td>
                <td class="text-right">KSH ${formatKenyanNumber(item.taxAmount, 2)}</td>
                <td class="text-right"><strong>KSH ${formatKenyanNumber(item.totalAmount, 2)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <div class="row">
            <span class="label">Amount (Excl. Tax):</span>
            <span class="amount">KSH ${formatKenyanNumber(data.items.reduce((sum, item) => sum + item.amountExclTax, 0), 2)}</span>
          </div>
          <div class="row">
            <span class="label">Tax Amount:</span>
            <span class="amount">KSH ${formatKenyanNumber(data.items.reduce((sum, item) => sum + item.taxAmount, 0), 2)}</span>
          </div>
          <div class="row final-row">
            <span class="label">Total Amount:</span>
            <span class="amount">KSH ${formatKenyanNumber(data.totalAmount, 2)}</span>
          </div>
        </div>

        <div class="footer">
          <p>This is a computer-generated document. No signature is required.</p>
          <p>Recycle Business Manager - Direct Purchase System</p>
          <p>Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
        </div>

        <script>
          // Auto-trigger print dialog
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierName.trim()) {
      alert('Please enter supplier name');
      return;
    }

    if (purchaseItems.length === 0) {
      alert('Please add at least one item');
      return;
    }

    // Validate all items have required fields
    const invalidItems = purchaseItems.filter(item => 
      !item.itemName || !item.itemCode || item.quantity <= 0
    );
    
    if (invalidItems.length > 0) {
      alert('Please fill in all item details with valid quantities');
      return;
    }

    try {
      // Store purchase data for PDF generation
      const purchaseData = {
        supplierCode,
        supplierName,
        purchaseDate,
        invoiceNumber,
        items: [...purchaseItems],
        totalAmount: totalPurchaseAmount
      };
      
      setLastPurchaseData(purchaseData);

      // Save to direct purchases collection
      const purchaseId = await addDirectPurchase(purchaseData);
      console.log('Direct purchase saved with ID:', purchaseId);

      // Create expense transaction for Income & Expense tracking
      // IMPORTANT: Do NOT create transactions for PELLETING entries
      // Only create for actual direct purchases from suppliers
      const isPelleting = invoiceNumber && invoiceNumber.toUpperCase().includes('PELLETING');
      
      if (!isPelleting) {
        await addTransaction({
          id: '', // Will be generated by Firestore
          date: purchaseDate,
          description: `Direct Purchase from ${supplierName} - Invoice: ${invoiceNumber || 'N/A'}`,
          type: 'debit',
          amount: totalPurchaseAmount,
          category: 'Material Purchase',
          paymentMethod: 'Direct Purchase',
          senderName: supplierName,
          contraType: 'purchase',
          source: 'direct_purchase',
          purchaseInvoiceNumber: invoiceNumber
        });
      }

      // Fetch fresh inventory data to avoid stale state
      console.log('Fetching latest inventory data...');
      const latestInventory = await getAllInventoryItems();
      console.log(`Found ${latestInventory.length} inventory items`);

      // Update inventory for each purchase item
      for (const purchaseItem of purchaseItems) {
        console.log(`\n=== Processing purchase item ===`);
        console.log(`Item Code: ${purchaseItem.itemCode}`);
        console.log(`Item Name: ${purchaseItem.itemName}`);
        console.log(`Quantity: ${purchaseItem.quantity}`);
        
        // Find the inventory item - match by itemCode (case-insensitive)
        const inventoryItem = latestInventory.find(
          item => item.itemCode.toUpperCase().trim() === purchaseItem.itemCode.toUpperCase().trim()
        );

        if (inventoryItem) {
          // Update existing inventory item - CRITICAL: Add to inBalance ONLY, NOT openingBalance
          const addedQuantity = Number(purchaseItem.quantity);
          const currentInBalance = Number(inventoryItem.inBalance || 0);
          const currentOutBalance = Number(inventoryItem.outBalance || 0);
          
          // IMPORTANT: Only update inBalance (incoming quantity from direct purchase)
          const newInBalance = currentInBalance + addedQuantity;
          // availableQuantity = inBalance - outBalance (simple formula)
          const newAvailableQuantity = newInBalance - currentOutBalance;
          const newTotalBalance = newAvailableQuantity;
          
          console.log(`✓ Found existing inventory item: ${inventoryItem.itemCode} (ID: ${inventoryItem.id})`);
          console.log(`  Current In Balance: ${currentInBalance}`);
          console.log(`  Current Out Balance: ${currentOutBalance}`);
          console.log(`  Adding to In Balance: ${addedQuantity}`);
          console.log(`  NEW In Balance: ${newInBalance}`);
          console.log(`  NEW Available Quantity: ${newAvailableQuantity}`);
          
          try {
            // Direct Firebase update - ONLY update inBalance, NOT openingBalance
            const docRef = doc(db, 'inventory', inventoryItem.id);
            const updateData = {
              inBalance: newInBalance,
              availableQuantity: newAvailableQuantity,
              totalBalance: newTotalBalance,
              updatedAt: Timestamp.now()
            };
            
            console.log(`Updating Firebase with:`, updateData);
            await updateDoc(docRef, updateData);
            console.log(`✓✓ Successfully updated ${inventoryItem.itemCode} - inBalance updated to ${newInBalance}`);
          } catch (error) {
            console.error(`✗ Failed to update ${inventoryItem.itemCode}:`, error);
            throw error;
          }
        } else {
          // Create new inventory item - set inBalance to purchased quantity, openingBalance to 0
          const addedQuantity = Number(purchaseItem.quantity);
          console.log(`Creating NEW inventory item ${purchaseItem.itemCode} with quantity in inBalance: ${addedQuantity}`);
          
          const newItemData = {
            itemCode: purchaseItem.itemCode,
            itemName: purchaseItem.itemName,
            itemDescription: '',
            openingBalance: 0, // Opening balance is 0 for new items
            inBalance: addedQuantity, // Direct purchase goes to inBalance
            outBalance: 0,
            availableQuantity: addedQuantity,
            totalBalance: addedQuantity,
            unit: purchaseItem.unit,
            shipmentId: '',
            shipmentDate: purchaseDate,
          };
          
          console.log(`Creating with data:`, newItemData);
          
          try {
            await addInventoryItem(newItemData);
            console.log(`✓✓ Successfully created inventory for ${purchaseItem.itemCode} with inBalance: ${addedQuantity}`);
          } catch (error) {
            console.error(`✗ Failed to create ${purchaseItem.itemCode}:`, error);
            throw error;
          }
        }
      }

      // Create payment tracking transaction for supplier
      try {
        // Find supplier by code first, then by name
        let supplier = suppliers.find(s => 
          s.supplierCode && s.supplierCode.toLowerCase() === supplierCode.toLowerCase()
        );
        
        if (!supplier) {
          supplier = suppliers.find(s => 
            s.companyName && s.companyName.toLowerCase() === supplierName.toLowerCase()
          );
        }

        if (!supplier) {
          console.warn('Supplier not found in suppliers list. Payment tracking will not be created.');
          alert('Warning: Supplier not found in the system. Please add this supplier first for proper payment tracking.');
        } else {
          console.log('Creating payment tracking for supplier:', { 
            supplierId: supplier.id, 
            supplierName: supplier.companyName, 
            supplierCode: supplier.supplierCode, 
            amount: totalPurchaseAmount 
          });

          // Create invoice transaction with 'pending' status
          await addPaymentTransaction(
            {
              date: purchaseDate,
              partyType: 'supplier',
              partyId: supplier.id,
              partyName: supplier.companyName,
              partyCode: supplier.supplierCode,
              transactionType: 'invoice',
              referenceType: 'purchase',
              referenceNumber: invoiceNumber || `DP-${String(Date.now()).slice(-6)}`,
              amount: totalPurchaseAmount,
              description: `Direct Purchase - Invoice: ${invoiceNumber || 'N/A'}`,
              status: 'pending', // Invoice starts as pending until payment is made
              createdBy: 'System'
            },
            'System'
          );
          console.log('✓ Payment tracking transaction created for supplier:', supplier.companyName);
        }
      } catch (paymentError) {
        console.error('Error creating payment tracking transaction:', paymentError);
        // Don't fail the purchase if payment tracking fails
      }

      alert('Direct purchase saved successfully! Inventory has been updated, expense recorded, and payment tracking updated.');
      
      // Reset form (but keep lastPurchaseData for PDF download)
      setSupplierCode('');
      setSupplierName('');
      setInvoiceNumber('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setPurchaseItems([]);
    } catch (error) {
      console.error('Error saving direct purchase:', error);
      alert('Failed to save direct purchase. Please try again.');
    }
  };

  const totalPurchaseAmount = purchaseItems.reduce((sum, item) => sum + item.totalAmount, 0);

  const handleDeletePurchase = async (purchaseId: string) => {
    if (!confirm('Are you sure you want to delete this purchase record? This will also remove the purchased quantities from inventory.')) {
      return;
    }

    try {
      // Find the purchase record to get the items
      const purchaseToDelete = directPurchases.find(p => p.id === purchaseId);
      
      if (!purchaseToDelete) {
        alert('Purchase record not found');
        return;
      }

      console.log('=== Deleting purchase and updating inventory ===');
      console.log(`Purchase ID: ${purchaseId}`);
      console.log(`Items in purchase:`, purchaseToDelete.items);

      // Fetch latest inventory data
      const latestInventory = await getAllInventoryItems();
      console.log(`Found ${latestInventory.length} inventory items`);

      // Update inventory for each item in the deleted purchase
      for (const purchaseItem of purchaseToDelete.items) {
        console.log(`\n--- Processing item: ${purchaseItem.itemCode} ---`);
        
        // Find the inventory item
        const inventoryItem = latestInventory.find(
          item => item.itemCode.toUpperCase().trim() === purchaseItem.itemCode.toUpperCase().trim()
        );

        if (inventoryItem) {
          // REMOVE the purchased quantity from IN balance
          const removedQuantity = Number(purchaseItem.quantity);
          const currentInBalance = Number(inventoryItem.inBalance || 0);
          const currentOutBalance = Number(inventoryItem.outBalance || 0);
          
          // Calculate new inBalance by subtracting the removed quantity
          const newInBalance = Math.max(0, currentInBalance - removedQuantity); // Prevent negative values
          // availableQuantity = inBalance - outBalance (simple formula)
          const newAvailableQuantity = newInBalance - currentOutBalance;
          const newTotalBalance = newAvailableQuantity;
          
          console.log(`✓ Found inventory item: ${inventoryItem.itemCode} (ID: ${inventoryItem.id})`);
          console.log(`  Current In Balance: ${currentInBalance}`);
          console.log(`  Current Out Balance: ${currentOutBalance}`);
          console.log(`  Removing from In Balance: ${removedQuantity}`);
          console.log(`  NEW In Balance: ${newInBalance}`);
          console.log(`  NEW Available Quantity: ${newAvailableQuantity}`);
          
          try {
            // Update Firebase - REMOVE from inBalance
            const docRef = doc(db, 'inventory', inventoryItem.id);
            const updateData = {
              inBalance: newInBalance,
              availableQuantity: newAvailableQuantity,
              totalBalance: newTotalBalance,
              updatedAt: Timestamp.now()
            };
            
            console.log(`Updating Firebase with:`, updateData);
            await updateDoc(docRef, updateData);
            console.log(`✓✓ Successfully removed ${removedQuantity} from inBalance of ${inventoryItem.itemCode}`);
          } catch (error) {
            console.error(`✗ Failed to update inventory for ${inventoryItem.itemCode}:`, error);
            throw error;
          }
        } else {
          console.log(`⚠ Inventory item ${purchaseItem.itemCode} not found - skipping inventory update`);
        }
      }

      // Delete payment tracking records associated with this purchase
      await deletePaymentTrackingByReference(purchaseToDelete.invoiceNumber);

      // Delete all related transactions (from transactions, basic accounting, expenses)
      try {
        console.log('=== Searching for transactions to delete ===');
        console.log('Invoice Number:', purchaseToDelete.invoiceNumber);
        
        const transactionsRef = collection(db, 'transactions');
        let deletedCount = 0;
        
        // Get ALL transactions and filter in memory to handle all cases
        const allTransactionsSnapshot = await getDocs(transactionsRef);
        console.log(`Found ${allTransactionsSnapshot.size} total transactions to check`);
        
        for (const docSnap of allTransactionsSnapshot.docs) {
          const data = docSnap.data();
          let shouldDelete = false;
          let reason = '';
          
          // Check multiple conditions to identify related transactions
          if (data.source === 'direct_purchase' && 
              data.purchaseInvoiceNumber === purchaseToDelete.invoiceNumber) {
            shouldDelete = true;
            reason = 'matched by source and purchaseInvoiceNumber';
          } else if (data.description && data.description.includes(purchaseToDelete.invoiceNumber)) {
            shouldDelete = true;
            reason = 'matched by invoice number in description';
          } else if (data.category === 'Material Purchase' && 
                     data.senderName === purchaseToDelete.supplierName &&
                     Math.abs(data.amount - purchaseToDelete.totalAmount) < 0.01) {
            shouldDelete = true;
            reason = 'matched by category, supplier, and amount';
          }
          
          if (shouldDelete) {
            await deleteDoc(docSnap.ref);
            deletedCount++;
            console.log(`✓ Deleted transaction ${docSnap.id} (${reason})`);
            console.log(`  Description: ${data.description}`);
            console.log(`  Amount: ${data.amount}`);
          }
        }
        
        console.log(`✓✓ Deleted ${deletedCount} transaction(s) from basic accounting, expenses, and transactions`);
      } catch (error) {
        console.error('Error deleting related transactions:', error);
        // Don't throw - continue with purchase deletion
      }

      // Delete the purchase record from Firestore
      await deleteDirectPurchase(purchaseId);
      console.log('✓✓✓ Purchase record deleted successfully');
      
      alert('Purchase record deleted successfully! Inventory quantities have been updated.');
    } catch (error) {
      console.error('Error deleting purchase:', error);
      alert('Failed to delete purchase record. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl">
            <ShoppingCart className="w-8 h-8 text-primary" />
          </div>
          Direct Purchase
        </h1>
        <p className="text-muted mt-2">
          Record direct purchases that go straight into inventory
        </p>
      </div>

      {/* Purchase Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Details */}
        <div className="card p-6 elev-1">
          <h3 className="text-lg font-semibold text-text mb-4">Purchase Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Supplier Code <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={supplierCode}
                  onChange={(e) => handleSupplierCodeChange(e.target.value)}
                  onFocus={() => {
                    if (supplierCode.trim()) {
                      setShowDropdowns({ ...showDropdowns, supplierCode: true });
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowDropdowns({ ...showDropdowns, supplierCode: false });
                    }, 200);
                  }}
                  placeholder="e.g., S001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                  required
                />
                {/* Suggestions Dropdown */}
                {showDropdowns.supplierCode && getFilteredSuppliers().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {getFilteredSuppliers().map((supplier) => (
                      <div
                        key={supplier.id}
                        onClick={() => handleSelectSupplier(supplier)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-semibold text-sm text-gray-900">{supplier.supplierCode}</div>
                        <div className="text-xs text-gray-600">{supplier.companyName}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {supplierCode && !suppliers.find(s => s.supplierCode.toLowerCase() === supplierCode.toLowerCase().trim()) && (
                <p className="text-xs text-amber-600 mt-1">Supplier code not found in database</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Supplier Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Auto-filled from code"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none bg-gray-50"
                required
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Purchase Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Invoice Number
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g., INV-2025-001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
              />
            </div>
          </div>
        </div>

        {/* Purchase Items */}
        <div className="card p-6 elev-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-text">Purchase Items</h3>
              <p className="text-sm text-muted mt-1">Add items from inventory</p>
            </div>
            <button
              type="button"
              onClick={addPurchaseItem}
              className="btn-gradient soft-btn text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          {purchaseItems.length === 0 ? (
            <div className="bg-surface rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
              <Package className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No items added yet</p>
              <p className="text-sm text-muted mt-1">Click "Add Item" to add purchase items</p>
            </div>
          ) : (
            <div className="space-y-4">
              {purchaseItems.map((item, index) => (
                <div key={item.id} className="card p-4 elev-1 bg-gray-50">
                  <div className="flex items-center gap-3">
                    {/* Item Number */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{index + 1}</span>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-8 gap-3">
                      {/* Item Code */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Item Code <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={item.itemCode}
                            onChange={(e) => handleItemCodeChange(item.id, e.target.value)}
                            onFocus={() => {
                              if (item.itemCode.trim()) {
                                setShowDropdowns({ ...showDropdowns, [`itemCode-${item.id}`]: true });
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setShowDropdowns({ ...showDropdowns, [`itemCode-${item.id}`]: false });
                              }, 200);
                            }}
                            placeholder="e.g., PP04"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none text-sm"
                            required
                          />
                          {/* Suggestions Dropdown */}
                          {showDropdowns[`itemCode-${item.id}`] && getFilteredItems(item.id).length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                              {getFilteredItems(item.id).map((invItem) => (
                                <div
                                  key={invItem.id}
                                  onClick={() => handleSelectItem(item.id, invItem)}
                                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="font-semibold text-sm text-gray-900">{invItem.itemCode}</div>
                                  <div className="text-xs text-gray-600">{invItem.itemName}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Item Name - Auto-filled */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={item.itemName}
                          readOnly
                          placeholder="Auto-filled from code"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                        />
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={quantityInputs[item.id] !== undefined ? quantityInputs[item.id] : (item.quantity || '')}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow empty, digits, one decimal point, and up to 4 decimal places
                            if (value === '' || /^\d*\.?\d{0,4}$/.test(value)) {
                              // Store the raw input for display
                              setQuantityInputs({ ...quantityInputs, [item.id]: value });
                              // Parse and update the numeric value
                              const numValue = value === '' || value === '.' || value.endsWith('.') ? parseFloat(value || '0') || 0 : parseFloat(value);
                              updatePurchaseItem(item.id, 'quantity', isNaN(numValue) ? 0 : numValue);
                            }
                          }}
                          onBlur={() => {
                            // On blur, clean up the input to show the numeric value
                            const currentInput = quantityInputs[item.id];
                            if (currentInput !== undefined && currentInput !== '') {
                              setQuantityInputs({ ...quantityInputs, [item.id]: String(item.quantity || '') });
                            }
                          }}
                          placeholder="0.0000"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none text-sm"
                          required
                        />
                      </div>

                      {/* Unit */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={item.unit}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                        />
                      </div>

                      {/* Rate */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Rate (KSH)
                        </label>
                        <input
                          type="text"
                          value={rateInputs[item.id] !== undefined ? rateInputs[item.id] : (item.rate || '')}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow empty, digits, one decimal point, and up to 4 decimal places
                            if (value === '' || /^\d*\.?\d{0,4}$/.test(value)) {
                              // Store the raw input for display
                              setRateInputs({ ...rateInputs, [item.id]: value });
                              // Parse and update the numeric value
                              const numValue = value === '' || value === '.' || value.endsWith('.') ? parseFloat(value || '0') || 0 : parseFloat(value);
                              updatePurchaseItem(item.id, 'rate', isNaN(numValue) ? 0 : numValue);
                            }
                          }}
                          onBlur={() => {
                            // On blur, clean up the input to show the numeric value
                            const currentInput = rateInputs[item.id];
                            if (currentInput !== undefined && currentInput !== '') {
                              setRateInputs({ ...rateInputs, [item.id]: String(item.rate || '') });
                            }
                          }}
                          placeholder="0.0000"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none text-sm"
                        />
                      </div>

                      {/* VAT Rate */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          VAT (%)
                        </label>
                        <select
                          value={item.taxRate}
                          onChange={(e) => updatePurchaseItem(item.id, 'taxRate', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none text-sm"
                          required
                        >
                          <option value="0">0</option>
                          <option value="16">16</option>
                        </select>
                      </div>

                      {/* Amount Excl Tax */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Excl. Tax
                        </label>
                        <input
                          type="text"
                          value={formatKenyanNumber(item.amountExclTax, 2)}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                        />
                      </div>

                      {/* Tax Amount */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Tax
                        </label>
                        <input
                          type="text"
                          value={formatKenyanNumber(item.taxAmount, 2)}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                        />
                      </div>

                      {/* Total Amount */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Total (KSH)
                        </label>
                        <input
                          type="text"
                          value={formatKenyanNumber(item.totalAmount, 2)}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm font-semibold"
                        />
                      </div>
                    </div>

                    {/* Remove Button */}
                    <button
                      type="button"
                      onClick={() => removePurchaseItem(item.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-smooth text-red-600 flex-shrink-0"
                      title="Remove item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total Summary */}
          {purchaseItems.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-300">
              <div className="flex justify-end">
                <div className="bg-blue-50 rounded-lg p-4 min-w-[300px]">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">Amount (Excl. Tax):</span>
                      <span className="font-semibold">KSH {formatKenyanNumber(purchaseItems.reduce((sum, item) => sum + item.amountExclTax, 0), 2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-700">Tax Amount:</span>
                      <span className="font-semibold">KSH {formatKenyanNumber(purchaseItems.reduce((sum, item) => sum + item.taxAmount, 0), 2)}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-300">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-text">Total Amount:</span>
                        <span className="text-2xl font-bold text-primary">KSH {formatKenyanNumber(totalPurchaseAmount, 2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center gap-3">
          {/* Download PDF Button - Left Side */}
          {lastPurchaseData && (
            <button
              type="button"
              onClick={generatePDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              <Download className="w-5 h-5" />
              Download PDF
            </button>
          )}
          
          {/* Right Side Buttons */}
          <div className="flex gap-3 ml-auto">
            <button
              type="button"
              onClick={() => {
                if (confirm('Are you sure you want to reset the form?')) {
                  setSupplierCode('');
                  setSupplierName('');
                  setInvoiceNumber('');
                  setPurchaseDate(new Date().toISOString().split('T')[0]);
                  setPurchaseItems([]);
                  setSearchTerms({});
                  setShowDropdowns({});
                }
              }}
              className="btn-secondary"
            >
              Reset
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              Save Purchase
            </button>
          </div>
        </div>
      </form>

      {/* Purchase Records Section */}
      {directPurchases.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-text mb-4 flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary" />
            Purchase Records
          </h2>
          <p className="text-muted mb-4">View and download all direct purchase invoices</p>

          <div className="space-y-4">
            {directPurchases
              .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
              .map((purchase) => (
              <div key={purchase.id} className="card p-5 elev-1 hover:shadow-lg transition-all">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Purchase Info */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted font-semibold mb-1">Invoice Number</p>
                      <p className="text-sm font-bold text-text">{purchase.invoiceNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted font-semibold mb-1">Supplier</p>
                      <p className="text-sm font-bold text-text">{purchase.supplierName}</p>
                      <p className="text-xs text-muted">Code: {purchase.supplierCode}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted font-semibold mb-1">Purchase Date</p>
                      <p className="text-sm font-bold text-text">
                        {new Date(purchase.purchaseDate).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted font-semibold mb-1">Total Amount</p>
                      <p className="text-lg font-bold text-primary">KSH {formatKenyanNumber(purchase.totalAmount, 2)}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 lg:flex-col">
                    <button
                      onClick={() => generatePDFFromRecord(purchase)}
                      className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                    <button
                      onClick={() => handleDeletePurchase(purchase.id)}
                      className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Items Summary */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-muted font-semibold mb-2">Items ({purchase.items.length})</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {purchase.items.map((item, idx) => (
                      <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                        <span className="font-semibold">{item.itemName}</span>
                        <span className="text-muted ml-2">
                          {formatKenyanNumber(item.quantity, 2)} {item.unit} @ KSH {formatKenyanNumber(item.rate, 2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
