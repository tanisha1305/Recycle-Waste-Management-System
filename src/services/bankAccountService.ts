import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { BankAccount } from '../components/ReceiverPanel';

const BANK_ACCOUNTS_COLLECTION = 'bankAccounts';

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

// Add a new bank account to Firestore
export const addBankAccount = async (bankAccount: BankAccount): Promise<string> => {
  try {
    const bankAccountData = {
      ...bankAccount,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before adding
    const cleanedData = removeUndefinedFields(bankAccountData);

    const docRef = await addDoc(collection(db, BANK_ACCOUNTS_COLLECTION), cleanedData);
    console.log('Bank account added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding bank account:', error);
    throw error;
  }
};

// Get all bank accounts from Firestore
export const getAllBankAccounts = async (): Promise<BankAccount[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, BANK_ACCOUNTS_COLLECTION));
    
    const bankAccounts: BankAccount[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      bankAccounts.push({
        ...data,
        id: doc.id,
      } as BankAccount);
    });
    
    return bankAccounts;
  } catch (error) {
    console.error('Error getting bank accounts:', error);
    throw error;
  }
};

// Get a single bank account by ID
export const getBankAccountById = async (id: string): Promise<BankAccount | null> => {
  try {
    const docRef = doc(db, BANK_ACCOUNTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...data,
        id: docSnap.id,
      } as BankAccount;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting bank account:', error);
    throw error;
  }
};

// Update a bank account in Firestore
export const updateBankAccount = async (id: string, bankAccount: Partial<BankAccount>): Promise<void> => {
  try {
    const docRef = doc(db, BANK_ACCOUNTS_COLLECTION, id);
    
    const updateData: Record<string, unknown> = {
      ...bankAccount,
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before updating
    const cleanedData = removeUndefinedFields(updateData);

    await updateDoc(docRef, cleanedData);
    console.log('Bank account updated successfully');
  } catch (error) {
    console.error('Error updating bank account:', error);
    throw error;
  }
};

// Delete a bank account from Firestore
export const deleteBankAccount = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, BANK_ACCOUNTS_COLLECTION, id);
    await deleteDoc(docRef);
    console.log('Bank account deleted successfully');
  } catch (error) {
    console.error('Error deleting bank account:', error);
    throw error;
  }
};

// Real-time listener for bank accounts
export const subscribeToBankAccounts = (
  callback: (bankAccounts: BankAccount[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = collection(db, BANK_ACCOUNTS_COLLECTION);
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const bankAccounts: BankAccount[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          bankAccounts.push({
            ...data,
            id: doc.id,
          } as BankAccount);
        });
        callback(bankAccounts);
      },
      (error) => {
        console.error('Error in bank accounts subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up bank accounts subscription:', error);
    throw error;
  }
};
