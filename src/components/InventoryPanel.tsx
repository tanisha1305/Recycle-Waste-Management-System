import { Package, Filter, Search, Download, Trash2, Plus, X, Edit2, FileText, DollarSign } from 'lucide-react';
import { Shipment, DebitCreditNote } from '../types';
import { useState, useEffect } from 'react';
import { 
  InventoryItem, 
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  subscribeToInventoryItems 
} from '../services/inventoryService';
import { 
  InventoryAdjustment,
  addInventoryAdjustment,
  getInventoryAdjustments
} from '../services/inventoryAdjustmentService';
import { getCurrentUser } from '../services/authService';
import { Invoice } from './InvoiceManagement';
import { formatKenyanNumber, formatKSH } from '../utils/numberFormat';
import { DirectPurchase, subscribeToDirectPurchases } from '../services/directPurchaseService';
import { subscribeToInvoices } from '../services/invoiceService';
import { subscribeToDebitCreditNotes } from '../services/debitCreditNoteService';
import jsPDF from 'jspdf';

interface InventoryPanelProps {
  shipments: Shipment[];
  hideHeader?: boolean;
}

interface WastageEntry {
  id: string;
  shipmentId: string;
  shipmentDate: string;
  supplier: string;
  processStage: 'Sorting' | 'Crushing' | 'Washing' | 'Pelleting';
  stageNumber: 1 | 2 | 3 | 4;
  lossKg: number;
  lossPercent: number;
  lossMoney: number;
  operator?: string;
  notes?: string;
  completedAt?: string;
}

interface WasteSale {
  id: string;
  wastageEntryId: string;
  quantity: number;
  rate: number;
  totalAmount: number;
  buyerName: string;
  buyerContact: string;
  saleDate: string;
  paymentMethod: 'cash' | 'bank';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export default function InventoryPanel({ shipments, hideHeader = false }: InventoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'dump'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [processFilter, setProcessFilter] = useState<string>('all');
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [debitCreditNotes, setDebitCreditNotes] = useState<DebitCreditNote[]>([]);
  const [directPurchases, setDirectPurchases] = useState<DirectPurchase[]>([]);
  const [inventoryAdjustments, setInventoryAdjustments] = useState<InventoryAdjustment[]>([]);
  
  // Hierarchy state for inventory items
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [selectedItemMonth, setSelectedItemMonth] = useState<string | null>(null);
  
  // Hierarchy state for wastage/dump
  const [selectedWastageStage, setSelectedWastageStage] = useState<string | null>(null);
  const [selectedWastageMonth, setSelectedWastageMonth] = useState<string | null>(null);
  
  // Waste sale state
  const [showWasteSaleModal, setShowWasteSaleModal] = useState(false);
  const [selectedWasteEntry, setSelectedWasteEntry] = useState<WastageEntry | null>(null);
  const [wasteSales, setWasteSales] = useState<Map<string, WasteSale[]>>(new Map());
  const [wasteSaleForm, setWasteSaleForm] = useState({
    quantity: '',
    rate: '',
    buyerName: '',
    buyerContact: '',
    saleDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash' as 'cash' | 'bank',
    notes: ''
  });
  
  const [newItem, setNewItem] = useState({
    itemCode: '',
    itemName: '',
    openingBalance: 0,
    availableQuantity: 0,
    inBalance: 0,
    outBalance: 0,
    totalBalance: 0,
    unit: 'KG',
  });

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

  // Subscribe to invoices
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

  // Subscribe to debit/credit notes
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

  // Subscribe to direct purchases
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

  // Fetch inventory adjustments
  useEffect(() => {
    const fetchAdjustments = async () => {
      try {
        const adjustments = await getInventoryAdjustments();
        setInventoryAdjustments(adjustments);
      } catch (error) {
        console.error('Error fetching inventory adjustments:', error);
      }
    };
    fetchAdjustments();
  }, []);

  // Auto-generate item codes for items that don't have one
  const generateItemCode = () => {
    const maxCode = inventoryItems.reduce((max, item) => {
      const codeNum = parseInt(item.itemCode.replace('ITM-', '')) || 0;
      return codeNum > max ? codeNum : max;
    }, 0);
    return `ITM-${String(maxCode + 1).padStart(4, '0')}`;
  };

  // Extract all wastage entries from all processing stages
  const allWastageEntries: WastageEntry[] = [];
  
  shipments.forEach((shipment) => {
    if (shipment.processingStages) {
      const stages = [
        { key: 'stage1_sorting', data: shipment.processingStages.stage1_sorting },
        { key: 'stage2_crushing', data: shipment.processingStages.stage2_crushing },
        { key: 'stage3_washing', data: shipment.processingStages.stage3_washing },
        { key: 'stage4_pelleting', data: shipment.processingStages.stage4_pelleting },
      ];

      stages.forEach(({ data }) => {
        if (data && data.lossKg > 0) {
          allWastageEntries.push({
            id: `${shipment.id}-stage${data.stageNumber}`,
            shipmentId: shipment.id,
            shipmentDate: shipment.date,
            supplier: shipment.supplier,
            processStage: data.stageName,
            stageNumber: data.stageNumber,
            lossKg: data.lossKg,
            lossPercent: data.lossPercent,
            lossMoney: data.lossMoney,
            operator: data.operator,
            notes: data.notes,
            completedAt: data.completedAt,
          });
        }
      });
    }
  });

  // Filter items - Enhanced search across all fields
  const filteredItems = inventoryItems.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (item.itemCode && item.itemCode.toLowerCase().includes(searchLower)) ||
      (item.itemName && item.itemName.toLowerCase().includes(searchLower)) ||
      (item.shipmentId && item.shipmentId.toLowerCase().includes(searchLower));
    
    // Date filtering
    const itemDate = item.shipmentDate ? new Date(item.shipmentDate) : new Date();
    const matchesStartDate = !startDate || itemDate >= new Date(startDate);
    const matchesEndDate = !endDate || itemDate <= new Date(endDate);
    
    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  // Filter wastage entries
  const filteredWastage = allWastageEntries.filter((entry) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (entry.processStage && entry.processStage.toLowerCase().includes(searchLower)) ||
      (entry.supplier && entry.supplier.toLowerCase().includes(searchLower)) ||
      (entry.shipmentId && entry.shipmentId.toLowerCase().includes(searchLower)) ||
      (entry.operator && entry.operator.toLowerCase().includes(searchLower));
    
    // Date filtering
    const entryDate = new Date(entry.completedAt || entry.shipmentDate);
    const matchesStartDate = !startDate || entryDate >= new Date(startDate);
    const matchesEndDate = !endDate || entryDate <= new Date(endDate);
    
    // Process filter
    const matchesProcess = processFilter === 'all' || entry.stageNumber === parseInt(processFilter);
    
    return matchesSearch && matchesStartDate && matchesEndDate && matchesProcess;
  });
  // Calculate wastage statistics
  const totalWastageWeight = filteredWastage.reduce((sum, entry) => sum + entry.lossKg, 0);
  const totalWastageMoney = filteredWastage.reduce((sum, entry) => sum + entry.lossMoney, 0);
  const avgWastagePercent = filteredWastage.length > 0 
    ? filteredWastage.reduce((sum, entry) => sum + entry.lossPercent, 0) / filteredWastage.length 
    : 0;

  // Helper: Group inventory items by item name
  const getDistinctItemNames = () => {
    const itemMap = new Map<string, {
      itemName: string;
      totalRecords: number;
      totalQuantity: number;
      latestUnit: string;
    }>();

    filteredItems.forEach(item => {
      if (!item.itemName) return;
      const key = item.itemName.toLowerCase().trim();
      if (itemMap.has(key)) {
        const existing = itemMap.get(key)!;
        existing.totalRecords += 1;
        existing.totalQuantity += item.openingBalance || 0;
      } else {
        itemMap.set(key, {
          itemName: item.itemName,
          totalRecords: 1,
          totalQuantity: item.openingBalance || 0,
          latestUnit: item.unit || 'KG'
        });
      }
    });

    return Array.from(itemMap.values());
  };

  // Helper: Get month-wise transaction details for a specific item
  const getMonthsForItem = (itemName: string) => {
    const transactions = getProductTransactions(itemName);
    const currentYear = new Date().getFullYear();
    
    // Initialize all 12 months with zero values
    const allMonths = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const monthKey = `${currentYear}-${String(monthNum).padStart(2, '0')}`;
      const monthDate = new Date(currentYear, i, 1);
      const monthDisplay = monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      
      return {
        month: monthKey,
        monthDisplay,
        transactionCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        netAmount: 0,
        monthInQuantity: 0, // IN quantity for this month only
        monthOutQuantity: 0, // OUT quantity for this month only
        inQuantity: 0, // Cumulative IN quantity
        outQuantity: 0, // Cumulative OUT quantity
        availableQuantity: 0 // Cumulative available quantity
      };
    });

    // Update months with transactions for that specific month only
    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Find the month in our array
      const monthIndex = allMonths.findIndex(m => m.month === monthKey);
      if (monthIndex !== -1) {
        allMonths[monthIndex].transactionCount += 1;
        allMonths[monthIndex].totalDebit += transaction.debit;
        allMonths[monthIndex].totalCredit += transaction.credit;
        allMonths[monthIndex].netAmount += (transaction.credit - transaction.debit);
        
        // Calculate IN and OUT quantities for this month only
        const qty = transaction.quantity || 0;
        if (qty > 0) {
          // Positive quantity = incoming (purchases, opening balance, credit notes)
          allMonths[monthIndex].monthInQuantity += qty;
        } else if (qty < 0) {
          // Negative quantity = outgoing (sales, debit notes)
          allMonths[monthIndex].monthOutQuantity += Math.abs(qty);
        }
      }
    });

    // Calculate cumulative IN, OUT, and available quantities (carry forward from previous months)
    let cumulativeIn = 0;
    let cumulativeOut = 0;
    allMonths.forEach((month) => {
      cumulativeIn += month.monthInQuantity;
      cumulativeOut += month.monthOutQuantity;
      month.inQuantity = cumulativeIn;
      month.outQuantity = cumulativeOut;
      month.availableQuantity = cumulativeIn - cumulativeOut;
    });

    return allMonths;
  };

  // Helper: Get all transactions for a specific item and month
  const getTransactionsForItemAndMonth = (itemName: string, month: string) => {
    const transactions = getProductTransactions(itemName);
    return transactions.filter(transaction => {
      const date = new Date(transaction.date);
      const transactionMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return transactionMonth === month;
    });
  };

  // Helper: Group wastage by process stage
  const getWastageByStage = () => {
    const stageMap = new Map<string, {
      stageName: string;
      stageNumber: number;
      totalRecords: number;
      totalLossKg: number;
      totalLossMoney: number;
    }>();

    filteredWastage.forEach(entry => {
      const key = `${entry.stageNumber}`;
      if (stageMap.has(key)) {
        const existing = stageMap.get(key)!;
        existing.totalRecords += 1;
        existing.totalLossKg += entry.lossKg;
        existing.totalLossMoney += entry.lossMoney;
      } else {
        stageMap.set(key, {
          stageName: entry.processStage,
          stageNumber: entry.stageNumber,
          totalRecords: 1,
          totalLossKg: entry.lossKg,
          totalLossMoney: entry.lossMoney
        });
      }
    });

    return Array.from(stageMap.values()).sort((a, b) => a.stageNumber - b.stageNumber);
  };

  // Helper: Group wastage by month for a specific stage
  const getMonthsForWastageStage = (stageNumber: number) => {
    const monthMap = new Map<string, {
      month: string;
      monthDisplay: string;
      recordCount: number;
      totalLossKg: number;
      totalLossMoney: number;
    }>();

    filteredWastage
      .filter(entry => entry.stageNumber === stageNumber)
      .forEach(entry => {
        const date = new Date(entry.completedAt || entry.shipmentDate);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthDisplay = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

        if (monthMap.has(monthKey)) {
          const existing = monthMap.get(monthKey)!;
          existing.recordCount += 1;
          existing.totalLossKg += entry.lossKg;
          existing.totalLossMoney += entry.lossMoney;
        } else {
          monthMap.set(monthKey, {
            month: monthKey,
            monthDisplay,
            recordCount: 1,
            totalLossKg: entry.lossKg,
            totalLossMoney: entry.lossMoney
          });
        }
      });

    return Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
  };

  // Helper: Get all wastage records for a specific stage and month
  const getWastageRecordsForStageAndMonth = (stageNumber: number, month: string) => {
    return filteredWastage.filter(entry => {
      const stageMatch = entry.stageNumber === stageNumber;
      const date = new Date(entry.completedAt || entry.shipmentDate);
      const entryMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return stageMatch && entryMonth === month;
    });
  };

  // Get transaction history for a specific product
  const getProductTransactions = (itemName: string) => {
    const transactions: Array<{
      date: string;
      type: 'invoice' | 'purchase' | 'credit_note' | 'debit_note' | 'opening_balance' | 'adjustment';
      description: string;
      party: string;
      reference: string;
      debit: number;
      credit: number;
      quantity?: number; // Positive for purchases, negative for sales
      rate?: number; // Rate per unit (for calculating weighted average)
    }> = [];

    // Add opening balance as initial transaction
    const itemRecords = inventoryItems.filter(item => 
      item.itemName.toLowerCase().trim() === itemName.toLowerCase().trim()
    );
    
    itemRecords.forEach(item => {
      if (item.openingBalance !== undefined && item.openingBalance !== 0) {
        transactions.push({
          date: item.shipmentDate || item.createdAt,
          type: 'opening_balance',
          description: `Opening Quantity: ${item.itemName} (${item.openingBalance} ${item.unit})`,
          party: 'System',
          reference: 'Opening Quantity',
          debit: 0,
          credit: 0,
          quantity: item.openingBalance, // Can be positive or negative
          rate: item.costPerKg || 0 // Use costPerKg from inventory item if available
        });
      }
    });

    // Add invoices (sales reduce inventory value - debit)
    invoices.forEach(inv => {
      inv.items.forEach(invItem => {
        // Match by item description since invoices use itemDescription
        if ((invItem.itemDescription && itemName && invItem.itemDescription.toLowerCase().includes(itemName.toLowerCase())) || 
            (invItem.itemCode && itemName && invItem.itemCode.toLowerCase().includes(itemName.toLowerCase()))) {
          transactions.push({
            date: inv.date,
            type: 'invoice',
            description: `Sale: ${invItem.itemDescription} (${invItem.quantity} units @ KSH ${invItem.unitPrice})`,
            party: inv.customerName,
            reference: inv.manualInvoiceNumber || inv.systemInvoiceNumber,
            debit: invItem.amountInclTax, // Debit = reduces inventory value
            credit: 0,
            quantity: -invItem.quantity, // Negative for sales (outgoing)
            rate: invItem.unitPrice // Rate from invoice
          });
        }
      });
    });

    // Add direct purchases (purchases add inventory value - credit)
    directPurchases.forEach(purchase => {
      purchase.items.forEach(purItem => {
        if (purItem.itemName.toLowerCase().trim() === itemName.toLowerCase().trim()) {
          transactions.push({
            date: purchase.purchaseDate,
            type: 'purchase',
            description: `Purchase: ${purItem.itemName} (${purItem.quantity} ${purItem.unit} @ KSH ${purItem.rate})`,
            party: purchase.supplierName,
            reference: purchase.invoiceNumber,
            debit: 0,
            credit: purItem.totalAmount, // Credit = adds to inventory value
            quantity: purItem.quantity, // Positive for purchases (incoming)
            rate: purItem.rate // Rate from direct purchase
          });
        }
      });
    });

    // Add debit/credit notes (excluding auto-generated ones from direct purchases and invoices)
    debitCreditNotes
      .filter(note => note.status === 'issued' || note.status === 'paid')
      .filter(note => {
        // Exclude auto-generated notes to avoid double counting
        // Auto-generated notes have specific remarks
        const isAutoGenerated = note.remarks && (
          note.remarks.includes('Auto-generated from Direct Purchase') ||
          note.remarks.includes('Auto-generated from Sales Invoice')
        );
        return !isAutoGenerated;
      })
      .forEach(note => {
        note.items.forEach(noteItem => {
          // Match by description since notes use description field
          if (noteItem.description.toLowerCase().includes(itemName.toLowerCase())) {
            let debit = 0;
            let credit = 0;
            
            // INVENTORY BALANCE LOGIC (value of stock on hand):
            // Credit Note (Customer Returns Goods) = CREDIT entry (adds inventory value back)
            //   - Goods come back, inventory value increases
            // Debit Note (Return to Supplier) = DEBIT entry (reduces inventory value)
            //   - Goods go back, inventory value decreases
            if (note.noteType === 'credit') {
              // Credit Note = CREDIT (adds inventory value - customer returns goods)
              credit = noteItem.amount;
            } else {
              // Debit Note = DEBIT (reduces inventory value - return to supplier)
              debit = noteItem.amount;
            }

            // Calculate rate from amount and quantity
            const rate = noteItem.quantity > 0 ? noteItem.amount / noteItem.quantity : 0;

            transactions.push({
              date: note.date,
              type: note.noteType === 'credit' ? 'credit_note' : 'debit_note',
              description: `${note.noteType === 'credit' ? 'Credit' : 'Debit'} Note: ${noteItem.description} (${noteItem.quantity}) - Ref: ${note.originalInvoiceNumber}`,
              party: note.partyName,
              reference: note.noteNumber,
              debit,
              credit,
              // For inventory quantity calculation:
              // Credit note = customer returns goods = positive quantity (adds to inBalance)
              // Debit note = return to supplier = negative quantity (adds to outBalance, reduces available)
              quantity: note.noteType === 'credit' ? noteItem.quantity : -noteItem.quantity,
              rate: rate // Calculated rate
            });
          }
        });
      });

    // Add inventory adjustments
    inventoryAdjustments
      .filter(adj => adj.itemName.toLowerCase().trim() === itemName.toLowerCase().trim())
      .forEach(adj => {
        transactions.push({
          date: adj.adjustmentDate,
          type: 'adjustment',
          description: `Stock Adjustment: ${adj.adjustmentQuantity > 0 ? '+' : ''}${adj.adjustmentQuantity} ${adj.unit} - ${adj.reason || 'Manual adjustment'}`,
          party: adj.adjustedByName || 'System',
          reference: 'ADJ-' + (adj.id?.substring(0, 8) || 'XXXX'),
          debit: 0,
          credit: 0,
          quantity: adj.adjustmentQuantity, // Can be positive or negative
          rate: 0 // Adjustments don't affect rate calculation
        });
      });

    // Sort by date descending (newest first)
    return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Calculate available quantity for a product (opening + purchases - sales)
  const getProductQuantity = (itemName: string, openingBalance: number) => {
    const transactions = getProductTransactions(itemName);
    // Purchases have positive quantity, sales have negative quantity
    const totalQuantityMovement = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
    return openingBalance + totalQuantityMovement;
  };

  // Calculate weighted average purchase rate for an item
  // This calculates the average cost per unit based on all incoming transactions (purchases, opening balance, credit notes)
  const getAverageRate = (itemName: string): number => {
    const transactions = getProductTransactions(itemName);
    
    // Filter only incoming transactions (purchases and returns)
    const incomingTransactions = transactions.filter(t => 
      (t.quantity && t.quantity > 0) && (t.rate && t.rate > 0)
    );
    
    if (incomingTransactions.length === 0) {
      return 0;
    }
    
    // Calculate weighted average: sum(quantity × rate) / sum(quantity)
    const totalValue = incomingTransactions.reduce((sum, t) => 
      sum + ((t.quantity || 0) * (t.rate || 0)), 0
    );
    const totalQuantity = incomingTransactions.reduce((sum, t) => 
      sum + (t.quantity || 0), 0
    );
    
    return totalQuantity > 0 ? totalValue / totalQuantity : 0;
  };

  // Calculate total stock value for an item (Available Quantity × Average Rate)
  const getStockValue = (itemName: string): number => {
    const transactions = getProductTransactions(itemName);
    
    // Calculate available quantity (in - out)
    const totalInQuantity = transactions
      .filter(t => (t.quantity || 0) > 0)
      .reduce((sum, t) => sum + (t.quantity || 0), 0);
    
    const totalOutQuantity = Math.abs(transactions
      .filter(t => (t.quantity || 0) < 0)
      .reduce((sum, t) => sum + (t.quantity || 0), 0));
    
    const availableQuantity = totalInQuantity - totalOutQuantity;
    
    // Get weighted average rate
    const averageRate = getAverageRate(itemName);
    
    // Stock Value = Available Quantity × Average Rate
    return availableQuantity * averageRate;
  };

  // Calculate available quantity for a specific item record
  const getItemRecordQuantity = (item: InventoryItem) => {
    // Get all transactions for this specific item
    const transactions = getProductTransactions(item.itemName);
    
    // Filter transactions up to this item's date
    const relevantTransactions = transactions.filter(t => 
      new Date(t.date) <= new Date(item.shipmentDate)
    );
    
    const totalQuantityMovement = relevantTransactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
    return (item.openingBalance || 0) + totalQuantityMovement;
  };

  // Calculate total revenue for a product
  const getProductRevenue = (itemName: string) => {
    const transactions = getProductTransactions(itemName);
    const totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
    const totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
    return { totalCredit, totalDebit, netRevenue: totalCredit - totalDebit };
  };

  // Calculate summary statistics based on selected level
  let totalInQuantity = 0;
  let totalOutQuantity = 0;
  let totalAvailableQuantity = 0;
  let uniqueItemCount = 0;
  let totalBalance = 0;

  if (selectedItemName && selectedItemMonth) {
    // Level 3: Specific item + specific month - show transaction-level stats for that month
    const transactions = getProductTransactions(selectedItemName);
    const monthTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
      return tMonth === selectedItemMonth;
    });
    
    // Get transactions only for this specific month (not cumulative)
    totalInQuantity = monthTransactions.reduce((sum, t) => sum + (t.quantity && t.quantity > 0 ? t.quantity : 0), 0);
    totalOutQuantity = monthTransactions.reduce((sum, t) => sum + (t.quantity && t.quantity < 0 ? Math.abs(t.quantity) : 0), 0);
    totalAvailableQuantity = totalInQuantity - totalOutQuantity;
    uniqueItemCount = 1;
    
    // Calculate stock value for this month using average rate
    const avgRate = getAverageRate(selectedItemName);
    totalBalance = totalAvailableQuantity * avgRate;
  } else if (selectedItemName) {
    // Level 2: Specific item selected - show month-level stats for that item
    // Calculate from monthly aggregations to match monthly view
    const months = getMonthsForItem(selectedItemName);
    
    // Sum all monthly IN quantities
    totalInQuantity = months.reduce((sum, m) => sum + m.monthInQuantity, 0);
    
    // Sum all monthly OUT quantities
    totalOutQuantity = months.reduce((sum, m) => sum + m.monthOutQuantity, 0);
    
    // Get the last month's cumulative available quantity
    // Find the last month with transactions
    const lastMonthWithData = [...months].reverse().find(m => m.transactionCount > 0);
    totalAvailableQuantity = lastMonthWithData ? lastMonthWithData.availableQuantity : 0;
    
    uniqueItemCount = 1;
    
    // Total Balance = Stock Value (Available Quantity × Average Rate)
    totalBalance = getStockValue(selectedItemName);
  } else {
    // Level 1: All items - show total stats
    // Get all unique item names
    const allItemNames = getDistinctItemNames();
    uniqueItemCount = allItemNames.length;
    
    // Calculate totals from monthly aggregations for each unique item
    allItemNames.forEach(item => {
      const months = getMonthsForItem(item.itemName);
      
      // Sum all monthly IN quantities
      const itemInQty = months.reduce((sum, m) => sum + m.monthInQuantity, 0);
      
      // Sum all monthly OUT quantities
      const itemOutQty = months.reduce((sum, m) => sum + m.monthOutQuantity, 0);
      
      // Get the last month's cumulative available quantity
      const lastMonthWithData = [...months].reverse().find(m => m.transactionCount > 0);
      const itemAvailableQty = lastMonthWithData ? lastMonthWithData.availableQuantity : 0;
      
      totalInQuantity += itemInQty;
      totalOutQuantity += itemOutQty;
      totalAvailableQuantity += itemAvailableQty;
    });
    
    // Calculate total balance as sum of stock values for all items
    totalBalance = allItemNames.reduce((sum, item) => {
      const stockValue = getStockValue(item.itemName);
      return sum + stockValue;
    }, 0);
  }

  // Load waste sales from localStorage on mount
  useEffect(() => {
    const savedSales = localStorage.getItem('wasteSales');
    if (savedSales) {
      try {
        const parsed = JSON.parse(savedSales);
        setWasteSales(new Map(Object.entries(parsed)));
      } catch (error) {
        console.error('Error loading waste sales:', error);
      }
    }
  }, []);

  // Save waste sales to localStorage whenever it changes
  useEffect(() => {
    if (wasteSales.size > 0) {
      const salesObject = Object.fromEntries(wasteSales);
      localStorage.setItem('wasteSales', JSON.stringify(salesObject));
    }
  }, [wasteSales]);

  // Calculate total sold quantity for a waste entry
  const getTotalSoldQuantity = (wasteEntryId: string): number => {
    const sales = wasteSales.get(wasteEntryId) || [];
    return sales.reduce((sum, sale) => sum + sale.quantity, 0);
  };

  // Calculate remaining waste quantity
  const getRemainingWaste = (wasteEntry: WastageEntry): number => {
    const sold = getTotalSoldQuantity(wasteEntry.id);
    return Math.max(0, wasteEntry.lossKg - sold);
  };

  // Handle opening waste sale modal
  const handleOpenWasteSaleModal = (wasteEntry: WastageEntry) => {
    const remaining = getRemainingWaste(wasteEntry);
    if (remaining <= 0) {
      alert('All waste from this entry has been sold.');
      return;
    }
    setSelectedWasteEntry(wasteEntry);
    setWasteSaleForm({
      quantity: '',
      rate: '',
      buyerName: '',
      buyerContact: '',
      saleDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      notes: ''
    });
    setShowWasteSaleModal(true);
  };

  // Handle saving waste sale
  const handleSaveWasteSale = () => {
    if (!selectedWasteEntry) return;

    const quantity = parseFloat(wasteSaleForm.quantity);
    const rate = parseFloat(wasteSaleForm.rate);

    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    if (isNaN(rate) || rate <= 0) {
      alert('Please enter a valid rate per KG');
      return;
    }

    const remaining = getRemainingWaste(selectedWasteEntry);
    if (quantity > remaining) {
      alert(`Quantity cannot exceed remaining waste: ${formatKenyanNumber(remaining)} KG`);
      return;
    }

    if (!wasteSaleForm.buyerName.trim()) {
      alert('Please enter buyer name');
      return;
    }

    const newSale: WasteSale = {
      id: `WS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      wastageEntryId: selectedWasteEntry.id,
      quantity,
      rate,
      totalAmount: quantity * rate,
      buyerName: wasteSaleForm.buyerName,
      buyerContact: wasteSaleForm.buyerContact,
      saleDate: wasteSaleForm.saleDate,
      paymentMethod: wasteSaleForm.paymentMethod,
      notes: wasteSaleForm.notes,
      createdAt: new Date().toISOString(),
      createdBy: 'Current User' // You can replace with actual user from context
    };

    // Update waste sales map
    const updatedSales = new Map(wasteSales);
    const existingSales = updatedSales.get(selectedWasteEntry.id) || [];
    updatedSales.set(selectedWasteEntry.id, [...existingSales, newSale]);
    setWasteSales(updatedSales);

    alert(`Waste sale recorded successfully! Total: KSH ${formatKenyanNumber(newSale.totalAmount)}`);
    setShowWasteSaleModal(false);
    setSelectedWasteEntry(null);
  };

  // Toggle expanded item
  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  // Generate professional receipt for individual transaction
  const handleViewTransactionReceipt = (transaction: any, itemName: string, inventoryItem: InventoryItem | undefined) => {
    // Calculate cumulative balances up to this transaction
    const allTransactions = getProductTransactions(itemName);
    const transactionsUpToNow = allTransactions.filter(t => 
      new Date(t.date) <= new Date(transaction.date)
    );
    const cumulativeInBalance = transactionsUpToNow.reduce((sum, t) => sum + t.debit, 0);
    const cumulativeOutBalance = transactionsUpToNow.reduce((sum, t) => sum + t.credit, 0);
    const quantityMovement = transactionsUpToNow.reduce((sum, t) => sum + (t.quantity || 0), 0);
    const openingBalance = inventoryItem?.openingBalance || 0;
    const availableQty = openingBalance + quantityMovement;

    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // Header - Company Name
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DONATO IMPEX LTD.', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 8;
    doc.setFontSize(18);
    doc.text('RECYCLE BUSINESS MANAGER', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 7;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TRANSACTION RECEIPT', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth / 2, yPos, { align: 'center' });

    // Divider line
    yPos += 6;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);

    // Item Information Section
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TRANSACTION DETAILS', 20, yPos);
    
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Item Code:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(inventoryItem?.itemCode || 'N/A', 50, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Item Name:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(itemName, 140, yPos);

    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction Date:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(transaction.date).toLocaleDateString(), 50, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Unit:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(inventoryItem?.unit || 'KG', 140, yPos);

    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Opening Balance:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatKenyanNumber(openingBalance)} ${inventoryItem?.unit || 'KG'}`, 50, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Available Qty:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatKenyanNumber(availableQty)} ${inventoryItem?.unit || 'KG'}`, 140, yPos);

    // Financial Summary Section
    yPos += 8;
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('FINANCIAL SUMMARY (Cumulative)', 20, yPos);

    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('In Balance (Purchases):', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(cumulativeInBalance)}`, 65, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Out Balance (Sales):', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`KSH ${formatKenyanNumber(cumulativeOutBalance)}`, 155, yPos);

    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Net Balance:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    const netBalance = cumulativeInBalance - cumulativeOutBalance;
    doc.text(`KSH ${formatKenyanNumber(netBalance)}`, 65, yPos);

    // Transaction Details Table
    yPos += 8;
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 6;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('THIS TRANSACTION', 20, yPos);

    yPos += 6;
    // Table headers
    doc.setFontSize(9);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Type', 18, yPos);
    doc.text('Party', 50, yPos);
    doc.text('Reference', 95, yPos);
    doc.text('Qty', 135, yPos);
    doc.text('Debit', 155, yPos);
    doc.text('Credit', 180, yPos);

    yPos += 1;
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    const typeText = transaction.type === 'credit_note' ? 'CR NOTE' :
                     transaction.type === 'debit_note' ? 'DB NOTE' :
                     transaction.type.toUpperCase();
    doc.text(typeText, 18, yPos);
    doc.text(transaction.party.substring(0, 20), 50, yPos);
    doc.text(transaction.reference.substring(0, 18), 95, yPos);
    
    // Quantity
    if (transaction.quantity) {
      const qtyText = `${transaction.quantity > 0 ? '+' : ''}${formatKenyanNumber(transaction.quantity)}`;
      doc.text(qtyText, 135, yPos);
    } else {
      doc.text('-', 135, yPos);
    }
    
    // Debit
    if (transaction.debit > 0) {
      doc.text(formatKenyanNumber(transaction.debit), 155, yPos);
    } else {
      doc.text('-', 155, yPos);
    }
    
    // Credit
    if (transaction.credit > 0) {
      doc.text(formatKenyanNumber(transaction.credit), 180, yPos);
    } else {
      doc.text('-', 180, yPos);
    }

    yPos += 8;
    doc.line(15, yPos, pageWidth - 15, yPos);
    
    yPos += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Description:', 18, yPos);
    doc.setFont('helvetica', 'normal');
    const description = transaction.description || 'N/A';
    const splitDescription = doc.splitTextToSize(description, pageWidth - 50);
    doc.text(splitDescription, 18, yPos + 5);

    // Footer
    yPos += 20;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 5;
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text('This is a computer-generated document. No signature required.', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 4;
    doc.text('Recycle Business Manager - Transaction Management System', pageWidth / 2, yPos, { align: 'center' });

    // Page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      
      // Sentiment AI Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setTextColor(64, 64, 64);
      doc.text('2025 © All rights reserved with Sentiment AI', pageWidth - 15, pageHeight - 10, { align: 'right' });
    }

    // Open native print dialog first
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Create hidden iframe to trigger native print dialog
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
          doc.save(`Transaction_${inventoryItem?.itemCode}_${new Date(transaction.date).toISOString().split('T')[0]}.pdf`);
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

  // Generate professional receipt for individual inventory item record
  const handleViewReceipt = (item: InventoryItem) => {
    // Get transactions for this specific item up to its date
    const allTransactions = getProductTransactions(item.itemName);
    const itemTransactions = allTransactions.filter(t => 
      new Date(t.date).toDateString() === new Date(item.shipmentDate).toDateString()
    );
    
    // Calculate balances for this specific record
    const itemDebit = itemTransactions.reduce((sum, t) => sum + t.debit, 0);
    const itemCredit = itemTransactions.reduce((sum, t) => sum + t.credit, 0);
    const availableQty = getItemRecordQuantity(item);

    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // Header - Company Name
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('DONATO IMPEX LTD.', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 8;
    doc.setFontSize(20);
    doc.text('INVENTORY RECORD RECEIPT', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Recycle Business Manager', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 5;
    doc.text(`Receipt Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth / 2, yPos, { align: 'center' });
    doc.setTextColor(0);

    // Divider line
    yPos += 8;
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(15, yPos, pageWidth - 15, yPos);

    // Item Information Section
    yPos += 10;
    doc.setFillColor(245, 245, 245);
    doc.rect(15, yPos, pageWidth - 30, 40, 'F');
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(15, yPos, pageWidth - 30, 40);
    
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ITEM DETAILS', 20, yPos);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Item Code:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(item.itemCode || 'N/A', 55, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Item Name:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(item.itemName, 145, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Record Date:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(item.shipmentDate).toLocaleDateString(), 55, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Unit:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(item.unit || 'KG', 145, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Opening Balance:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatKenyanNumber(item.openingBalance || 0, 2)} ${item.unit || 'KG'}`, 55, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Available Qty:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatKenyanNumber(availableQty, 2)} ${item.unit || 'KG'}`, 145, yPos);

    // Financial Summary Section
    yPos += 15;
    doc.setFillColor(240, 248, 255);
    doc.rect(15, yPos, pageWidth - 30, 32, 'F');
    doc.setDrawColor(0);
    doc.rect(15, yPos, pageWidth - 30, 32);
    
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FINANCIAL SUMMARY', 20, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('In Balance (Purchases):', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 128, 0);
    doc.text(`KSH ${formatKenyanNumber(itemDebit, 2)}`, 70, yPos);
    doc.setTextColor(0);

    doc.setFont('helvetica', 'bold');
    doc.text('Out Balance (Sales):', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 20, 60);
    doc.text(`KSH ${formatKenyanNumber(itemCredit, 2)}`, 160, yPos);
    doc.setTextColor(0);

    yPos += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Balance:', 20, yPos);
    doc.setFont('helvetica', 'bold');
    const netBalance = itemDebit - itemCredit;
    if (netBalance >= 0) {
      doc.setTextColor(0, 128, 0);
    } else {
      doc.setTextColor(220, 20, 60);
    }
    doc.text(`KSH ${formatKenyanNumber(netBalance, 2)}`, 70, yPos);
    doc.setTextColor(0);

    doc.setFont('helvetica', 'bold');
    doc.text('Transaction Count:', 110, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${itemTransactions.length}`, 160, yPos);

    // Transaction Details Table
    yPos += 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RECORD TRANSACTIONS', 20, yPos);

    yPos += 8;
    // Table headers
    doc.setFontSize(9);
    doc.setFillColor(50, 50, 50);
    doc.setTextColor(255, 255, 255);
    doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
    
    doc.text('Date', 18, yPos);
    doc.text('Type', 45, yPos);
    doc.text('Party', 70, yPos);
    doc.text('Reference', 105, yPos);
    doc.text('Qty', 140, yPos);
    doc.text('Debit', 160, yPos);
    doc.text('Credit', 180, yPos);

    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    yPos += 5;
    itemTransactions.forEach((t, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
        
        // Repeat headers on new page
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(50, 50, 50);
        doc.setTextColor(255, 255, 255);
        doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
        
        doc.text('Date', 18, yPos);
        doc.text('Type', 45, yPos);
        doc.text('Party', 70, yPos);
        doc.text('Reference', 105, yPos);
        doc.text('Qty', 140, yPos);
        doc.text('Debit', 160, yPos);
        doc.text('Credit', 180, yPos);
        
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        yPos += 5;
      }

      // Alternating row colors
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');
      }

      doc.text(new Date(t.date).toLocaleDateString(), 18, yPos);
      
      const typeText = t.type === 'credit_note' ? 'CR NOTE' :
                       t.type === 'debit_note' ? 'DB NOTE' :
                       t.type.toUpperCase();
      doc.text(typeText.substring(0, 8), 45, yPos);
      doc.text(t.party.substring(0, 15), 70, yPos);
      doc.text(t.reference.substring(0, 15), 105, yPos);
      
      // Quantity
      if (t.quantity) {
        const qtyText = `${t.quantity > 0 ? '+' : ''}${formatKenyanNumber(t.quantity, 2)}`;
        doc.text(qtyText, 140, yPos);
      } else {
        doc.text('-', 140, yPos);
      }
      
      // Debit
      if (t.debit > 0) {
        doc.setTextColor(220, 20, 60);
        doc.text(formatKenyanNumber(t.debit, 2), 160, yPos);
        doc.setTextColor(0);
      } else {
        doc.text('-', 160, yPos);
      }
      
      // Credit
      if (t.credit > 0) {
        doc.setTextColor(0, 128, 0);
        doc.text(formatKenyanNumber(t.credit, 2), 180, yPos);
        doc.setTextColor(0);
      } else {
        doc.text('-', 180, yPos)
      }

      yPos += 7;
    });

    // Footer
    yPos += 10;
    doc.setDrawColor(200);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 6;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('This is a computer-generated receipt and does not require a signature.', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 4;
    doc.text('For any queries, please contact the administration.', pageWidth / 2, yPos, { align: 'center' });

    // Page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      
      // Sentiment AI Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setTextColor(64, 64, 64);
      doc.text('2025 © All rights reserved with Sentiment AI', pageWidth - 15, pageHeight - 10, { align: 'right' });
    }

    // Open native print dialog first
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Create hidden iframe to trigger native print dialog
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
          doc.save(`Receipt_${item.itemCode}_${item.itemName}_${new Date(item.shipmentDate).toISOString().split('T')[0]}.pdf`);
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

  // Generate professional PDF for product history
  const generateProductPDF = (item: InventoryItem) => {
    const transactions = getProductTransactions(item.itemName);
    const { totalCredit, totalDebit, netRevenue } = getProductRevenue(item.itemName);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('PRODUCT TRANSACTION HISTORY', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' });

    // Product Details Box
    yPos += 15;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(15, yPos, pageWidth - 30, 25);
    
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Product Information:', 20, yPos);
    
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Code: ${item.itemCode}`, 20, yPos);
    doc.text(`Name: ${item.itemName}`, 80, yPos);
    
    yPos += 6;
    doc.text(`Opening Balance: ${item.openingBalance} ${item.unit}`, 20, yPos);
    doc.text(`Date: ${new Date(item.shipmentDate).toLocaleDateString()}`, 80, yPos);

    // Financial Summary Box
    yPos += 15;
    doc.setDrawColor(0);
    doc.rect(15, yPos, pageWidth - 30, 20);
    
    yPos += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary:', 20, yPos);
    
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Income: KSH ${formatKenyanNumber(totalCredit, 2)}`, 20, yPos);
    doc.text(`Total Expense: KSH ${formatKenyanNumber(totalDebit, 2)}`, 80, yPos);
    doc.text(`Net Revenue: KSH ${formatKenyanNumber(netRevenue, 2)}`, 140, yPos);

    // Transaction Table Header
    yPos += 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Transaction History:', 20, yPos);

    yPos += 8;
    doc.setFontSize(9);
    doc.setDrawColor(0);
    doc.setFillColor(240, 240, 240);
    doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
    
    doc.text('Date', 18, yPos);
    doc.text('Type', 45, yPos);
    doc.text('Party', 70, yPos);
    doc.text('Reference', 105, yPos);
    doc.text('Debit', 140, yPos);
    doc.text('Credit', 165, yPos);

    // Transaction Rows
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    transactions.forEach((t, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      const rowY = yPos;
      
      doc.text(new Date(t.date).toLocaleDateString(), 18, rowY);
      doc.text(t.type.replace('_', ' ').toUpperCase().substring(0, 8), 45, rowY);
      doc.text(t.party.substring(0, 20), 70, rowY);
      doc.text(t.reference.substring(0, 20), 105, rowY);
      doc.text(t.debit > 0 ? formatKenyanNumber(t.debit, 2) : '-', 140, rowY);
      doc.text(t.credit > 0 ? formatKenyanNumber(t.credit, 2) : '-', 165, rowY);

      // Draw light line
      if (index < transactions.length - 1) {
        doc.setDrawColor(220);
        doc.line(15, rowY + 2, pageWidth - 15, rowY + 2);
      }

      yPos += 7;
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      
      // Sentiment AI Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setTextColor(64, 64, 64);
      doc.text('2025 © All rights reserved with Sentiment AI', pageWidth - 15, pageHeight - 10, { align: 'right' });
    }

    doc.save(`${item.itemCode}_${item.itemName}_History.pdf`);
  };

  // Handle closing the modal and resetting form
  const handleCloseModal = () => {
    setNewItem({
      itemCode: '',
      itemName: '',
      openingBalance: 0,
      availableQuantity: 0,
      inBalance: 0,
      outBalance: 0,
      totalBalance: 0,
      unit: 'KG',
    });
    setEditingItem(null);
    setShowAddItemModal(false);
  };

  // Handle adding new inventory item or updating existing
  const handleAddItem = async () => {
    try {
      // Generate item code if not provided
      const itemCode = newItem.itemCode || generateItemCode();

      // Check for duplicate item codes (only when adding new item or changing code)
      if (!editingItem || (editingItem && editingItem.itemCode !== itemCode)) {
        const isDuplicate = inventoryItems.some(item => 
          item.itemCode.toLowerCase() === itemCode.toLowerCase() && item.id !== editingItem?.id
        );
        
        if (isDuplicate) {
          alert(`Item code "${itemCode}" already exists! Please use a different code or leave it empty for auto-generation.`);
          return;
        }
      }

      let inventoryItemData;

      if (editingItem) {
        // EDITING: Opening Balance works as an adjustment (adds/subtracts from current)
        const adjustment = newItem.openingBalance || 0;
        
        inventoryItemData = {
          itemCode,
          itemName: newItem.itemName,
          openingBalance: editingItem.openingBalance, // Keep original opening balance, don't change it
          inBalance: (editingItem.inBalance || 0) + adjustment,
          outBalance: editingItem.outBalance || 0,
          availableQuantity: ((editingItem.inBalance || 0) + adjustment) - (editingItem.outBalance || 0),
          totalBalance: ((editingItem.inBalance || 0) + adjustment) - (editingItem.outBalance || 0),
          unit: newItem.unit,
          shipmentDate: new Date().toISOString().split('T')[0],
        };
      } else {
        // NEW ITEM: Opening Balance sets initial stock
        inventoryItemData = {
          itemCode,
          itemName: newItem.itemName,
          openingBalance: newItem.openingBalance,
          inBalance: newItem.openingBalance,
          outBalance: 0,
          availableQuantity: newItem.openingBalance,
          totalBalance: newItem.openingBalance,
          unit: newItem.unit,
          shipmentDate: new Date().toISOString().split('T')[0],
        };
      }

      if (editingItem) {
        // Update existing item
        await updateInventoryItem(editingItem.id, inventoryItemData);
        
        // Create adjustment record if there was an adjustment
        const adjustment = newItem.openingBalance || 0;
        if (adjustment !== 0) {
          const user = getCurrentUser();
          const previousBalance = editingItem.availableQuantity || 0;
          const newBalance = previousBalance + adjustment;
          
          await addInventoryAdjustment({
            itemCode: editingItem.itemCode,
            itemName: editingItem.itemName,
            adjustmentQuantity: adjustment,
            previousBalance: previousBalance,
            newBalance: newBalance,
            unit: newItem.unit,
            reason: 'Manual adjustment via inventory edit',
            adjustedBy: user?.id || 'unknown',
            adjustedByName: user?.fullName || 'System',
            adjustmentDate: new Date().toISOString().split('T')[0],
          });
          
          // Refresh adjustments list
          const updatedAdjustments = await getInventoryAdjustments();
          setInventoryAdjustments(updatedAdjustments);
        }
        
        alert('Item updated successfully!');
      } else {
        // Add new item to Firebase inventory collection
        await addInventoryItem(inventoryItemData);
        alert('Item added successfully!');
      }
      
      // Reset form and close modal
      handleCloseModal();
    } catch (error) {
      console.error('Error saving inventory item:', error);
      alert('Failed to save inventory item. Please try again.');
    }
  };

  // Handle editing an item
  const handleEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setNewItem({
      itemCode: item.itemCode,
      itemName: item.itemName,
      openingBalance: 0, // Reset to 0 so user can enter adjustment amount
      availableQuantity: item.availableQuantity || item.openingBalance,
      inBalance: item.inBalance || 0,
      outBalance: item.outBalance || 0,
      totalBalance: item.totalBalance || item.openingBalance,
      unit: item.unit,
    });
    setShowAddItemModal(true);
  };

  // Handle deleting an item
  const handleDeleteItem = async (item: InventoryItem) => {
    const confirmDelete = confirm(
      `Are you sure you want to delete "${item.itemName}" (${item.itemCode})?\n\nThis action cannot be undone.`
    );
    
    if (!confirmDelete) return;
    
    try {
      await deleteInventoryItem(item.id);
      alert('Item deleted successfully!');
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  // Excel download function - downloads based on current view level
  const downloadExcel = () => {
    if (activeTab === 'inventory') {
      if (filteredItems.length === 0) {
        alert('No items to download');
        return;
      }

      let headers: string[];
      let csvRows: string[];
      let filename: string;

      // Level 3: Transaction Details for Selected Product and Month
      if (selectedItemName && selectedItemMonth) {
        const transactions = getTransactionsForItemAndMonth(selectedItemName, selectedItemMonth);
        const monthName = new Date(selectedItemMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        
        headers = ['Item Code', 'Item Name', 'Type', 'Party', 'Reference', 'In Quantity', 'Out Quantity', 'Available Quantity', 'Total Balance', 'Unit', 'Date'];
        csvRows = [headers.join(',')];
        
        const itemRecords = inventoryItems.filter(i => i.itemName.toLowerCase().trim() === selectedItemName.toLowerCase().trim());
        const firstItem = itemRecords[0];
        
        transactions.forEach(transaction => {
          const transactionsUpToNow = getProductTransactions(selectedItemName).filter(t => 
            new Date(t.date) <= new Date(transaction.date)
          );
          
          // Calculate cumulative quantities
          const cumulativeInQty = transactionsUpToNow
            .filter(t => (t.quantity || 0) > 0)
            .reduce((sum, t) => sum + (t.quantity || 0), 0);
          
          const cumulativeOutQty = Math.abs(transactionsUpToNow
            .filter(t => (t.quantity || 0) < 0)
            .reduce((sum, t) => sum + (t.quantity || 0), 0));
          
          const availableQty = cumulativeInQty - cumulativeOutQty;
          
          // Calculate stock value = Available Quantity × Average Rate
          const avgRate = getAverageRate(selectedItemName);
          const stockValue = availableQty * avgRate;
          
          // Format transaction type for CSV
          let transactionTypeLabel = transaction.type;
          if (transaction.type === 'invoice') {
            transactionTypeLabel = 'Sale';
          } else if (transaction.type === 'purchase') {
            transactionTypeLabel = 'Purchase';
          } else if (transaction.type === 'credit_note') {
            transactionTypeLabel = 'Credit Note';
          } else if (transaction.type === 'debit_note') {
            transactionTypeLabel = 'Debit Note';
          } else if (transaction.type === 'adjustment') {
            transactionTypeLabel = 'Stock Adjustment';
          } else if (transaction.type === 'opening_balance') {
            transactionTypeLabel = 'Opening Balance';
          }
          
          const row = [
            `"${firstItem?.itemCode || 'N/A'}"`,
            `"${selectedItemName}"`,
            `"${transactionTypeLabel}"`,
            `"${transaction.party}"`,
            `"${transaction.reference}"`,
            formatKenyanNumber(cumulativeInQty),
            formatKenyanNumber(cumulativeOutQty),
            formatKenyanNumber(availableQty),
            `"KSH ${formatKenyanNumber(stockValue)}"`,
            `"${firstItem?.unit || 'KG'}"`,
            new Date(transaction.date).toLocaleDateString()
          ];
          csvRows.push(row.join(','));
        });
        
        filename = `inventory_${selectedItemName.replace(/\s+/g, '_')}_${monthName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      }
      // Level 2: Month-wise for Selected Product
      else if (selectedItemName) {
        const months = getMonthsForItem(selectedItemName);
        
        headers = ['Month', 'In Quantity', 'Out Quantity', 'Available Quantity', 'Total Balance'];
        csvRows = [headers.join(',')];
        
        months.forEach(monthData => {
          const availableQty = monthData.availableQuantity;
          
          // Calculate stock value for this month
          const avgRate = getAverageRate(selectedItemName);
          const stockValue = availableQty * avgRate;
          
          const row = [
            `"${monthData.monthDisplay}"`,
            formatKenyanNumber(monthData.monthInQuantity),
            formatKenyanNumber(monthData.monthOutQuantity),
            formatKenyanNumber(availableQty),
            `"KSH ${formatKenyanNumber(stockValue)}"`
          ];
          csvRows.push(row.join(','));
        });
        
        filename = `inventory_${selectedItemName.replace(/\s+/g, '_')}_monthly_${new Date().toISOString().split('T')[0]}.csv`;
      }
      // Level 1: All Products Summary
      else {
        headers = ['Item Code', 'Product Name', 'In Quantity', 'Out Quantity', 'Available Quantity', 'Total Balance', 'Unit'];
        csvRows = [headers.join(',')];
        
        const distinctItems = getDistinctItemNames();
        
        distinctItems.forEach(item => {
          // Get monthly aggregations to include all transactions
          const months = getMonthsForItem(item.itemName);
          
          // Sum all monthly IN quantities
          const inQuantity = months.reduce((sum, m) => sum + m.monthInQuantity, 0);
          
          // Sum all monthly OUT quantities
          const outQuantity = months.reduce((sum, m) => sum + m.monthOutQuantity, 0);
          
          // Get the last month's cumulative available quantity
          const lastMonthWithData = [...months].reverse().find(m => m.transactionCount > 0);
          const availableQty = lastMonthWithData ? lastMonthWithData.availableQuantity : 0;
          
          // Calculate stock value = Available Quantity × Average Rate
          const stockValue = getStockValue(item.itemName);
          
          const firstItem = filteredItems.find(i => i.itemName.toLowerCase().trim() === item.itemName.toLowerCase().trim());

          const row = [
            `"${firstItem?.itemCode || 'N/A'}"`,
            `"${item.itemName}"`,
            formatKenyanNumber(inQuantity),
            formatKenyanNumber(outQuantity),
            formatKenyanNumber(availableQty),
            `"KSH ${formatKenyanNumber(stockValue)}"`,
            `"${item.latestUnit}"`
          ];
          csvRows.push(row.join(','));
        });
        
        filename = `inventory_all_products_${new Date().toISOString().split('T')[0]}.csv`;
      }

      // Create blob and download
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } else {
      // Dump/Wastage download
      if (filteredWastage.length === 0) {
        alert('No wastage entries to download');
        return;
      }

      const headers = ['Voucher Number', 'Supplier', 'Date', 'Process Stage', 'Loss (KG)', 'Loss %', 'Loss Money (KSH)', 'Operator', 'Notes'];
      const csvRows = [headers.join(',')];
      
      filteredWastage.forEach((entry, index) => {
        const voucherNumber = `V${String(index + 1).padStart(3, '0')}`;
        const row = [
          `"${voucherNumber}"`,
          `"${entry.supplier}"`,
          new Date(entry.shipmentDate).toLocaleDateString(),
          `"Stage ${entry.stageNumber}: ${entry.processStage}"`,
          formatKenyanNumber(entry.lossKg),
          formatKenyanNumber(entry.lossPercent),
          formatKenyanNumber(entry.lossMoney),
          `"${entry.operator || '-'}"`,
          `"${entry.notes || '-'}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `wastage_report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - Hide when in side panel */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Package className="w-8 h-8 text-primary" />
              </div>
              Inventory Management
            </h1>
            <p className="text-muted mt-2">
              Track all sorted materials and wastage from processing stages
            </p>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm transition-all ${
            activeTab === 'inventory'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Package className="w-4 h-4" />
          Inventory Items
        </button>
        <button
          onClick={() => setActiveTab('dump')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm transition-all ${
            activeTab === 'dump'
              ? 'bg-white text-red-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Dump / Wastage
        </button>
      </div>

      {/* Summary Cards */}
      {activeTab === 'inventory' ? (
        <>
          {/* Info Banner - Explain Cumulative Tracking */}
          {getDistinctItemNames().length > 0 && selectedItemName && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">
                    📊 Cumulative Inventory Tracking
                  </h4>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    The quantities shown are <strong>cumulative totals up to each month</strong>. 
                    Each month displays the running total of all purchases (In) and sales (Out) from the beginning up to that point in time.
                    If all months show the same values, it means there are no transactions yet or all transactions occurred in the same month.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4 elev-1">
            <p className="text-sm text-muted mb-1">Unique Items</p>
            <p className="text-2xl font-bold text-text">{uniqueItemCount}</p>
            <p className="text-xs text-muted mt-1">Different item types</p>
          </div>
          <div className="card p-4 elev-1">
            <p className="text-sm text-muted mb-1">Available Quantity</p>
            <p className={`text-2xl font-bold ${totalAvailableQuantity < 0 ? 'text-red-600' : ''}`} style={totalAvailableQuantity >= 0 ? { color: '#10b981' } : {}}>
              {formatKenyanNumber(totalAvailableQuantity)} KG
            </p>
            <p className="text-xs text-muted mt-1">{totalAvailableQuantity < 0 ? 'Oversold' : 'Currently in stock'}</p>
          </div>
          <div className="card p-4 elev-1">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <p className="text-sm text-muted">Stock Value</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              KSh {formatKenyanNumber(totalBalance)}
            </p>
            <p className="text-xs text-muted mt-1">Qty × Rate</p>
          </div>
        </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4 elev-1">
            <p className="text-sm text-muted mb-1">Total Wastage Entries</p>
            <p className="text-2xl font-bold text-red-600">{filteredWastage.length}</p>
            <p className="text-xs text-muted mt-1">Across all processes</p>
          </div>
          <div className="card p-4 elev-1">
            <p className="text-sm text-muted mb-1">Total Wastage Weight</p>
            <p className="text-2xl font-bold text-orange-600">{formatKenyanNumber(totalWastageWeight)} KG</p>
            <p className="text-xs text-muted mt-1">Avg: {formatKenyanNumber(avgWastagePercent)}% loss</p>
          </div>
          <div className="card p-4 elev-1">
            <p className="text-sm text-muted mb-1">Total Loss Value</p>
            <p className="text-2xl font-bold text-red-700">KSH {formatKenyanNumber(totalWastageMoney)}</p>
            <p className="text-xs text-muted mt-1">Financial impact</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 elev-1">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </h3>
          <div className="flex items-center gap-2">
            {activeTab === 'inventory' && (
              <button
                onClick={() => setShowAddItemModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-sm rounded-lg transition-smooth hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            )}
            <button
              onClick={downloadExcel}
              disabled={(activeTab === 'inventory' && filteredItems.length === 0) || (activeTab === 'dump' && filteredWastage.length === 0)}
              className="flex items-center gap-2 px-3 py-1.5 text-white text-sm rounded-lg transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#10b981' }}
              onMouseEnter={(e) => {
                const hasData = (activeTab === 'inventory' && filteredItems.length > 0) || (activeTab === 'dump' && filteredWastage.length > 0);
                if (hasData) e.currentTarget.style.backgroundColor = '#059669';
              }}
              onMouseLeave={(e) => {
                const hasData = (activeTab === 'inventory' && filteredItems.length > 0) || (activeTab === 'dump' && filteredWastage.length > 0);
                if (hasData) e.currentTarget.style.backgroundColor = '#10b981';
              }}
            >
              <Download className="w-4 h-4" />
              Download Excel
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {/* Search - Reduced width */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 mr-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={activeTab === 'inventory' 
                ? "     Search by item code, name, supplier, or shipment ID..."
                : "     Search by process stage, supplier, shipment ID, or operator..."}
              className="w-full pl-16 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth text-sm"
            />
          </div>

          {/* Process Filter (Dump Tab Only) */}
          {activeTab === 'dump' && (
            <div className="flex items-center gap-4 max-w-xl">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Process Stage:</label>
              <select
                value={processFilter}
                onChange={(e) => setProcessFilter(e.target.value)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth text-sm"
              >
                <option value="all">All Stages</option>
                <option value="1">Stage 1: Sorting</option>
                <option value="2">Stage 2: Crushing</option>
                <option value="3">Stage 3: Washing</option>
                <option value="4">Stage 4: Pelleting</option>
              </select>
            </div>
          )}

          {/* Date Filter Row - Compact with reduced width */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Date:</span>
            <div className="flex items-center gap-3">
              <div className="w-40">
                <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth text-sm"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs text-gray-600 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth text-sm"
                />
              </div>
              {(startDate || endDate || (activeTab === 'dump' && processFilter !== 'all')) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    if (activeTab === 'dump') setProcessFilter('all');
                  }}
                  className="px-4 py-2 text-sm text-primary hover:text-primary-dark underline whitespace-nowrap self-end font-medium"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Area - Inventory or Wastage */}
      {activeTab === 'inventory' ? (
        // Inventory Items Hierarchical View
        <div className="card elev-1 overflow-hidden">
          {/* Breadcrumb Navigation */}
          {(selectedItemName || selectedItemMonth) && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-sm">
              <button
                onClick={() => {
                  setSelectedItemName(null);
                  setSelectedItemMonth(null);
                }}
                className="text-primary hover:underline font-medium"
              >
                All Items
              </button>
              {selectedItemName && (
                <>
                  <span className="text-gray-400">/</span>
                  <button
                    onClick={() => setSelectedItemMonth(null)}
                    className="text-primary hover:underline font-medium"
                  >
                    {selectedItemName}
                  </button>
                </>
              )}
              {selectedItemMonth && (
                <>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-700 font-medium">
                    {new Date(selectedItemMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Level 1: Product-wise Total Details */}
          {!selectedItemName && (
            <>
              {getDistinctItemNames().length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="w-16 h-16 text-muted mx-auto mb-4" />
                  <p className="text-lg font-medium text-text">No inventory items found</p>
                  <p className="text-sm text-muted mt-2">
                    {inventoryItems.length === 0 
                      ? 'Add your first inventory item to get started'
                      : 'Try adjusting your search filters'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Item Code</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Product Name</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">In Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Out Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Available Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Stock Value</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Unit</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getDistinctItemNames().map((item, idx) => {
                        const firstItem = filteredItems.find(i => i.itemName.toLowerCase().trim() === item.itemName.toLowerCase().trim());
                        
                        // Get monthly aggregations to include all transactions (adjustments, purchases, sales, etc.)
                        const months = getMonthsForItem(item.itemName);
                        
                        // Sum all monthly IN quantities
                        const inQuantity = months.reduce((sum, m) => sum + m.monthInQuantity, 0);
                        
                        // Sum all monthly OUT quantities
                        const outQuantity = months.reduce((sum, m) => sum + m.monthOutQuantity, 0);
                        
                        // Get the last month's cumulative available quantity
                        const lastMonthWithData = [...months].reverse().find(m => m.transactionCount > 0);
                        const availableQty = lastMonthWithData ? lastMonthWithData.availableQuantity : 0;
                        
                        // Get stock value (Available Quantity × Average Rate)
                        const stockValue = getStockValue(item.itemName);
                        
                        return (
                          <tr 
                            key={idx} 
                            className="hover:bg-blue-50 transition-colors"
                          >
                            <td className="px-4 py-3 text-center">
                              <p className="text-sm font-semibold text-primary">{firstItem?.itemCode || 'N/A'}</p>
                            </td>
                            <td 
                              className="px-4 py-3 text-center cursor-pointer"
                              onClick={() => setSelectedItemName(item.itemName)}
                            >
                              <p className="font-semibold text-text hover:text-blue-600">{item.itemName}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-green-600">{formatKenyanNumber(inQuantity)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-red-600">{formatKenyanNumber(outQuantity)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-blue-600">{formatKenyanNumber(availableQty)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-bold text-emerald-600">
                                KSH {formatKenyanNumber(stockValue)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="text-sm text-text">{item.latestUnit}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (firstItem) {
                                    handleEditItem(firstItem);
                                  }
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit item code/name"
                                disabled={!firstItem}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Level 2: Month-wise Transaction Details for Selected Product */}
          {selectedItemName && !selectedItemMonth && (
            <>
              {getMonthsForItem(selectedItemName).length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="w-16 h-16 text-muted mx-auto mb-4" />
                  <p className="text-lg font-medium text-text">No transactions found for {selectedItemName}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Month</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">In Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Out Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Available Quantity</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Stock Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getMonthsForItem(selectedItemName).map((monthData, idx) => {
                        // Use the cumulative available quantity
                        const availableQty = monthData.availableQuantity;
                        
                        // Calculate stock value for this month's cumulative available quantity
                        const avgRate = getAverageRate(selectedItemName);
                        const stockValue = availableQty * avgRate;
                        
                        return (
                          <tr 
                            key={idx} 
                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedItemMonth(monthData.month)}
                          >
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-text">{monthData.monthDisplay}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-green-600">{formatKenyanNumber(monthData.monthInQuantity)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-red-600">{formatKenyanNumber(monthData.monthOutQuantity)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-blue-600">{formatKenyanNumber(availableQty)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-bold text-emerald-600">
                                KSH {formatKenyanNumber(stockValue)}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Level 3: Transaction Details for Selected Product and Month */}
          {selectedItemName && selectedItemMonth && (
            <>
              {(() => {
                const transactions = getTransactionsForItemAndMonth(selectedItemName, selectedItemMonth);
                // Get all inventory items for this product to determine opening balance
                const productItems = filteredItems.filter(item => 
                  item.itemName.toLowerCase().trim() === selectedItemName.toLowerCase().trim()
                );
                const firstItem = productItems[0];
                
                return transactions.length === 0 ? (
                  <div className="p-12 text-center">
                    <Package className="w-16 h-16 text-muted mx-auto mb-4" />
                    <p className="text-lg font-medium text-text">No transactions found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface">
                        <tr className="border-b border-gray-200">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Transaction Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Invoice Number</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Qty Change</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Available Qty</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Amount Change</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(() => {
                          // Calculate running balances (newest to oldest, so reverse the calculation)
                          // Start from the end since transactions are sorted newest first
                          const reversedTransactions = [...transactions].reverse();
                          let runningQty = 0;
                          let runningBalance = 0;
                          
                          // Calculate all running values first
                          const transactionsWithRunning = reversedTransactions.map((transaction) => {
                            const transactionQty = transaction.quantity || 0;
                            const transactionCredit = transaction.credit || 0;
                            const transactionDebit = transaction.debit || 0;
                            
                            runningQty += transactionQty;
                            runningBalance += (transactionCredit - transactionDebit);
                            
                            return {
                              ...transaction,
                              runningQty,
                              runningBalance
                            };
                          });
                          
                          // Reverse back to newest first for display
                          return transactionsWithRunning.reverse().map((transaction, idx) => {
                            const transactionQty = transaction.quantity || 0;
                            const transactionAmount = transaction.credit || transaction.debit;
                            const isCredit = transaction.credit > 0;
                            
                            let typeLabel = '';
                            let typeColor = '';
                            
                            if (transaction.type === 'invoice') {
                              typeLabel = 'Sale';
                              typeColor = 'text-red-600';
                            } else if (transaction.type === 'purchase') {
                              typeLabel = 'Purchase';
                              typeColor = 'text-green-600';
                            } else if (transaction.type === 'credit_note') {
                              typeLabel = 'Credit Note';
                              typeColor = 'text-blue-600';
                            } else if (transaction.type === 'debit_note') {
                              typeLabel = 'Debit Note';
                              typeColor = 'text-orange-600';
                            } else if (transaction.type === 'adjustment') {
                              typeLabel = 'Adjustment';
                              typeColor = 'text-purple-600';
                            } else if (transaction.type === 'opening_balance') {
                              typeLabel = 'Opening Balance';
                              typeColor = 'text-gray-600';
                            }
                            
                            return (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <p className="text-sm text-gray-900">
                                    {new Date(transaction.date).toLocaleDateString('en-GB')}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className={`text-sm font-semibold ${typeColor}`}>{typeLabel}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {transaction.reference && transaction.reference.toUpperCase().includes('PELLETING') 
                                      ? 'PELLETING' 
                                      : transaction.reference}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">{transaction.party}</p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <p className={`text-sm font-semibold ${
                                    transactionQty > 0 ? 'text-green-600' : 
                                    transactionQty < 0 ? 'text-red-600' : 'text-gray-500'
                                  }`}>
                                    {transactionQty > 0 ? '+' : ''}{formatKenyanNumber(transactionQty)} {firstItem?.unit || 'KG'}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <p className={`text-sm font-bold ${
                                    transaction.runningQty < 0 ? 'text-red-600' : 'text-blue-600'
                                  }`}>
                                    {formatKenyanNumber(transaction.runningQty)} {firstItem?.unit || 'KG'}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <p className={`text-sm font-semibold ${
                                    isCredit ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {isCredit ? '+' : '-'}KSH {formatKenyanNumber(transactionAmount)}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <p className={`text-sm font-bold ${
                                    transaction.runningBalance >= 0 ? 'text-emerald-600' : 'text-red-600'
                                  }`}>
                                    KSH {formatKenyanNumber(transaction.runningBalance)}
                                  </p>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      ) : (
        // Wastage/Dump Hierarchical View
        <div className="card elev-1 overflow-hidden">
          {/* Breadcrumb Navigation */}
          {(selectedWastageStage || selectedWastageMonth) && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-sm">
              <button
                onClick={() => {
                  setSelectedWastageStage(null);
                  setSelectedWastageMonth(null);
                }}
                className="text-primary hover:underline font-medium"
              >
                All Process Stages
              </button>
              {selectedWastageStage && (
                <>
                  <span className="text-gray-400">/</span>
                  <button
                    onClick={() => setSelectedWastageMonth(null)}
                    className="text-primary hover:underline font-medium"
                  >
                    {getWastageByStage().find(s => s.stageNumber.toString() === selectedWastageStage)?.stageName || 'Stage'}
                  </button>
                </>
              )}
              {selectedWastageMonth && (
                <>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-700 font-medium">
                    {new Date(selectedWastageMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Waste Summary Cards */}
          {!selectedWastageStage && filteredWastage.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 border-b border-gray-200">
              <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Total Waste</p>
                    <p className="text-2xl font-bold text-red-600 mt-2">
                      {formatKenyanNumber(filteredWastage.reduce((sum, entry) => sum + entry.lossKg, 0))} KG
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-lg">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Total Sold</p>
                    <p className="text-2xl font-bold text-green-600 mt-2">
                      {formatKenyanNumber(filteredWastage.reduce((sum, entry) => sum + getTotalSoldQuantity(entry.id), 0))} KG
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
                    <p className="text-sm text-gray-600 font-medium">Remaining Waste</p>
                    <p className="text-2xl font-bold text-orange-600 mt-2">
                      {formatKenyanNumber(filteredWastage.reduce((sum, entry) => sum + getRemainingWaste(entry), 0))} KG
                    </p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Package className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Level 1: Process Stage Wise */}
          {!selectedWastageStage && (
            <>
              {getWastageByStage().length === 0 ? (
                <div className="p-12 text-center">
                  <Trash2 className="w-16 h-16 text-muted mx-auto mb-4" />
                  <p className="text-lg font-medium text-text">No wastage entries found</p>
                  <p className="text-sm text-muted mt-2">
                    {allWastageEntries.length === 0 
                      ? 'Wastage will be recorded as processing stages are completed'
                      : 'Try adjusting your filters'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Process Stage</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wider">Total Records</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wider">Total Loss (KG)</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wider">Total Loss Value</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getWastageByStage().map((stage) => (
                        <tr key={stage.stageNumber} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-text">Stage {stage.stageNumber}: {stage.stageName}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm text-gray-600">{stage.totalRecords}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-red-600">{formatKenyanNumber(stage.totalLossKg)} KG</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-red-700">KSH {formatKenyanNumber(stage.totalLossMoney)}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setSelectedWastageStage(stage.stageNumber.toString())}
                              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-smooth"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Level 2: Month-wise Details for Selected Stage */}
          {selectedWastageStage && !selectedWastageMonth && (
            <>
              {getMonthsForWastageStage(parseInt(selectedWastageStage)).length === 0 ? (
                <div className="p-12 text-center">
                  <Trash2 className="w-16 h-16 text-muted mx-auto mb-4" />
                  <p className="text-lg font-medium text-text">No records found for this stage</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Month</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wider">Record Count</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wider">Total Loss (KG)</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wider">Total Loss Value</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getMonthsForWastageStage(parseInt(selectedWastageStage)).map((monthData, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-text">{monthData.monthDisplay}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm text-gray-600">{monthData.recordCount}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-red-600">{formatKenyanNumber(monthData.totalLossKg)} KG</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-semibold text-red-700">KSH {formatKenyanNumber(monthData.totalLossMoney)}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setSelectedWastageMonth(monthData.month)}
                              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-smooth"
                            >
                              View Records
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Level 3: All Waste Records for Selected Stage and Month */}
          {selectedWastageStage && selectedWastageMonth && (
            <>
              {getWastageRecordsForStageAndMonth(parseInt(selectedWastageStage), selectedWastageMonth).length === 0 ? (
                <div className="p-12 text-center">
                  <Trash2 className="w-16 h-16 text-muted mx-auto mb-4" />
                  <p className="text-lg font-medium text-text">No records found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Voucher Number</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Company Name</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Process Stage</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Total Loss (KG)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Sold (KG)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Remaining (KG)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Loss Value (KSH)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getWastageRecordsForStageAndMonth(parseInt(selectedWastageStage), selectedWastageMonth).map((entry, index) => {
                        const soldQty = getTotalSoldQuantity(entry.id);
                        const remaining = getRemainingWaste(entry);
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-center">
                              <p className="font-semibold text-primary">V{String(index + 1).padStart(3, '0')}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="font-medium text-text">{entry.supplier}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="text-sm text-text font-medium">{entry.processStage}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="text-red-600 font-semibold">{formatKenyanNumber(entry.lossKg)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className={`font-semibold ${soldQty > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                {soldQty > 0 ? formatKenyanNumber(soldQty) : '-'}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className={`font-semibold ${remaining > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                {formatKenyanNumber(remaining)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="text-red-700 font-semibold">KSH {formatKenyanNumber(entry.lossMoney)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <p className="text-sm text-muted">
                                {entry.completedAt 
                                  ? new Date(entry.completedAt).toLocaleDateString()
                                  : new Date(entry.shipmentDate).toLocaleDateString()}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleOpenWasteSaleModal(entry)}
                                disabled={remaining <= 0}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-smooth ${
                                  remaining > 0
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                {remaining > 0 ? 'Sell Waste' : 'Sold Out'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-text flex items-center gap-2">
                {editingItem ? (
                  <>
                    <Edit2 className="w-6 h-6 text-blue-600" />
                    Edit Inventory Item
                  </>
                ) : (
                  <>
                    <Plus className="w-6 h-6 text-primary" />
                    Add New Inventory Item
                  </>
                )}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-smooth"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Item Code */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Item Code <span className="text-gray-400 font-normal">(Auto-generated if left empty)</span>
                </label>
                <input
                  type="text"
                  value={newItem.itemCode}
                  onChange={(e) => setNewItem({ ...newItem, itemCode: e.target.value })}
                  placeholder="e.g., ITM-0001"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                />
              </div>

              {/* Item Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newItem.itemName}
                  onChange={(e) => setNewItem({ ...newItem, itemName: e.target.value })}
                  placeholder="e.g., PET Bottles"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                  required
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Unit
                </label>
                <select
                  value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                >
                  <option value="KG">KG</option>
                  <option value="BAGS">BAGS</option>
                  <option value="PCS">PCS</option>
                </select>
              </div>

              {/* Opening Balance / Adjustment */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {editingItem ? 'Adjustment Quantity' : 'Opening Balance (KG)'}
                </label>
                <input
                  type="number"
                  value={newItem.openingBalance || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string, minus sign, and valid numbers (including negatives)
                    if (value === '' || value === '-') {
                      setNewItem({ ...newItem, openingBalance: 0 });
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setNewItem({ ...newItem, openingBalance: numValue });
                      }
                    }
                  }}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-smooth"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editingItem 
                    ? 'Enter amount to add (+) or remove (-) from current stock' 
                    : 'Can be positive or negative. Negative values indicate opening deficit.'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-smooth font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-smooth font-medium"
              >
                {editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waste Sale Modal */}
      {showWasteSaleModal && selectedWasteEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text flex items-center gap-2">
                  <DollarSign className="w-6 h-6 text-green-600" />
                  Sell Waste Material
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  From: {selectedWasteEntry.supplier} - {selectedWasteEntry.processStage}
                </p>
              </div>
              <button
                onClick={() => setShowWasteSaleModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-smooth"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Waste Details Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Waste Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Total Waste</p>
                    <p className="font-bold text-gray-900">{formatKenyanNumber(selectedWasteEntry.lossKg)} KG</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Already Sold</p>
                    <p className="font-bold text-green-600">{formatKenyanNumber(getTotalSoldQuantity(selectedWasteEntry.id))} KG</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Remaining</p>
                    <p className="font-bold text-orange-600">{formatKenyanNumber(getRemainingWaste(selectedWasteEntry))} KG</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Loss Value</p>
                    <p className="font-bold text-red-600">KSH {formatKenyanNumber(selectedWasteEntry.lossMoney)}</p>
                  </div>
                </div>
              </div>

              {/* Sale Information */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Quantity to Sell (KG) *
                </label>
                <input
                  type="number"
                  value={wasteSaleForm.quantity}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, quantity: e.target.value })}
                  placeholder="0.00"
                  max={getRemainingWaste(selectedWasteEntry)}
                  step="0.01"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum: {formatKenyanNumber(getRemainingWaste(selectedWasteEntry))} KG
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Rate per KG (KSH) *
                </label>
                <input
                  type="number"
                  value={wasteSaleForm.rate}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, rate: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth"
                />
              </div>

              {/* Total Amount Display */}
              {wasteSaleForm.quantity && wasteSaleForm.rate && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-gray-600">Total Sale Amount</p>
                  <p className="text-2xl font-bold text-green-600">
                    KSH {formatKenyanNumber(parseFloat(wasteSaleForm.quantity) * parseFloat(wasteSaleForm.rate))}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Buyer Name *
                </label>
                <input
                  type="text"
                  value={wasteSaleForm.buyerName}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, buyerName: e.target.value })}
                  placeholder="Enter buyer/company name"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Buyer Contact
                </label>
                <input
                  type="text"
                  value={wasteSaleForm.buyerContact}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, buyerContact: e.target.value })}
                  placeholder="Phone number or email"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sale Date *
                </label>
                <input
                  type="date"
                  value={wasteSaleForm.saleDate}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, saleDate: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Payment Method *
                </label>
                <select
                  value={wasteSaleForm.paymentMethod}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, paymentMethod: e.target.value as 'cash' | 'bank' })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Notes/Remarks
                </label>
                <textarea
                  value={wasteSaleForm.notes}
                  onChange={(e) => setWasteSaleForm({ ...wasteSaleForm, notes: e.target.value })}
                  placeholder="Additional details about the sale..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500/40 focus:border-green-500 outline-none transition-smooth resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowWasteSaleModal(false)}
                className="px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-smooth font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWasteSale}
                className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-smooth font-medium flex items-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Record Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
