import { useState, useEffect } from 'react';
import { Receipt, Plus, Search, Download, Printer, FileText, DollarSign, X, Edit2, Trash2, AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import { Customer } from './CustomerList';
import { Supplier } from './SupplierList';
import { DebitCreditNote, Shipment } from '../types';
import { Invoice } from './InvoiceManagement';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatKenyanNumber, formatInputNumber } from '../utils/numberFormat';
import { InventoryItem, getAllInventoryItems, updateInventoryItem, subscribeToInventoryItems } from '../services/inventoryService';
import { subscribeToInvoices } from '../services/invoiceService';
import { subscribeToDirectPurchases, DirectPurchase } from '../services/directPurchaseService';
import { subscribeToShipments } from '../services/shipmentService';
import { 
  subscribeToDebitCreditNotes, 
  addDebitCreditNote, 
  updateDebitCreditNote, 
  deleteDebitCreditNote 
} from '../services/debitCreditNoteService';
import { deletePaymentTrackingByReference, createDebitCreditNoteTransaction, subscribeToPaymentTransactions } from '../services/paymentTrackingService';
import { PaymentTransaction } from '../types';
import { addTransaction } from '../services/transactionService';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

interface DebitCreditNotesProps {
  customers: Customer[];
  suppliers: Supplier[];
}

export default function DebitCreditNotes({ customers, suppliers }: DebitCreditNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<DebitCreditNote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [directPurchases, setDirectPurchases] = useState<DirectPurchase[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNote, setEditingNote] = useState<DebitCreditNote | null>(null);
  const [printPreviewNote, setPrintPreviewNote] = useState<DebitCreditNote | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debit' | 'credit'>('all');
  const [filterTransaction, setFilterTransaction] = useState<'all' | 'sale' | 'purchase'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'issued' | 'cancelled' | 'paid'>('all');
  const [saving, setSaving] = useState(false);
  const [itemCodeErrors, setItemCodeErrors] = useState<{[key: number]: string}>({});
  const [quantityErrors, setQuantityErrors] = useState<{[key: number]: string}>({});
  const [itemCodeSearchTerms, setItemCodeSearchTerms] = useState<Record<number, string>>({});
  const [showItemCodeDropdowns, setShowItemCodeDropdowns] = useState<Record<number, boolean>>({});

  const [formData, setFormData] = useState({
    noteType: 'credit' as 'debit' | 'credit',
    transactionType: 'sale' as 'sale' | 'purchase',
    date: new Date().toISOString().split('T')[0],
    partyName: '',
    originalInvoiceNumber: '',
    reason: '',
    items: [{ itemCode: '', description: '', quantity: '' as string | number, rate: '' as string | number, amount: 0, _originalQuantity: undefined as number | undefined }],
    tax: 16 as string | number,
    status: 'issued' as 'draft' | 'issued' | 'cancelled' | 'paid',
    remarks: '',
  });

  // Subscribe to inventory items from Firebase for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToInventoryItems(
      (items) => {
        setInventoryItems(items);
        console.log(`✓ Inventory updated: ${items.length} items loaded`);
        items.forEach(item => {
          console.log(`  - ${item.itemCode}: Available ${item.availableQuantity} ${item.unit}`);
        });
      },
      (error) => {
        console.error('Error subscribing to inventory items:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to credit/debit notes from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToDebitCreditNotes(
      (updatedNotes) => {
        setNotes(updatedNotes);
      },
      (error) => {
        console.error('Error subscribing to credit/debit notes:', error);
      }
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

  // Subscribe to payment transactions from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToPaymentTransactions(
      'all',
      (updatedTransactions) => {
        setPaymentTransactions(updatedTransactions);
      },
      undefined,
      (error) => {
        console.error('Error subscribing to payment transactions:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Generate note number
  const generateNoteNumber = (noteType: 'debit' | 'credit', transactionType: 'sale' | 'purchase') => {
    const prefix = noteType === 'debit' ? 'DN' : 'CN';
    const txPrefix = transactionType === 'sale' ? 'S' : 'P';
    const count = notes.filter(n => n.noteType === noteType && n.transactionType === transactionType).length + 1;
    return `${prefix}-${txPrefix}-${String(count).padStart(4, '0')}`;
  };

  // Calculate cumulative quantity already returned/noted for a specific item on an invoice
  const getCumulativeQuantityForItem = (invoiceNumber: string, itemCode: string, currentNoteId?: string): number => {
    if (!invoiceNumber || !itemCode) return 0;
    
    // Filter notes for the same invoice and item, excluding current note being edited
    const relatedNotes = notes.filter(note => 
      note.originalInvoiceNumber === invoiceNumber &&
      note.id !== currentNoteId && // Exclude current note if editing
      (note.status === 'issued' || note.status === 'paid') // Only count issued/paid notes
    );
    
    // Sum up quantities for this item code across all related notes
    let cumulativeQuantity = 0;
    relatedNotes.forEach(note => {
      const item = note.items.find(i => 
        i.itemCode?.toUpperCase() === itemCode.toUpperCase()
      );
      if (item) {
        const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
        cumulativeQuantity += qty;
      }
    });
    
    return cumulativeQuantity;
  };

  // Calculate item amount
  const calculateItemAmount = (quantity: number, rate: number) => {
    return quantity * rate;
  };

  // Calculate totals
  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
    const taxValue = typeof formData.tax === 'string' ? parseFloat(formData.tax) || 0 : formData.tax;
    const taxAmount = (subtotal * taxValue) / 100;
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
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
      description: inventoryItem.itemName
    };
    setFormData({ ...formData, items: updatedItems });
    setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [itemIndex]: false });
    setItemCodeSearchTerms({ ...itemCodeSearchTerms, [itemIndex]: inventoryItem.itemCode });
    setItemCodeErrors(prev => {
      const next = { ...prev };
      delete next[itemIndex];
      return next;
    });
  };

  // Handle item change
  const handleItemChange = (index: number, field: string, value: string | number) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // If item code is entered, fetch item name from inventory
    if (field === 'itemCode' && typeof value === 'string') {
      setItemCodeSearchTerms({ ...itemCodeSearchTerms, [index]: value });

      if (value.trim()) {
        setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [index]: true });
      } else {
        setShowItemCodeDropdowns({ ...showItemCodeDropdowns, [index]: false });
      }

      const itemCode = value.trim();
      if (itemCode) {
        const inventoryItem = inventoryItems.find(item => item.itemCode.toLowerCase() === itemCode.toLowerCase());
        if (inventoryItem) {
          updatedItems[index].description = inventoryItem.itemName;
          // Clear error for this item
          setItemCodeErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[index];
            return newErrors;
          });
        } else {
          // Show error - item doesn't exist
          setItemCodeErrors(prev => ({
            ...prev,
            [index]: 'Item doesn\'t exist in inventory'
          }));
        }
      } else {
        // Clear error if item code is empty
        setItemCodeErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[index];
          return newErrors;
        });
      }
    }
    
    if (field === 'quantity' || field === 'rate') {
      const qty = typeof updatedItems[index].quantity === 'string' 
        ? parseFloat(updatedItems[index].quantity as string) || 0 
        : updatedItems[index].quantity;
      const rt = typeof updatedItems[index].rate === 'string'
        ? parseFloat(updatedItems[index].rate as string) || 0
        : updatedItems[index].rate;
      updatedItems[index].amount = calculateItemAmount(qty, rt);
      
      // Validate quantity against original invoice quantity if available
      if (field === 'quantity' && formData.originalInvoiceNumber) {
        const originalQty = updatedItems[index]._originalQuantity;
        if (originalQty !== undefined) {
          // Only check cumulative if we have an itemCode, otherwise just check against original
          let cumulativeQty = 0;
          if (updatedItems[index].itemCode) {
            cumulativeQty = getCumulativeQuantityForItem(
              formData.originalInvoiceNumber,
              updatedItems[index].itemCode,
              editingNote?.id
            );
          }
          const totalQty = cumulativeQty + qty;
          const remainingQty = originalQty - cumulativeQty;
          
          if (totalQty > originalQty) {
            setQuantityErrors(prev => ({
              ...prev,
              [index]: `Cannot exceed invoice quantity. Already returned: ${cumulativeQty.toFixed(2)}, Remaining: ${remainingQty.toFixed(2)}, Invoice total: ${originalQty.toFixed(2)}`
            }));
          } else {
            // Clear error if quantity is valid
            setQuantityErrors(prev => {
              const newErrors = { ...prev };
              delete newErrors[index];
              return newErrors;
            });
          }
        }
      }
    }
    
    setFormData({ ...formData, items: updatedItems });
  };

  // Add item row
  const addItemRow = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { itemCode: '', description: '', quantity: '', rate: '', amount: 0, _originalQuantity: undefined }],
    });
  };

  // Remove item row
  const removeItemRow = (index: number) => {
    if (formData.items.length > 1) {
      const updatedItems = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: updatedItems });
    }
  };

  // Get party list based on transaction type
  const getPartyList = () => {
    return formData.transactionType === 'sale' ? customers : suppliers;
  };

  // Helper function to check if an invoice is fully paid
  const isInvoicePaid = (invoiceNumber: string, partyName: string): boolean => {
    // Get all transactions for this invoice and party
    const invoiceTransactions = paymentTransactions.filter(
      t => t.referenceNumber === invoiceNumber && t.partyName === partyName
    );

    if (invoiceTransactions.length === 0) return false;

    // Calculate total invoiced and total paid
    let totalInvoiced = 0;
    let totalPaid = 0;

    invoiceTransactions.forEach(t => {
      if (t.transactionType === 'invoice') {
        totalInvoiced += t.amount;
      } else if (t.transactionType === 'payment') {
        totalPaid += t.amount;
      } else if (t.transactionType === 'adjustment') {
        // Credit notes reduce the amount to receive (negative adjustment)
        // Debit notes increase the amount to pay (positive adjustment for supplier)
        totalPaid += Math.abs(t.amount);
      }
    });

    // Invoice is paid if remaining amount is 0 or less
    const remaining = totalInvoiced - totalPaid;
    return remaining <= 0.01; // Allow small rounding differences
  };

  // Get filtered invoices based on selected party
  const getFilteredInvoices = () => {
    if (!formData.partyName) return [];
    
    // For sales transactions, get invoices from customers
    if (formData.transactionType === 'sale') {
      return invoices
        .filter(invoice => invoice.customerName === formData.partyName)
        .map(invoice => ({
          id: invoice.id,
          number: invoice.manualInvoiceNumber || invoice.systemInvoiceNumber, // Display number
          systemNumber: invoice.systemInvoiceNumber, // System number for linking
          amount: invoice.totalAmount,
          date: invoice.date,
        }));
    } 
    
    // For purchase transactions, get invoices from both shipments AND direct purchases
    if (formData.transactionType === 'purchase') {
      const purchaseInvoices: Array<{id: string; number: string; systemNumber?: string; amount: number; date: string}> = [];
      
      // Add direct purchases for this supplier
      directPurchases
        .filter(purchase => purchase.supplierName === formData.partyName)
        .forEach(purchase => {
          purchaseInvoices.push({
            id: purchase.id || '',
            number: purchase.invoiceNumber,
            systemNumber: purchase.invoiceNumber,
            amount: purchase.totalAmount,
            date: purchase.purchaseDate,
          });
        });
      
      // Add shipments for this supplier
      shipments
        .filter(shipment => shipment.supplier === formData.partyName)
        .forEach(shipment => {
          if (shipment.purchaseInvoiceNumber) {
            purchaseInvoices.push({
              id: shipment.id || '',
              number: shipment.purchaseInvoiceNumber,
              systemNumber: shipment.purchaseInvoiceNumber,
              amount: shipment.totalCost,
              date: shipment.date,
            });
          }
        });
      
      return purchaseInvoices;
    }
    
    return [];
  };

  // Get party details
  const getPartyDetails = (partyName: string) => {
    const party = getPartyList().find(p => p.companyName === partyName);
    if (party) {
      return {
        code: 'customerCode' in party ? party.customerCode : party.supplierCode,
        type: formData.transactionType === 'sale' ? 'customer' as const : 'supplier' as const,
      };
    }
    return { code: '', type: 'customer' as const };
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { subtotal, taxAmount, total } = calculateTotals();
      const partyDetails = getPartyDetails(formData.partyName);

      console.log('=== DEBIT/CREDIT NOTE SUBMIT ===');
      console.log('Is Editing?', !!editingNote);
      console.log('Form Data:', formData);
      console.log('Total:', total);
      console.log('Party Details:', partyDetails);

      // Validate: If status is issued or paid, original invoice number is required for proper linking
      if ((formData.status === 'issued' || formData.status === 'paid') && !formData.originalInvoiceNumber) {
        alert('Please select the original invoice number. This is required to properly link the credit/debit note to the invoice for payment tracking.');
        setSaving(false);
        return;
      }

      // Validate: Check if any quantity exceeds the original invoice quantity
      if (formData.originalInvoiceNumber && (formData.status === 'issued' || formData.status === 'paid')) {
        let hasQuantityError = false;
        const errorMessages: string[] = [];
        
        for (let i = 0; i < formData.items.length; i++) {
          const item = formData.items[i];
          if (!item.itemCode || !item._originalQuantity) continue;
          
          const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
          const cumulativeQty = getCumulativeQuantityForItem(
            formData.originalInvoiceNumber,
            item.itemCode,
            editingNote?.id
          );
          const totalQty = cumulativeQty + qty;
          
          if (totalQty > item._originalQuantity) {
            hasQuantityError = true;
            errorMessages.push(
              `${item.itemCode}: Cannot return ${qty.toFixed(2)} units. Already returned: ${cumulativeQty.toFixed(2)}, Invoice total: ${item._originalQuantity.toFixed(2)}`
            );
          }
        }
        
        if (hasQuantityError) {
          alert('Cannot create/update note - quantities exceed invoice amounts:\n\n' + errorMessages.join('\n'));
          setSaving(false);
          return;
        }
      }

      const noteData: Omit<DebitCreditNote, 'id' | 'createdAt'> = {
        noteNumber: editingNote?.noteNumber || generateNoteNumber(formData.noteType, formData.transactionType),
        noteType: formData.noteType,
        transactionType: formData.transactionType,
        date: formData.date,
        partyType: partyDetails.type,
        partyName: formData.partyName,
        partyCode: partyDetails.code,
        originalInvoiceNumber: formData.originalInvoiceNumber,
        reason: formData.reason,
        items: formData.items.map(item => ({
          itemCode: item.itemCode,
          description: item.description,
          quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity,
          rate: typeof item.rate === 'string' ? parseFloat(item.rate) || 0 : item.rate,
          amount: item.amount
        })),
        subtotal,
        tax: taxAmount,
        totalAmount: total,
        status: formData.status,
        remarks: formData.remarks,
      };

      // Handle inventory updates for editing existing note
      if (editingNote) {
        const oldStatus = editingNote.status;
        const newStatus = formData.status;
        
        console.log(`=== Updating Note: ${editingNote.noteNumber} ===`);
        console.log(`Old Status: ${oldStatus}, New Status: ${newStatus}`);
        
        // Fetch latest inventory
        const latestInventory = await getAllInventoryItems();
        
        // Case 1: Status changed from paid/issued to draft/cancelled - REVERSE all inventory
        if ((oldStatus === 'paid' || oldStatus === 'issued') && (newStatus === 'draft' || newStatus === 'cancelled')) {
          console.log('Reversing inventory changes (paid/issued → draft/cancelled)');
          
          for (const item of editingNote.items) {
            if (!item.itemCode) continue;
            
            const inventoryItem = latestInventory.find(
              inv => inv.itemCode.toUpperCase() === item.itemCode.toUpperCase()
            );
            
            if (inventoryItem) {
              const oldQuantity = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 0;
              const currentInBalance = Number(inventoryItem.inBalance || 0);
              const currentOutBalance = Number(inventoryItem.outBalance || 0);
              
              let newInBalance = currentInBalance;
              let newOutBalance = currentOutBalance;
              
              // Reverse the original operation based on note type
              if (editingNote.noteType === 'debit') {
                // Reverse DEBIT NOTE: Subtract from outBalance (we had added)
                newOutBalance = Math.max(0, currentOutBalance - oldQuantity);
                console.log(`  Reversing Debit Note: Removing ${oldQuantity} from outBalance for ${item.itemCode}`);
              } else if (editingNote.noteType === 'credit') {
                // Reverse CREDIT NOTE: Subtract from inBalance (we had added)
                newInBalance = Math.max(0, currentInBalance - oldQuantity);
                console.log(`  Reversing Credit Note: Removing ${oldQuantity} from inBalance for ${item.itemCode}`);
              }
              
              const newAvailableQuantity = newInBalance - newOutBalance;
              const newTotalBalance = newAvailableQuantity;
              
              await updateInventoryItem(inventoryItem.id, {
                inBalance: newInBalance,
                outBalance: newOutBalance,
                totalBalance: newTotalBalance,
                availableQuantity: newAvailableQuantity
              });
            }
          }
        }
        // Case 2: Status changed from draft/cancelled to paid/issued - APPLY all inventory
        else if ((oldStatus === 'draft' || oldStatus === 'cancelled') && (newStatus === 'paid' || newStatus === 'issued')) {
          console.log('Applying inventory changes (draft/cancelled → paid/issued)');
          
          for (const item of formData.items) {
            if (!item.itemCode) continue;
            
            const inventoryItem = latestInventory.find(
              inv => inv.itemCode.toUpperCase() === item.itemCode.toUpperCase()
            );
            
            if (inventoryItem) {
              const newQuantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
              const currentInBalance = Number(inventoryItem.inBalance || 0);
              const currentOutBalance = Number(inventoryItem.outBalance || 0);
              
              let newInBalance = currentInBalance;
              let newOutBalance = currentOutBalance;
              
              // Apply operation based on note type
              if (formData.noteType === 'debit') {
                // DEBIT NOTE: ADD to outBalance
                newOutBalance = currentOutBalance + newQuantity;
                console.log(`  Applying Debit Note: Adding ${newQuantity} to outBalance for ${item.itemCode}`);
              } else if (formData.noteType === 'credit') {
                // CREDIT NOTE: ADD to inBalance
                newInBalance = currentInBalance + newQuantity;
                console.log(`  Applying Credit Note: Adding ${newQuantity} to inBalance for ${item.itemCode}`);
              }
              
              const newAvailableQuantity = newInBalance - newOutBalance;
              const newTotalBalance = newAvailableQuantity;
              
              await updateInventoryItem(inventoryItem.id, {
                inBalance: newInBalance,
                outBalance: newOutBalance,
                totalBalance: newTotalBalance,
                availableQuantity: newAvailableQuantity
              });
            }
          }
        }
        // Case 3: Status remains paid/issued - UPDATE quantity differences
        else if ((oldStatus === 'paid' || oldStatus === 'issued') && (newStatus === 'paid' || newStatus === 'issued')) {
          console.log('Updating inventory for quantity changes (paid/issued → paid/issued)');
          
          // Create a map of old items for easy lookup
          const oldItemsMap = new Map(editingNote.items.map(item => [
            item.itemCode?.toUpperCase() || '', 
            typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 0
          ]));
          
          for (const newItem of formData.items) {
            if (!newItem.itemCode) continue;
            
            const inventoryItem = latestInventory.find(
              inv => inv.itemCode.toUpperCase() === newItem.itemCode.toUpperCase()
            );
            
            if (inventoryItem) {
              const oldQuantity = oldItemsMap.get(newItem.itemCode.toUpperCase()) || 0;
              const newQuantity = typeof newItem.quantity === 'string' ? parseFloat(newItem.quantity) || 0 : newItem.quantity;
              const quantityDifference = newQuantity - oldQuantity;
              
              if (quantityDifference !== 0) {
                const currentInBalance = Number(inventoryItem.inBalance || 0);
                const currentOutBalance = Number(inventoryItem.outBalance || 0);
                
                let newInBalance = currentInBalance;
                let newOutBalance = currentOutBalance;
                
                // Adjust based on note type
                if (formData.noteType === 'debit') {
                  // DEBIT NOTE: Adjust outBalance
                  newOutBalance = Math.max(0, currentOutBalance + quantityDifference);
                  console.log(`  Adjusting Debit Note ${newItem.itemCode}: old qty ${oldQuantity} → new qty ${newQuantity} (diff: ${quantityDifference})`);
                } else if (formData.noteType === 'credit') {
                  // CREDIT NOTE: Adjust inBalance
                  newInBalance = Math.max(0, currentInBalance + quantityDifference);
                  console.log(`  Adjusting Credit Note ${newItem.itemCode}: old qty ${oldQuantity} → new qty ${newQuantity} (diff: ${quantityDifference})`);
                }
                
                const newAvailableQuantity = newInBalance - newOutBalance;
                const newTotalBalance = newAvailableQuantity;
                
                await updateInventoryItem(inventoryItem.id, {
                  inBalance: newInBalance,
                  outBalance: newOutBalance,
                  totalBalance: newTotalBalance,
                  availableQuantity: newAvailableQuantity
                });
              }
            }
          }
        }
        
        await updateDebitCreditNote(editingNote.id, noteData);
        
        // Handle payment tracking for editing existing note
        // oldStatus and newStatus are already declared above
        
        // For updates: if status changed from draft/cancelled to issued/paid, create payment tracking
        if ((oldStatus === 'draft' || oldStatus === 'cancelled') && (newStatus === 'issued' || newStatus === 'paid')) {
          // Ensure invoice number is set for proper linking
          if (!formData.originalInvoiceNumber) {
            alert('Please select the original invoice number before setting status to issued/paid. This is required for proper payment tracking.');
            setSaving(false);
            return;
          }
          
          if (partyDetails.type === 'customer') {
            const party = customers.find(c => c.companyName === formData.partyName);
            if (party && user) {
              try {
                console.log('Creating payment tracking for status change: draft → issued/paid');
                console.log('Invoice Number:', formData.originalInvoiceNumber);
                await createDebitCreditNoteTransaction(
                  'customer',
                  party.id,
                  party.companyName,
                  party.customerCode,
                  noteData.noteNumber,
                  formData.originalInvoiceNumber,
                  formData.noteType,
                  total,
                  formData.date,
                  user.fullName
                );
              } catch (error) {
                console.error('Error creating payment tracking transaction:', error);
                // Don't fail the note update if payment tracking fails
              }
            }
          } else {
            const party = suppliers.find(s => s.companyName === formData.partyName);
            if (party && user) {
              try {
                console.log('Creating payment tracking for supplier status change: draft → issued/paid');
                console.log('Invoice Number:', formData.originalInvoiceNumber);
                await createDebitCreditNoteTransaction(
                  'supplier',
                  party.id,
                  party.companyName,
                  party.supplierCode,
                  noteData.noteNumber,
                  formData.originalInvoiceNumber,
                  formData.noteType,
                  total,
                  formData.date,
                  user.fullName
                );
              } catch (error) {
                console.error('Error creating payment tracking transaction:', error);
                // Don't fail the note update if payment tracking fails
              }
            }
          }
        }
        // If status changed from issued/paid to draft/cancelled, delete payment tracking AND transaction
        else if ((oldStatus === 'issued' || oldStatus === 'paid') && (newStatus === 'draft' || newStatus === 'cancelled')) {
          try {
            await deletePaymentTrackingByReference(editingNote.noteNumber);
            
            // Delete transaction entry
            const transactionsRef = collection(db, 'transactions');
            const allTransactionsSnapshot = await getDocs(transactionsRef);
            
            for (const docSnap of allTransactionsSnapshot.docs) {
              const data = docSnap.data();
              if ((data.source === 'debit_credit_note' || data.paymentMethod === 'DB Note' || data.paymentMethod === 'CR Note') &&
                  data.description && data.description.includes(editingNote.noteNumber)) {
                await deleteDoc(docSnap.ref);
                console.log('✓ Deleted transaction entry for status change to draft/cancelled');
              }
            }
          } catch (error) {
            console.error('Error deleting payment tracking:', error);
          }
        }
        // If status remains issued/paid but amount changed, update the transaction
        else if ((oldStatus === 'issued' || oldStatus === 'paid') && (newStatus === 'issued' || newStatus === 'paid')) {
          const oldTotal = editingNote.totalAmount;
          if (Math.abs(oldTotal - total) > 0.01) {
            console.log(`Amount changed from ${oldTotal} to ${total}, updating transaction`);
            try {
              const transactionsRef = collection(db, 'transactions');
              const allTransactionsSnapshot = await getDocs(transactionsRef);
              
              for (const docSnap of allTransactionsSnapshot.docs) {
                const data = docSnap.data();
                if ((data.source === 'debit_credit_note' || data.paymentMethod === 'DB Note' || data.paymentMethod === 'CR Note') &&
                    data.description && data.description.includes(editingNote.noteNumber)) {
                  // Update the amount
                  await updateDoc(docSnap.ref, { amount: total });
                  console.log('✓ Updated transaction amount');
                }
              }
              
              // Also update payment tracking amount if needed
              // The payment tracking service handles this through subscriptions
            } catch (error) {
              console.error('Error updating transaction amount:', error);
            }
          }
        }
      } else {
        // Creating new note
        const newNoteNumber = noteData.noteNumber;
        await addDebitCreditNote(noteData);
        
        // Create payment tracking transaction for new notes (issued or paid status)
        console.log('=== Creating Payment Tracking for New Note ===');
        console.log('Status:', noteData.status);
        console.log('Party Type:', partyDetails.type);
        console.log('Party Name:', formData.partyName);
        console.log('Original Invoice:', formData.originalInvoiceNumber);
        console.log('Note Number:', newNoteNumber);
        console.log('Note Type:', formData.noteType);
        console.log('Total Amount:', total);
        
        if ((noteData.status === 'issued' || noteData.status === 'paid')) {
          if (partyDetails.type === 'customer') {
            const party = customers.find(c => c.companyName === formData.partyName);
            console.log('Found customer:', party);
            if (party && user) {
              try {
                console.log('Calling createDebitCreditNoteTransaction for customer...');
                const transactionId = await createDebitCreditNoteTransaction(
                  'customer',
                  party.id,
                  party.companyName,
                  party.customerCode,
                  newNoteNumber,
                  formData.originalInvoiceNumber,
                  formData.noteType,
                  total,
                  formData.date,
                  user.fullName
                );
                console.log('✓ Payment tracking transaction created with ID:', transactionId);
              } catch (error) {
                console.error('✗ Error creating payment tracking transaction:', error);
              }
            } else {
              console.log('✗ Missing party or user:', { hasParty: !!party, hasUser: !!user });
            }
          } else {
            const party = suppliers.find(s => s.companyName === formData.partyName);
            console.log('Found supplier:', party);
            if (party && user) {
              try {
                console.log('Calling createDebitCreditNoteTransaction for supplier...');
                const transactionId = await createDebitCreditNoteTransaction(
                  'supplier',
                  party.id,
                  party.companyName,
                  party.supplierCode,
                  newNoteNumber,
                  formData.originalInvoiceNumber,
                  formData.noteType,
                  total,
                  formData.date,
                  user.fullName
                );
                console.log('✓ Payment tracking transaction created with ID:', transactionId);
              } catch (error) {
                console.error('✗ Error creating payment tracking transaction:', error);
              }
            } else {
              console.log('✗ Missing party or user:', { hasParty: !!party, hasUser: !!user });
            }
          }
        } else {
          console.log('✗ Note status is not issued/paid, skipping payment tracking');
        }
        
        // Create basic accounting transaction ONLY if note status is issued or paid
        if (noteData.status === 'issued' || noteData.status === 'paid') {
          try {
            // Determine category based on transaction type
            let category = '';
            if (formData.transactionType === 'sale') {
              category = 'Product Sales'; // Sales through credit/debit notes
            } else {
              category = 'Material Purchase'; // Purchases through credit/debit notes
            }

            // Create transaction entry in basic accounting
            // DEBIT NOTE (Return to Supplier): REDUCES expense (we get money back)
            // DEBIT NOTE (Return to Supplier): Reduces expense (credit entry)
            // CREDIT NOTE (Return from Customer): Reduces income (debit entry - it's a LOSS)
            await addTransaction({
              id: Date.now().toString(),
              date: formData.date,
              description: `${formData.noteType === 'credit' ? 'Credit' : 'Debit'} Note: ${formData.items.map(i => i.description).join(', ')} - ${formData.partyName} (${newNoteNumber})`,
              // Debit Note: 'credit' type (reduces expense)
              // Credit Note: 'debit' type (it's a loss - reduces income)
              type: formData.noteType === 'debit' ? 'credit' : 'debit',
              amount: total,
              category: category,
              paymentMethod: formData.noteType === 'debit' ? 'DB Note' : 'CR Note',
              senderName: formData.transactionType === 'purchase' ? formData.partyName : undefined,
              receiverName: formData.transactionType === 'sale' ? formData.partyName : undefined,
              source: 'debit_credit_note', // Track source for filtering
              noteNumber: newNoteNumber, // Add note number for easy identification
            });
            console.log(`✓ Basic accounting transaction created for ${formData.noteType} note`);
          } catch (error) {
            console.error('Error creating basic accounting transaction:', error);
            // Don't fail the note creation if basic accounting fails
          }
        }
        
        // Update inventory ONLY if note status is issued or paid (not draft or cancelled)
        if (noteData.status === 'issued' || noteData.status === 'paid') {
          console.log(`=== Creating New Note with status: ${noteData.status} ===`);
          console.log('Applying inventory changes...');
          
          const latestInventory = await getAllInventoryItems();
          
          for (const item of formData.items) {
            if (!item.itemCode) continue;
            
            const inventoryItem = latestInventory.find(
              inv => inv.itemCode.toUpperCase() === item.itemCode.toUpperCase()
            );
            
            if (inventoryItem) {
              const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
              const currentInBalance = Number(inventoryItem.inBalance || 0);
              const currentOutBalance = Number(inventoryItem.outBalance || 0);
              
              let newInBalance = currentInBalance;
              let newOutBalance = currentOutBalance;
              
              // CORRECT LOGIC:
              // DEBIT NOTE (Return to Supplier): Increases outBalance (stock going out)
              //   - inBalance stays same (original purchase amount)
              //   - outBalance increases (returned to supplier)
              //   - availableQuantity decreases (less stock available)
              // CREDIT NOTE (Return from Customer): Increases inBalance (stock coming back)
              //   - inBalance increases (returned from customer)
              //   - outBalance stays same (original sale amount)
              //   - availableQuantity increases (more stock available)
              if (formData.noteType === 'debit') {
                // DEBIT NOTE: Increase outBalance (return to supplier)
                newOutBalance = currentOutBalance + quantity;
                console.log(`  Debit Note (Return to Supplier): Adding ${quantity} to outBalance for ${item.itemCode}`);
              } else if (formData.noteType === 'credit') {
                // CREDIT NOTE: Increase inBalance (return from customer)
                newInBalance = currentInBalance + quantity;
                console.log(`  Credit Note (Return from Customer): Adding ${quantity} to inBalance for ${item.itemCode}`);
              }
              
              // availableQuantity = inBalance - outBalance (simple formula)
              const newAvailableQuantity = newInBalance - newOutBalance;
              const newTotalBalance = newAvailableQuantity;
              
              console.log(`  NEW In Balance: ${newInBalance}, NEW Out Balance: ${newOutBalance}`);
              console.log(`  NEW Available Quantity: ${newAvailableQuantity}`);
              
              await updateInventoryItem(inventoryItem.id, {
                inBalance: newInBalance,
                outBalance: newOutBalance,
                totalBalance: newTotalBalance,
                availableQuantity: newAvailableQuantity
              });
            } else {
              console.warn(`Inventory item not found for code: ${item.itemCode}`);
            }
          }
        } else {
          console.log(`Note created with status '${noteData.status}' - no inventory update needed`);
        }
      }

      alert(editingNote ? 'Note updated successfully!' : 'Note created successfully!');
      resetForm();
    } catch (error) {
      console.error('Error saving credit/debit note:', error);
      alert('Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      noteType: 'credit',
      transactionType: 'sale',
      date: new Date().toISOString().split('T')[0],
      partyName: '',
      originalInvoiceNumber: '',
      reason: '',
      items: [{ itemCode: '', description: '', quantity: '', rate: '', amount: 0, _originalQuantity: undefined }],
      tax: 16,
      status: 'issued',
      remarks: '',
    });
    setEditingNote(null);
    setShowAddForm(false);
    setItemCodeErrors({});
    setQuantityErrors({});
  };

  // Handle edit
  const handleEdit = (note: DebitCreditNote) => {
    console.log('Edit button clicked for note:', note.noteNumber);
    setEditingNote(note);
    setFormData({
      noteType: note.noteType,
      transactionType: note.transactionType,
      date: note.date,
      partyName: note.partyName,
      originalInvoiceNumber: note.originalInvoiceNumber,
      reason: note.reason,
      items: note.items.map(item => ({
        itemCode: item.itemCode || '',
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        _originalQuantity: undefined // Will be populated when invoice is selected
      })),
      tax: (note.tax / note.subtotal) * 100,
      status: note.status,
      remarks: note.remarks || '',
    });
    setShowAddForm(true);
    
    // Scroll to form
    setTimeout(() => {
      const mainContent = document.querySelector('.min-h-screen') || document.body;
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Also try to scroll the form into view
      const formElement = document.querySelector('form');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this note? This will also reverse the inventory changes if applicable.')) {
      try {
        // Find the note to get its details before deletion
        const noteToDelete = notes.find(n => n.id === id);
        
        if (!noteToDelete) {
          alert('Note not found');
          return;
        }

        console.log('=== Deleting credit/debit note ===');
        console.log(`Note ID: ${id}`);
        console.log(`Note Type: ${noteToDelete.noteType}`);
        console.log(`Transaction Type: ${noteToDelete.transactionType}`);
        console.log(`Status: ${noteToDelete.status}`);

        // Only reverse inventory if the note was paid or issued
        if (noteToDelete.status === 'paid' || noteToDelete.status === 'issued') {
          console.log('Note was paid/issued - reversing inventory changes...');
          
          // Fetch latest inventory data
          const latestInventory = await getAllInventoryItems();

          // Reverse inventory changes for each item
          for (const item of noteToDelete.items) {
            if (!item.itemCode) continue;
            
            const inventoryItem = latestInventory.find(
              inv => inv.itemCode.toUpperCase() === item.itemCode.toUpperCase()
            );
            
            if (inventoryItem) {
              const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity;
              const currentInBalance = Number(inventoryItem.inBalance || 0);
              const currentOutBalance = Number(inventoryItem.outBalance || 0);
              
              let newInBalance = currentInBalance;
              let newOutBalance = currentOutBalance;
              
              // REVERSE the original operation based on NOTE TYPE (not transaction type)
              // Credit Note: Customer returned goods - we ADDED to inBalance, so now SUBTRACT
              // Debit Note: Returned to supplier - we ADDED to outBalance, so now SUBTRACT
              if (noteToDelete.noteType === 'credit') {
                // Was: Credit Note - added to inBalance (customer returned goods)
                // Now: Remove from inBalance
                newInBalance = Math.max(0, currentInBalance - quantity);
                console.log(`  Reversing Credit Note: Removing ${quantity} from inBalance for ${item.itemCode}`);
              } else {
                // Was: Debit Note - added to outBalance (returned to supplier)
                // Now: Remove from outBalance
                newOutBalance = Math.max(0, currentOutBalance - quantity);
                console.log(`  Reversing Debit Note: Removing ${quantity} from outBalance for ${item.itemCode}`);
              }
              
              // availableQuantity = inBalance - outBalance (simple formula)
              const newAvailableQuantity = newInBalance - newOutBalance;
              const newTotalBalance = newAvailableQuantity;
              
              console.log(`  NEW In Balance: ${newInBalance}`);
              console.log(`  NEW Out Balance: ${newOutBalance}`);
              console.log(`  NEW Available Quantity: ${newAvailableQuantity}`);
              
              await updateInventoryItem(inventoryItem.id, {
                inBalance: newInBalance,
                outBalance: newOutBalance,
                totalBalance: newTotalBalance,
                availableQuantity: newAvailableQuantity
              });
            } else {
              console.warn(`Inventory item not found for code: ${item.itemCode}`);
            }
          }
        } else {
          console.log(`Note status was '${noteToDelete.status}' - no inventory reversal needed`);
        }

        // Delete payment tracking records associated with this note
        await deletePaymentTrackingByReference(noteToDelete.noteNumber);

        // Delete all related transactions from basic accounting/expenses/transactions
        try {
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
            if (data.source === 'debit_credit_note' && 
                data.description && data.description.includes(noteToDelete.noteNumber)) {
              shouldDelete = true;
              reason = 'matched by source and note number';
            } else if (data.description && data.description.includes(noteToDelete.noteNumber)) {
              shouldDelete = true;
              reason = 'matched by note number in description';
            } else if ((data.paymentMethod === 'DB Note' || data.paymentMethod === 'CR Note') &&
                       data.description && 
                       (data.description.includes(noteToDelete.partyName) &&
                        Math.abs(data.amount - noteToDelete.totalAmount) < 0.01)) {
              shouldDelete = true;
              reason = 'matched by payment method, party, and amount';
            }
            
            if (shouldDelete) {
              await deleteDoc(docSnap.ref);
              deletedCount++;
              console.log(`✓ Deleted transaction ${docSnap.id} (${reason})`);
            }
          }
          
          console.log(`✓✓ Deleted ${deletedCount} transaction(s) from basic accounting, expenses, and transactions`);
        } catch (error) {
          console.error('Error deleting related transactions:', error);
        }

        // Delete the note from Firestore
        await deleteDebitCreditNote(id);
        console.log('✓✓✓ Note deleted successfully');
        alert('Note deleted successfully!');
      } catch (error) {
        console.error('Error deleting note:', error);
        alert('Failed to delete note. Please try again.');
      }
    }
  };

  // Show print preview
  const handlePrint = (note: DebitCreditNote) => {
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

    const noteTypeLabel = note.noteType === 'debit' ? 'Debit Note' : 'Credit Note';
    const transactionLabel = note.transactionType === 'sale' ? 'Sales' : 'Purchase';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${noteTypeLabel} - ${note.noteNumber}</title>
          <style>
            @media print {
              @page { margin: 1cm; size: A4; }
              body { margin: 0; }
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px; 
              color: #000;
              background: #fff;
              line-height: 1.4;
            }
            .header { 
              text-align: center; 
              margin-bottom: 25px; 
              border-bottom: 3px solid #000; 
              padding-bottom: 15px; 
            }
            .header h1 { 
              font-size: 24px; 
              margin-bottom: 8px; 
              font-weight: bold;
            }
            .header p { 
              margin: 4px 0; 
              font-size: 12px; 
            }
            .badge { 
              display: inline-block; 
              padding: 4px 12px; 
              border: 2px solid #000;
              font-size: 11px; 
              font-weight: bold;
              margin-top: 8px;
            }
            .info-section { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 20px;
              border: 2px solid #000;
              padding: 15px;
            }
            .info-box { flex: 1; }
            .info-box h3 { 
              margin: 0 0 10px 0; 
              font-size: 13px;
              font-weight: bold;
              text-decoration: underline;
            }
            .info-box p { 
              margin: 4px 0; 
              font-size: 12px; 
            }
            .reason-section {
              margin: 15px 0;
              border: 2px solid #000;
              padding: 12px;
            }
            .reason-section h3 {
              font-size: 13px;
              margin-bottom: 8px;
              font-weight: bold;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 15px 0;
              border: 2px solid #000;
            }
            th, td { 
              padding: 10px 8px; 
              text-align: left; 
              border: 1px solid #000;
              font-size: 11px;
            }
            th { 
              background-color: #000;
              color: #fff;
              font-weight: bold; 
            }
            tbody tr:nth-child(even) { background: #f5f5f5; }
            .totals { 
              margin-top: 20px; 
              text-align: right; 
            }
            .totals table { 
              width: 300px; 
              margin-left: auto;
              border: 2px solid #000;
            }
            .totals th {
              background: #fff;
              color: #000;
              border: 1px solid #000;
              text-align: left;
              font-weight: normal;
            }
            .totals td {
              font-weight: bold;
              text-align: right;
            }
            .total-row th,
            .total-row td { 
              font-weight: bold; 
              font-size: 14px;
              border-top: 2px solid #000;
            }
            .footer { 
              margin-top: 30px; 
              padding-top: 15px; 
              border-top: 1px solid #000; 
              text-align: center; 
              font-size: 10px; 
            }
            .footer p { margin: 3px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${noteTypeLabel}</h1>
            <p><strong>Note Number:</strong> ${note.noteNumber}</p>
            <p><strong>Type:</strong> ${transactionLabel} ${noteTypeLabel}</p>
            <span class="badge">${note.status.toUpperCase()}</span>
          </div>

          <div class="info-section">
            <div class="info-box">
              <h3>${note.partyType === 'customer' ? 'Customer' : 'Supplier'} Details:</h3>
              <p><strong>Name:</strong> ${note.partyName}</p>
              <p><strong>Code:</strong> ${note.partyCode}</p>
            </div>
            <div class="info-box" style="text-align: right;">
              <h3>Note Details:</h3>
              <p><strong>Date:</strong> ${new Date(note.date).toLocaleDateString('en-GB')}</p>
              <p><strong>Original Invoice:</strong> ${note.originalInvoiceNumber}</p>
            </div>
          </div>

          <div class="reason-section">
            <h3>Reason:</h3>
            <p>${note.reason}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Rate (KSH)</th>
                <th>Amount (KSH)</th>
              </tr>
            </thead>
            <tbody>
              ${note.items.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td>${formatKenyanNumber(item.quantity, 2)}</td>
                  <td>${formatKenyanNumber(item.rate, 2)}</td>
                  <td>${formatKenyanNumber(item.amount, 2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <table>
              <tr>
                <th>Subtotal:</th>
                <td>KSH ${formatKenyanNumber(note.subtotal, 2)}</td>
              </tr>
              <tr>
                <th>Tax:</th>
                <td>KSH ${formatKenyanNumber(note.tax, 2)}</td>
              </tr>
              <tr class="total-row">
                <th>Total Amount:</th>
                <td>KSH ${formatKenyanNumber(note.totalAmount, 2)}</td>
              </tr>
            </table>
          </div>

          ${note.remarks ? `<div style="margin: 20px 0; border: 1px solid #000; padding: 12px;"><h3 style="font-size: 13px; margin-bottom: 8px; font-weight: bold;">Remarks:</h3><p style="font-size: 12px;">${note.remarks}</p></div>` : ''}

          <div class="footer">
            <p>This is a computer-generated ${noteTypeLabel.toLowerCase()} and does not require a signature.</p>
            <p>Recycle Business Manager - Credit/Debit Note System</p>
            <p>Generated on ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
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
      ['Note Number', 'Type', 'Transaction', 'Date', 'Party Name', 'Party Code', 'Invoice No', 'Amount', 'Status'].join(','),
      ...filteredNotes.map(note =>
        [
          note.noteNumber,
          note.noteType.toUpperCase(),
          note.transactionType.toUpperCase(),
          note.date,
          `"${note.partyName}"`,
          note.partyCode,
          note.originalInvoiceNumber,
          formatKenyanNumber(note.totalAmount, 2),
          note.status.toUpperCase(),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `debit_credit_notes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download PDF with print dialog
  const handleDownloadPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Professional B&W Header with Company Name
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('DONATO IMPEX LTD.', 148, 12, { align: 'center' });
    
    doc.setFontSize(18);
    doc.text('RECYCLE BUSINESS MANAGER', 148, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text('Debit/Credit Notes Report', 148, 28, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const generatedDate = new Date().toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.text(`Generated on ${generatedDate}`, 148, 34, { align: 'center' });
    
    // Divider line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(15, 38, 281, 38);

    // Summary boxes - B&W with borders
    const summaryY = 45;
    const boxWidth = 65;
    const boxHeight = 20;
    const startX = 15;
    
    // Draw summary box borders
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(startX, summaryY, boxWidth, boxHeight, 'S');
    doc.rect(startX + 70, summaryY, boxWidth, boxHeight, 'S');
    doc.rect(startX + 140, summaryY, boxWidth, boxHeight, 'S');
    doc.rect(startX + 210, summaryY, boxWidth, boxHeight, 'S');
    
    // Summary box labels
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL NOTES', startX + 5, summaryY + 8);
    doc.text('TOTAL AMOUNT', startX + 75, summaryY + 8);
    doc.text('DEBIT NOTES', startX + 145, summaryY + 8);
    doc.text('CREDIT NOTES', startX + 215, summaryY + 8);
    
    // Summary box values
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const totalAmount = filteredNotes.reduce((sum, note) => sum + note.totalAmount, 0);
    doc.text(String(filteredNotes.length), startX + 5, summaryY + 16);
    doc.text(`KSH ${formatKenyanNumber(totalAmount)}`, startX + 75, summaryY + 16);
    doc.text(String(filteredNotes.filter(n => n.noteType === 'debit').length), startX + 145, summaryY + 16);
    doc.text(String(filteredNotes.filter(n => n.noteType === 'credit').length), startX + 215, summaryY + 16);

    // Table data with Kenyan formatting
    const tableData = filteredNotes.map(note => [
      note.noteNumber,
      note.noteType.toUpperCase(),
      note.transactionType.toUpperCase(),
      note.date,
      note.partyName,
      note.partyCode,
      note.originalInvoiceNumber,
      formatKenyanNumber(note.totalAmount),
      note.status.toUpperCase()
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    autoTable(doc, {
      startY: summaryY + 25,
      head: [['Note Number', 'Type', 'Transaction', 'Date', 'Party Name', 'Code', 'Invoice', 'Amount (KSH)', 'Status']],
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
        fontSize: 8,
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
    doc.text('Recycle Business Manager - Debit/Credit Notes System', 148, finalY + 15, { align: 'center' });
    
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
          doc.save('debit_credit_notes_report.pdf');
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

  // Filter notes
  const filteredNotes = notes.filter(note => {
    const matchesSearch = searchTerm === '' || 
      note.noteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.partyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.originalInvoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || note.noteType === filterType;
    const matchesTransaction = filterTransaction === 'all' || note.transactionType === filterTransaction;
    const matchesStatus = filterStatus === 'all' || note.status === filterStatus;

    return matchesSearch && matchesType && matchesTransaction && matchesStatus;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending

  const { subtotal, taxAmount, total } = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-3 bg-indigo-50 rounded-xl">
              <Receipt className="w-8 h-8 text-indigo-600" />
            </div>
            Debit/Credit Notes
          </h1>
          <p className="text-gray-600 mt-2 max-w-3xl">
            Process returns: <strong className="text-green-600">Credit Notes</strong> for customer returns (adds stock back, reduces receivables) • 
            <strong className="text-blue-600 ml-1">Debit Notes</strong> for supplier returns (reduces stock, reduces payables)
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create New Note
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {editingNote ? 'Edit Note' : 'Create New Debit/Credit Note'}
          </h3>
          
          {/* Info Banner */}
          <div className={`mb-6 p-4 rounded-lg border-l-4 ${
            formData.noteType === 'credit' 
              ? 'bg-green-50 border-green-500' 
              : 'bg-blue-50 border-blue-500'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${formData.noteType === 'credit' ? 'text-green-600' : 'text-blue-600'}`}>
                {formData.noteType === 'credit' ? '📥' : '📤'}
              </div>
              <div className="flex-1">
                <h4 className={`font-semibold text-sm ${
                  formData.noteType === 'credit' ? 'text-green-900' : 'text-blue-900'
                }`}>
                  {formData.noteType === 'credit' ? 'CREDIT NOTE - Customer Return' : 'DEBIT NOTE - Return to Supplier'}
                </h4>
                <p className={`text-xs mt-1 ${
                  formData.noteType === 'credit' ? 'text-green-800' : 'text-blue-800'
                }`}>
                  {formData.noteType === 'credit' ? (
                    <>
                      When a customer returns sold items: <strong>Adds items back to stock</strong>, 
                      reduces what customer owes (Amount to Receive), and creates a credit entry in customer ledger.
                    </>
                  ) : (
                    <>
                      When returning purchased items to supplier: <strong>Subtracts items from stock</strong>, 
                      reduces what we owe (Amount to Pay), and creates a debit entry in supplier ledger.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note Type
                </label>
                <select
                  value={formData.noteType}
                  onChange={(e) => {
                    const noteType = e.target.value as 'debit' | 'credit';
                    // Credit note = sale, Debit note = purchase
                    const transactionType = noteType === 'credit' ? 'sale' : 'purchase';
                    setFormData({ ...formData, noteType, transactionType, partyName: '', originalInvoiceNumber: '' });
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  required
                >
                  <option value="credit">Credit Note (Return from Customer)</option>
                  <option value="debit">Debit Note (Return to Supplier)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.noteType === 'credit' 
                    ? '📥 Customer returns sold items - Adds stock back, reduces Amount to Receive' 
                    : '📤 Return purchased items to supplier - Reduces stock, reduces Amount to Pay'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Original Transaction Type
                </label>
                <input
                  type="text"
                  value={formData.transactionType === 'sale' ? 'Sale (Customer Invoice)' : 'Purchase (Supplier Invoice)'}
                  readOnly
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.noteType === 'credit' 
                    ? 'Linked to original sales invoice' 
                    : 'Linked to original purchase invoice'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  required
                />
              </div>
            </div>

            {/* Party and Invoice Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.transactionType === 'sale' ? 'Customer Name' : 'Supplier Name'}
                  <span className="text-xs font-normal text-gray-500 ml-2">
                    ({formData.noteType === 'credit' ? 'returning goods to us' : 'we are returning goods to'})
                  </span>
                </label>
                <select
                  value={formData.partyName}
                  onChange={(e) => setFormData({ ...formData, partyName: e.target.value, originalInvoiceNumber: '' })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  required
                >
                  <option value="">Select {formData.transactionType === 'sale' ? 'Customer' : 'Supplier'}</option>
                  {getPartyList().map(party => (
                    <option key={party.id} value={party.companyName}>
                      {party.companyName} ({'customerCode' in party ? party.customerCode : party.supplierCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Original {formData.transactionType === 'sale' ? 'Sales' : 'Purchase'} Invoice Number
                  {(formData.status === 'issued' || formData.status === 'paid') && (
                    <span className="text-red-600 ml-1">*</span>
                  )}
                </label>
                <select
                  value={formData.originalInvoiceNumber}
                  onChange={(e) => {
                    const selectedInvoice = e.target.value;
                    console.log('=== Invoice Selected ===');
                    console.log('Selected Invoice:', selectedInvoice);
                    console.log('Transaction Type:', formData.transactionType);
                    
                    setFormData({ ...formData, originalInvoiceNumber: selectedInvoice });
                    // Clear quantity errors when invoice changes
                    setQuantityErrors({});
                    
                    // Auto-fill items from selected invoice
                    if (selectedInvoice) {
                      if (formData.transactionType === 'sale') {
                        // For sales invoices
                        const matchingInvoice = invoices.find(inv => 
                          (inv.manualInvoiceNumber === selectedInvoice || inv.systemInvoiceNumber === selectedInvoice)
                        );
                        console.log('Found sales invoice:', matchingInvoice);
                        if (matchingInvoice && matchingInvoice.items.length > 0) {
                          const autoFilledItems = matchingInvoice.items.map(item => ({
                            itemCode: item.itemCode || '',
                            description: item.itemDescription,
                            quantity: '', // Don't auto-fill - user should enter return quantity
                            rate: item.unitPrice,
                            amount: 0,
                            _originalQuantity: item.quantity // Store original for reference
                          }));
                          console.log('Auto-filled items:', autoFilledItems);
                          setFormData(prev => ({
                            ...prev,
                            items: autoFilledItems
                          }));
                        }
                      } else if (formData.transactionType === 'purchase') {
                        // For purchase invoices - check both direct purchases and shipments
                        const matchingPurchase = directPurchases.find(p => p.invoiceNumber === selectedInvoice);
                        const matchingShipment = shipments.find(s => s.purchaseInvoiceNumber === selectedInvoice);
                        console.log('Found purchase:', matchingPurchase);
                        console.log('Found shipment:', matchingShipment);
                        
                        if (matchingPurchase && matchingPurchase.items.length > 0) {
                          // Direct purchase with items
                          const autoFilledItems = matchingPurchase.items.map(item => ({
                            itemCode: item.itemCode || '', // Auto-fill item code if available
                            description: item.itemName,
                            quantity: '', // Don't auto-fill - user should enter return quantity
                            rate: item.rate,
                            amount: 0,
                            _originalQuantity: item.quantity
                          }));
                          console.log('Auto-filled purchase items:', autoFilledItems);
                          setFormData(prev => ({
                            ...prev,
                            items: autoFilledItems
                          }));
                        } else if (matchingShipment) {
                          // Shipment - create a single item entry
                          const autoFilledItems = [{
                            itemCode: matchingShipment.itemCode || '', // Auto-fill if available
                            description: matchingShipment.materialType || 'Material',
                            quantity: '', // Don't auto-fill - user should enter return quantity
                            rate: matchingShipment.ratePerKg,
                            amount: 0,
                            _originalQuantity: matchingShipment.purchaseKg
                          }];
                          console.log('Auto-filled shipment items:', autoFilledItems);
                          setFormData(prev => ({
                            ...prev,
                            items: autoFilledItems
                          }));
                        }
                      }
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  required
                  disabled={!formData.partyName}
                >
                  <option value="">Select {formData.transactionType === 'sale' ? 'Sales' : 'Purchase'} Invoice</option>
                  {getFilteredInvoices().map((invoice, idx) => (
                    <option 
                      key={idx} 
                      value={('systemNumber' in invoice ? invoice.systemNumber : invoice.number) || invoice.number}
                      data-display-number={invoice.number}
                    >
                      {invoice.number} - KSH {formatKenyanNumber(invoice.amount)} ({new Date(invoice.date).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.partyName ? (
                    <>
                      {(formData.status === 'issued' || formData.status === 'paid') && (
                        <span className="text-amber-600 font-medium">Required: </span>
                      )}
                      Selecting an invoice will automatically link this note and update payment tracking
                    </>
                  ) : (
                    'Select party first'
                  )}
                </p>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for {formData.noteType === 'debit' ? 'Return to Supplier' : 'Customer Return'}
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder={formData.noteType === 'credit' 
                  ? "e.g., Customer returned damaged goods, wrong items delivered, quality issues, etc."
                  : "e.g., Returning damaged goods to supplier, wrong items received, quality issues, etc."}
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Items Being Returned
                  <span className="text-xs font-normal text-gray-500 ml-2">
                    ({formData.noteType === 'credit' ? 'from customer' : 'to supplier'})
                  </span>
                </label>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>
              <div className="mb-2 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600">
                <div className="col-span-2">Item Code</div>
                <div className="col-span-2">Description</div>
                <div className="col-span-1 text-center">Invoice Qty</div>
                <div className="col-span-2">Return Qty</div>
                <div className="col-span-1">Rate</div>
                <div className="col-span-3">Amount</div>
                <div className="col-span-1"></div>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => {
                  const itemCodeTrimmed = (item.itemCode || '').trim().toUpperCase();
                  const inventoryItem = inventoryItems.find(
                    inv => inv.itemCode.trim().toUpperCase() === itemCodeTrimmed
                  );
                  
                  // Debug logging
                  if (itemCodeTrimmed && index === 0) {
                    console.log('Looking for item code:', itemCodeTrimmed);
                    console.log('Available inventory items:', inventoryItems.map(i => `${i.itemCode} (Avail: ${i.availableQuantity})`));
                    console.log('Found inventory item:', inventoryItem ? `${inventoryItem.itemCode} - ${inventoryItem.availableQuantity} ${inventoryItem.unit}` : 'NOT FOUND');
                  }
                  
                  return (
                  <div key={index} className="space-y-1">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-2">
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
                          placeholder="Item Code"
                          className={`w-full px-3 py-2 rounded-lg border ${
                            itemCodeErrors[index] 
                              ? 'border-red-500 focus:ring-red-500' 
                              : 'border-gray-300 focus:ring-indigo-500'
                          } focus:ring-2 focus:border-indigo-500 outline-none text-sm`}
                        />
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
                      <div className="col-span-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          placeholder="Item description (auto-filled from code)"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                          required
                        />
                      </div>
                      <div className="col-span-1">
                        {item._originalQuantity ? (
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className="text-xs font-semibold text-blue-600">
                              {formatKenyanNumber(item._originalQuantity)}
                            </span>
                            <span className="text-[10px] text-gray-500">from inv</span>
                          </div>
                        ) : inventoryItem ? (
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className={`text-xs font-semibold ${
                              inventoryItem.availableQuantity > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatKenyanNumber(inventoryItem.availableQuantity)}
                            </span>
                            <span className="text-[10px] text-gray-500">{inventoryItem.unit}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full text-xs text-gray-400">-</div>
                        )}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                          placeholder="Qty"
                          min="0"
                          step="0.0001"
                          className={`w-full px-3 py-2 rounded-lg border ${
                            quantityErrors[index] 
                              ? 'border-red-500 focus:ring-red-500' 
                              : 'border-gray-300 focus:ring-indigo-500'
                          } focus:ring-2 focus:border-indigo-500 outline-none text-sm`}
                          required
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => handleItemChange(index, 'rate', parseFloat(e.target.value) || 0)}
                          placeholder="Rate"
                          min="0"
                          step="0.01"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                          required
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={formatKenyanNumber(item.amount)}
                          readOnly
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                        />
                      </div>
                      <div className="col-span-1 flex items-center">
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItemRow(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {itemCodeErrors[index] && (
                      <div className="flex items-center gap-1 text-red-600 text-xs pl-2">
                        <AlertCircle className="w-3 h-3" />
                        <span>{itemCodeErrors[index]}</span>
                      </div>
                    )}
                    {quantityErrors[index] && (
                      <div className="flex items-center gap-1 text-red-600 text-xs pl-2">
                        <AlertCircle className="w-3 h-3" />
                        <span>{quantityErrors[index]}</span>
                      </div>
                    )}
                    {item.itemCode && !itemCodeErrors[index] && !quantityErrors[index] && item.description && (
                      <div className="flex items-center gap-1 text-green-600 text-xs pl-2">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Item found: {item.description}</span>
                      </div>
                    )}
                  </div>
                );})}
              </div>
            </div>

            {/* Tax and Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  VAT (%)
                </label>
                <select
                  value={formData.tax}
                  onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  required
                >
                  <option value="0">0%</option>
                  <option value="16">16%</option>
                </select>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold">KSH {formatKenyanNumber(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax ({formData.tax}%):</span>
                    <span className="font-semibold">KSH {formatKenyanNumber(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="font-bold">Total:</span>
                    <span className="font-bold text-lg">KSH {formatKenyanNumber(total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarks (Optional)
              </label>
              <input
                type="text"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="Additional remarks"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Quantity Errors Warning */}
            {Object.keys(quantityErrors).length > 0 && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-semibold mb-1">Cannot save - Quantity validation errors:</p>
                  <p>Please correct the quantity errors shown above. You cannot return more items than were originally invoiced.</p>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving || Object.keys(quantityErrors).length > 0}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  editingNote ? 'Update Note' : 'Create Note'
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="all">All Types</option>
            <option value="debit">Debit Notes</option>
            <option value="credit">Credit Notes</option>
          </select>
          <select
            value={filterTransaction}
            onChange={(e) => setFilterTransaction(e.target.value as typeof filterTransaction)}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="all">All Transactions</option>
            <option value="sale">Sales</option>
            <option value="purchase">Purchase</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-bold text-gray-900">Debit/Credit Notes</h3>
              <span className="text-sm text-gray-500">({filteredNotes.length} notes)</span>
            </div>
          </div>
        </div>

        {filteredNotes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Note Number</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Transaction</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Party</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Invoice No</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {note.noteNumber}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          note.noteType === 'debit'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {note.noteType === 'debit' ? 'Debit' : 'Credit'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {note.transactionType === 'sale' ? 'Sales' : 'Purchase'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {new Date(note.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{note.partyName}</div>
                      <div className="text-xs text-gray-500">{note.partyCode}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {note.originalInvoiceNumber}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                      KSH {formatKenyanNumber(note.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          note.status === 'issued'
                            ? 'bg-emerald-100 text-emerald-700'
                            : note.status === 'paid'
                            ? 'bg-blue-100 text-blue-700'
                            : note.status === 'cancelled'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {note.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handlePrint(note)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Print"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
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
            <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No debit/credit notes found</p>
            <p className="text-sm text-gray-400 mt-2">
              {searchTerm || filterType !== 'all' || filterTransaction !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first note to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Receipt className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Total Notes</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{notes.length}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Debit Notes</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {notes.filter(n => n.noteType === 'debit').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Credit Notes</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {notes.filter(n => n.noteType === 'credit').length}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-600">Issued</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {notes.filter(n => n.status === 'issued').length}
          </p>
        </div>
      </div>

      {/* Print Preview Modal */}
      {printPreviewNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="w-6 h-6 text-blue-600" />
                  Print Preview
                </h2>
                <p className="text-sm text-gray-600">{printPreviewNote.noteType === 'debit' ? 'Debit' : 'Credit'} Note: {printPreviewNote.noteNumber}</p>
              </div>
              <button
                onClick={() => setPrintPreviewNote(null)}
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
                    {printPreviewNote.noteType === 'debit' ? 'DEBIT NOTE' : 'CREDIT NOTE'}
                  </h1>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Note Number:</strong> {printPreviewNote.noteNumber}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Type:</strong> {printPreviewNote.transactionType === 'sale' ? 'Sales' : 'Purchase'} {printPreviewNote.noteType === 'debit' ? 'Debit Note' : 'Credit Note'}
                  </p>
                  <span className={`inline-block px-3 py-1 rounded text-xs font-bold ${
                    printPreviewNote.noteType === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {printPreviewNote.status.toUpperCase()}
                  </span>
                </div>

                {/* Info Section */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      {printPreviewNote.partyType === 'customer' ? 'Customer' : 'Supplier'} Details:
                    </h3>
                    <p className="text-sm mb-1"><strong>Name:</strong> {printPreviewNote.partyName}</p>
                    <p className="text-sm"><strong>Code:</strong> {printPreviewNote.partyCode}</p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Note Details:</h3>
                    <p className="text-sm mb-1"><strong>Date:</strong> {new Date(printPreviewNote.date).toLocaleDateString()}</p>
                    <p className="text-sm"><strong>Original Invoice:</strong> {printPreviewNote.originalInvoiceNumber}</p>
                  </div>
                </div>

                {/* Reason */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Reason:</h3>
                  <p className="text-sm text-gray-900">{printPreviewNote.reason}</p>
                </div>

                {/* Items Table */}
                <table className="w-full border-collapse border border-gray-300 mb-6">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-300 px-4 py-2 text-left text-xs font-bold">Description</th>
                      <th className="border border-gray-300 px-4 py-2 text-left text-xs font-bold">Quantity</th>
                      <th className="border border-gray-300 px-4 py-2 text-left text-xs font-bold">Rate (KSH)</th>
                      <th className="border border-gray-300 px-4 py-2 text-left text-xs font-bold">Amount (KSH)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printPreviewNote.items.map((item, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 px-4 py-2 text-sm">{item.description}</td>
                        <td className="border border-gray-300 px-4 py-2 text-sm">{item.quantity}</td>
                        <td className="border border-gray-300 px-4 py-2 text-sm">{formatKenyanNumber(item.rate)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-sm">{formatKenyanNumber(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                  <table className="w-80">
                    <tbody>
                      <tr>
                        <td className="py-2 text-sm text-right pr-4">Subtotal:</td>
                        <td className="py-2 text-sm text-right font-semibold">KSH {formatKenyanNumber(printPreviewNote.subtotal)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-sm text-right pr-4">Tax:</td>
                        <td className="py-2 text-sm text-right font-semibold">KSH {formatKenyanNumber(printPreviewNote.tax)}</td>
                      </tr>
                      <tr className="border-t-2 border-gray-300">
                        <td className="py-2 text-base text-right pr-4 font-bold">Total Amount:</td>
                        <td className="py-2 text-base text-right font-bold">KSH {formatKenyanNumber(printPreviewNote.totalAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Remarks */}
                {printPreviewNote.remarks && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Remarks:</h3>
                    <p className="text-sm text-gray-900">{printPreviewNote.remarks}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="text-center border-t border-gray-300 pt-6 text-xs text-gray-600">
                  <p className="mb-1">This is a computer-generated {printPreviewNote.noteType === 'debit' ? 'debit note' : 'credit note'} and does not require a signature.</p>
                  <p>Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setPrintPreviewNote(null)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (printPreviewNote) {
                    handlePrint(printPreviewNote);
                  }
                  setPrintPreviewNote(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Printer className="w-4 h-4" />
                Print Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
