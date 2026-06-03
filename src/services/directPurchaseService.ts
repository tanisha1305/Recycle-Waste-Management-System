import { 
  collection, 
  addDoc, 
  getDocs,
  getDoc,
  query,
  orderBy,
  Timestamp,
  onSnapshot,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logCreate, logDelete, logError } from './activityLogService';
import { getCurrentUser } from './authService';

export interface DirectPurchase {
  id: string;
  supplierCode: string;
  supplierName: string;
  purchaseDate: string;
  invoiceNumber: string;
  items: Array<{
    itemCode: string;
    itemName: string;
    quantity: number;
    unit: string;
    rate: number;
    taxRate: number;
    amountExclTax: number;
    taxAmount: number;
    totalAmount: number;
  }>;
  totalAmount: number;
  createdAt: Date;
}

const DIRECT_PURCHASES_COLLECTION = 'directPurchases';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...data };
  
  if (data?.purchaseDate && typeof data.purchaseDate === 'object' && 'toDate' in data.purchaseDate && typeof data.purchaseDate.toDate === 'function') {
    result.purchaseDate = data.purchaseDate.toDate().toISOString().split('T')[0];
  }
  
  if (data?.createdAt && typeof data.createdAt === 'object' && 'toDate' in data.createdAt && typeof data.createdAt.toDate === 'function') {
    result.createdAt = data.createdAt.toDate();
  }
  
  return result;
};

// Add a new direct purchase to Firestore
export const addDirectPurchase = async (purchase: Omit<DirectPurchase, 'id' | 'createdAt'>): Promise<string> => {
  const user = getCurrentUser();
  try {
    const purchaseData = {
      ...purchase,
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, DIRECT_PURCHASES_COLLECTION), purchaseData);
    console.log('Direct purchase added with ID:', docRef.id);
    
    // Log activity
    if (user) {
      await logCreate(user.id, user.fullName, user.role, 'invoices', 
        `Direct Purchase from ${purchase.supplierName}`, docRef.id, {
          invoiceNumber: purchase.invoiceNumber,
          supplierCode: purchase.supplierCode,
          totalAmount: purchase.totalAmount,
          itemCount: purchase.items.length,
        });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding direct purchase:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'create', 'invoices', 
        `Failed to create direct purchase from ${purchase.supplierName}`, String(error));
    }
    throw error;
  }
};

// Get all direct purchases from Firestore
export const getAllDirectPurchases = async (): Promise<DirectPurchase[]> => {
  try {
    const q = query(collection(db, DIRECT_PURCHASES_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const purchases: DirectPurchase[] = [];
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      purchases.push({
        ...convertTimestamps(data),
        id: docSnapshot.id,
      } as DirectPurchase);
    });
    
    return purchases;
  } catch (error) {
    console.error('Error getting direct purchases:', error);
    throw error;
  }
};

// Real-time listener for direct purchases
export const subscribeToDirectPurchases = (
  callback: (purchases: DirectPurchase[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, DIRECT_PURCHASES_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const purchases: DirectPurchase[] = [];
        querySnapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          purchases.push({
            ...convertTimestamps(data),
            id: docSnapshot.id,
          } as DirectPurchase);
        });
        callback(purchases);
      },
      (error) => {
        console.error('Error in direct purchases subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up direct purchases subscription:', error);
    throw error;
  }
};

// Delete a direct purchase from Firestore
export const deleteDirectPurchase = async (id: string): Promise<void> => {
  const user = getCurrentUser();
  try {
    const docRef = doc(db, DIRECT_PURCHASES_COLLECTION, id);
    
    // Get purchase data before deletion for logging and finding related debit note
    const docSnap = await getDoc(docRef);
    const purchaseData = docSnap.exists() ? docSnap.data() : null;
    
    await deleteDoc(docRef);
    console.log('Direct purchase deleted successfully');
    
    // Delete related debit note (if exists)
    if (purchaseData?.invoiceNumber) {
      try {
        const { query, where, getDocs, collection, deleteDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../config/firebase');
        
        const notesQuery = query(
          collection(db, 'debitCreditNotes'),
          where('originalInvoiceNumber', '==', purchaseData.invoiceNumber),
          where('noteType', '==', 'debit'),
          where('transactionType', '==', 'purchase')
        );
        const notesSnapshot = await getDocs(notesQuery);
        
        for (const noteDoc of notesSnapshot.docs) {
          await deleteDoc(doc(db, 'debitCreditNotes', noteDoc.id));
          console.log(`Auto-deleted related debit note: ${noteDoc.id}`);
        }
      } catch (noteError) {
        console.error('Error deleting related debit note:', noteError);
        // Don't throw - purchase is already deleted
      }
    }
    
    // Log activity
    if (user) {
      await logDelete(user.id, user.fullName, user.role, 'invoices', 
        purchaseData?.supplierName ? `Direct Purchase from ${purchaseData.supplierName}` : 'Direct Purchase', id);
    }
  } catch (error) {
    console.error('Error deleting direct purchase:', error);
    if (user) {
      await logError(user.id, user.fullName, user.role, 'delete', 'invoices', 
        `Failed to delete direct purchase: ${id}`, String(error));
    }
    throw error;
  }
};
