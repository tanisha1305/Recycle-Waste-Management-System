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
import { Quotation } from '../types';

const QUOTATIONS_COLLECTION = 'quotations';

// Convert Firestore timestamp to ISO string
const convertTimestamps = (data: Record<string, unknown>): Record<string, unknown> => {
  if (data?.createdAt && typeof data.createdAt === 'object' && 'toDate' in data.createdAt && typeof data.createdAt.toDate === 'function') {
    return { ...data, createdAt: data.createdAt.toDate().toISOString() };
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

// Add a new quotation to Firestore
export const addQuotation = async (quotation: Quotation): Promise<string> => {
  try {
    const quotationData = {
      ...quotation,
      createdAt: Timestamp.fromDate(new Date(quotation.createdAt)),
      updatedAt: Timestamp.now(),
    };

    // Remove undefined fields before adding
    const cleanedData = removeUndefinedFields(quotationData);

    const docRef = await addDoc(collection(db, QUOTATIONS_COLLECTION), cleanedData);
    console.log('Quotation added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding quotation:', error);
    throw error;
  }
};

// Get all quotations from Firestore
export const getAllQuotations = async (): Promise<Quotation[]> => {
  try {
    const q = query(collection(db, QUOTATIONS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const quotations: Quotation[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      quotations.push({
        ...convertTimestamps(data),
        id: doc.id,
      } as Quotation);
    });
    
    return quotations;
  } catch (error) {
    console.error('Error getting quotations:', error);
    throw error;
  }
};

// Get a single quotation by ID
export const getQuotationById = async (id: string): Promise<Quotation | null> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...convertTimestamps(data),
        id: docSnap.id,
      } as Quotation;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting quotation:', error);
    throw error;
  }
};

// Update a quotation in Firestore
export const updateQuotation = async (id: string, quotation: Partial<Quotation>): Promise<void> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, id);
    
    const updateData: Record<string, unknown> = {
      ...quotation,
      updatedAt: Timestamp.now(),
    };

    // Convert createdAt to Timestamp if it exists
    if (quotation.createdAt) {
      updateData.createdAt = Timestamp.fromDate(new Date(quotation.createdAt));
    }

    // Remove undefined fields before updating
    const cleanedData = removeUndefinedFields(updateData);

    await updateDoc(docRef, cleanedData);
    console.log('Quotation updated successfully');
  } catch (error) {
    console.error('Error updating quotation:', error);
    throw error;
  }
};

// Delete a quotation from Firestore  
export const deleteQuotation = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, id);
    await deleteDoc(docRef);
    console.log('Quotation deleted successfully');
  } catch (error) {
    console.error('Error deleting quotation:', error);
    throw error;
  }
};

// Real-time listener for quotations
export const subscribeToQuotations = (
  callback: (quotations: Quotation[]) => void,
  onError?: (error: Error) => void
) => {
  try {
    const q = query(collection(db, QUOTATIONS_COLLECTION), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const quotations: Quotation[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          quotations.push({
            ...convertTimestamps(data),
            id: doc.id,
          } as Quotation);
        });
        callback(quotations);
      },
      (error) => {
        console.error('Error in quotations subscription:', error);
        if (onError) onError(error as Error);
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up quotations subscription:', error);
    throw error;
  }
};
