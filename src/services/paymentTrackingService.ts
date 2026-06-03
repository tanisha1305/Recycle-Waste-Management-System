import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PaymentTransaction, PartyBalance, PaymentSummary } from '../types';

const PAYMENT_TRANSACTIONS_COLLECTION = 'paymentTransactions';
const PARTY_BALANCES_COLLECTION = 'partyBalances';

// Helper to convert Firestore timestamps
const convertTimestamps = (data: any): any => {
  const converted = { ...data };
  if (data.createdAt && typeof data.createdAt.toDate === 'function') {
    converted.createdAt = data.createdAt.toDate().toISOString();
  }
  if (data.date && typeof data.date.toDate === 'function') {
    converted.date = data.date.toDate().toISOString();
  }
  if (data.lastTransactionDate && typeof data.lastTransactionDate.toDate === 'function') {
    converted.lastTransactionDate = data.lastTransactionDate.toDate().toISOString();
  }
  if (data.lastUpdated && typeof data.lastUpdated.toDate === 'function') {
    converted.lastUpdated = data.lastUpdated.toDate().toISOString();
  }
  return converted;
};

// ============================================
// Payment Transaction CRUD Operations
// ============================================

export const addPaymentTransaction = async (
  transaction: Omit<PaymentTransaction, 'id' | 'createdAt'>,
  createdBy: string
): Promise<string> => {
  try {
    const transactionData = {
      ...transaction,
      createdBy,
      createdAt: Timestamp.now(),
      date: Timestamp.fromDate(new Date(transaction.date))
    };

    const docRef = await addDoc(collection(db, PAYMENT_TRANSACTIONS_COLLECTION), transactionData);
    
    // Update party balance after adding transaction
    await updatePartyBalance(transaction.partyType, transaction.partyId, transaction.partyName, transaction.partyCode);
    
    // If this is a payment transaction, update invoice statuses
    if (transaction.transactionType === 'payment') {
      await updateInvoicePaymentStatus(transaction.partyId, transaction.partyType);
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding payment transaction:', error);
    throw error;
  }
};

export const updatePaymentTransaction = async (
  id: string,
  updates: Partial<PaymentTransaction>
): Promise<void> => {
  try {
    const docRef = doc(db, PAYMENT_TRANSACTIONS_COLLECTION, id);
    const updateData: any = { ...updates };
    
    if (updates.date) {
      updateData.date = Timestamp.fromDate(new Date(updates.date));
    }
    
    await updateDoc(docRef, updateData);
    
    // Get the transaction to update party balance
    const transactionDoc = await getDoc(docRef);
    if (transactionDoc.exists()) {
      const transaction = convertTimestamps({ id: transactionDoc.id, ...transactionDoc.data() }) as PaymentTransaction;
      await updatePartyBalance(transaction.partyType, transaction.partyId, transaction.partyName, transaction.partyCode);
    }
  } catch (error) {
    console.error('Error updating payment transaction:', error);
    throw error;
  }
};

export const deletePaymentTransaction = async (id: string): Promise<void> => {
  try {
    // Get transaction details before deletion
    const docRef = doc(db, PAYMENT_TRANSACTIONS_COLLECTION, id);
    const transactionDoc = await getDoc(docRef);
    
    if (transactionDoc.exists()) {
      const transaction = convertTimestamps({ id: transactionDoc.id, ...transactionDoc.data() }) as PaymentTransaction;
      
      // Delete the payment transaction
      await deleteDoc(docRef);
      console.log('✓ Deleted payment transaction:', id);
      
      // Delete corresponding bank/cash book entry (contra entry) using the stored reference
      if (transaction.transactionType === 'payment' && transaction.status === 'completed') {
        try {
          // New method: Use direct reference ID if available
          if (transaction.contraTransactionId) {
            const { deleteTransaction } = await import('./transactionService');
            await deleteTransaction(transaction.contraTransactionId);
            console.log('✓ Deleted corresponding bank/cash book entry using direct reference');
          } else {
            // Fallback: Old method for existing records without contraTransactionId
            // Try to find matching transaction by date, amount, and party name
            console.log('⚠ No contraTransactionId found, using fallback matching...');
            const transactionsQuery = query(
              collection(db, 'transactions'),
              where('contraType', '==', 'contra-entry'),
              where('source', '==', 'system')
            );
            const transactionsSnapshot = await getDocs(transactionsQuery);
            
            // Find matching transaction by date, amount, and party name
            for (const txnDoc of transactionsSnapshot.docs) {
              const txnData = txnDoc.data();
              const txnDate = txnData.date;
              const txnAmount = txnData.amount;
              const matchesCustomer = txnData.senderName === transaction.partyName;
              const matchesSupplier = txnData.receiverName === transaction.partyName;
              
              // Match by date, amount, and party name
              if (txnDate === transaction.date &&
                  Math.abs(txnAmount - transaction.amount) < 0.01 &&
                  (matchesCustomer || matchesSupplier)) {
                
                // Import deleteTransaction to properly update bank balance
                const { deleteTransaction } = await import('./transactionService');
                await deleteTransaction(txnDoc.id);
                console.log('✓ Deleted corresponding bank/cash book entry using fallback matching');
                break;
              }
            }
          }
        } catch (error) {
          console.error('Error deleting bank/cash entry:', error);
          // Don't throw - payment transaction is already deleted
        }
      }
      
      // Update party balance after deletion
      await updatePartyBalance(transaction.partyType, transaction.partyId, transaction.partyName, transaction.partyCode);
      console.log('✓ Updated party balance after payment deletion');
    }
  } catch (error) {
    console.error('Error deleting payment transaction:', error);
    throw error;
  }
};

export const deletePaymentTrackingByReference = async (referenceNumber: string): Promise<void> => {
  try {
    console.log(`Attempting to delete payment tracking for reference: ${referenceNumber}`);
    
    // Find all transactions with this reference number (for invoices/shipments)
    const q1 = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('referenceNumber', '==', referenceNumber)
    );
    
    const snapshot1 = await getDocs(q1);
    console.log(`Found ${snapshot1.docs.length} records by referenceNumber`);
    
    // Also find transactions where paymentReference matches (for debit/credit notes)
    const q2 = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('paymentReference', '==', referenceNumber)
    );
    
    const snapshot2 = await getDocs(q2);
    console.log(`Found ${snapshot2.docs.length} records by paymentReference`);
    
    // Combine both results
    const allDocs = [...snapshot1.docs, ...snapshot2.docs];
    
    // Delete all matching transactions
    const deletePromises = allDocs.map(async (docSnapshot) => {
      const transaction = convertTimestamps({ id: docSnapshot.id, ...docSnapshot.data() }) as PaymentTransaction;
      await deleteDoc(docSnapshot.ref);
      console.log(`✓ Deleted payment tracking record: ${docSnapshot.id}`);
      // Update party balance after each deletion
      await updatePartyBalance(transaction.partyType, transaction.partyId, transaction.partyName, transaction.partyCode);
    });
    
    await Promise.all(deletePromises);
    console.log(`✓✓ Deleted total ${allDocs.length} payment tracking records for reference: ${referenceNumber}`);
  } catch (error) {
    console.error('Error deleting payment tracking by reference:', error);
    throw error;
  }
};

export const subscribeToPaymentTransactions = (
  partyType: 'customer' | 'supplier' | 'all',
  onUpdate: (transactions: PaymentTransaction[]) => void,
  partyId?: string,
  onError?: (error: Error) => void
) => {
  try {
    let q;
    
    if (partyId) {
      // Get transactions for specific party (no orderBy to avoid index requirement)
      q = query(
        collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
        where('partyId', '==', partyId)
      );
    } else if (partyType !== 'all') {
      // Get all transactions for party type (no orderBy to avoid composite index)
      q = query(
        collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
        where('partyType', '==', partyType)
      );
    } else {
      // Get all transactions
      q = query(
        collection(db, PAYMENT_TRANSACTIONS_COLLECTION)
      );
    }

    return onSnapshot(
      q,
      (snapshot) => {
        // Sort in JavaScript instead of Firestore to avoid index requirements
        const transactions = snapshot.docs.map((doc) => {
          const data = convertTimestamps(doc.data());
          return {
            id: doc.id,
            ...data
          } as PaymentTransaction;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        onUpdate(transactions);
      },
      (error) => {
        console.error('Error in payment transactions subscription:', error);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.error('Error setting up payment transactions subscription:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
};

// ============================================
// Party Balance Operations
// ============================================

export const updatePartyBalance = async (
  partyType: 'customer' | 'supplier',
  partyId: string,
  partyName: string,
  partyCode: string
): Promise<void> => {
  try {
    // Get opening balance from customer or supplier record
    let openingBalance = 0;
    try {
      const partyCollection = partyType === 'customer' ? 'customers' : 'suppliers';
      const partyDoc = await getDoc(doc(db, partyCollection, partyId));
      if (partyDoc.exists()) {
        const partyData = partyDoc.data();
        openingBalance = Number(partyData.openingBalance) || 0;
      }
    } catch (err) {
      console.error('Error fetching opening balance:', err);
      // Continue with 0 opening balance if there's an error
    }

    // Get all transactions for this party (both pending and completed)
    const q = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('partyId', '==', partyId),
      where('partyType', '==', partyType)
    );
    
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(doc => convertTimestamps(doc.data())) as PaymentTransaction[];
    
    // Calculate totals
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalAdjustments = 0;
    let totalAdvance = 0;
    let lastTransactionDate = new Date(0).toISOString();
    
    transactions.forEach(transaction => {
      if (transaction.date > lastTransactionDate) {
        lastTransactionDate = transaction.date;
      }
      
      switch (transaction.transactionType) {
        case 'invoice':
          // Count all invoices regardless of status (they represent amounts owed)
          totalInvoiced += transaction.amount;
          break;
        case 'payment':
          // Only count completed payments (actual cash/bank payments)
          if (transaction.status === 'completed') {
            totalPaid += transaction.amount;
          }
          break;
        case 'advance':
          // Only count completed advances
          if (transaction.status === 'completed') {
            totalAdvance += transaction.amount;
            totalPaid += transaction.amount;
          }
          break;
        case 'refund':
          // Only count completed refunds
          if (transaction.status === 'completed') {
            totalPaid -= transaction.amount;
          }
          break;
        case 'adjustment':
          // Track adjustments (credit/debit notes) separately
          // Positive amount = credit/debit note (reduces amount to receive/pay)
          // Negative amount = payback (reverses previous credit note)
          if (transaction.status === 'completed') {
            totalAdjustments += transaction.amount; // Can be positive or negative
          }
          break;
      }
    });
    
    // For customers: balance = openingBalance + totalInvoiced - totalPaid - totalAdjustments (amount to receive)
    // For suppliers: balance = openingBalance + totalInvoiced - totalPaid - totalAdjustments (amount to pay)
    // Opening balance represents initial amount owed (positive for customers, negative for suppliers typically)
    
    // Simple and accurate calculation:
    // Total owed = opening balance + total invoiced - adjustments
    // Total paid = all payments (including advance)
    // Net balance = total owed - total paid
    
    const totalOwed = openingBalance + totalInvoiced - totalAdjustments;
    const netBalance = totalOwed - totalPaid;
    
    // If net balance is negative, customer has paid more than owed (advance credit)
    // If net balance is positive, customer still owes money
    let balance = 0; // Amount to receive/pay
    let advanceBalance = 0; // Advance credit remaining
    
    if (netBalance < 0) {
      // Customer has overpaid (advance credit)
      advanceBalance = Math.abs(netBalance);
      balance = 0;
    } else {
      // Customer still owes money
      balance = netBalance;
      advanceBalance = 0;
    }
    
    // Determine status
    let status: 'active' | 'settled' | 'overdue' = 'active';
    if (Math.abs(netBalance) < 0.01) {
      status = 'settled';
    } else if (balance > 0 && partyType === 'customer') {
      // Check if any invoice is overdue (simplified: assume 30 days)
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 30);
      if (new Date(lastTransactionDate) < overdueDate) {
        status = 'overdue';
      }
    }
    
    // Update or create party balance
    const balanceId = `${partyType}_${partyId}`;
    const balanceRef = doc(db, PARTY_BALANCES_COLLECTION, balanceId);
    
    const balanceData = {
      partyType,
      partyId,
      partyName,
      partyCode,
      openingBalance,
      totalInvoiced,
      totalPaid,
      totalAdjustments,
      totalAdvance,
      advanceBalance,
      balance,
      lastTransactionDate: Timestamp.fromDate(new Date(lastTransactionDate)),
      lastUpdated: Timestamp.now(),
      status
    };
    
    // Use setDoc to create/update with specific ID (prevents duplicates)
    await setDoc(balanceRef, balanceData, { merge: true });
  } catch (error) {
    console.error('Error updating party balance:', error);
    throw error;
  }
};

export const getPartyBalance = async (
  partyType: 'customer' | 'supplier',
  partyId: string
): Promise<PartyBalance | null> => {
  try {
    const q = query(
      collection(db, PARTY_BALANCES_COLLECTION),
      where('partyType', '==', partyType),
      where('partyId', '==', partyId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return convertTimestamps({
      id: doc.id,
      ...doc.data()
    }) as PartyBalance;
  } catch (error) {
    console.error('Error getting party balance:', error);
    throw error;
  }
};

export const subscribeToPartyBalances = (
  partyType: 'customer' | 'supplier' | 'all',
  onUpdate: (balances: PartyBalance[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    let q;
    
    if (partyType !== 'all') {
      // No orderBy to avoid composite index requirement
      q = query(
        collection(db, PARTY_BALANCES_COLLECTION),
        where('partyType', '==', partyType)
      );
    } else {
      q = query(
        collection(db, PARTY_BALANCES_COLLECTION)
      );
    }

    return onSnapshot(
      q,
      (snapshot) => {
        // Sort in JavaScript instead of Firestore to avoid index requirements
        const balances = snapshot.docs.map((doc) => {
          const data = convertTimestamps(doc.data());
          return {
            id: doc.id,
            ...data
          } as PartyBalance;
        }).sort((a, b) => b.balance - a.balance);
        onUpdate(balances);
      },
      (error) => {
        console.error('Error in party balances subscription:', error);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.error('Error setting up party balances subscription:', error);
    if (onError) onError(error as Error);
    return () => {};
  }
};

// ============================================
// Payment Summary Operations
// ============================================

export const getPaymentSummary = async (
  partyType: 'customer' | 'supplier',
  partyId: string,
  partyName: string,
  partyCode: string
): Promise<PaymentSummary> => {
  try {
    // Get party balance
    let balance = await getPartyBalance(partyType, partyId);
    
    // If balance doesn't exist, create a default one
    if (!balance) {
      balance = {
        id: `${partyType}_${partyId}`,
        partyType,
        partyId,
        partyName,
        partyCode,
        openingBalance: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        totalAdjustments: 0,
        totalAdvance: 0,
        balance: 0,
        lastTransactionDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        status: 'settled'
      };
    }
    
    // Get recent transactions (last 10) - no orderBy to avoid composite index
    const q = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('partyId', '==', partyId),
      where('partyType', '==', partyType)
    );
    
    const snapshot = await getDocs(q);
    const recentTransactions = snapshot.docs
      .map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as PaymentTransaction)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Sort in JavaScript
      .slice(0, 10);
    
    // Calculate invoice statistics
    const invoiceTransactions = recentTransactions.filter(t => t.transactionType === 'invoice');
    const paidInvoices = invoiceTransactions.filter(t => t.status === 'completed');
    const pendingInvoices = invoiceTransactions.filter(t => t.status === 'pending');
    
    // Check for overdue (simplified)
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 30);
    const overdueInvoices = pendingInvoices.filter(t => new Date(t.date) < overdueDate);
    
    return {
      partyType,
      partyId,
      partyName,
      partyCode,
      balance,
      recentTransactions,
      invoices: {
        total: invoiceTransactions.length,
        paid: paidInvoices.length,
        pending: pendingInvoices.length,
        overdue: overdueInvoices.length
      }
    };
  } catch (error) {
    console.error('Error getting payment summary:', error);
    throw error;
  }
};

// ============================================
// Bulk Transaction Creation (for invoices)
// ============================================

export const createInvoiceTransaction = async (
  partyType: 'customer' | 'supplier',
  partyId: string,
  partyName: string,
  partyCode: string,
  invoiceNumber: string,
  amount: number,
  date: string,
  createdBy: string
): Promise<string> => {
  return await addPaymentTransaction(
    {
      date,
      partyType,
      partyId,
      partyName,
      partyCode,
      transactionType: 'invoice',
      referenceType: 'invoice',
      referenceNumber: invoiceNumber,
      amount,
      description: `Invoice ${invoiceNumber}`,
      status: 'pending',
      createdBy
    },
    createdBy
  );
};

export const createDebitCreditNoteTransaction = async (
  partyType: 'customer' | 'supplier',
  partyId: string,
  partyName: string,
  partyCode: string,
  noteNumber: string,
  originalInvoiceNumber: string,
  noteType: 'debit' | 'credit',
  amount: number,
  date: string,
  createdBy: string
): Promise<string> => {
  console.log('=== createDebitCreditNoteTransaction called ===');
  console.log('Party:', partyType, partyId, partyName, partyCode);
  console.log('Note:', noteType, noteNumber);
  console.log('Invoice (referenceNumber):', originalInvoiceNumber);
  console.log('Amount:', amount);
  console.log('Date:', date);
  
  // Validation: originalInvoiceNumber should not be empty for proper linking
  if (!originalInvoiceNumber || originalInvoiceNumber.trim() === '') {
    console.error('⚠️  WARNING: originalInvoiceNumber is empty! Credit/Debit note will NOT be linked to any invoice.');
    console.error('This will cause the note to appear as a separate transaction instead of being linked to the invoice.');
  }
  
  // DEBIT NOTE (Return to Supplier): Reduces what we owe to supplier (positive adjustment)
  // CREDIT NOTE (Return from Customer): Reduces what customer owes us (positive adjustment)
  // Both should REDUCE the outstanding amounts, so we use 'adjustment' with positive amount
  // The balance calculation subtracts adjustments: balance = invoiced - paid - adjustments
  const paymentMethod = noteType === 'debit' ? 'DB Note' : 'CR Note';
  const transactionData = {
    date,
    partyType,
    partyId,
    partyName,
    partyCode,
    transactionType: 'adjustment' as const,
    referenceType: (noteType === 'credit' ? 'credit-note' : 'debit-note') as any,
    referenceNumber: originalInvoiceNumber || '', // Link to original invoice (empty string if not provided)
    paymentMethod: paymentMethod as any,
    paymentReference: noteNumber, // Store note number in paymentReference
    amount: Math.abs(amount), // Positive amount - will be subtracted from balance
    description: `${noteType === 'credit' ? 'Credit' : 'Debit'} Note ${noteNumber} - Return adjustment${originalInvoiceNumber ? ` for Invoice ${originalInvoiceNumber}` : ' (No invoice linked)'}`,
    status: 'completed' as const, // Mark as completed immediately
    createdBy
  };
  
  console.log('Transaction data to be created:', transactionData);
  console.log('referenceNumber (for linking):', transactionData.referenceNumber);
  
  const result = await addPaymentTransaction(transactionData, createdBy);
  console.log('✓ Transaction created with ID:', result);
  return result;
};

export const createPaymentTransaction = async (
  partyType: 'customer' | 'supplier',
  partyId: string,
  partyName: string,
  partyCode: string,
  amount: number,
  date: string,
  paymentMethod: string,
  paymentReference: string,
  notes: string,
  createdBy: string
): Promise<string> => {
  return await addPaymentTransaction(
    {
      date,
      partyType,
      partyId,
      partyName,
      partyCode,
      transactionType: 'payment',
      referenceType: 'direct-payment',
      amount,
      paymentMethod: paymentMethod as any,
      paymentReference,
      description: `Payment received from ${partyName}`,
      notes,
      status: 'completed',
      createdBy
    },
    createdBy
  );
};

/**
 * Creates a payment tracking transaction for a shipment
 * This adds the shipment amount as a payable to the supplier
 */
export const createShipmentTransaction = async (
  partyType: 'supplier',
  partyId: string,
  partyName: string,
  partyCode: string,
  purchaseInvoiceNumber: string,
  amount: number,
  date: string,
  createdBy: string
): Promise<string> => {
  return await addPaymentTransaction(
    {
      date,
      partyType,
      partyId,
      partyName,
      partyCode,
      transactionType: 'invoice',
      referenceType: 'invoice',
      referenceNumber: purchaseInvoiceNumber,
      amount,
      description: `Purchase Invoice ${purchaseInvoiceNumber} - Amount payable to ${partyName}`,
      status: 'pending',
      createdBy
    },
    createdBy
  );
};

// ============================================
// Invoice Payment Status Management
// ============================================

/**
 * Updates the status of invoice transactions based on payment amounts
 * Status logic:
 * - 'pending': No payments made yet or partial payment
 * - 'completed': Fully paid (payments >= invoice amount)
 */
export const updateInvoicePaymentStatus = async (
  partyId: string,
  partyType: 'customer' | 'supplier'
): Promise<void> => {
  try {
    // Get all transactions for this party
    const q = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('partyId', '==', partyId),
      where('partyType', '==', partyType)
    );
    
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestamps(doc.data())
    })) as PaymentTransaction[];
    
    // Get all invoice transactions (including debit/credit notes)
    const invoices = transactions.filter(t => t.transactionType === 'invoice');
    
    // Get total payments made (count only completed payments)
    const totalPayments = transactions
      .filter(t => t.transactionType === 'payment' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Calculate total invoice amount
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    
    // Update invoice statuses
    for (const invoice of invoices) {
      let newStatus: 'pending' | 'completed' = 'pending';
      
      // If total payments >= total invoiced, mark all invoices as completed
      if (totalPayments >= totalInvoiced) {
        newStatus = 'completed';
      }
      
      // Only update if status has changed
      if (invoice.status !== newStatus) {
        const docRef = doc(db, PAYMENT_TRANSACTIONS_COLLECTION, invoice.id);
        await updateDoc(docRef, { status: newStatus });
      }
    }
  } catch (error) {
    console.error('Error updating invoice payment status:', error);
    throw error;
  }
};

/**
 * Migration function to update all existing invoice and debit/credit note entries
 * to have 'pending' status instead of 'completed'
 * This should be run once to fix existing data
 */
export const migrateExistingInvoiceStatuses = async (): Promise<void> => {
  try {
    console.log('Starting migration of existing invoice statuses...');
    
    // Get all transactions
    const snapshot = await getDocs(collection(db, PAYMENT_TRANSACTIONS_COLLECTION));
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestamps(doc.data())
    })) as PaymentTransaction[];
    
    console.log(`Found ${transactions.length} total transactions`);
    
    // Group by party to process them together
    const partiesByType = new Map<string, Set<string>>();
    
    transactions.forEach(transaction => {
      if (transaction.transactionType === 'invoice') {
        const key = `${transaction.partyType}_${transaction.partyId}`;
        if (!partiesByType.has(key)) {
          partiesByType.set(key, new Set());
        }
        partiesByType.get(key)!.add(transaction.id);
      }
    });
    
    console.log(`Found ${partiesByType.size} unique parties with invoices`);
    
    // First, set all invoice transactions to pending
    let updatedCount = 0;
    for (const transaction of transactions) {
      if (transaction.transactionType === 'invoice' && transaction.status === 'completed') {
        const docRef = doc(db, PAYMENT_TRANSACTIONS_COLLECTION, transaction.id);
        await updateDoc(docRef, { status: 'pending' });
        updatedCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} invoice transactions to pending status`);
    
    // Now recalculate statuses for each party
    for (const [key, _] of partiesByType) {
      const [partyType, partyId] = key.split('_');
      await updateInvoicePaymentStatus(partyId, partyType as 'customer' | 'supplier');
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error migrating invoice statuses:', error);
    throw error;
  }
};

/**
 * Migration function to update all existing payment transactions 
 * to have 'completed' status instead of 'pending'
 * This ensures all payments are immediately reflected in the balance
 */
export const migratePaymentStatusToCompleted = async (): Promise<void> => {
  try {
    console.log('Starting migration of payment statuses to completed...');
    
    // Get all payment transactions
    const snapshot = await getDocs(collection(db, PAYMENT_TRANSACTIONS_COLLECTION));
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestamps(doc.data())
    })) as PaymentTransaction[];
    
    console.log(`Found ${transactions.length} total transactions`);
    
    // Update all payment transactions with pending status to completed
    let updatedCount = 0;
    const partiesUpdated = new Set<string>();
    
    for (const transaction of transactions) {
      if (transaction.transactionType === 'payment' && transaction.status === 'pending') {
        const docRef = doc(db, PAYMENT_TRANSACTIONS_COLLECTION, transaction.id);
        await updateDoc(docRef, { status: 'completed' });
        updatedCount++;
        partiesUpdated.add(`${transaction.partyType}_${transaction.partyId}`);
      }
    }
    
    console.log(`Updated ${updatedCount} payment transactions to completed status`);
    
    // Update invoice statuses for all affected parties
    for (const key of partiesUpdated) {
      const [partyType, partyId] = key.split('_');
      await updateInvoicePaymentStatus(partyId, partyType as 'customer' | 'supplier');
      // Also update party balance
      const transaction = transactions.find(t => 
        t.partyType === partyType && t.partyId === partyId
      );
      if (transaction) {
        await updatePartyBalance(
          partyType as 'customer' | 'supplier',
          partyId,
          transaction.partyName,
          transaction.partyCode
        );
      }
    }
    
    console.log('Payment status migration completed successfully');
  } catch (error) {
    console.error('Error migrating payment statuses:', error);
    throw error;
  }
};

/**
 * Link an unlinked credit/debit note to an invoice
 * This updates the referenceNumber field of an adjustment transaction
 */
export const linkAdjustmentToInvoice = async (
  adjustmentId: string,
  invoiceNumber: string
): Promise<void> => {
  try {
    await updatePaymentTransaction(adjustmentId, {
      referenceNumber: invoiceNumber
    });
    console.log(`✓ Linked adjustment ${adjustmentId} to invoice ${invoiceNumber}`);
  } catch (error) {
    console.error('Error linking adjustment to invoice:', error);
    throw error;
  }
};

/**
 * Recalculate all party balances to include opening balances
 * This should be called after adding opening balance feature to existing data
 */
export const recalculateAllPartyBalances = async (): Promise<void> => {
  try {
    console.log('Starting recalculation of all party balances...');
    
    // Get all party balances
    const balancesSnapshot = await getDocs(collection(db, PARTY_BALANCES_COLLECTION));
    
    const updatePromises = balancesSnapshot.docs.map(async (balanceDoc) => {
      const balanceData = balanceDoc.data();
      const partyType = balanceData.partyType as 'customer' | 'supplier';
      const partyId = balanceData.partyId;
      const partyName = balanceData.partyName;
      const partyCode = balanceData.partyCode;
      
      // Recalculate balance with opening balance included
      await updatePartyBalance(partyType, partyId, partyName, partyCode);
      console.log(`✓ Recalculated balance for ${partyName}`);
    });
    
    await Promise.all(updatePromises);
    console.log('✓ All party balances recalculated successfully');
  } catch (error) {
    console.error('Error recalculating party balances:', error);
    throw error;
  }
};

// ============================================
// Invoice Edit Support Functions
// ============================================

/**
 * Get total amount paid for a specific invoice
 */
export const getTotalPaidForInvoice = async (invoiceNumber: string): Promise<number> => {
  try {
    const q = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('referenceNumber', '==', invoiceNumber),
      where('transactionType', '==', 'payment'),
      where('status', '==', 'completed')
    );
    const snapshot = await getDocs(q);
    
    let total = 0;
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      total += data.amount || 0;
    });
    
    // Also check for adjustments (credit/debit notes)
    const adjustmentsQuery = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('referenceNumber', '==', invoiceNumber),
      where('transactionType', '==', 'adjustment'),
      where('status', '==', 'completed')
    );
    const adjustmentsSnapshot = await getDocs(adjustmentsQuery);
    
    adjustmentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      total += Math.abs(data.amount || 0);
    });
    
    return total;
  } catch (error) {
    console.error('Error getting total paid for invoice:', error);
    throw error;
  }
};

/**
 * Update invoice amount in payment tracking when invoice is edited
 */
export const updateInvoicePaymentTrackingAmount = async (
  invoiceNumber: string,
  newAmount: number
): Promise<void> => {
  try {
    console.log(`Updating payment tracking for invoice ${invoiceNumber} to amount ${newAmount}`);
    
    // Find invoice transaction
    const q = query(
      collection(db, PAYMENT_TRANSACTIONS_COLLECTION),
      where('referenceNumber', '==', invoiceNumber),
      where('transactionType', '==', 'invoice')
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.warn(`No payment tracking found for invoice ${invoiceNumber}`);
      return;
    }
    
    // Update amount for each matching transaction (should only be one)
    for (const docSnap of snapshot.docs) {
      const transaction = convertTimestamps(docSnap.data()) as PaymentTransaction;
      
      await updatePaymentTransaction(docSnap.id, { amount: newAmount });
      console.log(`✓ Updated payment tracking amount: ${transaction.amount} → ${newAmount}`);
      
      // Recalculate party balance
      await updatePartyBalance(
        transaction.partyType,
        transaction.partyId,
        transaction.partyName,
        transaction.partyCode
      );
      console.log('✓ Recalculated party balance');
    }
  } catch (error) {
    console.error('Error updating invoice payment tracking amount:', error);
    throw error;
  }
};

