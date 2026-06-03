import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc,
  query,
  orderBy,
  Timestamp,
  onSnapshot,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Transaction } from '../components/ReceiverPanel';
import { updateBankAccount } from './bankAccountService';

const TRANSACTIONS_COLLECTION = 'transactions';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  if (data?.date && typeof data.date === 'object' && 'toDate' in data.date && typeof data.date.toDate === 'function') {
    return { ...data, date: data.date.toDate().toISOString().split('T')[0] };
  }
  return data;
};

// Helper function to remove undefined values from an object
const removeUndefinedFields = (obj: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    
    // Skip undefined values
    if (value === undefined) {
      return;
    }
    
    // Recursively clean nested objects
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const cleanedNested = removeUndefinedFields(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
    } else {
      cleaned[key] = value;
    }
  });
  
  return cleaned;
};

// Helper function to recalculate and update bank account balance
const updateBankAccountBalance = async (bankAccountId: string): Promise<void> => {
  try {
    // Get all transactions for this bank account
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where('bankAccountId', '==', bankAccountId)
    );
    const querySnapshot = await getDocs(q);
    
    let totalCredits = 0;
    let totalDebits = 0;
    let totalTransferCharges = 0;
    
    querySnapshot.forEach((doc) => {
      const data = doc.data() as Transaction;
      if (data.type === 'credit') {
        totalCredits += data.amount;
      } else if (data.type === 'debit') {
        totalDebits += data.amount;
      } else if (data.type === 'contra') {
        // Contra entries for payments: customer payments increase balance, supplier payments decrease balance
        if (data.senderName) {
          // Payment received from customer
          totalCredits += data.amount;
        } else if (data.receiverName) {
          // Payment made to supplier
          totalDebits += data.amount;
        }
      }
      
      // Add transfer charges to debits (they reduce the bank balance)
      if (data.transferCharge && data.transferCharge > 0) {
        totalTransferCharges += data.transferCharge;
      }
    });
    
    // Get the bank account to get initial balance
    const bankAccountRef = doc(db, 'bankAccounts', bankAccountId);
    const bankAccountSnap = await getDoc(bankAccountRef);
    
    if (bankAccountSnap.exists()) {
      const bankAccountData = bankAccountSnap.data();
      const initialBalance = bankAccountData.initialBalance || 0;
      const newCurrentBalance = initialBalance + totalCredits - totalDebits - totalTransferCharges;
      
      // Update the bank account's current balance
      await updateBankAccount(bankAccountId, { currentBalance: newCurrentBalance });
      console.log(`Updated bank account ${bankAccountId} balance to ${newCurrentBalance} (charges: ${totalTransferCharges})`);
    }
  } catch (error) {
    console.error('Error updating bank account balance:', error);
    throw error;
  }
};

// Add a new transaction to Firestore
export const addTransaction = async (transaction: Transaction): Promise<string> => {
  try {
    const now = Timestamp.now();
    const transactionData = {
      ...transaction,
      date: transaction.date, // Keep as string date
      createdAt: now,
      createdAtMillis: now.toMillis(), // Add numeric timestamp for easy sorting
      updatedAt: now,
    };

    // Remove undefined fields before adding
    const cleanedData = removeUndefinedFields(transactionData);

    const docRef = await addDoc(collection(db, TRANSACTIONS_COLLECTION), cleanedData);
    console.log('Transaction added with ID:', docRef.id);
    
    // Update bank account balance if bankAccountId is present
    if (transaction.bankAccountId) {
      await updateBankAccountBalance(transaction.bankAccountId);
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
};

// Get all transactions from Firestore
export const getAllTransactions = async (): Promise<Transaction[]> => {
  try {
    // Fetch all transactions without ordering - let the component handle sorting
    // This avoids issues with missing createdAt fields on older records
    const q = query(collection(db, TRANSACTIONS_COLLECTION));
    const querySnapshot = await getDocs(q);
    
    const transactions: Transaction[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      transactions.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Transaction);
    });
    
    return transactions;
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw error;
  }
};

// Get a single transaction by ID
export const getTransactionById = async (id: string): Promise<Transaction | null> => {
  try {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Transaction;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting transaction:', error);
    throw error;
  }
};

// Update a transaction in Firestore
export const updateTransaction = async (id: string, transaction: Partial<Transaction>): Promise<void> => {
  try {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, id);
    
    // Get the old transaction to check if bankAccountId changed
    const oldTransactionSnap = await getDoc(docRef);
    const oldTransaction = oldTransactionSnap.exists() ? oldTransactionSnap.data() as Transaction : null;
    
    const updateData: Record<string, unknown> = {
      ...transaction,
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before updating
    const cleanedData = removeUndefinedFields(updateData);

    await updateDoc(docRef, cleanedData);
    console.log('Transaction updated successfully');
    
    // Update bank account balances if needed
    if (oldTransaction?.bankAccountId) {
      await updateBankAccountBalance(oldTransaction.bankAccountId);
    }
    if (transaction.bankAccountId && transaction.bankAccountId !== oldTransaction?.bankAccountId) {
      await updateBankAccountBalance(transaction.bankAccountId);
    }
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

// Delete a transaction from Firestore
export const deleteTransaction = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, id);
    
    // Get the transaction to check bankAccountId before deleting
    const transactionSnap = await getDoc(docRef);
    const transaction = transactionSnap.exists() ? transactionSnap.data() as Transaction : null;
    
    await deleteDoc(docRef);
    console.log('Transaction deleted successfully');
    
    // Update bank account balance if bankAccountId is present
    if (transaction?.bankAccountId) {
      await updateBankAccountBalance(transaction.bankAccountId);
    }
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

// Real-time listener for transactions
export const subscribeToTransactions = (
  callback: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    // Try to order by createdAt, but handle case where not all docs have this field
    // Note: Component-level sorting will handle the final ordering
    const q = query(collection(db, TRANSACTIONS_COLLECTION));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const transactions: Transaction[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          transactions.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Transaction);
        });
        callback(transactions);
      },
      (error) => {
        console.error('Error in transactions subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up transactions subscription:', error);
    throw error;
  }
};
// ============================================
// Invoice Edit Support Functions
// ============================================

/**
 * Update accounting transaction amount when invoice is edited
 */
export const updateAccountingTransactionForInvoice = async (
  invoiceNumber: string,
  newAmount: number
): Promise<void> => {
  try {
    console.log(`Updating accounting transaction for invoice ${invoiceNumber} to amount ${newAmount}`);
    
    // Find transaction by source and description
    const allTransactions = await getAllTransactions();
    const invoiceTransaction = allTransactions.find(
      t => t.source === 'invoice' && 
           t.description?.includes(invoiceNumber)
    );
    
    if (!invoiceTransaction) {
      console.warn(`No accounting transaction found for invoice ${invoiceNumber}`);
      return;
    }
    
    // Update amount
    await updateTransaction(invoiceTransaction.id, {
      amount: newAmount
    });
    console.log(`✓ Updated accounting transaction amount: ${invoiceTransaction.amount} → ${newAmount}`);
  } catch (error) {
    console.error('Error updating accounting transaction for invoice:', error);
    throw error;
  }
};