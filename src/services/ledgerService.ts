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
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Ledger } from '../types';

const LEDGERS_COLLECTION = 'coa_ledgers';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  const converted = { ...data };
  if (data?.createdAt && typeof data.createdAt === 'object' && 'toDate' in data.createdAt && typeof data.createdAt.toDate === 'function') {
    converted.createdAt = data.createdAt.toDate().toISOString();
  }
  if (data?.lastUpdated && typeof data.lastUpdated === 'object' && 'toDate' in data.lastUpdated && typeof data.lastUpdated.toDate === 'function') {
    converted.lastUpdated = data.lastUpdated.toDate().toISOString();
  }
  return converted;
};

// Add a new ledger to Firestore
export const addCOALedger = async (ledger: Omit<Ledger, 'id'>): Promise<string> => {
  try {
    const ledgerData = {
      ...ledger,
      createdAt: Timestamp.fromDate(new Date(ledger.createdAt)),
      lastUpdated: Timestamp.fromDate(new Date(ledger.lastUpdated)),
    };

    const docRef = await addDoc(collection(db, LEDGERS_COLLECTION), ledgerData);
    console.log('Ledger added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding ledger:', error);
    throw error;
  }
};

// Get all ledgers from Firestore
export const getAllCOALedgers = async (): Promise<Ledger[]> => {
  try {
    const q = query(collection(db, LEDGERS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const ledgers: Ledger[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      ledgers.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Ledger);
    });
    
    return ledgers;
  } catch (error) {
    console.error('Error getting ledgers:', error);
    throw error;
  }
};

// Get a single ledger by ID
export const getCOALedgerById = async (id: string): Promise<Ledger | null> => {
  try {
    const docRef = doc(db, LEDGERS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Ledger;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting ledger:', error);
    throw error;
  }
};

// Update a ledger in Firestore
export const updateCOALedger = async (id: string, ledger: Partial<Omit<Ledger, 'id'>>): Promise<void> => {
  try {
    const docRef = doc(db, LEDGERS_COLLECTION, id);
    
    const updateData: Record<string, unknown> = {
      ...ledger,
    };

    // Convert timestamps if they exist
    if (ledger.createdAt) {
      updateData.createdAt = Timestamp.fromDate(new Date(ledger.createdAt));
    }
    if (ledger.lastUpdated) {
      updateData.lastUpdated = Timestamp.fromDate(new Date(ledger.lastUpdated));
    }

    await updateDoc(docRef, updateData);
    console.log('Ledger updated successfully');
  } catch (error) {
    console.error('Error updating ledger:', error);
    throw error;
  }
};

// Delete a ledger from Firestore
export const deleteCOALedger = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, LEDGERS_COLLECTION, id);
    await deleteDoc(docRef);
    console.log('Ledger deleted successfully');
  } catch (error) {
    console.error('Error deleting ledger:', error);
    throw error;
  }
};

// Real-time listener for ledgers
export const subscribeToCOALedgers = (
  callback: (ledgers: Ledger[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, LEDGERS_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const ledgers: Ledger[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          ledgers.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Ledger);
        });
        callback(ledgers);
      },
      (error) => {
        console.error('Error in ledgers subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up ledgers subscription:', error);
    throw error;
  }
};
